import {
  GEMINI_MODEL,
  GEMINI_THINKING_LEVEL,
  PROMPT_SCHEMA_VERSION,
  buildCacheNamespace,
} from '../constants';

const CACHE_PREFIX = 'taxonomica_v1_';
const TTL = 24 * 60 * 60 * 1000; // 24 hours

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const DEFAULT_CACHE_NAMESPACE = buildCacheNamespace(
  GEMINI_MODEL,
  GEMINI_THINKING_LEVEL,
  PROMPT_SCHEMA_VERSION
);

let runtimeNamespace = DEFAULT_CACHE_NAMESPACE;

function buildStorageKey(key: string): string {
  return `${CACHE_PREFIX}${runtimeNamespace}::${key}`;
}

export const cacheService = {
  getRuntimeNamespace(): string {
    return runtimeNamespace;
  },

  setRuntimeNamespace(namespace: string): void {
    const trimmed = typeof namespace === 'string' ? namespace.trim() : '';
    if (trimmed) {
      runtimeNamespace = trimmed;
    }
  },

  resetRuntimeNamespace(): void {
    runtimeNamespace = DEFAULT_CACHE_NAMESPACE;
  },

  get<T>(key: string): T | null {
    try {
      const storageKey = buildStorageKey(key);
      const item = localStorage.getItem(storageKey);
      if (!item) return null;

      const entry: CacheEntry<T> = JSON.parse(item);
      if (Date.now() - entry.timestamp > TTL) {
        localStorage.removeItem(storageKey);
        return null;
      }

      return entry.data;
    } catch (e) {
      console.warn('Cache read failed', e);
      return null;
    }
  },

  set<T>(key: string, data: T): void {
    try {
      const entry: CacheEntry<T> = {
        data,
        timestamp: Date.now(),
      };
      localStorage.setItem(buildStorageKey(key), JSON.stringify(entry));
    } catch (e) {
      console.warn('Cache write failed, possibly quota exceeded', e);
    }
  },

  clear(): void {
    try {
      Object.keys(localStorage).forEach((key) => {
        if (key.startsWith(CACHE_PREFIX)) {
          localStorage.removeItem(key);
        }
      });
    } catch (e) {
      console.warn('Cache clear failed', e);
    }
  },
};
