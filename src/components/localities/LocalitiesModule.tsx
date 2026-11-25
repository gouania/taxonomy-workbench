import React, { useState, useEffect, useRef } from 'react';
import { Search, MapPin, Loader2, Compass, AlertCircle } from 'lucide-react';
import {
  GroundingSource,
  LocalityProfile,
  NavigationTarget,
  PlaceRef,
} from '../../types';
import { LocalityDashboard } from './LocalityDashboard';
import { MODEL_CACHE_TAG } from '../../constants';
import { cacheService } from '../../services/cacheService';
import { historyFavoritesService } from '../../services/historyFavoritesService';
import { geminiService, isAbortError, syncRuntimeCacheNamespace } from '../../services/geminiService';
import { inaturalistService, DetailedPlaceMatch } from '../../services/inaturalistService';
import {
  assessPlaceAmbiguity,
  buildPlaceRefFromProfile,
  formatDecimalAsCardinal,
  inferScopeTypeFromInatPlace,
  parseCoordinateQuery,
} from '../../utils/placeUtils';
import { ErrorDisplay } from '../shared/ErrorDisplay';
import { TaskProgressCard } from '../shared/TaskProgressCard';

interface LocalitiesModuleProps {
  initialQuery?: string;
  initialPlace?: PlaceRef;
  navRequestId?: number;
  scrollBehavior?: 'top' | 'restore';
  onNavigate: (target: NavigationTarget) => void;
}

const EXAMPLE_PLACES = [
  { label: 'Greater London', hint: 'City' },
  { label: 'Mount Tamalpais, California', hint: 'Mountain' },
  { label: 'Cerrado biome', hint: 'Region' },
  { label: '51.5074, -0.1278', hint: 'Coordinates' },
];

export function LocalitiesModule({
  initialQuery,
  initialPlace,
  navRequestId,
  scrollBehavior,
  onNavigate,
}: LocalitiesModuleProps) {
  const [query, setQuery] = useState(initialPlace?.displayName || initialQuery || '');
  const [isLoading, setIsLoading] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [locationNotice, setLocationNotice] = useState<string | null>(null);
  const [profile, setProfile] = useState<LocalityProfile | null>(null);
  const [resolvedPlace, setResolvedPlace] = useState<PlaceRef | null>(null);
  const [alternateMatches, setAlternateMatches] = useState<DetailedPlaceMatch[]>([]);
  const [disambiguationChoices, setDisambiguationChoices] = useState<{
    originalQuery: string;
    candidates: DetailedPlaceMatch[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sources, setSources] = useState<GroundingSource[]>([]);

  const lastHandledNavRef = useRef<string>('');
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const handleCancelExploration = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsLoading(false);
  };

  const runPlaceExploration = async (
    searchQuery: string,
    options?: {
      chosenInatMatch?: DetailedPlaceMatch | null;
      skipAmbiguityCheck?: boolean;
      incomingPlace?: PlaceRef;
    }
  ) => {
    const trimmed = searchQuery.trim();
    if (!trimmed) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setDisambiguationChoices(null);
    setError(null);
    setIsLoading(true);

    try {
      // 1. Validate coordinate queries immediately before API calls
      const parsedCoords = parseCoordinateQuery(trimmed);
      if (parsedCoords?.error) {
        setIsLoading(false);
        setError(parsedCoords.error);
        return;
      }

      let selectedMatch: DetailedPlaceMatch | null = options?.chosenInatMatch || null;
      let otherMatches: DetailedPlaceMatch[] = [];

      // 2. If not a coordinate query and no pre-chosen match, check iNaturalist places for boundaries & ambiguity
      if (!parsedCoords && !selectedMatch) {
        const inatMatches = await inaturalistService.searchPlacesDetailed(trimmed);
        if (controller.signal.aborted) return;
        const assessment = assessPlaceAmbiguity(trimmed, inatMatches);

        if (assessment.isAmbiguous && !options?.skipAmbiguityCheck) {
          setIsLoading(false);
          setDisambiguationChoices({
            originalQuery: trimmed,
            candidates: assessment.candidates,
          });
          return;
        }

        selectedMatch = assessment.bestMatch;
        otherMatches = assessment.candidates;
      }

      await syncRuntimeCacheNamespace(controller.signal);
      if (abortRef.current !== controller) return;

      const geminiInput = selectedMatch?.display_name || trimmed;
      const cacheKey = `locality_${MODEL_CACHE_TAG}_${geminiInput.toLowerCase()}`;
      const cached = cacheService.get<{ profile: LocalityProfile; sources: GroundingSource[] }>(
        cacheKey
      );

      let rawProfile: LocalityProfile;
      let nextSources: GroundingSource[];

      if (cached) {
        rawProfile = cached.profile;
        nextSources = cached.sources;
      } else {
        const response = await geminiService.generateLocalityProfile(geminiInput, controller.signal);
        rawProfile = response.result;
        nextSources = response.sources;
        cacheService.set(cacheKey, { profile: rawProfile, sources: nextSources }, response.cacheNamespace);
      }

      if (abortRef.current !== controller) return;

      const nextProfile: LocalityProfile = {
        ...rawProfile,
        location_details: { ...rawProfile.location_details },
      };

      // Ensure coordinate accuracy when the user searched exact coordinates
      if (parsedCoords && typeof parsedCoords.latitude === 'number' && typeof parsedCoords.longitude === 'number') {
        nextProfile.location_details.latitude = parsedCoords.latitude;
        nextProfile.location_details.longitude = parsedCoords.longitude;
        nextProfile.location_details.coordinates_dms =
          parsedCoords.formattedDms ||
          formatDecimalAsCardinal(parsedCoords.latitude, parsedCoords.longitude);
        nextProfile.location_details.scope_type = 'point';
      } else if (
        !nextProfile.location_details.latitude &&
        selectedMatch?.latitude !== undefined &&
        selectedMatch?.longitude !== undefined
      ) {
        nextProfile.location_details.latitude = selectedMatch.latitude;
        nextProfile.location_details.longitude = selectedMatch.longitude;
      }

      const nextPlace = buildPlaceRefFromProfile(nextProfile, {
        resolvedInatMatch: selectedMatch,
        isCoordinateQuery: Boolean(parsedCoords),
      });

      // Preserve incoming providerPlaceId if matched from PlaceRef
      if (!nextPlace.providerPlaceId && options?.incomingPlace?.providerPlaceId) {
        nextPlace.providerPlaceId = options.incomingPlace.providerPlaceId;
        nextPlace.providerPlaceName = options.incomingPlace.providerPlaceName;
      }
      if (!selectedMatch && options?.incomingPlace?.scopeType && options.incomingPlace.scopeType !== 'unknown') {
        nextPlace.scopeType = options.incomingPlace.scopeType;
      }

      setProfile(nextProfile);
      setResolvedPlace(nextPlace);
      setAlternateMatches(otherMatches);
      setSources(nextSources);

      historyFavoritesService.addRecentSearch({
        module: 'localities',
        query: nextPlace.displayName || trimmed,
      });
    } catch (err: any) {
      if (isAbortError(err)) return;
      console.error(err);
      if (abortRef.current === controller) {
        setError(
          err?.message ||
            'Couldn’t load an overview for this place. Check the spelling or try a broader region or coordinates.'
        );
      }
    } finally {
      if (abortRef.current === controller) {
        setIsLoading(false);
      }
    }
  };

  // Respond to incoming navigation requests even if an old profile already exists,
  // while preserving existing profile & scroll when returning without a new place.
  useEffect(() => {
    const incomingName = (initialPlace?.displayName || initialQuery || '').trim();
    if (!incomingName) return;
    if (scrollBehavior === 'restore') return;

    const reqKey = `${navRequestId || 0}::${incomingName.toLowerCase()}`;
    if (lastHandledNavRef.current === reqKey) return;
    lastHandledNavRef.current = reqKey;

    // If the currently loaded place already matches the incoming name cleanly, restore without regenerating
    const currentNorm = resolvedPlace?.displayName.toLowerCase();
    const profileNorm = profile?.location_details.resolved_name.toLowerCase();
    if (
      profile &&
      resolvedPlace &&
      (currentNorm === incomingName.toLowerCase() || profileNorm === incomingName.toLowerCase())
    ) {
      return;
    }

    setQuery(incomingName);
    const preMatched: DetailedPlaceMatch | null = initialPlace?.providerPlaceId
      ? {
          id: initialPlace.providerPlaceId,
          name: initialPlace.providerPlaceName || initialPlace.displayName,
          display_name: initialPlace.providerPlaceName || initialPlace.displayName,
          latitude: initialPlace.coordinates?.latitude,
          longitude: initialPlace.coordinates?.longitude,
          bounding_box: initialPlace.boundingBox,
        }
      : null;

    runPlaceExploration(incomingName, {
      chosenInatMatch: preMatched,
      skipAmbiguityCheck: Boolean(preMatched),
      incomingPlace: initialPlace,
    });
  }, [initialQuery, initialPlace, navRequestId, scrollBehavior]);

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      setLocationNotice('Geolocation is not supported by your browser.');
      setTimeout(() => setLocationNotice(null), 4000);
      return;
    }
    setIsLocating(true);
    setLocationNotice(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setIsLocating(false);
        const { latitude, longitude } = position.coords;
        const coordsString = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
        setQuery(coordsString);
        runPlaceExploration(coordsString, { skipAmbiguityCheck: true });
      },
      (err) => {
        setIsLocating(false);
        setLocationNotice(`Unable to retrieve GPS coordinates: ${err.message || 'Access denied'}`);
        setTimeout(() => setLocationNotice(null), 4500);
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="mb-8">
        <div className="mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-950/60 border border-cyan-800/40 text-cyan-400 text-xs font-mono uppercase tracking-wider mb-2">
            <Compass size={13} />
            <span>Explore a place and choose what to study</span>
          </div>
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-white mb-2">
            Places &amp; flora
          </h1>
          <p className="text-slate-400 max-w-3xl text-sm sm:text-base">
            Explore a place’s habitats and plant life, then build a guide, investigate a taxon, or practise identification.
          </p>
        </div>

        <div className="bg-slate-900/40 border border-slate-800/60 p-5 sm:p-6 rounded-3xl">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              runPlaceExploration(query);
            }}
            className="relative max-w-2xl mx-auto"
          >
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={20} />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Enter a place name or coordinates (e.g., Greater London, 51.5074, -0.1278)..."
              aria-label="Place name or coordinates"
              className="w-full bg-slate-900/60 border border-slate-700/60 rounded-2xl py-3.5 pl-12 pr-36 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all font-sans text-sm sm:text-base shadow-inner"
              disabled={isLoading || isLocating}
            />
            <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
              <button
                type="submit"
                disabled={!query.trim() || isLoading || isLocating}
                className="bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer shadow-md"
              >
                {isLoading ? <Loader2 size={16} className="animate-spin" /> : 'Explore place'}
              </button>
            </div>
          </form>

          <div className="flex flex-wrap items-center justify-center gap-3 mt-4 max-w-3xl mx-auto">
            <button
              type="button"
              onClick={handleUseCurrentLocation}
              disabled={isLoading || isLocating}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-800/50 text-xs font-semibold transition-all cursor-pointer shadow-sm disabled:opacity-50"
            >
              {isLocating ? <Loader2 size={14} className="animate-spin" /> : <MapPin size={14} />}
              <span>{isLocating ? 'Acquiring GPS...' : 'Use my location'}</span>
            </button>

            {locationNotice && (
              <span className="text-xs text-amber-300 bg-amber-950/50 border border-amber-800/50 px-3 py-1 rounded-full">
                {locationNotice}
              </span>
            )}
          </div>

          {!profile && !isLoading && !disambiguationChoices && (
            <div className="flex flex-wrap items-center justify-center gap-2 mt-4 max-w-3xl mx-auto">
              <span className="text-xs text-slate-500 py-1">Examples:</span>
              {EXAMPLE_PLACES.map((ex) => (
                <button
                  key={ex.label}
                  type="button"
                  onClick={() => {
                    setQuery(ex.label);
                    runPlaceExploration(ex.label);
                  }}
                  className="px-3 py-1 bg-slate-800/50 hover:bg-slate-700/60 text-slate-300 hover:text-cyan-300 rounded-full text-xs font-medium transition-colors border border-slate-700/50 cursor-pointer"
                >
                  {ex.label}{' '}
                  <span className="text-slate-500 font-normal">({ex.hint})</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Ambiguous Place Disambiguation Chooser */}
      {disambiguationChoices && !isLoading && (
        <div
          data-testid="place-disambiguation-card"
          className="max-w-2xl mx-auto mb-8 p-5 rounded-2xl bg-slate-900/80 border border-amber-700/50 space-y-3 animate-in fade-in duration-200"
        >
          <div className="flex items-start gap-2.5">
            <AlertCircle size={18} className="text-amber-400 shrink-0 mt-0.5" />
            <div>
              <h2 className="text-sm font-semibold text-white">
                Multiple places match “{disambiguationChoices.originalQuery}”
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Select the specific place you want to explore so habitats and iNaturalist observations match the right location.
              </p>
            </div>
          </div>

          <div className="space-y-2 pt-1">
            {disambiguationChoices.candidates.map((candidate) => (
              <button
                key={candidate.id}
                type="button"
                onClick={() => {
                  setQuery(candidate.display_name);
                  runPlaceExploration(candidate.display_name, {
                    chosenInatMatch: candidate,
                    skipAmbiguityCheck: true,
                    incomingPlace: {
                      displayName: candidate.display_name,
                      scopeType: inferScopeTypeFromInatPlace(candidate.place_type_name),
                      providerPlaceId: candidate.id,
                      providerPlaceName: candidate.display_name,
                      boundingBox: candidate.bounding_box,
                      coordinates:
                        typeof candidate.latitude === 'number' && typeof candidate.longitude === 'number'
                          ? { latitude: candidate.latitude, longitude: candidate.longitude }
                          : undefined,
                    },
                  });
                }}
                className="w-full p-3 rounded-xl bg-slate-950/70 hover:bg-slate-800 border border-slate-800 hover:border-cyan-500/50 text-left flex items-center justify-between gap-3 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <MapPin size={15} className="text-cyan-400 shrink-0" />
                  <span className="text-sm font-medium text-white truncate">
                    {candidate.display_name}
                  </span>
                </div>
                {candidate.place_type_name && (
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800 shrink-0">
                    {candidate.place_type_name}
                  </span>
                )}
              </button>
            ))}

            <button
              type="button"
              onClick={() =>
                runPlaceExploration(disambiguationChoices.originalQuery, {
                  skipAmbiguityCheck: true,
                })
              }
              className="w-full p-2.5 rounded-xl bg-slate-950/40 hover:bg-slate-900 border border-slate-800/80 text-xs text-slate-400 hover:text-slate-200 text-center transition-colors cursor-pointer"
            >
              Continue with “{disambiguationChoices.originalQuery}” as written
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-6 space-y-3">
          <ErrorDisplay message={error} />
          {profile && (
            <div className="text-center">
              <button
                type="button"
                onClick={() => setError(null)}
                className="text-xs text-cyan-400 hover:underline cursor-pointer"
              >
                Dismiss and return to current place overview
              </button>
            </div>
          )}
        </div>
      )}

      {isLoading ? (
        <TaskProgressCard
          variant="card"
          testId="locality-loading-card"
          title="Loading place overview and habitats…"
          stages={[
            'Resolving geographic scope and boundaries',
            'Gathering principal habitats and characteristic flora',
            'Checking regional references and conservation context',
          ]}
          onCancel={handleCancelExploration}
          className="my-8"
        />
      ) : profile && resolvedPlace ? (
        <LocalityDashboard
          profile={profile}
          place={resolvedPlace}
          sources={sources}
          alternateMatches={alternateMatches}
          onSelectAlternateMatch={(match) => {
            setQuery(match.display_name);
            runPlaceExploration(match.display_name, {
              chosenInatMatch: match,
              skipAmbiguityCheck: true,
            });
          }}
          onNavigate={onNavigate}
        />
      ) : null}
    </div>
  );
}
