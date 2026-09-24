import React, { useState, useEffect } from 'react';
import { LocalityProfile, NavigationTarget } from '../../types';
import { InfoCard } from '../shared/InfoCard';
import { 
  MapPin, 
  Thermometer, 
  Droplets, 
  Mountain, 
  Leaf, 
  ShieldAlert, 
  History, 
  Globe2, 
  Calendar, 
  MapIcon, 
  Info, 
  BookOpen, 
  GraduationCap, 
  Sparkles, 
  Compass, 
  Layers, 
  ExternalLink, 
  Loader2, 
  Eye, 
  Maximize2 
} from 'lucide-react';
import { CrossLink } from '../shared/CrossLink';
import { SourcesBar } from '../shared/SourcesBar';
import { INatSpeciesImage } from '../shared/INatSpeciesImage';
import { inaturalistService, LocalityObservation } from '../../services/inaturalistService';
import { ImageLightbox, LightboxPhoto } from '../shared/ImageLightbox';

interface LocalityDashboardProps {
  profile: LocalityProfile;
  sources: any[];
  onNavigate: (target: NavigationTarget) => void;
}

type StratumTab = 'all' | 'canopy' | 'shrub' | 'herbaceous' | 'edaphic';

export function LocalityDashboard({ profile, sources, onNavigate }: LocalityDashboardProps) {
  const [activeStratum, setActiveStratum] = useState<StratumTab>('all');
  const [observations, setObservations] = useState<LocalityObservation[]>([]);
  const [loadingObservations, setLoadingObservations] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  // Fetch recent Research-Grade botanical observations from iNaturalist if coordinates are available
  useEffect(() => {
    let isMounted = true;
    const lat = profile.location_details.latitude;
    const lng = profile.location_details.longitude;

    if (typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng)) {
      setLoadingObservations(true);
      inaturalistService.getRecentLocalityObservations(lat, lng, 35, 8)
        .then((obs) => {
          if (isMounted) {
            setObservations(obs);
            setLoadingObservations(false);
          }
        })
        .catch((e) => {
          console.error('Failed to fetch iNaturalist observations:', e);
          if (isMounted) setLoadingObservations(false);
        });
    } else {
      setObservations([]);
    }

    return () => {
      isMounted = false;
    };
  }, [profile.location_details.latitude, profile.location_details.longitude]);

  // Consolidate species across strata
  const canopy = profile.strata?.canopy_trees || [];
  const shrub = profile.strata?.shrub_understory || [];
  const herbaceous = profile.strata?.herbaceous_forbs || [];
  const edaphic = profile.strata?.specialized_edaphic_endemics || profile.taxa.endemic_and_notable || [];

  // Fallbacks if strata is not present in response
  const fallbackDominant = profile.taxa.dominant_species || [];
  const hasStrata = canopy.length > 0 || shrub.length > 0 || herbaceous.length > 0 || edaphic.length > 0;

  const getFilteredSpecies = () => {
    if (!hasStrata) {
      if (activeStratum === 'edaphic') return edaphic.map(name => ({ name, stratum: 'Endemic / Notable' }));
      return fallbackDominant.map(name => ({ name, stratum: 'Dominant Community' }));
    }

    switch (activeStratum) {
      case 'canopy':
        return canopy.map(name => ({ name, stratum: 'Canopy Trees' }));
      case 'shrub':
        return shrub.map(name => ({ name, stratum: 'Shrub Layer' }));
      case 'herbaceous':
        return herbaceous.map(name => ({ name, stratum: 'Herbaceous & Forbs' }));
      case 'edaphic':
        return edaphic.map(name => ({ name, stratum: 'Specialized Endemics' }));
      case 'all':
      default: {
        const combined: { name: string; stratum: string }[] = [];
        canopy.forEach(name => combined.push({ name, stratum: 'Canopy Tree' }));
        shrub.forEach(name => combined.push({ name, stratum: 'Shrub Layer' }));
        herbaceous.forEach(name => combined.push({ name, stratum: 'Herbaceous / Forb' }));
        edaphic.forEach(name => {
          if (!combined.some(c => c.name.toLowerCase() === name.toLowerCase())) {
            combined.push({ name, stratum: 'Specialized Endemic' });
          }
        });
        return combined.length > 0 ? combined : fallbackDominant.map(name => ({ name, stratum: 'Dominant Species' }));
      }
    }
  };

  const currentSpeciesList = getFilteredSpecies();

  const lightboxPhotos: LightboxPhoto[] = observations.map(obs => ({
    url: obs.photoUrl,
    attribution: obs.attribution,
    caption: `${obs.taxonName}${obs.commonName ? ` (${obs.commonName})` : ''} • Observed by @${obs.observer}${obs.observedOn ? ` on ${obs.observedOn}` : ''}`,
    originalUrl: obs.inatUrl
  }));

  const handleOpenLightbox = (index: number) => {
    setLightboxIndex(index);
    setLightboxOpen(true);
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Header */}
      <div className="text-center py-6">
        <h2 className="font-display text-4xl md:text-5xl font-bold text-white mb-3 tracking-tight">
          {profile.location_details.resolved_name}
        </h2>
        <div className="flex items-center justify-center gap-2 text-cyan-400 font-mono text-sm mb-2">
          <MapPin size={16} />
          <span>{profile.location_details.coordinates_dms}</span>
          {typeof profile.location_details.latitude === 'number' && typeof profile.location_details.longitude === 'number' && (
            <span className="text-slate-500 hidden sm:inline">
              ({profile.location_details.latitude.toFixed(4)}°, {profile.location_details.longitude.toFixed(4)}°)
            </span>
          )}
        </div>
      </div>

      {/* One-Click Cross-Module Workflow Bar */}
      <div className="flex flex-wrap items-center gap-3 p-4 bg-slate-900/70 border border-slate-800 rounded-2xl shadow-lg print:hidden">
        <span className="text-xs font-mono uppercase tracking-wider text-slate-400 mr-1 flex items-center gap-1.5">
          <Compass size={14} className="text-cyan-400" /> Workflows:
        </span>
        
        {/* Jump straight to Guide Generator with this locality */}
        <button
          onClick={() => onNavigate({ module: 'guide', locality: profile.location_details.resolved_name })}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-indigo-950/60 hover:bg-indigo-900/70 text-indigo-300 hover:text-white border border-indigo-800/50 hover:border-indigo-600 text-xs font-semibold transition-all cursor-pointer shadow-sm"
          title="Generate a custom dichotomous key for taxa occurring in this locality"
        >
          <BookOpen size={14} className="text-indigo-400" />
          <span>Generate Dichotomous Key for this Locality</span>
        </button>

        {/* Jump straight to Field Quiz filtered to this region */}
        <button
          onClick={() => onNavigate({ module: 'quiz', query: 'Plantae', locality: profile.location_details.resolved_name })}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-fuchsia-950/60 hover:bg-fuchsia-900/70 text-fuchsia-300 hover:text-white border border-fuchsia-800/50 hover:border-fuchsia-600 text-xs font-semibold transition-all cursor-pointer shadow-sm"
          title="Practice identification of research-grade observations in this locality"
        >
          <GraduationCap size={14} className="text-fuchsia-400" />
          <span>Test ID Skills on Plants Here</span>
        </button>

        {/* Jump to Plant Identifier with locality prefilled */}
        <button
          onClick={() => onNavigate({ module: 'identify', locality: profile.location_details.resolved_name })}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-950/60 hover:bg-emerald-900/70 text-emerald-300 hover:text-white border border-emerald-800/50 hover:border-emerald-600 text-xs font-semibold transition-all cursor-pointer shadow-sm"
          title="Identify a plant specimen using this locality and habitat context"
        >
          <Sparkles size={14} className="text-emerald-400" />
          <span>Identify a Specimen from this Region</span>
        </button>
      </div>

      {/* Elevational & Vegetation Zonation (Life Zones) */}
      {profile.life_zones && profile.life_zones.length > 0 && (
        <InfoCard 
          title="Elevation & Vegetation Zonation (Life Zones)" 
          icon={<Mountain size={20} className="text-cyan-400" />}
          highlight
          className="bg-slate-900/70 border-cyan-900/40"
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            {profile.life_zones.map((zone, idx) => (
              <div 
                key={idx} 
                className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-4 flex flex-col justify-between space-y-3 hover:border-cyan-700/50 transition-colors"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="px-2.5 py-0.5 rounded-full bg-cyan-950 text-cyan-400 text-xs font-mono font-medium border border-cyan-800/60">
                      {zone.elevation_range}
                    </span>
                    {zone.community_type && (
                      <span className="text-[11px] text-slate-400 font-sans truncate">
                        {zone.community_type}
                      </span>
                    )}
                  </div>
                  <h4 className="font-semibold text-white text-sm mb-1.5">
                    {zone.name}
                  </h4>
                  {zone.description && (
                    <p className="text-xs text-slate-300 leading-relaxed">
                      {zone.description}
                    </p>
                  )}
                </div>

                {zone.indicator_species && zone.indicator_species.length > 0 && (
                  <div className="pt-2 border-t border-slate-800/60">
                    <span className="text-[11px] font-mono text-slate-500 uppercase tracking-wider block mb-1">
                      Key Indicators:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {zone.indicator_species.map((sp, sIdx) => (
                        <button
                          key={sIdx}
                          type="button"
                          onClick={() => onNavigate({ module: 'profiles', query: sp })}
                          className="text-[11px] font-serif italic text-cyan-300 hover:text-cyan-100 bg-slate-900 hover:bg-slate-800 px-2 py-0.5 rounded-md border border-slate-800 hover:border-cyan-700 transition-colors cursor-pointer"
                        >
                          {sp}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </InfoCard>
      )}

      {/* Main Grid: Flora by Stratum + Live Feed + Environmental Profile */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 print:block print:space-y-6">
        
        {/* Left Column (8 cols): Environmental Overview & Stratum Breakdown */}
        <div className="lg:col-span-8 space-y-6">
          
          {/* Habitat & Landscape Profile */}
          <InfoCard title="Habitat & Landscape" highlight className="bg-slate-900/60 border-cyan-900/30">
            <p className="text-slate-200 leading-relaxed mb-6">
              {profile.habitat_and_landscape.ecosystem_description}
            </p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="flex items-start gap-2 text-sm text-slate-300">
                <Thermometer size={16} className="text-cyan-500 mt-0.5 shrink-0" />
                <div>
                  <span className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">Climate</span>
                  {profile.habitat_and_landscape.climate}
                </div>
              </div>
              <div className="flex items-start gap-2 text-sm text-slate-300">
                <Droplets size={16} className="text-amber-600 mt-0.5 shrink-0" />
                <div>
                  <span className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">Soil Type</span>
                  {profile.habitat_and_landscape.soil_type}
                </div>
              </div>
              <div className="flex items-start gap-2 text-sm text-slate-300">
                <Mountain size={16} className="text-slate-400 mt-0.5 shrink-0" />
                <div>
                  <span className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">Elevation</span>
                  {profile.habitat_and_landscape.elevation_range}
                </div>
              </div>
              <div className="flex items-start gap-2 text-sm text-slate-300">
                <Globe2 size={16} className="text-emerald-500 mt-0.5 shrink-0" />
                <div>
                  <span className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">Ecoregion</span>
                  {profile.habitat_and_landscape.ecoregion}
                </div>
              </div>
            </div>
          </InfoCard>

          {/* Floral Context by Ecological Stratum */}
          <InfoCard 
            title="Flora by Ecological Stratum" 
            icon={<Layers size={20} className="text-emerald-400" />}
            className="bg-slate-900/60 border-slate-800"
          >
            {/* Stratum Filter Tabs */}
            <div className="flex flex-wrap items-center gap-1.5 pb-4 mb-4 border-b border-slate-800/80">
              <button
                type="button"
                onClick={() => setActiveStratum('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  activeStratum === 'all'
                    ? 'bg-cyan-600 text-white shadow-md'
                    : 'bg-slate-800/60 text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                All Flora ({hasStrata ? canopy.length + shrub.length + herbaceous.length + edaphic.length : fallbackDominant.length})
              </button>

              {hasStrata && (
                <>
                  {canopy.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setActiveStratum('canopy')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                        activeStratum === 'canopy'
                          ? 'bg-cyan-600 text-white shadow-md'
                          : 'bg-slate-800/60 text-slate-400 hover:text-white hover:bg-slate-800'
                      }`}
                    >
                      Canopy Trees ({canopy.length})
                    </button>
                  )}

                  {shrub.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setActiveStratum('shrub')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                        activeStratum === 'shrub'
                          ? 'bg-cyan-600 text-white shadow-md'
                          : 'bg-slate-800/60 text-slate-400 hover:text-white hover:bg-slate-800'
                      }`}
                    >
                      Shrub Layer ({shrub.length})
                    </button>
                  )}

                  {herbaceous.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setActiveStratum('herbaceous')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                        activeStratum === 'herbaceous'
                          ? 'bg-cyan-600 text-white shadow-md'
                          : 'bg-slate-800/60 text-slate-400 hover:text-white hover:bg-slate-800'
                      }`}
                    >
                      Herbaceous & Wildflowers ({herbaceous.length})
                    </button>
                  )}

                  {edaphic.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setActiveStratum('edaphic')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                        activeStratum === 'edaphic'
                          ? 'bg-cyan-600 text-white shadow-md'
                          : 'bg-slate-800/60 text-slate-400 hover:text-white hover:bg-slate-800'
                      }`}
                    >
                      Specialized Endemics ({edaphic.length})
                    </button>
                  )}
                </>
              )}
            </div>

            {/* Taxa Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              {currentSpeciesList.map((item, idx) => (
                <div 
                  key={idx} 
                  className="flex items-center gap-3 p-2.5 bg-slate-950/40 hover:bg-slate-800/60 border border-slate-800/60 hover:border-slate-700 rounded-2xl transition-all"
                >
                  <div className="w-14 h-14 shrink-0 rounded-xl overflow-hidden bg-slate-900 border border-slate-800">
                    <INatSpeciesImage 
                      scientificName={item.name} 
                      className="w-full h-full object-cover" 
                      aspectRatio="aspect-square" 
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-cyan-400/90 bg-cyan-950/60 px-1.5 py-0.5 rounded border border-cyan-900/40">
                        {item.stratum}
                      </span>
                    </div>
                    <CrossLink 
                      target={{ module: 'profiles', query: item.name }} 
                      onNavigate={onNavigate} 
                      className="inline-block hover:underline truncate max-w-full font-serif italic text-slate-200 text-sm font-medium"
                    >
                      {item.name}
                    </CrossLink>
                  </div>
                </div>
              ))}
            </div>
          </InfoCard>

          {/* Live Recent Research-Grade Finds (iNaturalist Feed) */}
          <InfoCard 
            title="Recent Research-Grade Finds in this Area" 
            icon={<Eye size={20} className="text-cyan-400" />}
            className="bg-slate-900/60 border-slate-800"
          >
            {loadingObservations ? (
              <div className="py-12 flex flex-col items-center justify-center space-y-2 text-slate-400">
                <Loader2 size={24} className="animate-spin text-cyan-500" />
                <span className="text-xs font-mono">Querying live iNaturalist research records...</span>
              </div>
            ) : observations.length > 0 ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-slate-400 pb-2 border-b border-slate-800/80">
                  <span>Live field observations within 35 km (click photo to expand)</span>
                  <span className="font-mono text-cyan-400">{observations.length} research-grade records</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                  {observations.map((obs, idx) => (
                    <div 
                      key={obs.id} 
                      className="group relative bg-slate-950/60 border border-slate-800 hover:border-cyan-600/50 rounded-2xl overflow-hidden flex flex-col transition-all"
                    >
                      {/* Photo thumbnail */}
                      <div 
                        onClick={() => handleOpenLightbox(idx)}
                        className="relative aspect-square w-full bg-slate-900 overflow-hidden cursor-pointer"
                        title="Click to view full photo"
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
                      </div>

                      {/* Info snippet */}
                      <div className="p-2.5 flex-1 flex flex-col justify-between">
                        <div>
                          <CrossLink 
                            target={{ module: 'profiles', query: obs.taxonName }} 
                            onNavigate={onNavigate}
                            className="text-xs font-serif italic text-white hover:text-cyan-400 line-clamp-1 font-semibold"
                          >
                            {obs.taxonName}
                          </CrossLink>
                          {obs.commonName && (
                            <span className="text-[11px] text-slate-400 line-clamp-1 block">
                              {obs.commonName}
                            </span>
                          )}
                        </div>

                        <div className="mt-2 pt-1.5 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-500 font-mono">
                          <span>@{obs.observer}</span>
                          <a 
                            href={obs.inatUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-cyan-400 hover:text-cyan-300 inline-flex items-center gap-0.5"
                            title="View observation on iNaturalist"
                          >
                            <span>iNat</span>
                            <ExternalLink size={10} />
                          </a>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="py-6 text-center text-xs text-slate-500 font-mono">
                No recent photo-verified research-grade observations retrieved for these specific coordinates.
              </div>
            )}
          </InfoCard>

          {/* Geography & History */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <InfoCard title="Geography & Context" icon={<MapIcon size={20} />}>
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-semibold text-slate-400 mb-1">Geographic Context</h4>
                  <p className="text-sm text-slate-300 leading-relaxed">{profile.geography_and_history.geographic_context}</p>
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-slate-400 mb-1 flex items-center gap-1.5">
                    <History size={14} /> Historical Botanical Notes
                  </h4>
                  <p className="text-sm text-slate-300 leading-relaxed">{profile.geography_and_history.historical_notes}</p>
                </div>
              </div>
            </InfoCard>

            <div className="space-y-6">
              <InfoCard title="Phenology" icon={<Calendar size={20} className="text-cyan-400" />}>
                <div>
                  <h4 className="text-sm font-semibold text-slate-400 mb-1">Optimal Collecting Season</h4>
                  <p className="text-sm text-slate-300 leading-relaxed">{profile.phenology.optimal_collecting_season}</p>
                </div>
              </InfoCard>

              <InfoCard title="Protected Status" icon={<Info size={20} className="text-amber-400" />} className="bg-amber-950/20 border-amber-900/30">
                <p className="text-sm text-amber-200/90 leading-relaxed">{profile.geography_and_history.protected_status}</p>
              </InfoCard>
            </div>
          </div>
        </div>

        {/* Right Column (4 cols): Interactive Map & Ecological Threats */}
        <div className="lg:col-span-4 space-y-6">
          {profile.location_details.latitude && profile.location_details.longitude && (
            <InfoCard title="Geographic Map View" className="p-0 overflow-hidden h-72 border-slate-700/50 print:hidden">
              <iframe
                title="Locality Map"
                width="100%"
                height="100%"
                frameBorder="0"
                style={{ border: 0 }}
                src={`https://www.openstreetmap.org/export/embed.html?bbox=${profile.location_details.longitude - 0.08},${profile.location_details.latitude - 0.08},${profile.location_details.longitude + 0.08},${profile.location_details.latitude + 0.08}&layer=mapnik&marker=${profile.location_details.latitude},${profile.location_details.longitude}`}
                allowFullScreen
              />
            </InfoCard>
          )}

          {/* Endemic & Notable Species Highlights */}
          {profile.taxa.endemic_and_notable && profile.taxa.endemic_and_notable.length > 0 && (
            <InfoCard title="Endemic & Notable Taxa" icon={<Leaf size={20} className="text-cyan-500" />}>
              <div className="flex flex-col gap-2.5 pt-2">
                {profile.taxa.endemic_and_notable.map((taxon, idx) => (
                  <div key={idx} className="flex items-center gap-3 p-1.5 hover:bg-slate-800/40 rounded-xl transition-all">
                    <div className="w-11 h-11 shrink-0">
                      <INatSpeciesImage 
                        scientificName={taxon} 
                        className="w-full h-full rounded-lg" 
                        aspectRatio="aspect-square" 
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <CrossLink target={{ module: 'profiles', query: taxon }} onNavigate={onNavigate} className="inline-block hover:underline truncate max-w-full font-serif italic text-slate-200 text-sm">
                        {taxon}
                      </CrossLink>
                    </div>
                  </div>
                ))}
              </div>
            </InfoCard>
          )}

          {/* Ecological Threats */}
          <InfoCard title="Ecological Threats & Pressures" icon={<ShieldAlert size={20} className="text-red-500" />}>
            <ul className="list-disc list-inside text-sm text-slate-300 space-y-2 pt-2 marker:text-rose-500/80">
              {profile.ecological_threats.map((threat, idx) => (
                <li key={idx} className="leading-relaxed">{threat}</li>
              ))}
            </ul>
          </InfoCard>
        </div>
      </div>

      {/* Lightbox for Live Observations Feed */}
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

      {/* Sources Bar */}
      <SourcesBar sources={sources} mode="sticky" />
    </div>
  );
}
