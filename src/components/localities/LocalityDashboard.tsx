import React from 'react';
import { LocalityProfile, NavigationTarget } from '../../types';
import { InfoCard } from '../shared/InfoCard';
import { MapPin, Thermometer, Droplets, Mountain, Leaf, ShieldAlert, History, Globe2, Calendar, MapIcon, Info } from 'lucide-react';
import { CrossLink } from '../shared/CrossLink';
import { SourcesBar } from '../shared/SourcesBar';
import { CopyTextButton, PrintPDFButton } from '../shared/ExportTools';
import { INatSpeciesImage } from '../shared/INatSpeciesImage';

interface LocalityDashboardProps {
  profile: LocalityProfile;
  sources: any[];
  onNavigate: (target: NavigationTarget) => void;
}

function formatLocalityAsMarkdown(profile: LocalityProfile): string {
  return `
# Locality Profile: ${profile.location_details.resolved_name}
**Coordinates:** ${profile.location_details.coordinates_dms}
***
## Habitat & Landscape
**Ecosystem Description:** ${profile.habitat_and_landscape.ecosystem_description}
- **Climate:** ${profile.habitat_and_landscape.climate}
- **Soil Type:** ${profile.habitat_and_landscape.soil_type}
- **Elevation Range:** ${profile.habitat_and_landscape.elevation_range}
- **Ecoregion:** ${profile.habitat_and_landscape.ecoregion}

## Geography & History
- **Geographic Context:** ${profile.geography_and_history.geographic_context}
- **Historical Notes:** ${profile.geography_and_history.historical_notes}
- **Protected Status:** ${profile.geography_and_history.protected_status}

## Phenology
- **Optimal Collecting Season:** ${profile.phenology.optimal_collecting_season}

## Floral Context
### Dominant Species:
${profile.taxa.dominant_species.map(s => `- *${s}*`).join('\n')}

### Endemic & Notable Species:
${profile.taxa.endemic_and_notable.map(s => `- *${s}*`).join('\n')}

## Ecological Threats
${profile.ecological_threats.map(t => `- ${t}`).join('\n')}
  `.trim();
}

export function LocalityDashboard({ profile, sources, onNavigate }: LocalityDashboardProps) {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="text-center py-8">
        <h2 className="font-display text-4xl md:text-5xl font-bold text-white mb-3">
          {profile.location_details.resolved_name}
        </h2>
        <div className="flex items-center justify-center gap-2 text-cyan-400 font-medium mb-4">
          <MapPin size={18} />
          {profile.location_details.coordinates_dms}
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3 print:hidden">
          <CopyTextButton 
            text={formatLocalityAsMarkdown(profile)} 
            label="Copy Locality Data" 
            title="Copy entire region details as formatted Markdown" 
          />
          <PrintPDFButton label="Export / Print PDF" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 print:block print:space-y-6">
        <div className="lg:col-span-8 space-y-6">
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
             <InfoCard title="Geography & History" icon={<MapIcon size={20} />}>
               <div className="space-y-4">
                 <div>
                   <h4 className="text-sm font-semibold text-slate-400 mb-1">Geographic Context</h4>
                   <p className="text-sm text-slate-300 leading-relaxed">{profile.geography_and_history.geographic_context}</p>
                 </div>
                 <div>
                   <h4 className="text-sm font-semibold text-slate-400 mb-1 flex items-center gap-1.5"><History size={14} /> Historical Notes</h4>
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

        <div className="lg:col-span-4 space-y-6">
          {profile.location_details.latitude && profile.location_details.longitude && (
            <InfoCard title="Map View" className="p-0 overflow-hidden h-64 border-slate-700/50 print:hidden">
              <iframe
                title="Locality Map"
                width="100%"
                height="100%"
                frameBorder="0"
                style={{ border: 0 }}
                src={`https://www.openstreetmap.org/export/embed.html?bbox=${profile.location_details.longitude - 0.05},${profile.location_details.latitude - 0.05},${profile.location_details.longitude + 0.05},${profile.location_details.latitude + 0.05}&layer=mapnik&marker=${profile.location_details.latitude},${profile.location_details.longitude}`}
                allowFullScreen
              />
            </InfoCard>
          )}

          <InfoCard title="Dominant Communities" icon={<Leaf size={20} className="text-emerald-500" />}>
             <div className="flex flex-col gap-3 pt-2">
                {profile.taxa.dominant_species.map((taxon, idx) => (
                  <div key={idx} className="flex items-center gap-3 p-1.5 hover:bg-slate-800/40 rounded-xl transition-all">
                    <div className="w-12 h-12 shrink-0">
                      <INatSpeciesImage 
                        scientificName={taxon} 
                        className="w-full h-full rounded-lg" 
                        aspectRatio="aspect-square" 
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <CrossLink target={{ module: 'profiles', query: taxon }} onNavigate={onNavigate} className="inline-block hover:underline truncate max-w-full">
                        <i className="font-serif text-slate-200">{taxon}</i>
                      </CrossLink>
                    </div>
                  </div>
                ))}
             </div>
          </InfoCard>
          
          <InfoCard title="Endemic & Notable Species" icon={<Leaf size={20} className="text-cyan-500" />}>
             <div className="flex flex-col gap-3 pt-2">
                {profile.taxa.endemic_and_notable.map((taxon, idx) => (
                  <div key={idx} className="flex items-center gap-3 p-1.5 hover:bg-slate-800/40 rounded-xl transition-all">
                    <div className="w-12 h-12 shrink-0">
                      <INatSpeciesImage 
                        scientificName={taxon} 
                        className="w-full h-full rounded-lg" 
                        aspectRatio="aspect-square" 
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <CrossLink target={{ module: 'profiles', query: taxon }} onNavigate={onNavigate} className="inline-block hover:underline truncate max-w-full">
                        <i className="font-serif text-slate-200">{taxon}</i>
                      </CrossLink>
                    </div>
                  </div>
                ))}
             </div>
          </InfoCard>
          
          <InfoCard title="Ecological Threats" icon={<ShieldAlert size={20} className="text-red-500" />}>
             <ul className="list-disc list-inside text-sm text-slate-300 space-y-2 pt-2 marker:text-slate-600">
               {profile.ecological_threats.map((threat, idx) => (
                 <li key={idx} className="leading-relaxed">{threat}</li>
               ))}
             </ul>
          </InfoCard>
        </div>
      </div>

      <SourcesBar sources={sources} mode="sticky" />
    </div>
  );
}
