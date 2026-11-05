import React, { useState } from 'react';
import { 
  X, 
  Loader2, 
  AlertCircle, 
  RotateCcw, 
  CheckCircle2, 
  Sparkles, 
  SlidersHorizontal, 
  Eye, 
  Microscope, 
  HelpCircle,
  ExternalLink,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { GuideSubsetComparison, GuideCharacterRow } from '../../types';

interface GuideSubsetModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedTaxa: {
    scientific_name: string;
    common_name?: string | null;
    key_diagnostics?: string;
    habitat_and_ecology?: string;
  }[];
  locality: string;
  activeFilters?: string[];
  data: GuideSubsetComparison | null;
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
}

export function GuideSubsetModal({
  isOpen,
  onClose,
  selectedTaxa,
  locality,
  activeFilters = [],
  data,
  isLoading,
  error,
  onRetry,
}: GuideSubsetModalProps) {
  const [showSharedCharacters, setShowSharedCharacters] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  if (!isOpen) return null;

  const categories = data
    ? ['all', ...Array.from(new Set(data.matrix_rows.map((r) => r.category).filter(Boolean) as string[]))]
    : ['all'];

  const filteredRows = (data?.matrix_rows || []).filter((row) => {
    if (!showSharedCharacters && row.diagnostic_importance === 'Shared') return false;
    if (selectedCategory !== 'all' && row.category !== selectedCategory) return false;
    return true;
  });

  const getImportanceBadge = (importance: GuideCharacterRow['diagnostic_importance']) => {
    switch (importance) {
      case 'Decisive':
        return 'bg-emerald-100 dark:bg-emerald-950 text-emerald-900 dark:text-emerald-300 border-emerald-400 dark:border-emerald-700/60 font-semibold';
      case 'Strong':
        return 'bg-cyan-100 dark:bg-cyan-950 text-cyan-950 dark:text-cyan-300 border-cyan-400 dark:border-cyan-800/60 font-semibold';
      case 'Secondary':
        return 'bg-amber-100 dark:bg-amber-950 text-amber-950 dark:text-amber-300 border-amber-400 dark:border-amber-800/60 font-medium';
      case 'Shared':
        return 'bg-stone-200 dark:bg-slate-800 text-stone-700 dark:text-slate-400 border-stone-300 dark:border-slate-700';
      default:
        return 'bg-stone-200 dark:bg-slate-800 text-stone-700 dark:text-slate-400 border-stone-300 dark:border-slate-700';
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="subset-compare-title"
    >
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-5 border-b border-slate-800 bg-slate-950/60 flex items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="px-2 py-0.5 rounded text-[11px] font-mono uppercase tracking-wider bg-cyan-950/80 text-cyan-400 border border-cyan-800/50">
                Subset Comparison
              </span>
              <span className="text-xs text-slate-400 font-mono">
                {selectedTaxa.length} taxa compared {locality ? `• ${locality}` : ''}
              </span>
            </div>
            <h2 id="subset-compare-title" className="text-lg sm:text-xl font-display font-bold text-white flex flex-wrap items-center gap-2">
              <span>Distinguishing:</span>
              <span className="text-cyan-300 font-serif italic">
                {selectedTaxa.map((t) => t.scientific_name).join(', ')}
              </span>
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Close comparison"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6 [scrollbar-width:thin]">
          
          {/* Loading state */}
          {isLoading && (
            <div className="py-16 text-center space-y-4">
              <Loader2 size={40} className="animate-spin text-cyan-400 mx-auto" />
              <div className="space-y-1">
                <h3 className="text-base font-semibold text-white">Synthesizing Diagnostic Distinctions...</h3>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  Cross-referencing characters across {selectedTaxa.length} taxa under regional constraints.
                </p>
              </div>
            </div>
          )}

          {/* Error state */}
          {error && !isLoading && (
            <div className="p-5 rounded-xl bg-rose-950/30 border border-rose-900/50 text-rose-200 space-y-3 text-center sm:text-left">
              <div className="flex items-center gap-2 text-rose-400 font-semibold">
                <AlertCircle size={18} />
                <span>Comparison Synthesis Error</span>
              </div>
              <p className="text-xs text-rose-300 leading-relaxed">{error}</p>
              <div className="pt-2">
                <button
                  onClick={onRetry}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-900/60 hover:bg-rose-800 text-rose-100 text-xs font-semibold border border-rose-700 transition-colors"
                >
                  <RotateCcw size={13} /> Retry Comparison
                </button>
              </div>
            </div>
          )}

          {/* Success Data Presentation */}
          {data && !isLoading && (
            <>
              {/* Constraints Advisory if any */}
              {data.constraints_advisory && (
                <div className="p-3.5 rounded-xl bg-amber-950/30 border border-amber-800/40 text-amber-200 text-xs flex gap-2.5 items-start">
                  <AlertCircle size={16} className="text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="font-semibold block mb-0.5">Active Constraint Advisory:</strong>
                    <span>{data.constraints_advisory}</span>
                  </div>
                </div>
              )}

              {/* 1. Fastest Way to Distinguish Them */}
              <div className="p-5 rounded-2xl bg-emerald-950/20 border border-emerald-700/40 space-y-2">
                <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm uppercase tracking-wide">
                  <Sparkles size={16} />
                  <span>Fastest Way to Distinguish Them in the Field</span>
                </div>
                <p className="text-sm sm:text-base text-emerald-100 leading-relaxed font-sans">
                  {data.fastest_distinction_summary}
                </p>
              </div>

              {/* 2. What to Examine Next */}
              {data.what_to_examine_next && data.what_to_examine_next.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center gap-2">
                      <Eye size={16} className="text-cyan-400" />
                      <span>What to Examine Next (Ordered Priority)</span>
                    </h3>
                    <span className="text-xs text-slate-400 font-mono">Field Protocol</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {data.what_to_examine_next.map((item, idx) => (
                      <div
                        key={idx}
                        className="p-3.5 rounded-xl bg-slate-950/50 border border-slate-800 hover:border-slate-700 flex gap-3 items-start transition-colors"
                      >
                        <span className="w-6 h-6 rounded-lg bg-cyan-950 border border-cyan-800/60 text-cyan-300 font-mono font-bold text-xs flex items-center justify-center shrink-0">
                          {item.priority || idx + 1}
                        </span>
                        <div className="space-y-1 text-xs">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-white">{item.action}</span>
                            {item.lens_or_technique && (
                              <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-slate-300 font-mono">
                                {item.lens_or_technique}
                              </span>
                            )}
                          </div>
                          <p className="text-slate-300 leading-relaxed">
                            <span className="text-slate-500 mr-1">Expected:</span>
                            {item.expected_outcomes}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 3. Diagnostic Comparison Matrix */}
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
                  <div>
                    <h3 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center gap-2">
                      <Microscope size={16} className="text-indigo-400" />
                      <span>Diagnostic Character Matrix</span>
                    </h3>
                    <p className="text-xs text-slate-400">
                      Decisive differences ranked first. All characters evaluated against regional evidence.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {/* Category Filter */}
                    {categories.length > 2 && (
                      <select
                        value={selectedCategory}
                        onChange={(e) => setSelectedCategory(e.target.value)}
                        className="bg-slate-950 border border-slate-800 text-xs rounded-lg px-2.5 py-1 text-slate-300 focus:outline-none"
                      >
                        {categories.map((c) => (
                          <option key={c} value={c}>
                            {c === 'all' ? 'All Organs' : c}
                          </option>
                        ))}
                      </select>
                    )}

                    {/* Toggle Shared */}
                    <button
                      type="button"
                      onClick={() => setShowSharedCharacters(!showSharedCharacters)}
                      className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition-colors ${
                        showSharedCharacters
                          ? 'bg-slate-800 text-white border-slate-600'
                          : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
                      }`}
                    >
                      {showSharedCharacters ? 'Hide Shared Traits' : 'Include Shared Traits'}
                    </button>
                  </div>
                </div>

                {/* Matrix Table */}
                <div className="border border-slate-800 rounded-xl overflow-x-auto bg-slate-950/40">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 bg-slate-950 text-slate-400 font-mono uppercase tracking-wider text-[11px]">
                        <th className="p-3 w-1/4 min-w-[180px]">Morphological Character</th>
                        {selectedTaxa.map((tax) => (
                          <th key={tax.scientific_name} className="p-3 min-w-[200px] border-l border-slate-800/80">
                            <i className="text-cyan-300 font-serif font-bold normal-case text-sm block">
                              {tax.scientific_name}
                            </i>
                            {tax.common_name && (
                              <span className="text-[10px] text-slate-500 font-sans normal-case block">
                                {tax.common_name}
                              </span>
                            )}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {filteredRows.length === 0 ? (
                        <tr>
                          <td colSpan={selectedTaxa.length + 1} className="p-6 text-center text-slate-500 italic">
                            No characters match the active organ filter.
                          </td>
                        </tr>
                      ) : (
                        filteredRows.map((row, rIdx) => (
                          <tr key={rIdx} className="hover:bg-slate-900/40 transition-colors">
                            {/* Character label & metadata */}
                            <td className="p-3 align-top">
                              <div className="space-y-1.5">
                                <div className="font-semibold text-slate-200 text-xs">
                                  {row.character_name}
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className={`px-1.5 py-0.5 rounded text-[10px] border ${getImportanceBadge(row.diagnostic_importance)}`}>
                                    {row.diagnostic_importance}
                                  </span>
                                  {row.category && (
                                    <span className="text-[10px] text-slate-500 font-mono">
                                      {row.category}
                                    </span>
                                  )}
                                </div>
                                {row.observation_method && (
                                  <div className="text-[10px] text-slate-400 italic">
                                    {row.observation_method}
                                  </div>
                                )}
                                {row.overlap_notes && (
                                  <div className="text-[10px] text-amber-400/90 bg-amber-950/20 p-1.5 rounded border border-amber-900/30">
                                    {row.overlap_notes}
                                  </div>
                                )}
                                {row.citation && (
                                  <div className="text-[9px] text-slate-500 font-mono">
                                    Ref: {row.citation}
                                  </div>
                                )}
                              </div>
                            </td>

                            {/* Taxon character states */}
                            {selectedTaxa.map((tax) => {
                              const matchState = row.states.find(
                                (s) => s.scientific_name.toLowerCase().trim() === tax.scientific_name.toLowerCase().trim()
                              );
                              const stateText = matchState?.state || 'Not established';
                              const isUncertain = matchState?.is_uncertain || stateText === 'Not established';

                              return (
                                <td key={tax.scientific_name} className="p-3 align-top border-l border-slate-800/60">
                                  <div className="space-y-1">
                                    <p className={`leading-relaxed text-xs ${isUncertain ? 'text-slate-500 italic' : 'text-slate-200'}`}>
                                      {stateText}
                                    </p>
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 4. Field Limitations & Variation */}
              {data.limitations && data.limitations.length > 0 && (
                <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800 space-y-2 text-xs">
                  <h4 className="font-semibold text-slate-400 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                    <HelpCircle size={13} className="text-amber-400" />
                    <span>Botanical Limitations & Variation Caveats</span>
                  </h4>
                  <ul className="list-disc list-inside space-y-1 text-slate-300 leading-relaxed">
                    {data.limitations.map((lim, i) => (
                      <li key={i}>{lim}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between text-xs text-slate-500">
          <span>Comparing a subset preserves the complete guide. All other taxa remain accessible.</span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-medium transition-colors cursor-pointer"
          >
            Close Comparison
          </button>
        </div>

      </div>
    </div>
  );
}
