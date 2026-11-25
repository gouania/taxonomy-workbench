const CACHE_PREFIX = 'taxonomica_v1_';
const TTL = 24 * 60 * 60 * 1000; // 24 hours

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

// Starts null until verified against the active server configuration (/api/config or
// X-Taxonomy-Cache-Namespace header). Unverified state safely bypasses AI cache reads
// so stale entries from a compiled default namespace can never be served.
let runtimeNamespace: string | null = null;

function resolveEffectiveNamespace(namespaceOverride?: string | null): string | null {
  const override = typeof namespaceOverride === 'string' ? namespaceOverride.trim() : '';
  if (override) return override;
  return runtimeNamespace;
}

function buildStorageKey(key: string, namespace: string): string {
  return `${CACHE_PREFIX}${namespace}::${key}`;
}

export const cacheService = {
  getRuntimeNamespace(): string | null {
    return runtimeNamespace;
  },

  isNamespaceVerified(): boolean {
    return runtimeNamespace !== null;
  },

  setRuntimeNamespace(namespace: string): void {
    const trimmed = typeof namespace === 'string' ? namespace.trim() : '';
    if (trimmed) {
      runtimeNamespace = trimmed;
    }
  },

  resetRuntimeNamespace(): void {
    runtimeNamespace = null;
  },

  get<T>(key: string, namespaceOverride?: string | null): T | null {
    try {
      const effectiveNamespace = resolveEffectiveNamespace(namespaceOverride);
      if (!effectiveNamespace) return null;

      const storageKey = buildStorageKey(key, effectiveNamespace);
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

  set<T>(key: string, data: T, namespaceOverride?: string | null): void {
    try {
      const effectiveNamespace = resolveEffectiveNamespace(namespaceOverride);
      if (!effectiveNamespace) return;

      const entry: CacheEntry<T> = {
        data,
        timestamp: Date.now(),
      };
      localStorage.setItem(buildStorageKey(key, effectiveNamespace), JSON.stringify(entry));
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
