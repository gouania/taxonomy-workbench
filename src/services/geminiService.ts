import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';
import {
  AuthorProfile,
  ComparisonProfile,
  IdentifyResult,
  TaxonProfile,
  GroundingSource,
  LocalityProfile,
  GeneratedGuideStructured
} from '../types';
import { GEMINI_MODEL, SYSTEM_PROMPT } from '../constants';

function getApiKey(): string {
  return (
    process.env.GEMINI_API_KEY ||
    process.env.API_KEY ||
    (import.meta as any).env?.VITE_GEMINI_API_KEY ||
    (import.meta as any).env?.VITE_API_KEY ||
    ''
  );
}

function getGenAI(): GoogleGenAI {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('API key not found. Please connect your API key.');
  }
  return new GoogleGenAI({ apiKey });
}

function getThinkingConfig(model: string, level: ThinkingLevel): { thinkingConfig?: { thinkingLevel: ThinkingLevel } } {
  // Thinking levels are only supported for Gemini 3 series models (e.g. gemini-3.5-flash, gemini-3.1-pro-preview)
  if (model.includes('gemini-3')) {
    return { thinkingConfig: { thinkingLevel: level } };
  }
  return {};
}

function safeJsonParse<T>(text: string, fallback: any = {}): T {
  if (!text) return fallback as T;
  let cleaned = text.trim();
  
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  }
  cleaned = cleaned.trim();

  try {
    return JSON.parse(cleaned) as T;
  } catch (error) {
    console.warn("Standard JSON.parse failed, attempting extraction/correction on:", cleaned);
    
    // Targeted fix for potential "species_profiles":. It is... anomaly
    if (cleaned.includes('"species_profiles"')) {
      const profilesAnomalyRegex = /"species_profiles"\s*:\s*\.?\s*([^"]+)",\s*("key_diagnostics"\s*:\s*"[^"]+",\s*"common_name"\s*:\s*"([^"]+)"\s*\})/gi;
      if (profilesAnomalyRegex.test(cleaned)) {
        cleaned = cleaned.replace(profilesAnomalyRegex, (match, habitat, middle, commonName) => {
          const cleanName = commonName.replace(/[\*_]/g, '');
          return `"species_profiles": [\n    {\n      "scientific_name": "${cleanName}",\n      "habitat_and_ecology": "${habitat}",\n      ${middle}`;
        });
      }
    }
    
    // Attempt 1: Extract anything between the first '{' and the last '}'
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const extracted = cleaned.substring(firstBrace, lastBrace + 1);
      try {
        return JSON.parse(extracted) as T;
      } catch (innerError) {
        // Attempt 2: Simple cleanup of common trailing comma issue or control chars
        const simplified = extracted
          .replace(/,\s*([}\]])/g, '$1')
          .replace(/[\u0000-\u001F\u007F-\u009F]/g, " ");
        try {
          return JSON.parse(simplified) as T;
        } catch (finalError) {
          // Attempt 3: If it's cut off, try to force-close open brackets/curly braces
          // Let's count open vs close
          let openBraces = 0;
          let openBrackets = 0;
          let temp = "";
          for (let i = 0; i < extracted.length; i++) {
            const char = extracted[i];
            if (char === '{') openBraces++;
            if (char === '}') openBraces--;
            if (char === '[') openBrackets++;
            if (char === ']') openBrackets--;
            temp += char;
          }
          // If we have open braces/brackets, try adding closing ones
          if (openBraces > 0 || openBrackets > 0) {
            let repaired = temp;
            repaired = repaired.replace(/,\s*$/, ''); // clean potential trailing comma at current end
            // Remove incomplete keys or values if they are at the end, e.g. "key":. or "key":
            repaired = repaired.replace(/"\w+"\s*:\s*(?:\.|\?|)?\s*$/, '');
            while (openBrackets > 0) {
              repaired += ']';
              openBrackets--;
            }
            while (openBraces > 0) {
              repaired += '}';
              openBraces--;
            }
            try {
              return JSON.parse(repaired) as T;
            } catch (repairError) {
              console.error("JSON repair failed:", repairError);
            }
          }
        }
      }
    }
    
    // Attempt 4: Extract arrays
    const firstBracket = cleaned.indexOf('[');
    const lastBracket = cleaned.lastIndexOf(']');
    if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
      const extracted = cleaned.substring(firstBracket, lastBracket + 1);
      try {
        return JSON.parse(extracted) as T;
      } catch {}
    }

    throw error;
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
    return "Gemini API Quota Exhausted: You have temporarily hit the platform rate limits or project quota. Please wait a moment before trying again, or try disabling Search Grounding (which uses extra real-time search quota).";
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

async function retryWithBackoff<T>(fn: () => Promise<T>, retries = 3, delay = 1500): Promise<T> {
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
      console.warn(`Gemini API rate limited (quota exceeded). Retrying in ${delay}ms... (${retries} retries left)`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      return retryWithBackoff(fn, retries - 1, delay * 2);
    }
    throw error;
  }
}

export const generateTaxonGuide = async (inputText: string): Promise<string> => {
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
        contents: [
          {
            role: 'user',
            parts: [{ text: inputText }],
          },
        ],
      });

      const text = response.text;
      if (!text) {
          throw new Error("No response text received from Gemini.");
      }
      return text;

    } catch (error) {
      console.error("Gemini API Error in generateTaxonGuide:", error);
      throw new Error(cleanErrorMessage(error));
    }
  });
};

export const generateStructuredTaxonGuide = async (taxon: string, locality: string, useSearch: boolean): Promise<{ result: GeneratedGuideStructured; sources: any[] }> => {
  return retryWithBackoff(async () => {
    const ai = getGenAI();
    try {
      const prompt = `You are an expert plant taxonomist and botanical author. Your task is to generate a highly accurate, region-specific identification guide and dichotomous key based on a provided Taxon and Locality.

CRITICAL INSTRUCTION - USE SEARCH GROUNDING:
Before generating the guide, you MUST use your search capabilities to query authoritative botanical databases, regional floras, and checklists (e.g., GBIF, SEINet, Flora of North America, local university herbaria) to determine which species of the requested ${taxon} are documented to occur natively or are naturalized in the requested ${locality}.

Once you have established the verified regional species list, generate the guide following these rules:
1. Limit your search and final selection to the top 4-6 most common, standard, or representative local species in that region. If there are fewer than 4 species present, include all of them. This keeps the guide highly accurate, focused, and fast to generate.
2. Provide a brief overview of the taxon's ecological role or general characteristics in the specified locality.
3. Create a strictly dichotomous key to identify only these selected 4-6 local species. Use contrasting, reliable morphological characters.
4. Provide brief diagnostic profiles for each of the selected species.
5. Create a bespoke list of 3-4 highly taxon-specific, precise, professional recommendations for "What to photograph and/or collect in the field" for this specific taxon (e.g., for Quercus/Oaks, emphasize mature acorns, twig bud scales, and leaf veins; for Dryopteris/Ferns, emphasize sori arrangement, indusium presence, and stipe scales; for Asteraceae/Composites, emphasize phyllary series, ray/disc floret details, and pappus type).
6. Create a bespoke list of 3-4 highly taxon-specific, precise recommendations for "What notes to record in the field for identification" (e.g., notes on sap/exudate color and consistency, scent, deciduous vs. evergreen growth, bark texture, associated species, or habit/height of the mature plant).

You MUST output your response strictly as a JSON object matching the provided schema.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ],
        config: {
          temperature: 0.1,
          ...getThinkingConfig('gemini-3.5-flash', ThinkingLevel.MINIMAL),
          tools: useSearch ? [{ googleSearch: {} }] : undefined,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              guide_metadata: {
                type: Type.OBJECT,
                properties: {
                  target_taxon: { type: Type.STRING },
                  target_locality: { type: Type.STRING },
                  verification_summary: { type: Type.STRING, description: "Briefly mention the types of sources or databases implicitly used to verify regional presence" }
                },
                required: ["target_taxon", "target_locality", "verification_summary"]
              },
              taxon_overview: { type: Type.STRING, description: "1-2 paragraphs describing the genus/family characteristics specifically within the context of this locality" },
              species_profiles: {
                type: Type.ARRAY,
                description: "An array of 4-6 species profiles. Each profile represents a validated local species.",
                items: {
                  type: Type.OBJECT,
                  properties: {
                    scientific_name: { 
                      type: Type.STRING, 
                      description: "The formal scientific binomial name of the species (e.g., 'Gamocarpha alpina')." 
                    },
                    common_name: { 
                      type: Type.STRING, 
                      nullable: true, 
                      description: "The primary common/vernacular name of the species, or null if there is no standard common name." 
                    },
                    habitat_and_ecology: { 
                      type: Type.STRING, 
                      description: "A concise 1-2 sentence description of the species' habitat, elevation range, and ecological role in this region." 
                    },
                    key_diagnostics: { 
                      type: Type.STRING, 
                      description: "Concise morphological field marks (habit, leaves, flowers, fruit) that are highly diagnostic for this species." 
                    }
                  },
                  required: ["scientific_name", "habitat_and_ecology", "key_diagnostics"]
                }
              },
              dichotomous_key: {
                type: Type.ARRAY,
                description: "The dichotomous key couplets, leading step-by-step from the family/genus level down to the individual target species names.",
                items: {
                  type: Type.OBJECT,
                  properties: {
                    couplet_id: { 
                      type: Type.STRING, 
                      description: "Numeric couplet identifier, starting at '1' (e.g., '1', '2', '3')." 
                    },
                    lead_a: {
                      type: Type.OBJECT,
                      description: "The first statement (lead a) of the couplet.",
                      properties: {
                        statement: { 
                          type: Type.STRING, 
                          description: "The diagnostic morphological statement for lead a (e.g., 'Plants annual; stems branched; leaves linear-lanceolate')." 
                        },
                        destination: { 
                          type: Type.STRING, 
                          description: "Where this lead points: either the next numeric couplet_id, or the matching Scientific Name of the species (e.g., 'Leucocera eryngioides')." 
                        }
                      },
                      required: ["statement", "destination"]
                    },
                    lead_b: {
                      type: Type.OBJECT,
                      description: "The second, contrasting statement (lead b) of the couplet.",
                      properties: {
                        statement: { 
                          type: Type.STRING, 
                          description: "The contrasting morphological statement for lead b (e.g., 'Plants perennial; leaves in basal rosettes')." 
                        },
                        destination: { 
                          type: Type.STRING, 
                          description: "Where this lead points: either the next numeric couplet_id, or the matching Scientific Name of the species." 
                        }
                      },
                      required: ["statement", "destination"]
                    }
                  },
                  required: ["couplet_id", "lead_a", "lead_b"]
                }
              },
              field_photography_and_collection: {
                type: Type.ARRAY,
                description: "An array of 3-4 highly specific, bespoke bullet points advising what features of this specific taxon must be photographed or collected (e.g. sori, ligules, capsules, resin, acorns, basal leaves) for precise identification",
                items: { type: Type.STRING }
              },
              field_notes_to_record: {
                type: Type.ARRAY,
                description: "An array of 3-4 highly specific, bespoke bullet points listing written observations that cannot be photographed easily but are diagnostics for this specific taxon (e.g., aroma, exudates, bark texture, canopy height, host/associated plants, flower opening times)",
                items: { type: Type.STRING }
              }
            },
            required: ["guide_metadata", "taxon_overview", "species_profiles", "dichotomous_key", "field_photography_and_collection", "field_notes_to_record"]
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
};

const confusedTaxonSchema = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING, description: "Name of confused taxon" },
    difference: { type: Type.STRING, description: "How to distinguish it (Markdown supported, use bolding only for critical keywords)" },
    keyFeature: { type: Type.STRING, description: "Specific feature to look at" },
  },
  required: ['name', 'difference', 'keyFeature'],
};

const taxonSchemaProperties = {
  scientificName: { type: Type.STRING, description: "Formal scientific name (ONLY the binomial or trinomial name)" },
  author: { type: Type.STRING, description: "Standard botanical or zoological author citation (e.g. 'L.', 'Linnaeus', '(Lam.) J.St.-Hil.')" },
  commonName: { type: Type.STRING, description: "Most common vernacular name" },
  family: { type: Type.STRING, description: "Biological family" },
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
  includedTaxaCount: { type: Type.STRING, description: "The global number of accepted included taxa for this rank (e.g., 'Approx. 50 genera', '3 subspecies', 'Monotypic'). Use approximate figures if necessary." },
  localIncludedTaxaCount: { type: Type.STRING, description: "The number of accepted included taxa specifically within the requested locality. E.g., '5 species in California'. Write 'N/A' if no locality context is provided or applicable." },
  synonyms: { type: Type.ARRAY, items: { type: Type.STRING }, description: "1-3 notable synonyms (especially recent valid reassignments). Empty array if none are notable." },
  conservationStatus: { type: Type.STRING, description: "Current IUCN or regional conservation status (e.g., 'Least Concern', 'Endangered', 'Not Evaluated')." },
  hazards: { type: Type.STRING, description: "Toxicity to humans/pets, venom, physical hazards, or 'None known'." },
  fieldNotes: { type: Type.STRING, description: "Sensory or behavioral ID cues: smells, sounds/vocalizations, flight patterns, tracks, bruising, or sap. If NA, write 'N/A'." },
  seasonality: { type: Type.STRING, description: "Phenology (flowering/fruiting times), migration, or activity periods. Describe concisely. Write 'N/A' if not applicable." },
  humanRelevance: { type: Type.STRING, description: "Ethnobotany, economic impact, traditional uses, edibility, or pest status. Write 'N/A' if none." },
  quickRecap: { type: Type.STRING, description: "A 2-3 sentence summary. This MUST include the primary diagnostic morphological character. Use bolding sparingly—only for the absolute most decisive traits." },
  diagnosticDescription: { type: Type.STRING, description: "A standard Markdown bulleted list. EACH feature (Habit, Leaves, Flowers, Fruit, etc.) MUST be its own bullet point on a NEW LINE. Format: '- **Feature**: Description'. DO NOT merge items or use dashes within a single line to separate features." },
  confusedTaxa: {
    type: Type.ARRAY,
    description: "An array of up to 5 (ideally 4 to 5) separate taxa commonly confused with this one. Provide 4-5 distinct, morphologically similar taxa, especially within the requested locality if provided.",
    items: confusedTaxonSchema,
  },
  ecology: { type: Type.STRING, description: "Habitat and ecological role (Markdown supported, use bolding sparingly for keywords)" },
  etymology: { type: Type.STRING, description: "Origin of the scientific name (Markdown supported, use bolding for roots)" },
  history: { type: Type.STRING, description: "Historical/pre-Linnaean context (Markdown supported, bold key figures)" },
  distribution: { type: Type.STRING, description: "Geographic range (Markdown supported, bold primary regions)" },
};

export const geminiService = {
  async analyzeSingleTaxon(name: string, locality?: string, useWebSearch: boolean = false): Promise<{ result: TaxonProfile; sources: any[] }> {
    return retryWithBackoff(async () => {
      const ai = getGenAI();
      const prompt = `Taxonomist mode. Analyze: "${name}"${locality ? ` within the locality/geographic context of "${locality}"` : ""}. 
Search for precise diagnostic morphology and verified classification.

STRICT STRUCTURAL RULES:
1. 'scientificName': ONLY the binomial or trinomial name (e.g., "Quercus robur"). Do not include the author, synonyms, or common names here.
2. 'quickRecap': Exactly 2-3 sentences. Focus on the most unique identifier.
3. 'diagnosticDescription': This MUST be a valid Markdown bulleted list restricted ONLY to purely morphological characteristics. 
   - Every Morphological character (Habit, Leaves, Flowers, Fruit, etc.) MUST start on its own line with a hyphen.
   - Use this exact format for every item: "- **Character**: Description text."
   - VERY IMPORTANT: This section MUST ONLY include morphological information. Other significant data (ecology, distribution, toxicity, field notes, etc.) MUST be pushed to their respective sections.
4. CASE SENSITIVITY: Use normal sentence case for feature names (e.g., **Leaves**, not **LEAVES**).
5. MINIMAL BOLDING: Only bold labels and 1-2 critical terms.
6. Provide concise context for new keys (hazards, conservationStatus, etc.).
7. 'includedTaxaCount' and 'localIncludedTaxaCount': Specify the global number of accepted included taxa, and if a locality is provided, the number within that locality.
8. 'confusedTaxa': Provide/recommend up to 5 (ideally 4 or 5) highly plausible similar or commonly confused taxa, listing distinct key differences.`;

      try {
        const response = await ai.models.generateContent({
          model: 'gemini-3.5-flash',
          contents: prompt,
          config: {
            temperature: 0.1,
            ...getThinkingConfig('gemini-3.5-flash', ThinkingLevel.MINIMAL),
            tools: useWebSearch ? [{ googleSearch: {} }] : undefined,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: taxonSchemaProperties,
              required: [
                'scientificName',
                'author',
                'commonName',
                'family',
                'classification',
                'includedTaxaCount',
                'localIncludedTaxaCount',
                'synonyms',
                'conservationStatus',
                'hazards',
                'fieldNotes',
                'seasonality',
                'humanRelevance',
                'quickRecap',
                'diagnosticDescription',
                'confusedTaxa',
                'ecology',
                'etymology',
                'history',
                'distribution',
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
  },

  async compareTaxa(names: string[], locality?: string, useWebSearch: boolean = false): Promise<{ result: ComparisonProfile; sources: any[] }> {
    return retryWithBackoff(async () => {
      const ai = getGenAI();
      const prompt = `Taxonomist mode. Compare: ${names.map((n) => `"${n}"`).join(', ')}${locality ? ` within the locality/geographic context of "${locality}"` : ""}.
Search for precise differences in recent literature.

STRICT STRUCTURAL RULES:
1. 'scientificName': ONLY the binomial or trinomial name (e.g., "Quercus robur"). Do not include the author, synonyms, or common names here.
2. 'quickRecap': Exactly 2-3 sentences. Focus on the most unique identifier.
3. 'diagnosticDescription': This MUST be a valid Markdown bulleted list restricted ONLY to purely morphological characteristics. 
   - Every Morphological character (Habit, Leaves, Flowers, Fruit, etc.) MUST start on its own line with a hyphen.
   - Use this exact format for every item: "- **Character**: Description text."
   - VERY IMPORTANT: This section MUST ONLY include morphological information. Other significant data (ecology, distribution, toxicity, field notes, etc.) MUST be pushed to their respective sections.
4. CASE SENSITIVITY: Use normal sentence case for feature names (e.g., **Leaves**, not **LEAVES**).
5. MINIMAL BOLDING: Only bold labels and 1-2 critical terms.
6. Provide concise context for new keys (hazards, conservationStatus, etc.).
7. 'includedTaxaCount' and 'localIncludedTaxaCount': Specify the global number of accepted included taxa for that taxon, and 'localIncludedTaxaCount' for the number within the locality if provided.`;

      try {
        const response = await ai.models.generateContent({
          model: 'gemini-3.5-flash',
          contents: prompt,
          config: {
            temperature: 0.1,
            ...getThinkingConfig('gemini-3.5-flash', ThinkingLevel.MINIMAL),
            tools: useWebSearch ? [{ googleSearch: {} }] : undefined,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                taxon1: {
                  type: Type.OBJECT,
                  properties: taxonSchemaProperties,
                  required: [
                    'scientificName',
                    'author',
                    'commonName',
                    'family',
                    'classification',
                    'includedTaxaCount',
                    'localIncludedTaxaCount',
                    'synonyms',
                    'conservationStatus',
                    'hazards',
                    'fieldNotes',
                    'seasonality',
                    'humanRelevance',
                    'quickRecap',
                    'diagnosticDescription',
                    'confusedTaxa',
                    'ecology',
                    'etymology',
                    'history',
                    'distribution',
                  ],
                },
                taxon2: {
                  type: Type.OBJECT,
                  properties: taxonSchemaProperties,
                  required: [
                    'scientificName',
                    'author',
                    'commonName',
                    'family',
                    'classification',
                    'includedTaxaCount',
                    'localIncludedTaxaCount',
                    'synonyms',
                    'conservationStatus',
                    'hazards',
                    'fieldNotes',
                    'seasonality',
                    'humanRelevance',
                    'quickRecap',
                    'diagnosticDescription',
                    'confusedTaxa',
                    'ecology',
                    'etymology',
                    'history',
                    'distribution',
                  ],
                },
                taxon3: {
                  type: Type.OBJECT,
                  properties: taxonSchemaProperties,
                  required: [
                    'scientificName',
                    'author',
                    'commonName',
                    'family',
                    'classification',
                    'includedTaxaCount',
                    'localIncludedTaxaCount',
                    'synonyms',
                    'conservationStatus',
                    'hazards',
                    'fieldNotes',
                    'seasonality',
                    'humanRelevance',
                    'quickRecap',
                    'diagnosticDescription',
                    'confusedTaxa',
                    'ecology',
                    'etymology',
                    'history',
                    'distribution',
                  ],
                },
                keyDifferences: {
                  type: Type.ARRAY,
                  description: "Key diagnostic differences between the taxa",
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      feature: { type: Type.STRING, description: "The morphological character being compared" },
                      taxon1State: { type: Type.STRING, description: "State in taxon 1 (Markdown supported, bold sparingly)" },
                      taxon2State: { type: Type.STRING, description: "State in taxon 2 (Markdown supported, bold sparingly)" },
                      taxon3State: { type: Type.STRING, description: "State in taxon 3 (Markdown supported, bold sparingly)" },
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
  },

  async identifySpecimen(
    characters: string[],
    notes: string,
    location: string,
    suspectedFamilies: string
  ): Promise<{ result: IdentifyResult; sources: any[] }> {
    return retryWithBackoff(async () => {
      const ai = getGenAI();
      try {
        const response = await ai.models.generateContent({
          model: 'gemini-3.5-flash',
          contents: `Identify the most likely plant family based on the following:
Characters: ${characters.join(', ')}
Notes: ${notes}
Location: ${location}
Suspected Families: ${suspectedFamilies}`,
          config: {
            temperature: 0.1,
            ...getThinkingConfig('gemini-3.5-flash', ThinkingLevel.MINIMAL),
            tools: [{ googleSearch: {} }],
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                analysisNotes: { type: Type.STRING },
                suggestedFamilies: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      name: { type: Type.STRING },
                      authority: { type: Type.STRING },
                      order: { type: Type.STRING },
                      commonName: { type: Type.STRING },
                      matchQuality: { type: Type.STRING },
                      matchingCharacters: { type: Type.NUMBER },
                      totalCharacters: { type: Type.NUMBER },
                      contradictingCharacters: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                      },
                      synapomorphies: { type: Type.STRING },
                      diagnosticCharacters: { type: Type.STRING },
                      fieldRecognitionTips: { type: Type.STRING },
                      spotCharacters: { type: Type.STRING },
                      charactersToVerifyNext: { type: Type.STRING },
                      possibleGenera: {
                        type: Type.ARRAY,
                        items: {
                          type: Type.OBJECT,
                          properties: {
                            name: { type: Type.STRING },
                            notes: { type: Type.STRING },
                          },
                        },
                      },
                      differentialDiagnosis: { type: Type.STRING },
                      regionalNotes: { type: Type.STRING },
                    },
                  },
                },
                additionalRecommendations: { type: Type.STRING },
                taxonomicNotes: { type: Type.STRING },
              },
              required: [
                'analysisNotes',
                'suggestedFamilies',
                'additionalRecommendations',
                'taxonomicNotes',
              ],
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
  },

  async suggestNextCharacters(
    selectedCharacters: string[],
    availableCharacters: string[]
  ): Promise<{ id: string; reasoning: string }[]> {
    return retryWithBackoff(async () => {
      const ai = getGenAI();
      try {
        const response = await ai.models.generateContent({
          model: 'gemini-3.5-flash',
          contents: `Given these selected characters: ${selectedCharacters.join(', ')}.
Suggest the top 3 most discriminating characters to try next from this list: ${availableCharacters.join(', ')}.`,
          config: {
            temperature: 0.1,
            ...getThinkingConfig('gemini-3.5-flash', ThinkingLevel.MINIMAL),
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  reasoning: { type: Type.STRING },
                },
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
  },

  async explainCharacter(characterLabel: string): Promise<string> {
    return retryWithBackoff(async () => {
      const ai = getGenAI();
      try {
        const response = await ai.models.generateContent({
          model: 'gemini-3.5-flash',
          contents: `Provide a concise botanical definition for the morphological character: "${characterLabel}".`,
          config: { 
            temperature: 0.1,
            ...getThinkingConfig('gemini-3.5-flash', ThinkingLevel.MINIMAL)
          },
        });
        return response.text || '';
      } catch (error) {
        console.error("Gemini API Error in explainCharacter:", error);
        throw new Error(cleanErrorMessage(error));
      }
    });
  },  async lookupAuthority(query: string, useWebSearch: boolean = false): Promise<{ result: AuthorProfile; sources: any[] }> {
    return retryWithBackoff(async () => {
      const ai = getGenAI();
      try {
        const response = await ai.models.generateContent({
          model: 'gemini-3.5-flash',
          contents: `Look up botanical taxonomic author: "${query}". Provide a rich biographical and bibliographic profile. 
          
CRITICAL INSTRUCTION TO PREVENT HALLUCINATIONS:
For the 'taxaDescribed' field, you MUST rigorously verify that the author is the original describing authority for the taxa you list. Do not guess or hallucinate taxa. Use the googleSearch tool to query reliable botanical databases (like IPNI, POWO, Tropicos, or Wikipedia) to confirm the author abbreviation matches the taxon's authority. If you cannot confidently verify a taxon was described by this author, DO NOT include it.`,
          config: {
            temperature: 0.1,
            ...getThinkingConfig('gemini-3.5-flash', ThinkingLevel.MINIMAL),
            tools: useWebSearch ? [{ googleSearch: {} }] : undefined,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                fullName: { type: Type.STRING },
                standardAbbreviation: { type: Type.STRING },
                lifespan: { type: Type.STRING },
                nationality: { type: Type.STRING },
                birthPlace: { type: Type.STRING },
                deathPlace: { type: Type.STRING },
                mainContribution: { type: Type.STRING },
                biography: { type: Type.STRING },
                historicalContext: { type: Type.STRING },
                almaMater: { type: Type.ARRAY, items: { type: Type.STRING } },
                institutions: { type: Type.ARRAY, items: { type: Type.STRING } },
                focusAreas: { type: Type.ARRAY, items: { type: Type.STRING } },
                awards: { type: Type.ARRAY, items: { type: Type.STRING } },
                fieldWorkRegions: { type: Type.ARRAY, items: { type: Type.STRING } },
                majorWorks: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      year: { type: Type.STRING },
                      title: { type: Type.STRING },
                    },
                  },
                },
                taxaDescribed: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      name: { type: Type.STRING },
                      rank: { type: Type.STRING },
                    },
                  },
                },
                eponymousTaxa: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      name: { type: Type.STRING },
                      rank: { type: Type.STRING },
                      reason: { type: Type.STRING },
                    },
                  },
                },
                herbariaCollections: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      abbreviation: { type: Type.STRING },
                      institution: { type: Type.STRING },
                    },
                  },
                },
                taxonomicNotes: { type: Type.STRING },
                notableMentors: { type: Type.ARRAY, items: { type: Type.STRING } },
                notableStudents: { type: Type.ARRAY, items: { type: Type.STRING } },
                relatedBotanists: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      name: { type: Type.STRING },
                      connection: { type: Type.STRING },
                    },
                  },
                },
              },
              required: [
                'fullName',
                'standardAbbreviation',
                'lifespan',
                'nationality',
                'mainContribution',
                'biography',
              ],
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
  },

  async generateLocalityProfile(
    locationInput: string
  ): Promise<{ result: LocalityProfile; sources: any[] }> {
    return retryWithBackoff(async () => {
      const ai = getGenAI();
      try {
        const response = await ai.models.generateContent({
          model: 'gemini-3.5-flash',
          contents: `
You are an expert field botanist, plant taxonomist, and biogeographer. Your task is to generate a highly accurate, scientifically rigorous "Locality Profile" based on a user-provided location name or GPS coordinates: "${locationInput}"

Your audience consists of professional botanists planning field expeditions or analyzing herbarium specimens. Use precise botanical, geological, and ecological terminology. 

If coordinates are provided, resolve them to the nearest meaningful geographic feature and region. If the location is extremely remote and lacks specific botanical literature, provide the profile based on the broader ecoregion, but explicitly state this limitation.

You MUST output your response strictly to the JSON schema.
`,
          config: {
            temperature: 0.1,
            ...getThinkingConfig('gemini-3.5-flash', ThinkingLevel.MINIMAL),
            tools: [{ googleSearch: {} }],
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                location_details: {
                  type: Type.OBJECT,
                  properties: {
                    resolved_name: { type: Type.STRING, description: "String (e.g., Barranca de Huentitán, Guadalajara, Jalisco, Mexico)" },
                    coordinates_dms: { type: Type.STRING, description: "String (e.g., 20°43'28\"N, 103°17'19\"W)" },
                    latitude: { type: Type.NUMBER, description: "Decimal latitude for maps" },
                    longitude: { type: Type.NUMBER, description: "Decimal longitude for maps" }
                  },
                  required: ["resolved_name", "coordinates_dms"]
                },
                habitat_and_landscape: {
                  type: Type.OBJECT,
                  properties: {
                    ecosystem_description: { type: Type.STRING, description: "String (Detailed description of the biome, topography, and hydrology)" },
                    climate: { type: Type.STRING, description: "String (Köppen climate classification and description of seasonality/rainfall)" },
                    soil_type: { type: Type.STRING, description: "String (Geological origin, soil orders e.g., lithosols, limestone karst)" },
                    elevation_range: { type: Type.STRING, description: "String (e.g., 1,000 m to 1,550 m above sea level)" },
                    ecoregion: { type: Type.STRING, description: "String (WWF Terrestrial Ecoregion or EPA Level III Ecosystem)" }
                  },
                  required: ["ecosystem_description", "climate", "soil_type", "elevation_range", "ecoregion"]
                },
                geography_and_history: {
                  type: Type.OBJECT,
                  properties: {
                    geographic_context: { type: Type.STRING, description: "String (Broader biogeographic region, e.g., Trans-Mexican Volcanic Belt)" },
                    historical_notes: { type: Type.STRING, description: "String (Famous botanical explorers who collected here, type locality info, or historical land use)" },
                    protected_status: { type: Type.STRING, description: "String (Is it a national park, reserve, or private land? Mention permit implications if known)" }
                  },
                  required: ["geographic_context", "historical_notes", "protected_status"]
                },
                phenology: {
                  type: Type.OBJECT,
                  properties: {
                    optimal_collecting_season: { type: Type.STRING, description: "String (When is the best time to observe flowering/fruiting for the dominant flora)" }
                  },
                  required: ["optimal_collecting_season"]
                },
                taxa: {
                  type: Type.OBJECT,
                  properties: {
                    dominant_species: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                      description: "Array of Strings (Use binomial nomenclature, e.g., 'Bursera fagaroides', not just 'Bursera')"
                    },
                    endemic_and_notable: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                      description: "Array of Strings (Species endemic to this specific region or of high conservation value)"
                    }
                  },
                  required: ["dominant_species", "endemic_and_notable"]
                },
                ecological_threats: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: "Array of Strings (Specific threats like invasive species names, urban sprawl, agriculture)"
                }
              },
              required: [
                "location_details",
                "habitat_and_landscape",
                "geography_and_history",
                "phenology",
                "taxa",
                "ecological_threats"
              ],
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
  },

  async generateQuizDistractors(correctTaxon: string): Promise<string[]> {
    return retryWithBackoff(async () => {
      const ai = getGenAI();
      const prompt = `You are a botany professor creating a multiple-choice plant ID quiz. 
      The correct answer is "${correctTaxon}". 
      Provide exactly 3 plausible, morphologically similar taxa (at the same taxonomic rank) that a student might confuse it with.
      Return ONLY a JSON array of 3 strings (scientific names).`;

      try {
        const response = await ai.models.generateContent({
          model: GEMINI_MODEL,
          contents: prompt,
          config: {
            temperature: 0.4,
            ...getThinkingConfig(GEMINI_MODEL, ThinkingLevel.MINIMAL),
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
  },

  async evaluateQuizAnswer(correctTaxon: string, guessedTaxon: string): Promise<string> {
    return retryWithBackoff(async () => {
      const ai = getGenAI();
      const prompt = `A student in a plant identification quiz was shown a photo of "${correctTaxon}". 
      They incorrectly guessed "${guessedTaxon}". 
      In 2-3 concise sentences, explain the key morphological differences they should look for next time to tell these two apart.`;

      try {
        const response = await ai.models.generateContent({
          model: GEMINI_MODEL,
          contents: prompt,
          config: { 
            temperature: 0.2,
            ...getThinkingConfig(GEMINI_MODEL, ThinkingLevel.MINIMAL)
          }
        });
        return response.text || '';
      } catch (error) {
        console.error("Gemini API Error in evaluateQuizAnswer:", error);
        throw new Error(cleanErrorMessage(error));
      }
    });
  },
};
