import { Sparkles, Loader2, Trash2 } from 'lucide-react';
import React, { useState } from 'react';
import { CHARACTER_GROUPS } from '../../constants';
import { cacheService } from '../../services/cacheService';
import { geminiService } from '../../services/geminiService';
import { IdentifyResult, NavigationTarget } from '../../types';
import { ErrorDisplay } from '../shared/ErrorDisplay';
import { SkeletonLoader } from '../shared/SkeletonLoader';
import { CharacterSelector } from './CharacterSelector';
import { ContextPanel } from './ContextPanel';
import { FamilyResultCard } from './FamilyResultCard';
import { InfoCard } from '../shared/InfoCard';
import { MarkdownRenderer } from '../shared/MarkdownRenderer';
import { SourcesBar } from '../shared/SourcesBar';

interface IdentifyModuleProps {
  onNavigate: (target: NavigationTarget) => void;
}

export function IdentifyModule({ onNavigate }: IdentifyModuleProps) {
  const [selectedCharacters, setSelectedCharacters] = useState<Set<string>>(new Set());
  const [suggestedCharacters, setSuggestedCharacters] = useState<Map<string, string>>(new Map());
  const [notes, setNotes] = useState('');
  const [location, setLocation] = useState('');
  const [suspectedFamilies, setSuspectedFamilies] = useState('');
  const [useSearch, setUseSearch] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ data: IdentifyResult; sources: any[] } | null>(null);

  const handleToggleCharacter = (id: string) => {
    const newSet = new Set(selectedCharacters);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedCharacters(newSet);
  };

  const handleClearAll = () => {
    setSelectedCharacters(new Set());
    setSuggestedCharacters(new Map());
    setNotes('');
    setLocation('');
    setSuspectedFamilies('');
    setUseSearch(false);
    setResult(null);
    setError(null);
  };

  const handleIdentify = async () => {
    if (selectedCharacters.size === 0 && !notes.trim()) {
      setError('Please select at least one character or provide notes.');
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
        JSON.stringify({ charLabels, notes, location, suspectedFamilies, useSearch })
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
          useSearch
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
      setError('Select at least one character first to get suggestions.');
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
        // Find ID by label
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

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-in fade-in duration-500">
      <div className="mb-8 print:hidden">
        <h1 className="font-display text-3xl font-bold text-white mb-2">Identify Plants</h1>
        <p className="text-slate-400">Select observed characters to identify the plant family.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 print:hidden">
        <div className="lg:col-span-8">
          <CharacterSelector
            selected={selectedCharacters}
            suggested={suggestedCharacters}
            onToggle={handleToggleCharacter}
          />
        </div>
        <div className="lg:col-span-4">
          <div className="sticky top-24 space-y-6">
            <ContextPanel
              notes={notes}
              setNotes={setNotes}
              location={location}
              setLocation={setLocation}
              suspectedFamilies={suspectedFamilies}
              setSuspectedFamilies={setSuspectedFamilies}
              useSearch={useSearch}
              setUseSearch={setUseSearch}
              isLoading={isLoading}
            />

            <div className="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400">Selected Characters</span>
                <span className="bg-cyan-900/50 text-cyan-400 px-2.5 py-1 rounded-full font-medium border border-cyan-800/50">
                  {selectedCharacters.size}
                </span>
              </div>

              <button
                onClick={handleIdentify}
                disabled={isLoading || (selectedCharacters.size === 0 && !notes.trim())}
                className="w-full bg-cyan-600 hover:bg-cyan-500 text-white py-3 rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isLoading ? <Loader2 size={20} className="animate-spin" /> : 'Identify Specimen'}
              </button>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={handleSuggestNext}
                  disabled={isSuggesting || selectedCharacters.size === 0}
                  className="flex items-center justify-center gap-2 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {isSuggesting ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Sparkles size={16} className="text-amber-400" />
                  )}
                  Suggest Next
                </button>
                <button
                  onClick={handleClearAll}
                  className="flex items-center justify-center gap-2 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-medium transition-colors"
                >
                  <Trash2 size={16} className="text-red-400" />
                  Clear All
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {error && <ErrorDisplay message={error} className="mt-8" />}

      {isLoading && (
        <div className="mt-12 space-y-6">
          <SkeletonLoader type="title" className="h-8 w-1/4" />
          <SkeletonLoader type="card" className="h-32" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <SkeletonLoader type="card" className="h-64" />
            <SkeletonLoader type="card" className="h-64" />
          </div>
        </div>
      )}

      {!isLoading && result && (
        <div className="mt-12 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <InfoCard title="Analysis Notes" highlight>
            <MarkdownRenderer content={result.data.analysisNotes} />
          </InfoCard>

          <div className="space-y-6">
            <h3 className="font-display text-2xl font-semibold text-white">Suggested Families</h3>
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
            <InfoCard title="Taxonomic Notes">
              <MarkdownRenderer content={result.data.taxonomicNotes} className="text-sm" />
            </InfoCard>
          </div>

          <SourcesBar sources={result.sources} mode="sticky" />
        </div>
      )}
    </div>
  );
}
