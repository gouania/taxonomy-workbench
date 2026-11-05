import { ChevronDown, ChevronUp, CheckCircle2, XCircle, AlertCircle, Sparkles } from 'lucide-react';
import React, { useState } from 'react';
import { NavigationTarget, SuggestedFamily } from '../../types';
import { CrossLink } from '../shared/CrossLink';
import { MarkdownRenderer } from '../shared/MarkdownRenderer';

interface FamilyResultCardProps {
  family: SuggestedFamily;
  onNavigate: (target: NavigationTarget) => void;
}

export function FamilyResultCard({ family, onNavigate }: FamilyResultCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const getBadgeColor = (quality: string) => {
    switch (quality) {
      case 'Strong Match':
        return 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-900 dark:text-emerald-300 border-emerald-400 dark:border-emerald-800/50 font-bold';
      case 'Probable':
        return 'bg-cyan-100 dark:bg-cyan-900/40 text-cyan-950 dark:text-cyan-300 border-cyan-400 dark:border-cyan-800/50 font-bold';
      case 'Possible':
        return 'bg-amber-100 dark:bg-amber-900/40 text-amber-950 dark:text-amber-300 border-amber-400 dark:border-amber-800/50 font-bold';
      case 'Weak':
        return 'bg-red-100 dark:bg-red-900/40 text-red-950 dark:text-red-300 border-red-400 dark:border-red-800/50 font-bold';
      default:
        return 'bg-stone-200 dark:bg-slate-800 text-stone-800 dark:text-slate-300 border-stone-300 dark:border-slate-700';
    }
  };

  const matchPercentage =
    family.totalCharacters > 0
      ? Math.round((family.matchingCharacters / family.totalCharacters) * 100)
      : 0;

  return (
    <div className="bg-slate-900/60 border border-slate-800/50 rounded-2xl overflow-hidden transition-all hover:border-slate-700/50">
      <div
        className="p-6 cursor-pointer flex items-start justify-between"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <h4 className="font-display text-2xl font-bold text-white">
              <CrossLink target={{ module: 'profiles', query: family.name }} onNavigate={onNavigate}>
                {family.name}
              </CrossLink>
            </h4>
            <span className="text-sm text-slate-400">{family.authority}</span>
            <span
              className={`px-3 py-1 rounded-full text-xs font-semibold border ${getBadgeColor(
                family.matchQuality
              )}`}
            >
              {family.matchQuality}
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <span>{family.order}</span>
            <span className="w-1 h-1 rounded-full bg-slate-700"></span>
            <span className="text-cyan-400">{family.commonName}</span>
          </div>
          <div className="pt-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onNavigate({ module: 'guide', query: family.name });
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-indigo-950/70 hover:bg-indigo-900/80 text-indigo-300 border border-indigo-800/60 text-xs font-semibold transition-colors"
            >
              <span>Build Regional Key for {family.name} →</span>
            </button>
          </div>
        </div>
        <button className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors">
          {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </button>
      </div>

      <div className="px-6 pb-4">
        <div className="flex items-center gap-4 mb-2">
          <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full ${
                matchPercentage > 75
                  ? 'bg-emerald-500'
                  : matchPercentage > 50
                  ? 'bg-cyan-500'
                  : 'bg-amber-500'
              }`}
              style={{ width: `${matchPercentage}%` }}
            ></div>
          </div>
          <span className="text-sm font-medium text-slate-300">
            {family.matchingCharacters} / {family.totalCharacters} matches
          </span>
        </div>

        {family.contradictingCharacters && family.contradictingCharacters.length > 0 && (
          <div className="mt-3 flex items-start gap-2 text-sm text-amber-400/80">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <p>Contradicts: {family.contradictingCharacters.join(', ')}</p>
          </div>
        )}
      </div>

      {isExpanded && (
        <div className="px-6 pb-6 pt-4 border-t border-slate-800/50 space-y-6 bg-slate-900/30 animate-in slide-in-from-top-2 duration-300">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <h5 className="text-sm font-semibold text-slate-400 mb-2 flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-emerald-500" /> Diagnostic Characters
                </h5>
                <MarkdownRenderer content={family.diagnosticCharacters} className="text-sm" />
              </div>
              <div>
                <h5 className="text-sm font-semibold text-slate-400 mb-2 flex items-center gap-2">
                  <Sparkles size={16} className="text-cyan-500" /> Synapomorphies
                </h5>
                <MarkdownRenderer content={family.synapomorphies} className="text-sm" />
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <h5 className="text-sm font-semibold text-slate-400 mb-2 flex items-center gap-2">
                  <XCircle size={16} className="text-amber-500" /> Differential Diagnosis
                </h5>
                <MarkdownRenderer content={family.differentialDiagnosis} className="text-sm" />
              </div>
              <div>
                <h5 className="text-sm font-semibold text-slate-400 mb-2">Spot Characters</h5>
                <MarkdownRenderer content={family.spotCharacters} className="text-sm" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-800/50">
            <div>
              <h5 className="text-sm font-semibold text-slate-400 mb-2">Field Recognition Tips</h5>
              <MarkdownRenderer content={family.fieldRecognitionTips} className="text-sm" />
            </div>
            <div>
              <h5 className="text-sm font-semibold text-slate-400 mb-2">Characters to Verify Next</h5>
              <MarkdownRenderer content={family.charactersToVerifyNext} className="text-sm" />
            </div>
          </div>

          {family.possibleGenera && family.possibleGenera.length > 0 && (
            <div className="pt-4 border-t border-slate-800/50">
              <h5 className="text-sm font-semibold text-slate-400 mb-3">Possible Genera</h5>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {family.possibleGenera.map((genus, idx) => (
                  <div
                    key={idx}
                    className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-3"
                  >
                    <CrossLink target={{ module: 'profiles', query: genus.name }} onNavigate={onNavigate}>
                      <i className="font-serif text-cyan-400">{genus.name}</i>
                    </CrossLink>
                    <p className="text-xs text-slate-400 mt-1.5">{genus.notes}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {family.regionalNotes && (
            <div className="pt-4 border-t border-slate-800/50">
              <h5 className="text-sm font-semibold text-slate-400 mb-2">Regional Notes</h5>
              <MarkdownRenderer content={family.regionalNotes} className="text-sm" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
