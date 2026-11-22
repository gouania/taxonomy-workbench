import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  parseJsonStrict,
  validateStructuredGuide,
  validateSubsetComparison,
  validateDichotomousKey,
  buildSourceProvenance,
  attachGroundingSupportsToGuide,
} from '../src/utils/guideValidation';
import { MODEL_CACHE_TAG } from '../src/constants';
import { StructuredResultPanel } from '../src/components/guide/StructuredResultPanel';
import { KeyRunner } from '../src/components/guide/KeyRunner';
import { GuideSubsetModal } from '../src/components/guide/GuideSubsetModal';
import { GuideModule } from '../src/components/guide/GuideModule';
import { TaskProgressCard } from '../src/components/shared/TaskProgressCard';
import { collectReachableBranchTaxa, formatGuideAsMarkdown } from '../src/utils/guideExport';
import { isAbortError } from '../src/services/geminiService';
import {
  isAppropriateForInfragenericGroups,
  togglePresetFilter,
} from '../src/components/guide/BuilderPanel';
import {
  AppStatus,
  DichotomousKeyCouplet,
  GeneratedGuideStructured,
  GuideSubsetComparison,
  SpeciesProfile,
} from '../src/types';

function makeValidSpecies(): SpeciesProfile[] {
  return [
    {
      scientific_name: 'Quercus robur',
      common_name: 'Pedunculate Oak',
      habitat_and_ecology: 'Lowland mixed deciduous woodland on deep soils.',
      key_diagnostics: 'Long fruiting peduncle (3-8 cm); subsessile auriculate leaves.',
    },
    {
      scientific_name: 'Quercus petraea',
      common_name: 'Sessile Oak',
      habitat_and_ecology: 'Upland acid oakwoods and well-drained slopes.',
      key_diagnostics: 'Acorns sessile or very shortly pedunculate; petioles 10-25 mm.',
    },
    {
      scientific_name: 'Quercus cerris',
      common_name: 'Turkey Oak',
      habitat_and_ecology: 'Calcareous soils, parks, and naturalized woodlands.',
      key_diagnostics: 'Persistent linear bud stipules and mossy acorn cup scales.',
    },
  ];
}

function makeValidKey(): DichotomousKeyCouplet[] {
  return [
    {
      couplet_id: '1',
      lead_a: {
        statement: 'Terminal buds surrounded by persistent linear stipules; cupule scales mossy.',
        destination: 'Quercus cerris',
      },
      lead_b: {
        statement: 'Terminal buds without persistent linear stipules; cupule scales flat.',
        destination: 'Couplet 2',
      },
    },
    {
      couplet_id: '2',
      lead_a: {
        statement: 'Fruiting peduncle 3-8 cm long; leaf base strongly auriculate.',
        destination: 'Quercus robur',
      },
      lead_b: {
        statement: 'Acorn sessile or peduncle < 1 cm; leaf base cuneate on long petiole.',
        destination: 'Quercus petraea',
      },
    },
  ];
}

function makeValidGuide(overrides?: Partial<GeneratedGuideStructured>): GeneratedGuideStructured {
  const species = makeValidSpecies();
  const key = makeValidKey();
  return {
    guide_metadata: {
      target_taxon: 'Quercus',
      target_locality: 'Southern England',
      verification_summary: 'Includes all native and commonly naturalized oaks in Southern England.',
      coverage_scope: 'All native and naturalized regional species',
      total_taxa_treated: species.length,
    },
    taxon_overview: 'Oaks in Southern England are distinguished primarily by acorn peduncle length, petiole development, and stipule persistence.',
    species_profiles: species,
    dichotomous_key: key,
    field_documentation_guide: [
      'Photograph mature acorns attached to leafy twigs to record peduncle length.',
      'Collect winter twigs and fallen cupules for herbarium verification.',
    ],
    recommended_literature: [
      {
        citation: 'Stace, C. (2019). New Flora of the British Isles (4th ed.). C & M Floristics.',
        type: 'Flora Account',
        scope: 'Great Britain & Ireland',
        notes: 'Standard vascular plant identification manual with complete Quercus key.',
      },
    ],
    ...overrides,
  };
}

// -----------------------------------------------------------------------------
// 1. Malformed Response Fixtures
// -----------------------------------------------------------------------------

test('parseJsonStrict rejects empty, non-JSON, or truncated model output with actionable errors', () => {
  assert.throws(() => parseJsonStrict('', 'guide response'), /Empty response/);
  assert.throws(() => parseJsonStrict('   \n  ', 'guide response'), /Empty response/);
  assert.throws(() => parseJsonStrict('{"guide_metadata":', 'guide response'), /Malformed JSON/);
  assert.throws(() => parseJsonStrict('Not JSON at all', 'subset response'), /Malformed JSON/);
  assert.throws(
    () => validateStructuredGuide(parseJsonStrict('[]', 'guide response')),
    /expected a JSON object/
  );
});

test('validateStructuredGuide rejects empty objects and missing required sections', () => {
  assert.throws(() => validateStructuredGuide({}), /guide_metadata/);

  const missingProfiles = makeValidGuide({ species_profiles: [] });
  assert.throws(() => validateStructuredGuide(missingProfiles), /species_profiles/);

  const missingKey = makeValidGuide({ dichotomous_key: [] });
  assert.throws(() => validateStructuredGuide(missingKey), /dichotomous_key/);

  const missingOverview = makeValidGuide({ taxon_overview: '   ' });
  assert.throws(() => validateStructuredGuide(missingOverview), /taxon_overview/);
});

test('validateSubsetComparison rejects empty objects, missing matrix rows, or invalid diagnostic importance', () => {
  assert.throws(() => validateSubsetComparison({}), /fastest_distinction_summary/);

  const invalidImportance = {
    taxa: [{ scientific_name: 'Quercus robur' }, { scientific_name: 'Quercus petraea' }],
    fastest_distinction_summary: 'Check acorn peduncle and petiole length.',
    what_to_examine_next: [
      {
        priority: 1,
        action: 'Inspect acorn stalk',
        target_organ: 'Acorn',
        expected_outcomes: 'Long stalk vs sessile.',
      },
    ],
    matrix_rows: [
      {
        character_name: 'Acorn peduncle',
        diagnostic_importance: 'CRITICAL', // invalid enum value
        states: [
          { scientific_name: 'Quercus robur', state: '3-8 cm' },
          { scientific_name: 'Quercus petraea', state: '0-1 cm' },
        ],
      },
    ],
    limitations: ['Immature acorns may not show full peduncle length.'],
  };

  assert.throws(() => validateSubsetComparison(invalidImportance), /diagnostic_importance/);
});

// -----------------------------------------------------------------------------
// 2. Broken Dichotomous Key Fixtures & Structural vs Botanical Accuracy Note
// -----------------------------------------------------------------------------

test('validateDichotomousKey passes a complete, reachable key and states structural vs botanical distinction', () => {
  const report = validateDichotomousKey(makeValidKey(), makeValidSpecies());
  assert.equal(report.isStructurallyValid, true);
  assert.equal(report.issues.length, 0);
  assert.equal(report.unreachableTaxa.length, 0);
  assert.equal(report.missingDestinations.length, 0);
  assert.equal(report.cycles.length, 0);
  assert.match(report.validityNote, /Structural validity verifies key graph linkage only/i);
  assert.match(report.validityNote, /verify botanical accuracy/i);
});

test('validateDichotomousKey resolves synonym key terminals (e.g. Duchesnea indica -> Potentilla indica) without false unknownTerminalTaxa', () => {
  const rosaceaeProfiles: SpeciesProfile[] = [
    {
      scientific_name: 'Potentilla indica',
      accepted_name: 'Potentilla indica (Andrews) Th.Wolf',
      synonyms: ['Duchesnea indica'],
      common_name: 'Mock Strawberry',
      habitat_and_ecology: 'Disturbed woods and lawns.',
      key_diagnostics: 'Yellow petals; bright red dryish insipid aggregate fruit.',
    },
    {
      scientific_name: 'Fragaria vesca',
      common_name: 'Wild Strawberry',
      habitat_and_ecology: 'Woodland margins.',
      key_diagnostics: 'White petals; fragrant fleshy receptacle.',
    },
  ];
  const synonymKey: DichotomousKeyCouplet[] = [
    {
      couplet_id: '1',
      lead_a: {
        statement: 'Petals yellow; epicalyx bractlets large and 3-toothed.',
        destination: 'Duchesnea indica',
      },
      lead_b: {
        statement: 'Petals white; epicalyx bractlets smaller than sepals.',
        destination: 'Fragaria vesca',
      },
    },
  ];

  const report = validateDichotomousKey(synonymKey, rosaceaeProfiles);
  assert.equal(report.isStructurallyValid, true);
  assert.deepEqual(report.unknownTerminalTaxa, []);
  assert.deepEqual(report.unreachableTaxa, []);
});

test('validateDichotomousKey detects duplicate couplet IDs, missing destinations, cycles, unknown terminals, unreachable couplets, and unreachable taxa', () => {
  const species = makeValidSpecies();
  const brokenKey: DichotomousKeyCouplet[] = [
    {
      couplet_id: '1',
      lead_a: {
        statement: 'Bark fissured',
        destination: 'Couplet 2',
      },
      lead_b: {
        statement: 'Bud stipules persistent',
        destination: 'Couplet 99', // missing destination
      },
    },
    {
      couplet_id: '2',
      lead_a: {
        statement: 'Back to 1 (cycle)',
        destination: 'Couplet 1', // cycle!
      },
      lead_b: {
        statement: 'Ghost taxon',
        destination: 'Quercus alba', // unknown terminal taxon (not in species_profiles)
      },
    },
    {
      couplet_id: '2', // duplicate couplet ID!
      lead_a: {
        statement: 'Duplicate A',
        destination: 'Quercus robur',
      },
      lead_b: {
        statement: 'Duplicate B',
        destination: 'Quercus petraea',
      },
    },
    {
      couplet_id: '3', // unreachable couplet!
      lead_a: {
        statement: 'Island couplet',
        destination: 'Quercus cerris',
      },
      lead_b: {
        statement: 'Island couplet B',
        destination: 'Quercus robur',
      },
    },
  ];

  const report = validateDichotomousKey(brokenKey, species);
  assert.equal(report.isStructurallyValid, false);
  assert.ok(report.duplicateCoupletIds.includes('2'));
  assert.ok(report.missingDestinations.some((d) => d.includes('99')));
  assert.ok(report.cycles.length >= 1);
  assert.ok(report.unknownTerminalTaxa.includes('Quercus alba'));
  assert.ok(report.unreachableCouplets.includes('3'));
  assert.ok(report.unreachableTaxa.includes('Quercus cerris'));
  assert.ok(report.unreachableTaxa.includes('Quercus petraea'));
  assert.match(report.validityNote, /botanical accuracy/i);

  // Rendered KeyRunner displays explicit structural issue banner and warning distinction
  const keyHtml = renderToStaticMarkup(
    React.createElement(KeyRunner, {
      keyItems: brokenKey,
      speciesProfiles: species,
      targetLocality: 'Southern England',
      keyValidation: report,
    })
  );
  assert.match(keyHtml, /data-testid="key-structure-banner"/);
  assert.match(keyHtml, /Key Structural Issues Detected/);
  assert.match(keyHtml, /separately from botanical accuracy/i);
});

// -----------------------------------------------------------------------------
// 3. Absent Sources & Provenance Separation Fixtures
// -----------------------------------------------------------------------------

test('buildSourceProvenance accurately distinguishes retrieved vs search_no_results vs synthesis_only', () => {
  const retrieved = buildSourceProvenance(
    true,
    [
      { uri: 'https://powo.science.kew.org/taxon/1', title: 'POWO Quercus robur' },
      { uri: 'https://powo.science.kew.org/taxon/1', title: 'Duplicate' },
    ],
    'subset_comparison'
  );
  assert.equal(retrieved.evidenceStatus, 'retrieved');
  assert.equal(retrieved.retrievedSources.length, 1);

  const noResults = buildSourceProvenance(true, [], 'subset_comparison');
  assert.equal(noResults.evidenceStatus, 'search_no_results');
  assert.equal(noResults.retrievedSources.length, 0);
  assert.match(noResults.basisNote, /no publications were directly consulted or verified/i);

  const synthesisOnly = buildSourceProvenance(false, [], 'guide');
  assert.equal(synthesisOnly.evidenceStatus, 'synthesis_only');
  assert.match(synthesisOnly.basisNote, /without live web retrieval/i);
});

test('attachGroundingSupportsToGuide attaches segment-level source_urls to profiles and key couplets', () => {
  const baseGuide = makeValidGuide();
  const linked = attachGroundingSupportsToGuide(baseGuide, [
    {
      text: 'Quercus robur has a long fruiting peduncle (3-8 cm) and subsessile auriculate leaves.',
      sourceIndices: [0],
      sourceUris: ['https://powo.science.kew.org/quercus-robur'],
    },
    {
      text: 'Terminal buds surrounded by persistent linear stipules; cupule scales mossy.',
      sourceIndices: [1],
      sourceUris: ['https://powo.science.kew.org/quercus-cerris'],
    },
  ]);

  assert.deepEqual(linked.species_profiles[0].source_urls, [
    'https://powo.science.kew.org/quercus-robur',
  ]);
  assert.deepEqual(linked.dichotomous_key[0].source_urls, [
    'https://powo.science.kew.org/quercus-cerris',
  ]);
  assert.equal(linked.grounding_supports?.length, 2);
});

test('GuideSubsetModal does not render bibliography strings as consulted Ref evidence and shows absent-source provenance clearly', () => {
  const comparisonData: GuideSubsetComparison = {
    taxa: [
      { scientific_name: 'Quercus robur', common_name: 'Pedunculate Oak' },
      { scientific_name: 'Quercus petraea', common_name: 'Sessile Oak' },
    ],
    fastest_distinction_summary: 'Compare fruiting peduncle length and leaf petiole length.',
    what_to_examine_next: [
      {
        priority: 1,
        action: 'Check acorn stalk',
        target_organ: 'Acorn',
        lens_or_technique: 'Naked eye / 10x hand lens',
        expected_outcomes: 'Peduncle > 2 cm in Q. robur vs sessile in Q. petraea.',
      },
    ],
    matrix_rows: [
      {
        character_name: 'Acorn peduncle length',
        category: 'Fruit/Seed',
        diagnostic_importance: 'Decisive',
        states: [
          { scientific_name: 'Quercus robur', state: '3-8 cm long' },
          { scientific_name: 'Quercus petraea', state: 'Sessile or < 1 cm' },
        ],
        // Even if a legacy saved object had a citation string, UI must NOT present it as a verified Ref
        citation: 'Stace (2019)',
      },
    ],
    limitations: ['Hybrids (Q. x rosacea) show intermediate traits.'],
    provenance: buildSourceProvenance(true, [], 'subset_comparison'),
  };

  const modalHtml = renderToStaticMarkup(
    React.createElement(GuideSubsetModal, {
      isOpen: true,
      onClose: () => {},
      selectedTaxa: makeValidSpecies().slice(0, 2),
      locality: 'Southern England',
      data: comparisonData,
      isLoading: false,
      error: null,
      onRetry: () => {},
    })
  );

  assert.match(modalHtml, /data-testid="subset-provenance-banner"/);
  assert.match(modalHtml, /No retrieved web sources/);
  assert.doesNotMatch(modalHtml, /Ref: Stace/);
  assert.doesNotMatch(modalHtml, /evaluated against regional evidence/);
});

test('StructuredResultPanel always shows Sources & Literature tab and keeps Key panel mounted in DOM when Taxa tab is active', () => {
  const emptyRefGuide = validateStructuredGuide(
    makeValidGuide({ recommended_literature: [] })
  );

  const html = renderToStaticMarkup(
    React.createElement(StructuredResultPanel, {
      status: AppStatus.SUCCESS,
      guide: emptyRefGuide,
      sources: [],
    })
  );

  assert.match(html, /References &amp; literature/);
  assert.match(html, /Key Structure OK/);
  // Key panel stays mounted (via Tailwind `hidden`) on the default Taxa tab so couplet state isn't lost on tab switches
  assert.match(html, /data-testid="guide-key-panel" class="hidden"/);
});

// -----------------------------------------------------------------------------
// 4. Complete Printing View Fixture (Independent of Active Tab)
// -----------------------------------------------------------------------------

test('StructuredResultPanel renders dedicated print view with overview, all taxa profiles, aliases, complete key, field notes, and Synthesized Taxonomic Basis heading', () => {
  const guideWithSynonyms = makeValidGuide();
  guideWithSynonyms.species_profiles[0] = {
    ...guideWithSynonyms.species_profiles[0],
    accepted_name: 'Quercus robur L.',
    synonyms: ['Quercus pedunculata'],
    source_urls: ['https://powo.science.kew.org/quercus-robur'],
  };
  const validatedGuide = validateStructuredGuide(guideWithSynonyms);

  const html = renderToStaticMarkup(
    React.createElement(StructuredResultPanel, {
      status: AppStatus.SUCCESS,
      guide: validatedGuide,
      sources: [],
      activeFilters: ['Fruiting material present'],
    })
  );

  // Taxa card displays alias pill and inline source link, and mounted key panel offers Quick References when references/literature exist
  assert.match(html, /Also cited as:.*Quercus pedunculata/);
  assert.match(html, /Show Quick References/);

  const printMarkerIndex = html.indexOf('data-testid="guide-print-view"');
  assert.ok(printMarkerIndex !== -1, 'Dedicated print view container must be present');

  const printSectionHtml = html.slice(printMarkerIndex);
  assert.match(printSectionHtml, /Botanical Overview/);
  assert.match(printSectionHtml, /Oaks in Southern England are distinguished primarily/);
  assert.match(printSectionHtml, /Synthesized Taxonomic Basis \(Overview\):/);
  assert.doesNotMatch(printSectionHtml, />Taxonomic Basis:</);
  assert.match(printSectionHtml, /Active Constraints:.*Fruiting material present/);
  assert.match(printSectionHtml, /Complete Dichotomous Identification Key \(2 couplets\)/);
  assert.match(printSectionHtml, /Fruiting peduncle 3-8 cm long/);
  assert.match(printSectionHtml, /Treated Taxon Profiles \(3\)/);
  assert.match(printSectionHtml, /Quercus cerris/);
  assert.match(printSectionHtml, /Field documentation: What to photograph, measure, and record/);
  assert.match(printSectionHtml, /Photograph mature acorns attached to leafy twigs/);
  assert.match(printSectionHtml, /Suggested literature \(not verified unless listed below\)/);
  assert.match(printSectionHtml, /Stace, C\. \(2019\)/);
  assert.match(printSectionHtml, /Supporting web references/);
  assert.match(printSectionHtml, /Key Structure Check:/);
});

// -----------------------------------------------------------------------------
// 5. Failed-Regeneration, Labels, Rank Gating, and Model Cache Tag Fixtures
// -----------------------------------------------------------------------------

test('MODEL_CACHE_TAG encodes active Gemini model and thinking level', () => {
  assert.equal(MODEL_CACHE_TAG, 'gemini-4-hydrogen_MEDIUM');
});

test('GuideModule initial render uses updated labels and print:hidden chrome', () => {
  const html = renderToStaticMarkup(React.createElement(GuideModule, {}));
  assert.match(html, /Guide by group and locality/);
  assert.match(html, /Guide from text or instructions/);
  assert.match(html, /Broad regional coverage/);
  assert.match(html, /Selected common and characteristic taxa/);
  assert.match(html, /Subgenera, sections, and species groups/);
  assert.match(html, /data-testid="guide-material-condition-group"/);
  assert.match(html, /Fresh material/);
  assert.match(html, /Herbarium material/);
  assert.match(html, /print:hidden/);
});

test('togglePresetFilter enforces mutual exclusion between fresh and herbarium material while preserving other constraints', () => {
  let active = togglePresetFilter([], 'vegetative');
  active = togglePresetFilter(active, 'fresh');
  assert.deepEqual(active, ['vegetative', 'fresh']);

  // Switching to herbarium removes fresh while retaining vegetative
  active = togglePresetFilter(active, 'herbarium');
  assert.deepEqual(active, ['vegetative', 'herbarium']);

  // Clicking herbarium again deselects it cleanly
  active = togglePresetFilter(active, 'herbarium');
  assert.deepEqual(active, ['vegetative']);
});

test('isAppropriateForInfragenericGroups restricts sections/subgenera option by taxonomic rank', () => {
  assert.equal(isAppropriateForInfragenericGroups(''), true);
  assert.equal(isAppropriateForInfragenericGroups('Quercus'), true);
  assert.equal(isAppropriateForInfragenericGroups('Acer'), true);
  assert.equal(isAppropriateForInfragenericGroups('Quercus sect. Lobatae'), true);
  assert.equal(isAppropriateForInfragenericGroups('Rosaceae'), false);
  assert.equal(isAppropriateForInfragenericGroups('Asterales'), false);
  assert.equal(isAppropriateForInfragenericGroups('Quercus robur'), false);
});

// -----------------------------------------------------------------------------
// 6. UX Upgrades: Branch Taxa Preview, Markdown Export, Progress & Cancellation
// -----------------------------------------------------------------------------

test('collectReachableBranchTaxa resolves Lead A and Lead B terminal taxa safely even with cycles', () => {
  const validKey = makeValidKey();
  const branch = collectReachableBranchTaxa('1', validKey, makeValidSpecies());
  assert.deepEqual(branch.leadATaxa, ['Quercus cerris']);
  assert.deepEqual(branch.leadBTaxa, ['Quercus robur', 'Quercus petraea']);
  assert.deepEqual(branch.combinedTaxa, ['Quercus cerris', 'Quercus robur', 'Quercus petraea']);

  // Cycle safety test: Couplet 1 -> Couplet 2 -> Couplet 1
  const cyclicKey: DichotomousKeyCouplet[] = [
    {
      couplet_id: '1',
      lead_a: { statement: 'A', destination: 'Couplet 2' },
      lead_b: { statement: 'B', destination: 'Quercus cerris' },
    },
    {
      couplet_id: '2',
      lead_a: { statement: 'C', destination: '1' },
      lead_b: { statement: 'D', destination: 'Quercus robur' },
    },
  ];
  const cyclicBranch = collectReachableBranchTaxa('1', cyclicKey);
  assert.deepEqual(cyclicBranch.leadATaxa, ['Quercus robur']);
  assert.deepEqual(cyclicBranch.leadBTaxa, ['Quercus cerris']);
});

test('formatGuideAsMarkdown produces complete portable Markdown handbook', () => {
  const guide = validateStructuredGuide(makeValidGuide());
  const md = formatGuideAsMarkdown(
    guide,
    [{ uri: 'https://powo.science.kew.org/taxon/1', title: 'POWO Oak Treatment' }],
    ['Fresh material']
  );

  assert.match(md, /# Identification Guide to \*Quercus\* — Southern England/);
  assert.match(md, /\*\*Constraints:\*\* Fresh material/);
  assert.match(md, /## Treated Taxon Profiles \(3\)/);
  assert.match(md, /### \*Quercus robur\* \(Pedunculate Oak\)/);
  assert.match(md, /## Dichotomous Identification Key \(2 couplets\)/);
  assert.match(md, /## Field Documentation: What to Photograph, Measure, and Record/);
  assert.match(md, /## Retrieved Supporting Web References/);
  assert.match(md, /\[POWO Oak Treatment\]\(https:\/\/powo\.science\.kew\.org\/taxon\/1\)/);
  assert.match(md, /## Suggested Literature \(Verify Independently\)/);
  assert.match(md, /Stace, C\. \(2019\)/);
});

test('StructuredResultPanel exposes Markdown copy and download actions alongside Print', () => {
  const guide = validateStructuredGuide(makeValidGuide());
  const html = renderToStaticMarkup(
    React.createElement(StructuredResultPanel, {
      status: AppStatus.SUCCESS,
      guide,
      sources: [],
    })
  );

  assert.match(html, /Copy MD/);
  assert.match(html, /\.md/);
  assert.match(html, /Print/);
});

test('TaskProgressCard renders elapsed timer, stage copy, and Cancel button in card and banner variants', () => {
  const cardHtml = renderToStaticMarkup(
    React.createElement(TaskProgressCard, {
      variant: 'card',
      testId: 'test-progress-card',
      title: 'Building your guide…',
      stages: ['Step one', 'Step two'],
      onCancel: () => {},
    })
  );
  assert.match(cardHtml, /data-testid="test-progress-card"/);
  assert.match(cardHtml, /Building your guide…/);
  assert.match(cardHtml, /Step one/);
  assert.match(cardHtml, /0:00/);
  assert.match(cardHtml, /Cancel/);

  const bannerHtml = renderToStaticMarkup(
    React.createElement(TaskProgressCard, {
      variant: 'banner',
      testId: 'test-progress-banner',
      title: 'Updating results…',
      stages: ['Checking flora'],
      onCancel: () => {},
    })
  );
  assert.match(bannerHtml, /data-testid="test-progress-banner"/);
  assert.match(bannerHtml, /Updating results…/);
  assert.match(bannerHtml, /Cancel/);
});

test('isAbortError accurately distinguishes AbortError from generic failures', () => {
  const domAbort = new DOMException('Aborted', 'AbortError');
  const namedAbort = Object.assign(new Error('Request aborted'), { name: 'AbortError' });
  const genericErr = new Error('Network error');

  assert.equal(isAbortError(domAbort), true);
  assert.equal(isAbortError(namedAbort), true);
  assert.equal(isAbortError(genericErr), false);
  assert.equal(isAbortError(null), false);
});
