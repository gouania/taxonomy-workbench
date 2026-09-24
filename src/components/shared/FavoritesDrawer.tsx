import React, { useEffect, useState } from 'react';
import { Bookmark, Star, X, Trash2, ExternalLink, Microscope, ArrowRight } from 'lucide-react';
import { historyFavoritesService, FavoriteTaxon } from '../../services/historyFavoritesService';
import { NavigationTarget } from '../../types';

interface FavoritesDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (target: NavigationTarget) => void;
}

export function FavoritesDrawer({ isOpen, onClose, onNavigate }: FavoritesDrawerProps) {
  const [favorites, setFavorites] = useState<FavoriteTaxon[]>([]);

  const loadFavorites = () => {
    setFavorites(historyFavoritesService.getFavorites());
  };

  useEffect(() => {
    loadFavorites();

    const handleUpdate = () => {
      loadFavorites();
    };

    window.addEventListener('favorites-updated', handleUpdate);
    return () => {
      window.removeEventListener('favorites-updated', handleUpdate);
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-slate-950 border-l border-slate-800 h-full p-6 flex flex-col shadow-2xl animate-in slide-in-from-right duration-300 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Star size={20} className="fill-amber-400" />
            </div>
            <div>
              <h3 className="font-display text-lg font-bold text-white flex items-center gap-2">
                Field Bookmarks
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-amber-300 font-mono">
                  {favorites.length}
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Starred taxa saved for quick field retrieval.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Close Bookmarks"
          >
            <X size={20} />
          </button>
        </div>

        {/* List Content */}
        <div className="flex-1 overflow-y-auto py-4 space-y-3">
          {favorites.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-center p-6 text-slate-500">
              <Bookmark size={36} className="mb-3 stroke-1 text-slate-600" />
              <p className="text-sm font-medium text-slate-300 mb-1">No Bookmarked Taxa</p>
              <p className="text-xs text-slate-500 max-w-xs leading-relaxed">
                Click the Star icon on any taxon profile to bookmark specimens for quick offline reference.
              </p>
            </div>
          ) : (
            favorites.map((fav) => (
              <div
                key={fav.scientificName}
                className="group p-3.5 rounded-2xl bg-slate-900/60 hover:bg-slate-900 border border-slate-800/80 hover:border-slate-700 transition-all flex items-start justify-between gap-3 shadow-sm"
              >
                <div 
                  className="flex-1 min-w-0 cursor-pointer"
                  onClick={() => {
                    onNavigate({ module: 'profiles', query: fav.scientificName, locality: fav.localityContext });
                    onClose();
                  }}
                >
                  <h4 className="font-serif italic text-base font-bold text-white group-hover:text-cyan-400 transition-colors truncate">
                    {fav.scientificName}
                  </h4>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 mt-1">
                    {fav.commonName && <span className="text-slate-300 truncate">{fav.commonName}</span>}
                    {fav.family && (
                      <span className="font-mono text-[11px] bg-slate-800/60 px-1.5 py-0.5 rounded text-slate-400">
                        {fav.family}
                      </span>
                    )}
                  </div>
                  {fav.localityContext && (
                    <div className="text-[11px] text-cyan-400 mt-1 truncate">
                      Region: {fav.localityContext}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
                  <button
                    onClick={() => {
                      onNavigate({ module: 'profiles', query: fav.scientificName, locality: fav.localityContext });
                      onClose();
                    }}
                    className="p-1.5 rounded-lg bg-slate-800/60 hover:bg-cyan-950/60 text-slate-400 hover:text-cyan-300 border border-slate-700/50 hover:border-cyan-700/50 transition-colors"
                    title="Open Taxon Profile"
                  >
                    <ArrowRight size={14} />
                  </button>
                  <button
                    onClick={() => historyFavoritesService.removeFavorite(fav.scientificName)}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-950/30 transition-colors"
                    title="Remove from Bookmarks"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        {favorites.length > 0 && (
          <div className="pt-4 border-t border-slate-800 text-center">
            <p className="text-[11px] text-slate-500 font-mono">
              Persisted in your browser storage for field use
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
