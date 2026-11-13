export type ModuleType = 'profiles' | 'identify' | 'authorities' | 'guide' | 'localities' | 'landing' | 'quiz';

export type PlaceScopeType = 'point' | 'locality' | 'city' | 'region' | 'mountain' | 'unknown';

export interface PlaceRef {
  displayName: string;
  scopeType: PlaceScopeType;
  geographicScopeSummary?: string;
  coordinates?: {
    latitude: number;
    longitude: number;
    coordinatesDms?: string;
  };
  boundaryReference?: string;
  boundingBox?: {
    swlat: number;
    swlng: number;
    nelat: number;
    nelng: number;
  };
  providerPlaceId?: number;
  providerPlaceName?: string;
  availableHabitats?: string[];
}

export type NavigationTarget = {
  module: ModuleType;
  query?: string;
  mode?: 'single' | 'compare';
  locality?: string;
  place?: PlaceRef;
  navRequestId?: number;
  scrollBehavior?: 'top' | 'restore';
  specimenContext?: string;
  compareTaxa?: string[];
};

export interface GroundingSource {
  uri: string;
  title: string;
}

export interface LiteratureItem {
  citation: string;
  type?: 'Flora Account' | 'Taxonomic Revision' | 'Monograph' | 'Regional Key' | 'Checklist' | string;
  scope?: string;
  notes?: string;
  url?: string;
}

// --- Places & Flora (Localities) Module Types ---
export interface ElevationZone {
  name: string;
  elevation_range: string;
  description: string;
  characteristic_taxa?: string[];
}

export interface PrincipalHabitat {
  name: string;
  summary: string;
}

export interface CharacteristicPlant {
  scientific_name: string;
  common_name?: string;
  growth_form: string;
  habitat_association: string;
  regional_status: string;
  notes?: string;
}

export interface LocalityProfile {
  location_details: {
    resolved_name: string;
    scope_type: PlaceScopeType;
    geographic_scope_summary: string;
    coordinates_dms: string;
    latitude?: number;
    longitude?: number;
    is_valid_place?: boolean;
    resolution_warning?: string;
  };
  botanical_overview: {
    summary: string;
    principal_habitats: PrincipalHabitat[];
  };
  characteristic_plants: CharacteristicPlant[];
  environmental_context?: {
    climate?: string;
    soil_and_substrate?: string;
    elevation_range?: string;
    ecoregion?: string;
    geographic_context?: string;
    collecting_and_phenology?: string;
    conservation_and_protected_areas?: string;
    historical_notes?: string;
    ecological_threats?: string[];
  };
  elevation_zones?: ElevationZone[];
  recommended_literature?: LiteratureItem[];
  provenance?: SourceProvenance;
}

// --- Profiles Module Types ---
export interface ConfusedTaxon {
  name: string;
  difference: string;
  keyFeature: string;
}

export interface TaxonClassification {
  rank: string;
  name: string;
}

export interface TaxonProfile {
  scientificName: string;
  author: string;
  commonName: string;
  family: string;
  classification: TaxonClassification[];
  includedTaxaCount?: string;
  localIncludedTaxaCount?: string;
  synonyms?: string[];
  conservationStatus?: string;
  hazards?: string;
  fieldNotes?: string;
  seasonality?: string;
  humanRelevance?: string;
  quickRecap: string;
  diagnosticDescription: string;
  confusedTaxa: ConfusedTaxon[];
  ecology: string;
  etymology: string;
  history: string;
  distribution: string;
  localityContext?: string;
  recommendedLiterature?: LiteratureItem[];
}

export interface KeyDifference {
  feature: string;
  taxon1State: string;
  taxon2State: string;
  taxon3State?: string;
}

export interface ComparisonProfile {
  taxon1: TaxonProfile;
  taxon2: TaxonProfile;
  taxon3?: TaxonProfile;
  keyDifferences: KeyDifference[];
  localityContext?: string;
}

// --- Identify Module Types ---
export interface Character {
  id: string;
  label: string;
  category: string;
  description?: string;
}

export type IdentifyRank = 'species' | 'species_group' | 'genus' | 'family' | 'unresolved';

export type CandidateAssessment =
  | 'Consistent with observations'
  | 'Plausible candidate'
  | 'Uncertain / partial match'
  | 'Weak match';

export interface FollowUpObservation {
  questionId: string;
  prompt: string;
  targetOrgan?: string;
  answer: string;
  status: 'observed' | 'not_observed' | 'unsure';
}

export interface FollowUpQuestion {
  id: string;
  prompt: string;
  target_organ: string;
  why_asked: string;
  options: string[];
}

export interface ExamineNextStep {
  priority: number;
  feature: string;
  organ: string;
  what_to_look_for: string;
  why_it_separates_candidates: string;
}

export interface FinerHypothesis {
  taxon_name: string;
  rank: 'genus' | 'species_group' | 'species';
  rationale: string;
  missing_or_unverified: string;
}

export interface CandidateTaxon {
  name: string;
  authority?: string;
  rank: 'family' | 'genus' | 'species_group' | 'species';
  parent_family?: string;
  parent_order?: string;
  common_name?: string;
  assessment: CandidateAssessment;
  supporting_characters: string[];
  contradicting_characters: string[];
  missing_evidence: string[];
  diagnostic_characters: string;
  differential_diagnosis: string;
  regional_notes?: string;
  possible_subtaxa?: { name: string; rank: string; notes: string }[];
}

export interface IdentifyResult {
  supported_identification: {
    status: 'resolved_to_rank' | 'unresolved';
    taxon_name: string;
    authority?: string;
    rank: IdentifyRank;
    family?: string;
    genus?: string;
    statement: string;
    why_it_stops_here: string;
    limitations_note?: string;
  };
  finer_hypotheses?: FinerHypothesis[];
  supporting_evidence: string[];
  analysis_summary: string;
  candidates: CandidateTaxon[];
  what_to_examine_next: ExamineNextStep[];
  followup_questions: FollowUpQuestion[];
  taxonomic_notes?: string;
  recommended_literature?: LiteratureItem[];
  provenance?: SourceProvenance;
}

// --- Authorities Module Types ---
export interface AuthorProfile {
  fullName: string;
  standardAbbreviation: string;
  lifespan: string;
  nationality: string;
  birthPlace: string;
  deathPlace: string;
  mainContribution: string;
  biography: string;
  historicalContext: string;
  almaMater: string[];
  institutions: string[];
  focusAreas: string[];
  awards: string[];
  fieldWorkRegions: string[];
  majorWorks: { year: string; title: string }[];
  taxaDescribed: { name: string; rank: string }[];
  eponymousTaxa: { name: string; rank: string; reason: string }[];
  herbariaCollections: { abbreviation: string; institution: string }[];
  taxonomicNotes: string;
  notableMentors: string[];
  notableStudents: string[];
  relatedBotanists: { name: string; connection: string }[];
}

// --- Guide Module Types ---
export enum AppStatus {
  IDLE = 'IDLE',
  LOADING = 'LOADING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR',
}

export interface GeneratedGuide {
  markdown: string;
}

export interface DichotomousKeyCouplet {
  couplet_id: string;
  lead_a: {
    statement: string;
    destination: string;
  };
  lead_b: {
    statement: string;
    destination: string;
  };
}

export interface SpeciesProfile {
  scientific_name: string;
  common_name: string | null;
  habitat_and_ecology: string;
  key_diagnostics: string;
}

export type CoverageScope = 'comprehensive' | 'curated' | 'groups';

export type KeyValidationIssueCategory =
  | 'duplicate_couplet'
  | 'missing_destination'
  | 'cycle'
  | 'unknown_terminal'
  | 'unreachable_taxon'
  | 'unreachable_couplet';

export interface KeyValidationIssue {
  category: KeyValidationIssueCategory;
  severity: 'error' | 'warning';
  message: string;
  coupletId?: string;
  lead?: 'a' | 'b';
  destination?: string;
  taxonName?: string;
}

export interface KeyValidationReport {
  isStructurallyValid: boolean;
  checkedCoupletCount: number;
  treatedTaxaCount: number;
  reachableTaxa: string[];
  unreachableTaxa: string[];
  duplicateCoupletIds: string[];
  missingDestinations: string[];
  cycles: string[][];
  unknownTerminalTaxa: string[];
  unreachableCouplets: string[];
  issues: KeyValidationIssue[];
  validityNote: string;
}

export interface SourceProvenance {
  searchEnabled: boolean;
  retrievedSources: GroundingSource[];
  evidenceStatus: 'retrieved' | 'search_no_results' | 'synthesis_only';
  basisNote: string;
}

export interface GeneratedGuideStructured {
  guide_metadata: {
    target_taxon: string;
    target_locality: string;
    verification_summary: string;
    coverage_scope?: string;
    total_taxa_treated?: number;
  };
  taxon_overview: string;
  species_profiles: SpeciesProfile[];
  dichotomous_key: DichotomousKeyCouplet[];
  field_documentation_guide?: string[];
  recommended_literature?: LiteratureItem[];
  key_validation?: KeyValidationReport;
  provenance?: SourceProvenance;
}

// --- Guide Subset Comparison Types ---
export interface GuideTaxonState {
  scientific_name: string;
  state: string;
  is_uncertain?: boolean;
}

export interface GuideCharacterRow {
  character_name: string;
  category?: 'Vegetative' | 'Floral' | 'Fruit/Seed' | 'Phenology/Ecology' | string;
  diagnostic_importance: 'Decisive' | 'Strong' | 'Secondary' | 'Shared';
  observation_method?: string; // e.g., '10x hand lens on leaf abaxial surface', 'Gross morphology'
  relevant_life_stage?: string; // e.g., 'Mature foliage', 'Flowering', 'Fruiting'
  states: GuideTaxonState[];
  overlap_notes?: string;
  citation?: string;
}

export interface GuideSubsetComparison {
  taxa: {
    scientific_name: string;
    common_name?: string | null;
    family?: string;
  }[];
  fastest_distinction_summary: string;
  what_to_examine_next: {
    priority: number;
    action: string;
    target_organ: string;
    lens_or_technique?: string;
    expected_outcomes: string;
  }[];
  matrix_rows: GuideCharacterRow[];
  limitations: string[];
  constraints_advisory?: string;
  provenance?: SourceProvenance;
}

// --- Saved Guide Storage Type ---
export interface SavedGuide {
  id: string;
  title: string;
  target_taxon: string;
  target_locality: string;
  timestamp: number;
  guide: GeneratedGuideStructured;
  sources?: GroundingSource[];
  activeFilters?: string[];
  coverageScope?: CoverageScope;
}

// --- Quiz & iNaturalist Types ---
export interface iNatPhoto {
  url: string;
  attribution: string;
}

export interface iNatObservation {
  id: number;
  taxon: {
    name: string;
    preferred_common_name?: string;
  };
  photos: iNatPhoto[];
  user: {
    login: string;
  };
}

export interface QuizQuestionData {
  observation: iNatObservation;
  options: string[]; // Scientific names
  correctAnswer: string;
}

