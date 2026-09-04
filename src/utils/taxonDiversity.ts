export interface TaxonDiversityInfo {
  label: string;
  value: string;
  rankBadge?: string;
}

export function formatTaxonDiversityLabel(
  countRaw?: string,
  scientificName: string = '',
  _classification?: { name: string; rank: string }[]
): TaxonDiversityInfo | null {
  if (!countRaw || countRaw.trim() === '' || countRaw.trim() === 'N/A') {
    return null;
  }

  const count = countRaw.replace(/\*/g, '').trim();
  const cleanName = scientificName.replace(/[\*\_\(\)]/g, '').trim();
  const nameParts = cleanName.split(/\s+/);

  // If already explicitly prefixed by server (e.g. "Genus: ca. 500 species", "Species: Monotypic", "Family: ...")
  const prefixMatch = count.match(/^(Family|Genus|Subgenus|Section|Species|Subspecies|Infraspecific|Diversity|Taxon count)\s*:\s*(.+)$/i);
  if (prefixMatch) {
    return {
      label: `${prefixMatch[1]} diversity`,
      value: prefixMatch[2].trim(),
      rankBadge: prefixMatch[1]
    };
  }

  const isFamily = cleanName.endsWith('aceae') || cleanName.endsWith('idae');
  const isOrder = cleanName.endsWith('ales');
  const isSectionOrSubgenus = cleanName.toLowerCase().includes('sect.') || cleanName.toLowerCase().includes('subg.');
  const isInfraspecific = cleanName.toLowerCase().includes('subsp.') || cleanName.toLowerCase().includes('var.') || cleanName.toLowerCase().includes(' f. ');
  const isBinomial = !isFamily && !isOrder && !isSectionOrSubgenus && !isInfraspecific && nameParts.length >= 2;
  const isGenus = !isFamily && !isOrder && !isSectionOrSubgenus && !isInfraspecific && !isBinomial && nameParts.length === 1;

  const mentionsSpeciesCount = /\b\d+\s+(accepted\s+)?species\b/i.test(count) || /ca\.\s*\d+\s+species/i.test(count) || /\b\d+\s+spp\b/i.test(count);
  const mentionsInfraspecific = /monotypic|subsp|subspecies|var\.|variety|varieties|form/i.test(count);
  const mentionsGenera = /genera|genus/i.test(count);

  if (isInfraspecific) {
    return {
      label: 'Infraspecific rank',
      value: count,
      rankBadge: 'Infraspecific'
    };
  }

  if (isBinomial) {
    // It's a species (e.g. "Vaccinium tenellum")
    if (mentionsInfraspecific) {
      return {
        label: 'Infraspecific taxa (within species)',
        value: count,
        rankBadge: 'Species'
      };
    }
    if (mentionsGenera || (mentionsSpeciesCount && !count.toLowerCase().startsWith('1 '))) {
      // The count was given for the genus (e.g. "ca. 500 species" for Vaccinium)
      const genusName = nameParts[0];
      return {
        label: `Genus diversity (${genusName})`,
        value: count,
        rankBadge: 'Genus'
      };
    }
    return {
      label: 'Species diversity / Subordinate taxa',
      value: count,
      rankBadge: 'Species'
    };
  }

  if (isGenus) {
    return {
      label: 'Species in genus',
      value: count,
      rankBadge: 'Genus'
    };
  }

  if (isFamily) {
    return {
      label: 'Family diversity (genera & species)',
      value: count,
      rankBadge: 'Family'
    };
  }

  if (isOrder) {
    return {
      label: 'Order diversity',
      value: count,
      rankBadge: 'Order'
    };
  }

  if (isSectionOrSubgenus) {
    return {
      label: 'Section / Subgenus diversity',
      value: count,
      rankBadge: 'Subgenus'
    };
  }

  return {
    label: 'Diversity & Subordinate taxa',
    value: count
  };
}
