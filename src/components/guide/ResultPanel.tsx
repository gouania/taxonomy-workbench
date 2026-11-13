import React from 'react';
import Markdown from 'react-markdown';
import { Loader2, AlertCircle, FileText, Globe } from 'lucide-react';
import { AppStatus, GroundingSource, SourceProvenance } from '../../types';
import { SourcesBar } from '../shared/SourcesBar';
import { buildSourceProvenance } from '../../utils/guideValidation';

interface ResultPanelProps {
  status: AppStatus;
  markdown: string;
  sources?: GroundingSource[];
  provenance?: SourceProvenance;
}

export function ResultPanel({ status, markdown, sources = [], provenance }: ResultPanelProps) {
  if (status === AppStatus.IDLE) {
    return (
      <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-8 shadow-xl backdrop-blur-sm h-full flex flex-col items-center justify-center text-center min-h-[400px]">
        <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center mb-6">
          <FileText size={32} className="text-slate-600" />
        </div>
        <h3 className="text-xl font-semibold text-white mb-2">Ready to Generate</h3>
        <p className="text-slate-400 max-w-md">
          Enter a description of the taxonomic group or identification key you need, and the AI will generate a detailed guide.
        </p>
      </div>
    );
  }

  if (status === AppStatus.LOADING) {
    return (
      <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-8 shadow-xl backdrop-blur-sm h-full flex flex-col items-center justify-center text-center min-h-[400px]">
        <Loader2 size={48} className="text-cyan-500 animate-spin mb-6" />
        <h3 className="text-xl font-semibold text-white mb-2">Building your guide…</h3>
        <p className="text-slate-400 max-w-md">
          Preparing an identification guide from your instructions and checking for supporting web references.
        </p>
      </div>
    );
  }

  if (status === AppStatus.ERROR) {
    return (
      <div className="bg-rose-950/30 border border-rose-900/50 rounded-2xl p-8 shadow-xl backdrop-blur-sm h-full flex flex-col items-center justify-center text-center min-h-[400px]">
        <div className="w-16 h-16 rounded-full bg-rose-900/50 flex items-center justify-center mb-6">
          <AlertCircle size={32} className="text-rose-400" />
        </div>
        <h3 className="text-xl font-semibold text-white mb-2">Couldn’t build the guide</h3>
        <p className="text-rose-300 max-w-md">
          Couldn’t generate the guide from these instructions. Check your connection or adjust the prompt and try again.
        </p>
      </div>
    );
  }

  const effectiveProvenance =
    provenance || buildSourceProvenance(sources.length > 0, sources, 'guide');

  return (
    <div className="space-y-4">
      <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-6 md:p-8 shadow-xl backdrop-blur-sm h-full overflow-y-auto print:bg-white print:text-black print:shadow-none print:border-none">
        <div className="prose prose-invert prose-slate prose-base leading-relaxed max-w-none prose-headings:font-display prose-h1:text-3xl prose-h2:text-2xl prose-h3:text-xl prose-a:text-cyan-400 hover:prose-a:text-cyan-300 prose-strong:text-white prose-code:text-cyan-300 prose-code:bg-cyan-950/50 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md print:prose-p:text-black print:prose-headings:text-black">
          <Markdown>{markdown}</Markdown>
        </div>

        <div className="mt-6 pt-5 border-t border-slate-800/80 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-xs font-mono uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <Globe size={13} className="text-cyan-400" />
              <span>Supporting web references</span>
            </h4>
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-mono border ${
                effectiveProvenance.retrievedSources.length > 0
                  ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800/60'
                  : 'bg-amber-950/50 text-amber-300 border-amber-800/50'
              }`}
            >
              {effectiveProvenance.retrievedSources.length > 0
                ? `${effectiveProvenance.retrievedSources.length} retrieved`
                : 'None retrieved'}
            </span>
          </div>

          {effectiveProvenance.retrievedSources.length > 0 ? (
            <SourcesBar sources={effectiveProvenance.retrievedSources} />
          ) : (
            <p className="text-xs text-slate-400 leading-relaxed">
              {effectiveProvenance.basisNote}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
