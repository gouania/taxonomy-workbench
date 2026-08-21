import { MapPin, Search, FileText } from 'lucide-react';
import React from 'react';

interface ContextPanelProps {
  notes: string;
  setNotes: (val: string) => void;
  location: string;
  setLocation: (val: string) => void;
  suspectedFamilies: string;
  setSuspectedFamilies: (val: string) => void;
  isLoading?: boolean;
}

export function ContextPanel({
  notes,
  setNotes,
  location,
  setLocation,
  suspectedFamilies,
  setSuspectedFamilies,
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
      </div>
    </div>
  );
}
