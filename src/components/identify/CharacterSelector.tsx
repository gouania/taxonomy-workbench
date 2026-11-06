import { Info, Sparkles, Search, X, Check, SlidersHorizontal } from 'lucide-react';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { CHARACTER_GROUPS } from '../../constants';
import { geminiService } from '../../services/geminiService';

interface CharacterSelectorProps {
  selected: Set<string>;
  suggested: Map<string, string>;
  onToggle: (id: string) => void;
}

type FilterChip = 'all' | 'selected' | 'habit' | 'leaf' | 'flower' | 'fruit';

export function CharacterSelector({ selected, suggested, onToggle }: CharacterSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterChip>('all');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(CHARACTER_GROUPS.map((g) => g.category))
  );
  const [explanation, setExplanation] = useState<{ id: string; text: string } | null>(null);
  const [isLoadingExplanation, setIsLoadingExplanation] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Keyboard shortcut: '/' to focus search, 'Escape' to clear/blur
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in another input/textarea
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        if (e.key === 'Escape' && target === searchInputRef.current) {
          setSearchQuery('');
          searchInputRef.current?.blur();
        }
        return;
      }

      if (e.key === '/') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const toggleGroup = (category: string) => {
    const newSet = new Set(expandedGroups);
    if (newSet.has(category)) {
      newSet.delete(category);
    } else {
      newSet.add(category);
    }
    setExpandedGroups(newSet);
  };

  const handleExplain = async (e: React.MouseEvent, id: string, label: string) => {
    e.stopPropagation();
    if (explanation?.id === id) {
      setExplanation(null);
      return;
    }

    setIsLoadingExplanation(true);
    setExplanation({ id, text: 'Loading...' });

    try {
      const text = await geminiService.explainCharacter(label);
      setExplanation({ id, text });
    } catch (err) {
      setExplanation({ id, text: 'Failed to load explanation.' });
    } finally {
      setIsLoadingExplanation(false);
    }
  };

  // Filter groups and characters according to search and active category filter
  const filteredGroups = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return CHARACTER_GROUPS.map((group) => {
      // Filter by category chip
      const catLower = group.category.toLowerCase();
      if (activeFilter === 'habit' && !catLower.includes('habit')) return null;
      if (activeFilter === 'leaf' && !catLower.includes('leaf') && !catLower.includes('leaves')) return null;
      if (activeFilter === 'flower' && !catLower.includes('flower')) return null;
      if (activeFilter === 'fruit' && !catLower.includes('fruit') && !catLower.includes('seed')) return null;

      const matchingCharacters = group.characters.filter((char) => {
        // Selected filter
        if (activeFilter === 'selected' && !selected.has(char.id)) {
          return false;
        }

        // Search text
        if (!query) return true;

        const labelMatch = char.label.toLowerCase().includes(query);
        const idMatch = char.id.toLowerCase().includes(query);
        const catMatch = char.category.toLowerCase().includes(query);
        return labelMatch || idMatch || catMatch;
      });

      if (matchingCharacters.length === 0) return null;

      return {
        ...group,
        characters: matchingCharacters,
      };
    }).filter(Boolean) as typeof CHARACTER_GROUPS;
  }, [searchQuery, activeFilter, selected]);

  // Auto-expand categories if search query is active
  useEffect(() => {
    if (searchQuery.trim()) {
      setExpandedGroups(new Set(CHARACTER_GROUPS.map((g) => g.category)));
    }
  }, [searchQuery]);

  const totalMatchingCharacters = useMemo(() => {
    return filteredGroups.reduce((acc, g) => acc + g.characters.length, 0);
  }, [filteredGroups]);

  return (
    <div className="space-y-6">
      {/* Search Bar & Instant Filters */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 shadow-xl backdrop-blur-sm space-y-3">
        <div className="relative">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search characters (e.g. pellucid dots, latex, monadelphous, square stem)..."
            className="w-full bg-slate-950/80 border border-slate-800 hover:border-slate-700 focus:border-cyan-500 rounded-xl pl-10 pr-24 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 transition-all font-sans"
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
            {searchQuery ? (
              <button
                onClick={() => setSearchQuery('')}
                className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                title="Clear search (Esc)"
              >
                <X size={15} />
              </button>
            ) : (
              <span className="hidden sm:inline-block px-1.5 py-0.5 rounded border border-slate-800 bg-slate-900 text-[10px] font-mono text-slate-500">
                /
              </span>
            )}
            <span className="text-xs font-mono text-slate-400 border-l border-slate-800 pl-2">
              {totalMatchingCharacters} found
            </span>
          </div>
        </div>

        {/* Filter Chips */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-[11px] font-mono uppercase tracking-wider text-slate-500 mr-1 flex items-center gap-1">
            <SlidersHorizontal size={11} /> Filter:
          </span>

          <button
            onClick={() => setActiveFilter('all')}
            className={`text-xs px-3 py-1 rounded-xl font-medium transition-all ${
              activeFilter === 'all'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                : 'bg-slate-800/50 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700/50'
            }`}
          >
            All
          </button>

          <button
            onClick={() => setActiveFilter('selected')}
            className={`text-xs px-3 py-1 rounded-xl font-medium transition-all flex items-center gap-1.5 ${
              activeFilter === 'selected'
                ? 'bg-cyan-500 text-slate-950 font-semibold shadow-sm'
                : selected.size > 0
                ? 'bg-cyan-950/40 text-cyan-300 border border-cyan-800/60 hover:bg-cyan-900/50'
                : 'theme-chip opacity-60'
            }`}
          >
            {selected.size > 0 && <Check size={12} className="stroke-[3]" />}
            <span>Selected Only ({selected.size})</span>
          </button>

          <button
            onClick={() => setActiveFilter('habit')}
            className={`text-xs px-3 py-1 rounded-xl font-medium transition-all ${
              activeFilter === 'habit'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold'
                : 'theme-chip'
            }`}
          >
            Habit & Stem
          </button>

          <button
            onClick={() => setActiveFilter('leaf')}
            className={`text-xs px-3 py-1 rounded-xl font-medium transition-all ${
              activeFilter === 'leaf'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold'
                : 'theme-chip'
            }`}
          >
            Leaves
          </button>

          <button
            onClick={() => setActiveFilter('flower')}
            className={`text-xs px-3 py-1 rounded-xl font-medium transition-all ${
              activeFilter === 'flower'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold'
                : 'theme-chip'
            }`}
          >
            Flowers
          </button>

          <button
            onClick={() => setActiveFilter('fruit')}
            className={`text-xs px-3 py-1 rounded-xl font-medium transition-all ${
              activeFilter === 'fruit'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold'
                : 'theme-chip'
            }`}
          >
            Fruits & Seeds
          </button>

          {(searchQuery || activeFilter !== 'all') && (
            <button
              onClick={() => {
                setSearchQuery('');
                setActiveFilter('all');
              }}
              className="text-[11px] font-mono text-slate-500 hover:text-rose-400 ml-auto transition-colors"
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* No Results Message */}
      {filteredGroups.length === 0 && (
        <div className="bg-slate-900/40 border border-slate-800/60 rounded-2xl p-8 text-center">
          <p className="text-slate-300 text-base font-medium mb-1">No botanical characters matched your filter</p>
          <p className="text-slate-500 text-xs mb-4">
            Try searching a simpler anatomical organ or state (e.g. &ldquo;opposite&rdquo;, &ldquo;stipule&rdquo;, &ldquo;spine&rdquo;).
          </p>
          <button
            onClick={() => {
              setSearchQuery('');
              setActiveFilter('all');
            }}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold border border-slate-700 transition-colors"
          >
            Clear Search & Filters
          </button>
        </div>
      )}

      {/* Character Groups */}
      {filteredGroups.map((group) => (
        <div key={group.category} className="bg-slate-900/40 border border-slate-800/50 rounded-2xl overflow-hidden">
          <button
            onClick={() => toggleGroup(group.category)}
            className="w-full flex items-center justify-between p-4 bg-slate-800/30 hover:bg-slate-800/50 transition-colors"
          >
            <h3 className="font-display text-lg font-semibold text-white">{group.category}</h3>
            <span className="text-slate-500 text-sm">
              {group.characters.filter((c) => selected.has(c.id)).length} / {group.characters.length}
            </span>
          </button>

          {expandedGroups.has(group.category) && (
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {group.characters.map((char) => {
                const isSelected = selected.has(char.id);
                const suggestionReason = suggested.get(char.id);

                return (
                  <div key={char.id} className="relative group">
                    <div
                      onClick={() => onToggle(char.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onToggle(char.id);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all text-left cursor-pointer ${
                        isSelected
                          ? 'bg-cyan-900/40 border-cyan-500/50 text-cyan-50 font-semibold'
                          : suggestionReason
                          ? 'bg-amber-900/30 border-amber-500/40 text-amber-100 shadow-[0_0_15px_rgba(245,158,11,0.1)]'
                          : 'theme-chip text-slate-300 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-4 h-4 rounded-full border flex items-center justify-center transition-colors shrink-0 ${
                            isSelected
                              ? 'bg-cyan-500 border-cyan-500'
                              : 'border-slate-500 bg-transparent'
                          }`}
                        >
                          {isSelected && <div className="w-1.5 h-1.5 bg-slate-900 rounded-full" />}
                        </div>
                        <span className="text-sm font-medium">{char.label}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0 ml-2">
                        {suggestionReason && (
                          <Sparkles size={14} className="text-amber-400 animate-pulse" />
                        )}
                        <button
                          onClick={(e) => handleExplain(e, char.id, char.label)}
                          className="p-1 text-slate-500 hover:text-cyan-400 transition-colors"
                          title="Explain character"
                        >
                          <Info size={14} />
                        </button>
                      </div>
                    </div>

                    {/* Explanation Tooltip */}
                    {explanation?.id === char.id && (
                      <div className="absolute z-10 bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-slate-800 border border-slate-700 rounded-xl shadow-xl text-sm text-slate-200 animate-in fade-in zoom-in-95 duration-200">
                        {isLoadingExplanation && explanation.text === 'Loading...' ? (
                          <div className="flex items-center justify-center gap-2 text-slate-400">
                            <div className="w-4 h-4 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
                            Loading...
                          </div>
                        ) : (
                          <p>{explanation.text}</p>
                        )}
                        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-700" />
                      </div>
                    )}

                    {/* Suggestion Tooltip */}
                    {suggestionReason && !isSelected && (
                      <div className="absolute z-10 bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-amber-950 border border-amber-700/50 rounded-xl shadow-xl text-xs text-amber-100 hidden group-hover:block animate-in fade-in zoom-in-95 duration-200">
                        <span className="font-semibold block mb-1">Why try this?</span>
                        {suggestionReason}
                        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-amber-700/50" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
