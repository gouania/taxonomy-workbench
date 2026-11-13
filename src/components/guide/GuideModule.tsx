import React, { useState, useCallback, useEffect, useRef } from 'react';
import { BookOpen, Code2, Map, Sparkles, Bookmark, Trash2, ArrowRight, Loader2, AlertCircle, RotateCcw } from 'lucide-react';
import { InputPanel } from './InputPanel';
import { ResultPanel } from './ResultPanel';
import { BuilderPanel, PRESET_FILTERS } from './BuilderPanel';
import { StructuredResultPanel } from './StructuredResultPanel';
import { generateTaxonGuide, generateStructuredTaxonGuide } from '../../services/geminiService';
import { historyFavoritesService } from '../../services/historyFavoritesService';
import { AppStatus, GeneratedGuide, GeneratedGuideStructured, NavigationTarget, CoverageScope, SavedGuide, GroundingSource, SourceProvenance, PlaceRef } from '../../types';
import { SAMPLE_DATA } from '../../constants';
import { PlaceContextChip } from '../shared/PlaceContextChip';

interface GuideModuleProps {
  onNavigate?: (target: NavigationTarget) => void;
  initialTaxon?: string;
  initialLocality?: string;
  initialPlace?: PlaceRef;
  initialSpecimenContext?: string;
  navRequestId?: number;
}

export function GuideModule({
  onNavigate,
  initialTaxon,
  initialLocality,
  initialPlace,
  initialSpecimenContext,
  navRequestId,
}: GuideModuleProps) {
  const [activeTab, setActiveTab] = useState<'custom' | 'builder'>('builder');

  // Custom Prompt state
  const [input, setInput] = useState<string>('');
  const [customStatus, setCustomStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [customResult, setCustomResult] = useState<(GeneratedGuide & { sources?: GroundingSource[]; provenance?: SourceProvenance }) | null>(null);

  // Builder state
  const [taxon, setTaxon] = useState<string>(initialTaxon || '');
  const [locality, setLocality] = useState<string>(initialPlace?.displayName || initialLocality || '');
  const [activePlace, setActivePlace] = useState<PlaceRef | null>(
    initialPlace || (initialLocality ? { displayName: initialLocality, scopeType: 'unknown' } : null)
  );
  const [coverageScope, setCoverageScope] = useState<CoverageScope>('comprehensive');
  const [selectedFilters, setSelectedFilters] = useState<string[]>([]);
  const [customFilter, setCustomFilter] = useState<string>(initialSpecimenContext || '');
  const [specimenContextBanner, setSpecimenContextBanner] = useState<string | null>(
    initialSpecimenContext || null
  );
  const [builderStatus, setBuilderStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [builderResult, setBuilderResult] = useState<{result: GeneratedGuideStructured, sources: any[], activeFilters?: string[]} | null>(null);
  const [builderError, setBuilderError] = useState<string | null>(null);

  const localityInputRef = useRef<HTMLInputElement | null>(null);
  const taxonInputRef = useRef<HTMLInputElement | null>(null);

  // Saved Guides on device
  const [savedGuides, setSavedGuides] = useState<SavedGuide[]>([]);
  const [showSavedGuidesDrawer, setShowSavedGuidesDrawer] = useState(false);
  const [isEditingRequest, setIsEditingRequest] = useState(false);

  const loadSavedGuides = useCallback(() => {
    setSavedGuides(historyFavoritesService.getSavedGuides());
  }, []);

  useEffect(() => {
    loadSavedGuides();
    const handleSavedUpdated = () => loadSavedGuides();
    window.addEventListener('saved-guides-updated', handleSavedUpdated);
    return () => window.removeEventListener('saved-guides-updated', handleSavedUpdated);
  }, [loadSavedGuides]);

  useEffect(() => {
    const resolvedLocality = initialPlace?.displayName || initialLocality;
    if (initialTaxon || resolvedLocality || initialPlace || initialSpecimenContext) {
      setActiveTab('builder');
      if (initialTaxon !== undefined) {
        setTaxon(initialTaxon);
      } else if (resolvedLocality) {
        // Locality-only handoff: clear unrelated taxon so the user can enter a plant group for this place
        setTaxon('');
      }

      if (initialPlace) {
        setActivePlace(initialPlace);
        setLocality(initialPlace.displayName);
      } else if (resolvedLocality) {
        setActivePlace({ displayName: resolvedLocality, scopeType: 'unknown' });
        setLocality(resolvedLocality);
      }

      if (initialSpecimenContext) {
        setCustomFilter(initialSpecimenContext);
        setSpecimenContextBanner(initialSpecimenContext);
      } else {
        setSpecimenContextBanner(null);
      }

      setBuilderStatus(AppStatus.IDLE);
      setBuilderResult(null);
      setBuilderError(null);
      setIsEditingRequest(false);

      if (resolvedLocality && !initialTaxon) {
        setTimeout(() => taxonInputRef.current?.focus(), 50);
      }
    }
  }, [initialTaxon, initialLocality, initialPlace, initialSpecimenContext, navRequestId]);

  const handleGenerateCustom = useCallback(async () => {
    if (!input.trim()) return;
    setCustomStatus(AppStatus.LOADING);
    setCustomResult(null);

    try {
      const { result, sources, provenance } = await generateTaxonGuide(input, true);
      setCustomResult({ markdown: result, sources, provenance });
      setCustomStatus(AppStatus.SUCCESS);
    } catch (error) {
      console.error(error);
      setCustomStatus(AppStatus.ERROR);
    }
  }, [input]);

  const handleClearCustom = useCallback(() => {
    setInput('');
    setCustomStatus(AppStatus.IDLE);
    setCustomResult(null);
  }, []);

  const handleSampleCustom = useCallback(() => {
    setInput(SAMPLE_DATA);
  }, []);

  const handleGenerateBuilder = useCallback(async () => {
    if (!taxon.trim() || !locality.trim()) return;
    setBuilderStatus(AppStatus.LOADING);
    setBuilderError(null);

    // Collect active filters descriptions
    const filtersToPass: string[] = [];
    selectedFilters.forEach(fId => {
      const preset = PRESET_FILTERS.find(p => p.id === fId);
      if (preset) {
        filtersToPass.push(preset.label);
      }
    });
    if (customFilter.trim()) {
      filtersToPass.push(customFilter.trim());
    }

    try {
      const res = await generateStructuredTaxonGuide(taxon, locality, true, filtersToPass, coverageScope);
      setBuilderResult({
        ...res,
        activeFilters: filtersToPass
      });
      setBuilderStatus(AppStatus.SUCCESS);
      setIsEditingRequest(false);
    } catch (error: any) {
      console.error(error);
      setBuilderError(error?.message || String(error));
      setBuilderStatus(AppStatus.ERROR);
    }
  }, [taxon, locality, selectedFilters, customFilter, coverageScope]);

  const handleLocalityChange = useCallback((value: string) => {
    setLocality(value);
    if (!value.trim()) {
      setActivePlace(null);
    } else {
      setActivePlace((prev) =>
        prev && prev.displayName === value.trim()
          ? prev
          : { displayName: value.trim(), scopeType: 'unknown' }
      );
    }
  }, []);

  const handleClearBuilder = useCallback(() => {
    setTaxon('');
    setLocality('');
    setActivePlace(null);
    setCoverageScope('comprehensive');
    setSelectedFilters([]);
    setCustomFilter('');
    setSpecimenContextBanner(null);
    setBuilderStatus(AppStatus.IDLE);
    setBuilderResult(null);
    setBuilderError(null);
    setIsEditingRequest(false);
  }, []);

  const handleLoadSavedGuide = (saved: SavedGuide) => {
    setActiveTab('builder');
    setTaxon(saved.target_taxon);
    setLocality(saved.target_locality);
    if (saved.activeFilters) {
      // Keep any active filters
    }
    setBuilderResult({
      result: saved.guide,
      sources: saved.sources || [],
      activeFilters: saved.activeFilters,
    });
    setBuilderStatus(AppStatus.SUCCESS);
    setIsEditingRequest(false);
    setShowSavedGuidesDrawer(false);
  };

  const handleRemoveSavedGuide = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    historyFavoritesService.removeSavedGuide(id);
  };

  const hasSuccessfulResult =
    activeTab === 'custom'
      ? customStatus === AppStatus.SUCCESS
      : Boolean(builderResult) || builderStatus === AppStatus.SUCCESS;

  const isPreservingBuilderDuringUpdate =
    activeTab === 'builder' &&
    Boolean(builderResult) &&
    (builderStatus === AppStatus.LOADING || builderStatus === AppStatus.ERROR);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-in fade-in duration-500">
      
      {/* Contemporary Botanical Handbook Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 text-center md:text-left print:hidden">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center shadow-lg mx-auto md:mx-0">
            <BookOpen size={24} className="text-cyan-400" />
          </div>
          <div>
            <h1 className="font-display text-3xl font-bold text-white tracking-tight">
              Guides
            </h1>
            <p className="text-slate-400 text-sm md:text-base">
              Interactive regional dichotomous keys, diagnostic taxa profiles, and subset comparison.
            </p>
          </div>
        </div>

        {/* Tab Controls & Saved Guides Button */}
        <div className="flex flex-wrap items-center gap-2 justify-center md:justify-end">
          {savedGuides.length > 0 && (
            <button
              onClick={() => setShowSavedGuidesDrawer(!showSavedGuidesDrawer)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-cyan-300 border border-slate-800 text-xs font-semibold transition-all cursor-pointer"
            >
              <Bookmark size={14} className="text-amber-400" />
              <span>Saved on this device ({savedGuides.length})</span>
            </button>
          )}

          <div className="flex items-center gap-1 bg-slate-900/50 p-1.5 rounded-xl border border-slate-800/50">
            <button
              onClick={() => setActiveTab('builder')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'builder' 
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' 
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Map size={14} />
              Guide by group and locality
            </button>
            <button
              onClick={() => setActiveTab('custom')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'custom' 
                  ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' 
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Code2 size={14} />
              Guide from text or instructions
            </button>
          </div>
        </div>
      </div>

      {/* Saved Guides Drawer / Bar if requested */}
      {showSavedGuidesDrawer && savedGuides.length > 0 && (
        <div className="mb-6 p-4 rounded-2xl bg-slate-900/90 border border-slate-800 animate-in fade-in slide-in-from-top-2 duration-200 print:hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3 pb-2 border-b border-slate-800 text-xs">
            <span className="font-semibold text-slate-200 flex items-center gap-1.5">
              <Bookmark size={14} className="text-amber-400" />
              Saved on this device
            </span>
            <span className="text-slate-400 font-mono text-[11px]">Stored in this browser only — does not sync across devices. Select a guide to open it.</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {savedGuides.map((sg) => (
              <div
                key={sg.id}
                onClick={() => handleLoadSavedGuide(sg)}
                className="p-3 rounded-xl bg-slate-950/60 hover:bg-slate-950 border border-slate-800 hover:border-cyan-500/50 cursor-pointer flex items-center justify-between gap-3 group transition-all"
              >
                <div className="min-w-0">
                  <h4 className="font-serif italic font-bold text-cyan-300 text-sm truncate">
                    {sg.target_taxon}
                  </h4>
                  <p className="text-slate-400 text-xs truncate">
                    {sg.target_locality} • {sg.guide?.species_profiles?.length || 0} taxa
                  </p>
                </div>
                <button
                  type="button"
                  onClick={(e) => handleRemoveSavedGuide(sg.id, e)}
                  className="p-1 text-slate-500 hover:text-rose-400 transition-colors"
                  title="Remove saved guide"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active Shared Place Chip & Optional Specimen Context */}
      {activeTab === 'builder' && (activePlace || locality.trim() || specimenContextBanner) && (
        <div className="mb-4 space-y-2.5 print:hidden">
          {(activePlace || locality.trim()) && (
            <PlaceContextChip
              place={activePlace}
              fallbackLabel={locality}
              onOpenOverview={
                onNavigate
                  ? () =>
                      onNavigate({
                        module: 'localities',
                        query: activePlace?.displayName || locality.trim(),
                        place: activePlace || undefined,
                      })
                  : undefined
              }
              onChange={() => {
                setIsEditingRequest(true);
                setTimeout(() => localityInputRef.current?.focus(), 60);
              }}
              onClear={() => {
                setLocality('');
                setActivePlace(null);
              }}
            />
          )}

          {specimenContextBanner && (
            <div
              data-testid="guide-specimen-context-banner"
              className="p-3 rounded-xl bg-cyan-950/30 border border-cyan-800/50 text-xs text-cyan-200 flex flex-wrap items-start justify-between gap-3"
            >
              <div className="space-y-1 flex-1 min-w-[220px]">
                <div className="font-semibold text-cyan-300">
                  Specimen observations carried from Identify
                </div>
                <p className="text-slate-300 line-clamp-2">{specimenContextBanner}</p>
                <p className="text-[11px] text-slate-400">
                  Carried as a starting criterion under Other Custom Criteria. A regional guide is a candidate reference set, not independent confirmation or proof against unlisted taxa.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSpecimenContextBanner(null);
                  setCustomFilter('');
                }}
                className="px-2.5 py-1 rounded-lg bg-slate-900/80 hover:bg-slate-800 text-slate-300 border border-slate-700 text-[11px] cursor-pointer shrink-0"
              >
                Clear specimen filter
              </button>
            </div>
          )}
        </div>
      )}

      {/* Layout: When results exist, results occupy full or dominant width */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left: Request Form (Collapsible when results exist) */}
        {(!hasSuccessfulResult || isEditingRequest) && (
          <div className={`transition-all duration-300 ease-in-out z-0 print:hidden ${
            hasSuccessfulResult ? 'lg:col-span-4' : 'lg:col-span-5'
          }`}>
            {activeTab === 'custom' ? (
              <InputPanel 
                input={input}
                setInput={setInput}
                onGenerate={handleGenerateCustom}
                onClear={handleClearCustom}
                onSample={handleSampleCustom}
                isLoading={customStatus === AppStatus.LOADING}
              />
            ) : (
              <div className="space-y-4">
                <BuilderPanel
                  taxon={taxon}
                  setTaxon={setTaxon}
                  locality={locality}
                  setLocality={handleLocalityChange}
                  coverageScope={coverageScope}
                  setCoverageScope={setCoverageScope}
                  selectedFilters={selectedFilters}
                  setSelectedFilters={setSelectedFilters}
                  customFilter={customFilter}
                  setCustomFilter={setCustomFilter}
                  onGenerate={handleGenerateBuilder}
                  onClear={handleClearBuilder}
                  isLoading={builderStatus === AppStatus.LOADING}
                  taxonInputRef={taxonInputRef}
                  localityInputRef={localityInputRef}
                />
                {hasSuccessfulResult && isEditingRequest && (
                  <button
                    type="button"
                    onClick={() => setIsEditingRequest(false)}
                    className="w-full py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 text-xs font-medium transition-colors"
                  >
                    Cancel Editing (Keep Current Guide)
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Right: Working Tool Results (Expanded width when results exist) */}
        <div className={`transition-all duration-300 ease-in-out ${
          !hasSuccessfulResult
            ? 'lg:col-span-7'
            : isEditingRequest
            ? 'lg:col-span-8'
            : 'lg:col-span-12'
        }`}>
          {activeTab === 'custom' ? (
            <ResultPanel 
              status={customStatus}
              markdown={customResult?.markdown || ''}
              sources={customResult?.sources}
              provenance={customResult?.provenance}
            />
          ) : (
            <div className="space-y-4">
              {isPreservingBuilderDuringUpdate && (
                <div
                  data-testid="regeneration-status-banner"
                  className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs print:hidden ${
                    builderStatus === AppStatus.LOADING
                      ? 'bg-cyan-950/30 border-cyan-800/50 text-cyan-200'
                      : 'bg-rose-950/30 border-rose-800/60 text-rose-200'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    {builderStatus === AppStatus.LOADING ? (
                      <Loader2 size={16} className="animate-spin text-cyan-400 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle size={16} className="text-rose-400 shrink-0 mt-0.5" />
                    )}
                    <div className="space-y-0.5">
                      <div className="font-semibold">
                        {builderStatus === AppStatus.LOADING
                          ? 'Regenerating guide while preserving your current view...'
                          : 'Guide regeneration failed — previous guide preserved'}
                      </div>
                      {builderStatus === AppStatus.ERROR && builderError && (
                        <p className="text-rose-300">{builderError}</p>
                      )}
                    </div>
                  </div>

                  {builderStatus === AppStatus.ERROR && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={handleGenerateBuilder}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-700 hover:bg-rose-600 text-white font-semibold transition-colors cursor-pointer"
                      >
                        <RotateCcw size={12} />
                        <span>Retry</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setBuilderError(null);
                          setBuilderStatus(AppStatus.SUCCESS);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 font-medium transition-colors cursor-pointer"
                      >
                        Dismiss &amp; Keep Current Guide
                      </button>
                    </div>
                  )}
                </div>
              )}

              <StructuredResultPanel 
                status={builderResult ? AppStatus.SUCCESS : builderStatus}
                guide={builderResult?.result || null}
                sources={builderResult?.sources}
                onNavigate={onNavigate}
                error={builderError}
                activeFilters={builderResult?.activeFilters}
                onEditRequest={hasSuccessfulResult ? () => setIsEditingRequest(!isEditingRequest) : undefined}
              />
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
