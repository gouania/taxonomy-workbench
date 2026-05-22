import React from 'react';
import { ConfusedTaxon, NavigationTarget } from '../../types';
import { CrossLink } from '../shared/CrossLink';
import { MarkdownRenderer } from '../shared/MarkdownRenderer';
import { INatSpeciesImage } from '../shared/INatSpeciesImage';

interface SimilarSpeciesCardProps {
  taxon: ConfusedTaxon;
  onNavigate: (target: NavigationTarget) => void;
}

export function SimilarSpeciesCard({ taxon, onNavigate }: SimilarSpeciesCardProps) {
  return (
    <div className="bg-slate-800/40 border border-amber-900/30 rounded-xl p-4 hover:bg-slate-800/60 transition-all flex gap-4 items-start">
      <div className="w-24 h-24 shrink-0">
        <INatSpeciesImage 
          scientificName={taxon.name} 
          className="w-full h-full rounded-lg" 
          aspectRatio="aspect-square" 
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <CrossLink target={{ module: 'profiles', query: taxon.name }} onNavigate={onNavigate}>
            <i className="font-serif text-amber-500">{taxon.name}</i>
          </CrossLink>
          <span className="px-2 py-0.5 bg-amber-900/20 text-amber-400 text-[10px] font-medium uppercase tracking-wider rounded-md border border-amber-900/50">
            {taxon.keyFeature}
          </span>
        </div>
        <MarkdownRenderer content={taxon.difference} className="text-xs text-slate-300" />
      </div>
    </div>
  );
}
