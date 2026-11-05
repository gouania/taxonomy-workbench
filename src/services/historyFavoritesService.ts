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

  // --- SAVED COMPLETE GUIDES (Saved on this device) ---
  getSavedGuides(): any[] {
    try {
      const raw = localStorage.getItem('taxonomy_workbench_saved_guides_v1');
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  },

  saveGuide(savedGuide: {
    title: string;
    target_taxon: string;
    target_locality: string;
    guide: any;
    sources?: any[];
    activeFilters?: string[];
    coverageScope?: string;
  }): string {
    try {
      const guides = this.getSavedGuides();
      const id = `guide_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      // Check if an existing guide for the exact same taxon & locality exists, replace or prepend
      const filtered = guides.filter(
        (g) =>
          !(
            g.target_taxon.toLowerCase().trim() === savedGuide.target_taxon.toLowerCase().trim() &&
            g.target_locality.toLowerCase().trim() === savedGuide.target_locality.toLowerCase().trim()
          )
      );
      const newEntry = {
        ...savedGuide,
        id,
        timestamp: Date.now(),
      };
      const updated = [newEntry, ...filtered].slice(0, 20); // keep up to 20 saved guides
      localStorage.setItem('taxonomy_workbench_saved_guides_v1', JSON.stringify(updated));
      window.dispatchEvent(new CustomEvent('saved-guides-updated'));
      return id;
    } catch (e) {
      console.warn('Failed to save guide to localStorage', e);
      return '';
    }
  },

  removeSavedGuide(id: string): void {
    try {
      const guides = this.getSavedGuides();
      const updated = guides.filter((g) => g.id !== id);
      localStorage.setItem('taxonomy_workbench_saved_guides_v1', JSON.stringify(updated));
      window.dispatchEvent(new CustomEvent('saved-guides-updated'));
    } catch (e) {
      console.warn('Failed to remove saved guide', e);
    }
  },
};

