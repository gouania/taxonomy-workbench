import React, { useState, useEffect } from 'react';
import { AUTHOR_EXAMPLES } from '../../constants';
import { cacheService } from '../../services/cacheService';
import { geminiService } from '../../services/geminiService';
import { AuthorProfile as AuthorProfileType, NavigationTarget } from '../../types';
import { ErrorDisplay } from '../shared/ErrorDisplay';
import { SearchInput } from '../shared/SearchInput';
import { SkeletonLoader } from '../shared/SkeletonLoader';
import { AuthorProfile } from './AuthorProfile';
import { CommonAbbreviations } from './CommonAbbreviations';

interface AuthoritiesModuleProps {
  initialQuery?: string;
  onNavigate: (target: NavigationTarget) => void;
}

export function AuthoritiesModule({ initialQuery = '', onNavigate }: AuthoritiesModuleProps) {
  const [query, setQuery] = useState(initialQuery);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ profile: AuthorProfileType; sources: any[] } | null>(null);

  useEffect(() => {
    if (initialQuery) {
      setQuery(initialQuery);
      handleSearch(initialQuery);
    }
  }, [initialQuery]);

  const handleSearch = async (searchQuery: string = query) => {
    if (!searchQuery.trim()) return;
    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const cacheKey = `authorities_${searchQuery.toLowerCase()}`;
      const cached = cacheService.get<{ profile: AuthorProfileType; sources: any[] }>(cacheKey);

      if (cached) {
        setResult(cached);
      } else {
        const { result: profile, sources } = await geminiService.lookupAuthority(searchQuery, true);
        setResult({ profile, sources });
        cacheService.set(cacheKey, { profile, sources });
      }
    } catch (err: any) {
      setError(err.message || 'Failed to lookup authority.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-in fade-in duration-500">
      <div className="mb-8 print:hidden">
        <h1 className="font-display text-3xl font-bold text-white mb-6">Taxonomic Authorities</h1>
        <SearchInput
          value={query}
          onChange={setQuery}
          onSubmit={() => handleSearch(query)}
          placeholder="Name or abbreviation (e.g., L., Hook.f.)..."
          isLoading={isLoading}
        />
        {!result && !isLoading && (
          <CommonAbbreviations
            examples={AUTHOR_EXAMPLES}
            onSelect={(ex) => {
              setQuery(ex);
              handleSearch(ex);
            }}
          />
        )}
      </div>

      {error && <ErrorDisplay message={error} className="mb-8" />}

      {isLoading && (
        <div className="space-y-6">
          <SkeletonLoader type="card" className="h-48" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <SkeletonLoader type="card" className="col-span-2 h-96" />
            <SkeletonLoader type="card" className="col-span-1 h-96" />
          </div>
        </div>
      )}

      {!isLoading && result && (
        <AuthorProfile
          profile={result.profile}
          sources={result.sources}
          onNavigate={onNavigate}
        />
      )}
    </div>
  );
}
