import React, { useState, useMemo, useEffect, useRef } from 'react';
import Markdown from 'react-markdown';
import { 
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
  Search,
  ShieldCheck,
  ShieldAlert,
  Globe,
  Copy,
  Check,
  Download
} from 'lucide-react';
import {
  AppStatus,
  CoverageScope,
  GeneratedGuideStructured,
  NavigationTarget,
  GuideSubsetComparison,
  SpeciesProfile,
  SpecimenRecord,
} from '../../types';
import { SourcesBar } from '../shared/SourcesBar';
import { CrossLink } from '../shared/CrossLink';
import { INatSpeciesImage } from '../shared/INatSpeciesImage';
import { LiteratureSection } from '../shared/LiteratureSection';
import { TaskProgressCard } from '../shared/TaskProgressCard';
import { KeyRunner } from './KeyRunner';
import { GuideSubsetModal } from './GuideSubsetModal';
import { GuidePrintView } from './GuidePrintView';
import { compareGuideTaxa, isAbortError } from '../../services/geminiService';
import { historyFavoritesService } from '../../services/historyFavoritesService';
import { validateDichotomousKey, buildSourceProvenance } from '../../utils/guideValidation';
import { formatGuideAsMarkdown } from '../../utils/guideExport';
import { getSafeExternalUrl } from '../../utils/urlValidation';

interface StructuredResultPanelProps {
  status: AppStatus;
  guide: GeneratedGuideStructured | null;
  sources?: any[];
  onNavigate?: (target: NavigationTarget) => void;
  error?: string | null;
  activeFilters?: string[];
  coverageScope?: CoverageScope;
  specimenRecord?: SpecimenRecord;
  onEditRequest?: () => void;
  onCancel?: () => void;
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
  coverageScope,
  specimenRecord,
  onEditRequest,
  onCancel,
}: StructuredResultPanelProps) {
  // Navigation tabs within working tool: Taxa, Identification Key, Field Notes, Sources
  const [activeSection, setActiveSection] = useState<'taxa' | 'key' | 'notes' | 'sources'>('taxa');
  const [showKeyQuickRefs, setShowKeyQuickRefs] = useState(false);
  
  // Taxon selection for 2–4 subset comparison
  const [selectedTaxonNames, setSelectedTaxonNames] = useState<Set<string>>(new Set());
  const [taxonFilterQuery, setTaxonFilterQuery] = useState('');
  const [showOverviewDetails, setShowOverviewDetails] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState(false);
  const [copiedMarkdownMsg, setCopiedMarkdownMsg] = useState(false);
  const [selectionLimitNotice, setSelectionLimitNotice] = useState<string | null>(null);

  // Comparison modal state
  const [isCompareModalOpen, setIsCompareModalOpen] = useState(false);
  const [isComparing, setIsComparing] = useState(false);
  const [compareData, setCompareData] = useState<GuideSubsetComparison | null>(null);
  const [compareError, setCompareError] = useState<string | null>(null);
  const [compareTaxaOverride, setCompareTaxaOverride] = useState<SpeciesProfile[] | null>(null);
  const compareAbortRef = useRef<AbortController | null>(null);

  const guideIdentity = guide
    ? `${guide.guide_metadata?.target_taxon || ''}|${guide.guide_metadata?.target_locality || ''}|${guide.species_profiles?.length || 0}|${guide.dichotomous_key?.length || 0}`
    : '';

  // Clear stale selection/filter state whenever a different guide loads
  useEffect(() => {
    setSelectedTaxonNames(new Set());
    setTaxonFilterQuery('');
    setSelectionLimitNotice(null);
    setCompareTaxaOverride(null);
    setShowKeyQuickRefs(false);
  }, [guideIdentity]);

  useEffect(() => {
    return () => {
      compareAbortRef.current?.abort();
    };
  }, []);

  const keyValidation = useMemo(() => {
    if (!guide) return null;
    return (
      guide.key_validation ||
      validateDichotomousKey(guide.dichotomous_key || [], guide.species_profiles || [])
    );
  }, [guide]);

  const provenance = useMemo(() => {
    if (!guide) return null;
    if (guide.provenance) return guide.provenance;
    const list = sources || [];
    return buildSourceProvenance(list.length > 0, list, 'guide');
  }, [guide, sources]);

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
      <TaskProgressCard
        title="Building your guide…"
        stages={[
          'Checking regional flora scope and accepted names…',
          'Drafting diagnostic taxon profiles and parallel dichotomous key couplets…',
          'Validating key graph reachability and assembling field documentation…',
        ]}
        onCancel={onCancel}
        testId="guide-builder-loading"
      />
    );
  }

  if (status === AppStatus.ERROR || !guide || !guide.guide_metadata) {
    return (
      <div className="bg-rose-950/30 border border-rose-900/50 rounded-2xl p-8 shadow-xl backdrop-blur-sm h-full flex flex-col items-center justify-center text-center min-h-[400px]">
        <div className="w-16 h-16 rounded-full bg-rose-900/50 flex items-center justify-center mb-6">
          <AlertCircle size={32} className="text-rose-400" />
        </div>
        <h3 className="text-xl font-semibold text-white mb-2">Couldn’t build the guide</h3>
        <p className="text-rose-300 max-w-md text-sm">
          {error || "Couldn’t generate the guide right now. Check your input or connection and try again."}
        </p>
      </div>
    );
  }

  const targetTaxon = guide.guide_metadata?.target_taxon || 'Unknown Taxon';
  const targetLocality = guide.guide_metadata?.target_locality || 'Unknown Locality';
  const overview = guide.taxon_overview || '';
  const keyItems = guide.dichotomous_key || [];
  const profiles = guide.species_profiles || [];

  // Filter profiles by in-list search without affecting subset selections (includes synonyms & accepted_name)
  const filteredProfiles = profiles.filter((sp) => {
    if (!taxonFilterQuery.trim()) return true;
    const q = taxonFilterQuery.toLowerCase();
    return (
      (sp.scientific_name || '').toLowerCase().includes(q) ||
      (sp.accepted_name || '').toLowerCase().includes(q) ||
      (sp.synonyms || []).some((syn) => syn.toLowerCase().includes(q)) ||
      (sp.common_name || '').toLowerCase().includes(q) ||
      (sp.key_diagnostics || '').toLowerCase().includes(q)
    );
  });

  const handleToggleSelectTaxon = (sciName: string) => {
    setSelectionLimitNotice(null);
    setSelectedTaxonNames((prev) => {
      const next = new Set(prev);
      if (next.has(sciName)) {
        next.delete(sciName);
      } else {
        if (next.size >= 4) {
          setSelectionLimitNotice('You can compare a maximum of 4 taxa at once for a clear, readable matrix.');
          return prev;
        }
        next.add(sciName);
      }
      return next;
    });
  };

  const handleClearSelection = () => {
    setSelectionLimitNotice(null);
    setSelectedTaxonNames(new Set());
  };

  // Selected taxa objects
  const selectedTaxaList: SpeciesProfile[] = profiles.filter((sp) =>
    selectedTaxonNames.has(sp.scientific_name)
  );

  const runSubsetComparison = async (taxaToCompare: SpeciesProfile[]) => {
    if (taxaToCompare.length < 2) return;
    compareAbortRef.current?.abort();
    const controller = new AbortController();
    compareAbortRef.current = controller;

    setCompareTaxaOverride(taxaToCompare);
    setIsCompareModalOpen(true);
    setIsComparing(true);
    setCompareError(null);

    try {
      const res = await compareGuideTaxa(
        taxaToCompare,
        targetLocality,
        activeFilters || [],
        true,
        specimenRecord,
        controller.signal
      );
      if (compareAbortRef.current === controller) {
        setCompareData(res.result);
        setIsComparing(false);
      }
    } catch (err: any) {
      if (isAbortError(err)) return;
      console.error(err);
      if (compareAbortRef.current === controller) {
        setCompareError(err?.message || 'Couldn’t generate the comparison. Please try again.');
        setIsComparing(false);
      }
    }
  };

  const handleLaunchCompare = async () => {
    if (selectedTaxaList.length < 2) return;
    await runSubsetComparison(selectedTaxaList);
  };

  const handleCompareFromKey = async (taxaNames: string[]) => {
    const lowerSet = new Set(taxaNames.map((n) => n.toLowerCase()));
    const matched = profiles.filter((p) => lowerSet.has((p.scientific_name || '').toLowerCase()));
    const fallbackTaxa: SpeciesProfile[] =
      matched.length >= 2
        ? matched.slice(0, 4)
        : taxaNames.slice(0, 4).map((name) => ({
            scientific_name: name,
            common_name: null,
            habitat_and_ecology: '',
            key_diagnostics: '',
          }));
    await runSubsetComparison(fallbackTaxa);
  };

  const handleSaveGuideLocally = () => {
    historyFavoritesService.saveGuide({
      title: `${targetTaxon} in ${targetLocality}`,
      target_taxon: targetTaxon,
      target_locality: targetLocality,
      guide,
      sources,
      activeFilters,
      coverageScope,
    });
    setSaveSuccessMsg(true);
    setTimeout(() => setSaveSuccessMsg(false), 3000);
  };

  const handleCopyGuideMarkdown = async () => {
    try {
      const md = formatGuideAsMarkdown(guide, sources || [], activeFilters || []);
      await navigator.clipboard.writeText(md);
      setCopiedMarkdownMsg(true);
      setTimeout(() => setCopiedMarkdownMsg(false), 2500);
    } catch {
      // Ignore clipboard failures in restricted contexts
    }
  };

  const handleDownloadGuideMarkdown = () => {
    const md = formatGuideAsMarkdown(guide, sources || [], activeFilters || []);
    const safeSlug = `${targetTaxon}-${targetLocality}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 64);
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeSlug || 'identification-guide'}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="space-y-6 print:hidden">
    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
      
      {/* Contemporary Field Handbook Compact Context Header */}
      <div className="p-5 sm:p-6 border-b border-slate-800 bg-slate-950/70">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1.5 text-xs text-slate-400 font-mono">
              <span className="inline-flex items-center gap-1 text-slate-300 font-semibold">
                <MapPin size={13} className="text-cyan-400" />
                {targetLocality}
              </span>
              <span>•</span>
              <span className="text-cyan-400 font-semibold">{profiles.length} taxa treated</span>
              {keyValidation && (
                <>
                  <span>•</span>
                  <button
                    type="button"
                    onClick={() => setActiveSection('key')}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] font-mono transition-colors cursor-pointer ${
                      keyValidation.isStructurallyValid
                        ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800/60 hover:bg-emerald-900/50'
                        : 'bg-amber-950/60 text-amber-300 border-amber-700/70 hover:bg-amber-900/50'
                    }`}
                    title={keyValidation.validityNote}
                  >
                    {keyValidation.isStructurallyValid ? (
                      <>
                        <ShieldCheck size={12} />
                        <span>Key Structure OK</span>
                      </>
                    ) : (
                      <>
                        <ShieldAlert size={12} />
                        <span>{keyValidation.issues.length} Key Issue{keyValidation.issues.length === 1 ? '' : 's'}</span>
                      </>
                    )}
                  </button>
                </>
              )}
              {guide.guide_metadata?.coverage_scope && (
                <>
                  <span>•</span>
                  <span className="text-slate-400 truncate max-w-sm" title={guide.guide_metadata.coverage_scope}>
                    {guide.guide_metadata.coverage_scope}
                  </span>
                </>
              )}
            </div>

            <h1 className="text-2xl sm:text-3xl font-display font-bold text-white flex items-center gap-2">
              <span>Identification Guide to</span>
              <i className="text-cyan-400 font-serif font-normal">{targetTaxon}</i>
            </h1>
            {guide.taxon_concept && (
              <div className="mt-1 text-xs text-slate-400">
                <span>
                  Concept: <i className="text-slate-300">{guide.taxon_concept.acceptedName}</i>
                  {guide.taxon_concept.authority ? ` ${guide.taxon_concept.authority}` : ''}
                </span>
                {guide.taxon_concept.synonyms && guide.taxon_concept.synonyms.length > 0 && (
                  <span className="ml-2 text-slate-500">
                    (Synonyms: {guide.taxon_concept.synonyms.slice(0, 4).join(', ')})
                  </span>
                )}
              </div>
            )}
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
              title="Saves in this browser only — does not sync across devices"
            >
              <Bookmark size={13} />
              <span>{saveSuccessMsg ? 'Saved on this device' : 'Save on this device'}</span>
            </button>

            <button
              type="button"
              onClick={handleCopyGuideMarkdown}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 text-xs font-medium transition-colors cursor-pointer print:hidden"
              title="Copy full guide as Markdown"
            >
              {copiedMarkdownMsg ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
              <span className="hidden sm:inline">{copiedMarkdownMsg ? 'Copied' : 'Copy MD'}</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadGuideMarkdown}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 text-xs font-medium transition-colors cursor-pointer print:hidden"
              title="Download full guide as Markdown (.md)"
            >
              <Download size={13} />
              <span className="hidden sm:inline">.md</span>
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 text-xs font-medium transition-colors print:hidden"
              title="Print or export the full guide (all taxa, key, field documentation, and references)"
            >
              <Printer size={13} />
              <span className="hidden sm:inline">Print full guide</span>
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
            <span>Field documentation</span>
          </button>
        )}

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
          <span>References &amp; literature</span>
        </button>
      </div>

      {/* Main Tab Panels */}
      <div className="p-5 sm:p-6 space-y-6">

        {/* 1. TAXA SECTION (DEFAULT WORKSPACE) */}
        {activeSection === 'taxa' && (
          <div className="space-y-5 animate-in fade-in duration-200">

            {selectionLimitNotice && (
              <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-800/50 text-amber-200 text-xs flex items-center justify-between gap-3">
                <span>{selectionLimitNotice}</span>
                <button
                  type="button"
                  onClick={() => setSelectionLimitNotice(null)}
                  className="text-amber-300 hover:text-white"
                  aria-label="Dismiss notice"
                >
                  <X size={14} />
                </button>
              </div>
            )}
            
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
                                  target={{ module: 'profiles', query: sp.scientific_name, locality: targetLocality }}
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

                            {/* Synonyms & Accepted Name Aliases */}
                            {((sp.accepted_name && sp.accepted_name !== sp.scientific_name) ||
                              (sp.synonyms && sp.synonyms.length > 0)) && (
                              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
                                {sp.accepted_name && sp.accepted_name !== sp.scientific_name && (
                                  <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-cyan-200">
                                    Accepted: <i>{sp.accepted_name}</i>
                                  </span>
                                )}
                                {sp.synonyms && sp.synonyms.length > 0 && (
                                  <span className="italic text-slate-400">
                                    Also cited as: {sp.synonyms.join(', ')}
                                  </span>
                                )}
                              </div>
                            )}

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
                              {(() => {
                                const safeUrls = (sp.source_urls || [])
                                  .map((uri) => getSafeExternalUrl(uri))
                                  .filter((uri): uri is string => uri !== null)
                                  .slice(0, 3);
                                if (safeUrls.length === 0) return null;
                                return (
                                  <div className="pt-1 flex flex-wrap items-center gap-1.5">
                                    <span className="font-mono text-[10px] text-slate-500 uppercase">Sources:</span>
                                    {safeUrls.map((uri, uIdx) => (
                                      <a
                                        key={`${uri}-${uIdx}`}
                                        href={uri}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[10px] text-cyan-300 truncate max-w-[200px]"
                                      >
                                        {uri.replace(/^https?:\/\/(www\.)?/, '')}
                                      </a>
                                    ))}
                                  </div>
                                );
                              })()}
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

        {/* 2. IDENTIFICATION KEY SECTION (kept mounted so couplet progress persists across tab switches) */}
        <div
          data-testid="guide-key-panel"
          className={activeSection === 'key' ? 'block space-y-4 animate-in fade-in duration-200' : 'hidden'}
        >
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
            <span>Interactive Dichotomous Key resolving all {profiles.length} taxa in this guide.</span>
            <div className="flex items-center gap-3">
              {provenance && (provenance.retrievedSources.length > 0 || (guide.recommended_literature?.length || 0) > 0) && (
                <button
                  type="button"
                  onClick={() => setShowKeyQuickRefs((v) => !v)}
                  className="text-purple-300 hover:text-purple-200 hover:underline cursor-pointer font-medium"
                >
                  {showKeyQuickRefs ? 'Hide Quick References' : 'Show Quick References'}
                </button>
              )}
              <button
                type="button"
                onClick={() => setActiveSection('taxa')}
                className="text-cyan-400 hover:underline cursor-pointer"
              >
                ← Back to Taxa List
              </button>
            </div>
          </div>

          {showKeyQuickRefs && provenance && (
            <div
              data-testid="key-quick-references-drawer"
              className="p-4 rounded-xl bg-slate-950/80 border border-purple-800/40 space-y-3 text-xs"
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-purple-200 uppercase tracking-wider text-[11px]">
                  Supporting References (your key step above stays preserved)
                </span>
                <button
                  type="button"
                  onClick={() => setShowKeyQuickRefs(false)}
                  className="text-slate-400 hover:text-white cursor-pointer"
                >
                  Close
                </button>
              </div>
              {provenance.retrievedSources.length > 0 && (
                <SourcesBar sources={provenance.retrievedSources} mode="inline" />
              )}
              {guide.recommended_literature && guide.recommended_literature.length > 0 && (
                <ul className="list-disc list-inside space-y-1 text-slate-300">
                  {guide.recommended_literature.map((item, idx) => (
                    <li key={idx}>{item.citation}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <KeyRunner
            key={`${targetTaxon}|${targetLocality}|${profiles.length}|${keyItems.length}`}
            keyItems={keyItems}
            speciesProfiles={profiles}
            targetLocality={targetLocality}
            onNavigate={onNavigate}
            onCompareTaxa={handleCompareFromKey}
            keyValidation={keyValidation || undefined}
          />
        </div>

        {/* 3. FIELD DOCUMENTATION */}
        {activeSection === 'notes' && guide.field_documentation_guide && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center gap-2">
              <Camera size={16} className="text-cyan-400" />
              <span>What to photograph, measure, and record</span>
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

        {/* 4. SUPPORTING WEB REFERENCES & SUGGESTED LITERATURE */}
        {activeSection === 'sources' && provenance && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* Supporting web references (Live Web Grounding) */}
            <div
              data-testid="retrieved-references-section"
              className="p-5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-xs font-mono uppercase tracking-wider text-slate-200 flex items-center gap-2">
                  <Globe size={14} className="text-cyan-400" />
                  <span>Supporting web references</span>
                </h4>
                <span
                  className={`px-2 py-0.5 rounded text-[11px] font-mono border ${
                    provenance.retrievedSources.length > 0
                      ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800/60'
                      : 'bg-amber-950/50 text-amber-300 border-amber-800/50'
                  }`}
                >
                  {provenance.retrievedSources.length > 0
                    ? `${provenance.retrievedSources.length} retrieved`
                    : 'None retrieved'}
                </span>
              </div>

              {provenance.retrievedSources.length > 0 ? (
                <>
                  <p className="text-xs text-slate-400">{provenance.basisNote}</p>
                  <SourcesBar sources={provenance.retrievedSources} />
                </>
              ) : (
                <p className="text-xs text-slate-300 leading-relaxed">
                  {provenance.basisNote}
                </p>
              )}
            </div>

            {/* Suggested literature */}
            <div data-testid="recommended-reading-section">
              {guide.recommended_literature && guide.recommended_literature.length > 0 ? (
                <LiteratureSection
                  literature={guide.recommended_literature}
                  locality={targetLocality}
                  taxonName={targetTaxon}
                />
              ) : (
                <div className="p-5 rounded-xl bg-slate-950/40 border border-slate-800 text-xs text-slate-400">
                  No suggested literature references were provided for this guide.
                </div>
              )}
            </div>
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
        onClose={() => {
          compareAbortRef.current?.abort();
          setIsCompareModalOpen(false);
          setIsComparing(false);
        }}
        selectedTaxa={compareTaxaOverride || selectedTaxaList}
        locality={targetLocality}
        activeFilters={activeFilters}
        specimenRecord={specimenRecord}
        data={compareData}
        isLoading={isComparing}
        error={compareError}
        onRetry={() => runSubsetComparison(compareTaxaOverride || selectedTaxaList)}
      />

    </div>

    {activeSection !== 'sources' && guide.recommended_literature && guide.recommended_literature.length > 0 && (
      <LiteratureSection
        literature={guide.recommended_literature}
        locality={targetLocality}
        taxonName={targetTaxon}
      />
    )}
      </div>

      {/* Dedicated Full-Guide Print View (renders full document regardless of active tab) */}
      <GuidePrintView
        guide={guide}
        sources={sources || []}
        activeFilters={activeFilters || []}
        keyValidation={keyValidation || undefined}
      />
    </div>
  );
}
