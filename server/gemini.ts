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
    const prompt = `Evaluate candidate plant families and taxa for this specimen:

Field Description & Observations:
${notes || 'No narrative notes provided'}

Observed Morphological Traits (if any):
${characters.length > 0 ? characters.join(', ') : 'None explicitly checked; extract character states directly from the field description above.'}

Location & Habitat:
${location || 'Not specified'}

Suspected Families (if any):
${suspectedFamilies || 'None specified'}

Identify the diagnostic combination, synapomorphies, and candidate genera matching this description. Rank candidate families by character congruence, providing diagnostic synapomorphies, spot characters, contradicting traits, and critical characters to verify next.`;

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
        contents: `Generate a comprehensive biogeographical and floristic profile for "${locationInput}". Provide verified geographic coordinates (including decimal latitude and longitude), climate, and ecoregion data. Break down the vegetation into distinct Elevational Life Zones and Ecological Strata (Canopy Trees, Shrub Layer / Understory, Herbaceous Forbs / Wildflowers, and Specialized Edaphic / Endemic Substrates), along with clear descriptions of phenology, collecting season, history, and ecological threats.`,
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
              life_zones: {
                type: Type.ARRAY,
                description: "Distinct elevational life zones and vegetation belts in this region",
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING, description: "Life zone name (e.g., 'Coastal Redwood Riparian (0–300m)')" },
                    elevation_range: { type: Type.STRING, description: "Elevational range in meters or feet" },
                    community_type: { type: Type.STRING, description: "Dominant community / biome" },
                    indicator_species: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Key diagnostic botanical indicator species (scientific names)" },
                    description: { type: Type.STRING, description: "Succinct description of microclimate, slope, and ecological traits" }
                  },
                  required: ["name", "elevation_range", "indicator_species"]
                }
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
              strata: {
                type: Type.OBJECT,
                description: "Flora organized by ecological forest and vegetation layer",
                properties: {
                  canopy_trees: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Dominant canopy and emergent tree species (scientific names)" },
                  shrub_understory: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Shrubs, subshrubs, and understory woody plants (scientific names)" },
                  herbaceous_forbs: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Herbaceous perennials, annual wildflowers, grasses, and ferns (scientific names)" },
                  specialized_edaphic_endemics: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Edaphic specialists (serpentine, limestone, barrens, vernal pools, rare endemics)" }
                },
                required: ["canopy_trees", "shrub_understory", "herbaceous_forbs", "specialized_edaphic_endemics"]
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
  filters?: string[],
  coverageScope: 'comprehensive' | 'curated' | 'groups' = 'comprehensive'
): Promise<{ result: GeneratedGuideStructured; sources: any[] }> {
  return retryWithBackoff(async () => {
    const ai = getGenAI();
    try {
      let promptConfig = '';
      if (filters && filters.length > 0) {
        promptConfig = `\nActive Taxonomic Constraints & Filters:\n${filters.map((f, i) => `${i + 1}. ${f}`).join('\n')}`;
      }

      let scopeGuidance = '';
      if (coverageScope === 'curated') {
        scopeGuidance = `\nCoverage Preference: Curated subset. Present the 10-15 most dominant, ecologically widespread, or indicator taxa occurring in "${locality}", while clearly identifying any omitted sections or rare endemics in the taxon overview.`;
      } else if (coverageScope === 'groups') {
        scopeGuidance = `\nCoverage Preference: Subgeneric Sections / Species Groups. For this high-diversity taxon in "${locality}", organize the treatment and key around recognized subgenera, sections, or species complexes (e.g. keying down to sections or sectional representatives) so the entire diversity is systematically accessible.`;
      } else {
        // Default: comprehensive
        scopeGuidance = `\nCoverage Preference: Comprehensive Regional Coverage.
CRITICAL TAXONOMIC COMPLETENESS & SPECIES RETENTION MANDATE:
- DO NOT artificially restrict or cap the number of species retained! Too often, guides are artificially throttled down to only 4-6 species when there are 8, 10, 12, or 15 relevant taxa in the given region. If there are 10-12 relevant native and established naturalized taxa of "${taxon}" in "${locality}", treat and key out ALL of them. Covering 10-18 species is completely feasible and expected by botanists and field workers.
- Do not stop at just 5 or 6 common species if there are additional relevant species present in the region!
- However, if "${taxon}" in "${locality}" is truly mega-diverse with 40-50+ taxa (such as huge genera like Carex, Astragalus, or broad families like Asteraceae), use professional botanical judgment: either present a curated subset of 15-25 dominant/indicator species (stating which groups were omitted), or organize the key and profiles into infrageneric sections / species groups.`;
      }

      const prompt = `Generate an authoritative, structured taxonomic identification guide and dichotomous key for "${taxon}" in "${locality}".${scopeGuidance}${promptConfig}

Botanical Requirements:
1. TAXONOMIC COMPLETENESS & SPECIES RETENTION:
   - Identify all native and established naturalized species/taxa of "${taxon}" recorded in "${locality}".
   - Unless the taxon is hyper-diverse (50+ species), do NOT artificially limit the species count to just 4-6 species. If 10-14 taxa occur in the region, include all 10-14 taxa!
   - For hyper-diverse groups (50+ taxa), provide a curated treatment of ~15-25 dominant taxa or divide into recognized infrageneric sections/complexes.
2. OVERVIEW & SCOPE STATEMENT:
   - Provide a comprehensive botanical overview setting the regional taxonomic context, morphological characteristics, and explicitly stating the taxonomic scope (e.g., number of treated taxa, native vs introduced status, and any omitted sister taxa).
3. PARALLEL DICHOTOMOUS KEY:
   - Build a comprehensive, symmetrical bracketed dichotomous key where EVERY lead contrasts parallel characters and leads directly to either a couplet ID or one of the treated species.
   - Every single species or group in "species_profiles" MUST be resolved and reachable as a terminal in the "dichotomous_key".
4. SUBORDINATE PROFILES:
   - Detailed species profiles with diagnostic morphological characters, precise metric measurements, and local habitat/ecology for each treated taxon.
5. VOUCHERS & AUTHENTIC LITERATURE:
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
                  verification_summary: { type: Type.STRING, description: "Taxonomic verification statement against regional Floras" },
                  coverage_scope: { type: Type.STRING, description: "Explicit summary of taxonomic coverage (e.g., 'Comprehensive treatment of all 11 recognized native and naturalized species of Acer in California' or 'Curated treatment of 18 dominant species across 4 subgeneric sections out of ~55 regional Carex taxa')" },
                  total_taxa_treated: { type: Type.INTEGER, description: "Total count of taxa treated in this guide" }
                },
                required: ["target_taxon", "target_locality", "verification_summary"]
              },
              taxon_overview: { type: Type.STRING, description: "A comprehensive, well-structured botanical overview of the taxon in this region, outlining its diagnostic morphology, key field characters, taxonomic boundaries, regional diversity, and ecological setting in clear, objective prose" },
              species_profiles: {
                type: Type.ARRAY,
                description: "Profiles of subordinate species or infrageneric groups present in the region. Treat ALL relevant native and established naturalized taxa (typically 8–18 taxa when feasible). Do not restrict to only 4-6 species if 10-14 taxa occur in the region. For mega-diverse groups (30+ taxa), present 15-25 key dominant species or group complexes.",
                items: {
                  type: Type.OBJECT,
                  properties: {
                    scientific_name: { type: Type.STRING, description: "Accepted binomial name or infrageneric taxon name" },
                    common_name: { type: Type.STRING, nullable: true, description: "Vernacular name" },
                    habitat_and_ecology: { type: Type.STRING, description: "Clear, factual description of local microhabitats, elevation bands, soil preferences, and associated plant communities" },
                    key_diagnostics: { type: Type.STRING, description: "Decisive diagnostic morphological characters distinguishing it from local congeners" }
                  },
                  required: ["scientific_name", "habitat_and_ecology", "key_diagnostics"]
                }
              },
              dichotomous_key: {
                type: Type.ARRAY,
                description: "Parallel bracketed dichotomous key with symmetrical couplets that completely keys out all taxa treated in species_profiles without omitting any treated species.",
                items: {
                  type: Type.OBJECT,
                  properties: {
                    couplet_id: { type: Type.STRING, description: "Couplet identifier (e.g. '1', '2', '3')" },
                    lead_a: {
                      type: Type.OBJECT,
                      properties: { 
                        statement: { type: Type.STRING, description: "Lead statement (e.g. 'Leaves palmately 5-lobed; samara wings diverging at 90°')" }, 
                        destination: { type: Type.STRING, description: "Next couplet ID (e.g. '2') or terminal species/group name" } 
                      },
                      required: ["statement", "destination"]
                    },
                    lead_b: {
                      type: Type.OBJECT,
                      properties: { 
                        statement: { type: Type.STRING, description: "Contrasting lead statement with parallel characters (e.g. 'Leaves unlobed or 3-lobed; samara wings parallel or diverging at <45°')" }, 
                        destination: { type: Type.STRING, description: "Next couplet ID (e.g. '3') or terminal species/group name" } 
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

export async function serverCompareGuideTaxa(
  taxa: { scientific_name: string; common_name?: string | null; key_diagnostics?: string; habitat_and_ecology?: string }[],
  locality: string,
  activeFilters: string[] = [],
  guideLiterature: string[] = []
): Promise<{ result: any; sources: any[] }> {
  return retryWithBackoff(async () => {
    const ai = getGenAI();
    const taxonNames = taxa.map((t) => t.scientific_name);

    const prompt = `You are an expert botanical taxonomist building a decisive subset comparison for an identification guide.

Selected Taxa to compare (${taxa.length} taxa):
${taxa.map((t) => `- ${t.scientific_name}${t.common_name ? ` (${t.common_name})` : ''}\n  Diagnostics from guide: ${t.key_diagnostics || 'Not provided'}\n  Habitat/Ecology: ${t.habitat_and_ecology || 'Not provided'}`).join('\n')}

Regional Context / Locality:
${locality || 'General / Not specified'}

Active Specimen Constraints / Filters:
${activeFilters.length > 0 ? activeFilters.join('; ') : 'None (all characters permitted)'}

Available Literature / Authority Context:
${guideLiterature.length > 0 ? guideLiterature.slice(0, 4).join('; ') : 'Standard regional floras (e.g. POWO, Flora of North America, Jepson Manual)'}

Botanical Comparison Requirements:
1. "fastest_distinction_summary":
   - 2-3 concise, decisive sentences stating the primary morphological character that immediately separates these taxa in the field.
   - Mention the exact organ (e.g. leaf venation, trichomes, perianth count, fruit wings).
2. "what_to_examine_next":
   - An ordered list of 3-5 high-priority, concrete diagnostic checks for a botanist holding a specimen or loupe.
   - Include the target organ, recommended observation method (e.g. 10x hand lens, millimeter ruler, gross observation), and what character states indicate which species.
3. "matrix_rows":
   - Array of comparative morphological characters. Rank Decisive diagnostic differences first, followed by Strong, Secondary, and optional Shared characters.
   - For every character row, provide an exact state for EACH of the ${taxa.length} taxa in the order: [${taxonNames.join(', ')}].
   - Include precise metric measurements with units (e.g. "petioles 3–7 cm long; blades 8–15 × 6–12 cm").
   - If a character state is unknown or unsupported by evidence, specify "Not established" rather than inventing differences.
   - Note any character state overlap or seasonal dependence in "overlap_notes".
   - If active constraints specify "Vegetative characters only" or similar, prioritize vegetative rows and clearly state when flowers/fruits are required to confirm ID.
   - Provide supporting citation/authoritative source references where available.
4. "limitations":
   - 2-4 critical field limitations: overlapping measurement ranges, hybrids, juvenile foliage variation, or seasonal requirements.
5. "constraints_advisory":
   - If active constraints (like vegetative only) make confident separation impossible between any pair, explicitly advise what reproductive material or phenological stage must be waited for.`;

    try {
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          systemInstruction: SYSTEM_TAXONOMIST_INSTRUCTION,
          temperature: 0.15,
          ...getThinkingConfig(GEMINI_MODEL, ThinkingLevel.LOW),
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              taxa: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    scientific_name: { type: Type.STRING },
                    common_name: { type: Type.STRING, nullable: true },
                    family: { type: Type.STRING, nullable: true },
                  },
                  required: ['scientific_name'],
                },
              },
              fastest_distinction_summary: {
                type: Type.STRING,
                description: 'Short, decisive summary of the single most reliable distinction separating these taxa.',
              },
              what_to_examine_next: {
                type: Type.ARRAY,
                description: 'Ordered checklist of concrete field examinations to resolve identification.',
                items: {
                  type: Type.OBJECT,
                  properties: {
                    priority: { type: Type.INTEGER },
                    action: { type: Type.STRING, description: 'Action command, e.g. Inspect underside of mature leaves' },
                    target_organ: { type: Type.STRING, description: 'Organ examined, e.g. Leaf abaxial surface' },
                    lens_or_technique: { type: Type.STRING, description: 'Technique, e.g. 10x hand lens or millimeter scale' },
                    expected_outcomes: { type: Type.STRING, description: 'What to look for across the taxa' },
                  },
                  required: ['priority', 'action', 'target_organ', 'expected_outcomes'],
                },
              },
              matrix_rows: {
                type: Type.ARRAY,
                description: 'Decisive morphological comparison rows ranked by diagnostic power.',
                items: {
                  type: Type.OBJECT,
                  properties: {
                    character_name: { type: Type.STRING, description: 'Name of morphological character, e.g. Leaf blade margin' },
                    category: { type: Type.STRING, description: 'Vegetative, Floral, Fruit/Seed, or Phenology/Ecology' },
                    diagnostic_importance: {
                      type: Type.STRING,
                      enum: ['Decisive', 'Strong', 'Secondary', 'Shared'],
                      description: 'Rank of diagnostic utility.',
                    },
                    observation_method: { type: Type.STRING, description: 'Observation technique or tool' },
                    relevant_life_stage: { type: Type.STRING, description: 'Applicable life stage' },
                    states: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          scientific_name: { type: Type.STRING },
                          state: { type: Type.STRING },
                          is_uncertain: { type: Type.BOOLEAN },
                        },
                        required: ['scientific_name', 'state'],
                      },
                    },
                    overlap_notes: { type: Type.STRING, nullable: true },
                    citation: { type: Type.STRING, nullable: true },
                  },
                  required: ['character_name', 'diagnostic_importance', 'states'],
                },
              },
              limitations: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'Known limitations, overlaps, and variation.',
              },
              constraints_advisory: {
                type: Type.STRING,
                nullable: true,
                description: 'Advisory if active constraints limit separation.',
              },
            },
            required: ['taxa', 'fastest_distinction_summary', 'what_to_examine_next', 'matrix_rows', 'limitations'],
          },
        },
      });

      const result = safeJsonParse<any>(response.text || '{}');
      const sources = extractSources(response);
      return { result, sources };
    } catch (error) {
      console.error("Gemini API Error in serverCompareGuideTaxa:", error);
      throw new Error(cleanErrorMessage(error));
    }
  });
}


