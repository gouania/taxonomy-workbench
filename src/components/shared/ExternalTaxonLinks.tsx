import React from 'react';
import { ExternalLink, BookOpen } from 'lucide-react';

interface ExternalTaxonLinksProps {
  scientificName: string;
  className?: string;
}

export function ExternalTaxonLinks({ scientificName, className = '' }: ExternalTaxonLinksProps) {
  if (!scientificName) return null;
  // Clean off markers, quotes, asterisks for pristine query
  const cleanName = scientificName.replace(/[\*\_\"\'\`]/g, '').trim();
  const enc = encodeURIComponent(cleanName);
  const queryPlus = encodeURIComponent(cleanName).replace(/%20/g, '+');

  const databases = [
    {
      name: 'POWO',
      full: 'Plants of the World Online (Kew)',
      url: `https://powo.science.kew.org/results?q=${enc}`,
      color: 'text-cyan-400 hover:text-cyan-300 border-cyan-500/30 hover:border-cyan-400 bg-cyan-950/40 hover:bg-cyan-900/60',
    },
    {
      name: 'WFO',
      full: 'World Flora Online Consortium',
      url: `https://worldfloraonline.org/search?query=${queryPlus}`,
      color: 'text-emerald-400 hover:text-emerald-300 border-emerald-500/30 hover:border-emerald-400 bg-emerald-950/40 hover:bg-emerald-900/60',
    },
    {
      name: 'IPNI',
      full: 'International Plant Names Index',
      url: `https://www.ipni.org/search?q=${enc}`,
      color: 'text-blue-400 hover:text-blue-300 border-blue-500/30 hover:border-blue-400 bg-blue-950/40 hover:bg-blue-900/60',
    },
    {
      name: 'GBIF',
      full: 'Global Biodiversity Information Facility',
      url: `https://www.gbif.org/taxon/search?q=${queryPlus}`,
      color: 'text-amber-400 hover:text-amber-300 border-amber-500/30 hover:border-amber-400 bg-amber-950/40 hover:bg-amber-900/60',
    },
    {
      name: 'BHL',
      full: 'Biodiversity Heritage Library (Protologues & Scans)',
      url: `https://www.biodiversitylibrary.org/search?searchTerm=${enc}`,
      color: 'text-purple-400 hover:text-purple-300 border-purple-500/30 hover:border-purple-400 bg-purple-950/40 hover:bg-purple-900/60',
    },
  ];

  return (
    <div className={`flex flex-wrap items-center justify-center gap-2 pt-2 print:hidden ${className}`}>
      {databases.map((db) => (
        <a
          key={db.name}
          href={db.url}
          target="_blank"
          rel="noopener noreferrer"
          title={`Search ${cleanName} in ${db.full}`}
          className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg border transition-all duration-200 shadow-sm ${db.color}`}
        >
          <span>{db.name}</span>
          <ExternalLink size={10} className="opacity-70" />
        </a>
      ))}
    </div>
  );
}

interface ExternalAuthorLinksProps {
  authorName: string;
  abbreviation?: string;
  className?: string;
}

export function ExternalAuthorLinks({ authorName, abbreviation, className = '' }: ExternalAuthorLinksProps) {
  if (!authorName && !abbreviation) return null;
  const primaryTerm = abbreviation || authorName;
  const encPrimary = encodeURIComponent(primaryTerm.trim());
  const encName = encodeURIComponent(authorName.trim());

  const links = [
    {
      name: 'IPNI Author Index',
      url: `https://www.ipni.org/search?q=${encPrimary}&f=author`,
      color: 'text-blue-400 border-blue-500/30 hover:border-blue-400 bg-blue-950/40 hover:bg-blue-900/60',
    },
    {
      name: 'HUH Botanist Index',
      url: `https://kiki.huh.harvard.edu/databases/botanist_search.php?name=${encName}`,
      color: 'text-amber-400 border-amber-500/30 hover:border-amber-400 bg-amber-950/40 hover:bg-amber-900/60',
    },
    {
      name: 'BHL Publications',
      url: `https://www.biodiversitylibrary.org/search?searchTerm=${encName}`,
      color: 'text-purple-400 border-purple-500/30 hover:border-purple-400 bg-purple-950/40 hover:bg-purple-900/60',
    },
  ];

  return (
    <div className={`flex flex-wrap items-center gap-2 pt-2 print:hidden ${className}`}>
      <span className="text-[11px] text-slate-500 uppercase tracking-wider font-mono flex items-center gap-1 mr-1">
        <BookOpen size={12} className="text-slate-400" /> Authority Archives:
      </span>
      {links.map((link) => (
        <a
          key={link.name}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          title={`Lookup ${authorName} in ${link.name}`}
          className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg border transition-all duration-200 shadow-sm ${link.color}`}
        >
          <span>{link.name}</span>
          <ExternalLink size={10} className="opacity-70" />
        </a>
      ))}
    </div>
  );
}
