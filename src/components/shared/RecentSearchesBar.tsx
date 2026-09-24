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
    <div className={`mt-3 print:hidden ${className}`}>
      <div className="flex items-center justify-between gap-2 mb-2 px-1">
        <div className="flex items-center gap-1.5 text-xs text-slate-400 font-mono">
          <History size={13} className="text-cyan-400" />
          <span>Recent Searches</span>
        </div>
        <button
          onClick={handleClearAll}
          className="text-[11px] text-slate-500 hover:text-slate-300 font-mono transition-colors"
        >
          Clear
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => onSelect(item)}
            className="group inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/70 hover:bg-slate-800 text-slate-300 hover:text-cyan-300 border border-slate-800 hover:border-slate-700 text-xs font-medium transition-all shadow-sm cursor-pointer"
            title={`Re-open ${item.query}${item.locality ? ` in ${item.locality}` : ''}`}
          >
            <Clock size={11} className="text-slate-500 group-hover:text-cyan-400" />
            <span className="font-serif italic font-medium">{item.query}</span>
            {item.locality && (
              <span className="text-[10px] text-slate-400 font-sans font-normal bg-slate-800/80 px-1.5 py-0.5 rounded">
                {item.locality}
              </span>
            )}
            <span
              onClick={(e) => handleRemove(e, item.id)}
              className="p-0.5 rounded-full hover:bg-slate-700/80 text-slate-500 hover:text-slate-300 ml-0.5 transition-colors"
              title="Remove from history"
            >
              <X size={11} />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
