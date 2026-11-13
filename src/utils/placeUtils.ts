import { LocalityProfile, PlaceRef, PlaceScopeType } from '../types';
import { DetailedPlaceMatch } from '../services/inaturalistService';

export interface ParsedCoordinates {
  latitude?: number;
  longitude?: number;
  formattedDms?: string;
  error?: string;
}

/**
 * Detects whether a user entered geographic coordinates (decimal or cardinal)
 * and validates lat [-90, 90], lng [-180, 180].
 */
export function parseCoordinateQuery(raw: string): ParsedCoordinates | null {
  const input = raw.trim();
  if (!input) return null;

  // Match simple decimal pair: "51.5074, -0.1278" or "37.9235 -122.5965"
  const decimalMatch = input.match(
    /^([+-]?\d+(?:\.\d+)?)\s*°?\s*[,\s]\s*([+-]?\d+(?:\.\d+)?)\s*°?$/
  );
  if (decimalMatch) {
    const lat = Number(decimalMatch[1]);
    const lng = Number(decimalMatch[2]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return {
        error:
          'Invalid coordinates: latitude must be between -90 and 90, and longitude between -180 and 180.',
      };
    }
    return {
      latitude: lat,
      longitude: lng,
      formattedDms: formatDecimalAsCardinal(lat, lng),
    };
  }

  // Match cardinal decimal pair: "51.5074° N, 0.1278° W" or "37.92 N 122.59 W"
  const cardinalMatch = input.match(
    /^(\d+(?:\.\d+)?)\s*°?\s*([NS])\s*[,\s]\s*(\d+(?:\.\d+)?)\s*°?\s*([EW])$/i
  );
  if (cardinalMatch) {
    const rawLat = Number(cardinalMatch[1]);
    const latDir = cardinalMatch[2].toUpperCase();
    const rawLng = Number(cardinalMatch[3]);
    const lngDir = cardinalMatch[4].toUpperCase();
    const lat = latDir === 'S' ? -rawLat : rawLat;
    const lng = lngDir === 'W' ? -rawLng : rawLng;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return {
        error:
          'Invalid coordinates: latitude must be between 0° and 90°, and longitude between 0° and 180°.',
      };
    }
    return {
      latitude: lat,
      longitude: lng,
      formattedDms: formatDecimalAsCardinal(lat, lng),
    };
  }

  return null;
}

export function formatDecimalAsCardinal(lat: number, lng: number): string {
  const latStr = `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? 'N' : 'S'}`;
  const lngStr = `${Math.abs(lng).toFixed(4)}° ${lng >= 0 ? 'E' : 'W'}`;
  return `${latStr}, ${lngStr}`;
}

export function inferScopeTypeFromInatPlace(placeTypeName?: string): PlaceScopeType {
  const pt = (placeTypeName || '').toLowerCase();
  if (pt.includes('town') || pt.includes('city') || pt.includes('municipality')) return 'city';
  if (
    pt.includes('country') ||
    pt.includes('state') ||
    pt.includes('continent') ||
    pt.includes('province') ||
    pt.includes('region') ||
    pt.includes('county')
  ) {
    return 'region';
  }
  if (pt.includes('park') || pt.includes('open space') || pt.includes('reserve')) return 'locality';
  if (pt.includes('mountain') || pt.includes('peak') || pt.includes('terrain')) return 'mountain';
  return 'locality';
}

export interface PlaceAmbiguityAssessment {
  isAmbiguous: boolean;
  bestMatch: DetailedPlaceMatch | null;
  candidates: DetailedPlaceMatch[];
}

/**
 * Checks whether an unqualified place query matches multiple distinct places
 * (e.g. "Cambridge" -> Cambridge, Cambridgeshire, GB vs Cambridge, MA, US;
 * "Springfield" -> Springfield, IL vs Springfield, MO).
 */
export function assessPlaceAmbiguity(
  query: string,
  matches: DetailedPlaceMatch[]
): PlaceAmbiguityAssessment {
  const trimmed = query.trim();
  if (!trimmed || matches.length === 0) {
    return { isAmbiguous: false, bestMatch: null, candidates: [] };
  }

  // Deduplicate by ID and display_name
  const deduped: DetailedPlaceMatch[] = [];
  const seenNames = new Set<string>();
  for (const m of matches) {
    const key = (m.display_name || m.name || '').trim().toLowerCase();
    if (!key || seenNames.has(key)) continue;
    seenNames.add(key);
    deduped.push(m);
  }

  // Coordinate inputs or already-qualified queries (contain a comma, e.g. "Cambridge, MA") are not treated as ambiguous prompts
  const isQualified = trimmed.includes(',') || Boolean(parseCoordinateQuery(trimmed));
  if (isQualified) {
    return {
      isAmbiguous: false,
      bestMatch: deduped[0] || null,
      candidates: deduped.slice(0, 5),
    };
  }

  const normQuery = trimmed.toLowerCase();
  const exactNameMatches = deduped.filter(
    (m) => (m.name || '').trim().toLowerCase() === normQuery
  );

  // If 2+ distinct geographic places share the exact same unqualified name, ask user to pick
  if (exactNameMatches.length >= 2) {
    return {
      isAmbiguous: true,
      bestMatch: null,
      candidates: exactNameMatches.slice(0, 5),
    };
  }

  return {
    isAmbiguous: false,
    bestMatch: deduped[0] || null,
    candidates: deduped.slice(0, 5),
  };
}

export function buildPlaceRefFromProfile(
  profile: LocalityProfile,
  options?: {
    resolvedInatMatch?: DetailedPlaceMatch | null;
    isCoordinateQuery?: boolean;
  }
): PlaceRef {
  const inatMatch = options?.resolvedInatMatch || null;
  const lat =
    typeof profile.location_details.latitude === 'number'
      ? profile.location_details.latitude
      : inatMatch?.latitude;
  const lng =
    typeof profile.location_details.longitude === 'number'
      ? profile.location_details.longitude
      : inatMatch?.longitude;

  const scopeType: PlaceScopeType = options?.isCoordinateQuery
    ? 'point'
    : profile.location_details.scope_type ||
      (inatMatch ? inferScopeTypeFromInatPlace(inatMatch.place_type_name) : 'locality');

  return {
    displayName: inatMatch?.display_name || profile.location_details.resolved_name,
    scopeType,
    geographicScopeSummary: profile.location_details.geographic_scope_summary,
    coordinates:
      typeof lat === 'number' && typeof lng === 'number' && !Number.isNaN(lat) && !Number.isNaN(lng)
        ? {
            latitude: lat,
            longitude: lng,
            coordinatesDms:
              profile.location_details.coordinates_dms || formatDecimalAsCardinal(lat, lng),
          }
        : undefined,
    boundaryReference: inatMatch
      ? inatMatch.display_name
      : typeof lat === 'number' && typeof lng === 'number'
      ? `35 km radius around ${lat.toFixed(4)}, ${lng.toFixed(4)}`
      : undefined,
    boundingBox: inatMatch?.bounding_box,
    providerPlaceId: inatMatch?.id,
    providerPlaceName: inatMatch?.display_name,
    availableHabitats: profile.botanical_overview?.principal_habitats?.map((h) => h.name) || [],
  };
}

export function getObservationFilterSummary(place: PlaceRef): {
  mode: 'boundary' | 'point_radius' | 'none';
  badgeLabel: string;
  explanation: string;
  isCentrePointFallback: boolean;
} {
  if (place.providerPlaceId) {
    return {
      mode: 'boundary',
      badgeLabel: `Within resolved iNaturalist boundary: ${place.providerPlaceName || place.displayName}`,
      explanation: `Filtered by the iNaturalist place boundary for ${place.providerPlaceName || place.displayName}.`,
      isCentrePointFallback: false,
    };
  }

  if (place.coordinates) {
    const coordText = `${place.coordinates.latitude.toFixed(4)}°, ${place.coordinates.longitude.toFixed(4)}°`;
    if (place.scopeType === 'region') {
      return {
        mode: 'point_radius',
        badgeLabel: `Within 35 km of centre point (${coordText})`,
        explanation: `Only a centre-point sample is available because an iNaturalist boundary could not be matched for this region. These records show observations within 35 km of ${coordText}, not throughout ${place.displayName}.`,
        isCentrePointFallback: true,
      };
    }

    return {
      mode: 'point_radius',
      badgeLabel: `Within 35 km of this point (${coordText})`,
      explanation: `Sampled within 35 km of ${coordText}.`,
      isCentrePointFallback: false,
    };
  }

  return {
    mode: 'none',
    badgeLabel: 'No geographic coordinates or boundary available',
    explanation: 'No coordinates or iNaturalist boundary were resolved for fetching local observation records.',
    isCentrePointFallback: false,
  };
}

export function getMapBboxForPlace(place: PlaceRef): string | null {
  if (place.boundingBox) {
    const { swlng, swlat, nelng, nelat } = place.boundingBox;
    if (
      Number.isFinite(swlng) &&
      Number.isFinite(swlat) &&
      Number.isFinite(nelng) &&
      Number.isFinite(nelat) &&
      nelng > swlng &&
      nelat > swlat
    ) {
      return `${swlng},${swlat},${nelng},${nelat}`;
    }
  }

  if (!place.coordinates) return null;
  const { latitude, longitude } = place.coordinates;
  let delta = 0.08;
  if (place.scopeType === 'point') delta = 0.05;
  else if (place.scopeType === 'city') delta = 0.1;
  else if (place.scopeType === 'region') delta = 0.45;
  else if (place.scopeType === 'mountain') delta = 0.09;

  return `${longitude - delta},${latitude - delta},${longitude + delta},${latitude + delta}`;
}
