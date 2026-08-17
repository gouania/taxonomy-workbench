import React, { useState } from 'react';
import { BookOpen, ExternalLink, Copy, Check, Search, MapPin, Bookmark } from 'lucide-react';
import { LiteratureItem } from '../../types';

interface LiteratureSectionProps {
  literature?: LiteratureItem[];
  locality?: string;
  taxonName?: string;
  title?: string;
  className?: string;
}

export function LiteratureSection({
  literature,
  locality,
  taxonName,
  title = 'Recommended Literature & Identification Resources',
  className = '',
}: LiteratureSectionProps) {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  if (!literature || literature.length === 0) {
    return null;
  }

  const handleCopy = (citation: string, idx: number) => {
    navigator.clipboard.writeText(citation);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  const getTypeBadgeStyle = (type?: string) => {
    const t = (type || '').toLowerCase();
    if (t.includes('flora')) {
      return 'bg-emerald-950/60 text-emerald-300 border-emerald-800/50';
    }
    if (t.includes('revision')) {
      return 'bg-indigo-950/60 text-indigo-300 border-indigo-800/50';
    }
    if (t.includes('monograph')) {
      return 'bg-amber-950/60 text-amber-300 border-amber-800/50';
    }
    if (t.includes('key') || t.includes('guide')) {
      return 'bg-cyan-950/60 text-cyan-300 border-cyan-800/50';
    }
    return 'bg-slate-800/70 text-slate-300 border-slate-700/50';
  };

  return (
    <div className={`bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 shadow-xl backdrop-blur-sm ${className}`}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 mb-4 border-b border-slate-800/80">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-indigo-950/50 border border-indigo-800/40 text-indigo-400">
            <BookOpen size={20} />
          </div>
          <div>
            <h3 className="font-display text-lg font-bold text-white flex items-center gap-2">
              {title}
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-medium border border-slate-700">
                {literature.length} {literature.length === 1 ? 'source' : 'sources'}
              </span>
            </h3>
            <p className="text-xs text-slate-400">
              Authoritative Flora accounts, peer-reviewed taxonomic revisions, and monographs for identification.
            </p>
          </div>
        </div>

        {locality && (
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-950/40 text-cyan-300 text-xs border border-cyan-800/40 self-start sm:self-auto">
            <MapPin size={13} className="text-cyan-400" />
            <span>Region: <strong className="font-medium text-white">{locality}</strong></span>
          </div>
        )}
      </div>

      <div className="space-y-4">
        {literature.map((item, idx) => {
          const scholarUrl = `https://scholar.google.com/scholar?q=${encodeURIComponent(item.citation)}`;
          const isCopied = copiedIdx === idx;

          return (
            <div
              key={idx}
              className="bg-slate-950/50 border border-slate-800/60 rounded-xl p-4 transition-all hover:border-slate-700/80 hover:bg-slate-950/70"
            >
              <div className="flex flex-wrap items-center gap-2 mb-2">
                {item.type && (
                  <span className={`text-[11px] font-semibold uppercase tracking-wider px-2.5 py-0.5 rounded-md border ${getTypeBadgeStyle(item.type)}`}>
                    {item.type}
                  </span>
                )}
                {item.scope && (
                  <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-slate-800/60 text-slate-300 border border-slate-700/40 flex items-center gap-1">
                    <Bookmark size={11} className="text-slate-400" />
                    {item.scope}
                  </span>
                )}
              </div>

              {/* Citation */}
              <div className="text-sm font-medium text-slate-200 leading-relaxed pl-3 border-l-2 border-indigo-500/40 mb-2.5">
                {item.citation}
              </div>

              {/* Notes / Relevance */}
              {item.notes && (
                <p className="text-xs text-slate-400 leading-relaxed mb-3 bg-slate-900/40 px-3 py-2 rounded-lg border border-slate-800/40">
                  <span className="font-semibold text-slate-300">Coverage & Utility: </span>
                  {item.notes}
                </p>
              )}

              {/* Actions */}
              <div className="flex flex-wrap items-center gap-2 pt-1 print:hidden">
                {item.url && item.url.trim() !== '' && (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg bg-cyan-950/50 hover:bg-cyan-900/60 text-cyan-300 border border-cyan-800/50 transition-colors"
                  >
                    <ExternalLink size={12} />
                    View Treatment / Resource
                  </a>
                )}

                <a
                  href={scholarUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg bg-slate-800/60 hover:bg-slate-800 text-slate-300 border border-slate-700/50 transition-colors"
                  title="Search this publication on Google Scholar"
                >
                  <Search size={12} />
                  Google Scholar
                </a>

                <button
                  onClick={() => handleCopy(item.citation, idx)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg bg-slate-800/40 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 transition-colors"
                  title="Copy citation to clipboard"
                >
                  {isCopied ? (
                    <>
                      <Check size={12} className="text-emerald-400" />
                      <span className="text-emerald-400">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy size={12} />
                      <span>Copy Citation</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
