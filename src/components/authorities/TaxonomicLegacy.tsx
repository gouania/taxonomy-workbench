import { Leaf, Tag } from 'lucide-react';
import React from 'react';
import { AuthorProfile, NavigationTarget } from '../../types';
import { CrossLink } from '../shared/CrossLink';
import { InfoCard } from '../shared/InfoCard';
import { MarkdownRenderer } from '../shared/MarkdownRenderer';

interface TaxonomicLegacyProps {
  profile: AuthorProfile;
  onNavigate: (target: NavigationTarget) => void;
}

export function TaxonomicLegacy({ profile, onNavigate }: TaxonomicLegacyProps) {
  if (!profile) return null;

  const hasTaxaDescribed = profile.taxaDescribed && profile.taxaDescribed.length > 0;
  const hasEponymousTaxa = profile.eponymousTaxa && profile.eponymousTaxa.length > 0;
  const hasHerbaria = profile.herbariaCollections && profile.herbariaCollections.length > 0;
  const hasNotes = Boolean(profile.taxonomicNotes);

  if (!hasTaxaDescribed && !hasEponymousTaxa && !hasHerbaria && !hasNotes) {
    return null;
  }

  return (
    <InfoCard title="Taxonomic Legacy" icon={<Leaf size={20} />}>
      <div className="space-y-6">
        {hasTaxaDescribed && (
          <div>
            <h4 className="text-sm font-semibold text-slate-400 mb-3 flex items-center gap-2">
              <Tag size={16} className="text-cyan-500" /> Notable Taxa Described
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {profile.taxaDescribed!.map((taxon, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between bg-slate-800/40 p-3 rounded-xl border border-slate-700/50"
                >
                  <CrossLink target={{ module: 'profiles', query: taxon.name }} onNavigate={onNavigate}>
                    <i className="font-serif text-cyan-400">{taxon.name}</i>
                  </CrossLink>
                  <span className="px-2 py-0.5 bg-slate-700/50 text-slate-400 text-xs rounded-md border border-slate-600/50">
                    {taxon.rank}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {hasEponymousTaxa && (
          <div className="pt-4 border-t border-slate-800/50">
            <h4 className="text-sm font-semibold text-slate-400 mb-3 flex items-center gap-2">
              <Leaf size={16} className="text-emerald-500" /> Eponymous Taxa
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {profile.eponymousTaxa!.map((taxon, idx) => (
                <div
                  key={idx}
                  className="bg-slate-800/40 p-3 rounded-xl border border-slate-700/50"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <CrossLink target={{ module: 'profiles', query: taxon.name }} onNavigate={onNavigate}>
                      <i className="font-serif text-emerald-400">{taxon.name}</i>
                    </CrossLink>
                    <span className="px-2 py-0.5 bg-slate-700/50 text-slate-400 text-xs rounded-md border border-slate-600/50">
                      {taxon.rank}
                    </span>
                  </div>
                  {taxon.reason && <p className="text-xs text-slate-400">{taxon.reason}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {hasHerbaria && (
          <div className="pt-4 border-t border-slate-800/50">
            <h4 className="text-sm font-semibold text-slate-400 mb-3">Herbaria Collections</h4>
            <div className="flex flex-wrap gap-3">
              {profile.herbariaCollections!.map((herbarium, idx) => (
                <a
                  key={idx}
                  href={`http://sweetgum.nybg.org/science/ih/herbarium-details/?irn=${herbarium.abbreviation}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 bg-slate-800/40 hover:bg-slate-700/50 p-2 pr-3 rounded-xl border border-slate-700/50 transition-colors group"
                  title="View in Index Herbariorum"
                >
                  <span className="px-2 py-1 bg-slate-700 text-slate-300 font-mono text-xs rounded-lg group-hover:text-white transition-colors">
                    {herbarium.abbreviation}
                  </span>
                  <span className="text-sm text-slate-400 group-hover:text-cyan-400 transition-colors">
                    {herbarium.institution}
                  </span>
                </a>
              ))}
            </div>
          </div>
        )}

        {hasNotes && (
          <div className="pt-4 border-t border-slate-800/50">
            <h4 className="text-sm font-semibold text-slate-400 mb-2">Taxonomic Notes</h4>
            <MarkdownRenderer content={profile.taxonomicNotes} className="text-sm" />
          </div>
        )}
      </div>
    </InfoCard>
  );
}
