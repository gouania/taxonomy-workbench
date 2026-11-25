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

let pendingConfigSync: Promise<string | null> | null = null;

export async function syncRuntimeCacheNamespace(signal?: AbortSignal): Promise<string | null> {
  if (cacheService.isNamespaceVerified()) {
    return cacheService.getRuntimeNamespace();
  }
  if (!pendingConfigSync) {
    pendingConfigSync = (async () => {
      try {
        const res = await fetch('/api/config', {
          method: 'GET',
          cache: 'no-store',
        });
        if (!res.ok) return null;
        const data = await res.json();
        if (typeof data?.cacheNamespace === 'string' && data.cacheNamespace.trim()) {
          const ns = data.cacheNamespace.trim();
          cacheService.setRuntimeNamespace(ns);
          return ns;
        }
        return null;
      } catch {
        // Leave namespace unverified on failure so stale cached AI responses are not served
        return null;
      } finally {
        pendingConfigSync = null;
      }
    })();
  }

  if (!signal) {
    return pendingConfigSync;
  }

  if (signal.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  return new Promise<string | null>((resolve, reject) => {
    const onAbort = () => reject(new DOMException('Aborted', 'AbortError'));
    signal.addEventListener('abort', onAbort, { once: true });
    pendingConfigSync!.then(
      (ns) => {
        signal.removeEventListener('abort', onAbort);
        resolve(ns);
      },
      (err) => {
        signal.removeEventListener('abort', onAbort);
        reject(err);
      }
    );
  });
}

export function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const anyErr = err as { name?: string; message?: string };
  return (
    anyErr.name === 'AbortError' ||
    (typeof anyErr.message === 'string' && /aborted|abort/i.test(anyErr.message))
  );
}

async function callApiWithMeta<T>(
  action: string,
  payload: any,
  signal?: AbortSignal
): Promise<{ data: T; cacheNamespace?: string }> {
  const res = await fetch('/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload }),
    signal,
  });

  const rawHeader = res.headers?.get?.('X-Taxonomy-Cache-Namespace');
  const responseNamespace = rawHeader && rawHeader.trim() ? rawHeader.trim() : undefined;
  if (responseNamespace) {
    cacheService.setRuntimeNamespace(responseNamespace);
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
  return { data: data as T, cacheNamespace: responseNamespace };
}

async function callApi<T>(action: string, payload: any, signal?: AbortSignal): Promise<T> {
  const { data } = await callApiWithMeta<T>(action, payload, signal);
  return data;
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
  ): Promise<{ result: TaxonProfile; sources: any[]; cacheNamespace?: string }> {
    const { data, cacheNamespace } = await callApiWithMeta<{ result: TaxonProfile; sources: any[] }>(
      'analyzeSingleTaxon',
      { name, locality, useWebSearch },
      signal
    );
    return { ...data, cacheNamespace };
  },

  async compareTaxa(
    names: string[],
    locality?: string,
    useWebSearch: boolean = true,
    signal?: AbortSignal
  ): Promise<{ result: ComparisonProfile; sources: any[]; cacheNamespace?: string }> {
    const { data, cacheNamespace } = await callApiWithMeta<{ result: ComparisonProfile; sources: any[] }>(
      'compareTaxa',
      { names, locality, useWebSearch },
      signal
    );
    return { ...data, cacheNamespace };
  },

  async identifySpecimen(
    characters: string[],
    notes: string,
    location: string,
    suspectedFamilies: string,
    useWebSearch: boolean = true,
    followupObservations: FollowUpObservation[] = [],
    signal?: AbortSignal
  ): Promise<{ result: IdentifyResult; sources: GroundingSource[]; cacheNamespace?: string }> {
    const { data, cacheNamespace } = await callApiWithMeta<{ result: unknown; sources?: GroundingSource[] }>(
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
    return { result: validated, sources, cacheNamespace };
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
  ): Promise<{ result: AuthorProfile; sources: any[]; cacheNamespace?: string }> {
    const { data, cacheNamespace } = await callApiWithMeta<{ result: AuthorProfile; sources: any[] }>(
      'lookupAuthority',
      { query, useWebSearch },
      signal
    );
    return { ...data, cacheNamespace };
  },

  async generateLocalityProfile(
    locationInput: string,
    signal?: AbortSignal
  ): Promise<{ result: LocalityProfile; sources: GroundingSource[]; cacheNamespace?: string }> {
    const { data, cacheNamespace } = await callApiWithMeta<{ result: unknown; sources?: GroundingSource[] }>(
      'generateLocalityProfile',
      { locationInput },
      signal
    );
    const validated = validateLocalityProfile(data?.result);
    const sources = Array.isArray(data?.sources) ? data.sources : [];
    const rawResult = data?.result as Partial<LocalityProfile> | undefined;
    validated.provenance = rawResult?.provenance || buildSourceProvenance(true, sources, 'locality');
    return { result: validated, sources, cacheNamespace };
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
