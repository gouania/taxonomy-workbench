import {
  CandidateAssessment,
  CandidateTaxon,
  DichotomousKeyCouplet,
  ExamineNextStep,
  FinerHypothesis,
  FollowUpQuestion,
  GeneratedGuideStructured,
  GroundingSource,
  GuideCharacterRow,
  GuideSubsetComparison,
  IdentifyRank,
  IdentifyResult,
  KeyValidationIssue,
  KeyValidationReport,
  LiteratureItem,
  SourceProvenance,
  SpeciesProfile,
} from '../types';

const VALID_IMPORTANCE_LEVELS = new Set(['Decisive', 'Strong', 'Secondary', 'Shared']);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Strictly parses JSON model output, rejecting empty, truncated, or unparseable payloads
 * instead of silently returning `{}`.
 */
export function parseJsonStrict<T>(text: string, contextLabel: string): T {
  if (!text || !text.trim()) {
    throw new Error(`Empty response received from model while generating ${contextLabel}. Please retry.`);
  }

  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  }

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const extracted = cleaned.substring(firstBrace, lastBrace + 1);
      try {
        return JSON.parse(extracted) as T;
      } catch {
        const sanitized = extracted
          .replace(/,\s*([}\]])/g, '$1')
          .replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ');
        try {
          return JSON.parse(sanitized) as T;
        } catch {
          // Fall through to throw actionable error
        }
      }
    }

    const firstBracket = cleaned.indexOf('[');
    const lastBracket = cleaned.lastIndexOf(']');
    if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
      const extracted = cleaned.substring(firstBracket, lastBracket + 1);
      try {
        return JSON.parse(extracted) as T;
      } catch {
        // Fall through to throw actionable error
      }
    }

    throw new Error(
      `Malformed JSON output from model during ${contextLabel}. The response could not be parsed cleanly—please try regenerating.`
    );
  }
}

export function normalizeCoupletId(id: string): string {
  return id.trim().replace(/^couplet\s+/i, '').replace(/\.$/, '').trim().toLowerCase();
}

export function normalizeTaxonName(name: string): string {
  return name
    .replace(/[\*\_\"\'\`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function stripTrailingParenthetical(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*$/, '').trim();
}

/**
 * Determines whether a lead destination points to another couplet rather than a terminal taxon.
 */
export function isCoupletPointer(destination: string, knownCoupletIds: Set<string>): boolean {
  const cleaned = destination.trim().replace(/^couplet\s+/i, '').replace(/\.$/, '').trim();
  if (!cleaned) return false;
  if (knownCoupletIds.has(cleaned.toLowerCase())) return true;
  // Numeric couplet pointer pattern (e.g. "2", "14", "3b") or explicit "Couplet N" prefix
  if (/^couplet\s+\S+/i.test(destination.trim())) return true;
  if (/^\d+[a-zA-Z]?$/.test(cleaned)) return true;
  return false;
}

function matchesCandidateTaxonString(dest: string, destNoParens: string, candidate: string): boolean {
  const sci = normalizeTaxonName(candidate);
  if (!sci) return false;
  if (dest === sci || destNoParens === sci) {
    return true;
  }
  if (destNoParens.startsWith(`${sci} `) || destNoParens.startsWith(`${sci},`)) {
    return true;
  }
  if (sci.startsWith(`${destNoParens} `) && destNoParens.includes(' ')) {
    return true;
  }
  return false;
}

/**
 * Matches a terminal key destination against treated species_profiles, including accepted_name and synonyms/aliases.
 */
export function findMatchingSpeciesProfile(
  destination: string,
  speciesProfiles: SpeciesProfile[]
): SpeciesProfile | null {
  const cleanDest = normalizeTaxonName(destination);
  if (!cleanDest) return null;
  const cleanDestNoParens = stripTrailingParenthetical(cleanDest);

  for (const sp of speciesProfiles) {
    const namesToCheck = [
      sp.scientific_name,
      sp.accepted_name,
      ...(Array.isArray(sp.synonyms) ? sp.synonyms : []),
    ].filter((n): n is string => typeof n === 'string' && n.trim().length > 0);

    if (namesToCheck.some((n) => matchesCandidateTaxonString(cleanDest, cleanDestNoParens, n))) {
      return sp;
    }
  }
  return null;
}

/**
 * Validates the structural integrity of a dichotomous key independently from botanical accuracy.
 * Checks: duplicate couplet IDs, missing destinations, cycles, unknown terminal taxa,
 * unreachable treated taxa, and unreachable couplets.
 */
export function validateDichotomousKey(
  keyItems: DichotomousKeyCouplet[],
  speciesProfiles: SpeciesProfile[]
): KeyValidationReport {
  const issues: KeyValidationIssue[] = [];
  const duplicateCoupletIds: string[] = [];
  const missingDestinations: string[] = [];
  const cycles: string[][] = [];
  const unknownTerminalTaxa: string[] = [];
  const unreachableCouplets: string[] = [];
  const reachableTaxaSet = new Set<string>();

  if (!Array.isArray(keyItems) || keyItems.length === 0) {
    issues.push({
      category: 'missing_destination',
      severity: 'error',
      message: 'Dichotomous key contains no couplets.',
    });
    return {
      isStructurallyValid: false,
      checkedCoupletCount: 0,
      treatedTaxaCount: speciesProfiles.length,
      reachableTaxa: [],
      unreachableTaxa: speciesProfiles.map((s) => s.scientific_name),
      duplicateCoupletIds,
      missingDestinations,
      cycles,
      unknownTerminalTaxa,
      unreachableCouplets,
      issues,
      validityNote:
        'Key structure invalid: no couplets are present. Structural validation checks linkage completeness separately from botanical accuracy.',
    };
  }

  // 1. Index couplets & detect duplicate IDs
  const coupletMap = new Map<string, DichotomousKeyCouplet>();
  const seenCounts = new Map<string, number>();

  for (const couplet of keyItems) {
    const normId = normalizeCoupletId(couplet.couplet_id || '');
    const count = (seenCounts.get(normId) || 0) + 1;
    seenCounts.set(normId, count);
    if (count === 1) {
      coupletMap.set(normId, couplet);
    } else if (count === 2) {
      const displayId = (couplet.couplet_id || '').trim();
      duplicateCoupletIds.push(displayId);
      issues.push({
        category: 'duplicate_couplet',
        severity: 'error',
        coupletId: displayId,
        message: `Duplicate couplet ID "${displayId}" appears multiple times in the key.`,
      });
    }
  }

  const knownCoupletIds = new Set(coupletMap.keys());
  const rootCouplet =
    (coupletMap.has('1') ? coupletMap.get('1') : keyItems[0]) || keyItems[0];
  const rootNormId = normalizeCoupletId(rootCouplet.couplet_id);

  // 2. DFS traversal from root couplet to detect missing destinations, cycles, unknown terminals, and reachability
  const visitedCouplets = new Set<string>();
  const visitingStack = new Set<string>();
  const currentPath: string[] = [];
  const recordedMissingKeys = new Set<string>();
  const recordedUnknownTerminals = new Set<string>();
  const recordedCycleSignatures = new Set<string>();

  const inspectLead = (
    fromCouplet: DichotomousKeyCouplet,
    leadKey: 'a' | 'b',
    destinationRaw: string
  ) => {
    const destTrimmed = (destinationRaw || '').trim();
    if (!destTrimmed) {
      const sig = `${fromCouplet.couplet_id}:${leadKey}:empty`;
      if (!recordedMissingKeys.has(sig)) {
        recordedMissingKeys.add(sig);
        missingDestinations.push(`(empty destination at ${fromCouplet.couplet_id}${leadKey})`);
        issues.push({
          category: 'missing_destination',
          severity: 'error',
          coupletId: fromCouplet.couplet_id,
          lead: leadKey,
          destination: '',
          message: `Couplet ${fromCouplet.couplet_id}${leadKey} has an empty destination.`,
        });
      }
      return;
    }

    if (isCoupletPointer(destTrimmed, knownCoupletIds)) {
      const targetNormId = normalizeCoupletId(destTrimmed);
      if (!coupletMap.has(targetNormId)) {
        const sig = `${fromCouplet.couplet_id}:${leadKey}:${targetNormId}`;
        if (!recordedMissingKeys.has(sig)) {
          recordedMissingKeys.add(sig);
          missingDestinations.push(destTrimmed);
          issues.push({
            category: 'missing_destination',
            severity: 'error',
            coupletId: fromCouplet.couplet_id,
            lead: leadKey,
            destination: destTrimmed,
            message: `Couplet ${fromCouplet.couplet_id}${leadKey} points to missing couplet "${destTrimmed}".`,
          });
        }
        return;
      }

      if (visitingStack.has(targetNormId)) {
        const cycleStartIdx = currentPath.findIndex(
          (id) => normalizeCoupletId(id) === targetNormId
        );
        const cyclePath = [
          ...(cycleStartIdx >= 0 ? currentPath.slice(cycleStartIdx) : currentPath),
          coupletMap.get(targetNormId)!.couplet_id,
        ];
        const sig = cyclePath.map(normalizeCoupletId).join('->');
        if (!recordedCycleSignatures.has(sig)) {
          recordedCycleSignatures.add(sig);
          cycles.push(cyclePath);
          issues.push({
            category: 'cycle',
            severity: 'error',
            coupletId: fromCouplet.couplet_id,
            lead: leadKey,
            destination: destTrimmed,
            message: `Cycle detected in key: ${cyclePath.join(' → ')}.`,
          });
        }
        return;
      }

      if (!visitedCouplets.has(targetNormId)) {
        traverse(targetNormId);
      }
    } else {
      const matched = findMatchingSpeciesProfile(destTrimmed, speciesProfiles);
      if (matched) {
        reachableTaxaSet.add(matched.scientific_name);
      } else {
        const normTerm = normalizeTaxonName(destTrimmed);
        if (!recordedUnknownTerminals.has(normTerm)) {
          recordedUnknownTerminals.add(normTerm);
          unknownTerminalTaxa.push(destTrimmed);
          issues.push({
            category: 'unknown_terminal',
            severity: 'error',
            coupletId: fromCouplet.couplet_id,
            lead: leadKey,
            destination: destTrimmed,
            taxonName: destTrimmed,
            message: `Couplet ${fromCouplet.couplet_id}${leadKey} terminates at "${destTrimmed}", which does not match any treated taxon in this guide.`,
          });
        }
      }
    }
  };

  const traverse = (normId: string) => {
    const couplet = coupletMap.get(normId);
    if (!couplet) return;

    visitedCouplets.add(normId);
    visitingStack.add(normId);
    currentPath.push(couplet.couplet_id);

    inspectLead(couplet, 'a', couplet.lead_a?.destination || '');
    inspectLead(couplet, 'b', couplet.lead_b?.destination || '');

    currentPath.pop();
    visitingStack.delete(normId);
  };

  traverse(rootNormId);

  // 3. Also inspect unreachable couplets for internal broken links/cycles/unknowns and flag unreachable couplets
  for (const [normId, couplet] of coupletMap.entries()) {
    if (!visitedCouplets.has(normId)) {
      unreachableCouplets.push(couplet.couplet_id);
      issues.push({
        category: 'unreachable_couplet',
        severity: 'error',
        coupletId: couplet.couplet_id,
        message: `Couplet ${couplet.couplet_id} is unreachable from Couplet ${rootCouplet.couplet_id}.`,
      });
    }
  }

  // 4. Identify treated taxa never reached by any terminal lead
  const reachableTaxa: string[] = [];
  const unreachableTaxa: string[] = [];

  for (const sp of speciesProfiles) {
    if (reachableTaxaSet.has(sp.scientific_name)) {
      reachableTaxa.push(sp.scientific_name);
    } else {
      unreachableTaxa.push(sp.scientific_name);
      issues.push({
        category: 'unreachable_taxon',
        severity: 'error',
        taxonName: sp.scientific_name,
        message: `Treated taxon "${sp.scientific_name}" cannot be reached through the dichotomous key.`,
      });
    }
  }

  const isStructurallyValid = issues.length === 0;
  const validityNote = isStructurallyValid
    ? `Structurally complete key (${keyItems.length} couplets; all ${speciesProfiles.length} treated taxa reachable from Couplet ${rootCouplet.couplet_id}). Structural validity verifies key graph linkage only—verify botanical accuracy against regional Floras and specimens.`
    : `Key has ${issues.length} structural issue${issues.length === 1 ? '' : 's'} preventing reliable traversal (${
        [
          duplicateCoupletIds.length ? `${duplicateCoupletIds.length} duplicate ID` : '',
          missingDestinations.length ? `${missingDestinations.length} missing destination` : '',
          cycles.length ? `${cycles.length} cycle` : '',
          unknownTerminalTaxa.length ? `${unknownTerminalTaxa.length} unknown terminal` : '',
          unreachableTaxa.length ? `${unreachableTaxa.length} unreachable taxon` : '',
          unreachableCouplets.length ? `${unreachableCouplets.length} unreachable couplet` : '',
        ]
          .filter(Boolean)
          .join(', ')
      }). Structural validity checks graph completeness separately from botanical accuracy.`;

  return {
    isStructurallyValid,
    checkedCoupletCount: keyItems.length,
    treatedTaxaCount: speciesProfiles.length,
    reachableTaxa,
    unreachableTaxa,
    duplicateCoupletIds,
    missingDestinations,
    cycles,
    unknownTerminalTaxa,
    unreachableCouplets,
    issues,
    validityNote,
  };
}

/**
 * Runtime validation for a structured identification guide response.
 * Throws an actionable error if the payload is missing required structures.
 */
export function validateStructuredGuide(raw: unknown): GeneratedGuideStructured {
  if (!isPlainObject(raw)) {
    throw new Error('Malformed guide response: expected a JSON object.');
  }

  const errors: string[] = [];

  const metaRaw = raw.guide_metadata;
  if (!isPlainObject(metaRaw)) {
    errors.push("missing 'guide_metadata' object");
  }

  const targetTaxon = isPlainObject(metaRaw) ? asNonEmptyString(metaRaw.target_taxon) : null;
  const targetLocality = isPlainObject(metaRaw) ? asNonEmptyString(metaRaw.target_locality) : null;
  const verificationSummary = isPlainObject(metaRaw)
    ? asNonEmptyString(metaRaw.verification_summary)
    : null;

  if (isPlainObject(metaRaw)) {
    if (!targetTaxon) errors.push("missing 'guide_metadata.target_taxon'");
    if (!targetLocality) errors.push("missing 'guide_metadata.target_locality'");
    if (!verificationSummary) errors.push("missing 'guide_metadata.verification_summary'");
  }

  const taxonOverview = asNonEmptyString(raw.taxon_overview);
  if (!taxonOverview) {
    errors.push("missing or empty 'taxon_overview'");
  }

  const rawProfiles = raw.species_profiles;
  const validProfiles: SpeciesProfile[] = [];
  if (!Array.isArray(rawProfiles) || rawProfiles.length === 0) {
    errors.push("'species_profiles' must be a non-empty array");
  } else {
    rawProfiles.forEach((item, idx) => {
      if (!isPlainObject(item)) {
        errors.push(`species_profiles[${idx}] is not an object`);
        return;
      }
      const sciName = asNonEmptyString(item.scientific_name);
      const habitat = asNonEmptyString(item.habitat_and_ecology);
      const diagnostics = asNonEmptyString(item.key_diagnostics);
      if (!sciName || !habitat || !diagnostics) {
        errors.push(
          `species_profiles[${idx}] is missing required fields (scientific_name, habitat_and_ecology, key_diagnostics)`
        );
        return;
      }
      const synonyms = Array.isArray(item.synonyms)
        ? item.synonyms.map((s) => asNonEmptyString(s)).filter((s): s is string => s !== null)
        : undefined;
      const sourceUrls = Array.isArray(item.source_urls)
        ? item.source_urls.map((u) => asNonEmptyString(u)).filter((u): u is string => u !== null)
        : undefined;
      validProfiles.push({
        scientific_name: sciName,
        accepted_name: asNonEmptyString(item.accepted_name) || undefined,
        synonyms: synonyms && synonyms.length > 0 ? synonyms : undefined,
        common_name: asNonEmptyString(item.common_name),
        habitat_and_ecology: habitat,
        key_diagnostics: diagnostics,
        source_urls: sourceUrls && sourceUrls.length > 0 ? sourceUrls : undefined,
      });
    });
  }

  const rawKey = raw.dichotomous_key;
  const validKey: DichotomousKeyCouplet[] = [];
  if (!Array.isArray(rawKey) || rawKey.length === 0) {
    errors.push("'dichotomous_key' must be a non-empty array");
  } else {
    rawKey.forEach((item, idx) => {
      if (!isPlainObject(item)) {
        errors.push(`dichotomous_key[${idx}] is not an object`);
        return;
      }
      const coupletId = asNonEmptyString(item.couplet_id);
      const leadA = isPlainObject(item.lead_a) ? item.lead_a : null;
      const leadB = isPlainObject(item.lead_b) ? item.lead_b : null;
      const leadAStmt = leadA ? asNonEmptyString(leadA.statement) : null;
      const leadADest = leadA ? asNonEmptyString(leadA.destination) : null;
      const leadBStmt = leadB ? asNonEmptyString(leadB.statement) : null;
      const leadBDest = leadB ? asNonEmptyString(leadB.destination) : null;

      if (!coupletId || !leadAStmt || !leadADest || !leadBStmt || !leadBDest) {
        errors.push(
          `dichotomous_key[${idx}] is missing couplet_id or lead_a/lead_b statement and destination`
        );
        return;
      }

      const coupletSourceUrls = Array.isArray(item.source_urls)
        ? item.source_urls.map((u) => asNonEmptyString(u)).filter((u): u is string => u !== null)
        : undefined;

      validKey.push({
        couplet_id: coupletId,
        lead_a: { statement: leadAStmt, destination: leadADest },
        lead_b: { statement: leadBStmt, destination: leadBDest },
        source_urls: coupletSourceUrls && coupletSourceUrls.length > 0 ? coupletSourceUrls : undefined,
      });
    });
  }

  let fieldDocs: string[] | undefined;
  if (raw.field_documentation_guide !== undefined) {
    if (!Array.isArray(raw.field_documentation_guide)) {
      errors.push("'field_documentation_guide' must be an array of strings");
    } else {
      fieldDocs = raw.field_documentation_guide
        .map((item) => asNonEmptyString(item))
        .filter((s): s is string => s !== null);
    }
  }

  let literature: LiteratureItem[] | undefined;
  if (raw.recommended_literature !== undefined) {
    if (!Array.isArray(raw.recommended_literature)) {
      errors.push("'recommended_literature' must be an array");
    } else {
      literature = raw.recommended_literature
        .filter((item): item is Record<string, unknown> => isPlainObject(item))
        .map((item) => {
          const citation = asNonEmptyString(item.citation);
          if (!citation) return null;
          const entry: LiteratureItem = {
            citation,
            type: asNonEmptyString(item.type) || undefined,
            scope: asNonEmptyString(item.scope) || undefined,
            notes: asNonEmptyString(item.notes) || undefined,
            url: asNonEmptyString(item.url) || undefined,
          };
          return entry;
        })
        .filter((item): item is LiteratureItem => item !== null);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Malformed Guide response: ${errors.join('; ')}. Please try generating again.`);
  }

  const keyValidation = validateDichotomousKey(validKey, validProfiles);

  return {
    guide_metadata: {
      target_taxon: targetTaxon!,
      target_locality: targetLocality!,
      verification_summary: verificationSummary!,
      coverage_scope: isPlainObject(metaRaw)
        ? asNonEmptyString(metaRaw.coverage_scope) || undefined
        : undefined,
      total_taxa_treated:
        isPlainObject(metaRaw) && typeof metaRaw.total_taxa_treated === 'number'
          ? metaRaw.total_taxa_treated
          : validProfiles.length,
    },
    taxon_overview: taxonOverview!,
    species_profiles: validProfiles,
    dichotomous_key: validKey,
    field_documentation_guide: fieldDocs,
    recommended_literature: literature,
    key_validation: keyValidation,
    ...(Array.isArray(raw.grounding_supports)
      ? { grounding_supports: raw.grounding_supports as import('../types').GroundingSupportSpan[] }
      : {}),
    ...(isPlainObject(raw.taxon_concept)
      ? { taxon_concept: raw.taxon_concept as unknown as import('../types').TaxonConceptHandoff }
      : {}),
  };
}

/**
 * Runtime validation for a subset comparison response.
 * Rejects empty or malformed payloads instead of letting partial objects reach the UI.
 */
export function validateSubsetComparison(raw: unknown): GuideSubsetComparison {
  if (!isPlainObject(raw)) {
    throw new Error('Malformed comparison response: expected a JSON object.');
  }

  const errors: string[] = [];

  const summary = asNonEmptyString(raw.fastest_distinction_summary);
  if (!summary) {
    errors.push("missing or empty 'fastest_distinction_summary'");
  }

  const validTaxa: GuideSubsetComparison['taxa'] = [];
  if (!Array.isArray(raw.taxa) || raw.taxa.length === 0) {
    errors.push("'taxa' must be a non-empty array");
  } else {
    raw.taxa.forEach((t, idx) => {
      if (!isPlainObject(t) || !asNonEmptyString(t.scientific_name)) {
        errors.push(`taxa[${idx}] is missing 'scientific_name'`);
        return;
      }
      validTaxa.push({
        scientific_name: asNonEmptyString(t.scientific_name)!,
        common_name: asNonEmptyString(t.common_name),
        family: asNonEmptyString(t.family) || undefined,
      });
    });
  }

  const validExamine: GuideSubsetComparison['what_to_examine_next'] = [];
  if (!Array.isArray(raw.what_to_examine_next) || raw.what_to_examine_next.length === 0) {
    errors.push("'what_to_examine_next' must be a non-empty array");
  } else {
    raw.what_to_examine_next.forEach((step, idx) => {
      if (!isPlainObject(step)) {
        errors.push(`what_to_examine_next[${idx}] is not an object`);
        return;
      }
      const action = asNonEmptyString(step.action);
      const targetOrgan = asNonEmptyString(step.target_organ);
      const expected = asNonEmptyString(step.expected_outcomes);
      if (!action || !targetOrgan || !expected) {
        errors.push(`what_to_examine_next[${idx}] is missing action, target_organ, or expected_outcomes`);
        return;
      }
      validExamine.push({
        priority: typeof step.priority === 'number' ? step.priority : idx + 1,
        action,
        target_organ: targetOrgan,
        lens_or_technique: asNonEmptyString(step.lens_or_technique) || undefined,
        expected_outcomes: expected,
      });
    });
  }

  const validRows: GuideCharacterRow[] = [];
  if (!Array.isArray(raw.matrix_rows) || raw.matrix_rows.length === 0) {
    errors.push("'matrix_rows' must be a non-empty array");
  } else {
    raw.matrix_rows.forEach((row, idx) => {
      if (!isPlainObject(row)) {
        errors.push(`matrix_rows[${idx}] is not an object`);
        return;
      }
      const charName = asNonEmptyString(row.character_name);
      const importance = asNonEmptyString(row.diagnostic_importance);
      if (!charName) {
        errors.push(`matrix_rows[${idx}] is missing 'character_name'`);
        return;
      }
      if (!importance || !VALID_IMPORTANCE_LEVELS.has(importance)) {
        errors.push(
          `matrix_rows[${idx}] has invalid 'diagnostic_importance' ("${row.diagnostic_importance}")`
        );
        return;
      }
      if (!Array.isArray(row.states) || row.states.length === 0) {
        errors.push(`matrix_rows[${idx}] must contain character states`);
        return;
      }
      const validStates = row.states
        .filter((s): s is Record<string, unknown> => isPlainObject(s))
        .map((s) => {
          const sName = asNonEmptyString(s.scientific_name);
          const sVal = asNonEmptyString(s.state);
          if (!sName || !sVal) return null;
          return {
            scientific_name: sName,
            state: sVal,
            is_uncertain: typeof s.is_uncertain === 'boolean' ? s.is_uncertain : undefined,
          };
        })
        .filter((s): s is NonNullable<typeof s> => s !== null);

      if (validStates.length === 0) {
        errors.push(`matrix_rows[${idx}] has no valid taxon state entries`);
        return;
      }

      validRows.push({
        character_name: charName,
        category: asNonEmptyString(row.category) || undefined,
        diagnostic_importance: importance as GuideCharacterRow['diagnostic_importance'],
        observation_method: asNonEmptyString(row.observation_method) || undefined,
        relevant_life_stage: asNonEmptyString(row.relevant_life_stage) || undefined,
        states: validStates,
        overlap_notes: asNonEmptyString(row.overlap_notes) || undefined,
      });
    });
  }

  let limitations: string[] = [];
  if (!Array.isArray(raw.limitations)) {
    errors.push("'limitations' must be an array");
  } else {
    limitations = raw.limitations
      .map((l) => asNonEmptyString(l))
      .filter((s): s is string => s !== null);
  }

  if (errors.length > 0) {
    throw new Error(
      `Malformed subset comparison response: ${errors.join('; ')}. Please retry the comparison.`
    );
  }

  return {
    taxa: validTaxa,
    fastest_distinction_summary: summary!,
    what_to_examine_next: validExamine,
    matrix_rows: validRows,
    limitations,
    constraints_advisory: asNonEmptyString(raw.constraints_advisory) || undefined,
    ...(isPlainObject(raw.specimen_record)
      ? { specimen_record: raw.specimen_record as unknown as import('../types').SpecimenRecord }
      : {}),
  };
}

/**
 * Runtime validation for a Places & flora (LocalityProfile) response.
 * Rejects unresolved places, empty responses, or missing core sections.
 */
export function validateLocalityProfile(raw: unknown): import('../types').LocalityProfile {
  if (!isPlainObject(raw)) {
    throw new Error('Malformed place response: expected a JSON object.');
  }

  const locRaw = raw.location_details;
  if (!isPlainObject(locRaw)) {
    throw new Error('Malformed place response: missing location_details.');
  }

  if (locRaw.is_valid_place === false) {
    const reason =
      asNonEmptyString(locRaw.resolution_warning) ||
      'Could not identify a real geographic place matching that search. Try a city, mountain, protected area, or decimal coordinates.';
    throw new Error(reason);
  }

  const resolvedName = asNonEmptyString(locRaw.resolved_name);
  if (!resolvedName) {
    throw new Error('Malformed place response: missing resolved place name.');
  }

  const allowedScopes = new Set(['point', 'locality', 'city', 'region', 'mountain', 'unknown']);
  const rawScope = asNonEmptyString(locRaw.scope_type) || 'locality';
  const scopeType = (allowedScopes.has(rawScope) ? rawScope : 'locality') as import('../types').PlaceScopeType;

  const overviewRaw = raw.botanical_overview;
  if (!isPlainObject(overviewRaw) || !asNonEmptyString(overviewRaw.summary)) {
    throw new Error('Malformed place response: missing botanical_overview summary.');
  }

  const rawHabitats = Array.isArray(overviewRaw.principal_habitats) ? overviewRaw.principal_habitats : [];
  const principalHabitats = rawHabitats
    .filter((h): h is Record<string, unknown> => isPlainObject(h))
    .map((h) => {
      const name = asNonEmptyString(h.name);
      const summary = asNonEmptyString(h.summary);
      if (!name || !summary) return null;
      return { name, summary };
    })
    .filter((h): h is { name: string; summary: string } => h !== null);

  if (principalHabitats.length === 0) {
    throw new Error('Malformed place response: botanical_overview.principal_habitats must include at least one habitat.');
  }

  const rawPlants = Array.isArray(raw.characteristic_plants) ? raw.characteristic_plants : [];
  const characteristicPlants = rawPlants
    .filter((p): p is Record<string, unknown> => isPlainObject(p))
    .map((p) => {
      const sciName = asNonEmptyString(p.scientific_name);
      if (!sciName) return null;
      return {
        scientific_name: sciName,
        common_name: asNonEmptyString(p.common_name) || undefined,
        growth_form: asNonEmptyString(p.growth_form) || 'Other',
        habitat_association: asNonEmptyString(p.habitat_association) || 'General local habitats',
        regional_status: asNonEmptyString(p.regional_status) || 'Status uncertain',
        notes: asNonEmptyString(p.notes) || undefined,
      };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

  if (characteristicPlants.length === 0) {
    throw new Error('Malformed place response: characteristic_plants must include at least one plant.');
  }

  // Deduplicate characteristic plants by normalized scientific_name
  const dedupedPlants = Array.from(
    new Map(characteristicPlants.map((p) => [normalizeTaxonName(p.scientific_name), p])).values()
  );

  const envRaw = isPlainObject(raw.environmental_context) ? raw.environmental_context : undefined;
  const environmentalContext = envRaw
    ? {
        climate: asNonEmptyString(envRaw.climate) || undefined,
        soil_and_substrate: asNonEmptyString(envRaw.soil_and_substrate) || undefined,
        elevation_range: asNonEmptyString(envRaw.elevation_range) || undefined,
        ecoregion: asNonEmptyString(envRaw.ecoregion) || undefined,
        geographic_context: asNonEmptyString(envRaw.geographic_context) || undefined,
        collecting_and_phenology: asNonEmptyString(envRaw.collecting_and_phenology) || undefined,
        conservation_and_protected_areas:
          asNonEmptyString(envRaw.conservation_and_protected_areas) || undefined,
        historical_notes: asNonEmptyString(envRaw.historical_notes) || undefined,
        ecological_threats: Array.isArray(envRaw.ecological_threats)
          ? envRaw.ecological_threats
              .map((t) => asNonEmptyString(t))
              .filter((t): t is string => t !== null)
          : undefined,
      }
    : undefined;

  const elevationZones = Array.isArray(raw.elevation_zones)
    ? raw.elevation_zones
        .filter((z): z is Record<string, unknown> => isPlainObject(z))
        .map((z) => {
          const name = asNonEmptyString(z.name);
          const elevationRange = asNonEmptyString(z.elevation_range);
          const description = asNonEmptyString(z.description);
          if (!name || !elevationRange || !description) return null;
          const charTaxa = Array.isArray(z.characteristic_taxa)
            ? z.characteristic_taxa.map((t) => asNonEmptyString(t)).filter((t): t is string => t !== null)
            : undefined;
          return {
            name,
            elevation_range: elevationRange,
            description,
            characteristic_taxa: charTaxa && charTaxa.length > 0 ? charTaxa : undefined,
          };
        })
        .filter((z): z is NonNullable<typeof z> => z !== null)
    : undefined;

  const recommendedLiterature = Array.isArray(raw.recommended_literature)
    ? raw.recommended_literature
        .filter((item): item is Record<string, unknown> => isPlainObject(item))
        .map((item) => {
          const citation = asNonEmptyString(item.citation);
          if (!citation) return null;
          const entry: LiteratureItem = {
            citation,
            type: asNonEmptyString(item.type) || undefined,
            scope: asNonEmptyString(item.scope) || undefined,
            notes: asNonEmptyString(item.notes) || undefined,
            url: asNonEmptyString(item.url) || undefined,
          };
          return entry;
        })
        .filter((item): item is LiteratureItem => item !== null)
    : undefined;

  const lat = typeof locRaw.latitude === 'number' && Number.isFinite(locRaw.latitude) ? locRaw.latitude : undefined;
  const lng = typeof locRaw.longitude === 'number' && Number.isFinite(locRaw.longitude) ? locRaw.longitude : undefined;

  return {
    location_details: {
      resolved_name: resolvedName,
      scope_type: scopeType,
      geographic_scope_summary:
        asNonEmptyString(locRaw.geographic_scope_summary) || 'Local place overview',
      coordinates_dms: asNonEmptyString(locRaw.coordinates_dms) || 'Coordinates not specified',
      latitude: lat,
      longitude: lng,
      is_valid_place: true,
      resolution_warning: asNonEmptyString(locRaw.resolution_warning) || undefined,
    },
    botanical_overview: {
      summary: asNonEmptyString(overviewRaw.summary)!,
      principal_habitats: principalHabitats,
    },
    characteristic_plants: dedupedPlants,
    environmental_context: environmentalContext,
    elevation_zones: elevationZones && elevationZones.length > 0 ? elevationZones : undefined,
    recommended_literature:
      recommendedLiterature && recommendedLiterature.length > 0 ? recommendedLiterature : undefined,
  };
}

const VALID_IDENTIFY_RANKS = new Set<IdentifyRank>([
  'species',
  'species_group',
  'genus',
  'family',
  'unresolved',
]);

const VALID_CANDIDATE_ASSESSMENTS = new Set<CandidateAssessment>([
  'Consistent with observations',
  'Plausible candidate',
  'Uncertain / partial match',
  'Weak match',
]);

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => asNonEmptyString(item)).filter((s): s is string => s !== null);
}

/**
 * Runtime validation for a bounded iterative IdentifyResult payload.
 */
export function validateIdentifyResult(raw: unknown): IdentifyResult {
  if (!isPlainObject(raw)) {
    throw new Error('Malformed identification response: expected a JSON object.');
  }

  const errors: string[] = [];

  const supRaw = raw.supported_identification;
  if (!isPlainObject(supRaw)) {
    errors.push("missing 'supported_identification' object");
  }

  const rawRank = isPlainObject(supRaw) ? asNonEmptyString(supRaw.rank) : null;
  if (isPlainObject(supRaw) && (!rawRank || !VALID_IDENTIFY_RANKS.has(rawRank as IdentifyRank))) {
    errors.push(`invalid rank "${supRaw.rank}"`);
  }
  const rank: IdentifyRank =
    rawRank && VALID_IDENTIFY_RANKS.has(rawRank as IdentifyRank)
      ? (rawRank as IdentifyRank)
      : 'unresolved';

  const statusRaw = isPlainObject(supRaw) ? asNonEmptyString(supRaw.status) : null;
  const status: 'resolved_to_rank' | 'unresolved' =
    rank === 'unresolved' || statusRaw === 'unresolved' ? 'unresolved' : 'resolved_to_rank';

  const taxonName =
    (isPlainObject(supRaw) && asNonEmptyString(supRaw.taxon_name)) ||
    (status === 'unresolved' ? 'Unresolved' : null);
  const statement = isPlainObject(supRaw) ? asNonEmptyString(supRaw.statement) : null;
  const whyItStopsHere = isPlainObject(supRaw) ? asNonEmptyString(supRaw.why_it_stops_here) : null;

  if (isPlainObject(supRaw)) {
    if (!taxonName) errors.push("missing 'supported_identification.taxon_name'");
    if (!statement) errors.push("missing 'supported_identification.statement'");
    if (!whyItStopsHere) errors.push("missing 'supported_identification.why_it_stops_here'");
  }

  const analysisSummary = asNonEmptyString(raw.analysis_summary);
  if (!analysisSummary) {
    errors.push("missing or empty 'analysis_summary'");
  }

  const supportingEvidence = stringArray(raw.supporting_evidence);

  const finerHypotheses: FinerHypothesis[] = Array.isArray(raw.finer_hypotheses)
    ? raw.finer_hypotheses
        .filter((h): h is Record<string, unknown> => isPlainObject(h))
        .map((h): FinerHypothesis | null => {
          const name = asNonEmptyString(h.taxon_name);
          const hRank = asNonEmptyString(h.rank);
          const rationale = asNonEmptyString(h.rationale);
          const missing = asNonEmptyString(h.missing_or_unverified);
          if (!name || !rationale || !missing) return null;
          const normalizedRank =
            hRank === 'genus' || hRank === 'species_group' || hRank === 'species'
              ? hRank
              : 'genus';
          return {
            taxon_name: name,
            rank: normalizedRank,
            rationale,
            missing_or_unverified: missing,
          };
        })
        .filter((h): h is FinerHypothesis => h !== null)
    : [];

  const candidates: CandidateTaxon[] = Array.isArray(raw.candidates)
    ? raw.candidates
        .filter((c): c is Record<string, unknown> => isPlainObject(c))
        .map((c): CandidateTaxon | null => {
          const name = asNonEmptyString(c.name);
          const diagnostic = asNonEmptyString(c.diagnostic_characters);
          const diff = asNonEmptyString(c.differential_diagnosis);
          if (!name || !diagnostic) return null;
          const rawCRank = asNonEmptyString(c.rank);
          const cRank: CandidateTaxon['rank'] =
            rawCRank === 'family' ||
            rawCRank === 'genus' ||
            rawCRank === 'species_group' ||
            rawCRank === 'species'
              ? rawCRank
              : 'family';
          const rawAssessment = asNonEmptyString(c.assessment);
          if (rawAssessment && !VALID_CANDIDATE_ASSESSMENTS.has(rawAssessment as CandidateAssessment)) {
            errors.push(`candidates[${name}] has invalid assessment "${rawAssessment}"`);
          }
          const assessment: CandidateAssessment =
            rawAssessment && VALID_CANDIDATE_ASSESSMENTS.has(rawAssessment as CandidateAssessment)
              ? (rawAssessment as CandidateAssessment)
              : 'Plausible candidate';

          const subtaxa = Array.isArray(c.possible_subtaxa)
            ? c.possible_subtaxa
                .filter((st): st is Record<string, unknown> => isPlainObject(st))
                .map((st) => {
                  const stName = asNonEmptyString(st.name);
                  const stNotes = asNonEmptyString(st.notes);
                  if (!stName || !stNotes) return null;
                  return {
                    name: stName,
                    rank: asNonEmptyString(st.rank) || 'genus',
                    notes: stNotes,
                  };
                })
                .filter((st): st is NonNullable<typeof st> => st !== null)
            : undefined;

          return {
            name,
            authority: asNonEmptyString(c.authority) || undefined,
            rank: cRank,
            parent_family: asNonEmptyString(c.parent_family) || undefined,
            parent_order: asNonEmptyString(c.parent_order) || undefined,
            common_name: asNonEmptyString(c.common_name) || undefined,
            assessment,
            supporting_characters: stringArray(c.supporting_characters),
            contradicting_characters: stringArray(c.contradicting_characters),
            missing_evidence: stringArray(c.missing_evidence),
            diagnostic_characters: diagnostic,
            differential_diagnosis: diff || 'Compare remaining characters against regional Floras.',
            regional_notes: asNonEmptyString(c.regional_notes) || undefined,
            possible_subtaxa: subtaxa && subtaxa.length > 0 ? subtaxa : undefined,
          };
        })
        .filter((c): c is CandidateTaxon => c !== null)
    : [];

  if (status === 'resolved_to_rank' && candidates.length === 0) {
    errors.push("'candidates' must contain at least one candidate taxon");
  }

  const examineNext: ExamineNextStep[] = Array.isArray(raw.what_to_examine_next)
    ? raw.what_to_examine_next
        .filter((step): step is Record<string, unknown> => isPlainObject(step))
        .map((step, idx): ExamineNextStep | null => {
          const feature = asNonEmptyString(step.feature);
          const organ = asNonEmptyString(step.organ);
          const whatToLookFor = asNonEmptyString(step.what_to_look_for);
          const whySeparates = asNonEmptyString(step.why_it_separates_candidates);
          if (!feature || !whatToLookFor) return null;
          return {
            priority: typeof step.priority === 'number' ? step.priority : idx + 1,
            feature,
            organ: organ || 'Specimen',
            what_to_look_for: whatToLookFor,
            why_it_separates_candidates: whySeparates || 'Helps narrow remaining candidates.',
          };
        })
        .filter((step): step is ExamineNextStep => step !== null)
    : [];

  const seenQuestionIds = new Set<string>();
  const followupQuestions: FollowUpQuestion[] = Array.isArray(raw.followup_questions)
    ? raw.followup_questions
        .filter((q): q is Record<string, unknown> => isPlainObject(q))
        .map((q, idx): FollowUpQuestion | null => {
          const prompt = asNonEmptyString(q.prompt);
          const options = stringArray(q.options);
          if (!prompt || options.length === 0) return null;
          const rawId = asNonEmptyString(q.id) || `q_${idx + 1}`;
          const uniqueId = seenQuestionIds.has(rawId) ? `${rawId}_${idx + 1}` : rawId;
          seenQuestionIds.add(uniqueId);
          return {
            id: uniqueId,
            prompt,
            target_organ: asNonEmptyString(q.target_organ) || 'Morphology',
            why_asked: asNonEmptyString(q.why_asked) || 'Helps separate remaining candidates.',
            options: Array.from(new Set(options)),
          };
        })
        .filter((q): q is FollowUpQuestion => q !== null)
    : [];

  const recommendedLiterature = Array.isArray(raw.recommended_literature)
    ? raw.recommended_literature
        .filter((item): item is Record<string, unknown> => isPlainObject(item))
        .map((item) => {
          const citation = asNonEmptyString(item.citation);
          if (!citation) return null;
          const entry: LiteratureItem = {
            citation,
            type: asNonEmptyString(item.type) || undefined,
            scope: asNonEmptyString(item.scope) || undefined,
            notes: asNonEmptyString(item.notes) || undefined,
            url: asNonEmptyString(item.url) || undefined,
          };
          return entry;
        })
        .filter((item): item is LiteratureItem => item !== null)
    : undefined;

  const comparisonRows: import('../types').IdentifyComparisonRow[] = Array.isArray(raw.comparison_rows)
    ? raw.comparison_rows
        .filter((row): row is Record<string, unknown> => isPlainObject(row))
        .map((row): import('../types').IdentifyComparisonRow | null => {
          const character = asNonEmptyString(row.character);
          const organ = asNonEmptyString(row.organ) || 'Morphology';
          const specimenState = asNonEmptyString(row.specimen_state) || 'Not observed';
          if (!character || !Array.isArray(row.candidate_states) || row.candidate_states.length === 0) {
            return null;
          }
          const candStates = row.candidate_states
            .filter((cs): cs is Record<string, unknown> => isPlainObject(cs))
            .map((cs) => {
              const tName = asNonEmptyString(cs.taxon_name);
              const exp = asNonEmptyString(cs.expected_state);
              const st = asNonEmptyString(cs.status);
              if (!tName || !exp) return null;
              const normalizedSt: 'match' | 'conflict' | 'unexamined' =
                st === 'match' || st === 'conflict' || st === 'unexamined' ? st : 'unexamined';
              return { taxon_name: tName, expected_state: exp, status: normalizedSt };
            })
            .filter((cs): cs is NonNullable<typeof cs> => cs !== null);
          if (candStates.length === 0) return null;
          return {
            character,
            organ,
            specimen_state: specimenState,
            matching_followup_id: asNonEmptyString(row.matching_followup_id) || undefined,
            candidate_states: candStates,
          };
        })
        .filter((row): row is import('../types').IdentifyComparisonRow => row !== null)
    : [];

  if (errors.length > 0) {
    throw new Error(`Malformed identification response: ${errors.join('; ')}. Please try again.`);
  }

  return {
    supported_identification: {
      status,
      taxon_name: taxonName!,
      authority: isPlainObject(supRaw) ? asNonEmptyString(supRaw.authority) || undefined : undefined,
      rank,
      family: isPlainObject(supRaw) ? asNonEmptyString(supRaw.family) || undefined : undefined,
      genus: isPlainObject(supRaw) ? asNonEmptyString(supRaw.genus) || undefined : undefined,
      statement: statement!,
      why_it_stops_here: whyItStopsHere!,
      limitations_note: isPlainObject(supRaw)
        ? asNonEmptyString(supRaw.limitations_note) || undefined
        : undefined,
    },
    finer_hypotheses: finerHypotheses.length > 0 ? finerHypotheses : undefined,
    supporting_evidence: supportingEvidence,
    analysis_summary: analysisSummary!,
    candidates,
    comparison_rows: comparisonRows.length > 0 ? comparisonRows : undefined,
    what_to_examine_next: examineNext,
    followup_questions: followupQuestions,
    taxonomic_notes: asNonEmptyString(raw.taxonomic_notes) || undefined,
    recommended_literature:
      recommendedLiterature && recommendedLiterature.length > 0 ? recommendedLiterature : undefined,
    ...(isPlainObject(raw.evidence_audit)
      ? { evidence_audit: raw.evidence_audit as unknown as import('../types').IdentifyEvidenceAudit }
      : {}),
  };
}

/**
 * Constructs explicit, non-fabricated source provenance metadata.
 */
export function buildSourceProvenance(
  searchEnabled: boolean,
  sources: GroundingSource[] | undefined,
  context: 'guide' | 'subset_comparison' | 'custom_guide' | 'locality' | 'identify'
): SourceProvenance {
  const uniqueSources = Array.from(
    new Map(
      (sources || [])
        .filter((s) => s && asNonEmptyString(s.uri) && asNonEmptyString(s.title))
        .map((s) => [s.uri.trim(), { uri: s.uri.trim(), title: s.title.trim() }])
    ).values()
  );

  if (uniqueSources.length > 0) {
    return {
      searchEnabled,
      retrievedSources: uniqueSources,
      evidenceStatus: 'retrieved',
      basisNote:
        context === 'subset_comparison'
          ? `${uniqueSources.length} supporting web reference${uniqueSources.length === 1 ? '' : 's'} retrieved alongside the guide's diagnostic profiles.`
          : context === 'locality'
          ? `${uniqueSources.length} supporting web reference${uniqueSources.length === 1 ? '' : 's'} retrieved for this place summary. Observation records below come directly from iNaturalist.`
          : context === 'identify'
          ? `${uniqueSources.length} supporting web reference${uniqueSources.length === 1 ? '' : 's'} retrieved for candidate evaluation. Suggested literature below is listed separately for manual verification.`
          : `${uniqueSources.length} supporting web reference${uniqueSources.length === 1 ? '' : 's'} retrieved during generation. Suggested literature items listed separately are for follow-up consultation and are not directly verified.`,
    };
  }

  if (searchEnabled) {
    return {
      searchEnabled: true,
      retrievedSources: [],
      evidenceStatus: 'search_no_results',
      basisNote:
        context === 'subset_comparison'
          ? 'Live search was enabled, but no external web sources were retrieved for this comparison. Character states reflect synthesis from the guide profiles and model knowledge—no publications were directly consulted or verified.'
          : context === 'locality'
          ? 'Live search was enabled, but no external web references were returned for the botanical summary. Plant examples reflect AI synthesis; suggested literature is not independently verified.'
          : context === 'identify'
          ? 'Live search was enabled, but no external web references were retrieved for this specimen evaluation. Suggested literature is for manual consultation, not directly retrieved verification.'
          : 'Live search was enabled, but no external web sources were returned. Content reflects AI taxonomic synthesis; suggested literature below is for follow-up reading, not retrieved evidence.',
    };
  }

  return {
    searchEnabled: false,
    retrievedSources: [],
    evidenceStatus: 'synthesis_only',
    basisNote:
      context === 'subset_comparison'
        ? 'Synthesized from the current guide profiles and model knowledge without external web retrieval. No publications were consulted or verified during this comparison.'
        : 'Generated without live web retrieval. No external publications were directly consulted during generation.',
  };
}

/**
 * Matches Gemini groundingSupport text segments to species profiles and key couplets
 * so users have a direct claim-to-source link where grounded URLs support that item.
 */
export function attachGroundingSupportsToGuide(
  guide: GeneratedGuideStructured,
  supports: import('../types').GroundingSupportSpan[]
): GeneratedGuideStructured {
  if (!supports || supports.length === 0) {
    return guide;
  }

  const findUrlsForTexts = (candidates: string[]): string[] | undefined => {
    const cleanCandidates = candidates
      .map((c) => normalizeTaxonName(c))
      .filter((c) => c.length >= 4);
    if (cleanCandidates.length === 0) return undefined;

    const urls = new Set<string>();
    for (const sup of supports) {
      const segNorm = sup.text.toLowerCase();
      const matched = cleanCandidates.some((cand) => {
        if (segNorm.includes(cand)) return true;
        // Also match binomial genus initial or specific epithet when paired with significant overlap
        const words = cand.split(' ').filter((w) => w.length >= 5);
        return words.length >= 2 && words.every((w) => segNorm.includes(w));
      });
      if (matched) {
        for (const u of sup.sourceUris) urls.add(u);
      }
    }
    return urls.size > 0 ? Array.from(urls) : undefined;
  };

  const speciesProfiles = guide.species_profiles.map((sp) => {
    const names = [
      sp.scientific_name,
      sp.accepted_name,
      ...(sp.synonyms || []),
    ].filter((n): n is string => Boolean(n && n.trim()));
    const urls = findUrlsForTexts([...names, sp.key_diagnostics]);
    return urls ? { ...sp, source_urls: Array.from(new Set([...(sp.source_urls || []), ...urls])) } : sp;
  });

  const dichotomousKey = guide.dichotomous_key.map((couplet) => {
    const urls = findUrlsForTexts([
      couplet.lead_a?.statement || '',
      couplet.lead_a?.destination || '',
      couplet.lead_b?.statement || '',
      couplet.lead_b?.destination || '',
    ]);
    return urls
      ? { ...couplet, source_urls: Array.from(new Set([...(couplet.source_urls || []), ...urls])) }
      : couplet;
  });

  return {
    ...guide,
    species_profiles: speciesProfiles,
    dichotomous_key: dichotomousKey,
    grounding_supports: supports,
  };
}

