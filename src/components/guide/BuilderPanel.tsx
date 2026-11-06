import React from 'react';
import { Loader2, Sparkles, MapPin, Search, Trash2, SlidersHorizontal, Check, Layers, ListTree } from 'lucide-react';
import { CoverageScope } from '../../types';

export const PRESET_FILTERS = [
  { id: 'vegetative', label: 'Vegetative characters only', description: 'Rely only on leaves, stem, bark, or habit characters (ignores flowers/fruits).' },
  { id: 'flowering', label: 'Focus on flowering specimens', description: 'Prioritize floral morphology, petals, and inflorescences in the key and profiles.' },
  { id: 'fruiting', label: 'Focus on fruiting/seeding specimens', description: 'Prioritize fruit, seed, cone, or spore characteristics in diagnosis.' },
  { id: 'woody', label: 'Woody subset only', description: 'Focus exclusively on woody plants (trees, shrubs, woody vines) within target taxon.' },
  { id: 'herbaceous', label: 'Herbaceous subset only', description: 'Focus exclusively on herbaceous species, excluding any woody plants.' }
];

interface BuilderPanelProps {
  taxon: string;
  setTaxon: (value: string) => void;
  locality: string;
  setLocality: (value: string) => void;
  coverageScope: CoverageScope;
  setCoverageScope: (scope: CoverageScope) => void;
  selectedFilters: string[];
  setSelectedFilters: (value: string[] | ((prev: string[]) => string[])) => void;
  customFilter: string;
  setCustomFilter: (value: string) => void;
  onGenerate: () => void;
  onClear: () => void;
  isLoading: boolean;
}

export function BuilderPanel({
  taxon,
  setTaxon,
  locality,
  setLocality,
  coverageScope,
  setCoverageScope,
  selectedFilters,
  setSelectedFilters,
  customFilter,
  setCustomFilter,
  onGenerate,
  onClear,
  isLoading
}: BuilderPanelProps) {
  return (
    <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-6 shadow-xl backdrop-blur-sm lg:sticky lg:top-24 lg:max-h-[calc(100vh-140px)] flex flex-col">
      <div className="flex-1 overflow-y-auto pr-2 -mr-2 mb-6 space-y-4 min-h-0 [scrollbar-width:thin] [scrollbar-color:theme(colors.slate.800)_transparent]">
        <div>
          <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2 block">
            What group are you studying?
          </label>
          <div className="relative">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
              <Search size={18} />
            </div>
            <input
              type="text"
              value={taxon}
              onChange={(e) => setTaxon(e.target.value)}
              placeholder="e.g. Acer, Bursera, Quercus, Rosaceae"
              className="w-full bg-slate-950/50 border border-slate-800 rounded-xl py-3 pl-10 pr-4 text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all text-sm"
              disabled={isLoading}
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2 block">
            Where? (Locality or Region)
          </label>
          <div className="relative">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
              <MapPin size={18} />
            </div>
            <input
              type="text"
              value={locality}
              onChange={(e) => setLocality(e.target.value)}
              placeholder="e.g. California, UK, Jalisco, Olympic Peninsula"
              className="w-full bg-slate-950/50 border border-slate-800 rounded-xl py-3 pl-10 pr-4 text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all text-sm"
              disabled={isLoading}
            />
          </div>
        </div>

        {/* Quick Example Requests */}
        <div className="pt-1">
          <span className="text-[11px] text-slate-400 font-mono uppercase tracking-wider block mb-1.5 font-semibold">
            Example Field Inquiries:
          </span>
          <div className="flex flex-wrap gap-1.5">
            {[
              { t: 'Acer', l: 'California' },
              { t: 'Quercus', l: 'Jalisco' },
              { t: 'Salix', l: 'United Kingdom' },
              { t: 'Arctostaphylos', l: 'Mount Tamalpais' },
            ].map((ex) => (
              <button
                key={ex.t + ex.l}
                type="button"
                disabled={isLoading}
                onClick={() => {
                  setTaxon(ex.t);
                  setLocality(ex.l);
                }}
                className="px-2.5 py-1 rounded-lg text-[11px] font-medium cursor-pointer bg-slate-900/80 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 transition-colors"
              >
                <span className="text-slate-200 font-serif italic">{ex.t}</span>{' '}
                <span className="text-slate-400">({ex.l})</span>
              </button>
            ))}
          </div>
        </div>

        {/* Taxonomic Coverage Policy */}
        <div className="border-t border-slate-800/80 pt-4 mt-2">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-widest flex items-center gap-1.5">
              <Sparkles size={13} className="text-cyan-400" />
              <span>Taxonomic Coverage</span>
            </label>
            <span className="text-[10px] text-cyan-400 font-mono">
              {coverageScope === 'comprehensive' ? 'Comprehensive' : coverageScope === 'curated' ? 'Curated' : 'Sections'}
            </span>
          </div>
          
          <div className="grid grid-cols-1 gap-2">
            <button
              type="button"
              disabled={isLoading}
              onClick={() => setCoverageScope('comprehensive')}
              className={`text-left p-2.5 rounded-xl border text-xs transition-all flex items-start gap-2.5 cursor-pointer ${
                coverageScope === 'comprehensive'
                  ? 'bg-cyan-500/15 text-cyan-200 border-cyan-500/40 shadow-sm'
                  : 'bg-slate-950/20 text-slate-400 border-slate-800/70 hover:border-slate-700/60 hover:bg-slate-950/40'
              }`}
            >
              <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 mt-0.5 transition-all ${
                coverageScope === 'comprehensive'
                  ? 'border-cyan-400 bg-cyan-500 text-slate-950'
                  : 'border-slate-700 bg-slate-900'
              }`}>
                {coverageScope === 'comprehensive' && <div className="w-1.5 h-1.5 rounded-full bg-slate-950" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className={`font-semibold flex items-center gap-1.5 ${coverageScope === 'comprehensive' ? 'text-cyan-300' : 'text-slate-300'}`}>
                  <span>Comprehensive (Retain All Regional Taxa)</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-cyan-950 text-cyan-400 border border-cyan-800/60 font-mono">Default</span>
                </div>
                <div className="text-[11px] text-slate-400 leading-relaxed mt-0.5">
                  Treats and keys out all relevant native and established taxa (~8–18+ species). Avoids artificial limits.
                </div>
              </div>
            </button>

            <button
              type="button"
              disabled={isLoading}
              onClick={() => setCoverageScope('curated')}
              className={`text-left p-2.5 rounded-xl border text-xs transition-all flex items-start gap-2.5 cursor-pointer ${
                coverageScope === 'curated'
                  ? 'bg-amber-500/15 text-amber-200 border-amber-500/40 shadow-sm'
                  : 'bg-slate-950/20 text-slate-400 border-slate-800/70 hover:border-slate-700/60 hover:bg-slate-950/40'
              }`}
            >
              <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 mt-0.5 transition-all ${
                coverageScope === 'curated'
                  ? 'border-amber-400 bg-amber-500 text-slate-950'
                  : 'border-slate-700 bg-slate-900'
              }`}>
                {coverageScope === 'curated' && <div className="w-1.5 h-1.5 rounded-full bg-slate-950" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className={`font-semibold ${coverageScope === 'curated' ? 'text-amber-300' : 'text-slate-300'}`}>
                  Curated Dominants (Top 10–15 Species)
                </div>
                <div className="text-[11px] text-slate-400 leading-relaxed mt-0.5">
                  Focuses on the most common or indicator species. Ideal for mega-diverse groups with 50+ species.
                </div>
              </div>
            </button>

            <button
              type="button"
              disabled={isLoading}
              onClick={() => setCoverageScope('groups')}
              className={`text-left p-2.5 rounded-xl border text-xs transition-all flex items-start gap-2.5 cursor-pointer ${
                coverageScope === 'groups'
                  ? 'bg-indigo-500/15 text-indigo-200 border-indigo-500/40 shadow-sm'
                  : 'bg-slate-950/20 text-slate-400 border-slate-800/70 hover:border-slate-700/60 hover:bg-slate-950/40'
              }`}
            >
              <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 mt-0.5 transition-all ${
                coverageScope === 'groups'
                  ? 'border-indigo-400 bg-indigo-500 text-slate-950'
                  : 'border-slate-700 bg-slate-900'
              }`}>
                {coverageScope === 'groups' && <div className="w-1.5 h-1.5 rounded-full bg-slate-950" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className={`font-semibold ${coverageScope === 'groups' ? 'text-indigo-300' : 'text-slate-300'}`}>
                  Infrageneric Groups & Sections
                </div>
                <div className="text-[11px] text-slate-400 leading-relaxed mt-0.5">
                  Subdivides hyper-diverse taxa into subgenera, sections, or species complexes with keys leading to groups.
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* Optional Criteria & Constraints */}
        <div className="border-t border-slate-800/80 pt-4 mt-2">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3 block flex items-center gap-1.5">
            <SlidersHorizontal size={13} className="text-cyan-400" />
            Criteria & Constraints (Optional)
          </span>
          
          <div className="space-y-2">
            {PRESET_FILTERS.map((preset) => {
              const isSelected = selectedFilters.includes(preset.id);
              return (
                <button
                  key={preset.id}
                  type="button"
                  disabled={isLoading}
                  onClick={() => {
                    if (isSelected) {
                      setSelectedFilters(prev => prev.filter(id => id !== preset.id));
                    } else {
                      setSelectedFilters(prev => [...prev, preset.id]);
                    }
                  }}
                  className={`w-full text-left p-2.5 rounded-xl border text-xs transition-all flex items-start gap-2.5 ${
                    isSelected
                      ? 'bg-cyan-500/10 text-cyan-200 border-cyan-500/30'
                      : 'bg-slate-950/20 text-slate-400 border-slate-800/60 hover:border-slate-700/50 hover:bg-slate-950/40 opacity-80 hover:opacity-100'
                  }`}
                >
                  <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 mt-0.5 transition-all ${
                    isSelected
                      ? 'border-cyan-500 bg-cyan-500 text-slate-950'
                      : 'border-slate-700 bg-slate-900'
                  }`}>
                    {isSelected && <Check size={10} strokeWidth={3} />}
                  </div>
                  <div>
                    <div className={`font-semibold ${isSelected ? 'text-cyan-300' : 'text-slate-300'}`}>
                      {preset.label}
                    </div>
                    <div className="text-[10px] text-slate-500 leading-relaxed mt-0.5">
                      {preset.description}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-3">
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">
              Other Custom Criteria
            </label>
            <input
              type="text"
              value={customFilter}
              onChange={(e) => setCustomFilter(e.target.value)}
              placeholder="e.g. Focus only on species with red fruit"
              className="w-full bg-slate-950/40 border border-slate-800/80 rounded-xl py-2 px-3 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-cyan-500/50 transition-all"
              disabled={isLoading}
            />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 mt-auto pt-4 border-t border-slate-800/60 bg-slate-900/10 shrink-0">
        <button
          onClick={onClear}
          disabled={isLoading || (!taxon && !locality && selectedFilters.length === 0 && !customFilter)}
          className="p-3 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          title="Clear input"
        >
          <Trash2 size={20} />
        </button>
        <button
          onClick={onGenerate}
          disabled={isLoading || !taxon.trim() || !locality.trim()}
          className="flex-1 bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500 text-white font-medium py-3 px-6 rounded-xl shadow-lg shadow-cyan-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <>
              <Loader2 size={20} className="animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Sparkles size={20} />
              Build identification guide
            </>
          )}
        </button>
      </div>
    </div>
  );
}
