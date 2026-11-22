import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  parseJsonStrict,
  validateIdentifyResult,
  buildSourceProvenance,
} from '../src/utils/guideValidation';
import {
  auditIdentifyEvidence,
  formatSpecimenSummary,
} from '../src/utils/identifyEvidence';
import { IdentifyModule, mergeObservations } from '../src/components/identify/IdentifyModule';
import { IdentifyResultView } from '../src/components/identify/IdentifyResultView';
import { CandidateTaxonCard } from '../src/components/identify/CandidateTaxonCard';
import { GuideModule } from '../src/components/guide/GuideModule';
import { FollowUpObservation, IdentifyResult, SpecimenRecord } from '../src/types';

function makeBrassicaceaeFamilyStopResult(): IdentifyResult {
  return {
    supported_identification: {
      status: 'resolved_to_rank',
      taxon_name: 'Brassicaceae',
      rank: 'family',
      family: 'Brassicaceae',
      statement: 'Identification supported by the supplied characters: Brassicaceae.',
      why_it_stops_here:
        'Cruciform 4-merous flowers with 6 tetradynamous stamens establish Brassicaceae, while mature fruits and basal leaves were not observed so genus and species remain unresolved.',
    },
    finer_hypotheses: [
      {
        taxon_name: 'Cardamine',
        rank: 'genus',
        rationale: 'Pinnate stem leaves and small white flowers in racemes are consistent with several Cardamine species.',
        missing_or_unverified: 'Linear elastic-dehiscing siliques and basal rosette leaf morphology were not observed.',
      },
    ],
    supporting_evidence: [
      '4 white petals arranged in a cross',
      '6 stamens (4 long, 2 short)',
      'Alternate leaves',
    ],
    analysis_summary:
      'Tetradynamous stamens combined with a 4-petaled cruciform corolla strongly place this specimen in Brassicaceae.',
    candidates: [
      {
        name: 'Cardamine',
        rank: 'genus',
        parent_family: 'Brassicaceae',
        common_name: 'Bittercress',
        assessment: 'Plausible candidate',
        supporting_characters: ['4 white petals in cross', 'alternate pinnately divided leaves'],
        contradicting_characters: [],
        missing_evidence: ['Silique valve elastically coiling', 'Basal rosette leaf shape'],
        diagnostic_characters: 'Elastically coiling silique valves lacking prominent midveins; pinnately lobed or compound leaves.',
        differential_diagnosis: 'Differs from Nasturtium and Barbarea in white petals and flat nerveless coiling fruit valves.',
        regional_notes: 'Moist woods and streambanks.',
      },
      {
        name: 'Capsella bursa-pastoris',
        rank: 'species',
        parent_family: 'Brassicaceae',
        common_name: 'Shepherd’s-purse',
        assessment: 'Uncertain / partial match',
        supporting_characters: ['4 small white petals'],
        contradicting_characters: [],
        missing_evidence: ['Obcordate triangular silicle', 'Clasping auriculate stem leaf bases'],
        diagnostic_characters: 'Flat heart-shaped (obcordate-triangular) silicles; pinnatifid basal rosette and sagittate-clasping cauline leaves.',
        differential_diagnosis: 'Unmistakable triangular silicles when fruiting.',
      },
    ],
    what_to_examine_next: [
      {
        priority: 1,
        feature: 'Mature fruit shape & valve dehiscence',
        organ: 'Fruit / Silique or Silicle',
        what_to_look_for: 'Check whether fruits are long linear siliques or triangular flattened silicles.',
        why_it_separates_candidates: 'Separates linear-fruited Cardamine from triangular-fruited Capsella.',
      },
      {
        priority: 2,
        feature: 'Stem leaf base attachment',
        organ: 'Cauline Leaves',
        what_to_look_for: 'Observe whether bases are petiolate vs sagittate-clasping.',
        why_it_separates_candidates: 'Distinguishes clasping-leaved crucifers from petiolate Cardamine species.',
      },
    ],
    followup_questions: [
      {
        id: 'fruit_shape',
        prompt: 'What is the shape and length-to-width ratio of the mature fruit?',
        target_organ: 'Fruit',
        why_asked: 'Separates Cardamine siliques from Capsella or Lepidium silicles.',
        options: [
          'Long slender silique (> 3x as long as wide)',
          'Flattened triangular / heart-shaped silicle',
          'Rounded or notched broad silicle',
        ],
      },
    ],
    comparison_rows: [
      {
        character: 'Mature fruit shape',
        organ: 'Fruit',
        specimen_state: 'Not observed',
        matching_followup_id: 'fruit_shape',
        candidate_states: [
          {
            taxon_name: 'Cardamine',
            expected_state: 'Linear silique (> 3x longer than wide)',
            status: 'unexamined',
          },
          {
            taxon_name: 'Capsella bursa-pastoris',
            expected_state: 'Obcordate-triangular flattened silicle',
            status: 'unexamined',
          },
        ],
      },
    ],
    taxonomic_notes: 'Fruit morphology is essential for reliable generic determination in Brassicaceae.',
    recommended_literature: [
      {
        citation: 'Al-Shehbaz, I. A. (2010). Brassicaceae. Flora of North America North of Mexico, Vol. 7.',
        type: 'Flora Account',
        scope: 'North America',
      },
    ],
    provenance: buildSourceProvenance(true, [], 'identify'),
  };
}

function makeSpeciesResolvedResult(): IdentifyResult {
  return {
    supported_identification: {
      status: 'resolved_to_rank',
      taxon_name: 'Urtica dioica',
      authority: 'L.',
      rank: 'species',
      family: 'Urticaceae',
      genus: 'Urtica',
      statement: 'Identification supported by the supplied characters: Urtica dioica.',
      why_it_stops_here:
        'Perennial erect habit with opposite serrate stinging-haired leaves, 4-angled stems, and unisexual axillary clusters supports Urtica dioica.',
    },
    finer_hypotheses: [],
    supporting_evidence: [
      'Erect perennial ~60 cm',
      'Opposite serrate leaves with stinging trichomes',
      'Square stem and axillary unisexual apetalous flower clusters',
    ],
    analysis_summary: 'Distinctive stinging trichomes and opposite serrate leaves place the specimen in Urtica.',
    candidates: [
      {
        name: 'Urtica dioica',
        authority: 'L.',
        rank: 'species',
        parent_family: 'Urticaceae',
        common_name: 'Stinging Nettle',
        assessment: 'Consistent with observations',
        supporting_characters: ['Opposite serrate leaves', 'Stinging trichomes', 'Perennial habit'],
        contradicting_characters: [],
        missing_evidence: ['Dioecious vs monoecious sex distribution on plant', 'Stipule fusion check (subspecies)'],
        diagnostic_characters: 'Rhizomatous perennial; opposite cordate-ovate serrate leaves; paired free linear stipules (fused in some subsp.).',
        differential_diagnosis: 'Distinguished from annual Urtica urens by perennial rhizomatous habit and largely unisexual plants.',
      },
      {
        name: 'Urtica urens',
        authority: 'L.',
        rank: 'species',
        parent_family: 'Urticaceae',
        common_name: 'Dwarf Nettle',
        assessment: 'Weak match',
        supporting_characters: ['Opposite leaves with stinging hairs'],
        contradicting_characters: ['Supplied habit is ~60 cm perennial; U. urens is a shorter annual'],
        missing_evidence: ['Root system / annual vs perennial base'],
        diagnostic_characters: 'Smaller annual with deeply incised teeth and both male and female flowers mixed in the same cluster.',
        differential_diagnosis: 'Differs from U. dioica by annual taproot and mixed-sex clusters shorter than petioles.',
      },
    ],
    what_to_examine_next: [
      {
        priority: 1,
        feature: 'Stipule fusion and sex distribution',
        organ: 'Nodes & Inflorescence',
        what_to_look_for: 'Verify free vs connate stipules and whether male and female flowers occur on separate plants.',
        why_it_separates_candidates: 'Distinguishes U. dioica subspecies and confirms separation from U. urens.',
      },
    ],
    followup_questions: [],
    taxonomic_notes: 'Subspecies in North America (e.g., subsp. gracilis vs subsp. dioica) require stipule and stinging-hair density checks.',
    recommended_literature: [],
    provenance: buildSourceProvenance(true, [{ uri: 'https://powo.science.kew.org', title: 'POWO Urtica' }], 'identify'),
  };
}

test('validateIdentifyResult accepts species, family+finer hypotheses, species_group, and unresolved stops', () => {
  const speciesRes = validateIdentifyResult(makeSpeciesResolvedResult());
  assert.equal(speciesRes.supported_identification.rank, 'species');
  assert.equal(speciesRes.supported_identification.taxon_name, 'Urtica dioica');

  const familyRes = validateIdentifyResult(makeBrassicaceaeFamilyStopResult());
  assert.equal(familyRes.supported_identification.rank, 'family');
  assert.equal(familyRes.finer_hypotheses?.length, 1);
  assert.equal(familyRes.finer_hypotheses?.[0].taxon_name, 'Cardamine');
  assert.equal(familyRes.comparison_rows?.length, 1);

  const complexRes = validateIdentifyResult({
    ...makeBrassicaceaeFamilyStopResult(),
    supported_identification: {
      status: 'resolved_to_rank',
      taxon_name: 'Rubus fruticosus agg.',
      rank: 'species_group',
      family: 'Rosaceae',
      genus: 'Rubus',
      statement: 'Identification supported to species aggregate: Rubus fruticosus agg.',
      why_it_stops_here:
        'Bramble apomictic microspecies require primocane armament, stipule, and specialized floral characters plus regional specialist keys.',
      limitations_note: 'Apomictic aggregate: reliable determination beyond species_group requires complete primocane + floricane material.',
    },
    finer_hypotheses: [],
  });
  assert.equal(complexRes.supported_identification.rank, 'species_group');
  assert.match(complexRes.supported_identification.limitations_note || '', /Apomictic/i);

  const unresolvedRes = validateIdentifyResult({
    ...makeBrassicaceaeFamilyStopResult(),
    supported_identification: {
      status: 'unresolved',
      taxon_name: 'Unresolved (Sterile dicot)',
      rank: 'unresolved',
      statement: 'Taxon remains unresolved from the sparse vegetative notes provided.',
      why_it_stops_here: 'Alternate simple serrate leaves without flowers, fruits, stipules, or habit details match dozens of unrelated families.',
    },
    finer_hypotheses: [],
  });
  assert.equal(unresolvedRes.supported_identification.status, 'unresolved');
  assert.equal(unresolvedRes.supported_identification.rank, 'unresolved');
});

test('validateIdentifyResult rejects malformed or empty outputs', () => {
  assert.throws(() => parseJsonStrict('', 'identify response'), /Empty response/);
  assert.throws(() => validateIdentifyResult({}), /supported_identification/);
  assert.throws(
    () =>
      validateIdentifyResult({
        ...makeBrassicaceaeFamilyStopResult(),
        supported_identification: {
          ...makeBrassicaceaeFamilyStopResult().supported_identification,
          rank: 'suborder' as any,
        },
      }),
    /invalid rank/
  );
  assert.throws(
    () =>
      validateIdentifyResult({
        ...makeBrassicaceaeFamilyStopResult(),
        candidates: [
          {
            ...makeBrassicaceaeFamilyStopResult().candidates[0],
            assessment: '87% confident' as any,
          },
        ],
      }),
    /invalid assessment/
  );
});

test('buildSourceProvenance supports identify workflow states cleanly', () => {
  const retrieved = buildSourceProvenance(
    true,
    [{ uri: 'https://efloras.org/brassicaceae', title: 'Flora of North America' }],
    'identify'
  );
  assert.equal(retrieved.evidenceStatus, 'retrieved');
  assert.match(retrieved.basisNote, /candidate evaluation/i);

  const noResults = buildSourceProvenance(true, [], 'identify');
  assert.equal(noResults.evidenceStatus, 'search_no_results');

  const synth = buildSourceProvenance(false, [], 'identify');
  assert.equal(synth.evidenceStatus, 'synthesis_only');
});

test('IdentifyModule initial render uses updated copy and optional character matrix title', () => {
  const html = renderToStaticMarkup(
    React.createElement(IdentifyModule, {
      onNavigate: () => {},
    })
  );

  assert.match(html, /Identify a plant from its observable characters, and find out what to examine next\./);
  assert.match(html, /Describe the plant \(Optional Character Matrix\)/);
  assert.match(html, /Identify plant/);
  assert.doesNotMatch(html, /Plant Family Narrowing/);
  assert.doesNotMatch(html, /very high confidence/i);
});

test('IdentifyResultView renders supported rank separately from finer hypotheses, inline comparison table, Not observed/Unsure follow-ups, ledger, and non-circular guide links', () => {
  const res = makeBrassicaceaeFamilyStopResult();
  const recorded: FollowUpObservation[] = [
    {
      id: 'obs_1',
      questionId: 'petal_color',
      prompt: 'Are the 4 petals white or yellow?',
      targetOrgan: 'Corolla',
      answer: 'Not observed',
      status: 'not_observed',
    },
  ];

  const html = renderToStaticMarkup(
    React.createElement(IdentifyResultView, {
      result: res,
      sources: [],
      locality: 'Oxfordshire, UK',
      specimenContext: '4 white petals in cross | 6 stamens (4 long, 2 short)',
      recordedObservations: recorded,
      draftAnswers: {},
      onSelectDraftAnswer: () => {},
      onClearDraftAnswer: () => {},
      onUpdateRecordedObservation: () => {},
      onRemoveRecordedObservation: () => {},
      onSubmitFollowups: () => {},
      onCompareCandidates: () => {},
      isUpdating: false,
      onNavigate: () => {},
    })
  );

  // Best-supported rank vs separated finer possibilities
  assert.match(html, /Best-supported identification/);
  assert.match(html, /Rank:\s*Family/);
  assert.match(html, /Brassicaceae/);
  assert.match(html, /data-testid="finer-hypotheses-box"/);
  assert.match(html, /Possible genus/);
  assert.match(html, /Cardamine/);

  // Inline candidate character comparison table
  assert.match(html, /data-testid="identify-inline-comparison-table"/);
  assert.match(html, /Mature fruit shape/);
  assert.match(html, /Linear silique/);

  // Evidence, what to examine next, contradictions/missing
  assert.match(html, /4 white petals arranged in a cross/);
  assert.match(html, /What to examine next/);
  assert.match(html, /Mature fruit shape/);
  assert.match(html, /Missing evidence:/);

  // Iterative controls & editable observation ledger
  assert.match(html, /Recorded follow-up observations \(1\)/);
  assert.match(html, /Not observed \(treated as missing, not absent\)/);
  assert.match(html, />Not observed</);
  assert.match(html, />Unsure</);
  assert.match(html, /Re-evaluate with corrected observations/);

  // Connected workflows & explicit non-circularity disclaimer
  assert.match(html, /Build a regional guide to Brassicaceae/);
  assert.match(html, /Compare remaining candidates/);
  assert.match(html, /Side-by-side profiles/);
  assert.match(html, /not independent verification/i);

  // References distinguish retrieved web sources from suggested reading
  assert.match(html, /Retrieved Supporting Web References/);
  assert.match(html, /Suggested Floras &amp; Identification Reading/);
  assert.match(html, /not directly retrieved or verified/i);

  // Never output fabricated confidence percentages
  assert.doesNotMatch(html, /\b\d{1,3}%\s*(?:confidence|match|sure)/i);
  assert.doesNotMatch(html, /very high confidence/i);
});

test('CandidateTaxonCard shows categorical assessment and guide handoff without percentages', () => {
  const candidate = makeBrassicaceaeFamilyStopResult().candidates[0];
  const html = renderToStaticMarkup(
    React.createElement(CandidateTaxonCard, {
      candidate,
      locality: 'Oxfordshire, UK',
      specimenContext: '4 white petals in cross',
      onNavigate: () => {},
    })
  );

  assert.match(html, /Cardamine/);
  assert.match(html, /Plausible candidate/);
  assert.match(html, /Build a regional guide to Cardamine →/);
  assert.match(html, /Matches supplied characters:/);
  assert.match(html, /Missing evidence:/);
});

test('GuideModule accepts initialSpecimenContext and structured initialSpecimenRecord from Identify without polluting custom criteria input', () => {
  const sampleRecord: SpecimenRecord = {
    notes:
      'Erect perennial herb ~60 cm tall in shaded riparian forest. Opposite serrate ovate-lanceolate leaves with stinging trichomes. Square green stem, fibrous roots, clear non-milky watery exudate. Dense axillary clusters of tiny greenish-white unisexual apetalous flowers.',
    selectedTraits: ['Leaves opposite', 'Stinging hairs present'],
    followups: [
      {
        id: 'obs_1',
        questionId: 'q_1',
        prompt: 'Are stipules free or fused at the nodes?',
        targetOrgan: 'Stipules',
        answer: 'Not observed',
        status: 'not_observed',
      },
    ],
    observedHabitat: 'Moist riparian understory',
    locality: 'Yosemite National Park',
  };

  assert.ok(formatSpecimenSummary(sampleRecord).length > 200);

  const html = renderToStaticMarkup(
    React.createElement(GuideModule, {
      initialTaxon: 'Urticaceae',
      initialLocality: 'Yosemite National Park',
      initialSpecimenContext: formatSpecimenSummary(sampleRecord),
      initialSpecimenRecord: sampleRecord,
    })
  );

  assert.match(html, /data-testid="guide-specimen-context-banner"/);
  assert.match(html, /Specimen observations carried from Identify/);
  assert.match(html, /Erect perennial herb ~60 cm tall/);
  assert.match(html, /not independent confirmation or proof against unlisted taxa/i);
  // Ensure customFilter stays empty (0/400) rather than pre-stuffing specimen summary into short filter box
  assert.match(html, />0\/400</);
});

test('mergeObservations preserves Round 1 q_1 answer when Round 2 also uses questionId q_1 with a new prompt', () => {
  let seq = 0;
  const nextId = () => `obs_test_${++seq}`;

  const round1 = mergeObservations(
    [],
    {
      q_1: {
        questionId: 'q_1',
        prompt: 'What is the stipule arrangement at the stem nodes?',
        targetOrgan: 'Stipules',
        answer: 'Paired and free',
        status: 'observed',
      },
    },
    nextId
  );
  assert.equal(round1.length, 1);

  const round2 = mergeObservations(
    round1,
    {
      q_1: {
        questionId: 'q_1',
        prompt: 'Are male and female flowers on separate plants (dioecious)?',
        targetOrgan: 'Inflorescence',
        answer: 'Yes, separate plants',
        status: 'observed',
      },
    },
    nextId
  );

  assert.equal(round2.length, 2);
  assert.equal(round2[0].answer, 'Paired and free');
  assert.equal(round2[1].answer, 'Yes, separate plants');
  assert.notEqual(round2[0].id, round2[1].id);
});

test('auditIdentifyEvidence filters ungrounded measurements/unobserved fruits and downgrades unsupported species rank', () => {
  const specimen: SpecimenRecord = {
    notes: 'Herbaceous twiners along fence with milky sap and no mature fruits present.',
    selectedTraits: ['Leaves alternate'],
    followups: [
      {
        id: 'obs_1',
        questionId: 'q_1',
        prompt: 'Are mature fruits present?',
        targetOrgan: 'Fruit',
        answer: 'Not observed',
        status: 'not_observed',
      },
    ],
  };

  const ungroundedModelResult: IdentifyResult = {
    ...makeSpeciesResolvedResult(),
    supported_identification: {
      status: 'resolved_to_rank',
      taxon_name: 'Calystegia sepium',
      rank: 'species',
      family: 'Convolvulaceae',
      genus: 'Calystegia',
      statement: 'Identification supported: Calystegia sepium.',
      why_it_stops_here: 'Distinctive floral bracts and fruit.',
    },
    supporting_evidence: [
      'Large 14 mm globose smooth berry',
      'Opposite palmately veined bracts',
    ],
  };

  const audited = auditIdentifyEvidence(ungroundedModelResult, specimen);
  assert.equal(audited.supported_identification.rank, 'genus');
  assert.equal(audited.supported_identification.taxon_name, 'Calystegia');
  assert.ok((audited.evidence_audit?.ungroundedClaims.length || 0) >= 1);
  assert.ok(
    audited.finer_hypotheses?.some((h) => h.taxon_name === 'Calystegia sepium' && h.rank === 'species')
  );

  const html = renderToStaticMarkup(
    React.createElement(IdentifyResultView, {
      result: audited,
      sources: [],
      recordedObservations: specimen.followups,
      draftAnswers: {},
      onSelectDraftAnswer: () => {},
      onClearDraftAnswer: () => {},
      onUpdateRecordedObservation: () => {},
      onRemoveRecordedObservation: () => {},
      onSubmitFollowups: () => {},
      onCompareCandidates: () => {},
      isUpdating: false,
      onNavigate: () => {},
    })
  );
  assert.match(html, /data-testid="identify-evidence-audit-banner"/);
  assert.match(html, /Supported rank adjusted from species after evidence check/);
  assert.match(html, /withheld because supporting evidence referenced characters not present/);
});
