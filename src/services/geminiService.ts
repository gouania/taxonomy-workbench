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
  SourceProvenance,
  SpecimenRecord,
  TaxonConceptHandoff,
} from '../types';
import {
  validateStructuredGuide,
  validateSubsetComparison,
  validateLocalityProfile,
  validateIdentifyResult,
  buildSourceProvenance,
} from '../utils/guideValidation';
import { cacheService } from './cacheService';

export async function syncRuntimeCacheNamespace(signal?: AbortSignal): Promise<string> {
  try {
    const res = await fetch('/api/config', {
      method: 'GET',
      cache: 'no-store',
      signal,
    });
    if (res.ok) {
      const data = await res.json();
      if (typeof data?.cacheNamespace === 'string' && data.cacheNamespace.trim()) {
        cacheService.setRuntimeNamespace(data.cacheNamespace);
      }
    }
  } catch {
    // Non-fatal: fall back to compiled default cache namespace if offline or unreachable
  }
  return cacheService.getRuntimeNamespace();
}

export function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const anyErr = err as { name?: string; message?: string };
  return (
    anyErr.name === 'AbortError' ||
    (typeof anyErr.message === 'string' && /aborted|abort/i.test(anyErr.message))
  );
}

async function callApi<T>(action: string, payload: any, signal?: AbortSignal): Promise<T> {
  const res = await fetch('/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload }),
    signal,
  });

  const serverNamespace = res.headers?.get?.('X-Taxonomy-Cache-Namespace');
  if (serverNamespace && serverNamespace.trim()) {
    cacheService.setRuntimeNamespace(serverNamespace);
  }

  const rawText = await res.text();
  let data: any = null;
  if (rawText) {
    try {
      data = JSON.parse(rawText);
    } catch {
      if (!res.ok) {
        throw new Error(
          `Request failed (HTTP ${res.status}). The server returned an unreadable response — please try again.`
        );
      }
      throw new Error(`Received a malformed response for ${action}. Please try again.`);
    }
  }

  if (!res.ok) {
    throw new Error(data?.error || `Error processing request (${res.status}): ${action}`);
  }
  return data as T;
}

export const generateTaxonGuide = async (
  inputText: string,
  useSearch: boolean = true,
  signal?: AbortSignal
): Promise<{ result: string; sources: GroundingSource[]; provenance: SourceProvenance }> => {
  const data = await callApi<{ result: string; sources?: GroundingSource[]; provenance?: SourceProvenance }>(
    'generateTaxonGuide',
    { inputText, useSearch },
    signal
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
  coverageScope: 'comprehensive' | 'curated' | 'groups' = 'comprehensive',
  specimenRecord?: SpecimenRecord,
  taxonConcept?: TaxonConceptHandoff,
  signal?: AbortSignal
): Promise<{ result: GeneratedGuideStructured; sources: GroundingSource[] }> => {
  const data = await callApi<{ result: unknown; sources?: GroundingSource[] }>(
    'generateStructuredTaxonGuide',
    {
      taxon,
      locality,
      useSearch,
      filters,
      coverageScope,
      ...(specimenRecord ? { specimenRecord } : {}),
      ...(taxonConcept ? { taxonConcept } : {}),
    },
    signal
  );
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
  useSearch: boolean = true,
  specimenRecord?: SpecimenRecord,
  signal?: AbortSignal
): Promise<{ result: GuideSubsetComparison; sources: GroundingSource[] }> => {
  const data = await callApi<{ result: unknown; sources?: GroundingSource[] }>(
    'compareGuideTaxa',
    {
      taxa,
      locality,
      activeFilters,
      useSearch,
      ...(specimenRecord ? { specimenRecord } : {}),
    },
    signal
  );
  const validated = validateSubsetComparison(data?.result);
  const sources = Array.isArray(data?.sources) ? data.sources : [];
  const rawResult = data?.result as Partial<GuideSubsetComparison> | undefined;
  validated.provenance = rawResult?.provenance || buildSourceProvenance(useSearch, sources, 'subset_comparison');
  return { result: validated, sources };
};

export const geminiService = {
  async analyzeSingleTaxon(
    name: string,
    locality?: string,
    useWebSearch: boolean = true,
    signal?: AbortSignal
  ): Promise<{ result: TaxonProfile; sources: any[] }> {
    return callApi<{ result: TaxonProfile; sources: any[] }>(
      'analyzeSingleTaxon',
      { name, locality, useWebSearch },
      signal
    );
  },

  async compareTaxa(
    names: string[],
    locality?: string,
    useWebSearch: boolean = true,
    signal?: AbortSignal
  ): Promise<{ result: ComparisonProfile; sources: any[] }> {
    return callApi<{ result: ComparisonProfile; sources: any[] }>(
      'compareTaxa',
      { names, locality, useWebSearch },
      signal
    );
  },

  async identifySpecimen(
    characters: string[],
    notes: string,
    location: string,
    suspectedFamilies: string,
    useWebSearch: boolean = true,
    followupObservations: FollowUpObservation[] = [],
    signal?: AbortSignal
  ): Promise<{ result: IdentifyResult; sources: GroundingSource[] }> {
    const data = await callApi<{ result: unknown; sources?: GroundingSource[] }>(
      'identifySpecimen',
      {
        characters,
        notes,
        location,
        suspectedFamilies,
        useWebSearch,
        followupObservations,
      },
      signal
    );
    const validated = validateIdentifyResult(data?.result);
    const sources = Array.isArray(data?.sources) ? data.sources : [];
    const rawResult = data?.result as Partial<IdentifyResult> | undefined;
    validated.provenance = rawResult?.provenance || buildSourceProvenance(useWebSearch, sources, 'identify');
    return { result: validated, sources };
  },

  async suggestNextCharacters(
    selectedCharacters: string[],
    availableCharacters: string[],
    signal?: AbortSignal
  ): Promise<{ id: string; reasoning: string }[]> {
    return callApi<{ id: string; reasoning: string }[]>(
      'suggestNextCharacters',
      {
        selectedCharacters,
        availableCharacters,
      },
      signal
    );
  },

  async explainCharacter(characterLabel: string, signal?: AbortSignal): Promise<string> {
    const data = await callApi<{ result: string }>('explainCharacter', { characterLabel }, signal);
    return data.result;
  },

  async lookupAuthority(
    query: string,
    useWebSearch: boolean = true,
    signal?: AbortSignal
  ): Promise<{ result: AuthorProfile; sources: any[] }> {
    return callApi<{ result: AuthorProfile; sources: any[] }>(
      'lookupAuthority',
      { query, useWebSearch },
      signal
    );
  },

  async generateLocalityProfile(
    locationInput: string,
    signal?: AbortSignal
  ): Promise<{ result: LocalityProfile; sources: GroundingSource[] }> {
    const data = await callApi<{ result: unknown; sources?: GroundingSource[] }>(
      'generateLocalityProfile',
      { locationInput },
      signal
    );
    const validated = validateLocalityProfile(data?.result);
    const sources = Array.isArray(data?.sources) ? data.sources : [];
    const rawResult = data?.result as Partial<LocalityProfile> | undefined;
    validated.provenance = rawResult?.provenance || buildSourceProvenance(true, sources, 'locality');
    return { result: validated, sources };
  },

  async generateQuizDistractors(correctTaxon: string, signal?: AbortSignal): Promise<string[]> {
    const data = await callApi<{ result: string[] }>('generateQuizDistractors', { correctTaxon }, signal);
    return data.result;
  },

  async evaluateQuizAnswer(correctTaxon: string, guessedTaxon: string, signal?: AbortSignal): Promise<string> {
    const data = await callApi<{ result: string }>(
      'evaluateQuizAnswer',
      { correctTaxon, guessedTaxon },
      signal
    );
    return data.result;
  },
};
