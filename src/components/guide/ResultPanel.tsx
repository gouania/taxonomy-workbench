import React from 'react';
import Markdown from 'react-markdown';
import { Loader2, AlertCircle, FileText } from 'lucide-react';
import { AppStatus } from '../../types';

interface ResultPanelProps {
  status: AppStatus;
  markdown: string;
}

export function ResultPanel({ status, markdown }: ResultPanelProps) {
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
        <h3 className="text-xl font-semibold text-white mb-2">Synthesizing Guide...</h3>
        <p className="text-slate-400 max-w-md">
          Analyzing taxonomic literature and constructing identification keys. This may take a moment.
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
        <h3 className="text-xl font-semibold text-white mb-2">Generation Failed</h3>
        <p className="text-rose-300 max-w-md">
          There was an error generating the guide. Please check your API key and try again.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-6 md:p-8 shadow-xl backdrop-blur-sm h-full overflow-y-auto print:bg-white print:text-black print:shadow-none print:border-none">
        <div className="prose prose-invert prose-slate prose-base leading-relaxed max-w-none prose-headings:font-display prose-h1:text-3xl prose-h2:text-2xl prose-h3:text-xl prose-a:text-cyan-400 hover:prose-a:text-cyan-300 prose-strong:text-white prose-code:text-cyan-300 prose-code:bg-cyan-950/50 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md print:prose-p:text-black print:prose-headings:text-black">
          <Markdown>{markdown}</Markdown>
        </div>
      </div>
    </div>
  );
}
