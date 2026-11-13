import { iNatObservation } from '../types';

const INAT_API_URL = 'https://api.inaturalist.org/v2';

export interface TaxonPhoto {
  url: string;
  attribution: string;
}

export interface LocalityObservation {
  id: number;
  taxonName: string;
  commonName?: string;
  photoUrl: string;
  observedOn?: string;
  placeGuess?: string;
  observer: string;
  attribution: string;
  inatUrl: string;
}

export interface DetailedPlaceMatch {
  id: number;
  name: string;
  display_name: string;
  place_type_name?: string;
  latitude?: number;
  longitude?: number;
  bounding_box?: {
    swlat: number;
    swlng: number;
    nelat: number;
    nelng: number;
  };
}

export interface LocalityObservationsResult {
  observations: LocalityObservation[];
  totalResults: number;
  filterKind: 'boundary' | 'point_radius';
}

export interface QuizGeographicFilter {
  placeId?: number;
  lat?: number;
  lng?: number;
  radiusKm?: number;
}

function extractBoundingBoxFromGeoJson(geojson: any): DetailedPlaceMatch['bounding_box'] | undefined {
  const coords = geojson?.coordinates?.[0];
  if (!Array.isArray(coords) || coords.length === 0) return undefined;
  let swlat = Infinity;
  let swlng = Infinity;
  let nelat = -Infinity;
  let nelng = -Infinity;
  for (const pt of coords) {
    if (!Array.isArray(pt) || pt.length < 2) continue;
    const lng = Number(pt[0]);
    const lat = Number(pt[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (lat < swlat) swlat = lat;
    if (lat > nelat) nelat = lat;
    if (lng < swlng) swlng = lng;
    if (lng > nelng) nelng = lng;
  }
  if (!Number.isFinite(swlat) || !Number.isFinite(nelat) || !Number.isFinite(swlng) || !Number.isFinite(nelng)) {
    return undefined;
  }
  return { swlat, swlng, nelat, nelng };
}

// Simple in-memory cache to prevent redundant API queries
const photoCache: Record<string, { url: string; attribution: string; originalUrl: string } | null> = {};

export function cleanAttribution(attribution: string | null | undefined, licenseCode?: string): string {
  if (!attribution) return 'Unknown Photographer';
  
  let cleaned = attribution;

  // 1. Remove "uploaded by..." clauses (inside parentheses or comma-separated)
  cleaned = cleaned
    .replace(/,\s*uploaded\s+by\s+[^\)\,\;\n]+/i, '')
    .replace(/\(\s*uploaded\s+by\s+[^\)\,\;\n]+\)/i, '')
    .replace(/uploaded\s+by\s+[^\)\,\;\n]+/i, '');

  // 2. Remove standard copyright headers and symbols
  // Match "(c)", "(C)", "©", "copyright", "Copyright", "Copyright (c)", "© (c)"
  cleaned = cleaned
    .replace(/©/g, '')
    .replace(/\(c\)/gi, '')
    .replace(/\bcopyright\b/gi, '')
    .trim();

  // 3. Remove rights reserved statements
  cleaned = cleaned
    .replace(/\b(?:some|all|no)\s+rights\s+reserved\b/gi, '')
    .replace(/\bpublic\s+domain\b/gi, '')
    .trim();

  // 4. Remove parenthetical CC licenses and variations like "(CC )", "(CC-BY-NC)", "(CC BY)", etc.
  cleaned = cleaned
    .replace(/\s*[\(\[]\s*cc[-a-z0-9\.\s]*\s*[\)\]]/gi, '') // matches "(CC-BY-NC)", "(CC )", "[cc-by]", etc.
    .replace(/\s*[\(\[]\s*creative\s+commons[-a-z0-9\.\s]*\s*[\)\]]/gi, '')
    .replace(/\bcc[-a-z0-9\.]*\b/gi, '') // matches standalone "cc-by-nc"
    .replace(/\bcreative\s+commons\b/gi, '')
    .trim();

  // 5. Clean up any leftover punctuation or nested spaces
  // This removes duplicate commas, trailing/leading commas, dashes, slashes, or periods.
  cleaned = cleaned
    .replace(/[\s,\-\.\/]+$/, '') // trailing punctuation
    .replace(/^[\s,\-\.\/]+/, '') // leading punctuation
    .replace(/\s*,\s*,/g, ',')    // duplicate commas
    .replace(/\s+/g, ' ')         // multiple spaces
    .trim();

  return cleaned || 'Unknown Photographer';
}

export function cleanTaxonNameCandidates(raw: string): string[] {
  if (!raw) return [];
  
  // 1. Strip HTML tags, markdown formatting, quotes, and parenthetical annotations
  let str = raw
    .replace(/<[^>]*>/g, '')
    .replace(/[\*\_\"\'\`]/g, '')
    .replace(/\([^\)]*\)/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .trim();

  const candidates: string[] = [];

  // 2. Infraspecific pattern: e.g. "Carex flacca Schreb. subsp. flacca" -> "Carex flacca subsp. flacca"
  const infraMatch = str.match(/^([A-Z][a-z]+)\s+([a-z\-]+)(?:[A-Z\.\s\&\(\)]+)?\s+(subsp\.|var\.|f\.)\s+([a-z\-]+)/);
  if (infraMatch) {
    const fullInfra = `${infraMatch[1]} ${infraMatch[2]} ${infraMatch[3]} ${infraMatch[4]}`.trim();
    if (!candidates.includes(fullInfra)) candidates.push(fullInfra);
  }

  // 3. Binomial pattern without author citation: e.g. "Vaccinium arboreum Marsh." -> "Vaccinium arboreum"
  const binomialMatch = str.match(/^([A-Z][a-z]+)\s+([a-z\-]+)/);
  if (binomialMatch) {
    const binomial = `${binomialMatch[1]} ${binomialMatch[2]}`.trim();
    if (!candidates.includes(binomial)) candidates.push(binomial);
  }

  // 4. Uninomial genus / family pattern: e.g. "Vaccinium L." -> "Vaccinium", "Ericaceae Juss." -> "Ericaceae"
  const uninomialMatch = str.match(/^([A-Z][a-z]+)/);
  if (uninomialMatch) {
    const uninomial = uninomialMatch[1].trim();
    if (!candidates.includes(uninomial)) candidates.push(uninomial);
  }

  // 5. Fallback clean string
  if (!candidates.includes(str) && str.length > 0) {
    candidates.push(str);
  }

  return candidates;
}

export const inaturalistService = {
  // 1. Resolve a text query to an iNat Taxon ID
  async getTaxonId(query: string): Promise<number | null> {
    const candidates = cleanTaxonNameCandidates(query);
    for (const term of candidates) {
      try {
        const res = await fetch(`https://api.inaturalist.org/v1/taxa/autocomplete?q=${encodeURIComponent(term)}&per_page=1`);
        if (!res.ok) continue;
        const data = await res.json();
        const first = data.results?.[0];
        if (first?.id) {
          return first.id;
        }
      } catch (e) {
        console.error('Failed to resolve taxon ID for candidate:', term, e);
      }
    }
    return null;
  },

  // 1.5. Fetch official representative photos for a Taxon
  async getTaxonPhotos(taxonName: string): Promise<TaxonPhoto[]> {
    try {
      const taxonId = await this.getTaxonId(taxonName);
      if (!taxonId) return [];

      // Fetch the taxon details, specifically requesting the taxon_photos array
      const fields = '(taxon_photos:(photo:(medium_url:!t,large_url:!t,attribution:!t,license_code:!t)))';
      const detailRes = await fetch(`${INAT_API_URL}/taxa/${taxonId}?fields=${fields}`);
      const detailData = await detailRes.json();
      
      const taxonPhotos = detailData.results?.[0]?.taxon_photos || [];
      
      // Map and filter the iNat photo objects to our clean interface (Creative Commons / Open Licenses)
      return taxonPhotos
        .filter((tp: any) => tp?.photo?.license_code !== null && tp?.photo?.license_code !== undefined)
        .map((tp: any) => {
          const rawUrl = tp.photo.large_url || tp.photo.medium_url || tp.photo.url || '';
          const highResUrl = rawUrl.replace('medium', 'large').replace('square', 'large');
          return {
            url: highResUrl,
            attribution: `${cleanAttribution(tp.photo.attribution, tp.photo.license_code)} (${tp.photo.license_code.toUpperCase()})`
          };
        });
    } catch (e) {
      console.error("Failed to fetch taxon photos from iNaturalist", e);
      return [];
    }
  },

  // 2. Fetch a batch of Research Grade observations with photos (supports place boundary or coordinate radius)
  async getQuizObservations(
    taxonId: number,
    perPage: number = 10,
    geoFilter?: number | QuizGeographicFilter
  ): Promise<iNatObservation[]> {
    // Using RISON to request only the fields we need to save bandwidth
    const fields = '(id:!t,taxon:(name:!t,preferred_common_name:!t),photos:(url:!t,attribution:!t,license_code:!t),user:(login:!t))';
    const filter: QuizGeographicFilter =
      typeof geoFilter === 'number' ? { placeId: geoFilter } : geoFilter || {};
    const hasGeoFilter = Boolean(
      filter.placeId || (typeof filter.lat === 'number' && typeof filter.lng === 'number')
    );

    // When filtering geographically, results are denser, let's keep random page safer (1 to 3)
    const randomPage = hasGeoFilter ? Math.floor(Math.random() * 3) + 1 : Math.floor(Math.random() * 8) + 1;

    const buildGeoParams = () => {
      if (filter.placeId) return `&place_id=${filter.placeId}`;
      if (typeof filter.lat === 'number' && typeof filter.lng === 'number') {
        return `&lat=${filter.lat}&lng=${filter.lng}&radius=${filter.radiusKm || 35}`;
      }
      return '';
    };

    const geoParams = buildGeoParams();
    const url = `${INAT_API_URL}/observations?taxon_id=${taxonId}&has[]=photos&photo_licensed=true&quality_grade=research&per_page=${perPage}&page=${randomPage}&fields=${fields}${geoParams}`;

    const res = await fetch(url, {
      headers: { 'Accept': 'application/json' }
    });
    
    if (!res.ok) {
      // Retry page 1 if the random page was out of bounds
      if (randomPage > 1) {
        const fallBackUrl = `${INAT_API_URL}/observations?taxon_id=${taxonId}&has[]=photos&photo_licensed=true&quality_grade=research&per_page=${perPage}&page=1&fields=${fields}${geoParams}`;
        const fallbackRes = await fetch(fallBackUrl, { headers: { 'Accept': 'application/json' } });
        if (fallbackRes.ok) {
          const data = await fallbackRes.json();
          return this.mapResults(data.results || []);
        }
      }
      throw new Error('Failed to fetch observations from iNaturalist');
    }
    
    const data = await res.json();
    const mapped = this.mapResults(data.results || []);
    if (mapped.length === 0 && randomPage > 1) {
      const fallBackUrl = `${INAT_API_URL}/observations?taxon_id=${taxonId}&has[]=photos&photo_licensed=true&quality_grade=research&per_page=${perPage}&page=1&fields=${fields}${geoParams}`;
      const fallbackRes = await fetch(fallBackUrl, { headers: { 'Accept': 'application/json' } });
      if (fallbackRes.ok) {
        const fallbackData = await fallbackRes.json();
        return this.mapResults(fallbackData.results || []);
      }
    }
    return mapped;
  },

  mapResults(results: any[]): iNatObservation[] {
    return results
      .map((obs: any) => {
        const licensedPhotos = (obs.photos || [])
          .filter((p: any) => p?.license_code !== null && p?.license_code !== undefined)
          .map((p: any) => ({
            url: (p.url || '').replace('square', 'large'),
            attribution: `${cleanAttribution(p.attribution, p.license_code)} (${p.license_code.toUpperCase()})`
          }));
        return {
          id: obs.id,
          taxon: {
            name: obs.taxon?.name || 'Unknown',
            preferred_common_name: obs.taxon?.preferred_common_name
          },
          photos: licensedPhotos,
          user: {
            login: obs.user?.login || 'anonymous'
          }
        };
      })
      .filter((obs: any) => obs.photos.length > 0);
  },

  // Search for geographic places on iNaturalist (basic)
  async searchPlaces(query: string): Promise<{ id: number; name: string }[]> {
    const detailed = await this.searchPlacesDetailed(query);
    return detailed.map((p) => ({ id: p.id, name: p.display_name || p.name }));
  },

  // Detailed search returning coordinates, place type, and bounding boxes for Places & flora + Quiz
  async searchPlacesDetailed(query: string): Promise<DetailedPlaceMatch[]> {
    if (!query.trim()) return [];
    try {
      const res = await fetch(
        `https://api.inaturalist.org/v1/places/autocomplete?q=${encodeURIComponent(query.trim())}&per_page=8`
      );
      if (!res.ok) return [];
      const data = await res.json();
      return (data.results || [])
        .map((p: any): DetailedPlaceMatch | null => {
          if (!p?.id || !p?.name) return null;
          let latitude: number | undefined;
          let longitude: number | undefined;
          if (typeof p.location === 'string' && p.location.includes(',')) {
            const [latStr, lngStr] = p.location.split(',');
            const parsedLat = Number(latStr);
            const parsedLng = Number(lngStr);
            if (Number.isFinite(parsedLat) && Number.isFinite(parsedLng)) {
              latitude = parsedLat;
              longitude = parsedLng;
            }
          }
          return {
            id: p.id,
            name: p.name,
            display_name: p.display_name || p.name,
            place_type_name: p.place_type_name || undefined,
            latitude,
            longitude,
            bounding_box: extractBoundingBoxFromGeoJson(p.bounding_box_geojson),
          };
        })
        .filter((p: DetailedPlaceMatch | null): p is DetailedPlaceMatch => p !== null);
    } catch (e) {
      console.error('Error searching detailed iNaturalist places:', e);
      return [];
    }
  },

  // 2.5. Fetch recent Research Grade botanical observations using a resolved boundary OR explicit point radius
  async getRecentLocalityObservations(options: {
    placeId?: number;
    lat?: number;
    lng?: number;
    radiusKm?: number;
    perPage?: number;
  }): Promise<LocalityObservationsResult> {
    const { placeId, lat, lng, radiusKm = 35, perPage = 8 } = options;
    try {
      let url = `https://api.inaturalist.org/v1/observations?iconic_taxa=Plantae&quality_grade=research&order=desc&order_by=observed_on&photos=true&per_page=${perPage}`;
      let filterKind: 'boundary' | 'point_radius' = 'point_radius';

      if (typeof placeId === 'number' && Number.isFinite(placeId)) {
        url += `&place_id=${placeId}`;
        filterKind = 'boundary';
      } else if (typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng)) {
        url += `&lat=${lat}&lng=${lng}&radius=${radiusKm}`;
        filterKind = 'point_radius';
      } else {
        return { observations: [], totalResults: 0, filterKind: 'point_radius' };
      }

      const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
      if (!res.ok) return { observations: [], totalResults: 0, filterKind };
      const data = await res.json();
      const results = data.results || [];
      const totalResults = typeof data.total_results === 'number' ? data.total_results : results.length;

      const observations: LocalityObservation[] = results
        .filter((obs: any) => obs.photos && obs.photos.length > 0 && obs.taxon?.name)
        .map((obs: any) => {
          const firstPhoto = obs.photos[0];
          const rawUrl = firstPhoto.url || '';
          const largeUrl = rawUrl.replace('square', 'medium').replace('small', 'medium');
          return {
            id: obs.id,
            taxonName: obs.taxon?.name || 'Unknown plant',
            commonName: obs.taxon?.preferred_common_name,
            photoUrl: largeUrl,
            observedOn: obs.observed_on || (obs.observed_on_details ? obs.observed_on_details.date : undefined),
            placeGuess: obs.place_guess || undefined,
            observer: obs.user?.login || obs.user?.name || 'Naturalist',
            attribution: cleanAttribution(firstPhoto.attribution, firstPhoto.license_code),
            inatUrl: obs.uri || `https://www.inaturalist.org/observations/${obs.id}`
          };
        });

      return { observations, totalResults, filterKind };
    } catch (e) {
      console.error('Error fetching locality observations:', e);
      return { observations: [], totalResults: 0, filterKind: placeId ? 'boundary' : 'point_radius' };
    }
  },

  // 3. Fetch a single high-quality representative photo for a scientific name (with caching)
  async getRepresentativePhoto(scientificName: string): Promise<{ url: string; attribution: string; originalUrl: string } | null> {
    const rawKey = scientificName.trim();
    if (!rawKey) return null;
    
    if (photoCache[rawKey] !== undefined) {
      return photoCache[rawKey];
    }

    const candidates = cleanTaxonNameCandidates(rawKey);

    for (const cleanTerm of candidates) {
      try {
        // Step 1: Query iNat v1 autocomplete to check for curated taxon default_photo
        const searchUrl = `https://api.inaturalist.org/v1/taxa/autocomplete?q=${encodeURIComponent(cleanTerm)}&per_page=3`;
        const res = await fetch(searchUrl);
        if (res.ok) {
          const data = await res.json();
          const match = (data.results || []).find((t: any) => t.default_photo && t.default_photo.medium_url);
          if (match && match.default_photo) {
            const dp = match.default_photo;
            const rawUrl = dp.large_url || dp.medium_url || dp.url || '';
            const highResUrl = rawUrl.replace('square', 'large').replace('medium', 'large');
            const license = dp.license_code ? `(${dp.license_code.toUpperCase()})` : '';
            const result = {
              url: highResUrl,
              originalUrl: `https://www.inaturalist.org/taxa/${match.id}`,
              attribution: `${cleanAttribution(dp.attribution, dp.license_code)} ${license}`.trim()
            };
            photoCache[rawKey] = result;
            return result;
          }
        }

        // Step 2: Fall back to research-grade observation search if default_photo was not returned
        const taxonId = await this.getTaxonId(cleanTerm);
        if (taxonId) {
          const fields = '(id:!t,photos:(url:!t,attribution:!t,license_code:!t))';
          const obsUrl = `${INAT_API_URL}/observations?taxon_id=${taxonId}&has[]=photos&photo_licensed=true&quality_grade=research&per_page=1&page=1&fields=${fields}`;
          const obsRes = await fetch(obsUrl, { headers: { 'Accept': 'application/json' } });
          if (obsRes.ok) {
            const obsData = await obsRes.json();
            const obs = obsData.results?.[0];
            if (obs && obs.photos && obs.photos.length > 0) {
              const licensedPhotos = obs.photos.filter((p: any) => p?.license_code !== null && p?.license_code !== undefined);
              const p = licensedPhotos[0] || obs.photos[0];
              if (p && p.url) {
                const result = {
                  url: p.url.replace('square', 'large').replace('medium', 'large'),
                  originalUrl: `https://www.inaturalist.org/observations/${obs.id}`,
                  attribution: `${cleanAttribution(p.attribution, p.license_code)} (${(p.license_code || 'CC').toUpperCase()})`
                };
                photoCache[rawKey] = result;
                return result;
              }
            }
          }
        }
      } catch (e) {
        console.error('Error fetching representative photo for:', cleanTerm, e);
      }
    }

    photoCache[rawKey] = null;
    return null;
  }
};
