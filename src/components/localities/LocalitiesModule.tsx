import React, { useState } from 'react';
import { Search, MapPin, Loader2, Compass } from 'lucide-react';
import { LocalityProfile, NavigationTarget } from '../../types';
import { LocalityDashboard } from './LocalityDashboard';
import { geminiService } from '../../services/geminiService';
import { ErrorDisplay } from '../shared/ErrorDisplay';

interface LocalitiesModuleProps {
  initialQuery?: string;
  onNavigate: (target: NavigationTarget) => void;
}

export function LocalitiesModule({ initialQuery, onNavigate }: LocalitiesModuleProps) {
  const [query, setQuery] = useState(initialQuery || '');
  const [isLoading, setIsLoading] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [locationNotice, setLocationNotice] = useState<string | null>(null);
  const [profile, setProfile] = useState<LocalityProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sources, setSources] = useState<any[]>([]);

  React.useEffect(() => {
    if (initialQuery && !profile && !isLoading && !error) {
       handleSearch(initialQuery);
    }
  }, [initialQuery]);

  const handleSearch = async (searchQuery: string) => {
    if (!searchQuery.trim()) return;
    
    setIsLoading(true);
    setError(null);
    setProfile(null);
    setSources([]);

    try {
      const response = await geminiService.generateLocalityProfile(searchQuery);
      setProfile(response.result);
      setSources(response.sources);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to generate locality profile. Please try a different query or check your connection.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      setLocationNotice('Geolocation is not supported by your browser.');
      setTimeout(() => setLocationNotice(null), 4000);
      return;
    }
    setIsLocating(true);
    setLocationNotice(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setIsLocating(false);
        const { latitude, longitude } = position.coords;
        const coordsString = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
        setQuery(coordsString);
        handleSearch(coordsString);
      },
      (err) => {
        setIsLocating(false);
        setLocationNotice(`Unable to retrieve GPS coordinates: ${err.message || 'Access denied'}`);
        setTimeout(() => setLocationNotice(null), 4500);
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="mb-12">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-8">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-950/60 border border-cyan-800/40 text-cyan-400 text-xs font-mono uppercase tracking-wider mb-2">
              <Compass size={13} />
              <span>Biogeographical & Floristic Profiler</span>
            </div>
            <h1 className="font-display text-4xl font-bold text-white mb-2">Localities & Flora</h1>
            <p className="text-slate-400">
              Explore ecological strata, elevational life zones, live field observations, and conservation profiles of any region.
            </p>
          </div>
        </div>

        <div className="bg-slate-900/40 border border-slate-800/60 p-6 rounded-3xl">
          <div className="relative max-w-2xl mx-auto">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={20} />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch(query)}
              placeholder="Enter locality name or coordinates (e.g., Mount Tamalpais, CA)..."
              className="w-full bg-slate-900/50 border border-slate-700/50 rounded-2xl py-4 pl-12 pr-28 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all font-sans text-base sm:text-lg shadow-inner"
              disabled={isLoading || isLocating}
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <button
                onClick={() => handleSearch(query)}
                disabled={!query.trim() || isLoading || isLocating}
                className="bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer shadow-md"
              >
                {isLoading ? <Loader2 size={18} className="animate-spin" /> : 'Analyze'}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 mt-4 max-w-3xl mx-auto">
            <button
              type="button"
              onClick={handleUseCurrentLocation}
              disabled={isLoading || isLocating}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-800/50 text-xs font-semibold transition-all cursor-pointer shadow-sm disabled:opacity-50"
            >
              {isLocating ? <Loader2 size={14} className="animate-spin" /> : <MapPin size={14} />}
              <span>{isLocating ? 'Acquiring GPS...' : 'Analyze Where I Am Standing (Current GPS)'}</span>
            </button>

            {locationNotice && (
              <span className="text-xs text-amber-300 bg-amber-950/50 border border-amber-800/50 px-3 py-1 rounded-full">
                {locationNotice}
              </span>
            )}
          </div>
          
          {!profile && !isLoading && !error && (
            <div className="flex flex-wrap items-center justify-center gap-2 mt-4 max-w-3xl mx-auto">
              <span className="text-sm text-slate-500 py-1">Examples:</span>
              {['Mount Tamalpais, California', 'Mount Kinabalu', 'Cerrado biome', 'Table Mountain, South Africa', 'Yosemite Valley'].map((ex) => (
                <button
                  key={ex}
                  onClick={() => {
                    setQuery(ex);
                    handleSearch(ex);
                  }}
                  className="px-3 py-1 bg-slate-800/50 hover:bg-slate-700/50 text-slate-300 hover:text-cyan-400 rounded-full text-xs font-medium transition-colors border border-slate-700/50 cursor-pointer"
                >
                  {ex}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {error ? (
        <ErrorDisplay message={error} />
      ) : profile ? (
         <LocalityDashboard profile={profile} onNavigate={onNavigate} sources={sources} />
      ) : isLoading ? (
        <div className="flex flex-col justify-center items-center py-24 space-y-4">
          <Loader2 className="animate-spin text-cyan-500" size={48} />
          <p className="text-slate-400 text-sm animate-pulse">Compiling biogeographical zonation and floristic records...</p>
        </div>
      ) : null}
    </div>
  );
}
