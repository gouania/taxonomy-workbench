import React from 'react';
import { Loader2, Sparkles, Trash2, FileText, ClipboardPaste } from 'lucide-react';

interface InputPanelProps {
  input: string;
  setInput: (value: string) => void;
  onGenerate: () => void;
  onClear: () => void;
  onSample: () => void;
  isLoading: boolean;
}

export function InputPanel({ input, setInput, onGenerate, onClear, onSample, isLoading }: InputPanelProps) {
  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setInput(input ? `${input}\n${text}` : text);
      }
    } catch (err) {
      console.error('Failed to read clipboard contents: ', err);
    }
  };

  return (
    <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-6 shadow-xl backdrop-blur-sm h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <FileText size={18} className="text-cyan-400" />
          Request Details
        </h3>
        <button
          onClick={onSample}
          className="text-xs font-medium text-cyan-400 hover:text-cyan-300 transition-colors px-3 py-1.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20"
        >
          Try Example
        </button>
      </div>

      <div className="relative flex-1 flex flex-col mb-6">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="e.g. 'Create an identification guide to the following species, including a key, based on the descriptions provided here: [paste descriptions]' - or 'Write an identification guide, including a key, for maples (Acer) in the British Isles, focusing on how to tell them apart by their leaf shapes and samara angles.'"
          className="w-full flex-1 min-h-[200px] bg-slate-950/50 border border-slate-800 rounded-xl p-4 text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all resize-none mb-2"
          disabled={isLoading}
        />
        <div className="flex items-center justify-between text-xs text-slate-400 px-1">
          <span>For best results, copy and paste your own descriptions directly.</span>
          <button
            onClick={handlePaste}
            disabled={isLoading}
            className="flex items-center gap-1.5 hover:text-cyan-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Paste from clipboard"
          >
            <ClipboardPaste size={14} />
            Paste
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3 mt-auto">
        <button
          onClick={onClear}
          disabled={isLoading || !input}
          className="p-3 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          title="Clear input"
        >
          <Trash2 size={20} />
        </button>
        <button
          onClick={onGenerate}
          disabled={isLoading || !input.trim()}
          className="flex-1 bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500 text-white font-medium py-3 px-6 rounded-xl shadow-lg shadow-cyan-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <>
              <Loader2 size={20} className="animate-spin" />
              Building guide...
            </>
          ) : (
            <>
              <Sparkles size={20} />
              Build guide
            </>
          )}
        </button>
      </div>
    </div>
  );
}
