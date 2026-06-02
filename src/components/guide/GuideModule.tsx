import React, { useState, useCallback, useEffect } from 'react';
import { BookOpen, Code2, Map, Camera, Leaf, Flower2, Sprout, TreePine } from 'lucide-react';
import { InputPanel } from './InputPanel';
import { ResultPanel } from './ResultPanel';
import { BuilderPanel, PRESET_FILTERS } from './BuilderPanel';
import { StructuredResultPanel } from './StructuredResultPanel';
import { generateTaxonGuide, generateStructuredTaxonGuide } from '../../services/geminiService';
import { AppStatus, GeneratedGuide, GeneratedGuideStructured, NavigationTarget } from '../../types';
import { SAMPLE_DATA } from '../../constants';

interface GuideModuleProps {
  onNavigate?: (target: NavigationTarget) => void;
  initialTaxon?: string;
  initialLocality?: string;
}

export function GuideModule({ onNavigate, initialTaxon, initialLocality }: GuideModuleProps) {
  const [activeTab, setActiveTab] = useState<'custom' | 'builder'>('builder');

  // Custom Prompt state
  const [input, setInput] = useState<string>('');
  const [customStatus, setCustomStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [customResult, setCustomResult] = useState<GeneratedGuide | null>(null);

  // Builder state
  const [taxon, setTaxon] = useState<string>('');
  const [locality, setLocality] = useState<string>('');
  const [useSearch, setUseSearch] = useState<boolean>(false);
  const [selectedFilters, setSelectedFilters] = useState<string[]>([]);
  const [customFilter, setCustomFilter] = useState<string>('');
  const [builderStatus, setBuilderStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [builderResult, setBuilderResult] = useState<{result: GeneratedGuideStructured, sources: any[], activeFilters?: string[]} | null>(null);
  const [builderError, setBuilderError] = useState<string | null>(null);

  useEffect(() => {
    if (initialTaxon) {
      setActiveTab('builder');
      setTaxon(initialTaxon);
      if (initialLocality) {
        setLocality(initialLocality);
      }
      setBuilderStatus(AppStatus.IDLE);
      setBuilderResult(null);
      setBuilderError(null);
    }
  }, [initialTaxon, initialLocality]);

  const handleGenerateCustom = useCallback(async () => {
    if (!input.trim()) return;
    setCustomStatus(AppStatus.LOADING);
    setCustomResult(null);

    try {
      const markdown = await generateTaxonGuide(input);
      setCustomResult({ markdown });
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
    setBuilderResult(null);
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
      const res = await generateStructuredTaxonGuide(taxon, locality, useSearch, filtersToPass);
      setBuilderResult({
        ...res,
        activeFilters: filtersToPass
      });
      setBuilderStatus(AppStatus.SUCCESS);
    } catch (error: any) {
      console.error(error);
      setBuilderError(error?.message || String(error));
      setBuilderStatus(AppStatus.ERROR);
    }
  }, [taxon, locality, useSearch, selectedFilters, customFilter]);

  const handleClearBuilder = useCallback(() => {
    setTaxon('');
    setLocality('');
    setSelectedFilters([]);
    setCustomFilter('');
    setBuilderStatus(AppStatus.IDLE);
    setBuilderResult(null);
    setBuilderError(null);
  }, []);

  const currentStatus = activeTab === 'custom' ? customStatus : builderStatus;
  const setIdle = () => activeTab === 'custom' ? setCustomStatus(AppStatus.IDLE) : setBuilderStatus(AppStatus.IDLE);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 text-center md:text-left">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center shadow-lg mx-auto md:mx-0">
            <BookOpen size={24} className="text-indigo-400" />
          </div>
          <div>
            <h2 className="font-display text-3xl font-bold text-white tracking-tight">Generate Guides</h2>
            <p className="text-slate-400 text-sm md:text-base">Generate detailed taxonomic guides and dichotomous keys.</p>
          </div>
        </div>

        {/* Tab Controls */}
        <div className="flex items-center gap-2 bg-slate-900/50 p-1.5 rounded-xl border border-slate-800/50 mx-auto md:mx-0">
           <button
             onClick={() => setActiveTab('builder')}
             className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
               activeTab === 'builder' 
                 ? 'bg-cyan-500/20 text-cyan-400' 
                 : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
             }`}
           >
             <Map size={16} />
             Locality Builder
           </button>
           <button
             onClick={() => setActiveTab('custom')}
             className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
               activeTab === 'custom' 
                 ? 'bg-indigo-500/20 text-indigo-400' 
                 : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
             }`}
           >
             <Code2 size={16} />
             Custom Prompt
           </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Input */}
        <div className={`lg:col-span-4 transition-all duration-300 ease-in-out z-0
          ${currentStatus === AppStatus.SUCCESS ? 'hidden lg:block' : 'block'}
        `}>
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
            <BuilderPanel
              taxon={taxon}
              setTaxon={setTaxon}
              locality={locality}
              setLocality={setLocality}
              useSearch={useSearch}
              setUseSearch={setUseSearch}
              selectedFilters={selectedFilters}
              setSelectedFilters={setSelectedFilters}
              customFilter={customFilter}
              setCustomFilter={setCustomFilter}
              onGenerate={handleGenerateBuilder}
              onClear={handleClearBuilder}
              isLoading={builderStatus === AppStatus.LOADING}
            />
          )}
        </div>

        {/* Right: Output */}
        <div className={`lg:col-span-8 transition-all duration-300 ease-in-out
           ${currentStatus === AppStatus.IDLE ? 'hidden lg:block' : 'block'}
        `}>
          {activeTab === 'custom' ? (
            <ResultPanel 
              status={customStatus}
              markdown={customResult?.markdown || ''}
            />
          ) : (
            <StructuredResultPanel 
              status={builderStatus}
              guide={builderResult?.result || null}
              sources={builderResult?.sources}
              onNavigate={onNavigate}
              error={builderError}
              activeFilters={builderResult?.activeFilters}
            />
          )}
        </div>
      </div>

      {/* Mobile view toggle helper (only visible if success and on mobile) */}
      {currentStatus === AppStatus.SUCCESS && (
        <div className="lg:hidden fixed bottom-6 left-1/2 -translate-x-1/2 z-50 no-print">
           <button 
             onClick={setIdle}
             className="bg-slate-800 hover:bg-slate-700 text-white px-6 py-3 rounded-full shadow-lg border border-slate-700 font-medium transition-colors flex items-center gap-2"
           >
             <span>&larr;</span> Edit Request
           </button>
        </div>
      )}
    </div>
  );
}
