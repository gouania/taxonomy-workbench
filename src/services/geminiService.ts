import {
  AuthorProfile,
  ComparisonProfile,
  FollowUpObservation,
  IdentifyResult,
  TaxonProfile,
  LocalityProfile,
  GeneratedGuideStructured,
  GuideSubsetComparison,
  GroundingSource,
  SourceProvenance
} from '../types';
import {
  validateStructuredGuide,
  validateSubsetComparison,
  validateLocalityProfile,
  validateIdentifyResult,
  buildSourceProvenance,
} from '../utils/guideValidation';

async function callApi<T>(action: string, payload: any): Promise<T> {
  const res = await fetch('/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `Error processing request: ${action}`);
  }
  return data as T;
}

export const generateTaxonGuide = async (
  inputText: string,
  useSearch: boolean = true
): Promise<{ result: string; sources: GroundingSource[]; provenance: SourceProvenance }> => {
  const data = await callApi<{ result: string; sources?: GroundingSource[]; provenance?: SourceProvenance }>(
    'generateTaxonGuide',
    { inputText, useSearch }
  );
  if (typeof data?.result !== 'string' || !data.result.trim()) {
    throw new Error('Malformed guide response: custom guide output was empty.');
  }
  const sources = Array.isArray(data.sources) ? data.sources : [];
  return {
    result: data.result,
    sources,
    provenance: data.provenance || buildSourceProvenance(useSearch, sources, 'custom_guide'),
  };
};

export const generateStructuredTaxonGuide = async (
  taxon: string, 
  locality: string, 
  useSearch: boolean = true,
  filters?: string[],
  coverageScope: 'comprehensive' | 'curated' | 'groups' = 'comprehensive'
): Promise<{ result: GeneratedGuideStructured; sources: GroundingSource[] }> => {
  const data = await callApi<{ result: unknown; sources?: GroundingSource[] }>('generateStructuredTaxonGuide', {
    taxon,
    locality,
    useSearch,
    filters,
    coverageScope
  });
  const validated = validateStructuredGuide(data?.result);
  const sources = Array.isArray(data?.sources) ? data.sources : [];
  const rawResult = data?.result as Partial<GeneratedGuideStructured> | undefined;
  validated.provenance = rawResult?.provenance || buildSourceProvenance(useSearch, sources, 'guide');
  return { result: validated, sources };
};

export const compareGuideTaxa = async (
  taxa: { scientific_name: string; common_name?: string | null; key_diagnostics?: string; habitat_and_ecology?: string }[],
  locality: string,
  activeFilters: string[] = [],
  useSearch: boolean = true
): Promise<{ result: GuideSubsetComparison; sources: GroundingSource[] }> => {
  const data = await callApi<{ result: unknown; sources?: GroundingSource[] }>('compareGuideTaxa', {
    taxa,
    locality,
    activeFilters,
    useSearch,
  });
  const validated = validateSubsetComparison(data?.result);
  const sources = Array.isArray(data?.sources) ? data.sources : [];
  const rawResult = data?.result as Partial<GuideSubsetComparison> | undefined;
  validated.provenance = rawResult?.provenance || buildSourceProvenance(useSearch, sources, 'subset_comparison');
  return { result: validated, sources };
};

export const geminiService = {
  async analyzeSingleTaxon(name: string, locality?: string, useWebSearch: boolean = true): Promise<{ result: TaxonProfile; sources: any[] }> {
    return callApi<{ result: TaxonProfile; sources: any[] }>('analyzeSingleTaxon', { name, locality, useWebSearch });
  },

  async compareTaxa(names: string[], locality?: string, useWebSearch: boolean = true): Promise<{ result: ComparisonProfile; sources: any[] }> {
    return callApi<{ result: ComparisonProfile; sources: any[] }>('compareTaxa', { names, locality, useWebSearch });
  },

  async identifySpecimen(
    characters: string[],
    notes: string,
    location: string,
    suspectedFamilies: string,
    useWebSearch: boolean = true,
    followupObservations: FollowUpObservation[] = []
  ): Promise<{ result: IdentifyResult; sources: GroundingSource[] }> {
    const data = await callApi<{ result: unknown; sources?: GroundingSource[] }>('identifySpecimen', {
      characters,
      notes,
      location,
      suspectedFamilies,
      useWebSearch,
      followupObservations,
    });
    const validated = validateIdentifyResult(data?.result);
    const sources = Array.isArray(data?.sources) ? data.sources : [];
    const rawResult = data?.result as Partial<IdentifyResult> | undefined;
    validated.provenance = rawResult?.provenance || buildSourceProvenance(useWebSearch, sources, 'identify');
    return { result: validated, sources };
  },

  async suggestNextCharacters(
    selectedCharacters: string[],
    availableCharacters: string[]
  ): Promise<{ id: string; reasoning: string }[]> {
    return callApi<{ id: string; reasoning: string }[]>('suggestNextCharacters', {
      selectedCharacters,
      availableCharacters
    });
  },

  async explainCharacter(characterLabel: string): Promise<string> {
    const data = await callApi<{ result: string }>('explainCharacter', { characterLabel });
    return data.result;
  },

  async lookupAuthority(query: string, useWebSearch: boolean = true): Promise<{ result: AuthorProfile; sources: any[] }> {
    return callApi<{ result: AuthorProfile; sources: any[] }>('lookupAuthority', { query, useWebSearch });
  },

  async generateLocalityProfile(locationInput: string): Promise<{ result: LocalityProfile; sources: GroundingSource[] }> {
    const data = await callApi<{ result: unknown; sources?: GroundingSource[] }>('generateLocalityProfile', { locationInput });
    const validated = validateLocalityProfile(data?.result);
    const sources = Array.isArray(data?.sources) ? data.sources : [];
    const rawResult = data?.result as Partial<LocalityProfile> | undefined;
    validated.provenance = rawResult?.provenance || buildSourceProvenance(true, sources, 'locality');
    return { result: validated, sources };
  },

  async generateQuizDistractors(correctTaxon: string): Promise<string[]> {
    const data = await callApi<{ result: string[] }>('generateQuizDistractors', { correctTaxon });
    return data.result;
  },

  async evaluateQuizAnswer(correctTaxon: string, guessedTaxon: string): Promise<string> {
    const data = await callApi<{ result: string }>('evaluateQuizAnswer', { correctTaxon, guessedTaxon });
    return data.result;
  },
};
