import { MapPin, Search, FileText, Globe2 } from 'lucide-react';
import React from 'react';

interface ContextPanelProps {
  notes: string;
  setNotes: (val: string) => void;
  location: string;
  setLocation: (val: string) => void;
  suspectedFamilies: string;
  setSuspectedFamilies: (val: string) => void;
  useSearch: boolean;
  setUseSearch: (val: boolean) => void;
  isLoading?: boolean;
}

export function ContextPanel({
  notes,
  setNotes,
  location,
  setLocation,
  suspectedFamilies,
  setSuspectedFamilies,
  useSearch,
  setUseSearch,
  isLoading = false,
}: ContextPanelProps) {
  return (
    <div className="bg-slate-900/40 border border-slate-800/50 rounded-2xl p-6 space-y-4">
      <h3 className="font-display text-lg font-semibold text-white mb-4">Context</h3>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-400 mb-1.5 flex items-center gap-1.5">
            <FileText size={16} /> Additional Notes
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Measurements, colors, odors..."
            className="w-full bg-slate-800/50 border border-slate-700/50 rounded-xl p-3 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 h-24 resize-none"
            disabled={isLoading}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-400 mb-1.5 flex items-center gap-1.5">
            <MapPin size={16} /> Location & Habitat
          </label>
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g., Alpine meadow, 2000m, Alps"
            className="w-full bg-slate-800/50 border border-slate-700/50 rounded-xl p-3 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
            disabled={isLoading}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-400 mb-1.5 flex items-center gap-1.5">
            <Search size={16} /> Suspected Families
          </label>
          <input
            type="text"
            value={suspectedFamilies}
            onChange={(e) => setSuspectedFamilies(e.target.value)}
            placeholder="e.g., Asteraceae, Fabaceae"
            className="w-full bg-slate-800/50 border border-slate-700/50 rounded-xl p-3 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
            disabled={isLoading}
          />
        </div>

        <label className="flex items-center gap-3 bg-slate-950/30 p-3 rounded-xl border border-slate-800 cursor-pointer hover:bg-slate-800/30 transition-colors">
          <input
            type="checkbox"
            checked={useSearch}
            onChange={(e) => setUseSearch(e.target.checked)}
            disabled={isLoading}
            className="w-5 h-5 rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-cyan-500/50 focus:ring-offset-0 disabled:opacity-50"
          />
          <div className="flex-1">
            <div className="text-sm font-medium text-slate-200 flex items-center gap-2">
              <Globe2 size={16} className="text-cyan-400" />
              Use Web Search Grounding
            </div>
            <div className="text-xs text-slate-500">Slower but can include recent data.</div>
          </div>
        </label>
      </div>
    </div>
  );
}
