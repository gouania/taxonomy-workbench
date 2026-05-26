import { Search, Plus, X, Loader2, MapPin, Globe2 } from 'lucide-react';
import React, { useState, useEffect } from 'react';
import { TAXON_EXAMPLES } from '../../constants';
import { cacheService } from '../../services/cacheService';
import { geminiService } from '../../services/geminiService';
import { ComparisonProfile, NavigationTarget, TaxonProfile } from '../../types';
import { ErrorDisplay } from '../shared/ErrorDisplay';
import { SkeletonLoader } from '../shared/SkeletonLoader';
import { ComparisonResult } from './ComparisonResult';
import { SingleResult } from './SingleResult';

interface ProfilesModuleProps {
  initialQuery?: string;
  initialMode?: 'single' | 'compare';
  onNavigate: (target: NavigationTarget) => void;
}

export function ProfilesModule({
  initialQuery = '',
  initialMode = 'single',
  onNavigate,
}: ProfilesModuleProps) {
  const [mode, setMode] = useState<'single' | 'compare'>(initialMode);
  const [singleQuery, setSingleQuery] = useState(initialQuery);
  const [compareQueries, setCompareQueries] = useState<string[]>(['', '']);
  const [locality, setLocality] = useState('');
  const [useWebSearch, setUseWebSearch] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [singleResult, setSingleResult] = useState<{
    profile: TaxonProfile;
    sources: any[];
  } | null>(null);
  const [compareResult, setCompareResult] = useState<{
    profile: ComparisonProfile;
    sources: any[];
  } | null>(null);

  useEffect(() => {
    if (initialQuery) {
      if (initialMode === 'single') {
        setLocality('');
        setSingleQuery(initialQuery);
        handleSingleSearch(initialQuery, true);
      } else {
        // Handle compare pre-fill if needed, though usually it's single
      }
    }
  }, [initialQuery, initialMode]);

  const handleSingleSearch = async (query: string, clearLoc: boolean = false) => {
    if (!query.trim()) return;
    setIsLoading(true);
    setError(null);
    setSingleResult(null);

    const activeLocality = clearLoc ? '' : locality;

    try {
      const cacheKey = `profiles_single_${query.toLowerCase()}_${activeLocality.toLowerCase()}_${useWebSearch}`;
      const cached = cacheService.get<{ profile: TaxonProfile; sources: any[] }>(cacheKey);

      if (cached) {
        setSingleResult(cached);
      } else {
        const { result, sources } = await geminiService.analyzeSingleTaxon(query, activeLocality || undefined, useWebSearch);
        setSingleResult({ profile: result, sources });
        cacheService.set(cacheKey, { profile: result, sources });
      }
    } catch (err: any) {
      setError(err.message || 'Failed to analyze taxon.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCompareSearch = async () => {
    const validQueries = compareQueries.filter((q) => q.trim());
    if (validQueries.length < 2) {
      setError('Please enter at least two taxa to compare.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setCompareResult(null);

    try {
      const cacheKey = `profiles_compare_${validQueries.map((q) => q.toLowerCase()).join('|')}_${locality.toLowerCase()}_${useWebSearch}`;
      const cached = cacheService.get<{ profile: ComparisonProfile; sources: any[] }>(cacheKey);

      if (cached) {
        setCompareResult(cached);
      } else {
        const { result, sources } = await geminiService.compareTaxa(validQueries, locality || undefined, useWebSearch);
        setCompareResult({ profile: result, sources });
        cacheService.set(cacheKey, { profile: result, sources });
      }
    } catch (err: any) {
      setError(err.message || 'Failed to compare taxa.');
    } finally {
      setIsLoading(false);
    }
  };

  const addCompareField = () => {
    if (compareQueries.length < 3) {
      setCompareQueries([...compareQueries, '']);
    }
  };

  const removeCompareField = (index: number) => {
    const newQueries = [...compareQueries];
    newQueries.splice(index, 1);
    setCompareQueries(newQueries);
  };

  const updateCompareField = (index: number, value: string) => {
    const newQueries = [...compareQueries];
    newQueries[index] = value;
    setCompareQueries(newQueries);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-in fade-in duration-500">
      <div className="mb-8 print:hidden">
        <div className="flex items-center justify-between mb-6">
          <h1 className="font-display text-3xl font-bold text-white">Explore Taxa</h1>
          <div className="flex bg-slate-800/50 p-1 rounded-xl border border-slate-700/50">
            <button
              onClick={() => setMode('single')}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                mode === 'single'
                  ? 'bg-cyan-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              Single Analysis
            </button>
            <button
              onClick={() => setMode('compare')}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                mode === 'compare'
                  ? 'bg-cyan-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              Compare Taxa
            </button>
          </div>
        </div>

        {mode === 'single' ? (
          <div className="space-y-4">
            <div className="relative flex items-center w-full">
              <div className="absolute left-4 text-slate-400">
                <Search size={20} />
              </div>
              <input
                type="text"
                value={singleQuery}
                onChange={(e) => setSingleQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSingleSearch(singleQuery)}
                placeholder="Enter taxon name (e.g., Quercus robur)..."
                className="w-full bg-slate-900/50 border border-slate-700/50 rounded-2xl py-4 pl-12 pr-28 text-white placeholder:text-slate-500 placeholder:truncate focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all font-sans text-lg shadow-inner"
                disabled={isLoading}
              />
              <div className="absolute right-3">
                <button
                  onClick={() => handleSingleSearch(singleQuery)}
                  disabled={!singleQuery.trim() || isLoading}
                  className="bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-1.5 rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isLoading ? <Loader2 size={18} className="animate-spin" /> : 'Analyze'}
                </button>
              </div>
            </div>
            
            <div className="relative flex items-center w-full">
               <div className="absolute left-4 text-slate-500">
                 <MapPin size={20} />
               </div>
               <input
                 type="text"
                 value={locality}
                 onChange={(e) => setLocality(e.target.value)}
                 onKeyDown={(e) => e.key === 'Enter' && handleSingleSearch(singleQuery)}
                 placeholder="Locality context (Optional, e.g., 'California', 'UK')"
                 className="w-full bg-slate-900/30 border border-slate-700/30 rounded-xl py-3 pl-12 pr-10 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 transition-all font-sans shadow-inner"
                 disabled={isLoading}
               />
               {locality && (
                 <button
                   onClick={() => setLocality('')}
                   className="absolute right-4 text-slate-400 hover:text-slate-200 transition-colors"
                 >
                   <X size={16} />
                 </button>
               )}
            </div>

            <label className="flex items-center gap-3 bg-slate-950/30 w-fit p-2 pr-4 rounded-xl border border-slate-800 cursor-pointer hover:bg-slate-800/30 transition-colors">
              <input
                type="checkbox"
                checked={useWebSearch}
                onChange={(e) => setUseWebSearch(e.target.checked)}
                disabled={isLoading}
                className="w-4 h-4 ml-2 rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-cyan-500/50 focus:ring-offset-0 disabled:opacity-50"
              />
              <div className="flex-1">
                <div className="text-sm font-medium text-slate-300 flex items-center gap-2">
                  <Globe2 size={14} className="text-cyan-400" />
                  Use Web Search Grounding
                </div>
              </div>
            </label>

            {!singleResult && !isLoading && (
              <div className="flex flex-wrap gap-2">
                <span className="text-sm text-slate-500 py-1">Examples:</span>
                {TAXON_EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    onClick={() => {
                      setSingleQuery(ex);
                      handleSingleSearch(ex);
                    }}
                    className="px-3 py-1 bg-slate-800/50 hover:bg-slate-700/50 text-slate-300 hover:text-cyan-400 rounded-full text-sm transition-colors border border-slate-700/50"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4 bg-slate-900/40 p-6 rounded-2xl border border-slate-800/50">
            {compareQueries.map((query, idx) => (
              <div key={idx} className="flex items-center gap-3">
                <input
                  type="text"
                  value={query}
                  onChange={(e) => updateCompareField(idx, e.target.value)}
                  placeholder={`Taxon ${idx + 1}...`}
                  className="flex-1 bg-slate-800/50 border border-slate-700/50 rounded-xl py-3 px-4 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                  disabled={isLoading}
                />
                {compareQueries.length > 2 && (
                  <button
                    onClick={() => removeCompareField(idx)}
                    className="p-3 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-xl transition-colors"
                  >
                    <X size={20} />
                  </button>
                )}
              </div>
            ))}
            
            <div className="relative flex items-center w-full mb-2">
               <div className="absolute left-4 text-slate-500">
                 <MapPin size={20} />
               </div>
               <input
                 type="text"
                 value={locality}
                 onChange={(e) => setLocality(e.target.value)}
                 onKeyDown={(e) => e.key === 'Enter' && handleCompareSearch()}
                 placeholder="Locality context (Optional, e.g., 'California', 'UK')"
                 className="w-full bg-slate-800/30 border border-slate-700/30 rounded-xl py-3 pl-12 pr-10 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 transition-all font-sans"
                 disabled={isLoading}
               />
               {locality && (
                 <button
                   onClick={() => setLocality('')}
                   className="absolute right-4 text-slate-400 hover:text-slate-200 transition-colors"
                 >
                   <X size={16} />
                 </button>
               )}
            </div>

             <div className="flex items-center justify-between pt-2 flex-wrap gap-4">
              <label className="flex items-center gap-3 bg-slate-950/30 p-2 pr-4 rounded-xl border border-slate-800 cursor-pointer hover:bg-slate-800/30 transition-colors">
                <input
                  type="checkbox"
                  checked={useWebSearch}
                  onChange={(e) => setUseWebSearch(e.target.checked)}
                  disabled={isLoading}
                  className="w-4 h-4 ml-2 rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-cyan-500/50 focus:ring-offset-0 disabled:opacity-50"
                />
                <div className="flex-1">
                  <div className="text-sm font-medium text-slate-300 flex items-center gap-2">
                    <Globe2 size={14} className="text-cyan-400" />
                    Use Web Search Grounding
                  </div>
                </div>
              </label>
              
              <div className="flex items-center gap-3 ml-auto">
                <button
                  onClick={addCompareField}
                  disabled={compareQueries.length >= 3 || isLoading}
                  className="flex items-center gap-2 px-4 py-2 text-cyan-500 hover:text-cyan-400 hover:bg-cyan-950/30 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
                >
                  <Plus size={16} /> Add Taxon
                </button>
                <button
                  onClick={handleCompareSearch}
                  disabled={compareQueries.filter((q) => q.trim()).length < 2 || isLoading}
                  className="bg-cyan-600 hover:bg-cyan-500 text-white px-6 py-2 rounded-xl font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {isLoading ? <Loader2 size={18} className="animate-spin" /> : 'Compare Taxa'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {error && <ErrorDisplay message={error} className="mb-8" />}

      {isLoading && (
        <div className="space-y-6">
          <SkeletonLoader type="title" className="h-12 w-1/3" />
          <SkeletonLoader type="card" className="h-32" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <SkeletonLoader type="card" className="col-span-2 h-64" />
            <SkeletonLoader type="card" className="col-span-1 h-64" />
          </div>
        </div>
      )}

      {!isLoading && mode === 'single' && singleResult && (
        <SingleResult
          profile={singleResult.profile}
          sources={singleResult.sources}
          onNavigate={onNavigate}
        />
      )}

      {!isLoading && mode === 'compare' && compareResult && (
        <ComparisonResult
          profile={compareResult.profile}
          sources={compareResult.sources}
          onNavigate={onNavigate}
        />
      )}
    </div>
  );
}
