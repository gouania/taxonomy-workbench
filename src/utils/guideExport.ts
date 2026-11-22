import {
  DichotomousKeyCouplet,
  GeneratedGuideStructured,
  GroundingSource,
  SpeciesProfile,
} from '../types';
import {
  findMatchingSpeciesProfile,
  isCoupletPointer,
  normalizeCoupletId,
} from './guideValidation';

export interface BranchTaxaPreview {
  leadATaxa: string[];
  leadBTaxa: string[];
  combinedTaxa: string[];
}

/**
 * Traverses the dichotomous key graph downward from a couplet's Lead A and Lead B
 * to collect all reachable terminal taxa along each branch (cycle-safe).
 */
export function collectReachableBranchTaxa(
  coupletId: string,
  keyItems: DichotomousKeyCouplet[],
  speciesProfiles: SpeciesProfile[] = []
): BranchTaxaPreview {
  const allCoupletIds = new Set(keyItems.map((k) => normalizeCoupletId(k.couplet_id || '')));
  const coupletById = new Map<string, DichotomousKeyCouplet>();
  for (const item of keyItems) {
    const norm = normalizeCoupletId(item.couplet_id || '');
    if (norm && !coupletById.has(norm)) {
      coupletById.set(norm, item);
    }
  }

  const current = coupletById.get(normalizeCoupletId(coupletId));
  if (!current) {
    return { leadATaxa: [], leadBTaxa: [], combinedTaxa: [] };
  }

  const cleanDestId = (dest: string) =>
    dest.trim().replace(/^couplet\s+/i, '').replace(/\.$/, '').trim();

  const walkDestination = (dest: string, visited: Set<string>, out: string[]) => {
    const trimmed = (dest || '').trim();
    if (!trimmed) return;

    if (isCoupletPointer(trimmed, allCoupletIds)) {
      const nextNorm = normalizeCoupletId(cleanDestId(trimmed));
      if (!nextNorm || visited.has(nextNorm)) return;
      const nextCouplet = coupletById.get(nextNorm);
      if (!nextCouplet) return;

      const nextVisited = new Set(visited);
      nextVisited.add(nextNorm);
      walkDestination(nextCouplet.lead_a?.destination || '', nextVisited, out);
      walkDestination(nextCouplet.lead_b?.destination || '', nextVisited, out);
      return;
    }

    const matched = findMatchingSpeciesProfile(trimmed, speciesProfiles);
    const canonical = matched?.scientific_name || trimmed;
    if (!out.includes(canonical)) {
      out.push(canonical);
    }
  };

  const rootVisited = new Set<string>([normalizeCoupletId(coupletId)]);
  const leadATaxa: string[] = [];
  const leadBTaxa: string[] = [];

  walkDestination(current.lead_a?.destination || '', rootVisited, leadATaxa);
  walkDestination(current.lead_b?.destination || '', rootVisited, leadBTaxa);

  const combinedTaxa = Array.from(new Set([...leadATaxa, ...leadBTaxa]));
  return { leadATaxa, leadBTaxa, combinedTaxa };
}

/**
 * Formats a structured regional guide as a clean, portable Markdown handbook
 * suitable for copying into field notebooks or downloading as a `.md` file.
 */
export function formatGuideAsMarkdown(
  guide: GeneratedGuideStructured,
  sources: GroundingSource[] = [],
  activeFilters: string[] = []
): string {
  const taxon = guide.guide_metadata?.target_taxon || 'Taxon Guide';
  const locality = guide.guide_metadata?.target_locality || 'Target Region';
  const profiles = guide.species_profiles || [];
  const keyItems = guide.dichotomous_key || [];
  const lines: string[] = [];

  lines.push(`# Identification Guide to *${taxon}* — ${locality}`);
  lines.push('');

  const metaBits: string[] = [];
  if (guide.guide_metadata?.coverage_scope) {
    metaBits.push(`**Coverage:** ${guide.guide_metadata.coverage_scope}`);
  }
  metaBits.push(`**Taxa treated:** ${profiles.length}`);
  if (activeFilters.length > 0) {
    metaBits.push(`**Constraints:** ${activeFilters.join('; ')}`);
  }
  lines.push(metaBits.join(' | '));
  if (guide.guide_metadata?.verification_summary) {
    lines.push('');
    lines.push(`> **Synthesized Taxonomic Basis (Overview):** ${guide.guide_metadata.verification_summary}`);
  }
  lines.push('');

  if (guide.taxon_overview) {
    lines.push('## Botanical Overview');
    lines.push('');
    lines.push(guide.taxon_overview.trim());
    lines.push('');
  }

  if (keyItems.length > 0) {
    lines.push(`## Dichotomous Identification Key (${keyItems.length} couplets)`);
    lines.push('');
    for (const c of keyItems) {
      lines.push(`- **${c.couplet_id}a.** ${c.lead_a?.statement || ''} → **${c.lead_a?.destination || ''}**`);
      lines.push(`- **${c.couplet_id}b.** ${c.lead_b?.statement || ''} → **${c.lead_b?.destination || ''}**`);
      lines.push('');
    }
  }

  if (profiles.length > 0) {
    lines.push(`## Treated Taxon Profiles (${profiles.length})`);
    lines.push('');
    for (const sp of profiles) {
      const heading = sp.common_name
        ? `### *${sp.scientific_name}* (${sp.common_name})`
        : `### *${sp.scientific_name}*`;
      lines.push(heading);
      if (sp.accepted_name && sp.accepted_name !== sp.scientific_name) {
        lines.push(`- **Accepted name:** *${sp.accepted_name}*`);
      }
      if (sp.synonyms && sp.synonyms.length > 0) {
        lines.push(`- **Also cited as:** *${sp.synonyms.join('*, *')}*`);
      }
      lines.push(`- **Key diagnostics:** ${sp.key_diagnostics}`);
      lines.push(`- **Habitat & ecology:** ${sp.habitat_and_ecology}`);
      lines.push('');
    }
  }

  if (guide.field_documentation_guide && guide.field_documentation_guide.length > 0) {
    lines.push('## Field Documentation: What to Photograph, Measure, and Record');
    lines.push('');
    for (const tip of guide.field_documentation_guide) {
      lines.push(`- ${tip}`);
    }
    lines.push('');
  }

  if (guide.recommended_literature && guide.recommended_literature.length > 0) {
    lines.push('## Suggested Literature (Verify Independently)');
    lines.push('');
    for (const lit of guide.recommended_literature) {
      const extra = [lit.type, lit.scope].filter(Boolean).join(' · ');
      lines.push(`- ${lit.citation}${extra ? ` (${extra})` : ''}`);
    }
    lines.push('');
  }

  const retrieved = guide.provenance?.retrievedSources?.length
    ? guide.provenance.retrievedSources
    : sources;
  if (retrieved.length > 0) {
    lines.push('## Retrieved Supporting Web References');
    lines.push('');
    for (const src of retrieved) {
      lines.push(`- [${src.title || src.uri}](${src.uri})`);
    }
    lines.push('');
  }

  return lines.join('\n').trim() + '\n';
}
