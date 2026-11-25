import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {
  GEMINI_MODEL,
  GEMINI_THINKING_LEVEL,
  PROMPT_SCHEMA_VERSION,
  buildCacheNamespace,
} from '../src/constants';
import { cacheService } from '../src/services/cacheService';
import { historyFavoritesService } from '../src/services/historyFavoritesService';
import { getRuntimeCacheConfig } from '../server/gemini';
import { createApp } from '../server';

function installMockBrowserStorage() {
  const store = new Map<string, string>();
  const mockLocalStorage = {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };

  // Support Object.keys(localStorage) used in cacheService.clear()
  const proxy = new Proxy(mockLocalStorage, {
    ownKeys() {
      return Array.from(store.keys());
    },
    getOwnPropertyDescriptor(_target, prop) {
      if (typeof prop === 'string' && store.has(prop)) {
        return { enumerable: true, configurable: true, value: store.get(prop) };
      }
      return undefined;
    },
  });

  const prevLocalStorage = (globalThis as any).localStorage;
  const prevWindow = (globalThis as any).window;
  (globalThis as any).localStorage = proxy;
  (globalThis as any).window = {
    dispatchEvent: () => true,
  };

  return {
    store,
    restore() {
      cacheService.resetRuntimeNamespace();
      if (prevLocalStorage === undefined) delete (globalThis as any).localStorage;
      else (globalThis as any).localStorage = prevLocalStorage;
      if (prevWindow === undefined) delete (globalThis as any).window;
      else (globalThis as any).window = prevWindow;
    },
  };
}

function listenEphemeral(app: import('express').Express): Promise<{ server: http.Server; baseUrl: string }> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        reject(new Error('Failed to obtain bound server address'));
        return;
      }
      resolve({ server, baseUrl: `http://127.0.0.1:${addr.port}` });
    });
    server.on('error', reject);
  });
}

function closeServer(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

test('getRuntimeCacheConfig encodes active server model, thinking level, and prompt/schema version', () => {
  const defaultCfg = getRuntimeCacheConfig(undefined, undefined);
  assert.equal(defaultCfg.model, GEMINI_MODEL);
  assert.equal(defaultCfg.thinkingLevel, GEMINI_THINKING_LEVEL);
  assert.equal(defaultCfg.promptSchemaVersion, PROMPT_SCHEMA_VERSION);
  assert.equal(
    defaultCfg.cacheNamespace,
    buildCacheNamespace(GEMINI_MODEL, GEMINI_THINKING_LEVEL, PROMPT_SCHEMA_VERSION)
  );

  const modelOverride = getRuntimeCacheConfig('gemini-2.5-pro', 'HIGH', 'v2');
  assert.equal(modelOverride.cacheNamespace, 'gemini-2.5-pro_HIGH_v2');
  assert.notEqual(modelOverride.cacheNamespace, defaultCfg.cacheNamespace);
});

test('cacheService invalidates cached AI responses when model, thinking level, or prompt/schema version changes, while preserving saved guides, bookmarks, and recent searches', () => {
  const env = installMockBrowserStorage();
  try {
    // Seed user data (bookmarks, recent searches, saved guides)
    historyFavoritesService.toggleFavorite({
      scientificName: 'Quercus robur',
      author: 'L.',
      commonName: 'Pedunculate Oak',
      family: 'Fagaceae',
    });
    historyFavoritesService.addRecentSearch({
      module: 'profiles',
      query: 'Quercus robur',
    });
    const savedGuideId = historyFavoritesService.saveGuide({
      title: 'Quercus in Southern England',
      target_taxon: 'Quercus',
      target_locality: 'Southern England',
      guide: { species_profiles: [] },
    });
    assert.ok(savedGuideId);

    // Cache a response under default namespace (gemini-4-hydrogen / MEDIUM / v1)
    cacheService.setRuntimeNamespace(buildCacheNamespace('gemini-4-hydrogen', 'MEDIUM', 'v1'));
    cacheService.set('profiles_single_quercus_robur', { scientificName: 'Quercus robur', rev: 1 });
    assert.deepEqual(cacheService.get('profiles_single_quercus_robur'), {
      scientificName: 'Quercus robur',
      rev: 1,
    });

    // 1. Server overrides GEMINI_MODEL -> cache miss (invalidated)
    cacheService.setRuntimeNamespace(buildCacheNamespace('gemini-2.5-pro', 'MEDIUM', 'v1'));
    assert.equal(cacheService.get('profiles_single_quercus_robur'), null);

    // 2. Server overrides GEMINI_THINKING_LEVEL -> cache miss (invalidated)
    cacheService.setRuntimeNamespace(buildCacheNamespace('gemini-4-hydrogen', 'HIGH', 'v1'));
    assert.equal(cacheService.get('profiles_single_quercus_robur'), null);

    // 3. Prompt/schema version bumps (v1 -> v2) -> cache miss (invalidated)
    cacheService.setRuntimeNamespace(buildCacheNamespace('gemini-4-hydrogen', 'MEDIUM', 'v2'));
    assert.equal(cacheService.get('profiles_single_quercus_robur'), null);

    // Clearing AI cache never deletes user bookmarks, recent searches, or saved guides
    cacheService.clear();
    assert.equal(historyFavoritesService.getFavorites().length, 1);
    assert.equal(historyFavoritesService.getFavorites()[0].scientificName, 'Quercus robur');
    assert.equal(historyFavoritesService.getRecentSearches('profiles').length, 1);
    assert.equal(historyFavoritesService.getSavedGuides().length, 1);
    assert.equal(historyFavoritesService.getSavedGuides()[0].id, savedGuideId);
  } finally {
    env.restore();
  }
});

test('GET /api/config and POST /api/gemini expose active server cache namespace reflecting env overrides without leaking secrets', async () => {
  const prevModel = process.env.GEMINI_MODEL;
  const prevThinking = process.env.GEMINI_THINKING_LEVEL;
  process.env.GEMINI_MODEL = 'gemini-4-hydrogen-custom';
  process.env.GEMINI_THINKING_LEVEL = 'HIGH';

  const app = await createApp({ nodeEnv: 'production', skipFrontend: true });
  const { server, baseUrl } = await listenEphemeral(app);
  try {
    const cfgRes = await fetch(`${baseUrl}/api/config`);
    assert.equal(cfgRes.status, 200);
    assert.equal(cfgRes.headers.get('cache-control'), 'no-store');
    const cfgBody = await cfgRes.json();
    assert.deepEqual(cfgBody, {
      model: 'gemini-4-hydrogen-custom',
      thinkingLevel: 'HIGH',
      promptSchemaVersion: PROMPT_SCHEMA_VERSION,
      cacheNamespace: `gemini-4-hydrogen-custom_HIGH_${PROMPT_SCHEMA_VERSION}`,
    });
    assert.equal('apiKey' in cfgBody, false);

    // /api/gemini also emits X-Taxonomy-Cache-Namespace header
    const apiRes = await fetch(`${baseUrl}/api/gemini`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'unknownAction', payload: {} }),
    });
    assert.equal(apiRes.status, 400);
    assert.equal(
      apiRes.headers.get('x-taxonomy-cache-namespace'),
      `gemini-4-hydrogen-custom_HIGH_${PROMPT_SCHEMA_VERSION}`
    );
  } finally {
    await closeServer(server);
    if (prevModel === undefined) delete process.env.GEMINI_MODEL;
    else process.env.GEMINI_MODEL = prevModel;
    if (prevThinking === undefined) delete process.env.GEMINI_THINKING_LEVEL;
    else process.env.GEMINI_THINKING_LEVEL = prevThinking;
  }
});
