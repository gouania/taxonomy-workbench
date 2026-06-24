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
    return "Gemini API Quota Exhausted: You have temporarily hit the platform rate limits or reached your project's monthly billing cap. Please wait a moment before trying again, or check your Google Cloud Billing settings.";
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

export const generateStructuredTaxonGuide = async (
  taxon: string, 
  locality: string, 
  useSearch: boolean,
  filters?: string[]
): Promise<{ result: GeneratedGuideStructured; sources: any[] }> => {
  return retryWithBackoff(async () => {
    const ai = getGenAI();
    try {
      let promptConfig = '';
      if (filters && filters.length > 0) {
        promptConfig = `\n\nCRITICAL CONSTRAINTS - ACTIVE FILTERS APPLIED:
The user has requested the following criteria/filters to be applied to this identification guide:
${filters.map((f, i) => `${i + 1}. ${f}`).join('\n')}

Based on these filters, you MUST:
- Tailor the dichotomous key, species profiles, and taxon overview to strictly adhere to these specific guidelines/constraints. For example:
  - If a 'Vegetative characters only' constraint is specified, do NOT rely on flowers, petals, fruits, or seeds in any part of the dichotomous key or core diagnostic profiles (rely only on leaf morphology, stem characters, bark, habit, etc.).
  - If 'Focus on flowering specimens' or 'Focus on fruiting/seeding specimens' is specified, make sure the descriptions and keys heavily utilize and focus on those structures.
  - If a group constraint (like 'Woody subset only' or 'Herbaceous subset only') is specified, filter the species selection and key morphological characteristics to focus on that exact subset.`;
      }

      const prompt = `You are an expert plant taxonomist and botanical author. Your task is to generate a highly accurate, region-specific identification guide and dichotomous key based on a provided Taxon and Locality.

CRITICAL INSTRUCTION - USE SEARCH GROUNDING:
Before generating the guide, you MUST use your search capabilities to query authoritative botanical databases, regional floras, and checklists (e.g., GBIF, SEINet, Flora of North America, local university herbaria) to determine which species of the requested ${taxon} are documented to occur natively or are naturalized in the requested ${locality}.

Once you have established the verified regional species list, generate the guide following these rules:

SPECIES-LEVEL DETECTOR & COMPARISON RULE:
If the requested taxon "${taxon}" is a specific species (i.e., a scientific binomial name with genus and specific epithet, like "Leucaena leucocephala" or "Quercus robur") rather than a genus, family, or higher taxonomic group:
- You MUST NOT generate a dichotomous key consisting only of this single species, nor should you list the same species multiple times. A dichotomous key requires multiple distinct comparative options to function.
- Instead, you MUST identify the target species "${taxon}" alongside 5-11 of its most common regional lookalikes, closest phylogenetic relatives, or standard co-occurring species under the same genus or family that are easily confused with it in "${locality}". For example, for "Leucaena leucocephala" in Doha, compare it to common regional mimics or related legumes such as "Prosopis juliflora", "Acacia" species, etc.
- Your final selection of 6-12 species in the guide must contain the target species itself, plus these 5-11 companion lookalikes, so that the resulting dichotomous key is a functional tool specifically designed to distinguish the target species from its regional lookalikes.

GENERAL RULES:
1. Limit your search and final selection to the top 6-12 most common, standard, key, or representative local species in that region. If there are fewer than 6 species present, include all of them. This ensures the guide is highly comprehensive and functional, without omitting key taxa, while remaining structured and practical.
2. Provide a brief overview of the taxon's ecological role or general characteristics in the specified locality. This overview should be written in a less formal and stuffy tone: aim for a perfect balance of scientific accuracy while maintaining a natural, fluent, and highly compelling writing style that engages the reader. It must also include a clear, functional summary of identification-related aspects: specifically highlighting the total number of documented species/taxa of this group in this region, and then explicitly clarifying that this guide selectively details and key-groups the 6-12 most common, dominant, or representative species there (which are detailed in the key and profiles below) to remain highly comprehensive, functional, and practical in the field. Identify which of these detailed species are most commonly or easily confused with each other, and highlight standout taxa.
3. Create a strictly dichotomous key to identify only these selected 6-12 local species. Use contrasting, reliable morphological characters.
4. Provide brief diagnostic profiles for each of the selected species.
5. Create a combined, structured list of maximum 4 highly taxon-specific, precise recommendations for field documentation to maximize the odds of high-accuracy identification. Group and order the list logically to focus: first on what to photograph (crucial macro/micro diagnostic characteristics), second on what to collect if a physical specimen is necessary, and third on written field notes (exudates, scents, bark texture, canopy height, association/hosts, daily opening times, etc.). Each item MUST be written as and start with a complete, grammatically correct sentence using an active verb (e.g., 'Photograph the flower face-on to count...' or 'Record written notes on...'). Do NOT include redundant labels like "PHOTOGRAPH:" or "COLLECT:" or "FIELD NOTES:" at the beginning of each item; simply start the complete sentence directly.${promptConfig}

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
              taxon_overview: { type: Type.STRING, description: "1-2 paragraphs describing the genus/family characteristics within this locality in a compelling, natural, and fluent style (avoiding stiff, formal formatting) while remaining perfectly scientifically accurate. It MUST summarize key identification-related aspects, specifically stating the total regional species count (e.g. 15-20 species) and explaining that this guide details and key-groups the 6-12 most common or representative species to remain highly functional and practical, identifying easily confused pairs in this subset, and highlighting standout taxa." },
              species_profiles: {
                type: Type.ARRAY,
                description: "An array of 6-12 species profiles (up to 12 target/co-occurring species to ensure comprehensive coverage). Each profile represents a validated local species.",
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
              field_documentation_guide: {
                type: Type.ARRAY,
                description: "A combined structured list of at most 4 highly precise, taxon-specific field documentation guidelines. Group and order the list: 1) What to photograph (essential structures & details), 2) What to collect (e.g. vouchers, twigs, cones), and 3) Written/qualitative observations (odors, textures, host associations, heights, sap, etc.). Each item MUST start with and be written as a complete grammatically correct sentence using an active verb (e.g., 'Photograph the stem and nodes to detect creeping stolons...' or 'Record details of the growth habit...'). Do NOT use prefix labels like 'PHOTOGRAPH:' or 'COLLECT:' as the UI handles it asymptotically.",
                items: { type: Type.STRING }
              }
            },
            required: ["guide_metadata", "taxon_overview", "species_profiles", "dichotomous_key", "field_documentation_guide"]
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
          contents: `Look up botanical taxonomic author: "${query}". Provide an extremely rich, detailed, comprehensive, and highly substantial biography and bibliographic profile.

            For the 'mainContribution' field, provide a detailed, well-developed, and comprehensive introductory paragraph highlighting their core biological achievements, major breakthroughs, and absolute taxonomic legacy. Ensure it is long, meaty, and engaging.

            For the 'biography' field, provide a very rich, highly detailed, and extensive biography (multiple paragraphs in Markdown format, with headers where appropriate) detailing their early life, education, training, notable botanical expeditions, discoveries, scientific philosophy, and lasting impact on the field of botany. It should be long, detailed, and "beefy" when the information is available.

            For the 'historicalContext' field, provide a robust and detailed explanation of the botanical landscape during their era and how their work interacted with contemporaries.
          
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
      Provide exactly 3 plausible, morphologically similar taxa (at the same taxonomic rank) that someone might confuse it with.
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
      const prompt = `A user in a plant identification quiz was shown a photo of "${correctTaxon}". 
      They incorrectly guessed "${guessedTaxon}". 
      In 2-3 concise sentences, explain the key morphological differences to tell these two apart. Address the user directly (e.g., "You can distinguish these by..."). Do NOT report on "the user" or "the student".`;

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
