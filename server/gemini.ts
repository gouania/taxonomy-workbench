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

export const SYSTEM_TAXONOMIST_INSTRUCTION = `You are an expert systematic botanist and taxonomic researcher writing for an authoritative botanical identification handbook.
Provide rigorous, accurate, and scientifically grounded botanical analyses adhering to recognized taxonomic consensus:
- International Code of Nomenclature for algae, fungi, and plants (ICN)
- Current APG IV classification for angiosperms and PPG I for pteridophytes
- Standard taxonomic databases (Plants of the World Online / POWO, World Flora Online / WFO, IPNI, Index Fungorum, Catalogue of Life)
- Standard author abbreviations per IPNI / Brummitt & Powell
- Diagnostic morphology with empirical metric measurements and observable character states
- Symmetrical, mutually exclusive leads in dichotomous keys

Style & Tone for Botanical Identification Manuals:
- Core Purpose: This is primarily an identification tool. The focus must be on diagnostic morphological characters and essential biological context (habitat, phenology, range, conservation, human relevance).
- Register: Authoritative, objective, clear, and direct—matching the standard of modern reference floras and taxonomic identification manuals (e.g., Flora of North America, The Jepson Manual, Clive Stace's Flora).
- Avoid Lyrical or Flowery Prose: Do not use poetic, emotive, or decorative nature-writing flourishes. Avoid aestheticizing or romanticizing taxa and habitats.
- Avoid Stiff, Recondite Boilerplate: Avoid dense jargon-stacking or awkward robotic templates (e.g., do not open with an impenetrable chain of technical modifiers like "is a hysteranthous, perennial woodland geophyte celebrated across...").
- Transparent, Fluent Precision:
  * Present diagnostic morphology clearly, leading with habit, vegetative organs, inflorescences, flowers, and fruit.
  * When using specialized technical terms (e.g., hysteranthous, moniliform, didynamous), pair them naturally with the observable physical character state so the diagnostic meaning is immediately practical in the field (e.g., "broad leaves that die back before an erect, leafless scape appears with a spherical flower umbel—a hysteranthous pattern in which foliage and flowers are not seen together").
  * Use active, clean syntax ("native to", "characterized by", "produces", "dies back before flowering", "identified by") with balanced, readable sentences.`;

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
    // For Gemini 3 flash series models, ThinkingLevel.LOW provides fast, structured reasoning
    const effectiveLevel = ((model.includes('3.7') || model.includes('3.8')) && level === ThinkingLevel.MINIMAL) ? ThinkingLevel.LOW : level;
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
      description: "Formal scientific name of the morphologically similar or commonly confused taxon" 
    },
    difference: { 
      type: Type.STRING, 
      description: "Diagnostic morphological criteria distinguishing it from the target taxon, highlighting key character states in bold" 
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
      description: "Formal bibliographic citation (Authors, Year, Title, Journal / Flora Series / Publisher, Volume: Pages) of an authentic published Flora treatment, monograph, or revision" 
    },
    type: { 
      type: Type.STRING, 
      description: "Category of literature: 'Flora Account', 'Taxonomic Revision', 'Monograph', 'Regional Key', or 'Checklist'" 
    },
    scope: { 
      type: Type.STRING, 
      description: "Taxonomic or geographic scope (e.g., 'Flora of California (Jepson eFlora)', 'Flora of North America', 'Flora Europaea', 'Flora of China')" 
    },
    notes: { 
      type: Type.STRING, 
      description: "Concise annotation explaining the relevance of this work or the subordinate taxa it treats" 
    },
    url: { 
      type: Type.STRING, 
      description: "Direct URL to the online flora treatment or digital monograph if known, or empty string" 
    },
  },
  required: ['citation', 'type', 'scope', 'notes'],
};

const taxonSchemaProperties = {
  scientificName: { 
    type: Type.STRING, 
    description: "Formal scientific name (binomial or trinomial name, e.g. 'Quercus robur'). Exclude author citation and vernacular names." 
  },
  author: { 
    type: Type.STRING, 
    description: "Standard botanical author abbreviation per IPNI / Brummitt & Powell (e.g. 'L.', '(Lam.) J.St.-Hil.')" 
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
    description: "Accepted count of subordinate or recognized taxa with explicit taxonomic rank context (e.g. for genus: 'Genus: ca. 500 species'; for species: 'Species: Monotypic' or 'Species: 2 recognized subspecies'; for family: 'Family: ca. 125 genera and 4,000 species')." 
  },
  localIncludedTaxaCount: { 
    type: Type.STRING, 
    description: "Accepted subordinate taxon count within the requested locality (e.g., '5 species in California'), or 'N/A' if no locality context is specified." 
  },
  synonyms: { 
    type: Type.ARRAY, 
    items: { type: Type.STRING }, 
    description: "Notable homotypic or heterotypic synonyms (such as recent basionyms or reassignments), or empty array if none." 
  },
  conservationStatus: { 
    type: Type.STRING, 
    description: "Current IUCN Red List category or regional conservation status (e.g., 'Least Concern (LC)', 'Endangered (EN)', 'Not Evaluated')." 
  },
  hazards: { 
    type: Type.STRING, 
    description: "Known toxicity to humans/livestock, allergens, contact dermatitis, spines/physical hazards, or 'None known'." 
  },
  fieldNotes: { 
    type: Type.STRING, 
    description: "Practical field cues (crushed foliage odor, sap consistency, bark texture, or seasonal phenology) that aid in situ identification. State 'N/A' if none." 
  },
  seasonality: { 
    type: Type.STRING, 
    description: "Phenology (flowering/fruiting periods, foliation, or dormancy). State 'N/A' if not applicable." 
  },
  humanRelevance: { 
    type: Type.STRING, 
    description: "Factual, objective account of ethnobotany, economic botany, traditional indigenous uses, horticulture, or timber and forestry significance. State 'N/A' if none." 
  },
  quickRecap: { 
    type: Type.STRING, 
    description: "A concise, well-constructed 2-3 sentence overview for a botanical identification manual: state the life form, native range, primary diagnostic morphological characters and phenology, followed by key practical, cultural, or conservation relevance. Keep the style objective, clear, and informative—not lyrical or flowery, but fluent and free of clunky, recondite jargon-stacking." 
  },
  diagnosticDescription: { 
    type: Type.STRING, 
    description: "Markdown bulleted list of physical morphological features organized by organ (e.g. '- **Habit**: ...', '- **Leaves**: ...', '- **Inflorescence**: ...', '- **Flowers**: ...', '- **Fruit**: ...'). Focus on diagnostic vegetative and reproductive characters with metric dimensions." 
  },
  confusedTaxa: {
    type: Type.ARRAY,
    description: "Array of 4 to 5 morphologically similar or commonly confused taxa, especially within the specified locality if provided.",
    items: confusedTaxonSchema,
  },
  ecology: { 
    type: Type.STRING, 
    description: "Clear, factual description of ecological niche, plant community associations, substrate/soil affinities, moisture regimes, and elevational range (Markdown supported)." 
  },
  etymology: { 
    type: Type.STRING, 
    description: "Lucid, factual explanation of the etymology and linguistic derivation of the scientific name, generic root, and specific epithet (Markdown supported)." 
  },
  history: { 
    type: Type.STRING, 
    description: "Factual historical account detailing protologue publication, type specimen provenance, nomenclatural history, and notable botanists associated with the taxon (Markdown supported)." 
  },
  distribution: { 
    type: Type.STRING, 
    description: "Comprehensive biogeographical account of the native distribution, significant disjunctions, and introduced or naturalized occurrences (Markdown supported)." 
  },
  recommendedLiterature: {
    type: Type.ARRAY,
    description: "Array of 2 to 5 authentic, recognized Flora accounts, peer-reviewed taxonomic revisions, or published monographs covering this taxon.",
    items: literatureItemSchema,
  },
};

export async function serverAnalyzeSingleTaxon(name: string, locality?: string, useWebSearch: boolean = false): Promise<{ result: TaxonProfile; sources: any[] }> {
  return retryWithBackoff(async () => {
    const ai = getGenAI();

    const prompt = locality
      ? `Provide an authoritative botanical analysis and identification profile for "${name}" in the regional context of "${locality}". Focus on decisive diagnostic morphology, metric character states, and essential taxonomic and ecological data in clear, objective flora-manual style.`
      : `Provide an authoritative botanical analysis and identification profile for "${name}". Focus on decisive diagnostic morphology, metric character states, and essential taxonomic and ecological data in clear, objective flora-manual style.`;

    try {
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
        config: {
          systemInstruction: SYSTEM_TAXONOMIST_INSTRUCTION,
          temperature: 0.15,
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

    const prompt = locality
      ? `Provide a comparative taxonomic analysis contrasting ${names.map((n) => `"${n}"`).join(', ')} in the regional context of "${locality}". Focus on clear diagnostic distinctions, metric ranges, and a structured morphological comparison matrix in objective botanical manual style.`
      : `Provide a comparative taxonomic analysis contrasting ${names.map((n) => `"${n}"`).join(', ')}. Focus on clear diagnostic distinctions, metric ranges, and a structured morphological comparison matrix in objective botanical manual style.`;

    try {
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
        config: {
          systemInstruction: SYSTEM_TAXONOMIST_INSTRUCTION,
          temperature: 0.15,
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
    const prompt = `Evaluate candidate plant families and taxa for a specimen with the following observed characters and context:
Selected Morphological Characters: ${characters.join(', ')}
Specimen Notes: ${notes || 'None provided'}
Location & Habitat: ${location || 'Not specified'}
Suspected Families: ${suspectedFamilies || 'None specified'}

Rank candidate families by character congruence, providing diagnostic synapomorphies, spot characters, contradicting traits, and critical characters to verify next.`;

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
        contents: `Currently observed morphological characters: ${selectedCharacters.join(', ')}.
Available candidate characters: ${availableCharacters.join(', ')}.
Suggest up to 3 high-value characters to examine next that provide the greatest discriminatory power for resolving taxonomic identity.`,
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
        contents: `Provide a clear, articulate botanical definition and diagnostic significance for the morphological character "${characterLabel}". Balance precise organography with an accessible explanation of its taxonomic value.`,
        config: { 
          systemInstruction: SYSTEM_TAXONOMIST_INSTRUCTION,
          temperature: 0.2,
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
        contents: `Provide an authoritative botanical biography and bibliographic profile for the author or standard abbreviation "${query}".
Summarize their primary taxonomic contributions, career milestones, historical context among contemporaries, associated herbarium collections, and major published works in clear, objective biographical prose.`,
        config: {
          systemInstruction: SYSTEM_TAXONOMIST_INSTRUCTION,
          temperature: 0.2,
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
              mainContribution: { type: Type.STRING, description: "A clear, comprehensive overview of the botanist's primary taxonomic contributions, publications, and lasting biological legacy" },
              biography: { type: Type.STRING, description: "A well-structured multi-paragraph Markdown biography covering education, expeditions, major discoveries, and institutional appointments in objective, informative prose" },
              historicalContext: { type: Type.STRING, description: "An objective account of the taxonomic landscape of their era, intellectual debates, and professional relationships with contemporaries" },
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
        contents: `Generate a comprehensive biogeographical and floristic profile for "${locationInput}". Provide verified geographic coordinates, climate, and ecoregion data, along with clear, objective descriptions of the landscape, dominant and endemic flora, phenological patterns, and botanical exploration history.`,
        config: {
          systemInstruction: SYSTEM_TAXONOMIST_INSTRUCTION,
          temperature: 0.15,
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
                  ecosystem_description: { type: Type.STRING, description: "Clear, authoritative description of the landscape features, vegetation structure, and primary plant communities characteristic of the region" },
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
                  historical_notes: { type: Type.STRING, description: "Factual, concise summary of botanical exploration, notable collectors, type localities, and conservation milestones in this region" },
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
    const prompt = `For a botanical identification quiz where the correct taxon is "${correctTaxon}", suggest 3 plausible, morphologically similar taxa at the same taxonomic rank that represent realistic identification challenges.`;

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
    const prompt = `In a botanical identification exercise, the learner selected "${guessedTaxon}" for a specimen that is "${correctTaxon}".
In 2-3 concise, well-written sentences, explain the key diagnostic morphological differences distinguishing "${correctTaxon}" from "${guessedTaxon}". Address the user directly in an encouraging, clear, and precise tone.`;

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

      const prompt = `Generate a structured taxonomic identification guide and dichotomous key for "${taxon}" in "${locality}".${promptConfig}

Include:
- An authoritative botanical overview setting the regional taxonomic context, followed by subordinate species profiles with diagnostic characters, local habitat, and ecology.
- A parallel dichotomous key with mutually exclusive leads and clear destination references.
- Practical field voucher documentation cues and authentic regional Flora literature.`;

      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          systemInstruction: SYSTEM_TAXONOMIST_INSTRUCTION,
          temperature: 0.15,
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
              taxon_overview: { type: Type.STRING, description: "A comprehensive, well-structured botanical overview of the taxon in this region, outlining its diagnostic morphology, key field characters, taxonomic boundaries, and regional ecological setting in clear, objective prose" },
              species_profiles: {
                type: Type.ARRAY,
                description: "Profiles of subordinate species present in the region",
                items: {
                  type: Type.OBJECT,
                  properties: {
                    scientific_name: { type: Type.STRING, description: "Accepted binomial name" },
                    common_name: { type: Type.STRING, nullable: true, description: "Vernacular name" },
                    habitat_and_ecology: { type: Type.STRING, description: "Clear, factual description of local microhabitats, elevation bands, soil preferences, and associated plant communities" },
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
