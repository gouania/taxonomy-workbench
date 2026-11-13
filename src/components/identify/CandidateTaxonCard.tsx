import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  BookOpen,
} from 'lucide-react';
import { CandidateTaxon, NavigationTarget, PlaceRef } from '../../types';
import { CrossLink } from '../shared/CrossLink';
import { MarkdownRenderer } from '../shared/MarkdownRenderer';

interface CandidateTaxonCardProps {
  candidate: CandidateTaxon;
  locality?: string;
  place?: PlaceRef;
  specimenContext?: string;
  onNavigate: (target: NavigationTarget) => void;
}

const RANK_LABELS: Record<CandidateTaxon['rank'], string> = {
  species: 'Species',
  species_group: 'Species group',
  genus: 'Genus',
  family: 'Family',
};

function getAssessmentBadgeClass(assessment: CandidateTaxon['assessment']): string {
  switch (assessment) {
    case 'Consistent with observations':
      return 'bg-emerald-950/60 text-emerald-300 border-emerald-800/60';
    case 'Plausible candidate':
      return 'bg-cyan-950/60 text-cyan-300 border-cyan-800/60';
    case 'Uncertain / partial match':
      return 'bg-amber-950/60 text-amber-300 border-amber-800/60';
    case 'Weak match':
      return 'bg-rose-950/60 text-rose-300 border-rose-800/60';
    default:
      return 'bg-slate-800 text-slate-300 border-slate-700';
  }
}

export function CandidateTaxonCard({
  candidate,
  locality,
  place,
  specimenContext,
  onNavigate,
}: CandidateTaxonCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const resolvedLocality = place?.displayName || locality?.trim() || undefined;
  const guideGroup =
    candidate.rank === 'species' && candidate.name.includes(' ')
      ? candidate.name.split(' ')[0]
      : candidate.name.replace(/\s+(agg\.|group|complex)$/i, '').trim();
  const isItalicRank = candidate.rank !== 'family';

  return (
    <div className="bg-slate-900/60 border border-slate-800/70 rounded-2xl overflow-hidden transition-all hover:border-slate-700/70">
      <div
        className="p-5 sm:p-6 cursor-pointer flex items-start justify-between gap-4"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="space-y-2 min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="px-2 py-0.5 rounded-md text-[11px] font-mono uppercase tracking-wider bg-slate-800 text-slate-300 border border-slate-700">
              {RANK_LABELS[candidate.rank] || candidate.rank}
            </span>
            <h4 className="font-display text-xl sm:text-2xl font-bold text-white">
              <CrossLink
                target={{
                  module: 'profiles',
                  query: candidate.name,
                  locality: resolvedLocality,
                  place,
                }}
                onNavigate={onNavigate}
              >
                {isItalicRank ? <i>{candidate.name}</i> : candidate.name}
              </CrossLink>
            </h4>
            {candidate.authority && (
              <span className="text-sm text-slate-400">{candidate.authority}</span>
            )}
            <span
              className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${getAssessmentBadgeClass(
                candidate.assessment
              )}`}
            >
              {candidate.assessment}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm text-slate-400">
            {candidate.parent_order && <span>{candidate.parent_order}</span>}
            {candidate.parent_family && candidate.rank !== 'family' && (
              <>
                {candidate.parent_order && <span className="w-1 h-1 rounded-full bg-slate-700" />}
                <span>Family: {candidate.parent_family}</span>
              </>
            )}
            {candidate.common_name && (
              <>
                {(candidate.parent_order || (candidate.parent_family && candidate.rank !== 'family')) && (
                  <span className="w-1 h-1 rounded-full bg-slate-700" />
                )}
                <span className="text-cyan-400">{candidate.common_name}</span>
              </>
            )}
          </div>

          <div className="pt-1 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onNavigate({
                  module: 'guide',
                  query: guideGroup,
                  locality: resolvedLocality,
                  place,
                  specimenContext,
                });
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-indigo-950/70 hover:bg-indigo-900/80 text-indigo-300 border border-indigo-800/60 text-xs font-semibold transition-colors cursor-pointer"
            >
              <BookOpen size={12} />
              <span>Build a regional guide to {guideGroup} →</span>
            </button>
          </div>
        </div>

        <button
          type="button"
          className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors shrink-0"
          aria-label={isExpanded ? 'Collapse candidate details' : 'Expand candidate details'}
        >
          {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </button>
      </div>

      {/* Supporting / Contradicting / Missing Evidence summary */}
      <div className="px-5 sm:px-6 pb-4 space-y-2 text-xs sm:text-sm">
        {candidate.supporting_characters.length > 0 && (
          <div className="flex items-start gap-2 text-emerald-300/90">
            <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-400" />
            <p>
              <span className="font-semibold text-emerald-300">Matches supplied characters:</span>{' '}
              {candidate.supporting_characters.join('; ')}
            </p>
          </div>
        )}

        {candidate.contradicting_characters.length > 0 && (
          <div className="flex items-start gap-2 text-amber-300/90">
            <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-400" />
            <p>
              <span className="font-semibold text-amber-300">Contradictions / anomalies:</span>{' '}
              {candidate.contradicting_characters.join('; ')}
            </p>
          </div>
        )}

        {candidate.missing_evidence.length > 0 && (
          <div className="flex items-start gap-2 text-slate-300">
            <HelpCircle size={15} className="mt-0.5 shrink-0 text-cyan-400" />
            <p>
              <span className="font-semibold text-slate-200">Missing evidence:</span>{' '}
              {candidate.missing_evidence.join('; ')}
            </p>
          </div>
        )}
      </div>

      {isExpanded && (
        <div className="px-5 sm:px-6 pb-6 pt-4 border-t border-slate-800/60 space-y-5 bg-slate-950/30">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <h5 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                Diagnostic Characters
              </h5>
              <MarkdownRenderer content={candidate.diagnostic_characters} className="text-sm" />
            </div>
            <div>
              <h5 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                Separation from Alternatives
              </h5>
              <MarkdownRenderer content={candidate.differential_diagnosis} className="text-sm" />
            </div>
          </div>

          {candidate.possible_subtaxa && candidate.possible_subtaxa.length > 0 && (
            <div className="pt-4 border-t border-slate-800/60">
              <h5 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
                Possible Subordinate Taxa
              </h5>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {candidate.possible_subtaxa.map((sub, idx) => (
                  <div
                    key={idx}
                    className="bg-slate-900/70 border border-slate-800 rounded-xl p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <CrossLink
                        target={{
                          module: 'profiles',
                          query: sub.name,
                          locality: resolvedLocality,
                          place,
                        }}
                        onNavigate={onNavigate}
                      >
                        <i className="font-serif text-cyan-400 text-sm">{sub.name}</i>
                      </CrossLink>
                      <span className="text-[10px] font-mono text-slate-500 uppercase">
                        {sub.rank}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1.5">{sub.notes}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {candidate.regional_notes && (
            <div className="pt-4 border-t border-slate-800/60">
              <h5 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Regional Context Note
              </h5>
              <MarkdownRenderer content={candidate.regional_notes} className="text-sm" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
