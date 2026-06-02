export type ModuleType = 'profiles' | 'identify' | 'authorities' | 'guide' | 'localities' | 'landing' | 'quiz';

export type NavigationTarget = {
  module: ModuleType;
  query?: string;
  mode?: 'single' | 'compare';
  locality?: string;
};

export interface GroundingSource {
  uri: string;
  title: string;
}

// --- Localities Module Types ---
export interface LocalityProfile {
  location_details: {
    resolved_name: string;
    coordinates_dms: string;
    latitude?: number;
    longitude?: number;
  };
  habitat_and_landscape: {
    ecosystem_description: string;
    climate: string;
    soil_type: string;
    elevation_range: string;
    ecoregion: string;
  };
  geography_and_history: {
    geographic_context: string;
    historical_notes: string;
    protected_status: string;
  };
  phenology: {
    optimal_collecting_season: string;
  };
  taxa: {
    dominant_species: string[];
    endemic_and_notable: string[];
  };
  ecological_threats: string[];
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

export interface SuggestedFamily {
  name: string;
  authority: string;
  order: string;
  commonName: string;
  matchQuality: 'Strong Match' | 'Probable' | 'Possible' | 'Weak';
  matchingCharacters: number;
  totalCharacters: number;
  contradictingCharacters: string[];
  synapomorphies: string;
  diagnosticCharacters: string;
  fieldRecognitionTips: string;
  spotCharacters: string;
  charactersToVerifyNext: string;
  possibleGenera: { name: string; notes: string }[];
  differentialDiagnosis: string;
  regionalNotes: string;
}

export interface IdentifyResult {
  analysisNotes: string;
  suggestedFamilies: SuggestedFamily[];
  additionalRecommendations: string;
  taxonomicNotes: string;
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

export interface GeneratedGuideStructured {
  guide_metadata: {
    target_taxon: string;
    target_locality: string;
    verification_summary: string;
  };
  taxon_overview: string;
  species_profiles: SpeciesProfile[];
  dichotomous_key: DichotomousKeyCouplet[];
  field_documentation_guide?: string[];
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

