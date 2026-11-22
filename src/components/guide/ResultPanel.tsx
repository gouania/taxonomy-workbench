import React, { useState } from 'react';
import Markdown from 'react-markdown';
import { AlertCircle, FileText, Globe, Copy, Check, Download } from 'lucide-react';
import { AppStatus, GroundingSource, SourceProvenance } from '../../types';
import { SourcesBar } from '../shared/SourcesBar';
import { TaskProgressCard } from '../shared/TaskProgressCard';
import { buildSourceProvenance } from '../../utils/guideValidation';

interface ResultPanelProps {
  status: AppStatus;
  markdown: string;
  sources?: GroundingSource[];
  provenance?: SourceProvenance;
  onCancel?: () => void;
}

export function ResultPanel({ status, markdown, sources = [], provenance, onCancel }: ResultPanelProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!markdown) return;
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Ignore clipboard failures in restricted contexts
    }
  };

  const handleDownload = () => {
    if (!markdown) return;
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'botanical-identification-guide.md';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (status === AppStatus.IDLE) {
    return (
      <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-8 shadow-xl backdrop-blur-sm h-full flex flex-col items-center justify-center text-center min-h-[400px]">
        <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center mb-6">
          <FileText size={32} className="text-slate-600" />
        </div>
        <h3 className="text-xl font-semibold text-white mb-2">Ready to Generate</h3>
        <p className="text-slate-400 max-w-md">
          Enter a description of the taxonomic group or identification key you need, and the app will build a detailed guide.
        </p>
      </div>
    );
  }

  if (status === AppStatus.LOADING) {
    return (
      <TaskProgressCard
        title="Building your guide…"
        stages={[
          'Searching botanical references for your requested group and locality…',
          'Drafting diagnostic morphology and dichotomous key leads…',
          'Formatting the completed guide and collecting supporting web references…',
        ]}
        onCancel={onCancel}
        testId="custom-guide-loading"
      />
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
        <div className="flex flex-wrap items-center justify-end gap-2 pb-4 mb-4 border-b border-slate-800/80 print:hidden">
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 text-xs font-medium transition-colors cursor-pointer"
          >
            {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
            <span>{copied ? 'Copied Markdown' : 'Copy Markdown'}</span>
          </button>
          <button
            type="button"
            onClick={handleDownload}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 text-xs font-medium transition-colors cursor-pointer"
          >
            <Download size={13} />
            <span>Download .md</span>
          </button>
        </div>

        <div className="prose prose-invert prose-slate prose-base leading-relaxed max-w-none prose-headings:font-display prose-h1:text-3xl prose-h2:text-2xl prose-h3:text-xl prose-a:text-cyan-400 hover:prose-a:text-cyan-300 prose-strong:text-white prose-code:text-cyan-300 prose-code:bg-cyan-950/50 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md print:prose-p:text-black print:prose-headings:text-black">
          <Markdown>{markdown}</Markdown>
        </div>

        <div className="mt-6 pt-5 border-t border-slate-800/80 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-xs font-mono uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <Globe size={13} className="text-cyan-400" />
              <span>Supporting web references</span>
            </h4>
            <span className="text-xs font-mono text-slate-400">
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
