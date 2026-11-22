import {
  IdentifyRank,
  IdentifyResult,
  SpecimenRecord,
} from '../types';

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'onto', 'over', 'under',
  'are', 'was', 'were', 'has', 'have', 'had', 'not', 'but', 'all', 'one', 'two', 'three',
  'plant', 'plants', 'specimen', 'specimens', 'character', 'characters', 'feature', 'features',
  'observed', 'observation', 'observations', 'supplied', 'notes', 'present', 'showing',
  'appear', 'appears', 'visible', 'typical', 'generally', 'typically', 'likely', 'consistent',
  'tall', 'short', 'long', 'small', 'large', 'tiny',
]);

const SYNONYM_EQUIVALENTS: Record<string, string[]> = {
  trichome: ['hair', 'hairs', 'hairy', 'stinging', 'pubescent', 'glabrous', 'indumentum'],
  hair: ['trichome', 'trichomes', 'stinging', 'pubescent', 'indumentum'],
  hairs: ['trichome', 'trichomes', 'stinging', 'pubescent', 'indumentum'],
  stinging: ['trichome', 'trichomes', 'urticating', 'hair', 'hairs'],
  petal: ['corolla', 'cruciform', 'merous', 'apetalous'],
  petals: ['corolla', 'cruciform', 'merous', 'apetalous'],
  corolla: ['petal', 'petals', 'cruciform', 'flower', 'flowers'],
  cruciform: ['cross', 'petal', 'petals', 'merous'],
  cross: ['cruciform', 'petal', 'petals'],
  sepal: ['calyx'],
  calyx: ['sepal', 'sepals'],
  stamen: ['stamens', 'tetradynamous', 'anther', 'anthers'],
  stamens: ['stamen', 'tetradynamous', 'anther', 'anthers'],
  tetradynamous: ['stamen', 'stamens', 'long', 'short'],
  leaf: ['leaves', 'foliage', 'blade', 'cauline', 'basal', 'leaflet', 'leaflets', 'pinnate'],
  leaves: ['leaf', 'foliage', 'blade', 'cauline', 'basal', 'leaflet', 'leaflets', 'pinnate'],
  serrate: ['toothed', 'dentate', 'margin', 'coarsely', 'finely'],
  toothed: ['serrate', 'dentate', 'margin'],
  sap: ['exudate', 'latex', 'milky', 'watery'],
  exudate: ['sap', 'latex', 'milky', 'watery'],
  latex: ['sap', 'exudate', 'milky'],
  flower: ['flowers', 'floral', 'inflorescence', 'raceme', 'panicle', 'cluster', 'clusters', 'unisexual', 'apetalous'],
  flowers: ['flower', 'floral', 'inflorescence', 'raceme', 'panicle', 'cluster', 'clusters', 'unisexual', 'apetalous'],
  inflorescence: ['flower', 'flowers', 'raceme', 'panicle', 'umbel', 'cluster', 'clusters', 'axillary'],
  raceme: ['flower', 'flowers', 'inflorescence', 'cluster'],
  panicle: ['flower', 'flowers', 'inflorescence', 'cluster'],
  fruit: ['fruits', 'silique', 'silicle', 'drupe', 'achene', 'berry', 'capsule', 'samara', 'nut', 'pod', 'drupelet', 'drupelets'],
  fruits: ['fruit', 'silique', 'silicle', 'drupe', 'achene', 'berry', 'capsule', 'samara', 'nut', 'pod'],
  silique: ['fruit', 'fruits', 'pod'],
  silicle: ['fruit', 'fruits', 'pod'],
  drupe: ['fruit', 'fruits', 'drupelet', 'drupelets'],
  stem: ['stems', 'primocane', 'shoot', 'square', 'angled', 'herbaceous', 'woody'],
  angled: ['square', 'stem'],
  square: ['angled', 'stem'],
  riparian: ['river', 'stream', 'moist', 'wet', 'damp', 'understory', 'meadow', 'woodland'],
  moist: ['damp', 'wet', 'riparian', 'river'],
};

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
}

function expandWithSynonyms(tokens: string[]): Set<string> {
  const expanded = new Set<string>();
  for (const t of tokens) {
    expanded.add(t);
    if (t.length > 4 && t.endsWith('s')) {
      expanded.add(t.slice(0, -1));
    }
    const syns = SYNONYM_EQUIVALENTS[t];
    if (syns) {
      for (const s of syns) expanded.add(s);
    }
  }
  return expanded;
}

function extractMetrics(text: string): string[] {
  const matches = text.toLowerCase().match(/\b\d+(?:\.\d+)?(?:\s*[–-]\s*\d+(?:\.\d+)?)?\s*(?:mm|cm|dm|m|µm)\b/g);
  return (matches || []).map((m) => m.replace(/\s+/g, ''));
}

function extractNumericValues(text: string): Set<string> {
  const nums = text.match(/\b\d+(?:\.\d+)?\b/g) || [];
  return new Set(nums);
}

const FRUIT_KEYWORDS = ['fruit', 'fruits', 'drupe', 'berry', 'capsule', 'achene', 'samara', 'silique', 'silicle', 'nut', 'pod', 'seed', 'seeds'];
const FLOWER_KEYWORDS = ['petal', 'petals', 'sepal', 'sepals', 'corolla', 'calyx', 'stamen', 'stamens', 'pistil', 'ovary', 'anther', 'flower', 'flowers', 'floret'];

function detectsNegatedOrUnexaminedOrgan(record: SpecimenRecord): {
  fruitsAbsentOrUnobserved: boolean;
  flowersAbsentOrUnobserved: boolean;
} {
  const notesLower = (record.notes || '').toLowerCase();
  const notObservedPrompts = record.followups
    .filter((f) => f.status === 'not_observed' || f.status === 'unsure')
    .map((f) => `${f.targetOrgan || ''} ${f.prompt}`.toLowerCase())
    .join(' ');

  const positiveFollowupsLower = record.followups
    .filter((f) => f.status === 'observed')
    .map((f) => `${f.targetOrgan || ''} ${f.answer}`.toLowerCase())
    .join(' ');

  const positiveTraitsLower = record.selectedTraits.join(' ').toLowerCase();

  const notesDenyFruit =
    /\b(?:no|without|lack(?:ing)?)\s+(?:mature\s+)?fruits?\b|\bfruits?\s+(?:not\s+(?:seen|observed|present)|absent|unavailable)\b/.test(
      notesLower
    );
  const followupMarksFruitMissing = /\b(?:fruit|silique|silicle|capsule|drupe|achene|samara|seed)\b/.test(
    notObservedPrompts
  );
  const positiveFruitEvidence =
    /\b(?:fruit|silique|silicle|capsule|drupe|achene|samara|pod|drupelet)\b/.test(
      `${positiveFollowupsLower} ${positiveTraitsLower}`
    );

  const notesDenyFlower =
    /\b(?:no|without|lack(?:ing)?)\s+flowers?\b|\bflowers?\s+(?:not\s+(?:seen|observed|present)|absent|unavailable)\b/.test(
      notesLower
    );
  const followupMarksFlowerMissing = /\b(?:flower|petal|corolla|stamen|anther|calyx|sepal)\b/.test(
    notObservedPrompts
  );
  const positiveFlowerEvidence =
    /\b(?:flower|petal|corolla|stamen|anther|calyx|sepal|inflorescence|4-merous|5-merous)\b/.test(
      `${positiveFollowupsLower} ${positiveTraitsLower}`
    );

  return {
    fruitsAbsentOrUnobserved: (notesDenyFruit || followupMarksFruitMissing) && !positiveFruitEvidence,
    flowersAbsentOrUnobserved: (notesDenyFlower || followupMarksFlowerMissing) && !positiveFlowerEvidence,
  };
}

export function formatSpecimenSummary(record: SpecimenRecord): string {
  const parts: string[] = [];
  if (record.notes?.trim()) {
    parts.push(`Notes: ${record.notes.trim()}`);
  }
  if (record.selectedTraits.length > 0) {
    parts.push(`Traits: ${record.selectedTraits.join(', ')}`);
  }
  const observed = record.followups.filter((f) => f.status === 'observed');
  if (observed.length > 0) {
    parts.push(
      `Observed follow-ups: ${observed
        .map((o) => `${o.targetOrgan ? `${o.targetOrgan}: ` : ''}${o.answer}`)
        .join('; ')}`
    );
  }
  const missing = record.followups.filter((f) => f.status !== 'observed');
  if (missing.length > 0) {
    parts.push(`Not observed / unsure: ${missing.map((o) => o.targetOrgan || o.prompt).join('; ')}`);
  }
  if (record.observedHabitat?.trim()) {
    parts.push(`Habitat: ${record.observedHabitat.trim()}`);
  }
  return parts.join(' | ');
}

/**
 * Audits model identification evidence against what the user actually submitted.
 * Filters out claims introducing ungrounded measurements or unexamined organs,
 * and downgrades an unsupported species conclusion to the broadest defensible rank.
 */
export function auditIdentifyEvidence(
  result: IdentifyResult,
  specimen: SpecimenRecord
): IdentifyResult {
  const suppliedParts: string[] = [];
  if (specimen.notes) suppliedParts.push(specimen.notes);
  if (specimen.selectedTraits.length > 0) suppliedParts.push(specimen.selectedTraits.join(' '));
  if (specimen.observedHabitat) suppliedParts.push(specimen.observedHabitat);
  if (specimen.locality) suppliedParts.push(specimen.locality);
  for (const f of specimen.followups) {
    if (f.status === 'observed') {
      suppliedParts.push(`${f.targetOrgan || ''} ${f.prompt} ${f.answer}`);
    }
  }

  const suppliedCorpus = suppliedParts.join(' ');
  const suppliedTokens = expandWithSynonyms(tokenize(suppliedCorpus));
  const suppliedMetrics = extractMetrics(suppliedCorpus);
  const suppliedNumbers = extractNumericValues(suppliedCorpus);
  const { fruitsAbsentOrUnobserved, flowersAbsentOrUnobserved } =
    detectsNegatedOrUnexaminedOrgan(specimen);

  const groundedClaims: string[] = [];
  const ungroundedClaims: string[] = [];

  for (const claim of result.supporting_evidence) {
    const claimTokens = tokenize(claim);
    const claimMetrics = extractMetrics(claim);
    const claimNumbers = extractNumericValues(claim);

    // 1. Reject claims asserting metric dimensions absent from submitted notes/answers
    const hasInventedMetric = claimMetrics.some((metric) => {
      const normalized = metric.replace(/\s+/g, '');
      if (suppliedMetrics.includes(normalized)) return false;
      const metricNums = extractMetrics(metric).flatMap((m) => Array.from(extractNumericValues(m)));
      return metricNums.some((num) => !suppliedNumbers.has(num));
    });
    if (hasInventedMetric || (claimNumbers.size > 0 && claimMetrics.length > 0 && Array.from(claimNumbers).every((n) => !suppliedNumbers.has(n)))) {
      ungroundedClaims.push(claim);
      continue;
    }

    // 2. Reject positive claims about an organ explicitly marked Not observed / absent
    const claimsFruit = claimTokens.some((t) => FRUIT_KEYWORDS.includes(t));
    const claimsFlower = claimTokens.some((t) => FLOWER_KEYWORDS.includes(t));
    const claimAcknowledgesAbsence = /\b(no|not|absent|without|missing|unobserved)\b/i.test(claim);

    if (!claimAcknowledgesAbsence && fruitsAbsentOrUnobserved && claimsFruit) {
      ungroundedClaims.push(claim);
      continue;
    }
    if (!claimAcknowledgesAbsence && flowersAbsentOrUnobserved && claimsFlower) {
      ungroundedClaims.push(claim);
      continue;
    }

    // 3. Require meaningful token overlap with supplied text
    const hasOverlap =
      claimTokens.length === 0 ||
      claimTokens.some((token) => suppliedTokens.has(token) || (token.length > 4 && suppliedTokens.has(token.slice(0, -1))));

    if (hasOverlap) {
      groundedClaims.push(claim);
    } else {
      ungroundedClaims.push(claim);
    }
  }

  // If no claims had overlap OR a species conclusion relied purely on ungrounded claims,
  // withhold species resolution and step back cleanly to genus / family / unresolved.
  const sup = result.supported_identification;
  const shouldDowngradeSpecies =
    sup.rank === 'species' &&
    sup.status === 'resolved_to_rank' &&
    (groundedClaims.length === 0 ||
      (ungroundedClaims.length > 0 && groundedClaims.length <= ungroundedClaims.length && result.candidates.length > 1));

  if (!shouldDowngradeSpecies && ungroundedClaims.length === 0) {
    return result;
  }

  if (shouldDowngradeSpecies) {
    const inferredGenus =
      sup.genus ||
      (sup.taxon_name.includes(' ') ? sup.taxon_name.split(' ')[0] : undefined) ||
      result.candidates.find((c) => c.rank === 'genus')?.name;
    const inferredFamily =
      sup.family || result.candidates.find((c) => c.parent_family)?.parent_family;

    const fallbackRank: IdentifyRank = inferredGenus
      ? 'genus'
      : inferredFamily
      ? 'family'
      : 'unresolved';
    const fallbackTaxon =
      fallbackRank === 'genus'
        ? inferredGenus!
        : fallbackRank === 'family'
        ? inferredFamily!
        : 'Unresolved';

    const existingHypotheses = result.finer_hypotheses || [];
    const hasSpeciesHypothesis = existingHypotheses.some(
      (h) => h.taxon_name.toLowerCase() === sup.taxon_name.toLowerCase()
    );
    const updatedHypotheses = hasSpeciesHypothesis
      ? existingHypotheses
      : [
          {
            taxon_name: sup.taxon_name,
            rank: 'species' as const,
            rationale:
              groundedClaims.length > 0
                ? `Partially consistent with supplied observations (${groundedClaims.join('; ')}).`
                : 'Suggested possibility, but key distinguishing characters were not verified in the supplied notes.',
            missing_or_unverified:
              ungroundedClaims.length > 0
                ? `Unverified / absent from supplied observations: ${ungroundedClaims.join('; ')}`
                : 'Distinguishing species-level traits were not supplied.',
          },
          ...existingHypotheses,
        ];

    const reason =
      ungroundedClaims.length > 0
        ? `Species identification (${sup.taxon_name}) was withheld because supporting evidence referenced characters not present in the submitted record (${ungroundedClaims.join('; ')}).`
        : `Species identification (${sup.taxon_name}) was withheld because distinguishing species characters were not found in the submitted observations.`;

    return {
      ...result,
      supported_identification: {
        ...sup,
        status: fallbackRank === 'unresolved' ? 'unresolved' : 'resolved_to_rank',
        taxon_name: fallbackTaxon,
        authority: undefined,
        rank: fallbackRank,
        genus: fallbackRank === 'genus' ? fallbackTaxon : undefined,
        family: inferredFamily,
        statement:
          fallbackRank === 'unresolved'
            ? 'Taxon remains unresolved from the supplied observations.'
            : `Identification supported to ${fallbackRank}: ${fallbackTaxon}. Species remains unresolved.`,
        why_it_stops_here: reason,
        limitations_note:
          sup.limitations_note ||
          'Examine the remaining missing characters below to separate candidate species.',
      },
      finer_hypotheses: updatedHypotheses,
      supporting_evidence: groundedClaims,
      evidence_audit: {
        downgradedFrom: 'species',
        reason,
        ungroundedClaims,
      },
    };
  }

  return {
    ...result,
    supporting_evidence: groundedClaims,
    evidence_audit: {
      ungroundedClaims,
      reason: `Filtered ${ungroundedClaims.length} supporting statement${
        ungroundedClaims.length === 1 ? '' : 's'
      } not found in the supplied specimen record.`,
    },
  };
}
