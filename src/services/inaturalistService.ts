import { iNatObservation } from '../types';

const INAT_API_URL = 'https://api.inaturalist.org/v2';

export interface TaxonPhoto {
  url: string;
  attribution: string;
}

// Simple in-memory cache to prevent redundant API queries
const photoCache: Record<string, { url: string; attribution: string; originalUrl: string } | null> = {};

export function cleanAttribution(attribution: string | null | undefined): string {
  if (!attribution) return 'Unknown Photographer';
  let cleaned = attribution
    .replace(/,\s*uploaded\s+by\s+[^\)\,\;\n]+/i, '')
    .replace(/\(\s*uploaded\s+by\s+[^\)\,\;\n]+\)/i, '')
    .replace(/uploaded\s+by\s+[^\)\,\;\n]+/i, '')
    .trim();
  cleaned = cleaned.replace(/,\s*$/, '').trim();
  return cleaned;
}

export const inaturalistService = {
  // 1. Resolve a text query to an iNat Taxon ID
  async getTaxonId(query: string): Promise<number | null> {
    const res = await fetch(`${INAT_API_URL}/taxa/autocomplete?q=${encodeURIComponent(query)}&per_page=1`);
    const data = await res.json();
    return data.results?.[0]?.id || null;
  },

  // 1.5. Fetch official representative photos for a Taxon
  async getTaxonPhotos(taxonName: string): Promise<TaxonPhoto[]> {
    try {
      // Step 1: Search for the taxon by name to get its exact iNat ID
      const searchRes = await fetch(`${INAT_API_URL}/taxa?q=${encodeURIComponent(taxonName)}&per_page=1`);
      const searchData = await searchRes.json();
      const taxonId = searchData.results?.[0]?.id;
      
      if (!taxonId) return [];

      // Step 2: Fetch the taxon details, specifically requesting the taxon_photos array
      // We use medium_url for high-quality display, falling back to large if needed
      const fields = '(taxon_photos:(photo:(medium_url:!t,large_url:!t,attribution:!t)))';
      const detailRes = await fetch(`${INAT_API_URL}/taxa/${taxonId}?fields=${fields}`);
      const detailData = await detailRes.json();
      
      const taxonPhotos = detailData.results?.[0]?.taxon_photos || [];
      
      // Map the iNat photo objects to our clean interface
      return taxonPhotos.map((tp: any) => ({
        url: tp.photo.medium_url || tp.photo.large_url || tp.photo.url,
        attribution: cleanAttribution(tp.photo.attribution)
      }));
    } catch (e) {
      console.error("Failed to fetch taxon photos from iNaturalist", e);
      return [];
    }
  },

  // 2. Fetch a batch of Research Grade observations with photos
  async getQuizObservations(taxonId: number, perPage: number = 10, placeId?: number): Promise<iNatObservation[]> {
    // Using RISON to request only the fields we need to save bandwidth
    const fields = '(id:!t,taxon:(name:!t,preferred_common_name:!t),photos:(url:!t,attribution:!t),user:(login:!t))';
    
    // When filtering geographically, results are denser, let's keep random page safer (1 to 4)
    const randomPage = placeId ? Math.floor(Math.random() * 3) + 1 : Math.floor(Math.random() * 8) + 1;

    let url = `${INAT_API_URL}/observations?taxon_id=${taxonId}&has[]=photos&quality_grade=research&per_page=${perPage}&page=${randomPage}&fields=${fields}`;
    
    if (placeId) {
      url += `&place_id=${placeId}`;
    }

    const res = await fetch(url, {
      headers: { 'Accept': 'application/json' }
    });
    
    if (!res.ok) {
      // Retry page 1 if the random page was out of bounds
      if (randomPage > 1) {
        const fallBackUrl = `${INAT_API_URL}/observations?taxon_id=${taxonId}&has[]=photos&quality_grade=research&per_page=${perPage}&page=1&fields=${fields}${placeId ? `&place_id=${placeId}` : ''}`;
        const fallbackRes = await fetch(fallBackUrl, { headers: { 'Accept': 'application/json' } });
        if (fallbackRes.ok) {
          const data = await fallbackRes.json();
          return this.mapResults(data.results || []);
        }
      }
      throw new Error('Failed to fetch observations from iNaturalist');
    }
    
    const data = await res.json();
    return this.mapResults(data.results || []);
  },

  mapResults(results: any[]): iNatObservation[] {
    return results.map((obs: any) => ({
      id: obs.id,
      taxon: {
        name: obs.taxon?.name || 'Unknown',
        preferred_common_name: obs.taxon?.preferred_common_name
      },
      photos: (obs.photos || []).map((p: any) => ({
        url: (p.url || '').replace('square', 'large'),
        attribution: cleanAttribution(p.attribution)
      })),
      user: {
        login: obs.user?.login || 'anonymous'
      }
    }));
  },

  // Search for geographic places on iNaturalist
  async searchPlaces(query: string): Promise<{ id: number; name: string }[]> {
    if (!query.trim()) return [];
    try {
      const res = await fetch(`${INAT_API_URL}/places/autocomplete?q=${encodeURIComponent(query)}&per_page=5`);
      if (!res.ok) return [];
      const data = await res.json();
      return (data.results || []).map((p: any) => ({
        id: p.id,
        name: p.display_name || p.name
      }));
    } catch (e) {
      console.error('Error searching iNaturalist places:', e);
      return [];
    }
  },

  // 3. Fetch a single high-quality representative photo for a scientific name (with caching)
  async getRepresentativePhoto(scientificName: string): Promise<{ url: string; attribution: string; originalUrl: string } | null> {
    const cleanName = scientificName.trim().replace(/[\*\_\(\)]/g, ''); // strip markdown descriptors
    if (photoCache[cleanName] !== undefined) {
      return photoCache[cleanName];
    }

    try {
      const taxonId = await this.getTaxonId(cleanName);
      if (!taxonId) {
        photoCache[cleanName] = null;
        return null;
      }

      const fields = '(id:!t,photos:(url:!t,attribution:!t))';
      const url = `${INAT_API_URL}/observations?taxon_id=${taxonId}&has[]=photos&quality_grade=research&per_page=1&page=1&fields=${fields}`;
      const res = await fetch(url, {
        headers: { 'Accept': 'application/json' }
      });
      if (!res.ok) return null;

      const data = await res.json();
      const obs = data.results?.[0];
      if (!obs || !obs.photos || obs.photos.length === 0) {
        photoCache[cleanName] = null;
        return null;
      }

      const p = obs.photos[0];
      const result = {
        url: (p.url || '').replace('square', 'large'),
        originalUrl: `https://www.inaturalist.org/observations/${obs.id}`,
        attribution: cleanAttribution(p.attribution)
      };
      
      photoCache[cleanName] = result;
      return result;
    } catch (e) {
      console.error('Error fetching representative photo for:', cleanName, e);
      return null;
    }
  }
};
