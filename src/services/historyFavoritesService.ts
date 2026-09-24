import { TaxonProfile } from '../types';

export interface RecentSearchItem {
  id: string;
  module: 'profiles' | 'authorities' | 'localities' | 'guide';
  query: string;
  locality?: string;
  timestamp: number;
}

export interface FavoriteTaxon {
  scientificName: string;
  author?: string;
  commonName?: string;
  family?: string;
  localityContext?: string;
  timestamp: number;
}

const RECENT_SEARCHES_KEY = 'taxonomy_workbench_recent_searches_v1';
const FAVORITES_KEY = 'taxonomy_workbench_favorites_v1';
const MAX_RECENT_SEARCHES = 12;

export const historyFavoritesService = {
  // --- RECENT SEARCHES ---
  getRecentSearches(moduleFilter?: 'profiles' | 'authorities' | 'localities' | 'guide'): RecentSearchItem[] {
    try {
      const raw = localStorage.getItem(RECENT_SEARCHES_KEY);
      if (!raw) return [];
      const parsed: RecentSearchItem[] = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      if (moduleFilter) {
        return parsed.filter((item) => item.module === moduleFilter);
      }
      return parsed;
    } catch {
      return [];
    }
  },

  addRecentSearch(item: Omit<RecentSearchItem, 'id' | 'timestamp'>): void {
    if (!item.query || !item.query.trim()) return;
    try {
      const existing = this.getRecentSearches();
      // Remove any prior entry matching the exact module and query
      const filtered = existing.filter(
        (e) => !(e.module === item.module && e.query.toLowerCase().trim() === item.query.toLowerCase().trim() && (e.locality || '') === (item.locality || ''))
      );

      const newItem: RecentSearchItem = {
        id: `${item.module}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        module: item.module,
        query: item.query.trim(),
        locality: item.locality?.trim(),
        timestamp: Date.now(),
      };

      const updated = [newItem, ...filtered].slice(0, MAX_RECENT_SEARCHES);
      localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
      window.dispatchEvent(new CustomEvent('recent-searches-updated'));
    } catch (e) {
      console.warn('Failed to save recent search to localStorage', e);
    }
  },

  removeRecentSearch(id: string): void {
    try {
      const existing = this.getRecentSearches();
      const updated = existing.filter((e) => e.id !== id);
      localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
      window.dispatchEvent(new CustomEvent('recent-searches-updated'));
    } catch (e) {
      console.warn('Failed to remove recent search', e);
    }
  },

  clearRecentSearches(moduleFilter?: 'profiles' | 'authorities' | 'localities' | 'guide'): void {
    try {
      if (moduleFilter) {
        const existing = this.getRecentSearches();
        const updated = existing.filter((e) => e.module !== moduleFilter);
        localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
      } else {
        localStorage.removeItem(RECENT_SEARCHES_KEY);
      }
      window.dispatchEvent(new CustomEvent('recent-searches-updated'));
    } catch (e) {
      console.warn('Failed to clear recent searches', e);
    }
  },

  // --- FAVORITES / FIELD BOOKMARKS ---
  getFavorites(): FavoriteTaxon[] {
    try {
      const raw = localStorage.getItem(FAVORITES_KEY);
      if (!raw) return [];
      const parsed: FavoriteTaxon[] = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  },

  isFavorite(scientificName: string): boolean {
    if (!scientificName) return false;
    const favorites = this.getFavorites();
    const target = scientificName.toLowerCase().trim();
    return favorites.some((f) => f.scientificName.toLowerCase().trim() === target);
  },

  toggleFavorite(profile: TaxonProfile | { scientificName: string; author?: string; commonName?: string; family?: string; localityContext?: string }): boolean {
    try {
      const favorites = this.getFavorites();
      const targetName = profile.scientificName.toLowerCase().trim();
      const exists = favorites.some((f) => f.scientificName.toLowerCase().trim() === targetName);

      let updated: FavoriteTaxon[];
      let isNowFavorite = false;

      if (exists) {
        updated = favorites.filter((f) => f.scientificName.toLowerCase().trim() !== targetName);
        isNowFavorite = false;
      } else {
        const newFav: FavoriteTaxon = {
          scientificName: profile.scientificName.trim(),
          author: profile.author?.trim(),
          commonName: profile.commonName?.trim(),
          family: profile.family?.trim(),
          localityContext: profile.localityContext?.trim(),
          timestamp: Date.now(),
        };
        updated = [newFav, ...favorites];
        isNowFavorite = true;
      }

      localStorage.setItem(FAVORITES_KEY, JSON.stringify(updated));
      window.dispatchEvent(new CustomEvent('favorites-updated'));
      return isNowFavorite;
    } catch (e) {
      console.warn('Failed to update favorites in localStorage', e);
      return false;
    }
  },

  removeFavorite(scientificName: string): void {
    try {
      const favorites = this.getFavorites();
      const updated = favorites.filter((f) => f.scientificName.toLowerCase().trim() !== scientificName.toLowerCase().trim());
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(updated));
      window.dispatchEvent(new CustomEvent('favorites-updated'));
    } catch (e) {
      console.warn('Failed to remove favorite', e);
    }
  },
};
