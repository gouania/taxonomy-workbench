import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';
import { GEMINI_MODEL, SYSTEM_PROMPT } from '../src/constants';
import {
  AuthorProfile,
  ComparisonProfile,
  IdentifyResult,
  TaxonProfile,
  GroundingSource,
  LocalityProfile,
  GeneratedGuideStructured
} from '../src/types';

export const SYSTEM_TAXONOMIST_INSTRUCTION = `You are an expert botanical taxonomist and systematic botanist operating at the highest academic standard.
You adhere strictly to:
- The International Code of Nomenclature for algae, fungi, and plants (ICN).
- Current APG IV classification for angiosperms and PPG I for pteridophytes.
- Authoritative taxonomic databases (Plants of the World Online / POWO, World Flora Online / WFO, IPNI, Index Fungorum, Catalogue of Life) for accepted taxonomy, subordinate taxon counts, and standard author abbreviations.
- Standard author abbreviations per IPNI / Brummitt & Powell.
- Empirical, verifiable morphological criteria with metric measurements (lengths, counts, ratios).
- Symmetrical, mutually exclusive couplets in dichotomous keys.`;

function getGenAI(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || '';
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is not configured on the server.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function getThinkingConfig(model: string, level: ThinkingLevel = ThinkingLevel.LOW): { thinkingConfig?: { thinkingLevel: ThinkingLevel } } {
  if (model.includes('gemini-3')) {
    // For gemini-3.7-flash, ThinkingLevel.LOW is the lowest supported thinking level
    const effectiveLevel = (model.includes('3.7') && level === ThinkingLevel.MINIMAL) ? ThinkingLevel.LOW : level;
    return { thinkingConfig: { thinkingLevel: effectiveLevel } };
  }
  return {};
}

function safeJsonParse<T>(text: string, fallback: any = {}): T {
  if (!text) return fallback as T;
  let cleaned = text.trim();
  
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  }

  try {
    return JSON.parse(cleaned) as T;
  } catch (error) {
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const extracted = cleaned.substring(firstBrace, lastBrace + 1);
      try {
        return JSON.parse(extracted) as T;
      } catch {
        const simplified = extracted
          .replace(/,\s*([}\]])/g, '$1')
          .replace(/[\u0000-\u001F\u007F-\u009F]/g, " ");
        try {
          return JSON.parse(simplified) as T;
        } catch {}
      }
    }
    
    const firstBracket = cleaned.indexOf('[');
    const lastBracket = cleaned.lastIndexOf(']');
    if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
      const extracted = cleaned.substring(firstBracket, lastBracket + 1);
      try {
        return JSON.parse(extracted) as T;
      } catch {}
    }

    return fallback as T;
  }
}

function extractSources(response: any): GroundingSource[] {
  const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  return chunks
    .map((chunk: any) => ({
      uri: chunk.web?.uri || '',
      title: chunk.web?.title || '',
    }))
    .filter((s: GroundingSource) => s.uri && s.title);
}

function cleanErrorMessage(error: any): string {
  if (!error) return "An unknown error occurred.";
  const errorObj = typeof error === 'string' ? error : error.message || JSON.stringify(error);
  
  if (
    errorObj.toLowerCase().includes('quota') || 
    errorObj.toLowerCase().includes('exhausted') || 
    errorObj.toLowerCase().includes('429') ||
    errorObj.toLowerCase().includes('rate limit')
  ) {
    return "Gemini API Quota Exhausted: You have temporarily hit the platform rate limits or reached your project's monthly billing cap. Please wait a moment before trying again.";
  }
  
  try {
    const match = errorObj.match(/\{.*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      if (parsed.error?.message) return parsed.error.message;
    }
  } catch {}
  
  return errorObj;
}

async function retryWithBackoff<T>(fn: () => Promise<T>, retries = 2, delay = 1000): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    const errorStr = String(error?.message || error || '').toLowerCase();
    const isRateLimit = 
      error?.status === 429 || 
      error?.statusCode === 429 ||
      errorStr.includes('429') ||
      errorStr.includes('exhausted') ||
      errorStr.includes('quota') ||
      errorStr.includes('limit');
      
    if (isRateLimit && retries > 0) {
      console.warn(`Gemini API rate limited. Retrying in ${delay}ms... (${retries} retries left)`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      return retryWithBackoff(fn, retries - 1, delay * 2);
    }
    throw error;
  }
}

const confusedTaxonSchema = {
  type: Type.OBJECT,
  properties: {
    name: { 
      type: Type.STRING, 
      description: "Formal scientific name of the confused or morphologically similar taxon" 
    },
    difference: { 
      type: Type.STRING, 
      description: "Precise morphological criteria to distinguish it. Use markdown with bolding only for key diagnostic terms." 
    },
    keyFeature: { 
      type: Type.STRING, 
      description: "Primary diagnostic character to examine (e.g., 'Petiole gland shape', 'Stipule persistence', 'Fruit wing angle')" 
    },
  },
  required: ['name', 'difference', 'keyFeature'],
};

const literatureItemSchema = {
  type: Type.OBJECT,
  properties: {
    citation: { 
      type: Type.STRING, 
      description: "Complete formal bibliographic citation (Authors, Year, Title, Journal / Flora Series / Book / Publisher, Volume: Pages). Must be an authentic, real published work (Flora account, monograph, or revision)." 
    },
    type: { 
      type: Type.STRING, 
      description: "Category of literature: 'Flora Account', 'Taxonomic Revision', 'Monograph', 'Regional Key', or 'Checklist'" 
    },
    scope: { 
      type: Type.STRING, 
      description: "Taxonomic or geographic scope (e.g., 'Flora of California (Jepson eFlora)', 'Flora of North America', 'Global Monograph', 'Flora Europaea', 'Flora of China')" 
    },
    notes: { 
      type: Type.STRING, 
      description: "Concise note on why this is an authoritative identification resource or which keys/subordinate taxa it treats." 
    },
    url: { 
      type: Type.STRING, 
      description: "Direct URL to online flora treatment or digital monograph (e.g. efloras.org, ucjeps.berkeley.edu, worldfloraonline.org) if known and valid, or empty string" 
    },
  },
  required: ['citation', 'type', 'scope', 'notes'],
};

const taxonSchemaProperties = {
  scientificName: { 
    type: Type.STRING, 
    description: "Formal scientific name (ONLY the binomial or trinomial name, e.g. 'Quercus robur'). Exclude author citation or common names." 
  },
  author: { 
    type: Type.STRING, 
    description: "Standard botanical or zoological author abbreviation per IPNI / Brummitt & Powell (e.g. 'L.', 'Linnaeus', '(Lam.) J.St.-Hil.')" 
  },
  commonName: { 
    type: Type.STRING, 
    description: "Primary vernacular or common name" 
  },
  family: { 
    type: Type.STRING, 
    description: "Biological family name per current APG IV / classification" 
  },
  classification: {
    type: Type.ARRAY,
    description: "Taxonomic classification hierarchy (e.g., Order, Family, Subfamily, Tribe, Genus) from highest to lowest rank",
    items: {
      type: Type.OBJECT,
      properties: {
        rank: { type: Type.STRING, description: "Taxonomic rank (e.g., 'Order', 'Family', 'Tribe', 'Genus')" },
        name: { type: Type.STRING, description: "Scientific name of the taxon at this rank" },
      },
      required: ['rank', 'name'],
    },
  },
  includedTaxaCount: { 
    type: Type.STRING, 
    description: "Accepted global count of subordinate taxa based on authoritative databases (POWO, WFO, CoL, APG IV). Format cleanly without parenthetical citations (e.g., 'ca. 160 species', 'ca. 25 genera and 450 species', '3 recognized subspecies', 'Monotypic'). Do NOT append '(POWO)' or database tags." 
  },
  localIncludedTaxaCount: { 
    type: Type.STRING, 
    description: "Accepted subordinate taxon count within the requested locality (e.g., '5 species in California'). State 'N/A' if no locality context is specified." 
  },
  synonyms: { 
    type: Type.ARRAY, 
    items: { type: Type.STRING }, 
    description: "1-3 notable homotypic or heterotypic synonyms (especially recent valid basionyms or reassignments). Empty array if none." 
  },
  conservationStatus: { 
    type: Type.STRING, 
    description: "Current IUCN Red List category or regional conservation status (e.g., 'Least Concern (LC)', 'Endangered (EN)', 'Not Evaluated')." 
  },
  hazards: { 
    type: Type.STRING, 
    description: "Toxicity to humans/livestock, allergens, contact dermatitis, spines/physical hazards, or 'None known'." 
  },
  fieldNotes: { 
    type: Type.STRING, 
    description: "Sensory, behavioral, or field recognition cues: odors when crushed, sap exudates, bark texture, or seasonal bruising. State 'N/A' if none." 
  },
  seasonality: { 
    type: Type.STRING, 
    description: "Phenology (flowering/fruiting periods, foliation, or dormancy). State 'N/A' if not applicable." 
  },
  humanRelevance: { 
    type: Type.STRING, 
    description: "Ethnobotany, economic botany, horticulture, traditional uses, or forestry relevance. State 'N/A' if none." 
  },
  quickRecap: { 
    type: Type.STRING, 
    description: "A 2-3 sentence diagnostic summary highlighting the most decisive morphological character. Use bolding sparingly for decisive traits." 
  },
  diagnosticDescription: { 
    type: Type.STRING, 
    description: "Markdown bulleted list of purely physical morphological features. Every organ (Habit, Leaves, Inflorescence, Flowers, Fruit, etc.) MUST start on a new line formatted strictly as '- **Organ**: Description text.'. Exclude non-morphological details." 
  },
  confusedTaxa: {
    type: Type.ARRAY,
    description: "Array of 4 to 5 morphologically similar or commonly confused taxa, especially within the specified locality if provided.",
    items: confusedTaxonSchema,
  },
  ecology: { 
    type: Type.STRING, 
    description: "Ecological niche, plant communities, substrate/soil affinities, and elevational range (Markdown supported)." 
  },
  etymology: { 
    type: Type.STRING, 
    description: "Etymology and linguistic derivation of the scientific name, generic root, and specific epithet (Markdown supported)." 
  },
  history: { 
    type: Type.STRING, 
    description: "Historical botanical context, protologue discovery, type specimen history, or key historical botanists (Markdown supported)." 
  },
  distribution: { 
    type: Type.STRING, 
    description: "Native and introduced biogeographic distribution (Markdown supported)." 
  },
  recommendedLiterature: {
    type: Type.ARRAY,
    description: "Array of 2 to 5 authentic, peer-reviewed Flora accounts (e.g. Flora of North America, Jepson eFlora, Flora Europaea, Flora of China), monographs, or taxonomic revisions. Never fabricate citations.",
    items: literatureItemSchema,
  },
};

export async function serverAnalyzeSingleTaxon(name: string, locality?: string, useWebSearch: boolean = false): Promise<{ result: TaxonProfile; sources: any[] }> {
  return retryWithBackoff(async () => {
    const ai = getGenAI();

    const prompt = `Conduct a comprehensive taxonomic analysis for: "${name}"${locality ? ` in the regional context of "${locality}"` : ""}.
Synthesize precise diagnostic morphology, accepted taxon counts per POWO/WFO, current classification, and authentic published regional literature.`;

    try {
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
        config: {
          systemInstruction: SYSTEM_TAXONOMIST_INSTRUCTION,
          temperature: 0.1,
          ...getThinkingConfig(GEMINI_MODEL, ThinkingLevel.LOW),
          tools: useWebSearch ? [{ googleSearch: {} }] : undefined,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: taxonSchemaProperties,
            required: [
              'scientificName', 'author', 'commonName', 'family', 'classification',
              'includedTaxaCount', 'localIncludedTaxaCount', 'synonyms', 'conservationStatus',
              'hazards', 'fieldNotes', 'seasonality', 'humanRelevance', 'quickRecap',
              'diagnosticDescription', 'confusedTaxa', 'ecology', 'etymology', 'history', 'distribution',
              'recommendedLiterature'
            ],
          },
        },
      });

      const result = safeJsonParse<TaxonProfile>(response.text || '{}');
      if (locality) result.localityContext = locality;
      const sources = extractSources(response);
      return { result, sources };
    } catch (error) {
      console.error("Gemini API Error in analyzeSingleTaxon:", error);
      throw new Error(cleanErrorMessage(error));
    }
  });
}

export async function serverCompareTaxa(names: string[], locality?: string, useWebSearch: boolean = false): Promise<{ result: ComparisonProfile; sources: any[] }> {
  return retryWithBackoff(async () => {
    const ai = getGenAI();

    const prompt = `Conduct a comparative taxonomic diagnosis between: ${names.map((n) => `"${n}"`).join(', ')}${locality ? ` in the regional context of "${locality}"` : ""}.
Synthesize distinguishing morphological features, accepted subordinate counts per POWO/WFO, and a side-by-side key differences matrix contrasting character states across all taxa.`;

    try {
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
        config: {
          systemInstruction: SYSTEM_TAXONOMIST_INSTRUCTION,
          temperature: 0.1,
          ...getThinkingConfig(GEMINI_MODEL, ThinkingLevel.LOW),
          tools: useWebSearch ? [{ googleSearch: {} }] : undefined,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              taxon1: { 
                type: Type.OBJECT, 
                properties: taxonSchemaProperties,
                required: [
                  'scientificName', 'author', 'commonName', 'family', 'classification',
                  'includedTaxaCount', 'localIncludedTaxaCount', 'synonyms', 'conservationStatus',
                  'hazards', 'fieldNotes', 'seasonality', 'humanRelevance', 'quickRecap',
                  'diagnosticDescription', 'confusedTaxa', 'ecology', 'etymology', 'history', 'distribution',
                  'recommendedLiterature'
                ]
              },
              taxon2: { 
                type: Type.OBJECT, 
                properties: taxonSchemaProperties,
                required: [
                  'scientificName', 'author', 'commonName', 'family', 'classification',
                  'includedTaxaCount', 'localIncludedTaxaCount', 'synonyms', 'conservationStatus',
                  'hazards', 'fieldNotes', 'seasonality', 'humanRelevance', 'quickRecap',
                  'diagnosticDescription', 'confusedTaxa', 'ecology', 'etymology', 'history', 'distribution',
                  'recommendedLiterature'
                ]
              },
              taxon3: { 
                type: Type.OBJECT, 
                properties: taxonSchemaProperties,
                required: [
                  'scientificName', 'author', 'commonName', 'family', 'classification',
                  'includedTaxaCount', 'localIncludedTaxaCount', 'synonyms', 'conservationStatus',
                  'hazards', 'fieldNotes', 'seasonality', 'humanRelevance', 'quickRecap',
                  'diagnosticDescription', 'confusedTaxa', 'ecology', 'etymology', 'history', 'distribution',
                  'recommendedLiterature'
                ]
              },
              keyDifferences: {
                type: Type.ARRAY,
                description: "Key diagnostic differences contrasting the taxa across morphological characters",
                items: {
                  type: Type.OBJECT,
                  properties: {
                    feature: { type: Type.STRING, description: "Morphological feature or organ" },
                    taxon1State: { type: Type.STRING, description: "Character state in Taxon 1" },
                    taxon2State: { type: Type.STRING, description: "Character state in Taxon 2" },
                    taxon3State: { type: Type.STRING, description: "Character state in Taxon 3 (if applicable)" },
                  },
                  required: ['feature', 'taxon1State', 'taxon2State'],
                },
              },
            },
            required: ['taxon1', 'taxon2', 'keyDifferences'],
          },
        },
      });

      const result = safeJsonParse<ComparisonProfile>(response.text || '{}');
      if (locality) result.localityContext = locality;
      const sources = extractSources(response);
      return { result, sources };
    } catch (error) {
      console.error("Gemini API Error in compareTaxa:", error);
      throw new Error(cleanErrorMessage(error));
    }
  });
}

export async function serverIdentifySpecimen(
  characters: string[],
  notes: string,
  location: string,
  suspectedFamilies: string,
  useWebSearch: boolean = false
): Promise<{ result: IdentifyResult; sources: any[] }> {
  return retryWithBackoff(async () => {
    const ai = getGenAI();
    const prompt = `Identify candidate plant families/taxa for a specimen with the following observed characters and context:
Selected Morphological Characters: ${characters.join(', ')}
Specimen Notes: ${notes || 'None provided'}
Location & Habitat: ${location || 'Not specified'}
Suspected Families: ${suspectedFamilies || 'None specified'}

Provide a rigorous analysis ranking candidate families by character congruence, detailing diagnostic synapomorphies, spot characters, contradicting states, and characters to verify next.`;

    try {
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
        config: {
          systemInstruction: SYSTEM_TAXONOMIST_INSTRUCTION,
          temperature: 0.1,
          ...getThinkingConfig(GEMINI_MODEL, ThinkingLevel.LOW),
          tools: useWebSearch ? [{ googleSearch: {} }] : undefined,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              analysisNotes: { type: Type.STRING, description: "High-level morphological evaluation of the character combination" },
              suggestedFamilies: {
                type: Type.ARRAY,
                description: "Ranked candidate plant families matching the specimen",
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING, description: "Family scientific name" },
                    authority: { type: Type.STRING, description: "Family taxonomic authority abbreviation" },
                    order: { type: Type.STRING, description: "Order per APG IV" },
                    commonName: { type: Type.STRING, description: "Vernacular family name" },
                    matchQuality: { type: Type.STRING, description: "Match quality assessment (e.g. 'High', 'Moderate', 'Partial')" },
                    matchingCharacters: { type: Type.NUMBER, description: "Count of observed characters that match this family" },
                    totalCharacters: { type: Type.NUMBER, description: "Total count of observed characters" },
                    contradictingCharacters: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Observed characters that contradict or are rare in this family" },
                    synapomorphies: { type: Type.STRING, description: "Shared derived characters defining this clade" },
                    diagnosticCharacters: { type: Type.STRING, description: "Core diagnostic combination for this family" },
                    fieldRecognitionTips: { type: Type.STRING, description: "Quick spot characters for field recognition" },
                    spotCharacters: { type: Type.STRING, description: "High-probability vegetative or floral spot characters" },
                    charactersToVerifyNext: { type: Type.STRING, description: "Critical unexamined characters to inspect to confirm identification" },
                    possibleGenera: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          name: { type: Type.STRING, description: "Candidate genus name" },
                          notes: { type: Type.STRING, description: "Distinguishing notes for this genus" },
                        },
                        required: ["name", "notes"]
                      },
                    },
                    differentialDiagnosis: { type: Type.STRING, description: "Differential diagnosis separating this family from other candidates" },
                    regionalNotes: { type: Type.STRING, description: "Floristic and biogeographic representation in the specified locality" },
                  },
                  required: ["name", "order", "matchQuality", "matchingCharacters", "totalCharacters", "diagnosticCharacters"]
                },
              },
              additionalRecommendations: { type: Type.STRING, description: "Recommendations for microscopic dissection or chemical tests" },
              taxonomicNotes: { type: Type.STRING, description: "Current APG IV taxonomic placement or circumscription notes" },
            },
            required: ['analysisNotes', 'suggestedFamilies', 'additionalRecommendations', 'taxonomicNotes'],
          },
        },
      });

      const result = safeJsonParse<IdentifyResult>(response.text || '{}');
      const sources = extractSources(response);
      return { result, sources };
    } catch (error) {
      console.error("Gemini API Error in identifySpecimen:", error);
      throw new Error(cleanErrorMessage(error));
    }
  });
}

export async function serverSuggestNextCharacters(
  selectedCharacters: string[],
  availableCharacters: string[]
): Promise<{ id: string; reasoning: string }[]> {
  return retryWithBackoff(async () => {
    const ai = getGenAI();
    try {
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: `Given these currently selected morphological characters: ${selectedCharacters.join(', ')}.
From this list of candidate unselected characters: ${availableCharacters.join(', ')}.
Suggest the top 3 most discriminating characters to examine next that maximize taxonomic information gain and family separation.`,
        config: {
          systemInstruction: SYSTEM_TAXONOMIST_INSTRUCTION,
          temperature: 0.1,
          ...getThinkingConfig(GEMINI_MODEL, ThinkingLevel.LOW),
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING, description: "Exact character ID from the provided candidate list" },
                reasoning: { type: Type.STRING, description: "Botanical rationale explaining why evaluating this character resolves ambiguity" },
              },
              required: ["id", "reasoning"]
            },
          },
        },
      });

      return safeJsonParse<any[]>(response.text || '[]', []);
    } catch (error) {
      console.error("Gemini API Error in suggestNextCharacters:", error);
      throw new Error(cleanErrorMessage(error));
    }
  });
}

export async function serverExplainCharacter(characterLabel: string): Promise<string> {
  return retryWithBackoff(async () => {
    const ai = getGenAI();
    try {
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: `Provide a concise, academically precise botanical definition and diagnostic significance for the morphological character: "${characterLabel}".`,
        config: { 
          systemInstruction: SYSTEM_TAXONOMIST_INSTRUCTION,
          temperature: 0.1,
          ...getThinkingConfig(GEMINI_MODEL, ThinkingLevel.LOW)
        },
      });
      return response.text || '';
    } catch (error) {
      console.error("Gemini API Error in explainCharacter:", error);
      throw new Error(cleanErrorMessage(error));
    }
  });
}

export async function serverLookupAuthority(query: string, useWebSearch: boolean = false): Promise<{ result: AuthorProfile; sources: any[] }> {
  return retryWithBackoff(async () => {
    const ai = getGenAI();
    try {
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: `Provide an authoritative taxonomic biography and bibliographic profile for botanical author or abbreviation: "${query}".
Synthesize their primary biological contributions, comprehensive biographical narrative, historical context among contemporaries, associated herbaria, and major published works.
Verify described taxa against authoritative botanical databases (IPNI, POWO, Tropicos) to ensure only authentic author attributions are listed.`,
        config: {
          systemInstruction: SYSTEM_TAXONOMIST_INSTRUCTION,
          temperature: 0.1,
          ...getThinkingConfig(GEMINI_MODEL, ThinkingLevel.LOW),
          tools: useWebSearch ? [{ googleSearch: {} }] : undefined,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              fullName: { type: Type.STRING, description: "Full name of the botanist/author" },
              standardAbbreviation: { type: Type.STRING, description: "Standard IPNI / Brummitt & Powell abbreviation" },
              lifespan: { type: Type.STRING, description: "Birth and death years (e.g. '1707–1778')" },
              nationality: { type: Type.STRING, description: "Nationality" },
              birthPlace: { type: Type.STRING, description: "Birth place" },
              deathPlace: { type: Type.STRING, description: "Death place" },
              mainContribution: { type: Type.STRING, description: "Comprehensive introductory overview of core biological achievements and taxonomic legacy" },
              biography: { type: Type.STRING, description: "Detailed multi-paragraph Markdown biography covering early life, education, expeditions, discoveries, and impact" },
              historicalContext: { type: Type.STRING, description: "Taxonomic landscape of their era and interactions with contemporaries" },
              almaMater: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Universities or institutions attended" },
              institutions: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Institutions, academies, or herbaria where they worked" },
              focusAreas: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Key taxonomic groups or regions of study" },
              awards: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Honors and awards received" },
              fieldWorkRegions: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Geographic regions of fieldwork/expeditions" },
              majorWorks: {
                type: Type.ARRAY,
                description: "Major publications and monographs",
                items: {
                  type: Type.OBJECT,
                  properties: { year: { type: Type.STRING }, title: { type: Type.STRING } },
                  required: ["year", "title"]
                },
              },
              taxaDescribed: {
                type: Type.ARRAY,
                description: "Verified notable taxa described by this author",
                items: {
                  type: Type.OBJECT,
                  properties: { name: { type: Type.STRING }, rank: { type: Type.STRING } },
                  required: ["name", "rank"]
                },
              },
              eponymousTaxa: {
                type: Type.ARRAY,
                description: "Taxa named in honor of this author",
                items: {
                  type: Type.OBJECT,
                  properties: { name: { type: Type.STRING }, rank: { type: Type.STRING }, reason: { type: Type.STRING } },
                  required: ["name", "rank"]
                },
              },
              herbariaCollections: {
                type: Type.ARRAY,
                description: "Herbaria housing their type specimens or primary collections (Index Herbariorum codes)",
                items: {
                  type: Type.OBJECT,
                  properties: { abbreviation: { type: Type.STRING }, institution: { type: Type.STRING } },
                  required: ["abbreviation", "institution"]
                },
              },
              taxonomicNotes: { type: Type.STRING, description: "Nomenclatural or taxonomic notes" },
              notableMentors: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Influential mentors" },
              notableStudents: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Prominent students" },
              relatedBotanists: {
                type: Type.ARRAY,
                description: "Associated contemporaries or collaborators",
                items: {
                  type: Type.OBJECT,
                  properties: { name: { type: Type.STRING }, connection: { type: Type.STRING } },
                  required: ["name", "connection"]
                },
              },
            },
            required: ['fullName', 'standardAbbreviation', 'lifespan', 'nationality', 'mainContribution', 'biography'],
          },
        },
      });

      const result = safeJsonParse<AuthorProfile>(response.text || '{}');
      const sources = extractSources(response);
      return { result, sources };
    } catch (error) {
      console.error("Gemini API Error in lookupAuthority:", error);
      throw new Error(cleanErrorMessage(error));
    }
  });
}

export async function serverGenerateLocalityProfile(locationInput: string): Promise<{ result: LocalityProfile; sources: any[] }> {
  return retryWithBackoff(async () => {
    const ai = getGenAI();
    try {
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: `Generate an authoritative biogeographical and floristic profile for the locality: "${locationInput}".
Synthesize verified geographic coordinates, climate, ecoregion, dominant and endemic flora, phenology, and protected status.`,
        config: {
          systemInstruction: SYSTEM_TAXONOMIST_INSTRUCTION,
          temperature: 0.1,
          ...getThinkingConfig(GEMINI_MODEL, ThinkingLevel.LOW),
          tools: [{ googleSearch: {} }],
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              location_details: {
                type: Type.OBJECT,
                properties: {
                  resolved_name: { type: Type.STRING, description: "Formal geographic and administrative location name" },
                  coordinates_dms: { type: Type.STRING, description: "DMS formatted coordinates" },
                  latitude: { type: Type.NUMBER, description: "Decimal latitude" },
                  longitude: { type: Type.NUMBER, description: "Decimal longitude" }
                },
                required: ["resolved_name", "coordinates_dms"]
              },
              habitat_and_landscape: {
                type: Type.OBJECT,
                properties: {
                  ecosystem_description: { type: Type.STRING, description: "Primary ecosystem types and landscape features" },
                  climate: { type: Type.STRING, description: "Köppen climate classification and precipitation regime" },
                  soil_type: { type: Type.STRING, description: "Geological substrate and dominant soil orders" },
                  elevation_range: { type: Type.STRING, description: "Elevational range in meters" },
                  ecoregion: { type: Type.STRING, description: "WWF / EPA terrestrial ecoregion name" }
                },
                required: ["ecosystem_description", "climate", "soil_type", "elevation_range", "ecoregion"]
              },
              geography_and_history: {
                type: Type.OBJECT,
                properties: {
                  geographic_context: { type: Type.STRING, description: "Biogeographic province and physiographic province" },
                  historical_notes: { type: Type.STRING, description: "Botanical exploration history or notable collectors" },
                  protected_status: { type: Type.STRING, description: "National park, nature reserve, or conservation designation" }
                },
                required: ["geographic_context", "historical_notes", "protected_status"]
              },
              phenology: {
                type: Type.OBJECT,
                properties: {
                  optimal_collecting_season: { type: Type.STRING, description: "Optimal phenological window for botanical collecting" }
                },
                required: ["optimal_collecting_season"]
              },
              taxa: {
                type: Type.OBJECT,
                properties: {
                  dominant_species: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Dominant canopy, shrub, and groundcover flora" },
                  endemic_and_notable: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Regional endemic, rare, or indicator taxa" }
                },
                required: ["dominant_species", "endemic_and_notable"]
              },
              ecological_threats: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Invasive species, habitat fragmentation, or conservation threats" }
            },
            required: ["location_details", "habitat_and_landscape", "geography_and_history", "phenology", "taxa", "ecological_threats"],
          },
        },
      });

      const result = safeJsonParse<LocalityProfile>(response.text || '{}');
      const sources = extractSources(response);
      return { result, sources };
    } catch (error) {
      console.error("Gemini API Error in generateLocalityProfile:", error);
      throw new Error(cleanErrorMessage(error));
    }
  });
}

export async function serverGenerateQuizDistractors(correctTaxon: string): Promise<string[]> {
  return retryWithBackoff(async () => {
    const ai = getGenAI();
    const prompt = `For a botanical identification quiz, the correct answer is "${correctTaxon}".
Provide exactly 3 plausible, morphologically similar taxa at the same taxonomic rank that represent realistic identification challenges.`;

    try {
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
        config: {
          systemInstruction: SYSTEM_TAXONOMIST_INSTRUCTION,
          temperature: 0.3,
          ...getThinkingConfig(GEMINI_MODEL, ThinkingLevel.LOW),
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          }
        }
      });
      return safeJsonParse<string[]>(response.text || '[]');
    } catch (error) {
      console.error("Gemini API Error in generateQuizDistractors:", error);
      throw new Error(cleanErrorMessage(error));
    }
  });
}

export async function serverEvaluateQuizAnswer(correctTaxon: string, guessedTaxon: string): Promise<string> {
  return retryWithBackoff(async () => {
    const ai = getGenAI();
    const prompt = `A user identifying a specimen of "${correctTaxon}" incorrectly selected "${guessedTaxon}".
In 2-3 concise sentences, provide the key diagnostic morphological differences distinguishing "${correctTaxon}" from "${guessedTaxon}". Address the user directly ("You can distinguish...").`;

    try {
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
        config: { 
          systemInstruction: SYSTEM_TAXONOMIST_INSTRUCTION,
          temperature: 0.2,
          ...getThinkingConfig(GEMINI_MODEL, ThinkingLevel.LOW)
        }
      });
      return response.text || '';
    } catch (error) {
      console.error("Gemini API Error in evaluateQuizAnswer:", error);
      throw new Error(cleanErrorMessage(error));
    }
  });
}

export async function serverGenerateTaxonGuide(inputText: string): Promise<string> {
  return retryWithBackoff(async () => {
    const ai = getGenAI();
    try {
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        config: {
          systemInstruction: SYSTEM_PROMPT,
          temperature: 0.2,
          ...getThinkingConfig(GEMINI_MODEL, ThinkingLevel.LOW),
        },
        contents: [{ role: 'user', parts: [{ text: inputText }] }],
      });
      return response.text || '';
    } catch (error) {
      console.error("Gemini API Error in generateTaxonGuide:", error);
      throw new Error(cleanErrorMessage(error));
    }
  });
}

export async function serverGenerateStructuredTaxonGuide(
  taxon: string, 
  locality: string, 
  useSearch: boolean,
  filters?: string[]
): Promise<{ result: GeneratedGuideStructured; sources: any[] }> {
  return retryWithBackoff(async () => {
    const ai = getGenAI();
    try {
      let promptConfig = '';
      if (filters && filters.length > 0) {
        promptConfig = `\nActive Taxonomic Constraints & Filters:\n${filters.map((f, i) => `${i + 1}. ${f}`).join('\n')}`;
      }

      const prompt = `Generate a structured, region-specific taxonomic identification guide and dichotomous key for the taxon "${taxon}" in the locality "${locality}".${promptConfig}

Ensure:
- Species profiles include precise diagnostic characters and habitat.
- The dichotomous key follows strict couplet parallelism (both leads in each couplet contrast the identical characters in the identical sequence) with valid destination references.
- Recommended literature lists 2 to 5 authentic, peer-reviewed Flora accounts, taxonomic revisions, or published monographs for this taxon and region.`;

      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          systemInstruction: SYSTEM_TAXONOMIST_INSTRUCTION,
          temperature: 0.1,
          ...getThinkingConfig(GEMINI_MODEL, ThinkingLevel.LOW),
          tools: useSearch ? [{ googleSearch: {} }] : undefined,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              guide_metadata: {
                type: Type.OBJECT,
                properties: {
                  target_taxon: { type: Type.STRING, description: "Scientific name of the treated taxon" },
                  target_locality: { type: Type.STRING, description: "Treated geographic region" },
                  verification_summary: { type: Type.STRING, description: "Taxonomic verification statement against regional Floras" }
                },
                required: ["target_taxon", "target_locality", "verification_summary"]
              },
              taxon_overview: { type: Type.STRING, description: "Comprehensive botanical overview of the taxon in this region" },
              species_profiles: {
                type: Type.ARRAY,
                description: "Profiles of subordinate species present in the region",
                items: {
                  type: Type.OBJECT,
                  properties: {
                    scientific_name: { type: Type.STRING, description: "Accepted binomial name" },
                    common_name: { type: Type.STRING, nullable: true, description: "Vernacular name" },
                    habitat_and_ecology: { type: Type.STRING, description: "Local habitat, plant communities, and elevation" },
                    key_diagnostics: { type: Type.STRING, description: "Decisive diagnostic morphological characters" }
                  },
                  required: ["scientific_name", "habitat_and_ecology", "key_diagnostics"]
                }
              },
              dichotomous_key: {
                type: Type.ARRAY,
                description: "Bracketed or indented dichotomous key with symmetrical couplets",
                items: {
                  type: Type.OBJECT,
                  properties: {
                    couplet_id: { type: Type.STRING, description: "Couplet identifier (e.g. '1', '2', '3')" },
                    lead_a: {
                      type: Type.OBJECT,
                      properties: { 
                        statement: { type: Type.STRING, description: "Lead statement (e.g. 'Leaves palmately 5-lobed; samara wings diverging at 90°')" }, 
                        destination: { type: Type.STRING, description: "Next couplet ID (e.g. '2') or terminal species name" } 
                      },
                      required: ["statement", "destination"]
                    },
                    lead_b: {
                      type: Type.OBJECT,
                      properties: { 
                        statement: { type: Type.STRING, description: "Contrasting lead statement with parallel characters (e.g. 'Leaves unlobed or 3-lobed; samara wings parallel or diverging at <45°')" }, 
                        destination: { type: Type.STRING, description: "Next couplet ID (e.g. '3') or terminal species name" } 
                      },
                      required: ["statement", "destination"]
                    }
                  },
                  required: ["couplet_id", "lead_a", "lead_b"]
                }
              },
              field_documentation_guide: { 
                type: Type.ARRAY, 
                items: { type: Type.STRING },
                description: "Essential photographic or morphological details required for herbarium-grade voucher documentation"
              },
              recommended_literature: {
                type: Type.ARRAY,
                description: "Array of 2-5 authoritative identification resources, premier regional Flora accounts, and published monographs covering this taxon in this region.",
                items: literatureItemSchema
              }
            },
            required: ["guide_metadata", "taxon_overview", "species_profiles", "dichotomous_key", "field_documentation_guide", "recommended_literature"]
          }
        }
      });

      const result = safeJsonParse<GeneratedGuideStructured>(response.text || '{}');
      const sources = extractSources(response);
      return { result, sources };
    } catch (error) {
      console.error("Gemini API Error in generateStructuredTaxonGuide:", error);
      throw new Error(cleanErrorMessage(error));
    }
  });
}
