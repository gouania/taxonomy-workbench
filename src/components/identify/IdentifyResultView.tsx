import React from 'react';
import {
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  BookOpen,
  Scale,
  ArrowRight,
  Microscope,
  RotateCcw,
  Loader2,
  Info,
  Trash2,
} from 'lucide-react';
import {
  FollowUpObservation,
  GroundingSource,
  IdentifyRank,
  IdentifyResult,
  NavigationTarget,
  PlaceRef,
  SpecimenRecord,
} from '../../types';
import { CandidateTaxonCard } from './CandidateTaxonCard';
import { MarkdownRenderer } from '../shared/MarkdownRenderer';
import { SourcesBar } from '../shared/SourcesBar';
import { LiteratureSection } from '../shared/LiteratureSection';
import { CrossLink } from '../shared/CrossLink';

interface IdentifyResultViewProps {
  result: IdentifyResult;
  sources: GroundingSource[];
  locality?: string;
  place?: PlaceRef;
  specimenContext?: string;
  specimenRecord?: SpecimenRecord;
  recordedObservations: FollowUpObservation[];
  draftAnswers: Record<string, FollowUpObservation>;
  onSelectDraftAnswer: (obs: FollowUpObservation) => void;
  onClearDraftAnswer: (questionId: string) => void;
  onUpdateRecordedObservation: (obs: FollowUpObservation) => void;
  onRemoveRecordedObservation: (observationKey: string) => void;
  onSubmitFollowups: () => void;
  onCompareCandidates: () => void;
  isUpdating: boolean;
  onNavigate: (target: NavigationTarget) => void;
}

const RANK_BADGE: Record<IdentifyRank, { label: string; style: string }> = {
  species: {
    label: 'Species',
    style: 'bg-emerald-950/70 text-emerald-300 border-emerald-700/60',
  },
  species_group: {
    label: 'Species group',
    style: 'bg-cyan-950/70 text-cyan-300 border-cyan-700/60',
  },
  genus: {
    label: 'Genus',
    style: 'bg-cyan-950/70 text-cyan-300 border-cyan-700/60',
  },
  family: {
    label: 'Family',
    style: 'bg-indigo-950/70 text-indigo-300 border-indigo-700/60',
  },
  unresolved: {
    label: 'Unresolved',
    style: 'bg-amber-950/70 text-amber-300 border-amber-700/60',
  },
};

export function IdentifyResultView({
  result,
  sources,
  locality,
  place,
  specimenContext,
  specimenRecord,
  recordedObservations,
  draftAnswers,
  onSelectDraftAnswer,
  onClearDraftAnswer,
  onUpdateRecordedObservation,
  onRemoveRecordedObservation,
  onSubmitFollowups,
  onCompareCandidates,
  isUpdating,
  onNavigate,
}: IdentifyResultViewProps) {
  const { supported_identification: sup } = result;
  const rankMeta = RANK_BADGE[sup.rank] || RANK_BADGE.unresolved;
  const resolvedLocality = place?.displayName || locality?.trim() || undefined;

  // Choose the most useful group name for building a regional guide:
  // If resolved to species, build a guide for its genus (so related local species are compared);
  // otherwise use genus or family or the first candidate's parent family/name.
  const guideGroup =
    sup.rank === 'species'
      ? sup.genus || sup.taxon_name.split(' ')[0]
      : sup.status === 'resolved_to_rank'
      ? sup.taxon_name
      : sup.family || result.candidates[0]?.parent_family || result.candidates[0]?.name || '';

  const hasDraftAnswers = Object.keys(draftAnswers).length > 0;
  const candidateNamesForExplore = result.candidates.slice(0, 3).map((c) => c.name);

  return (
    <div className="mt-10 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* 1. Best-Supported Identification + Finer Hypotheses Separated */}
      <section
        aria-label="Best-supported identification"
        className={`rounded-3xl border p-6 sm:p-7 space-y-5 shadow-xl ${
          sup.status === 'unresolved'
            ? 'bg-amber-950/15 border-amber-800/50'
            : 'bg-slate-900/75 border-cyan-800/50'
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-mono uppercase tracking-wider text-slate-400">
                Best-supported identification
              </span>
              <span
                data-testid="supported-rank-badge"
                className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${rankMeta.style}`}
              >
                Rank: {rankMeta.label}
              </span>
              {sup.family && sup.rank !== 'family' && sup.rank !== 'unresolved' && (
                <span className="px-2.5 py-0.5 rounded-full text-xs bg-slate-800/80 text-slate-300 border border-slate-700">
                  Family: {sup.family}
                </span>
              )}
            </div>

            <h2 className="font-display text-2xl sm:text-3xl font-bold text-white">
              {sup.status === 'resolved_to_rank' ? (
                <CrossLink
                  target={{
                    module: 'profiles',
                    query: sup.taxon_name,
                    locality: resolvedLocality,
                    place,
                  }}
                  onNavigate={onNavigate}
                >
                  {sup.rank === 'family' ? sup.taxon_name : <i>{sup.taxon_name}</i>}
                </CrossLink>
              ) : (
                <span className="text-amber-300">{sup.taxon_name}</span>
              )}
              {sup.authority && (
                <span className="text-base font-normal text-slate-400 ml-2">{sup.authority}</span>
              )}
            </h2>

            <p className="text-sm sm:text-base text-slate-200 font-medium">{sup.statement}</p>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80 space-y-2 text-sm">
          <div className="text-xs font-semibold uppercase tracking-wider text-cyan-400">
            Why identification stands at this level
          </div>
          <p className="text-slate-300 leading-relaxed">{sup.why_it_stops_here}</p>
          {sup.limitations_note && (
            <div className="pt-2 mt-2 border-t border-slate-800/70 flex items-start gap-2 text-amber-200/90 text-xs sm:text-sm">
              <AlertCircle size={15} className="text-amber-400 shrink-0 mt-0.5" />
              <span>{sup.limitations_note}</span>
            </div>
          )}
        </div>

        {result.evidence_audit && result.evidence_audit.ungroundedClaims.length > 0 && (
          <div
            data-testid="identify-evidence-audit-banner"
            className="p-4 rounded-2xl bg-amber-950/25 border border-amber-800/50 text-amber-200 text-xs space-y-1"
          >
            <div className="flex items-center gap-2 font-semibold text-amber-300">
              <AlertCircle size={14} className="shrink-0" />
              <span>
                {result.evidence_audit.downgradedFrom
                  ? `Supported rank adjusted from ${result.evidence_audit.downgradedFrom} after evidence check`
                  : 'Evidence check filtered unverified claims'}
              </span>
            </div>
            {result.evidence_audit.reason && (
              <p className="text-amber-100/90 leading-relaxed">{result.evidence_audit.reason}</p>
            )}
          </div>
        )}

        {/* Finer candidate hypotheses explicitly kept separate */}
        {result.finer_hypotheses && result.finer_hypotheses.length > 0 && (
          <div
            data-testid="finer-hypotheses-box"
            className="p-4 rounded-2xl bg-slate-950/45 border border-slate-800/80 space-y-2.5"
          >
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-amber-300">
              <HelpCircle size={14} className="text-amber-400" />
              <span>Finer candidate possibilities (not yet established)</span>
            </div>
            <div className="space-y-2.5">
              {result.finer_hypotheses.map((hyp, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/70 text-xs sm:text-sm space-y-1"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px] uppercase">
                      Possible {hyp.rank.replace('_', ' ')}
                    </span>
                    <span className="font-serif italic font-semibold text-white">
                      {hyp.taxon_name}
                    </span>
                  </div>
                  <p className="text-slate-300">{hyp.rationale}</p>
                  <p className="text-amber-300/90">
                    <span className="font-semibold">Unverified / missing:</span>{' '}
                    {hyp.missing_or_unverified}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Evidence supplied by user */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Supplied observations used
          </h3>
          {result.supporting_evidence.length > 0 ? (
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs sm:text-sm text-slate-300">
              {result.supporting_evidence.map((ev, idx) => (
                <li
                  key={idx}
                  className="flex items-start gap-2 bg-slate-950/40 border border-slate-800/60 rounded-xl px-3 py-2"
                >
                  <CheckCircle2 size={14} className="text-emerald-400 shrink-0 mt-0.5" />
                  <span>{ev}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-slate-400">
              Limited morphological evidence was supplied; check candidates and follow-up questions below.
            </p>
          )}
          <div className="pt-1 text-sm text-slate-300">
            <MarkdownRenderer content={result.analysis_summary} />
          </div>
        </div>

        {/* Connected Workflows (Non-circular) */}
        {(guideGroup || result.candidates.length >= 2) && (
          <div className="pt-4 border-t border-slate-800/80 space-y-2.5">
            <div className="flex flex-wrap items-center gap-3">
              {guideGroup && (
                <button
                  type="button"
                  onClick={() =>
                    onNavigate({
                      module: 'guide',
                      query: guideGroup,
                      locality: resolvedLocality,
                      place,
                      specimenContext,
                      specimenRecord,
                    })
                  }
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-950/70 hover:bg-indigo-900/80 text-indigo-200 border border-indigo-700/60 text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
                >
                  <BookOpen size={15} />
                  <span>Build a regional guide to {guideGroup}</span>
                </button>
              )}

              {result.candidates.length >= 2 && (
                <button
                  type="button"
                  onClick={onCompareCandidates}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-950/70 hover:bg-cyan-900/80 text-cyan-200 border border-cyan-700/60 text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
                >
                  <Scale size={15} />
                  <span>Compare remaining candidates</span>
                </button>
              )}

              {candidateNamesForExplore.length >= 2 && (
                <button
                  type="button"
                  onClick={() =>
                    onNavigate({
                      module: 'profiles',
                      mode: 'compare',
                      compareTaxa: candidateNamesForExplore,
                      locality: resolvedLocality,
                      place,
                      specimenContext,
                      specimenRecord,
                    })
                  }
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-slate-200 border border-slate-700 text-xs font-medium transition-colors cursor-pointer"
                >
                  <span>Side-by-side profiles</span>
                  <ArrowRight size={13} />
                </button>
              )}
            </div>

            <p className="text-[11px] text-slate-400 flex items-start gap-1.5 leading-relaxed">
              <Info size={13} className="text-slate-500 shrink-0 mt-0.5" />
              <span>
                A regional guide or comparison is a candidate aid, not independent verification. Agreement across workbench outputs does not confirm an identification, and regional lists do not prove an unlisted or introduced taxon cannot occur.
              </span>
            </p>
          </div>
        )}
      </section>

      {/* 1b. Inline Candidate Comparison Table (from current evaluation) */}
      {result.comparison_rows && result.comparison_rows.length > 0 && (
        <section
          aria-label="Inline candidate comparison"
          data-testid="identify-inline-comparison-table"
          className="rounded-3xl border border-slate-800/80 bg-slate-900/60 p-5 sm:p-6 space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-display text-xl font-bold text-white">
                Candidate Character Comparison
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Supplied specimen observations compared directly against remaining candidates.
              </p>
            </div>
            {result.candidates.length >= 2 && (
              <button
                type="button"
                onClick={onCompareCandidates}
                className="text-xs text-cyan-400 hover:text-cyan-300 font-medium inline-flex items-center gap-1 cursor-pointer"
              >
                <Scale size={13} />
                <span>Full comparison modal</span>
              </button>
            )}
          </div>

          <div className="border border-slate-800 rounded-2xl overflow-x-auto bg-slate-950/50">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950 text-slate-400 font-mono uppercase tracking-wider text-[10px]">
                  <th className="p-3 min-w-[160px]">Character</th>
                  <th className="p-3 min-w-[170px] border-l border-slate-800/80 text-cyan-300">
                    Supplied Specimen
                  </th>
                  {result.candidates.slice(0, 4).map((c) => (
                    <th key={c.name} className="p-3 min-w-[170px] border-l border-slate-800/80">
                      <span className="text-slate-200 normal-case font-sans font-semibold text-xs block">
                        {c.rank === 'family' ? c.name : <i>{c.name}</i>}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {result.comparison_rows.map((row, rIdx) => {
                  const matchingQ = row.matching_followup_id
                    ? result.followup_questions.find((q) => q.id === row.matching_followup_id)
                    : undefined;
                  const draft = matchingQ ? draftAnswers[matchingQ.id] : undefined;

                  return (
                    <tr key={`${row.character}-${rIdx}`} className="hover:bg-slate-900/40 transition-colors">
                      <td className="p-3 align-top">
                        <div className="font-semibold text-slate-200">{row.character}</div>
                        <div className="text-[10px] font-mono text-slate-500 mt-0.5">{row.organ}</div>
                      </td>
                      <td className="p-3 align-top border-l border-slate-800/60 space-y-2">
                        <div
                          className={
                            /not observed|unsure/i.test(row.specimen_state)
                              ? 'text-slate-400 italic'
                              : 'text-cyan-200 font-medium'
                          }
                        >
                          {row.specimen_state}
                        </div>
                        {matchingQ && (
                          <div className="flex flex-wrap gap-1 pt-1">
                            {matchingQ.options.slice(0, 3).map((opt) => {
                              const picked = draft?.status === 'observed' && draft.answer === opt;
                              return (
                                <button
                                  key={opt}
                                  type="button"
                                  disabled={isUpdating}
                                  onClick={() =>
                                    picked
                                      ? onClearDraftAnswer(matchingQ.id)
                                      : onSelectDraftAnswer({
                                          questionId: matchingQ.id,
                                          prompt: matchingQ.prompt,
                                          targetOrgan: matchingQ.target_organ,
                                          answer: opt,
                                          status: 'observed',
                                        })
                                  }
                                  className={`px-2 py-0.5 rounded-md text-[10px] border cursor-pointer transition-colors ${
                                    picked
                                      ? 'bg-cyan-600/30 border-cyan-400 text-cyan-100 font-semibold'
                                      : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-500'
                                  }`}
                                >
                                  {opt}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </td>
                      {result.candidates.slice(0, 4).map((c) => {
                        const cell = row.candidate_states.find(
                          (cs) => cs.taxon_name.toLowerCase().trim() === c.name.toLowerCase().trim()
                        );
                        const statusStyle =
                          cell?.status === 'match'
                            ? 'text-emerald-300 bg-emerald-950/30 border-emerald-800/50'
                            : cell?.status === 'conflict'
                            ? 'text-amber-300 bg-amber-950/30 border-amber-800/50'
                            : 'text-slate-400 bg-slate-900/60 border-slate-800';
                        const statusLabel =
                          cell?.status === 'match'
                            ? 'Match'
                            : cell?.status === 'conflict'
                            ? 'Conflict'
                            : 'Unexamined';

                        return (
                          <td key={c.name} className="p-3 align-top border-l border-slate-800/60 space-y-1">
                            <div className="text-slate-300 leading-relaxed">
                              {cell?.expected_state || 'Not established'}
                            </div>
                            {cell && (
                              <span
                                className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-mono border ${statusStyle}`}
                              >
                                {statusLabel}
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* 2. Recorded Follow-Up Answers (Editable / Correctable) */}
      {recordedObservations.length > 0 && (
        <section
          aria-label="Recorded follow-up observations"
          className="rounded-3xl border border-slate-800/80 bg-slate-900/50 p-5 sm:p-6 space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-white">
              Recorded follow-up observations ({recordedObservations.length})
            </h3>
            <span className="text-xs text-slate-400">
              Correct any earlier answer or switch it to Not observed / Unsure, then re-evaluate.
            </span>
          </div>

          <div className="space-y-2">
            {recordedObservations.map((obs) => {
              const obsKey = obs.id || `${obs.questionId}::${obs.prompt}`;
              return (
              <div
                key={obsKey}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl bg-slate-950/60 border border-slate-800/70 text-xs"
              >
                <div className="space-y-0.5">
                  <div className="text-slate-300 font-medium">{obs.prompt}</div>
                  <div className="text-cyan-300 font-mono">
                    {obs.status === 'observed'
                      ? `Observed: ${obs.answer}`
                      : obs.status === 'not_observed'
                      ? 'Not observed (treated as missing, not absent)'
                      : 'Unsure (treated as missing, not absent)'}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                  {obs.status !== 'not_observed' && (
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateRecordedObservation({
                          ...obs,
                          answer: 'Not observed',
                          status: 'not_observed',
                        })
                      }
                      disabled={isUpdating}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 cursor-pointer"
                    >
                      Mark Not observed
                    </button>
                  )}
                  {obs.status !== 'unsure' && (
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateRecordedObservation({
                          ...obs,
                          answer: 'Unsure',
                          status: 'unsure',
                        })
                      }
                      disabled={isUpdating}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 cursor-pointer"
                    >
                      Mark Unsure
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onRemoveRecordedObservation(obsKey)}
                    disabled={isUpdating}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 cursor-pointer"
                    title="Remove this observation"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
              );
            })}
          </div>

          <div className="pt-1">
            <button
              type="button"
              onClick={onSubmitFollowups}
              disabled={isUpdating}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
            >
              {isUpdating ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
              <span>Re-evaluate with corrected observations</span>
            </button>
          </div>
        </section>
      )}

      {/* 3. Adaptive Follow-Up Questions */}
      {result.followup_questions.length > 0 && (
        <section
          aria-label="Follow-up questions"
          data-testid="identify-followup-section"
          className="rounded-3xl border border-cyan-800/40 bg-slate-900/60 p-5 sm:p-6 space-y-5"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800/80">
            <div>
              <h3 className="font-display text-xl font-bold text-white">
                Narrow down further — Follow-up questions
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Adapted to {sup.status === 'resolved_to_rank' ? sup.taxon_name : 'the remaining candidates'}. Selecting <span className="text-slate-200 font-medium">Not observed</span> or <span className="text-slate-200 font-medium">Unsure</span> treats the feature as missing rather than absent.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {result.followup_questions.map((q) => {
              const selected = draftAnswers[q.id];
              return (
                <div
                  key={q.id}
                  className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80 space-y-2.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-white">{q.prompt}</div>
                    <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-[11px] font-mono text-cyan-300">
                      {q.target_organ}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">{q.why_asked}</p>

                  <div className="flex flex-wrap gap-2 pt-1">
                    {q.options.map((option) => {
                      const isPicked = selected?.status === 'observed' && selected.answer === option;
                      return (
                        <button
                          key={option}
                          type="button"
                          disabled={isUpdating}
                          onClick={() => {
                            if (isPicked) {
                              onClearDraftAnswer(q.id);
                            } else {
                              onSelectDraftAnswer({
                                questionId: q.id,
                                prompt: q.prompt,
                                targetOrgan: q.target_organ,
                                answer: option,
                                status: 'observed',
                              });
                            }
                          }}
                          className={`px-3 py-1.5 rounded-xl text-xs border transition-colors cursor-pointer ${
                            isPicked
                              ? 'bg-cyan-600/30 border-cyan-400 text-cyan-100 font-semibold'
                              : 'bg-slate-900 border-slate-700/80 text-slate-300 hover:border-slate-500 hover:text-white'
                          }`}
                        >
                          {option}
                        </button>
                      );
                    })}

                    <button
                      type="button"
                      disabled={isUpdating}
                      onClick={() => {
                        if (selected?.status === 'not_observed') {
                          onClearDraftAnswer(q.id);
                        } else {
                          onSelectDraftAnswer({
                            questionId: q.id,
                            prompt: q.prompt,
                            targetOrgan: q.target_organ,
                            answer: 'Not observed',
                            status: 'not_observed',
                          });
                        }
                      }}
                      className={`px-3 py-1.5 rounded-xl text-xs border transition-colors cursor-pointer ${
                        selected?.status === 'not_observed'
                          ? 'bg-amber-950/60 border-amber-500/70 text-amber-200 font-semibold'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                      }`}
                    >
                      Not observed
                    </button>

                    <button
                      type="button"
                      disabled={isUpdating}
                      onClick={() => {
                        if (selected?.status === 'unsure') {
                          onClearDraftAnswer(q.id);
                        } else {
                          onSelectDraftAnswer({
                            questionId: q.id,
                            prompt: q.prompt,
                            targetOrgan: q.target_organ,
                            answer: 'Unsure',
                            status: 'unsure',
                          });
                        }
                      }}
                      className={`px-3 py-1.5 rounded-xl text-xs border transition-colors cursor-pointer ${
                        selected?.status === 'unsure'
                          ? 'bg-amber-950/60 border-amber-500/70 text-amber-200 font-semibold'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                      }`}
                    >
                      Unsure
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <span className="text-xs text-slate-400">
              {hasDraftAnswers
                ? `${Object.keys(draftAnswers).length} response${Object.keys(draftAnswers).length === 1 ? '' : 's'} ready to incorporate`
                : 'Select one or more answers above to narrow the identification.'}
            </span>
            <button
              type="button"
              onClick={onSubmitFollowups}
              disabled={isUpdating || !hasDraftAnswers}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {isUpdating ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Reconsidering identification...</span>
                </>
              ) : (
                <>
                  <RotateCcw size={16} />
                  <span>Update identification</span>
                </>
              )}
            </button>
          </div>
        </section>
      )}

      {/* 4. What to Examine Next */}
      {result.what_to_examine_next.length > 0 && (
        <section
          aria-label="What to examine next"
          className="rounded-3xl border border-slate-800/80 bg-slate-900/50 p-5 sm:p-6 space-y-4"
        >
          <div className="flex items-center gap-2">
            <Microscope size={18} className="text-cyan-400" />
            <h3 className="font-display text-xl font-bold text-white">What to examine next</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {result.what_to_examine_next.map((step, idx) => (
              <div
                key={idx}
                className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80 space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-white">
                    {step.priority}. {step.feature}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-[11px] font-mono text-slate-400">
                    {step.organ}
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-cyan-200/90">{step.what_to_look_for}</p>
                <p className="text-xs text-slate-400">{step.why_it_separates_candidates}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 5. Remaining Candidates */}
      {result.candidates.length > 0 && (
        <section aria-label="Remaining candidates" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display text-2xl font-bold text-white">
              Remaining Candidates ({result.candidates.length})
            </h3>
            <span className="text-xs text-slate-400">
              Showing supporting characters, contradictions, and missing evidence
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {result.candidates.map((candidate, idx) => (
              <CandidateTaxonCard
                key={`${candidate.rank}_${candidate.name}_${idx}`}
                candidate={candidate}
                locality={resolvedLocality}
                place={place}
                specimenContext={specimenContext}
                specimenRecord={specimenRecord}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        </section>
      )}

      {/* 6. Taxonomic Notes & References */}
      {result.taxonomic_notes && (
        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/40 p-5 space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Taxonomic &amp; Nomenclatural Notes
          </h4>
          <MarkdownRenderer content={result.taxonomic_notes} className="text-sm" />
        </div>
      )}

      <section aria-label="Relevant references" className="space-y-4">
        <div
          data-testid="identify-provenance-banner"
          className="rounded-2xl border border-slate-800/80 bg-slate-900/50 p-5 space-y-2.5 text-xs"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="font-semibold text-slate-200 uppercase tracking-wider text-xs">
              Retrieved Supporting Web References
            </h4>
            <span
              className={`px-2 py-0.5 rounded text-[11px] font-mono border ${
                sources.length > 0
                  ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800/60'
                  : 'bg-amber-950/50 text-amber-300 border-amber-800/50'
              }`}
            >
              {sources.length > 0
                ? `${sources.length} retrieved web ${sources.length === 1 ? 'source' : 'sources'}`
                : 'No retrieved web sources'}
            </span>
          </div>
          <p className="text-slate-400 leading-relaxed">
            {result.provenance?.basisNote ||
              (sources.length > 0
                ? 'Supporting web references retrieved for candidate evaluation. Suggested literature below is listed separately for manual verification.'
                : 'No external web references were retrieved for this evaluation. Suggested reading below is not directly retrieved or verified.')}
          </p>
          <SourcesBar sources={sources} mode="inline" />
        </div>

        {result.recommended_literature && result.recommended_literature.length > 0 && (
          <LiteratureSection
            literature={result.recommended_literature}
            locality={resolvedLocality}
            title="Suggested Floras & Identification Reading"
            subtitle="Suggested works for manual consultation — not directly retrieved or verified during this identification."
          />
        )}
      </section>
    </div>
  );
}
