import {
  Sparkles,
  Loader2,
  Trash2,
  MapPin,
  SlidersHorizontal,
  FileText,
  Search,
  Compass,
  BookOpen,
  RotateCcw,
} from 'lucide-react';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { CHARACTER_GROUPS, MODEL_CACHE_TAG } from '../../constants';
import { cacheService } from '../../services/cacheService';
import { geminiService, compareGuideTaxa, isAbortError, syncRuntimeCacheNamespace } from '../../services/geminiService';
import {
  FollowUpObservation,
  GroundingSource,
  GuideSubsetComparison,
  IdentifyResult,
  NavigationTarget,
  PlaceRef,
  SpecimenRecord,
} from '../../types';
import { formatSpecimenSummary } from '../../utils/identifyEvidence';
import { ErrorDisplay } from '../shared/ErrorDisplay';
import { TaskProgressCard } from '../shared/TaskProgressCard';
import { CharacterSelector } from './CharacterSelector';
import { IdentifyResultView } from './IdentifyResultView';
import { PlaceContextChip } from '../shared/PlaceContextChip';
import { GuideSubsetModal } from '../guide/GuideSubsetModal';

interface IdentifyModuleProps {
  onNavigate: (target: NavigationTarget) => void;
  initialLocality?: string;
  initialPlace?: PlaceRef;
  navRequestId?: number;
}

const QUICK_PROMPTS = [
  { label: '+ Leaves', snippet: '- Leaves: ' },
  { label: '+ Flowers', snippet: '- Flowers: ' },
  { label: '+ Stem / Sap', snippet: '- Stem & Sap: ' },
  { label: '+ Fruit / Seeds', snippet: '- Fruit: ' },
  { label: '+ Odor', snippet: '- Odor: ' },
  { label: '+ Habit / Height', snippet: '- Habit & Height: ' },
];

const SAMPLE_SPECIMEN = {
  location: 'Yosemite National Park, moist riparian understory near river, 1,200m',
  notes:
    'Erect perennial herb ~60 cm tall in shaded riparian forest. Opposite serrate ovate-lanceolate leaves with stinging trichomes. Square green stem, fibrous roots, clear non-milky watery exudate. Dense axillary clusters of tiny greenish-white unisexual apetalous flowers.',
  suspectedFamilies: 'Urticaceae',
};

export const IDENTIFY_LIMITS = {
  notes: 6000,
  location: 250,
  habitat: 250,
  suspectedFamilies: 500,
  followups: 30,
};

function getObservationIdentityKey(obs: Pick<FollowUpObservation, 'id' | 'questionId' | 'prompt'>): string {
  return obs.id || `${obs.questionId}::${obs.prompt}`;
}

export function mergeObservations(
  existing: FollowUpObservation[],
  drafts: Record<string, FollowUpObservation>,
  createId?: () => string
): FollowUpObservation[] {
  const result = existing.map((obs) => ({
    ...obs,
    id: obs.id || (createId ? createId() : `obs_${obs.questionId}`),
  }));

  for (const draft of Object.values(drafts)) {
    const matchIdx = result.findIndex(
      (item) =>
        (draft.id && item.id === draft.id) ||
        (item.questionId === draft.questionId && item.prompt === draft.prompt)
    );
    if (matchIdx >= 0) {
      result[matchIdx] = {
        ...draft,
        id: result[matchIdx].id,
      };
    } else {
      result.push({
        ...draft,
        id: draft.id || (createId ? createId() : `obs_${draft.questionId}_${result.length + 1}`),
      });
    }
  }
  return result;
}

export function IdentifyModule({
  onNavigate,
  initialLocality,
  initialPlace,
  navRequestId,
}: IdentifyModuleProps) {
  const [selectedCharacters, setSelectedCharacters] = useState<Set<string>>(new Set());
  const [suggestedCharacters, setSuggestedCharacters] = useState<Map<string, string>>(new Map());
  const [notes, setNotes] = useState('');
  const [location, setLocation] = useState(initialPlace?.displayName || initialLocality || '');
  const [activePlace, setActivePlace] = useState<PlaceRef | null>(
    initialPlace || (initialLocality ? { displayName: initialLocality, scopeType: 'unknown' } : null)
  );
  const [observedHabitat, setObservedHabitat] = useState('');
  const [suspectedFamilies, setSuspectedFamilies] = useState('');
  const [showCharacterMatrix, setShowCharacterMatrix] = useState(false);

  // Iterative follow-up observation ledger & pending draft answers
  const [recordedObservations, setRecordedObservations] = useState<FollowUpObservation[]>([]);
  const [draftAnswers, setDraftAnswers] = useState<Record<string, FollowUpObservation>>({});

  // Candidate subset comparison modal state
  const [isCompareOpen, setIsCompareOpen] = useState(false);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);
  const [compareData, setCompareData] = useState<GuideSubsetComparison | null>(null);

  const locationInputRef = useRef<HTMLInputElement | null>(null);
  const obsCounterRef = useRef(0);
  const identifyAbortRef = useRef<AbortController | null>(null);
  const compareAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      identifyAbortRef.current?.abort();
      compareAbortRef.current?.abort();
    };
  }, []);

  const [isLoading, setIsLoading] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [gpsStatus, setGpsStatus] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ data: IdentifyResult; sources: GroundingSource[] } | null>(
    null
  );

  useEffect(() => {
    if (initialPlace) {
      setActivePlace(initialPlace);
      setLocation(initialPlace.displayName);
      setObservedHabitat('');
    } else if (initialLocality) {
      setActivePlace({ displayName: initialLocality, scopeType: 'unknown' });
      setLocation(initialLocality);
      setObservedHabitat('');
    }
  }, [initialLocality, initialPlace, navRequestId]);

  const charLabels = useMemo(() => {
    return Array.from(selectedCharacters).map((id) => {
      for (const group of CHARACTER_GROUPS) {
        const char = group.characters.find((c) => c.id === id);
        if (char) return char.label;
      }
      return id;
    });
  }, [selectedCharacters]);

  const combinedLocation = useMemo(() => {
    if (location.trim() && observedHabitat.trim()) {
      return `${location.trim()} — Observed habitat: ${observedHabitat.trim()}`;
    }
    if (observedHabitat.trim()) {
      return `Observed habitat: ${observedHabitat.trim()}`;
    }
    return location.trim();
  }, [location, observedHabitat]);

  const specimenRecord: SpecimenRecord = useMemo(
    () => ({
      notes: notes.trim() || undefined,
      selectedTraits: charLabels,
      observedHabitat: observedHabitat.trim() || undefined,
      locality: location.trim() || undefined,
      followups: recordedObservations,
    }),
    [notes, charLabels, observedHabitat, location, recordedObservations]
  );

  const specimenContextString = useMemo(
    () => formatSpecimenSummary(specimenRecord),
    [specimenRecord]
  );

  const limitViolationMessage = useMemo(() => {
    if (notes.trim().length > IDENTIFY_LIMITS.notes) {
      return `Specimen notes exceed ${IDENTIFY_LIMITS.notes} characters (${notes.trim().length}). Shorten notes before submitting.`;
    }
    if (combinedLocation.length > IDENTIFY_LIMITS.location) {
      return `Collection place + habitat exceed ${IDENTIFY_LIMITS.location} characters (${combinedLocation.length}).`;
    }
    if (suspectedFamilies.trim().length > IDENTIFY_LIMITS.suspectedFamilies) {
      return `Suspected taxa exceed ${IDENTIFY_LIMITS.suspectedFamilies} characters.`;
    }
    if (recordedObservations.length > IDENTIFY_LIMITS.followups) {
      return `Follow-up observations exceed the ${IDENTIFY_LIMITS.followups}-item maximum. Remove older entries to continue.`;
    }
    return null;
  }, [notes, combinedLocation, suspectedFamilies, recordedObservations]);

  const handleToggleCharacter = (id: string) => {
    const newSet = new Set(selectedCharacters);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedCharacters(newSet);
  };

  const handleInsertPrompt = (snippet: string) => {
    setNotes((prev) => {
      const trimmed = prev.trim();
      if (!trimmed) return snippet;
      return `${prev.endsWith('\n') ? prev : prev + '\n'}${snippet}`;
    });
  };

  const handleUseGPS = () => {
    if (!navigator.geolocation) {
      setGpsStatus('Geolocation not supported by browser');
      setTimeout(() => setGpsStatus(null), 4000);
      return;
    }

    setIsLocating(true);
    setGpsStatus(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocating(false);
        const { latitude, longitude } = pos.coords;
        const latStr = latitude >= 0 ? `${latitude.toFixed(4)}° N` : `${Math.abs(latitude).toFixed(4)}° S`;
        const lngStr = longitude >= 0 ? `${longitude.toFixed(4)}° E` : `${Math.abs(longitude).toFixed(4)}° W`;
        setLocation(`${latStr}, ${lngStr}`);
        setGpsStatus('GPS coordinates acquired');
        setTimeout(() => setGpsStatus(null), 3500);
      },
      (err) => {
        setIsLocating(false);
        setGpsStatus(`GPS error: ${err.message || 'Location access denied'}`);
        setTimeout(() => setGpsStatus(null), 4500);
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  const handleLoadSample = () => {
    setLocation(SAMPLE_SPECIMEN.location);
    setNotes(SAMPLE_SPECIMEN.notes);
    setSuspectedFamilies(SAMPLE_SPECIMEN.suspectedFamilies);
    setRecordedObservations([]);
    setDraftAnswers({});
    setError(null);
  };

  const handleClearAll = () => {
    setSelectedCharacters(new Set());
    setSuggestedCharacters(new Map());
    setNotes('');
    setLocation('');
    setActivePlace(null);
    setObservedHabitat('');
    setSuspectedFamilies('');
    setRecordedObservations([]);
    setDraftAnswers({});
    setCompareData(null);
    setCompareError(null);
    setIsCompareOpen(false);
    setResult(null);
    setError(null);
    setGpsStatus(null);
  };

  const handleCancelIdentify = () => {
    identifyAbortRef.current?.abort();
    identifyAbortRef.current = null;
    setIsLoading(false);
  };

  const runIdentification = async (nextRecorded: FollowUpObservation[]) => {
    if (selectedCharacters.size === 0 && !notes.trim()) {
      setError('Please provide specimen field observations or select characters from the matrix.');
      return;
    }
    if (nextRecorded.length > IDENTIFY_LIMITS.followups) {
      setError(`Follow-up observations exceed the ${IDENTIFY_LIMITS.followups}-item maximum. Remove older entries first.`);
      return;
    }
    if (limitViolationMessage) {
      setError(limitViolationMessage);
      return;
    }

    identifyAbortRef.current?.abort();
    const controller = new AbortController();
    identifyAbortRef.current = controller;

    setIsLoading(true);
    setError(null);

    try {
      await syncRuntimeCacheNamespace(controller.signal);
      if (identifyAbortRef.current !== controller) return;

      const cacheKey = `identify_${MODEL_CACHE_TAG}_v3_${btoa(
        encodeURIComponent(
          JSON.stringify({
            charLabels,
            notes,
            location: combinedLocation,
            suspectedFamilies,
            followupObservations: nextRecorded,
          })
        )
      )}`;
      const cached = cacheService.get<{ data: IdentifyResult; sources: GroundingSource[] }>(cacheKey);

      if (cached) {
        if (identifyAbortRef.current === controller) {
          setResult(cached);
          setRecordedObservations(nextRecorded);
          setDraftAnswers({});
        }
      } else {
        const { result: data, sources, cacheNamespace } = await geminiService.identifySpecimen(
          charLabels,
          notes,
          combinedLocation,
          suspectedFamilies,
          true,
          nextRecorded,
          controller.signal
        );
        if (identifyAbortRef.current === controller) {
          setResult({ data, sources });
          setRecordedObservations(nextRecorded);
          setDraftAnswers({});
          cacheService.set(cacheKey, { data, sources }, cacheNamespace);
        }
      }
    } catch (err: any) {
      if (isAbortError(err)) return;
      if (identifyAbortRef.current === controller) {
        setError(
          err.message || 'Couldn’t match specimen characters right now. Check your connection and try again.'
        );
      }
    } finally {
      if (identifyAbortRef.current === controller) {
        setIsLoading(false);
      }
    }
  };

  const nextObservationId = () => `obs_${++obsCounterRef.current}`;

  const handleIdentify = async () => {
    const merged = mergeObservations(recordedObservations, draftAnswers, nextObservationId);
    await runIdentification(merged);
  };

  const handleSubmitFollowups = async () => {
    const merged = mergeObservations(recordedObservations, draftAnswers, nextObservationId);
    await runIdentification(merged);
  };

  const handleSelectDraftAnswer = (obs: FollowUpObservation) => {
    setDraftAnswers((prev) => ({
      ...prev,
      [obs.questionId]: obs,
    }));
  };

  const handleClearDraftAnswer = (questionId: string) => {
    setDraftAnswers((prev) => {
      const next = { ...prev };
      delete next[questionId];
      return next;
    });
  };

  const handleUpdateRecordedObservation = (updated: FollowUpObservation) => {
    const targetKey = getObservationIdentityKey(updated);
    setRecordedObservations((prev) =>
      prev.map((item) => (getObservationIdentityKey(item) === targetKey ? updated : item))
    );
  };

  const handleRemoveRecordedObservation = (observationKey: string) => {
    setRecordedObservations((prev) =>
      prev.filter((item) => getObservationIdentityKey(item) !== observationKey)
    );
  };

  const handleCompareCandidates = async () => {
    if (!result || result.data.candidates.length < 2) return;

    const taxaForCompare = result.data.candidates.slice(0, 4).map((c) => ({
      scientific_name: c.name,
      common_name: c.common_name ?? null,
      key_diagnostics: c.diagnostic_characters,
      habitat_and_ecology: c.regional_notes || c.differential_diagnosis,
    }));

    compareAbortRef.current?.abort();
    const controller = new AbortController();
    compareAbortRef.current = controller;

    setIsCompareOpen(true);
    setCompareLoading(true);
    setCompareError(null);

    try {
      const { result: comparison } = await compareGuideTaxa(
        taxaForCompare,
        combinedLocation || activePlace?.displayName || '',
        [],
        true,
        specimenRecord,
        controller.signal
      );
      if (compareAbortRef.current === controller) {
        setCompareData(comparison);
      }
    } catch (err: any) {
      if (isAbortError(err)) return;
      if (compareAbortRef.current === controller) {
        setCompareError(err?.message || 'Couldn’t generate the comparison. Please try again.');
      }
    } finally {
      if (compareAbortRef.current === controller) {
        setCompareLoading(false);
      }
    }
  };

  const handleSuggestNext = async () => {
    if (selectedCharacters.size === 0) {
      setError('Select at least one character first to get matrix suggestions.');
      return;
    }

    setIsSuggesting(true);
    setError(null);

    const availableLabels: string[] = [];
    CHARACTER_GROUPS.forEach((group) => {
      group.characters.forEach((char) => {
        if (!selectedCharacters.has(char.id)) {
          availableLabels.push(char.label);
        }
      });
    });

    try {
      const suggestions = await geminiService.suggestNextCharacters(charLabels, availableLabels);
      const newSuggested = new Map<string, string>();
      suggestions.forEach((s) => {
        for (const group of CHARACTER_GROUPS) {
          const char = group.characters.find((c) => c.label === s.id || c.id === s.id);
          if (char) {
            newSuggested.set(char.id, s.reasoning);
            break;
          }
        }
      });
      setSuggestedCharacters(newSuggested);
    } catch (err: any) {
      setError(err.message || 'Failed to get suggestions.');
    } finally {
      setIsSuggesting(false);
    }
  };

  const hasInputs =
    notes.trim().length > 0 ||
    selectedCharacters.size > 0 ||
    location.trim().length > 0 ||
    recordedObservations.length > 0;

  const compareModalTaxa = useMemo(
    () =>
      (result?.data.candidates.slice(0, 4) || []).map((c) => ({
        scientific_name: c.name,
        common_name: c.common_name ?? null,
        key_diagnostics: c.diagnostic_characters,
        habitat_and_ecology: c.regional_notes || c.differential_diagnosis,
      })),
    [result]
  );

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="mb-8 print:hidden text-center md:text-left">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-950/60 border border-cyan-800/40 text-cyan-400 text-xs font-mono uppercase tracking-wider mb-2">
          <Compass size={13} />
          <span>Taxonomic Identification</span>
        </div>
        <h1 className="font-display text-3xl md:text-4xl font-bold text-white mb-2">Identify</h1>
        <p className="text-slate-400 max-w-3xl text-sm leading-relaxed">
          Identify a plant from its observable characters, and find out what to examine next.
        </p>
      </div>

      {/* Main Specimen Field Notebook (Center Stage) */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-3xl p-6 md:p-8 shadow-2xl backdrop-blur-sm space-y-6 print:hidden">
        {/* Place & Optional Observed Habitat */}
        <div className="space-y-3">
          {(activePlace || location.trim()) && (
            <div className="space-y-1.5">
              <PlaceContextChip
                place={activePlace}
                fallbackLabel={location}
                onOpenOverview={() =>
                  onNavigate({
                    module: 'localities',
                    ...(activePlace ? { place: activePlace } : {}),
                    ...(location.trim() ? { query: location.trim() } : {}),
                    ...(activePlace?.geographicScopeSummary || activePlace?.providerPlaceId
                      ? { scrollBehavior: 'restore' as const }
                      : {}),
                  })
                }
                onChange={() => locationInputRef.current?.focus()}
                onClear={() => {
                  setLocation('');
                  setActivePlace(null);
                  setObservedHabitat('');
                }}
              />
              <p className="text-[11px] text-slate-500">
                Place context is regional background only—select or describe a habitat below only if you observed it at the collection site.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                <MapPin size={16} className="text-cyan-400" />
                <span>Collection place</span>
                <span className="text-xs font-normal text-slate-500">(Helps narrow regional candidates)</span>
              </label>
              <button
                type="button"
                onClick={handleUseGPS}
                disabled={isLocating || isLoading}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-cyan-400 hover:text-cyan-300 border border-slate-700/60 text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
                title="Acquire current device GPS coordinates"
              >
                {isLocating ? <Loader2 size={13} className="animate-spin" /> : <MapPin size={13} />}
                <span>{isLocating ? 'Acquiring GPS...' : 'Use Current GPS'}</span>
              </button>
            </div>
            <div className="relative">
              <input
                ref={locationInputRef}
                type="text"
                maxLength={IDENTIFY_LIMITS.location}
                value={location}
                onChange={(e) => {
                  const val = e.target.value;
                  setLocation(val);
                  if (!val.trim()) {
                    setActivePlace(null);
                  } else {
                    setActivePlace((prev) =>
                      prev && prev.displayName === val.trim()
                        ? prev
                        : { displayName: val.trim(), scopeType: 'unknown' }
                    );
                  }
                }}
                placeholder='e.g., "Yosemite National Park" or "Greater London"'
                className="w-full bg-slate-950/60 border border-slate-800 focus:border-cyan-500/80 rounded-xl px-4 py-3 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 text-sm transition-all"
                disabled={isLoading}
              />
              {gpsStatus && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-cyan-300">
                  {gpsStatus}
                </span>
              )}
            </div>
          </div>

          <div className="space-y-2 pt-1">
            <label className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
              <span>Observed habitat / microsite (Optional)</span>
            </label>
            {activePlace?.availableHabitats && activePlace.availableHabitats.length > 0 && (
              <div className="flex flex-wrap gap-1.5" data-testid="identify-habitat-suggestions">
                {activePlace.availableHabitats.map((hab) => {
                  const isSelected = observedHabitat === hab;
                  return (
                    <button
                      key={hab}
                      type="button"
                      onClick={() => setObservedHabitat(isSelected ? '' : hab)}
                      disabled={isLoading}
                      className={`px-2.5 py-1 rounded-lg text-xs border transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-cyan-950/70 border-cyan-500/60 text-cyan-200 font-semibold'
                          : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                      }`}
                    >
                      {hab}
                    </button>
                  );
                })}
              </div>
            )}
            <input
              type="text"
              maxLength={IDENTIFY_LIMITS.habitat}
              value={observedHabitat}
              onChange={(e) => setObservedHabitat(e.target.value)}
              placeholder='Optional—only if observed on site (e.g., "moist riparian shade, 1,200 m")'
              className="w-full bg-slate-950/40 border border-slate-800/80 focus:border-cyan-500/70 rounded-xl px-4 py-2 text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 text-xs transition-all"
              disabled={isLoading}
            />
          </div>
        </div>

        {/* Specimen Field Description */}
        <div className="space-y-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <label className="text-sm font-semibold text-slate-300 flex items-center gap-2">
              <FileText size={16} className="text-cyan-400" />
              <span>Specimen Description &amp; Field Observations</span>
            </label>

            {/* Organ Prompt Chips */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-slate-400 font-mono text-[11px] mr-1 hidden lg:inline font-semibold">
                Quick insert:
              </span>
              {QUICK_PROMPTS.map((prompt) => (
                <button
                  key={prompt.label}
                  type="button"
                  onClick={() => handleInsertPrompt(prompt.snippet)}
                  disabled={isLoading}
                  className="theme-chip px-2 py-0.5 rounded-lg text-xs cursor-pointer font-medium"
                >
                  {prompt.label}
                </button>
              ))}
            </div>
          </div>

          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={IDENTIFY_LIMITS.notes}
            rows={5}
            placeholder='e.g., "Erect perennial herb ~50 cm tall in shaded riparian forest. Opposite serrate leaves with stinging hairs, square stem, clear non-milky sap. Axillary clusters of tiny greenish unisexual flowers..."'
            className="w-full bg-slate-950/60 border border-slate-800 focus:border-cyan-500/80 rounded-xl p-4 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 text-sm font-mono leading-relaxed resize-y transition-all min-h-[140px]"
            disabled={isLoading}
          />
          <div className="flex justify-end text-[11px] font-mono text-slate-500">
            {notes.length}/{IDENTIFY_LIMITS.notes} characters
          </div>
        </div>

        {/* Optional Suspected Taxon */}
        <div className="pt-1">
          <label className="text-xs font-medium text-slate-400 mb-1.5 flex items-center gap-1.5">
            <Search size={14} className="text-slate-500" />
            <span>Suspected Family, Genus, or Taxon (Optional)</span>
          </label>
          <input
            type="text"
            maxLength={IDENTIFY_LIMITS.suspectedFamilies}
            value={suspectedFamilies}
            onChange={(e) => setSuspectedFamilies(e.target.value)}
            placeholder="e.g., Brassicaceae, Cardamine, or Urtica dioica"
            className="w-full bg-slate-950/60 border border-slate-800 focus:border-cyan-500/80 rounded-xl px-4 py-2.5 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 text-sm transition-all"
            disabled={isLoading}
          />
        </div>

        {limitViolationMessage && (
          <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-800/60 text-amber-200 text-xs">
            {limitViolationMessage}
          </div>
        )}

        {/* Action Toolbar */}
        <div className="pt-4 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleIdentify}
              disabled={isLoading || Boolean(limitViolationMessage) || (!notes.trim() && selectedCharacters.size === 0)}
              className="bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500 text-white px-6 py-3 rounded-xl font-semibold transition-all shadow-lg shadow-cyan-950/50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer"
            >
              {isLoading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  <span>Evaluating specimen characters...</span>
                </>
              ) : (
                <>
                  <Sparkles size={18} />
                  <span>Identify plant</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleLoadSample}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 hover:text-white border border-slate-700/60 text-xs font-medium transition-colors cursor-pointer"
            >
              <BookOpen size={14} className="text-amber-400" />
              <span>Load Sample Specimen</span>
            </button>
          </div>

          {hasInputs && (
            <button
              type="button"
              onClick={handleClearAll}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-slate-400 hover:text-rose-400 text-xs transition-colors cursor-pointer"
            >
              <Trash2 size={14} />
              <span>Clear All</span>
            </button>
          )}
        </div>
      </div>

      {/* Collapsible Aid: Describe the plant (Character Matrix) */}
      <div className="mt-6 border border-slate-800/80 rounded-3xl bg-slate-900/30 overflow-hidden transition-all shadow-lg print:hidden">
        <button
          type="button"
          onClick={() => setShowCharacterMatrix(!showCharacterMatrix)}
          className="w-full p-4 md:px-6 flex items-center justify-between text-slate-300 hover:text-white transition-colors cursor-pointer bg-slate-900/50 hover:bg-slate-800/40"
        >
          <div className="flex items-center gap-2.5">
            <SlidersHorizontal size={18} className="text-cyan-400" />
            <span className="font-semibold text-sm">Describe the plant (Optional Character Matrix)</span>
            <span className="text-xs text-slate-500 font-normal hidden sm:inline">
              (72 anatomical traits)
            </span>
            {selectedCharacters.size > 0 && (
              <span className="px-2.5 py-0.5 rounded-full bg-cyan-950 text-cyan-400 text-xs border border-cyan-800 font-mono font-medium">
                {selectedCharacters.size} traits selected
              </span>
            )}
          </div>
          <span className="text-xs text-slate-400 font-mono font-medium">
            {showCharacterMatrix ? 'Hide Matrix ▲' : 'Show Matrix ▼'}
          </span>
        </button>

        {showCharacterMatrix && (
          <div className="p-4 md:p-6 border-t border-slate-800/80 bg-slate-950/40 space-y-4 animate-in fade-in duration-300">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800/60 text-xs text-slate-400">
              <span>
                Select macroscopic or microscopic features observed on vegetative organs or floral dissections:
              </span>
              <button
                type="button"
                onClick={handleSuggestNext}
                disabled={isSuggesting || selectedCharacters.size === 0}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors disabled:opacity-50 cursor-pointer"
              >
                {isSuggesting ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Sparkles size={14} className="text-amber-400" />
                )}
                <span>Suggest helpful characters</span>
              </button>
            </div>

            <CharacterSelector
              selected={selectedCharacters}
              suggested={suggestedCharacters}
              onToggle={handleToggleCharacter}
            />
          </div>
        )}
      </div>

      {/* Inline Status Banner when re-evaluating with previous result preserved */}
      {isLoading && result && (
        <TaskProgressCard
          variant="banner"
          testId="identify-updating-banner"
          title="Reconsidering identification with updated observations while keeping your previous view…"
          stages={[
            'Integrating recorded follow-up observations',
            'Cross-checking candidate taxa against regional flora',
            'Refining supported rank and next observations to examine',
          ]}
          onCancel={handleCancelIdentify}
          className="mt-8"
        />
      )}

      {/* Error Display */}
      {error && (
        <div className="mt-8 space-y-3">
          <ErrorDisplay message={error} />
          {result && (
            <button
              type="button"
              onClick={handleIdentify}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 cursor-pointer"
            >
              <RotateCcw size={13} />
              <span>Retry evaluation</span>
            </button>
          )}
        </div>
      )}

      {/* Initial Progress State (when no prior result exists) */}
      {isLoading && !result && (
        <TaskProgressCard
          variant="card"
          testId="identify-loading-card"
          title="Evaluating specimen characters…"
          stages={[
            'Reading field notes and checked morphological characters',
            'Matching candidate taxa against regional botanical references',
            'Separating supported rank, remaining candidates, and next observations',
          ]}
          onCancel={handleCancelIdentify}
          className="mt-8"
        />
      )}

      {/* Structured Identification Result */}
      {result && (
        <IdentifyResultView
          result={result.data}
          sources={result.sources}
          locality={combinedLocation || undefined}
          place={activePlace || undefined}
          specimenContext={specimenContextString || undefined}
          specimenRecord={specimenRecord}
          recordedObservations={recordedObservations}
          draftAnswers={draftAnswers}
          onSelectDraftAnswer={handleSelectDraftAnswer}
          onClearDraftAnswer={handleClearDraftAnswer}
          onUpdateRecordedObservation={handleUpdateRecordedObservation}
          onRemoveRecordedObservation={handleRemoveRecordedObservation}
          onSubmitFollowups={handleSubmitFollowups}
          onCompareCandidates={handleCompareCandidates}
          isUpdating={isLoading}
          onNavigate={onNavigate}
        />
      )}

      {/* Candidate Comparison Modal */}
      <GuideSubsetModal
        isOpen={isCompareOpen}
        onClose={() => {
          compareAbortRef.current?.abort();
          setIsCompareOpen(false);
          setCompareLoading(false);
        }}
        selectedTaxa={compareModalTaxa}
        locality={combinedLocation || activePlace?.displayName || ''}
        specimenRecord={specimenRecord}
        data={compareData}
        isLoading={compareLoading}
        error={compareError}
        onRetry={handleCompareCandidates}
      />
    </div>
  );
}
