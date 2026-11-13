import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  parseCoordinateQuery,
  assessPlaceAmbiguity,
  buildPlaceRefFromProfile,
  getObservationFilterSummary,
  getMapBboxForPlace,
} from '../src/utils/placeUtils';
import { validateLocalityProfile } from '../src/utils/guideValidation';
import { LocalityDashboard } from '../src/components/localities/LocalityDashboard';
import { LocalitiesModule } from '../src/components/localities/LocalitiesModule';
import { GuideModule } from '../src/components/guide/GuideModule';
import { ProfilesModule } from '../src/components/profiles/ProfilesModule';
import { IdentifyModule } from '../src/components/identify/IdentifyModule';
import { QuizModule } from '../src/components/quiz/QuizModule';
import { LocalityProfile, PlaceRef } from '../src/types';

function makeCityProfile(): LocalityProfile {
  return {
    location_details: {
      resolved_name: 'Greater London, United Kingdom',
      scope_type: 'city',
      geographic_scope_summary: 'Metropolitan basin of Greater London along the River Thames.',
      coordinates_dms: '51.5074° N, 0.1278° W',
      latitude: 51.5074,
      longitude: -0.1278,
      is_valid_place: true,
    },
    botanical_overview: {
      summary:
        'Urban and peri-urban habitats spanning ancient woodland remnants, chalk downland margins, riverine corridors, and disturbed ruderal pavements.',
      principal_habitats: [
        {
          name: 'Lowland Oak-Hornbeam Woodland',
          summary: 'Fragments such as Epping and Hampstead Heath woodlands.',
        },
        {
          name: 'Thames Riparian & Wetland Margins',
          summary: 'Tidal mudflats, reedbeds, and floodplain meadows.',
        },
      ],
    },
    characteristic_plants: [
      {
        scientific_name: 'Quercus robur',
        common_name: 'Pedunculate Oak',
        growth_form: 'Deciduous tree',
        habitat_association: 'Ancient woodland remnants & parks',
        regional_status: 'Native',
        notes: 'Canopy tree in lowland clay woods.',
      },
      {
        scientific_name: 'quercus robur', // duplicate case to test deduplication
        common_name: 'Pedunculate Oak',
        growth_form: 'Tree',
        habitat_association: 'Woodland',
        regional_status: 'Native',
      },
      {
        scientific_name: 'Buddleja davidii',
        common_name: 'Butterfly-bush',
        growth_form: 'Deciduous shrub',
        habitat_association: 'Urban masonry & disturbed ground',
        regional_status: 'Naturalized introduced',
      },
    ],
    environmental_context: {
      climate: 'Temperate oceanic climate with mild winters and evenly distributed rainfall.',
      soil_and_substrate: 'London Clay, Thames alluvium, and localized plateau gravels.',
    },
    recommended_literature: [
      {
        citation: 'Burton, R. M. (1983). Flora of the London Area. London Natural History Society.',
        type: 'Regional Flora',
        scope: 'Greater London',
      },
    ],
  };
}

function makeMountainProfile(): LocalityProfile {
  return {
    location_details: {
      resolved_name: 'Mount Tamalpais, California',
      scope_type: 'mountain',
      geographic_scope_summary: 'Marin County ridge rising from coastal valleys to East Peak (784 m).',
      coordinates_dms: '37.9235° N, 122.5965° W',
      latitude: 37.9235,
      longitude: -122.5965,
      is_valid_place: true,
    },
    botanical_overview: {
      summary:
        'Steep moisture, fog, and serpentine substrate gradients support coast redwood canyons alongside chaparral and serpentine outcrops.',
      principal_habitats: [
        {
          name: 'Serpentine Chaparral',
          summary: 'Open ultramafic ridges with drought-tolerant evergreen shrubs.',
        },
        {
          name: 'Redwood Canyon Woodland',
          summary: 'Fog-drip shaded ravines along perennial creeks.',
        },
      ],
    },
    characteristic_plants: [
      {
        scientific_name: 'Sequoia sempervirens',
        common_name: 'Coast Redwood',
        growth_form: 'Evergreen conifer',
        habitat_association: 'Fog-belt canyon bottoms',
        regional_status: 'Native',
      },
      {
        scientific_name: 'Calochortus tiburonensis',
        common_name: 'Tiburon Mariposa Lily',
        growth_form: 'Bulbous perennial herb',
        habitat_association: 'Serpentine rocky grasslands nearby',
        regional_status: 'Local endemic',
      },
    ],
    elevation_zones: [
      {
        name: 'Lower Canyon Redwood Belt',
        elevation_range: '50–350 m',
        description: 'Cool fog-sheltered ravines dominated by Sequoia sempervirens and sword ferns.',
        characteristic_taxa: ['Sequoia sempervirens', 'Polystichum munitum'],
      },
      {
        name: 'Upper Serpentine Ridge & Summit Chaparral',
        elevation_range: '400–784 m',
        description: 'Exposed rocky slopes dominated by Arctostaphylos spp. and Ceanothus.',
        characteristic_taxa: ['Arctostaphylos montana'],
      },
    ],
  };
}

test('parseCoordinateQuery handles decimal, cardinal, and invalid coordinates', () => {
  const dec = parseCoordinateQuery('51.5074, -0.1278');
  assert.ok(dec);
  assert.equal(dec.error, undefined);
  assert.equal(dec.latitude, 51.5074);
  assert.equal(dec.longitude, -0.1278);
  assert.match(dec.formattedDms || '', /51\.5074° N, 0\.1278° W/);

  const card = parseCoordinateQuery('37.9235° N, 122.5965° W');
  assert.ok(card);
  assert.equal(card.latitude, 37.9235);
  assert.equal(card.longitude, -122.5965);

  const invalid = parseCoordinateQuery('95.5, -200.1');
  assert.ok(invalid?.error);
  assert.match(invalid.error, /Invalid coordinates/);

  assert.equal(parseCoordinateQuery('Greater London'), null);
});

test('assessPlaceAmbiguity prompts for unqualified ambiguous names and passes qualified names', () => {
  const matches = [
    { id: 101, name: 'Cambridge', display_name: 'Cambridge, Cambridgeshire, GB', place_type_name: 'Town' },
    { id: 102, name: 'Cambridge', display_name: 'Cambridge, MA, US', place_type_name: 'City' },
  ];

  const ambiguous = assessPlaceAmbiguity('Cambridge', matches);
  assert.equal(ambiguous.isAmbiguous, true);
  assert.equal(ambiguous.candidates.length, 2);

  const qualified = assessPlaceAmbiguity('Cambridge, MA', [matches[1]]);
  assert.equal(qualified.isAmbiguous, false);
  assert.equal(qualified.bestMatch?.id, 102);
});

test('getObservationFilterSummary distinguishes boundary, point radius, and broad-region fallback', () => {
  const boundaryPlace: PlaceRef = {
    displayName: 'Greater London, GB',
    scopeType: 'city',
    providerPlaceId: 12345,
    providerPlaceName: 'Greater London, GB',
  };
  const bSummary = getObservationFilterSummary(boundaryPlace);
  assert.equal(bSummary.mode, 'boundary');
  assert.equal(bSummary.isCentrePointFallback, false);
  assert.match(bSummary.badgeLabel, /Within resolved iNaturalist boundary/);

  const pointPlace: PlaceRef = {
    displayName: '51.5074° N, 0.1278° W',
    scopeType: 'point',
    coordinates: { latitude: 51.5074, longitude: -0.1278 },
  };
  const pSummary = getObservationFilterSummary(pointPlace);
  assert.equal(pSummary.mode, 'point_radius');
  assert.equal(pSummary.isCentrePointFallback, false);
  assert.match(pSummary.badgeLabel, /Within 35 km of this point/);

  const regionFallback: PlaceRef = {
    displayName: 'Cerrado biome',
    scopeType: 'region',
    coordinates: { latitude: -14.235, longitude: -47.929 },
  };
  const rSummary = getObservationFilterSummary(regionFallback);
  assert.equal(rSummary.mode, 'point_radius');
  assert.equal(rSummary.isCentrePointFallback, true);
  assert.match(rSummary.explanation, /not throughout Cerrado biome/i);

  assert.ok(getMapBboxForPlace(regionFallback));
});

test('validateLocalityProfile validates city, mountain, and invalid place responses without inventing sections', () => {
  const city = validateLocalityProfile(makeCityProfile());
  assert.equal(city.location_details.scope_type, 'city');
  assert.equal(city.characteristic_plants.length, 2); // deduplicated Quercus robur
  assert.equal(city.elevation_zones, undefined); // omitted when absent

  const mountain = validateLocalityProfile(makeMountainProfile());
  assert.equal(mountain.location_details.scope_type, 'mountain');
  assert.equal(mountain.elevation_zones?.length, 2);

  assert.throws(
    () =>
      validateLocalityProfile({
        location_details: {
          resolved_name: 'Narnia',
          scope_type: 'unknown',
          geographic_scope_summary: 'Fictional place.',
          coordinates_dms: '0° N, 0° E',
          is_valid_place: false,
          resolution_warning: 'No real-world place matched "Narnia".',
        },
        botanical_overview: { summary: 'None', principal_habitats: [] },
        characteristic_plants: [],
      }),
    /No real-world place matched/
  );
});

test('LocalitiesModule and LocalityDashboard render required Places & flora copy, 4 default sections, and collapsed accordions', () => {
  const moduleHtml = renderToStaticMarkup(
    React.createElement(LocalitiesModule, {
      onNavigate: () => {},
    })
  );
  assert.match(moduleHtml, /Places &amp; flora/);
  assert.match(moduleHtml, /Explore a place and choose what to study/);
  assert.match(moduleHtml, /Explore place/);
  assert.match(moduleHtml, /Use my location/);
  assert.match(moduleHtml, /Explore a place’s habitats and plant life/);

  const cityProfile = validateLocalityProfile(makeCityProfile());
  const cityPlace = buildPlaceRefFromProfile(cityProfile, {
    resolvedInatMatch: {
      id: 999,
      name: 'Greater London',
      display_name: 'Greater London, GB',
      latitude: 51.5074,
      longitude: -0.1278,
    },
  });

  const dashboardHtml = renderToStaticMarkup(
    React.createElement(LocalityDashboard, {
      profile: cityProfile,
      place: cityPlace,
      sources: [{ uri: 'https://powo.science.kew.org/', title: 'Plants of the World Online' }],
      onNavigate: () => {},
    })
  );

  // 4 default sections
  assert.match(dashboardHtml, /aria-label="Place and area"/);
  assert.match(dashboardHtml, /aria-label="Botanical overview"/);
  assert.match(dashboardHtml, /aria-label="Plants to explore"/);
  assert.match(dashboardHtml, /aria-label="Recent iNaturalist observations"/);
  // Explicit distinction & inline Build a guide CTA
  assert.match(dashboardHtml, /Characteristic plants/);
  assert.match(dashboardHtml, /Source-supported examples associated with the place; not a checklist/);
  assert.match(dashboardHtml, /Recent iNaturalist observations/);
  assert.match(dashboardHtml, /Within resolved iNaturalist boundary/);
  assert.match(dashboardHtml, /Build a guide/);
  // Collapsed expandable sections by default (content inside accordion shouldn't render initially)
  assert.match(dashboardHtml, /Environmental context/);
  assert.match(dashboardHtml, /Sources/);
  assert.doesNotMatch(dashboardHtml, /Flora of the London Area/);
  assert.doesNotMatch(dashboardHtml, /Elevation zones/); // city shouldn't render elevation zones

  // Verify mountain profile passes elevation zones inside Environmental context
  const mountainProfile = validateLocalityProfile(makeMountainProfile());
  const mountainPlace = buildPlaceRefFromProfile(mountainProfile);
  assert.equal(mountainProfile.elevation_zones?.length, 2);
  assert.equal(mountainPlace.scopeType, 'mountain');
});

test('Cross-module place handoff preserves PlaceContextChip in Guide, Explore, Identify (unselected habitat), and Quiz', () => {
  const place: PlaceRef = {
    displayName: 'Mount Tamalpais, California',
    scopeType: 'mountain',
    geographicScopeSummary: 'Marin County ridge',
    providerPlaceId: 54321,
    providerPlaceName: 'Mount Tamalpais, California',
    coordinates: { latitude: 37.9235, longitude: -122.5965 },
    availableHabitats: ['Serpentine Chaparral', 'Redwood Canyon Woodland'],
  };

  const guideHtml = renderToStaticMarkup(
    React.createElement(GuideModule, {
      onNavigate: () => {},
      initialPlace: place,
      navRequestId: 1,
    })
  );
  assert.match(guideHtml, /data-testid="place-context-chip"/);
  assert.match(guideHtml, /Mount Tamalpais, California/);

  const profilesHtml = renderToStaticMarkup(
    React.createElement(ProfilesModule, {
      onNavigate: () => {},
      initialQuery: 'Sequoia sempervirens',
      initialPlace: place,
      navRequestId: 2,
    })
  );
  assert.match(profilesHtml, /data-testid="place-context-chip"/);
  assert.match(profilesHtml, /Mount Tamalpais, California/);

  const identifyHtml = renderToStaticMarkup(
    React.createElement(IdentifyModule, {
      onNavigate: () => {},
      initialPlace: place,
      navRequestId: 3,
    })
  );
  assert.match(identifyHtml, /data-testid="place-context-chip"/);
  assert.match(identifyHtml, /data-testid="identify-habitat-suggestions"/);
  assert.match(identifyHtml, /Observed habitat \/ microsite \(Optional\)/);
  assert.match(identifyHtml, /regional background only/);

  const quizHtml = renderToStaticMarkup(
    React.createElement(QuizModule, {
      onNavigate: () => {},
      initialPlace: place,
      navRequestId: 4,
    })
  );
  assert.match(quizHtml, /data-testid="place-context-chip"/);
  assert.match(quizHtml, /Mount Tamalpais, California/);
  assert.match(quizHtml, /iNat boundary/);
});
