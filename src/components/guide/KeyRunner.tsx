import React, { useState, useMemo } from 'react';
import { 
  ArrowRight, 
  RotateCcw, 
  ChevronLeft, 
  CheckCircle2, 
  Sparkles, 
  Compass, 
  ListTree, 
  ExternalLink,
  ChevronRight,
  BookOpen,
  AlertTriangle,
  ShieldCheck,
  Scale
} from 'lucide-react';
import { DichotomousKeyCouplet, SpeciesProfile, NavigationTarget, KeyValidationReport } from '../../types';
import { INatSpeciesImage } from '../shared/INatSpeciesImage';
import { CrossLink } from '../shared/CrossLink';
import {
  validateDichotomousKey,
  isCoupletPointer,
  normalizeCoupletId,
  findMatchingSpeciesProfile,
} from '../../utils/guideValidation';
import { collectReachableBranchTaxa } from '../../utils/guideExport';
import { getSafeExternalUrl } from '../../utils/urlValidation';

interface KeyRunnerProps {
  keyItems: DichotomousKeyCouplet[];
  speciesProfiles?: SpeciesProfile[];
  targetLocality?: string;
  onNavigate?: (target: NavigationTarget) => void;
  onCompareTaxa?: (taxaNames: string[]) => void;
  keyValidation?: KeyValidationReport;
}

interface HistoryStep {
  coupletId: string;
  choice: 'a' | 'b';
  lead: string;
  dest: string;
}

export function KeyRunner({
  keyItems,
  speciesProfiles = [],
  targetLocality,
  onNavigate,
  onCompareTaxa,
  keyValidation: providedValidation,
}: KeyRunnerProps) {
  const allCoupletIds = useMemo(() => {
    return new Set(keyItems.map((k) => normalizeCoupletId(k.couplet_id || '')));
  }, [keyItems]);

  const keyValidation = useMemo(() => {
    return providedValidation || validateDichotomousKey(keyItems, speciesProfiles);
  }, [providedValidation, keyItems, speciesProfiles]);

  const initialCoupletId = keyItems[0]?.couplet_id || '1';

  const [activeCoupletId, setActiveCoupletId] = useState<string | null>(initialCoupletId);
  const [terminalTaxon, setTerminalTaxon] = useState<string | null>(null);
  const [traversalError, setTraversalError] = useState<string | null>(null);
  const [uncertaintyMode, setUncertaintyMode] = useState<'cannot_observe' | 'neither_fits' | null>(null);
  const [history, setHistory] = useState<HistoryStep[]>([]);
  const [viewMode, setViewMode] = useState<'runner' | 'list'>('runner');

  // Find the current couplet
  const currentCouplet = useMemo(() => {
    if (!activeCoupletId) return null;
    const cleanId = normalizeCoupletId(activeCoupletId);
    return keyItems.find((k) => normalizeCoupletId(k.couplet_id || '') === cleanId) || null;
  }, [activeCoupletId, keyItems]);

  const branchPreview = useMemo(() => {
    if (!currentCouplet) return null;
    return collectReachableBranchTaxa(currentCouplet.couplet_id || '', keyItems, speciesProfiles);
  }, [currentCouplet, keyItems, speciesProfiles]);

  const cleanDestinationId = (destination: string) => {
    return destination.trim().replace(/^couplet\s+/i, '').replace(/\.$/, '').trim();
  };

  // Handle lead selection with cycle and missing-couplet protection
  const handleChooseLead = (choice: 'a' | 'b', statement: string, destination: string) => {
    const cleanDest = destination.trim();
    const currentIdNorm = normalizeCoupletId(activeCoupletId || '');
    const newStep: HistoryStep = {
      coupletId: activeCoupletId || '',
      choice,
      lead: statement,
      dest: cleanDest,
    };

    setUncertaintyMode(null);
    setHistory((prev) => [...prev, newStep]);

    if (!cleanDest) {
      setActiveCoupletId(null);
      setTerminalTaxon(null);
      setTraversalError(`Couplet ${activeCoupletId}${choice} has an empty destination.`);
      return;
    }

    if (isCoupletPointer(cleanDest, allCoupletIds)) {
      const nextId = cleanDestinationId(cleanDest);
      const nextNorm = normalizeCoupletId(nextId);

      if (!allCoupletIds.has(nextNorm)) {
        setActiveCoupletId(null);
        setTerminalTaxon(null);
        setTraversalError(
          `Broken key link: Couplet ${activeCoupletId}${choice} points to missing couplet "${nextId}". Switch to "Complete Couplet List" or step back.`
        );
        return;
      }

      const visitedInHistory = history.some((h) => normalizeCoupletId(h.coupletId) === nextNorm);
      if (nextNorm === currentIdNorm || visitedInHistory) {
        setActiveCoupletId(null);
        setTerminalTaxon(null);
        setTraversalError(
          `Cycle detected: Couplet ${activeCoupletId}${choice} loops back to Couplet "${nextId}". Traversal halted safely.`
        );
        return;
      }

      setTraversalError(null);
      setActiveCoupletId(nextId);
      setTerminalTaxon(null);
    } else {
      // Reached terminal taxon!
      setTraversalError(null);
      setActiveCoupletId(null);
      setTerminalTaxon(cleanDest);
    }
  };

  const handleStepBack = () => {
    if (history.length === 0) return;
    const newHistory = [...history];
    const lastStep = newHistory.pop()!;
    setHistory(newHistory);
    setActiveCoupletId(lastStep.coupletId);
    setTerminalTaxon(null);
    setTraversalError(null);
    setUncertaintyMode(null);
  };

  const handleJumpToStep = (index: number) => {
    if (index >= history.length) return;
    const targetStep = history[index];
    const truncatedHistory = history.slice(0, index);
    setHistory(truncatedHistory);
    setActiveCoupletId(targetStep.coupletId);
    setTerminalTaxon(null);
    setTraversalError(null);
    setUncertaintyMode(null);
  };

  const handleRestart = () => {
    setHistory([]);
    setActiveCoupletId(initialCoupletId);
    setTerminalTaxon(null);
    setTraversalError(null);
    setUncertaintyMode(null);
  };

  // Find matching species profile if terminal taxon reached
  const matchingSpeciesProfile = useMemo(() => {
    if (!terminalTaxon) return null;
    return findMatchingSpeciesProfile(terminalTaxon, speciesProfiles);
  }, [terminalTaxon, speciesProfiles]);

  if (keyItems.length === 0) {
    return <div className="text-slate-400 italic">No dichotomous key items available.</div>;
  }

  return (
    <div className="space-y-4">
      {/* Mode Switcher Tabs */}
      <div className="flex items-center justify-between gap-3 border-b border-slate-800 pb-3 print:hidden">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode('runner')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
              viewMode === 'runner'
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-950/40'
                : 'bg-slate-900/60 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            <Compass size={14} />
            <span>Interactive Key Runner</span>
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
              viewMode === 'list'
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-950/40'
                : 'bg-slate-900/60 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            <ListTree size={14} />
            <span>Complete Couplet List</span>
          </button>
        </div>

        {viewMode === 'runner' && history.length > 0 && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleStepBack}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 text-xs font-medium transition-colors"
              title="Return to previous couplet"
            >
              <ChevronLeft size={13} />
              <span>Step Back</span>
            </button>
            <button
              onClick={handleRestart}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-rose-300 border border-slate-800 text-xs font-medium transition-colors"
              title="Restart key from Couplet 1"
            >
              <RotateCcw size={12} />
              <span>Restart</span>
            </button>
          </div>
        )}
      </div>

      {/* Structural Integrity Status Banner (Distinguishes Graph Completeness from Botanical Accuracy) */}
      <div
        data-testid="key-structure-banner"
        className={`p-3.5 rounded-xl border text-xs space-y-2 ${
          keyValidation.isStructurallyValid
            ? 'bg-emerald-950/20 border-emerald-800/40 text-emerald-200'
            : 'bg-amber-950/30 border-amber-700/50 text-amber-100'
        }`}
      >
        <div className="flex items-start gap-2.5">
          {keyValidation.isStructurallyValid ? (
            <ShieldCheck size={16} className="text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" />
          )}
          <div className="space-y-1">
            <div className="font-semibold">
              {keyValidation.isStructurallyValid
                ? 'Key Structure Verified'
                : `Key Structural Issues Detected (${keyValidation.issues.length})`}
            </div>
            <p className="opacity-90 leading-relaxed">{keyValidation.validityNote}</p>
          </div>
        </div>

        {!keyValidation.isStructurallyValid && keyValidation.issues.length > 0 && (
          <ul className="list-disc list-inside space-y-1 pl-6 text-amber-200/90">
            {keyValidation.issues.map((issue, idx) => (
              <li key={idx}>{issue.message}</li>
            ))}
          </ul>
        )}
      </div>

      {/* --- RUNNER MODE --- */}
      {viewMode === 'runner' && (
        <div className="space-y-4 print:hidden animate-in fade-in duration-300">
          {/* Breadcrumb Trail of Decisions */}
          {history.length > 0 && (
            <div className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-xl flex items-center gap-1.5 overflow-x-auto text-xs [&::-webkit-scrollbar]:hidden">
              <button
                onClick={handleRestart}
                className="shrink-0 px-2 py-1 rounded-md bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 font-mono transition-colors"
              >
                Start
              </button>
              {history.map((step, idx) => (
                <React.Fragment key={idx}>
                  <ChevronRight size={12} className="text-slate-600 shrink-0" />
                  <button
                    onClick={() => handleJumpToStep(idx)}
                    className="shrink-0 px-2 py-1 rounded-md bg-slate-900/90 hover:bg-slate-800 text-slate-300 hover:text-cyan-300 border border-slate-800 text-xs font-medium transition-colors flex items-center gap-1 group"
                    title={`Jump back to Couplet ${step.coupletId}`}
                  >
                    <span className="font-mono text-cyan-400 font-bold">{step.coupletId}{step.choice}</span>
                    <span className="text-slate-500 font-mono text-[10px] group-hover:text-cyan-400">→ {step.dest}</span>
                  </button>
                </React.Fragment>
              ))}
            </div>
          )}

          {/* Active Couplet Question */}
          {currentCouplet && (
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-5">
              <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-emerald-950/60 border border-emerald-800/50 flex items-center justify-center font-mono font-bold text-emerald-400 text-sm">
                    {currentCouplet.couplet_id}
                  </div>
                  <div>
                    <h4 className="font-display font-bold text-white text-base">
                      Couplet {currentCouplet.couplet_id}
                    </h4>
                    <p className="text-xs text-slate-400">
                      Choose the lead that best matches your field specimen:
                    </p>
                  </div>
                </div>
                <span className="text-xs font-mono text-slate-500 hidden sm:inline">
                  Step {history.length + 1}
                </span>
              </div>

              {/* Two Large Tap-Friendly Lead Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Lead A */}
                <button
                  onClick={() =>
                    handleChooseLead(
                      'a',
                      currentCouplet.lead_a?.statement || '',
                      currentCouplet.lead_a?.destination || ''
                    )
                  }
                  className="group relative p-5 rounded-2xl bg-slate-950/60 hover:bg-slate-950 border border-slate-800 hover:border-cyan-500/60 transition-all duration-200 text-left flex flex-col justify-between shadow-lg hover:shadow-cyan-950/30 cursor-pointer"
                >
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="w-7 h-7 rounded-lg bg-cyan-950/60 border border-cyan-800/50 text-cyan-400 font-mono font-bold text-xs flex items-center justify-center group-hover:scale-110 transition-transform">
                        a
                      </span>
                      <span className="text-[11px] font-mono text-slate-400 bg-slate-900/80 px-2 py-0.5 rounded border border-slate-800 flex items-center gap-1 group-hover:text-cyan-300">
                        <span>Go to</span>
                        <ArrowRight size={10} />
                        <strong className="text-white font-bold">{currentCouplet.lead_a?.destination}</strong>
                      </span>
                    </div>
                    <p className="text-sm sm:text-base text-slate-200 leading-relaxed group-hover:text-white font-sans transition-colors">
                      {currentCouplet.lead_a?.statement}
                    </p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center justify-between text-xs text-slate-400 group-hover:text-cyan-400 font-medium">
                    <span>Select Lead A</span>
                    <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                  </div>
                </button>

                {/* Lead B */}
                <button
                  onClick={() =>
                    handleChooseLead(
                      'b',
                      currentCouplet.lead_b?.statement || '',
                      currentCouplet.lead_b?.destination || ''
                    )
                  }
                  className="group relative p-5 rounded-2xl bg-slate-950/60 hover:bg-slate-950 border border-slate-800 hover:border-emerald-500/60 transition-all duration-200 text-left flex flex-col justify-between shadow-lg hover:shadow-emerald-950/30 cursor-pointer"
                >
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="w-7 h-7 rounded-lg bg-emerald-950/60 border border-emerald-800/50 text-emerald-400 font-mono font-bold text-xs flex items-center justify-center group-hover:scale-110 transition-transform">
                        b
                      </span>
                      <span className="text-[11px] font-mono text-slate-400 bg-slate-900/80 px-2 py-0.5 rounded border border-slate-800 flex items-center gap-1 group-hover:text-emerald-300">
                        <span>Go to</span>
                        <ArrowRight size={10} />
                        <strong className="text-white font-bold">{currentCouplet.lead_b?.destination}</strong>
                      </span>
                    </div>
                    <p className="text-sm sm:text-base text-slate-200 leading-relaxed group-hover:text-white font-sans transition-colors">
                      {currentCouplet.lead_b?.statement}
                    </p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center justify-between text-xs text-slate-400 group-hover:text-emerald-400 font-medium">
                    <span>Select Lead B</span>
                    <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                  </div>
                </button>
              </div>

              {/* Uncertainty in the field: 'Cannot observe' and 'Neither fits' */}
              <div className="pt-3 border-t border-slate-800 space-y-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-slate-400 font-medium">Uncertainty options:</span>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setUncertaintyMode((m) => (m === 'cannot_observe' ? null : 'cannot_observe'))
                      }
                      className={`px-3 py-1.5 rounded-lg border transition-colors cursor-pointer ${
                        uncertaintyMode === 'cannot_observe'
                          ? 'bg-cyan-950/60 border-cyan-600/70 text-cyan-200 font-medium'
                          : 'bg-slate-950 hover:bg-slate-800 border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white'
                      }`}
                    >
                      I can't observe this character
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setUncertaintyMode((m) => (m === 'neither_fits' ? null : 'neither_fits'))
                      }
                      className={`px-3 py-1.5 rounded-lg border transition-colors cursor-pointer ${
                        uncertaintyMode === 'neither_fits'
                          ? 'bg-amber-950/60 border-amber-600/70 text-amber-200 font-medium'
                          : 'bg-slate-950 hover:bg-slate-800 border-slate-800 hover:border-slate-700 text-amber-300/90 hover:text-amber-200'
                      }`}
                    >
                      Neither description fits
                    </button>
                  </div>
                </div>

                {uncertaintyMode === 'cannot_observe' && branchPreview && (
                  <div
                    data-testid="key-branch-preview"
                    className="p-4 rounded-xl bg-slate-950/85 border border-cyan-800/50 text-slate-300 space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-cyan-200">
                        Remaining candidate taxa below Couplet {currentCouplet.couplet_id} ({branchPreview.combinedTaxa.length})
                      </span>
                      {onCompareTaxa && branchPreview.combinedTaxa.length >= 2 && (
                        <button
                          type="button"
                          onClick={() => onCompareTaxa(branchPreview.combinedTaxa.slice(0, 4))}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold transition-colors cursor-pointer"
                        >
                          <Scale size={12} />
                          <span>
                            Compare{' '}
                            {branchPreview.combinedTaxa.length <= 4
                              ? `all ${branchPreview.combinedTaxa.length} remaining taxa`
                              : `first 4 of ${branchPreview.combinedTaxa.length} taxa`}
                          </span>
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="p-3 rounded-lg bg-slate-900/70 border border-slate-800 space-y-1.5">
                        <div className="text-[11px] font-mono text-cyan-400 font-semibold">
                          Down Lead A ({branchPreview.leadATaxa.length})
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {branchPreview.leadATaxa.length > 0 ? (
                            branchPreview.leadATaxa.map((name) => (
                              <CrossLink
                                key={name}
                                target={{ module: 'profiles', query: name, locality: targetLocality }}
                                onNavigate={onNavigate}
                                className="italic text-slate-200 hover:text-cyan-300 text-xs"
                              >
                                {name}
                              </CrossLink>
                            ))
                          ) : (
                            <span className="text-slate-500 italic">No resolved taxa down Lead A</span>
                          )}
                        </div>
                      </div>

                      <div className="p-3 rounded-lg bg-slate-900/70 border border-slate-800 space-y-1.5">
                        <div className="text-[11px] font-mono text-emerald-400 font-semibold">
                          Down Lead B ({branchPreview.leadBTaxa.length})
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {branchPreview.leadBTaxa.length > 0 ? (
                            branchPreview.leadBTaxa.map((name) => (
                              <CrossLink
                                key={name}
                                target={{ module: 'profiles', query: name, locality: targetLocality }}
                                onNavigate={onNavigate}
                                className="italic text-slate-200 hover:text-emerald-300 text-xs"
                              >
                                {name}
                              </CrossLink>
                            ))
                          ) : (
                            <span className="text-slate-500 italic">No resolved taxa down Lead B</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      If this organ is missing on your specimen, compare the remaining taxa above using alternative characters, or inspect downstream leads in Complete Couplet List.
                    </p>
                  </div>
                )}

                {uncertaintyMode === 'neither_fits' && (
                  <div className="p-3.5 rounded-xl bg-slate-950/80 border border-amber-800/50 text-slate-300 leading-relaxed space-y-2">
                    <p>
                      If neither lead fits: (1) re-check fine characters (trichomes, glands, leaf attachment) with a 10x hand lens; (2) consider juvenile morphology, hybrids, or an unkeyed congener; (3) step back one couplet or compare the remaining taxa directly.
                    </p>
                    {onCompareTaxa && branchPreview && branchPreview.combinedTaxa.length >= 2 && (
                      <button
                        type="button"
                        onClick={() => onCompareTaxa(branchPreview.combinedTaxa.slice(0, 4))}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-cyan-300 border border-slate-700 text-xs font-medium cursor-pointer"
                      >
                        <Scale size={12} />
                        <span>Compare remaining candidates ({Math.min(4, branchPreview.combinedTaxa.length)})</span>
                      </button>
                    )}
                  </div>
                )}

                {(() => {
                  const safeUrls = (currentCouplet.source_urls || [])
                    .map((uri) => getSafeExternalUrl(uri))
                    .filter((uri): uri is string => uri !== null)
                    .slice(0, 3);
                  if (safeUrls.length === 0) return null;
                  return (
                    <div className="pt-2 border-t border-slate-800/70 flex flex-wrap items-center gap-2">
                      <span className="text-[11px] text-slate-400 font-mono">Supporting sources:</span>
                      {safeUrls.map((uri, sIdx) => (
                        <a
                          key={`${uri}-${sIdx}`}
                          href={uri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-950 hover:bg-slate-800 border border-slate-700 text-[11px] text-cyan-300"
                        >
                          <ExternalLink size={10} />
                          <span className="truncate max-w-[200px]">{uri.replace(/^https?:\/\/(www\.)?/, '')}</span>
                        </a>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {/* Broken Traversal State (Missing destination or cycle halted safely) */}
          {traversalError && (
            <div className="p-5 rounded-2xl bg-rose-950/30 border border-rose-800/60 text-rose-100 space-y-3">
              <div className="flex items-center gap-2 font-semibold text-rose-300">
                <AlertTriangle size={18} />
                <span>Key Traversal Halted</span>
              </div>
              <p className="text-xs text-rose-200 leading-relaxed">{traversalError}</p>
              <div className="flex flex-wrap gap-2 pt-1">
                {history.length > 0 && (
                  <button
                    type="button"
                    onClick={handleStepBack}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 text-xs font-medium cursor-pointer"
                  >
                    <ChevronLeft size={13} /> Step Back
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleRestart}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-rose-800/70 hover:bg-rose-700 text-white border border-rose-600 text-xs font-medium cursor-pointer"
                >
                  <RotateCcw size={13} /> Restart Key
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-cyan-300 border border-slate-700 text-xs font-medium cursor-pointer"
                >
                  <ListTree size={13} /> View Complete Couplet List
                </button>
              </div>
            </div>
          )}

          {/* Terminal Taxon Card (Resolved Identification) */}
          {terminalTaxon && (
            <div className="bg-gradient-to-b from-emerald-950/40 to-slate-900/80 border-2 border-emerald-500/40 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 animate-in zoom-in-95 duration-300">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-emerald-800/30">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                    <CheckCircle2 size={28} />
                  </div>
                  <div>
                    <h3 className="font-display text-2xl sm:text-3xl font-bold text-white mt-0.5">
                      <i className="font-serif text-cyan-300">{terminalTaxon}</i>
                    </h3>
                  </div>
                </div>

                <button
                  onClick={handleRestart}
                  className="self-start sm:self-auto inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700 text-xs font-semibold transition-colors"
                >
                  <RotateCcw size={13} />
                  <span>Run Key Again</span>
                </button>
              </div>

              {/* Embedded Species Summary & Photo if profile exists */}
              {matchingSpeciesProfile ? (
                <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center">
                  <div className="md:col-span-4">
                    <INatSpeciesImage
                      scientificName={matchingSpeciesProfile.scientific_name || terminalTaxon}
                      className="w-full shadow-lg border border-slate-800"
                      aspectRatio="aspect-[4/3]"
                    />
                  </div>
                  <div className="md:col-span-8 space-y-3">
                    {matchingSpeciesProfile.common_name && (
                      <div className="text-base text-cyan-400 font-medium">
                        Common Name: {matchingSpeciesProfile.common_name}
                      </div>
                    )}
                    {((matchingSpeciesProfile.accepted_name &&
                      matchingSpeciesProfile.accepted_name !== matchingSpeciesProfile.scientific_name) ||
                      (matchingSpeciesProfile.synonyms && matchingSpeciesProfile.synonyms.length > 0)) && (
                      <div className="text-xs text-slate-400 italic">
                        {matchingSpeciesProfile.accepted_name &&
                          matchingSpeciesProfile.accepted_name !== matchingSpeciesProfile.scientific_name && (
                            <span>Accepted name: {matchingSpeciesProfile.accepted_name}. </span>
                          )}
                        {matchingSpeciesProfile.synonyms && matchingSpeciesProfile.synonyms.length > 0 && (
                          <span>Synonyms: {matchingSpeciesProfile.synonyms.join(', ')}</span>
                        )}
                      </div>
                    )}
                    {matchingSpeciesProfile.key_diagnostics && (
                      <div className="text-xs text-slate-300 bg-slate-950/60 p-3.5 rounded-xl border border-slate-800">
                        <strong className="text-slate-400 uppercase tracking-wider block text-[10px] mb-1">
                          Diagnostic Confirmation:
                        </strong>
                        {matchingSpeciesProfile.key_diagnostics}
                      </div>
                    )}
                    {matchingSpeciesProfile.habitat_and_ecology && (
                      <div className="text-xs text-slate-400">
                        <strong className="text-slate-300">Habitat:</strong> {matchingSpeciesProfile.habitat_and_ecology}
                      </div>
                    )}

                    <div className="pt-2 flex flex-wrap items-center gap-3">
                      {onNavigate && (
                        <button
                          onClick={() =>
                            onNavigate({
                              module: 'profiles',
                              query: matchingSpeciesProfile.scientific_name || terminalTaxon,
                              locality: targetLocality,
                            })
                          }
                          className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-semibold shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer"
                        >
                          <BookOpen size={14} />
                          <span>Explore Full Taxon Profile</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm text-slate-300">
                    Your sequence of diagnostic decisions matches{' '}
                    <strong className="text-cyan-300 italic font-serif">{terminalTaxon}</strong>.
                  </p>
                  {onNavigate && (
                    <button
                      onClick={() =>
                        onNavigate({
                          module: 'profiles',
                          query: terminalTaxon,
                          locality: targetLocality,
                        })
                      }
                      className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-semibold shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer"
                    >
                      <BookOpen size={14} />
                      <span>Explore Taxon Profile</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* --- COMPLETE COUPLET LIST (FULL STATIC VIEW & PRINT COMPLIANT) --- */}
      {(viewMode === 'list' || typeof window === 'undefined') && (
        <div className="font-mono text-sm leading-relaxed text-slate-300 pt-2">
          {keyItems.map((couplet, i) => {
            const renderDestination = (dest: string) => {
              const cleanDest = (dest || '').trim();
              if (isCoupletPointer(cleanDest, allCoupletIds)) {
                const targetId = cleanDestinationId(cleanDest);
                return (
                  <button
                    type="button"
                    onClick={() => {
                      setViewMode('runner');
                      setActiveCoupletId(targetId);
                      setTerminalTaxon(null);
                      setTraversalError(null);
                      setUncertaintyMode(null);
                    }}
                    className="text-cyan-400 font-bold hover:underline cursor-pointer"
                    title={`Jump to Couplet ${targetId} in Runner`}
                  >
                    {cleanDest}
                  </button>
                );
              }
              return (
                <CrossLink
                  target={{ module: 'profiles', query: cleanDest, locality: targetLocality }}
                  onNavigate={onNavigate}
                  className="italic text-cyan-400 font-bold hover:underline underline-offset-4 text-right justify-self-end mt-1 md:mt-0"
                >
                  {cleanDest}
                </CrossLink>
              );
            };

            return (
              <div key={i} className="mb-4 pl-4 border-l-2 border-slate-700/50 hover:border-slate-500 transition-colors">
                <div className="font-bold text-slate-400 mb-1 flex items-center justify-between">
                  <span>{couplet.couplet_id || ''}.</span>
                  <button
                    onClick={() => {
                      setViewMode('runner');
                      setActiveCoupletId((couplet.couplet_id || '').trim());
                      setTerminalTaxon(null);
                    }}
                    className="text-[11px] font-sans text-slate-500 hover:text-cyan-400 print:hidden transition-colors"
                  >
                    Start from here →
                  </button>
                </div>
                <div className="flex flex-col md:flex-row md:justify-between items-start md:items-end gap-1 md:gap-4 mb-3 group">
                  <div className="flex-1">
                    <span className="text-slate-500 mr-2">a.</span>
                    <span className="group-hover:text-cyan-200 transition-colors">{couplet.lead_a?.statement || ''}</span>
                  </div>
                  <div className="shrink-0 md:self-end md:mb-0.5 self-start ml-6 md:ml-0 flex">
                    {renderDestination(couplet.lead_a?.destination || '')}
                  </div>
                </div>
                <div className="flex flex-col md:flex-row md:justify-between items-start md:items-end gap-1 md:gap-4 group">
                  <div className="flex-1">
                    <span className="text-slate-500 mr-2">b.</span>
                    <span className="group-hover:text-cyan-200 transition-colors">{couplet.lead_b?.statement || ''}</span>
                  </div>
                  <div className="shrink-0 md:self-end md:mb-0.5 self-start ml-6 md:ml-0 flex">
                    {renderDestination(couplet.lead_b?.destination || '')}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
