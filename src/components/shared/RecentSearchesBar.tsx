import React, { useEffect, useState } from 'react';
import { History, X, Clock, ArrowRight } from 'lucide-react';
import { historyFavoritesService, RecentSearchItem } from '../../services/historyFavoritesService';

interface RecentSearchesBarProps {
  module: 'profiles' | 'authorities' | 'localities' | 'guide';
  onSelect: (item: RecentSearchItem) => void;
  className?: string;
}

export function RecentSearchesBar({ module, onSelect, className = '' }: RecentSearchesBarProps) {
  const [items, setItems] = useState<RecentSearchItem[]>([]);

  const loadItems = () => {
    setItems(historyFavoritesService.getRecentSearches(module));
  };

  useEffect(() => {
    loadItems();

    const handleUpdate = () => {
      loadItems();
    };

    window.addEventListener('recent-searches-updated', handleUpdate);
    return () => {
      window.removeEventListener('recent-searches-updated', handleUpdate);
    };
  }, [module]);

  if (items.length === 0) return null;

  const handleRemove = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    historyFavoritesService.removeRecentSearch(id);
  };

  const handleClearAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    historyFavoritesService.clearRecentSearches(module);
  };

  return (
    <div className={`mt-3 mb-2 print:hidden ${className}`}>
      <div className="flex items-center justify-between gap-2 mb-2 px-1">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400 font-sans">
          <History size={13} className="text-cyan-400 shrink-0" />
          <span>Recent Searches</span>
        </div>
        <button
          onClick={handleClearAll}
          className="text-xs text-slate-400 hover:text-rose-400 font-medium transition-colors cursor-pointer"
        >
          Clear
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item)}
            className="group inline-flex items-center gap-2 pl-3.5 pr-2 py-1.5 rounded-full bg-slate-900/80 hover:bg-slate-800 text-slate-200 hover:text-cyan-300 border border-slate-800 hover:border-slate-700 text-sm font-medium transition-all shadow-sm cursor-pointer"
            title={`Re-open ${item.query}${item.locality ? ` in ${item.locality}` : ''}`}
          >
            <Clock size={13} className="text-slate-500 group-hover:text-cyan-400 shrink-0 transition-colors" />
            <span className="font-serif italic font-medium tracking-wide text-slate-100 group-hover:text-cyan-300">
              {item.query}
            </span>
            {item.locality && (
              <span className="text-[11px] font-sans not-italic font-normal text-slate-300 bg-slate-800 px-2 py-0.5 rounded-full border border-slate-700">
                {item.locality}
              </span>
            )}
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => handleRemove(e, item.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.stopPropagation();
                  handleRemove(e as any, item.id);
                }
              }}
              className="p-1 rounded-full text-slate-500 hover:text-slate-200 hover:bg-slate-700/80 transition-colors ml-0.5 cursor-pointer shrink-0"
              title="Remove from history"
              aria-label={`Remove ${item.query} from history`}
            >
              <X size={12} className="stroke-[2.5]" />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
