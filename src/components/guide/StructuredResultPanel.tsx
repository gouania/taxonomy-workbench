import React, { useState, useMemo } from 'react';
import Markdown from 'react-markdown';
import { 
  Loader2, 
  AlertCircle, 
  ListTree, 
  Info, 
  MapPin, 
  Camera, 
  FileText, 
  Sprout, 
  Filter, 
  BookOpen, 
  CheckSquare, 
  Square, 
  SlidersHorizontal, 
  X, 
  Sparkles,
  ArrowRight,
  Bookmark,
  Printer,
  ChevronDown,
  ChevronUp,
  Search
} from 'lucide-react';
import { AppStatus, GeneratedGuideStructured, NavigationTarget, GuideSubsetComparison, SpeciesProfile } from '../../types';
import { SourcesBar } from '../shared/SourcesBar';
import { CrossLink } from '../shared/CrossLink';
import { INatSpeciesImage } from '../shared/INatSpeciesImage';
import { LiteratureSection } from '../shared/LiteratureSection';
import { KeyRunner } from './KeyRunner';
import { GuideSubsetModal } from './GuideSubsetModal';
import { compareGuideTaxa } from '../../services/geminiService';
import { historyFavoritesService } from '../../services/historyFavoritesService';

interface StructuredResultPanelProps {
  status: AppStatus;
  guide: GeneratedGuideStructured | null;
  sources?: any[];
  onNavigate?: (target: NavigationTarget) => void;
  error?: string | null;
  activeFilters?: string[];
  onEditRequest?: () => void;
}

function cleanTipText(text: string): string {
  const cleaned = text.replace(/^(PHOTOGRAPH|COLLECT|RECORD\s+NOTES|NOTES|FIELD\s+NOTES|RECORD|WRITE)\s*[:\-]\s*/i, '');
  if (!cleaned) return text;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function getFieldworkCategory(text: string) {
  const lower = text.toLowerCase();
  
  if (
    lower.includes('photo') || 
    lower.includes('camera') || 
    lower.includes('image') || 
    lower.includes('shoot') || 
    lower.includes('close-up') || 
    lower.includes('picture') || 
    lower.includes('lens') ||
    lower.includes('macro') ||
    lower.includes('magnification')
  ) {
    return {
      label: 'Photograph',
      icon: <Camera size={11} />,
      badgeClass: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
      iconClass: 'text-cyan-400 bg-cyan-950/30 border-cyan-900/40'
    };
  }

  if (
    lower.includes('collect') || 
    lower.includes('harvest') || 
    lower.includes('voucher') || 
    lower.includes('specimen') || 
    lower.includes('press') || 
    lower.includes('physical') || 
    lower.includes('sample') || 
    lower.includes('twig') || 
    lower.includes('branch') || 
    lower.includes('deposit') || 
    lower.includes('bag') ||
    lower.includes('herbarium')
  ) {
    return {
      label: 'Collect',
      icon: <Sprout size={11} />,
      badgeClass: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
      iconClass: 'text-amber-400 bg-amber-950/30 border-amber-900/40'
    };
  }

  return {
    label: 'Record Notes',
    icon: <FileText size={11} />,
    badgeClass: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
    iconClass: 'text-indigo-400 bg-indigo-950/30 border-indigo-900/40'
  };
}

export function StructuredResultPanel({
  status,
  guide,
  sources,
  onNavigate,
  error,
  activeFilters,
  onEditRequest,
}: StructuredResultPanelProps) {
  // Navigation tabs within working tool: Taxa, Identification Key, Field Notes, Sources
  const [activeSection, setActiveSection] = useState<'taxa' | 'key' | 'notes' | 'sources'>('taxa');
  
  // Taxon selection for 2–4 subset comparison
  const [selectedTaxonNames, setSelectedTaxonNames] = useState<Set<string>>(new Set());
  const [taxonFilterQuery, setTaxonFilterQuery] = useState('');
  const [showOverviewDetails, setShowOverviewDetails] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState(false);

  // Comparison modal state
  const [isCompareModalOpen, setIsCompareModalOpen] = useState(false);
  const [isComparing, setIsComparing] = useState(false);
  const [compareData, setCompareData] = useState<GuideSubsetComparison | null>(null);
  const [compareError, setCompareError] = useState<string | null>(null);

  if (status === AppStatus.IDLE) {
    return (
      <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-8 shadow-xl backdrop-blur-sm h-full flex flex-col items-center justify-center text-center min-h-[400px]">
        <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center mb-6">
          <ListTree size={32} className="text-slate-600" />
        </div>
        <h3 className="text-xl font-semibold text-white mb-2">Ready to Build Key</h3>
        <p className="text-slate-400 max-w-md">
          Enter a Taxon and Locality to generate a regional dichotomous key and diagnostic identification guide.
        </p>
      </div>
    );
  }

  if (status === AppStatus.LOADING) {
    return (
      <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-8 shadow-xl backdrop-blur-sm h-full flex flex-col items-center justify-center text-center min-h-[400px]">
        <Loader2 size={48} className="text-cyan-500 animate-spin mb-6" />
        <h3 className="text-xl font-semibold text-white mb-2">Synthesizing Regional Botanical Guide...</h3>
        <p className="text-slate-400 max-w-md text-sm leading-relaxed">
          Aggregating regional occurrences, cross-referencing diagnostic morphology, and constructing interactive couplets.
        </p>
      </div>
    );
  }

  if (status === AppStatus.ERROR || !guide || !guide.guide_metadata) {
    return (
      <div className="bg-rose-950/30 border border-rose-900/50 rounded-2xl p-8 shadow-xl backdrop-blur-sm h-full flex flex-col items-center justify-center text-center min-h-[400px]">
        <div className="w-16 h-16 rounded-full bg-rose-900/50 flex items-center justify-center mb-6">
          <AlertCircle size={32} className="text-rose-400" />
        </div>
        <h3 className="text-xl font-semibold text-white mb-2">Generation Failed</h3>
        <p className="text-rose-300 max-w-md text-sm">
          {error || "There was an error generating the structured guide. Please check network connectivity and try again."}
        </p>
      </div>
    );
  }

  const targetTaxon = guide.guide_metadata?.target_taxon || 'Unknown Taxon';
  const targetLocality = guide.guide_metadata?.target_locality || 'Unknown Locality';
  const overview = guide.taxon_overview || '';
  const keyItems = guide.dichotomous_key || [];
  const profiles = guide.species_profiles || [];

  // Filter profiles by in-list search without affecting subset selections
  const filteredProfiles = profiles.filter((sp) => {
    if (!taxonFilterQuery.trim()) return true;
    const q = taxonFilterQuery.toLowerCase();
    return (
      (sp.scientific_name || '').toLowerCase().includes(q) ||
      (sp.common_name || '').toLowerCase().includes(q) ||
      (sp.key_diagnostics || '').toLowerCase().includes(q)
    );
  });

  const handleToggleSelectTaxon = (sciName: string) => {
    setSelectedTaxonNames((prev) => {
      const next = new Set(prev);
      if (next.has(sciName)) {
        next.delete(sciName);
      } else {
        if (next.size >= 4) {
          alert('You can compare a maximum of 4 taxa at once for a clear, readable matrix.');
          return prev;
        }
        next.add(sciName);
      }
      return next;
    });
  };

  const handleClearSelection = () => {
    setSelectedTaxonNames(new Set());
  };

  // Selected taxa objects
  const selectedTaxaList: SpeciesProfile[] = profiles.filter((sp) =>
    selectedTaxonNames.has(sp.scientific_name)
  );

  const handleLaunchCompare = async () => {
    if (selectedTaxonNames.size < 2) return;
    setIsCompareModalOpen(true);
    setIsComparing(true);
    setCompareError(null);

    const litTitles = (guide.recommended_literature || []).map((l) => l.citation);

    try {
      const res = await compareGuideTaxa(
        selectedTaxaList,
        targetLocality,
        activeFilters || [],
        litTitles
      );
      setCompareData(res.result);
      setIsComparing(false);
    } catch (err: any) {
      console.error(err);
      setCompareError(err?.message || 'Failed to synthesize subset comparison');
      setIsComparing(false);
    }
  };

  const handleSaveGuideLocally = () => {
    historyFavoritesService.saveGuide({
      title: `${targetTaxon} in ${targetLocality}`,
      target_taxon: targetTaxon,
      target_locality: targetLocality,
      guide,
      sources,
      activeFilters,
    });
    setSaveSuccessMsg(true);
    setTimeout(() => setSaveSuccessMsg(false), 3000);
  };

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl shadow-xl overflow-hidden print:bg-white print:text-black print:border-none print:shadow-none">
      
      {/* Contemporary Field Handbook Compact Context Header */}
      <div className="p-5 sm:p-6 border-b border-slate-800 bg-slate-950/70 print:border-slate-300">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1.5 text-xs text-slate-400 font-mono">
              <span className="inline-flex items-center gap-1 text-slate-300 font-semibold">
                <MapPin size={13} className="text-cyan-400" />
                {targetLocality}
              </span>
              <span>•</span>
              <span className="text-cyan-400 font-semibold">{profiles.length} taxa treated</span>
              {guide.guide_metadata?.coverage_scope && (
                <>
                  <span>•</span>
                  <span className="text-slate-400 truncate max-w-sm" title={guide.guide_metadata.coverage_scope}>
                    {guide.guide_metadata.coverage_scope}
                  </span>
                </>
              )}
            </div>

            <h1 className="text-2xl sm:text-3xl font-display font-bold text-white print:text-black flex items-center gap-2">
              <span>Identification Guide to</span>
              <i className="text-cyan-400 font-serif font-normal print:text-black">{targetTaxon}</i>
            </h1>
          </div>

          {/* Quick utility actions: Save on device, Print, Edit request */}
          <div className="flex flex-wrap items-center gap-2 self-start md:self-center">
            {onEditRequest && (
              <button
                type="button"
                onClick={onEditRequest}
                className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/80 text-xs font-medium transition-colors"
              >
                Edit Guide
              </button>
            )}

            <button
              type="button"
              onClick={handleSaveGuideLocally}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                saveSuccessMsg
                  ? 'bg-emerald-950 text-emerald-300 border-emerald-700'
                  : 'bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border-slate-700'
              }`}
              title="Save complete guide to this device"
            >
              <Bookmark size={13} />
              <span>{saveSuccessMsg ? 'Saved to Device' : 'Save Guide'}</span>
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 text-xs font-medium transition-colors print:hidden"
              title="Print or export field handbook"
            >
              <Printer size={13} />
              <span className="hidden sm:inline">Print</span>
            </button>
          </div>
        </div>

        {/* Collapsible Overview & Constraints */}
        <div className="mt-4 pt-3 border-t border-slate-800/60 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {activeFilters && activeFilters.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-slate-500 font-mono uppercase tracking-wider">Constraints:</span>
                  {activeFilters.map((flt, i) => (
                    <span key={i} className="px-2 py-0.5 rounded-md bg-cyan-950/60 text-cyan-300 border border-cyan-800/40 text-[11px]">
                      {flt}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowOverviewDetails(!showOverviewDetails)}
              className="text-slate-400 hover:text-cyan-300 text-xs font-medium flex items-center gap-1 transition-colors"
            >
              <span>{showOverviewDetails ? 'Collapse Overview' : 'Read Botanical Overview & Setting'}</span>
              {showOverviewDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>

          {showOverviewDetails && overview && (
            <div className="mt-3 p-4 rounded-xl bg-slate-950/70 border border-slate-800 text-slate-300 leading-relaxed font-sans prose prose-invert prose-sm max-w-none animate-in fade-in duration-200">
              <Markdown>{overview}</Markdown>
            </div>
          )}
        </div>
      </div>

      {/* Primary Navigation Tabs: Taxa · Identification Key · Field Notes · Sources */}
      <div className="px-5 sm:px-6 border-b border-slate-800 bg-slate-950/40 flex items-center gap-1 overflow-x-auto print:hidden">
        <button
          type="button"
          onClick={() => setActiveSection('taxa')}
          className={`py-3 px-4 text-xs font-semibold border-b-2 flex items-center gap-2 transition-colors whitespace-nowrap cursor-pointer ${
            activeSection === 'taxa'
              ? 'border-cyan-400 text-cyan-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <span>Taxa ({profiles.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('key')}
          className={`py-3 px-4 text-xs font-semibold border-b-2 flex items-center gap-2 transition-colors whitespace-nowrap cursor-pointer ${
            activeSection === 'key'
              ? 'border-emerald-400 text-emerald-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <ListTree size={14} />
          <span>Identification Key</span>
        </button>

        {guide.field_documentation_guide && guide.field_documentation_guide.length > 0 && (
          <button
            type="button"
            onClick={() => setActiveSection('notes')}
            className={`py-3 px-4 text-xs font-semibold border-b-2 flex items-center gap-2 transition-colors whitespace-nowrap cursor-pointer ${
              activeSection === 'notes'
                ? 'border-indigo-400 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Camera size={14} />
            <span>Field Notes & Vouchers</span>
          </button>
        )}

        {sources && sources.length > 0 && (
          <button
            type="button"
            onClick={() => setActiveSection('sources')}
            className={`py-3 px-4 text-xs font-semibold border-b-2 flex items-center gap-2 transition-colors whitespace-nowrap cursor-pointer ${
              activeSection === 'sources'
                ? 'border-purple-400 text-purple-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <BookOpen size={14} />
            <span>Sources & Literature</span>
          </button>
        )}
      </div>

      {/* Main Tab Panels */}
      <div className="p-5 sm:p-6 space-y-6">

        {/* 1. TAXA SECTION (DEFAULT WORKSPACE) */}
        {activeSection === 'taxa' && (
          <div className="space-y-5 animate-in fade-in duration-200">
            
            {/* Quick Action Bar + Taxa Search */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  value={taxonFilterQuery}
                  onChange={(e) => setTaxonFilterQuery(e.target.value)}
                  placeholder="Filter candidate taxa in this guide..."
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-950/80 border border-slate-800 rounded-lg text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <button
                type="button"
                onClick={() => setActiveSection('key')}
                className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-800/60 text-xs font-semibold transition-colors shadow-sm self-start sm:self-auto cursor-pointer"
              >
                <span>Start Identification Key</span>
                <ArrowRight size={13} />
              </button>
            </div>

            {/* Taxa Cards with Selection Checkboxes */}
            <div className="grid grid-cols-1 gap-4">
              {filteredProfiles.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs italic bg-slate-950/40 rounded-xl border border-slate-800">
                  No taxa match "{taxonFilterQuery}".
                </div>
              ) : (
                filteredProfiles.map((sp) => {
                  const isSelected = selectedTaxonNames.has(sp.scientific_name);
                  return (
                    <div
                      key={sp.scientific_name}
                      className={`p-4 sm:p-5 rounded-xl border transition-all duration-200 flex flex-col md:flex-row gap-4 items-stretch ${
                        isSelected
                          ? 'bg-slate-900 border-cyan-500/70 shadow-lg shadow-cyan-950/20 ring-1 ring-cyan-500/30'
                          : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700'
                      }`}
                    >
                      {/* Checkbox & Header */}
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex items-start gap-3">
                          <button
                            type="button"
                            onClick={() => handleToggleSelectTaxon(sp.scientific_name)}
                            aria-label={`Select ${sp.scientific_name} for comparison`}
                            className="mt-0.5 text-slate-400 hover:text-cyan-400 transition-colors cursor-pointer shrink-0"
                          >
                            {isSelected ? (
                              <CheckSquare size={20} className="text-cyan-400 fill-cyan-950" />
                            ) : (
                              <Square size={20} className="text-slate-600" />
                            )}
                          </button>

                          <div className="flex-1 min-w-0">
                            <h3 className="font-display font-bold text-base sm:text-lg text-white flex flex-wrap items-center gap-2">
                              {sp.scientific_name ? (
                                <CrossLink
                                  target={{ module: 'profiles', query: sp.scientific_name }}
                                  onNavigate={onNavigate}
                                  className="hover:underline underline-offset-4"
                                >
                                  <i className="text-cyan-300 font-serif">{sp.scientific_name}</i>
                                </CrossLink>
                              ) : (
                                <span>Unnamed Species</span>
                              )}
                              {sp.common_name && (
                                <span className="text-xs text-slate-400 font-sans font-normal">
                                  ({sp.common_name})
                                </span>
                              )}
                            </h3>

                            {/* Diagnostics */}
                            <div className="mt-2 space-y-1.5 text-xs">
                              <div>
                                <span className="font-mono text-[10px] text-slate-500 uppercase tracking-wider block">
                                  Key Diagnostics:
                                </span>
                                <p className="text-slate-200 leading-relaxed font-sans">
                                  {sp.key_diagnostics}
                                </p>
                              </div>
                              <div>
                                <span className="font-mono text-[10px] text-slate-500 uppercase tracking-wider block">
                                  Habitat & Elevation:
                                </span>
                                <p className="text-slate-400 leading-relaxed font-sans">
                                  {sp.habitat_and_ecology}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Photo Thumbnail */}
                      {sp.scientific_name && (
                        <div className="w-full md:w-44 shrink-0 flex items-center self-center">
                          <INatSpeciesImage
                            scientificName={sp.scientific_name}
                            className="w-full h-32 md:h-full rounded-lg"
                            aspectRatio="aspect-video md:aspect-[4/3]"
                          />
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* 2. IDENTIFICATION KEY SECTION */}
        {activeSection === 'key' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between text-xs text-slate-400">
              <span>Interactive Dichotomous Key resolving all {profiles.length} taxa in this guide.</span>
              <button
                type="button"
                onClick={() => setActiveSection('taxa')}
                className="text-cyan-400 hover:underline"
              >
                ← Back to Taxa List
              </button>
            </div>

            <KeyRunner
              keyItems={keyItems}
              speciesProfiles={profiles}
              targetLocality={targetLocality}
              onNavigate={onNavigate}
            />
          </div>
        )}

        {/* 3. FIELD NOTES & DOCUMENTATION */}
        {activeSection === 'notes' && guide.field_documentation_guide && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center gap-2">
              <Camera size={16} className="text-cyan-400" />
              <span>Voucher Documentation & Essential Field Observations</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {guide.field_documentation_guide.map((tip, idx) => {
                const cat = getFieldworkCategory(tip);
                return (
                  <div
                    key={idx}
                    className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 flex gap-3 items-start"
                  >
                    <div className="w-6 h-6 rounded-md bg-slate-900 border border-slate-800 text-xs font-mono font-bold text-slate-400 flex items-center justify-center shrink-0">
                      {idx + 1}
                    </div>
                    <div className="space-y-1 flex-1 text-xs">
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase border ${cat.badgeClass}`}>
                        {cat.label}
                      </span>
                      <p className="text-slate-300 leading-relaxed">
                        {cleanTipText(tip)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 4. SOURCES & LITERATURE */}
        {activeSection === 'sources' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {guide.recommended_literature && guide.recommended_literature.length > 0 && (
              <LiteratureSection
                literature={guide.recommended_literature}
                locality={targetLocality}
                taxonName={targetTaxon}
                title="Authoritative Floras & Monographs"
              />
            )}

            {sources && sources.length > 0 && (
              <div>
                <h4 className="text-xs font-mono uppercase tracking-wider text-slate-400 mb-2">
                  Grounding Database Records & Citations
                </h4>
                <SourcesBar sources={sources} />
              </div>
            )}
          </div>
        )}

      </div>

      {/* Persistent Selection Tray for 2–4 Selected Taxa (Keeps clear of mobile bottom bar) */}
      {selectedTaxonNames.size > 0 && (
        <div className="sticky bottom-0 z-40 p-4 border-t border-slate-800 bg-slate-950/95 backdrop-blur-md shadow-2xl animate-in slide-in-from-bottom-2 duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 max-w-5xl mx-auto">
            
            {/* Selected Taxa Pill List */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-mono font-bold text-cyan-400 bg-cyan-950/80 border border-cyan-800/60 px-2 py-1 rounded-lg">
                {selectedTaxonNames.size} {selectedTaxonNames.size === 1 ? 'taxon' : 'taxa'} selected
              </span>

              {Array.from(selectedTaxonNames).map((sciName) => (
                <span
                  key={sciName}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-200 font-serif italic"
                >
                  <span>{sciName}</span>
                  <button
                    type="button"
                    onClick={() => handleToggleSelectTaxon(sciName)}
                    className="text-slate-400 hover:text-rose-400 cursor-pointer"
                    aria-label={`Remove ${sciName}`}
                  >
                    <X size={13} />
                  </button>
                </span>
              ))}

              <button
                type="button"
                onClick={handleClearSelection}
                className="text-xs text-slate-400 hover:text-slate-200 underline ml-1 cursor-pointer"
              >
                Clear
              </button>
            </div>

            {/* Compare Action Button & Availability Notice */}
            <div className="flex items-center gap-3 self-end sm:self-auto">
              {selectedTaxonNames.size < 2 && (
                <span className="text-[11px] text-slate-400 italic hidden md:inline">
                  Select at least 2 taxa to compare
                </span>
              )}

              <button
                type="button"
                onClick={handleLaunchCompare}
                disabled={selectedTaxonNames.size < 2}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  selectedTaxonNames.size >= 2
                    ? 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold shadow-lg shadow-cyan-950/40 hover:scale-[1.02]'
                    : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                }`}
              >
                <SlidersHorizontal size={14} />
                <span>Compare Selected ({selectedTaxonNames.size})</span>
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Subset Comparison Modal / View */}
      <GuideSubsetModal
        isOpen={isCompareModalOpen}
        onClose={() => setIsCompareModalOpen(false)}
        selectedTaxa={selectedTaxaList}
        locality={targetLocality}
        activeFilters={activeFilters}
        data={compareData}
        isLoading={isComparing}
        error={compareError}
        onRetry={handleLaunchCompare}
      />

    </div>
  );
}
