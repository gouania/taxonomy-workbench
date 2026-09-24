import { Sparkles, Loader2, Trash2, MapPin, SlidersHorizontal, FileText, Search, Compass, BookOpen } from 'lucide-react';
import React, { useState, useEffect } from 'react';
import { CHARACTER_GROUPS } from '../../constants';
import { cacheService } from '../../services/cacheService';
import { geminiService } from '../../services/geminiService';
import { IdentifyResult, NavigationTarget } from '../../types';
import { ErrorDisplay } from '../shared/ErrorDisplay';
import { SkeletonLoader } from '../shared/SkeletonLoader';
import { CharacterSelector } from './CharacterSelector';
import { FamilyResultCard } from './FamilyResultCard';
import { InfoCard } from '../shared/InfoCard';
import { MarkdownRenderer } from '../shared/MarkdownRenderer';
import { SourcesBar } from '../shared/SourcesBar';

interface IdentifyModuleProps {
  onNavigate: (target: NavigationTarget) => void;
  initialLocality?: string;
}

const QUICK_PROMPTS = [
  { label: '+ Leaves', snippet: '- Leaves: ' },
  { label: '+ Flowers', snippet: '- Flowers: ' },
  { label: '+ Stem / Sap', snippet: '- Stem & Sap: ' },
  { label: '+ Fruit / Seeds', snippet: '- Fruit: ' },
  { label: '+ Odor', snippet: '- Odor: ' },
  { label: '+ Habit / Height', snippet: '- Habit & Height: ' },
];

const SAMPLE_SPECIMEN = {
  location: 'Yosemite National Park, moist riparian understory near river, 1,200m',
  notes: 'Erect perennial herb ~60 cm tall in shaded riparian forest. Opposite serrate ovate-lanceolate leaves with stinging trichomes. Square green stem, fibrous roots, clear non-milky watery exudate. Dense axillary clusters of tiny greenish-white unisexual apetalous flowers.',
  suspectedFamilies: 'Urticaceae',
};

export function IdentifyModule({ onNavigate, initialLocality }: IdentifyModuleProps) {
  const [selectedCharacters, setSelectedCharacters] = useState<Set<string>>(new Set());
  const [suggestedCharacters, setSuggestedCharacters] = useState<Map<string, string>>(new Map());
  const [notes, setNotes] = useState('');
  const [location, setLocation] = useState(initialLocality || '');
  const [suspectedFamilies, setSuspectedFamilies] = useState('');
  const [showCharacterMatrix, setShowCharacterMatrix] = useState(false);
  
  const [isLoading, setIsLoading] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [gpsStatus, setGpsStatus] = useState<string | null>(null);
  
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ data: IdentifyResult; sources: any[] } | null>(null);

  useEffect(() => {
    if (initialLocality) {
      setLocation(initialLocality);
    }
  }, [initialLocality]);

  const handleToggleCharacter = (id: string) => {
    const newSet = new Set(selectedCharacters);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedCharacters(newSet);
  };

  const handleInsertPrompt = (snippet: string) => {
    setNotes((prev) => {
      const trimmed = prev.trim();
      if (!trimmed) return snippet;
      return `${prev.endsWith('\n') ? prev : prev + '\n'}${snippet}`;
    });
  };

  const handleUseGPS = () => {
    if (!navigator.geolocation) {
      setGpsStatus('Geolocation not supported by browser');
      setTimeout(() => setGpsStatus(null), 4000);
      return;
    }

    setIsLocating(true);
    setGpsStatus(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocating(false);
        const { latitude, longitude } = pos.coords;
        const latStr = latitude >= 0 ? `${latitude.toFixed(4)}° N` : `${Math.abs(latitude).toFixed(4)}° S`;
        const lngStr = longitude >= 0 ? `${longitude.toFixed(4)}° E` : `${Math.abs(longitude).toFixed(4)}° W`;
        setLocation(`${latStr}, ${lngStr}`);
        setGpsStatus('GPS coordinates acquired');
        setTimeout(() => setGpsStatus(null), 3500);
      },
      (err) => {
        setIsLocating(false);
        setGpsStatus(`GPS error: ${err.message || 'Location access denied'}`);
        setTimeout(() => setGpsStatus(null), 4500);
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  const handleLoadSample = () => {
    setLocation(SAMPLE_SPECIMEN.location);
    setNotes(SAMPLE_SPECIMEN.notes);
    setSuspectedFamilies(SAMPLE_SPECIMEN.suspectedFamilies);
    setError(null);
  };

  const handleClearAll = () => {
    setSelectedCharacters(new Set());
    setSuggestedCharacters(new Map());
    setNotes('');
    setLocation('');
    setSuspectedFamilies('');
    setResult(null);
    setError(null);
    setGpsStatus(null);
  };

  const handleIdentify = async () => {
    if (selectedCharacters.size === 0 && !notes.trim()) {
      setError('Please provide specimen field observations or select characters from the matrix.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setResult(null);

    const charLabels = Array.from(selectedCharacters).map((id) => {
      for (const group of CHARACTER_GROUPS) {
        const char = group.characters.find((c) => c.id === id);
        if (char) return char.label;
      }
      return id;
    });

    try {
      const cacheKey = `identify_${btoa(
        encodeURIComponent(JSON.stringify({ charLabels, notes, location, suspectedFamilies }))
      )}`;
      const cached = cacheService.get<{ data: IdentifyResult; sources: any[] }>(cacheKey);

      if (cached) {
        setResult(cached);
      } else {
        const { result: data, sources } = await geminiService.identifySpecimen(
          charLabels as string[],
          notes,
          location,
          suspectedFamilies,
          true
        );
        setResult({ data, sources });
        cacheService.set(cacheKey, { data, sources });
      }
    } catch (err: any) {
      setError(err.message || 'Failed to identify specimen.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSuggestNext = async () => {
    if (selectedCharacters.size === 0) {
      setError('Select at least one character first to get matrix suggestions.');
      return;
    }

    setIsSuggesting(true);
    setError(null);

    const selectedLabels = Array.from(selectedCharacters).map((id) => {
      for (const group of CHARACTER_GROUPS) {
        const char = group.characters.find((c) => c.id === id);
        if (char) return char.label;
      }
      return id;
    });

    const availableLabels: string[] = [];
    CHARACTER_GROUPS.forEach((group) => {
      group.characters.forEach((char) => {
        if (!selectedCharacters.has(char.id)) {
          availableLabels.push(char.label);
        }
      });
    });

    try {
      const suggestions = await geminiService.suggestNextCharacters(selectedLabels as string[], availableLabels);
      const newSuggested = new Map<string, string>();
      suggestions.forEach((s) => {
        for (const group of CHARACTER_GROUPS) {
          const char = group.characters.find((c) => c.label === s.id || c.id === s.id);
          if (char) {
            newSuggested.set(char.id, s.reasoning);
            break;
          }
        }
      });
      setSuggestedCharacters(newSuggested);
    } catch (err: any) {
      setError(err.message || 'Failed to get suggestions.');
    } finally {
      setIsSuggesting(false);
    }
  };

  const hasInputs = notes.trim().length > 0 || selectedCharacters.size > 0 || location.trim().length > 0;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="mb-8 print:hidden text-center md:text-left">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-950/60 border border-cyan-800/40 text-cyan-400 text-xs font-mono uppercase tracking-wider mb-2">
          <Compass size={13} />
          <span>Botanical Diagnostic Engine</span>
        </div>
        <h1 className="font-display text-3xl md:text-4xl font-bold text-white mb-2">Identify Specimen</h1>
        <p className="text-slate-400 max-w-3xl">
          Describe the plant in plain language or botanical terminology. Provide locality and habitat context to pinpoint candidate families, diagnostic synapomorphies, and genera.
        </p>
      </div>

      {/* Main Specimen Field Notebook (Center Stage) */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-3xl p-6 md:p-8 shadow-2xl backdrop-blur-sm space-y-6 print:hidden">
        
        {/* Locality & Habitat Input */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-semibold text-slate-300 flex items-center gap-2">
              <MapPin size={16} className="text-cyan-400" />
              <span>Locality & Habitat</span>
              <span className="text-xs font-normal text-slate-500">(Crucial for narrowing candidates)</span>
            </label>
            <button
              type="button"
              onClick={handleUseGPS}
              disabled={isLocating || isLoading}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-cyan-400 hover:text-cyan-300 border border-slate-700/60 text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
              title="Acquire current device GPS coordinates"
            >
              {isLocating ? <Loader2 size={13} className="animate-spin" /> : <MapPin size={13} />}
              <span>{isLocating ? 'Acquiring GPS...' : 'Use Current GPS'}</span>
            </button>
          </div>
          <div className="relative">
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder='e.g., "Yosemite, moist riparian shade, 1,800m" or "Kew Gardens, glasshouse"'
              className="w-full bg-slate-950/60 border border-slate-800 focus:border-cyan-500/80 rounded-xl px-4 py-3 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 text-sm transition-all"
              disabled={isLoading}
            />
            {gpsStatus && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-cyan-300">
                {gpsStatus}
              </span>
            )}
          </div>
        </div>

        {/* Specimen Field Description */}
        <div className="space-y-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <label className="text-sm font-semibold text-slate-300 flex items-center gap-2">
              <FileText size={16} className="text-cyan-400" />
              <span>Specimen Description & Field Observations</span>
            </label>

            {/* Organ Prompt Chips */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-slate-500 font-mono text-[11px] mr-1 hidden lg:inline">Quick insert:</span>
              {QUICK_PROMPTS.map((prompt) => (
                <button
                  key={prompt.label}
                  type="button"
                  onClick={() => handleInsertPrompt(prompt.snippet)}
                  disabled={isLoading}
                  className="px-2 py-0.5 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/60 text-xs transition-colors cursor-pointer"
                >
                  {prompt.label}
                </button>
              ))}
            </div>
          </div>

          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={5}
            placeholder='e.g., "Erect perennial herb ~50 cm tall in shaded riparian forest. Opposite serrate leaves with stinging hairs, square stem, clear non-milky sap. Axillary clusters of tiny greenish unisexual flowers..."'
            className="w-full bg-slate-950/60 border border-slate-800 focus:border-cyan-500/80 rounded-xl p-4 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 text-sm font-mono leading-relaxed resize-y transition-all min-h-[140px]"
            disabled={isLoading}
          />
        </div>

        {/* Optional Suspected Families */}
        <div className="pt-1">
          <label className="text-xs font-medium text-slate-400 mb-1.5 flex items-center gap-1.5">
            <Search size={14} className="text-slate-500" />
            <span>Suspected Families or Genera (Optional)</span>
          </label>
          <input
            type="text"
            value={suspectedFamilies}
            onChange={(e) => setSuspectedFamilies(e.target.value)}
            placeholder="e.g., Urticaceae, Lamiaceae, Boraginaceae"
            className="w-full bg-slate-950/60 border border-slate-800 focus:border-cyan-500/80 rounded-xl px-4 py-2.5 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 text-sm transition-all"
            disabled={isLoading}
          />
        </div>

        {/* Action Toolbar */}
        <div className="pt-4 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleIdentify}
              disabled={isLoading || (!notes.trim() && selectedCharacters.size === 0)}
              className="bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500 text-white px-6 py-3 rounded-xl font-semibold transition-all shadow-lg shadow-cyan-950/50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer"
            >
              {isLoading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  <span>Evaluating Characters...</span>
                </>
              ) : (
                <>
                  <Sparkles size={18} />
                  <span>Identify Specimen</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleLoadSample}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 hover:text-white border border-slate-700/60 text-xs font-medium transition-colors cursor-pointer"
            >
              <BookOpen size={14} className="text-amber-400" />
              <span>Load Sample Specimen</span>
            </button>
          </div>

          {hasInputs && (
            <button
              type="button"
              onClick={handleClearAll}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-slate-400 hover:text-rose-400 text-xs transition-colors cursor-pointer"
            >
              <Trash2 size={14} />
              <span>Clear All</span>
            </button>
          )}
        </div>
      </div>

      {/* Secondary Collapsible Accordion: Multi-Access Character Matrix */}
      <div className="mt-6 border border-slate-800/80 rounded-3xl bg-slate-900/30 overflow-hidden transition-all shadow-lg print:hidden">
        <button
          type="button"
          onClick={() => setShowCharacterMatrix(!showCharacterMatrix)}
          className="w-full p-4 md:px-6 flex items-center justify-between text-slate-300 hover:text-white transition-colors cursor-pointer bg-slate-900/50 hover:bg-slate-800/40"
        >
          <div className="flex items-center gap-2.5">
            <SlidersHorizontal size={18} className="text-cyan-400" />
            <span className="font-semibold text-sm">Refine with Multi-Access Character Matrix</span>
            <span className="text-xs text-slate-500 font-normal hidden sm:inline">(72 anatomical traits)</span>
            {selectedCharacters.size > 0 && (
              <span className="px-2.5 py-0.5 rounded-full bg-cyan-950 text-cyan-400 text-xs border border-cyan-800 font-mono font-medium">
                {selectedCharacters.size} traits selected
              </span>
            )}
          </div>
          <span className="text-xs text-slate-400 font-mono font-medium">
            {showCharacterMatrix ? 'Hide Matrix ▲' : 'Show Matrix ▼'}
          </span>
        </button>

        {showCharacterMatrix && (
          <div className="p-4 md:p-6 border-t border-slate-800/80 bg-slate-950/40 space-y-4 animate-in fade-in duration-300">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800/60 text-xs text-slate-400">
              <span>Select macroscopic or microscopic features observed on vegetative organs or floral dissections:</span>
              <button
                type="button"
                onClick={handleSuggestNext}
                disabled={isSuggesting || selectedCharacters.size === 0}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors disabled:opacity-50 cursor-pointer"
              >
                {isSuggesting ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Sparkles size={14} className="text-amber-400" />
                )}
                <span>Suggest Next Characters to Verify</span>
              </button>
            </div>

            <CharacterSelector
              selected={selectedCharacters}
              suggested={suggestedCharacters}
              onToggle={handleToggleCharacter}
            />
          </div>
        )}
      </div>

      {/* Error Display */}
      {error && <ErrorDisplay message={error} className="mt-8" />}

      {/* Skeleton Loading State */}
      {isLoading && (
        <div className="mt-12 space-y-6">
          <SkeletonLoader type="title" className="h-8 w-1/3" />
          <SkeletonLoader type="card" className="h-32" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <SkeletonLoader type="card" className="h-64" />
            <SkeletonLoader type="card" className="h-64" />
          </div>
        </div>
      )}

      {/* Results View */}
      {!isLoading && result && (
        <div className="mt-12 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <InfoCard title="Morphological Evaluation & Congruence" highlight>
            <MarkdownRenderer content={result.data.analysisNotes} />
          </InfoCard>

          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-2xl font-bold text-white">
                Candidate Families ({result.data.suggestedFamilies.length})
              </h3>
              <span className="text-xs text-slate-400 font-mono">
                Ranked by Synapomorphic Congruence
              </span>
            </div>
            
            <div className="grid grid-cols-1 gap-6">
              {result.data.suggestedFamilies.map((family, idx) => (
                <div key={idx}>
                  <FamilyResultCard family={family} onNavigate={onNavigate} />
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <InfoCard title="Additional Recommendations">
              <MarkdownRenderer content={result.data.additionalRecommendations} className="text-sm" />
            </InfoCard>
            <InfoCard title="Taxonomic & Nomenclature Notes">
              <MarkdownRenderer content={result.data.taxonomicNotes} className="text-sm" />
            </InfoCard>
          </div>

          <SourcesBar sources={result.sources} mode="sticky" />
        </div>
      )}
    </div>
  );
}
