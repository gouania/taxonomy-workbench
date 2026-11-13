import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  MapPin,
  BookOpen,
  GraduationCap,
  Key,
  Microscope,
  Search,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Loader2,
  Maximize2,
  Calendar,
  AlertCircle,
  Globe2,
  Thermometer,
  Droplets,
  Mountain,
  ShieldAlert,
  History,
  Info,
  X,
} from 'lucide-react';
import { LocalityProfile, NavigationTarget, PlaceRef, GroundingSource } from '../../types';
import {
  inaturalistService,
  LocalityObservation,
  DetailedPlaceMatch,
} from '../../services/inaturalistService';
import { getMapBboxForPlace, getObservationFilterSummary } from '../../utils/placeUtils';
import { INatSpeciesImage } from '../shared/INatSpeciesImage';
import { ImageLightbox, LightboxPhoto } from '../shared/ImageLightbox';
import { SourcesBar } from '../shared/SourcesBar';
import { LiteratureSection } from '../shared/LiteratureSection';

interface LocalityDashboardProps {
  profile: LocalityProfile;
  place: PlaceRef;
  sources: GroundingSource[];
  alternateMatches?: DetailedPlaceMatch[];
  onSelectAlternateMatch?: (match: DetailedPlaceMatch) => void;
  onNavigate: (target: NavigationTarget) => void;
}

function getGuideGroupSuggestion(scientificName: string): string {
  const cleaned = scientificName.trim();
  const parts = cleaned.split(/\s+/);
  // Suggest genus for a binomial so users get a regional multi-species key
  if (parts.length >= 2 && /^[A-Z][a-z-]+$/.test(parts[0]) && /^[a-z-]+$/.test(parts[1])) {
    return parts[0];
  }
  return cleaned;
}

function getStatusBadgeClass(status: string): string {
  const s = status.toLowerCase();
  if (s.includes('endemic')) {
    return 'bg-amber-950/60 text-amber-300 border-amber-800/50';
  }
  if (s.includes('introduced') || s.includes('naturalized')) {
    return 'bg-rose-950/50 text-rose-300 border-rose-800/50';
  }
  if (s.includes('native')) {
    return 'bg-emerald-950/50 text-emerald-300 border-emerald-800/50';
  }
  if (s.includes('notable') || s.includes('localized')) {
    return 'bg-cyan-950/60 text-cyan-300 border-cyan-800/50';
  }
  return 'bg-slate-800/80 text-slate-300 border-slate-700';
}

export function LocalityDashboard({
  profile,
  place,
  sources,
  alternateMatches = [],
  onSelectAlternateMatch,
  onNavigate,
}: LocalityDashboardProps) {
  const [guideGroup, setGuideGroup] = useState('');
  const [plantFilter, setPlantFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const [observations, setObservations] = useState<LocalityObservation[]>([]);
  const [totalObsResults, setTotalObsResults] = useState<number>(0);
  const [forcePointFallback, setForcePointFallback] = useState(false);
  const [loadingObservations, setLoadingObservations] = useState(false);

  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const [isEnvExpanded, setIsEnvExpanded] = useState(false);
  const [isSourcesExpanded, setIsSourcesExpanded] = useState(false);

  const plantsSectionRef = useRef<HTMLElement>(null);
  const plantFilterInputRef = useRef<HTMLInputElement>(null);

  const effectivePlaceForObs: PlaceRef = useMemo(() => {
    if (forcePointFallback && place.providerPlaceId) {
      return { ...place, providerPlaceId: undefined };
    }
    return place;
  }, [place, forcePointFallback]);

  const filterSummary = useMemo(
    () => getObservationFilterSummary(effectivePlaceForObs),
    [effectivePlaceForObs]
  );

  // Reset fallback toggle when place changes
  useEffect(() => {
    setForcePointFallback(false);
    setPlantFilter('');
    setStatusFilter('all');
    setIsEnvExpanded(false);
    setIsSourcesExpanded(false);
  }, [place.displayName, place.providerPlaceId, place.coordinates?.latitude, place.coordinates?.longitude]);

  // Fetch actual recent Research Grade botanical observations from iNaturalist
  useEffect(() => {
    let isMounted = true;
    const placeId = effectivePlaceForObs.providerPlaceId;
    const lat = effectivePlaceForObs.coordinates?.latitude;
    const lng = effectivePlaceForObs.coordinates?.longitude;

    if (!placeId && (typeof lat !== 'number' || typeof lng !== 'number')) {
      setObservations([]);
      setTotalObsResults(0);
      return;
    }

    setLoadingObservations(true);
    inaturalistService
      .getRecentLocalityObservations({
        placeId,
        lat,
        lng,
        radiusKm: 35,
        perPage: 8,
      })
      .then((res) => {
        if (isMounted) {
          setObservations(res.observations);
          setTotalObsResults(res.totalResults);
          setLoadingObservations(false);
        }
      })
      .catch((e) => {
        console.error('Failed to fetch iNaturalist observations:', e);
        if (isMounted) {
          setObservations([]);
          setTotalObsResults(0);
          setLoadingObservations(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [
    effectivePlaceForObs.providerPlaceId,
    effectivePlaceForObs.coordinates?.latitude,
    effectivePlaceForObs.coordinates?.longitude,
  ]);

  // Extract a few quick group suggestions (genera from characteristic plants)
  const quickGroupSuggestions = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const p of profile.characteristic_plants) {
      const genus = getGuideGroupSuggestion(p.scientific_name);
      if (genus && !seen.has(genus.toLowerCase())) {
        seen.add(genus.toLowerCase());
        out.push(genus);
      }
      if (out.length >= 4) break;
    }
    return out;
  }, [profile.characteristic_plants]);

  const distinctStatuses = useMemo(() => {
    const statuses = Array.from(
      new Set(profile.characteristic_plants.map((p) => p.regional_status).filter(Boolean))
    );
    return statuses;
  }, [profile.characteristic_plants]);

  const filteredPlants = useMemo(() => {
    const q = plantFilter.trim().toLowerCase();
    return profile.characteristic_plants.filter((plant) => {
      if (statusFilter !== 'all' && plant.regional_status !== statusFilter) {
        return false;
      }
      if (!q) return true;
      return (
        plant.scientific_name.toLowerCase().includes(q) ||
        (plant.common_name || '').toLowerCase().includes(q) ||
        plant.habitat_association.toLowerCase().includes(q) ||
        plant.growth_form.toLowerCase().includes(q) ||
        plant.regional_status.toLowerCase().includes(q)
      );
    });
  }, [profile.characteristic_plants, plantFilter, statusFilter]);

  const mapBbox = getMapBboxForPlace(place);

  const lightboxPhotos: LightboxPhoto[] = observations.map((obs) => ({
    url: obs.photoUrl,
    attribution: obs.attribution,
    caption: `${obs.taxonName}${obs.commonName ? ` (${obs.commonName})` : ''} • Observed ${
      obs.observedOn || 'date unknown'
    } by @${obs.observer}`,
    originalUrl: obs.inatUrl,
  }));

  const env = profile.environmental_context;
  const hasEnvDetails = Boolean(
    env &&
      (env.climate ||
        env.soil_and_substrate ||
        env.elevation_range ||
        env.ecoregion ||
        env.geographic_context ||
        env.collecting_and_phenology ||
        env.conservation_and_protected_areas ||
        env.historical_notes ||
        (env.ecological_threats && env.ecological_threats.length > 0))
  );
  const hasElevationZones = Boolean(profile.elevation_zones && profile.elevation_zones.length > 0);
  const literatureCount = profile.recommended_literature?.length || 0;

  const handleBuildGuideSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onNavigate({
      module: 'guide',
      query: guideGroup.trim() || undefined,
      locality: place.displayName,
      place,
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* 1. PLACE AND AREA */}
      <section
        aria-label="Place and area"
        className="bg-slate-900/60 border border-slate-800/80 rounded-3xl p-5 sm:p-6 shadow-xl"
      >
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          <div className={`${mapBbox ? 'lg:col-span-7' : 'lg:col-span-12'} flex flex-col justify-between gap-5`}>
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="px-2.5 py-0.5 rounded-md bg-cyan-950/70 text-cyan-300 border border-cyan-800/50 text-xs font-mono uppercase tracking-wider">
                  {place.scopeType}
                </span>
                <span className="text-xs text-slate-400">
                  {profile.location_details.geographic_scope_summary}
                </span>
              </div>

              <h2 className="font-display text-2xl sm:text-3xl font-bold text-white tracking-tight mb-2">
                {profile.location_details.resolved_name}
              </h2>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400 font-mono">
                <span className="inline-flex items-center gap-1.5 text-cyan-400">
                  <MapPin size={13} />
                  <span>{profile.location_details.coordinates_dms}</span>
                </span>
                {place.coordinates && (
                  <span className="text-slate-500">
                    ({place.coordinates.latitude.toFixed(4)}°, {place.coordinates.longitude.toFixed(4)}°)
                  </span>
                )}
                {place.providerPlaceId && (
                  <span className="text-emerald-400">
                    iNat boundary matched (#{place.providerPlaceId})
                  </span>
                )}
              </div>

              {alternateMatches.length > 1 && onSelectAlternateMatch && (
                <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="text-slate-500">Other matches:</span>
                  {alternateMatches
                    .filter((m) => m.id !== place.providerPlaceId)
                    .slice(0, 3)
                    .map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => onSelectAlternateMatch(m)}
                        className="px-2 py-0.5 rounded-md bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-cyan-300 border border-slate-700/70 transition-colors cursor-pointer"
                      >
                        {m.display_name}
                      </button>
                    ))}
                </div>
              )}
            </div>

            {/* Primary Action: Build a guide inline form */}
            <div className="p-4 rounded-2xl bg-slate-950/70 border border-cyan-800/40 space-y-3 print:hidden">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="place-build-guide-group"
                  className="text-xs font-semibold text-white flex items-center gap-1.5"
                >
                  <BookOpen size={14} className="text-cyan-400" />
                  <span>Build a guide for {place.displayName}</span>
                </label>
                <span className="text-[11px] text-slate-400">Primary workflow</span>
              </div>

              <form onSubmit={handleBuildGuideSubmit} className="flex flex-col sm:flex-row gap-2">
                <input
                  id="place-build-guide-group"
                  type="text"
                  value={guideGroup}
                  onChange={(e) => setGuideGroup(e.target.value)}
                  placeholder="Enter a plant group (e.g., Quercus, Asteraceae, Ferns)"
                  className="flex-1 bg-slate-900 border border-slate-700/80 focus:border-cyan-500 rounded-xl px-3.5 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
                />
                <button
                  type="submit"
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-semibold transition-colors cursor-pointer shadow-md shrink-0"
                >
                  <BookOpen size={15} />
                  <span>Build a guide</span>
                </button>
              </form>

              {quickGroupSuggestions.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                  <span className="text-slate-500">Suggested groups:</span>
                  {quickGroupSuggestions.map((group) => (
                    <button
                      key={group}
                      type="button"
                      onClick={() => setGuideGroup(group)}
                      className="px-2 py-0.5 rounded-md bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-cyan-300 border border-slate-800 font-serif italic transition-colors cursor-pointer"
                    >
                      {group}
                    </button>
                  ))}
                </div>
              )}

              {/* Contextual Secondary Actions */}
              <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center gap-2">
                <span className="text-[11px] text-slate-500 mr-1">Also from this place:</span>
                <button
                  type="button"
                  onClick={() => {
                    plantsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    setTimeout(() => plantFilterInputRef.current?.focus(), 350);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 hover:text-cyan-300 border border-slate-700/80 text-xs font-medium transition-colors cursor-pointer"
                >
                  <Microscope size={13} className="text-cyan-400" />
                  <span>Explore taxon</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    onNavigate({
                      module: 'identify',
                      locality: place.displayName,
                      place,
                    })
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 hover:text-emerald-300 border border-slate-700/80 text-xs font-medium transition-colors cursor-pointer"
                >
                  <Key size={13} className="text-emerald-400" />
                  <span>Identify a specimen</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    onNavigate({
                      module: 'quiz',
                      query: 'Plantae',
                      locality: place.displayName,
                      place,
                    })
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 hover:text-fuchsia-300 border border-slate-700/80 text-xs font-medium transition-colors cursor-pointer"
                >
                  <GraduationCap size={13} className="text-fuchsia-400" />
                  <span>Practise identification</span>
                </button>
              </div>
            </div>
          </div>

          {/* Compact Map */}
          {mapBbox && place.coordinates && (
            <div className="lg:col-span-5 flex flex-col gap-2 print:hidden">
              <div className="rounded-2xl overflow-hidden border border-slate-800 bg-slate-950 h-52 lg:h-full min-h-[210px]">
                <iframe
                  title={`Map of ${profile.location_details.resolved_name}`}
                  width="100%"
                  height="100%"
                  style={{ border: 0 }}
                  src={`https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(
                    mapBbox
                  )}&layer=mapnik&marker=${place.coordinates.latitude},${place.coordinates.longitude}`}
                  loading="lazy"
                />
              </div>
            </div>
          )}
        </div>
      </section>

      {/* 2. BOTANICAL OVERVIEW */}
      <section
        aria-label="Botanical overview"
        className="bg-slate-900/50 border border-slate-800/80 rounded-3xl p-5 sm:p-6 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-xl font-bold text-white">Botanical overview</h3>
          <span className="text-xs text-slate-500">
            Regional summary — habitat and plant composition vary locally
          </span>
        </div>

        <p className="text-slate-200 text-sm sm:text-base leading-relaxed">
          {profile.botanical_overview.summary}
        </p>

        {profile.botanical_overview.principal_habitats.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2.5">
              Principal habitats
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {profile.botanical_overview.principal_habitats.map((habitat, idx) => (
                <div
                  key={idx}
                  className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800/80 space-y-1"
                >
                  <div className="font-semibold text-sm text-cyan-300">{habitat.name}</div>
                  <p className="text-xs text-slate-400 leading-relaxed">{habitat.summary}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* 3. PLANTS TO EXPLORE — Characteristic plants */}
      <section
        ref={plantsSectionRef}
        id="plants-to-explore"
        aria-label="Plants to explore"
        className="bg-slate-900/50 border border-slate-800/80 rounded-3xl p-5 sm:p-6 space-y-4"
      >
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-3 pb-3 border-b border-slate-800/80">
          <div>
            <h3 className="font-display text-xl font-bold text-white">Characteristic plants</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Source-supported examples associated with the place; not a checklist.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <div className="relative">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
              />
              <input
                ref={plantFilterInputRef}
                type="text"
                value={plantFilter}
                onChange={(e) => setPlantFilter(e.target.value)}
                placeholder="Filter by name, habitat, form..."
                aria-label="Filter characteristic plants"
                className="bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-xl py-1.5 pl-8 pr-7 text-xs text-white placeholder:text-slate-500 focus:outline-none w-56"
              />
              {plantFilter && (
                <button
                  type="button"
                  onClick={() => setPlantFilter('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                  title="Clear plant filter"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            {distinctStatuses.length > 1 && (
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                aria-label="Filter by regional status"
                className="bg-slate-950 border border-slate-800 rounded-xl py-1.5 px-2.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
              >
                <option value="all">All statuses ({profile.characteristic_plants.length})</option>
                {distinctStatuses.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {filteredPlants.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400 space-y-2">
            <p>No plants in this overview match "{plantFilter || statusFilter}".</p>
            <button
              type="button"
              onClick={() => {
                setPlantFilter('');
                setStatusFilter('all');
              }}
              className="text-cyan-400 hover:underline cursor-pointer"
            >
              Show all {profile.characteristic_plants.length} characteristic plants
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredPlants.map((plant) => (
              <div
                key={plant.scientific_name}
                className="flex items-start gap-3 p-3 rounded-2xl bg-slate-950/60 border border-slate-800/70 hover:border-slate-700 transition-colors"
              >
                <div className="w-14 h-14 shrink-0 rounded-xl overflow-hidden bg-slate-900 border border-slate-800">
                  <INatSpeciesImage
                    scientificName={plant.scientific_name}
                    className="w-full h-full object-cover"
                    aspectRatio="aspect-square"
                  />
                </div>

                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div className="min-w-0">
                      <span className="font-serif italic text-sm font-semibold text-white">
                        {plant.scientific_name}
                      </span>
                      {plant.common_name && (
                        <span className="text-xs text-slate-400 ml-1.5">{plant.common_name}</span>
                      )}
                    </div>
                  </div>

                  {/* Distinct Growth Form, Regional Status, and Habitat */}
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className="px-2 py-0.5 rounded-md bg-slate-900 text-slate-300 border border-slate-800">
                      Form: {plant.growth_form}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-md border ${getStatusBadgeClass(
                        plant.regional_status
                      )}`}
                    >
                      Status: {plant.regional_status}
                    </span>
                  </div>

                  <p className="text-xs text-slate-400">
                    <span className="text-slate-500">Habitat:</span> {plant.habitat_association}
                  </p>

                  {plant.notes && (
                    <p className="text-[11px] text-slate-500 leading-snug">{plant.notes}</p>
                  )}

                  <div className="pt-1 flex flex-wrap items-center gap-2 print:hidden">
                    <button
                      type="button"
                      onClick={() =>
                        onNavigate({
                          module: 'profiles',
                          query: plant.scientific_name,
                          locality: place.displayName,
                          place,
                        })
                      }
                      className="text-xs font-semibold text-cyan-400 hover:text-cyan-300 hover:underline cursor-pointer"
                    >
                      Explore taxon →
                    </button>
                    <span className="text-slate-700" aria-hidden="true">|</span>
                    <button
                      type="button"
                      onClick={() =>
                        onNavigate({
                          module: 'guide',
                          query: getGuideGroupSuggestion(plant.scientific_name),
                          locality: place.displayName,
                          place,
                        })
                      }
                      className="text-xs text-slate-400 hover:text-indigo-300 hover:underline cursor-pointer"
                    >
                      Guide for {getGuideGroupSuggestion(plant.scientific_name)}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 4. RECENT OBSERVATIONS — Recent iNaturalist observations */}
      <section
        aria-label="Recent iNaturalist observations"
        className="bg-slate-900/50 border border-slate-800/80 rounded-3xl p-5 sm:p-6 space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-3 border-b border-slate-800/80">
          <div>
            <h3 className="font-display text-xl font-bold text-white">
              Recent iNaturalist observations
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Actual Research Grade plant records retrieved from iNaturalist •{' '}
              <span className="text-cyan-300 font-medium">{filterSummary.badgeLabel}</span>
            </p>
          </div>
          {totalObsResults > 0 && (
            <span className="text-xs font-mono text-slate-400 shrink-0">
              Showing {observations.length} of {totalObsResults.toLocaleString()} matching records
            </span>
          )}
        </div>

        {filterSummary.isCentrePointFallback && (
          <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-800/50 text-xs text-amber-200 flex items-start gap-2">
            <AlertCircle size={15} className="text-amber-400 shrink-0 mt-0.5" />
            <span>{filterSummary.explanation}</span>
          </div>
        )}

        {loadingObservations ? (
          <div className="py-10 flex flex-col items-center justify-center space-y-2 text-slate-400">
            <Loader2 size={22} className="animate-spin text-cyan-500" />
            <span className="text-xs font-mono">
              Fetching Research Grade iNaturalist observations...
            </span>
          </div>
        ) : observations.length > 0 ? (
          <div className="space-y-3">
            {observations.length <= 2 && (
              <p className="text-xs text-amber-300/90">
                Sparse recent Research Grade observations with photos were found under this geographic filter ({filterSummary.badgeLabel}).
              </p>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {observations.map((obs, idx) => (
                <div
                  key={obs.id}
                  className="group bg-slate-950/60 border border-slate-800 hover:border-cyan-600/50 rounded-2xl overflow-hidden flex flex-col transition-all"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setLightboxIndex(idx);
                      setLightboxOpen(true);
                    }}
                    className="relative aspect-square w-full bg-slate-900 overflow-hidden cursor-pointer text-left"
                    title="View full photo"
                  >
                    <img
                      src={obs.photoUrl}
                      alt={obs.taxonName}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Maximize2 size={18} className="text-white drop-shadow-md" />
                    </div>
                  </button>

                  <div className="p-2.5 flex-1 flex flex-col justify-between gap-2">
                    <div>
                      <button
                        type="button"
                        onClick={() =>
                          onNavigate({
                            module: 'profiles',
                            query: obs.taxonName,
                            locality: place.displayName,
                            place,
                          })
                        }
                        className="text-xs font-serif italic text-white hover:text-cyan-400 line-clamp-1 font-semibold text-left cursor-pointer"
                      >
                        {obs.taxonName}
                      </button>
                      {obs.commonName && (
                        <span className="text-[11px] text-slate-400 line-clamp-1 block">
                          {obs.commonName}
                        </span>
                      )}
                    </div>

                    <div className="space-y-1 pt-1.5 border-t border-slate-800/80 text-[10px] text-slate-400 font-mono">
                      <div className="flex items-center gap-1 text-slate-300">
                        <Calendar size={10} className="text-cyan-400 shrink-0" />
                        <span>{obs.observedOn || 'Date not recorded'}</span>
                      </div>
                      <div className="flex items-center justify-between text-slate-500">
                        <span className="truncate">@{obs.observer}</span>
                        <a
                          href={obs.inatUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-cyan-400 hover:text-cyan-300 inline-flex items-center gap-0.5 shrink-0"
                          title="View record on iNaturalist"
                        >
                          <span>iNat</span>
                          <ExternalLink size={10} />
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="py-6 text-center space-y-2 text-xs text-slate-400">
            <p>
              No recent Research Grade observations with photos were found on iNaturalist for this filter ({filterSummary.badgeLabel}).
            </p>
            {place.providerPlaceId && place.coordinates && !forcePointFallback && (
              <button
                type="button"
                onClick={() => setForcePointFallback(true)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 font-medium transition-colors cursor-pointer"
              >
                Sample within 35 km of centre point instead
              </button>
            )}
          </div>
        )}
      </section>

      {/* EXPANDABLE: Environmental context (collapsed by default) */}
      {(hasEnvDetails || hasElevationZones) && (
        <section className="bg-slate-900/40 border border-slate-800/80 rounded-2xl overflow-hidden">
          <button
            type="button"
            aria-expanded={isEnvExpanded}
            onClick={() => setIsEnvExpanded((prev) => !prev)}
            className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-slate-900/60 transition-colors cursor-pointer"
          >
            <div>
              <h3 className="font-display text-base font-semibold text-white">
                Environmental context
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Climate, soils, elevation{hasElevationZones ? ' & vegetation zones' : ''}, seasonality, history, and pressures
              </p>
            </div>
            <span className="inline-flex items-center gap-1 text-xs font-medium text-cyan-400 shrink-0 ml-4">
              <span>{isEnvExpanded ? 'Hide' : 'Show'}</span>
              {isEnvExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </span>
          </button>

          {isEnvExpanded && (
            <div className="px-5 pb-5 pt-2 border-t border-slate-800/80 space-y-5 animate-in fade-in duration-200">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {env?.climate && (
                  <div className="flex items-start gap-2 text-xs text-slate-300">
                    <Thermometer size={15} className="text-cyan-400 mt-0.5 shrink-0" />
                    <div>
                      <span className="block font-semibold text-slate-400 uppercase tracking-wider text-[10px]">
                        Climate
                      </span>
                      {env.climate}
                    </div>
                  </div>
                )}
                {env?.soil_and_substrate && (
                  <div className="flex items-start gap-2 text-xs text-slate-300">
                    <Droplets size={15} className="text-amber-400 mt-0.5 shrink-0" />
                    <div>
                      <span className="block font-semibold text-slate-400 uppercase tracking-wider text-[10px]">
                        Soils &amp; substrate
                      </span>
                      {env.soil_and_substrate}
                    </div>
                  </div>
                )}
                {env?.elevation_range && (
                  <div className="flex items-start gap-2 text-xs text-slate-300">
                    <Mountain size={15} className="text-slate-400 mt-0.5 shrink-0" />
                    <div>
                      <span className="block font-semibold text-slate-400 uppercase tracking-wider text-[10px]">
                        Elevation
                      </span>
                      {env.elevation_range}
                    </div>
                  </div>
                )}
                {env?.ecoregion && (
                  <div className="flex items-start gap-2 text-xs text-slate-300">
                    <Globe2 size={15} className="text-emerald-400 mt-0.5 shrink-0" />
                    <div>
                      <span className="block font-semibold text-slate-400 uppercase tracking-wider text-[10px]">
                        Ecoregion
                      </span>
                      {env.ecoregion}
                    </div>
                  </div>
                )}
              </div>

              {hasElevationZones && (
                <div className="space-y-2.5">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <Mountain size={13} className="text-cyan-400" />
                    <span>Elevation zones</span>
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {profile.elevation_zones!.map((zone, idx) => (
                      <div
                        key={idx}
                        className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-xs text-white">{zone.name}</span>
                          <span className="text-[11px] font-mono text-cyan-400 shrink-0">
                            {zone.elevation_range}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 leading-relaxed">{zone.description}</p>
                        {zone.characteristic_taxa && zone.characteristic_taxa.length > 0 && (
                          <div className="flex flex-wrap gap-1 pt-1">
                            {zone.characteristic_taxa.map((sp) => (
                              <button
                                key={sp}
                                type="button"
                                onClick={() =>
                                  onNavigate({
                                    module: 'profiles',
                                    query: sp,
                                    locality: place.displayName,
                                    place,
                                  })
                                }
                                className="text-[11px] font-serif italic text-cyan-300 hover:text-cyan-100 bg-slate-900 px-2 py-0.5 rounded border border-slate-800 cursor-pointer"
                              >
                                {sp}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-300">
                {env?.geographic_context && (
                  <div className="space-y-1">
                    <h4 className="font-semibold text-slate-400">Geographic setting</h4>
                    <p className="leading-relaxed">{env.geographic_context}</p>
                  </div>
                )}
                {env?.collecting_and_phenology && (
                  <div className="space-y-1">
                    <h4 className="font-semibold text-slate-400 flex items-center gap-1.5">
                      <Calendar size={12} className="text-cyan-400" />
                      <span>Phenology &amp; timing</span>
                    </h4>
                    <p className="leading-relaxed">{env.collecting_and_phenology}</p>
                  </div>
                )}
                {env?.conservation_and_protected_areas && (
                  <div className="space-y-1">
                    <h4 className="font-semibold text-slate-400 flex items-center gap-1.5">
                      <Info size={12} className="text-amber-400" />
                      <span>Conservation &amp; protected areas</span>
                    </h4>
                    <p className="leading-relaxed">{env.conservation_and_protected_areas}</p>
                  </div>
                )}
                {env?.historical_notes && (
                  <div className="space-y-1">
                    <h4 className="font-semibold text-slate-400 flex items-center gap-1.5">
                      <History size={12} className="text-slate-400" />
                      <span>Botanical history</span>
                    </h4>
                    <p className="leading-relaxed">{env.historical_notes}</p>
                  </div>
                )}
              </div>

              {env?.ecological_threats && env.ecological_threats.length > 0 && (
                <div className="space-y-1.5">
                  <h4 className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                    <ShieldAlert size={13} className="text-rose-400" />
                    <span>Ecological pressures</span>
                  </h4>
                  <ul className="list-disc list-inside text-xs text-slate-300 space-y-1">
                    {env.ecological_threats.map((threat, idx) => (
                      <li key={idx}>{threat}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* EXPANDABLE: Sources & Suggested literature (collapsed by default) */}
      <section className="bg-slate-900/40 border border-slate-800/80 rounded-2xl overflow-hidden">
        <button
          type="button"
          aria-expanded={isSourcesExpanded}
          onClick={() => setIsSourcesExpanded((prev) => !prev)}
          className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-slate-900/60 transition-colors cursor-pointer"
        >
          <div>
            <h3 className="font-display text-base font-semibold text-white">Sources</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {sources.length > 0
                ? `${sources.length} supporting web reference${sources.length === 1 ? '' : 's'}`
                : 'No supporting web references retrieved'}
              {literatureCount > 0
                ? ` · ${literatureCount} suggested reading${literatureCount === 1 ? '' : 's'}`
                : ''}
            </p>
          </div>
          <span className="inline-flex items-center gap-1 text-xs font-medium text-cyan-400 shrink-0 ml-4">
            <span>{isSourcesExpanded ? 'Hide' : 'Show'}</span>
            {isSourcesExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </span>
        </button>

        {isSourcesExpanded && (
          <div className="px-5 pb-5 pt-3 border-t border-slate-800/80 space-y-5 animate-in fade-in duration-200">
            {profile.provenance && (
              <p className="text-xs text-slate-400 bg-slate-950/60 border border-slate-800 rounded-xl p-3">
                {profile.provenance.basisNote}
              </p>
            )}

            {sources.length > 0 ? (
              <SourcesBar sources={sources} mode="inline" />
            ) : (
              <div className="text-xs text-slate-400">
                <h4 className="font-semibold text-slate-300 mb-1">Supporting web references</h4>
                <p>No external web links were returned by search for this summary.</p>
              </div>
            )}

            {profile.recommended_literature && profile.recommended_literature.length > 0 && (
              <LiteratureSection
                literature={profile.recommended_literature}
                locality={place.displayName}
              />
            )}
          </div>
        )}
      </section>

      {lightboxPhotos.length > 0 && (
        <ImageLightbox
          isOpen={lightboxOpen}
          photos={lightboxPhotos}
          currentIndex={lightboxIndex}
          taxonName={observations[lightboxIndex]?.taxonName}
          onClose={() => setLightboxOpen(false)}
          onNavigate={(newIdx) => setLightboxIndex(newIdx)}
        />
      )}
    </div>
  );
}
