import {
  AuthorProfile,
  ComparisonProfile,
  IdentifyResult,
  TaxonProfile,
  LocalityProfile,
  GeneratedGuideStructured
} from '../types';

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

export const generateTaxonGuide = async (inputText: string): Promise<string> => {
  const data = await callApi<{ result: string }>('generateTaxonGuide', { inputText });
  return data.result;
};

export const generateStructuredTaxonGuide = async (
  taxon: string, 
  locality: string, 
  useSearch: boolean,
  filters?: string[]
): Promise<{ result: GeneratedGuideStructured; sources: any[] }> => {
  return callApi<{ result: GeneratedGuideStructured; sources: any[] }>('generateStructuredTaxonGuide', {
    taxon,
    locality,
    useSearch,
    filters
  });
};

export const geminiService = {
  async analyzeSingleTaxon(name: string, locality?: string, useWebSearch: boolean = false): Promise<{ result: TaxonProfile; sources: any[] }> {
    return callApi<{ result: TaxonProfile; sources: any[] }>('analyzeSingleTaxon', { name, locality, useWebSearch });
  },

  async compareTaxa(names: string[], locality?: string, useWebSearch: boolean = false): Promise<{ result: ComparisonProfile; sources: any[] }> {
    return callApi<{ result: ComparisonProfile; sources: any[] }>('compareTaxa', { names, locality, useWebSearch });
  },

  async identifySpecimen(
    characters: string[],
    notes: string,
    location: string,
    suspectedFamilies: string,
    useWebSearch: boolean = false
  ): Promise<{ result: IdentifyResult; sources: any[] }> {
    return callApi<{ result: IdentifyResult; sources: any[] }>('identifySpecimen', {
      characters,
      notes,
      location,
      suspectedFamilies,
      useWebSearch
    });
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

  async lookupAuthority(query: string, useWebSearch: boolean = false): Promise<{ result: AuthorProfile; sources: any[] }> {
    return callApi<{ result: AuthorProfile; sources: any[] }>('lookupAuthority', { query, useWebSearch });
  },

  async generateLocalityProfile(locationInput: string): Promise<{ result: LocalityProfile; sources: any[] }> {
    return callApi<{ result: LocalityProfile; sources: any[] }>('generateLocalityProfile', { locationInput });
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
