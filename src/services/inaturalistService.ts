import { iNatObservation } from '../types';

const INAT_API_URL = 'https://api.inaturalist.org/v2';

// Simple in-memory cache to prevent redundant API queries
const photoCache: Record<string, { url: string; attribution: string; originalUrl: string } | null> = {};

export const inaturalistService = {
  // 1. Resolve a text query to an iNat Taxon ID
  async getTaxonId(query: string): Promise<number | null> {
    const res = await fetch(`${INAT_API_URL}/taxa/autocomplete?q=${encodeURIComponent(query)}&per_page=1`);
    const data = await res.json();
    return data.results?.[0]?.id || null;
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
        url: (p.url || '').replace('square', 'medium'),
        attribution: p.attribution || 'Unknown'
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
        url: (p.url || '').replace('square', 'medium'),
        originalUrl: `https://www.inaturalist.org/observations/${obs.id}`,
        attribution: p.attribution || 'Unknown'
      };
      
      photoCache[cleanName] = result;
      return result;
    } catch (e) {
      console.error('Error fetching representative photo for:', cleanName, e);
      return null;
    }
  }
};
