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
    name: { type: Type.STRING, description: "Name of confused taxon" },
    difference: { type: Type.STRING, description: "How to distinguish it (Markdown supported, use bolding only for critical keywords)" },
    keyFeature: { type: Type.STRING, description: "Specific feature to look at" },
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
  includedTaxaCount: { 
    type: Type.STRING, 
    description: "The accepted global count/estimate of subordinate taxa based on authoritative databases (POWO, WFO, CoL, APG IV, Index Fungorum, etc.). Format cleanly without parenthetical citations (e.g., 'ca. 160 species', 'ca. 90 genera and 1,800 species', '3 recognized subspecies', 'Monotypic'). Do NOT include database names or citations like '(POWO)'." 
  },
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
  recommendedLiterature: {
    type: Type.ARRAY,
    description: "An array of 2-5 authoritative, peer-reviewed identification resources, comprehensive Flora accounts (e.g. Flora of North America, Flora Europaea, Jepson eFlora, Flora of China, Flora Mesoamericana), taxonomic revisions, and monographs. Never fabricate citations. If a locality is specified, include the premier authoritative regional Flora treatment(s) for that location.",
    items: literatureItemSchema,
  },
};

export async function serverAnalyzeSingleTaxon(name: string, locality?: string, useWebSearch: boolean = false): Promise<{ result: TaxonProfile; sources: any[] }> {
  return retryWithBackoff(async () => {
    const ai = getGenAI();

    const prompt = `Taxonomist mode. Analyze: "${name}"${locality ? ` within the locality/geographic context of "${locality}"` : ""}. 
Search for precise diagnostic morphology, verified accepted taxon counts, and current classification.

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
7. 'includedTaxaCount' and 'localIncludedTaxaCount': 
   - Perform a grounded search against authoritative taxonomic databases (e.g., Plants of the World Online (POWO), World Flora Online (WFO), Catalogue of Life (CoL), APG IV, IPNI, Index Fungorum, WoRMS) to determine the accurate accepted subordinate taxon count for any rank (family, subfamily, tribe, genus, species, subspecies, etc.).
   - For intermediate ranks (such as subfamilies or tribes), provide the accepted count of subordinate genera and species.
   - For genera, provide the accepted species count. For species, state if monotypic or specify recognized infraspecific taxa.
   - IMPORTANT: Output clean numbers and descriptive counts WITHOUT parenthetical citations (e.g., "ca. 160 species", "ca. 25 genera and 450 species", "3 recognized subspecies", "Monotypic"). Do NOT append "(POWO)", "(GBIF)", or other database names.
   - For 'localIncludedTaxaCount': Specify the number within that locality if provided, or 'N/A'.
8. 'confusedTaxa': Provide/recommend up to 5 (ideally 4 or 5) highly plausible similar or commonly confused taxa, listing distinct key differences.
9. 'recommendedLiterature': List 2 to 5 highly authoritative, genuine, and established identification resources: standard comprehensive Flora accounts (e.g. Flora of North America, Jepson Manual/eFlora, Flora Europaea, Flora of China, Flora Mesoamericana, Flora Neotropica, Flora Malesiana), major peer-reviewed taxonomic revisions, and published monographs.
   - DO NOT fabricate, hallucinate, or guess citations. Strictly provide genuine, established literature.
   - If a locality context is specified, you MUST include the primary authoritative Flora accounts and regional revisions for that specific location (e.g., if California, include the Jepson eFlora / Jepson Manual; if UK, Stace's New Flora of the British Isles; if Florida, Wunderlin & Hansen; etc.).`;

    try {
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
        config: {
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

    const prompt = `Taxonomist mode. Compare: ${names.map((n) => `"${n}"`).join(', ')}${locality ? ` within the locality/geographic context of "${locality}"` : ""}.
Search for precise differences in recent literature and authoritative databases.

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
7. 'includedTaxaCount' and 'localIncludedTaxaCount': 
   - Perform a grounded search against authoritative taxonomic databases (e.g., Plants of the World Online (POWO), World Flora Online (WFO), Catalogue of Life (CoL), APG IV, IPNI, Index Fungorum, WoRMS) to determine accurate accepted subordinate taxon counts for each taxon across any rank.
   - For intermediate ranks (subfamilies, tribes), provide accepted subordinate genera and species counts.
   - Output clean counts WITHOUT parenthetical citations (e.g., "ca. 160 species", "ca. 25 genera and 450 species", "3 recognized subspecies", "Monotypic"). Do NOT append "(POWO)", "(GBIF)", or other database names.
   - For 'localIncludedTaxaCount': Specify the number within that locality if provided, or 'N/A'.`;

    try {
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
        config: {
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
                description: "Key diagnostic differences between the taxa",
                items: {
                  type: Type.OBJECT,
                  properties: {
                    feature: { type: Type.STRING },
                    taxon1State: { type: Type.STRING },
                    taxon2State: { type: Type.STRING },
                    taxon3State: { type: Type.STRING },
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
    try {
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: `Identify the most likely plant family based on the following:
Characters: ${characters.join(', ')}
Notes: ${notes}
Location: ${location}
Suspected Families: ${suspectedFamilies}`,
        config: {
          temperature: 0.1,
          ...getThinkingConfig(GEMINI_MODEL, ThinkingLevel.LOW),
          tools: useWebSearch ? [{ googleSearch: {} }] : undefined,
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
                    contradictingCharacters: { type: Type.ARRAY, items: { type: Type.STRING } },
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
        contents: `Given these selected characters: ${selectedCharacters.join(', ')}.
Suggest the top 3 most discriminating characters to try next from this list: ${availableCharacters.join(', ')}.`,
        config: {
          temperature: 0.1,
          ...getThinkingConfig(GEMINI_MODEL, ThinkingLevel.LOW),
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
}

export async function serverExplainCharacter(characterLabel: string): Promise<string> {
  return retryWithBackoff(async () => {
    const ai = getGenAI();
    try {
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: `Provide a concise botanical definition for the morphological character: "${characterLabel}".`,
        config: { 
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
        contents: `Look up botanical taxonomic author: "${query}". Provide an extremely rich, detailed, comprehensive, and highly substantial biography and bibliographic profile.

          For the 'mainContribution' field, provide a detailed, well-developed, and comprehensive introductory paragraph highlighting their core biological achievements, major breakthroughs, and absolute taxonomic legacy. Ensure it is long, meaty, and engaging.

          For the 'biography' field, provide a very rich, highly detailed, and extensive biography (multiple paragraphs in Markdown format, with headers where appropriate) detailing their early life, education, training, notable botanical expeditions, discoveries, scientific philosophy, and lasting impact on the field of botany. It should be long, detailed, and "beefy" when the information is available.

          For the 'historicalContext' field, provide a robust and detailed explanation of the botanical landscape during their era and how their work interacted with contemporaries.
        
CRITICAL INSTRUCTION TO PREVENT HALLUCINATIONS:
For the 'taxaDescribed' field, you MUST rigorously verify that the author is the original describing authority for the taxa you list. Do not guess or hallucinate taxa. Use the googleSearch tool to query reliable botanical databases (like IPNI, POWO, Tropicos, or Wikipedia) to confirm the author abbreviation matches the taxon's authority. If you cannot confidently verify a taxon was described by this author, DO NOT include it.`,
        config: {
          temperature: 0.1,
          ...getThinkingConfig(GEMINI_MODEL, ThinkingLevel.LOW),
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
                  properties: { year: { type: Type.STRING }, title: { type: Type.STRING } },
                },
              },
              taxaDescribed: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: { name: { type: Type.STRING }, rank: { type: Type.STRING } },
                },
              },
              eponymousTaxa: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: { name: { type: Type.STRING }, rank: { type: Type.STRING }, reason: { type: Type.STRING } },
                },
              },
              herbariaCollections: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: { abbreviation: { type: Type.STRING }, institution: { type: Type.STRING } },
                },
              },
              taxonomicNotes: { type: Type.STRING },
              notableMentors: { type: Type.ARRAY, items: { type: Type.STRING } },
              notableStudents: { type: Type.ARRAY, items: { type: Type.STRING } },
              relatedBotanists: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: { name: { type: Type.STRING }, connection: { type: Type.STRING } },
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
        contents: `You are an expert field botanist, plant taxonomist, and biogeographer. Generate a highly accurate Locality Profile for: "${locationInput}".
You MUST output your response strictly to the JSON schema.`,
        config: {
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
                  resolved_name: { type: Type.STRING },
                  coordinates_dms: { type: Type.STRING },
                  latitude: { type: Type.NUMBER },
                  longitude: { type: Type.NUMBER }
                },
                required: ["resolved_name", "coordinates_dms"]
              },
              habitat_and_landscape: {
                type: Type.OBJECT,
                properties: {
                  ecosystem_description: { type: Type.STRING },
                  climate: { type: Type.STRING },
                  soil_type: { type: Type.STRING },
                  elevation_range: { type: Type.STRING },
                  ecoregion: { type: Type.STRING }
                },
                required: ["ecosystem_description", "climate", "soil_type", "elevation_range", "ecoregion"]
              },
              geography_and_history: {
                type: Type.OBJECT,
                properties: {
                  geographic_context: { type: Type.STRING },
                  historical_notes: { type: Type.STRING },
                  protected_status: { type: Type.STRING }
                },
                required: ["geographic_context", "historical_notes", "protected_status"]
              },
              phenology: {
                type: Type.OBJECT,
                properties: {
                  optimal_collecting_season: { type: Type.STRING }
                },
                required: ["optimal_collecting_season"]
              },
              taxa: {
                type: Type.OBJECT,
                properties: {
                  dominant_species: { type: Type.ARRAY, items: { type: Type.STRING } },
                  endemic_and_notable: { type: Type.ARRAY, items: { type: Type.STRING } }
                },
                required: ["dominant_species", "endemic_and_notable"]
              },
              ecological_threats: { type: Type.ARRAY, items: { type: Type.STRING } }
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
    const prompt = `A user in a plant identification quiz was shown a photo of "${correctTaxon}". 
They incorrectly guessed "${guessedTaxon}". 
In 2-3 concise sentences, explain the key morphological differences to tell these two apart. Address the user directly (e.g., "You can distinguish these by..."). Do NOT report on "the user" or "the student".`;

    try {
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
        config: { 
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
        promptConfig = `\n\nCRITICAL CONSTRAINTS - ACTIVE FILTERS APPLIED:
${filters.map((f, i) => `${i + 1}. ${f}`).join('\n')}`;
      }

      const prompt = `You are an expert plant taxonomist and botanical author. Your task is to generate a highly accurate, region-specific identification guide and dichotomous key based on a provided Taxon ("${taxon}") and Locality ("${locality}").${promptConfig}

RECOMMENDED LITERATURE INSTRUCTIONS:
- Include 2 to 5 highly authoritative, genuine, and established regional identification literature resources (such as the standard regional Flora accounts, regional taxonomic revisions, and published monographs or dichotomous keys specifically covering "${taxon}" in "${locality}").
- Strictly provide authentic, real citations. NEVER fabricate or make up citations.`;

      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
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
                  target_taxon: { type: Type.STRING },
                  target_locality: { type: Type.STRING },
                  verification_summary: { type: Type.STRING }
                },
                required: ["target_taxon", "target_locality", "verification_summary"]
              },
              taxon_overview: { type: Type.STRING },
              species_profiles: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    scientific_name: { type: Type.STRING },
                    common_name: { type: Type.STRING, nullable: true },
                    habitat_and_ecology: { type: Type.STRING },
                    key_diagnostics: { type: Type.STRING }
                  },
                  required: ["scientific_name", "habitat_and_ecology", "key_diagnostics"]
                }
              },
              dichotomous_key: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    couplet_id: { type: Type.STRING },
                    lead_a: {
                      type: Type.OBJECT,
                      properties: { statement: { type: Type.STRING }, destination: { type: Type.STRING } },
                      required: ["statement", "destination"]
                    },
                    lead_b: {
                      type: Type.OBJECT,
                      properties: { statement: { type: Type.STRING }, destination: { type: Type.STRING } },
                      required: ["statement", "destination"]
                    }
                  },
                  required: ["couplet_id", "lead_a", "lead_b"]
                }
              },
              field_documentation_guide: { type: Type.ARRAY, items: { type: Type.STRING } },
              recommended_literature: {
                type: Type.ARRAY,
                description: "Array of 2-5 authoritative identification resources, premier regional Flora accounts, taxonomic monographs, and published keys covering the target taxon in the specified region.",
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
