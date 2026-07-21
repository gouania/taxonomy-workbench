import { Character } from './types';

export const TAXON_EXAMPLES = [
  'Tracheophyta', // Phylum
  'Magnoliopsida', // Class
  'Caryophyllales', // Order
  'Asteraceae', // Family
  'Asteroideae', // Subfamily
  'Eupatorieae', // Tribe
  'Quercus sect. Lobatae', // Section
  'Quercus', // Genus
  'Acer saccharum', // Species
  'Pinus longaeva', // Gymnosperm
  'Ginkgo biloba', // Gymnosperm
  'Pteridium aquilinum', // Fern species
  'Lycopodium clavatum', // Lycophyte
  'Sphagnum', // Moss genus
  'Marchantia polymorpha', // Liverwort
  'Drosera capensis', // Carnivorous
  'Rafflesia arnoldii', // Parasitic
  'Monotropa uniflora', // Mycoheterotroph
  'Triticum aestivum', // Crop
  'Amanita muscaria', // Fungi
  'Macrocystis pyrifera', // Brown algae
];

export const AUTHOR_EXAMPLES = [
  'L.', 'DC.', 'Hook.f.', 'A.Gray', 'Benth.', 'R.Br.', 'Adans.', 'Lam.',
  'Juss.', 'Endl.', 'Kunth', 'Mart.', 'Miq.',
];

export const CHARACTER_GROUPS = [
  {
    category: 'Habit & Stem',
    characters: [
      { id: 'habit-tree', label: 'Tree', category: 'Habit & Stem' },
      { id: 'habit-shrub', label: 'Shrub', category: 'Habit & Stem' },
      { id: 'habit-herb', label: 'Herb', category: 'Habit & Stem' },
      { id: 'habit-vine', label: 'Vine/Liana', category: 'Habit & Stem' },
      { id: 'habit-cushion', label: 'Cushion plant', category: 'Habit & Stem' },
      { id: 'habit-monocarpic', label: 'Monocarpic (flowers once and dies)', category: 'Habit & Stem' },
      { id: 'habit-rosette-tree', label: 'Rosette tree (Schopfbaum)', category: 'Habit & Stem' },
      { id: 'form-aquatic', label: 'Aquatic', category: 'Habit & Stem' },
      { id: 'form-epiphyte', label: 'Epiphyte', category: 'Habit & Stem' },
      { id: 'form-parasite', label: 'Parasite or hemiparasite', category: 'Habit & Stem' },
      { id: 'form-echlorophyllose', label: 'Echlorophyllose (lacking chlorophyll)', category: 'Habit & Stem' },
      { id: 'stem-succulent', label: 'Succulent stems', category: 'Habit & Stem' },
      { id: 'stem-thorns', label: 'Thorns/spines/prickles', category: 'Habit & Stem' },
      { id: 'stem-square', label: 'Stems square in cross-section', category: 'Habit & Stem' },
      { id: 'stem-triangular', label: 'Stems triangular in cross-section', category: 'Habit & Stem' },
      { id: 'stem-swollen-nodes', label: 'Swollen nodes on stem', category: 'Habit & Stem' },
      { id: 'stem-bulb-corm', label: 'Bulb or corm present', category: 'Habit & Stem' },
      { id: 'stem-tendrils', label: 'Tendrils present', category: 'Habit & Stem' },
      { id: 'stem-winged', label: 'Stem flanged or winged', category: 'Habit & Stem' },
      { id: 'stem-ant-plant', label: 'Ant-plant (myrmecophyte)', category: 'Habit & Stem' },
      { id: 'stem-bulbils', label: 'Bulbils present on stem', category: 'Habit & Stem' },
      { id: 'stem-serial-buds', label: 'Serial buds in axils', category: 'Habit & Stem' },
      { id: 'stem-leafless-flowering', label: 'Leafless when flowering', category: 'Habit & Stem' },
      { id: 'stem-terminalia', label: 'Terminalia-branching pattern', category: 'Habit & Stem' },
      { id: 'exudate-present', label: 'Exudate (latex/sap) present', category: 'Habit & Stem' },
      { id: 'exudate-white-yellow', label: 'Exudate white or yellow', category: 'Habit & Stem' },
      { id: 'exudate-red-orange', label: 'Exudate red or orange', category: 'Habit & Stem' },
      { id: 'exudate-black-brown', label: 'Exudate black or brown', category: 'Habit & Stem' },
      { id: 'exudate-resinous', label: 'Resinous exudate (especially when dried)', category: 'Habit & Stem' },
    ],
  },
  {
    category: 'Leaf',
    characters: [
      { id: 'leaf-venation-parallel', label: 'Leaf venation parallel', category: 'Leaf' },
      { id: 'leaf-venation-triplinerved', label: 'Leaves triplinerved or palmately veined', category: 'Leaf' },
      { id: 'leaf-venation-intramarginal', label: 'Intramarginal vein present', category: 'Leaf' },
      { id: 'leaf-venation-scalariform', label: 'Scalariform tertiary venation', category: 'Leaf' },
      { id: 'leaf-arr-opposite', label: 'Leaves opposite', category: 'Leaf' },
      { id: 'leaf-arr-alternate', label: 'Leaves alternate', category: 'Leaf' },
      { id: 'leaf-arr-whorled', label: 'Leaves whorled', category: 'Leaf' },
      { id: 'leaf-arr-basal', label: 'Basal rosette of leaves', category: 'Leaf' },
      { id: 'leaf-arr-anisophyllous', label: 'Anisophyllous leaves', category: 'Leaf' },
      { id: 'leaf-comp-simple', label: 'Leaves simple', category: 'Leaf' },
      { id: 'leaf-comp-compound', label: 'Leaves compound', category: 'Leaf' },
      { id: 'leaf-comp-pinnate', label: 'Leaves pinnately compound', category: 'Leaf' },
      { id: 'leaf-comp-bipinnate', label: 'Leaves bipinnately compound', category: 'Leaf' },
      { id: 'leaf-comp-palmate', label: 'Leaves palmately compound', category: 'Leaf' },
      { id: 'leaf-margin-entire', label: 'Leaf/leaflet margin entire', category: 'Leaf' },
      { id: 'leaf-margin-serrate', label: 'Leaf/leaflet margin serrate/toothed', category: 'Leaf' },
      { id: 'leaf-stipule-present', label: 'Stipules present', category: 'Leaf' },
      { id: 'leaf-stipel-present', label: 'Stipels present', category: 'Leaf' },
      { id: 'leaf-ligule-present', label: 'Ligule present', category: 'Leaf' },
      { id: 'leaf-sheathing', label: 'Sheathing leaf base', category: 'Leaf' },
      { id: 'leaf-stipule-intrapetiolar', label: 'Intrapetiolar stipules', category: 'Leaf' },
      { id: 'leaf-stipule-clasping', label: 'Stipules clasping the stem', category: 'Leaf' },
      { id: 'leaf-stipule-large', label: 'Stipules large and leaf-like', category: 'Leaf' },
      { id: 'leaf-petiole-swollen', label: 'Petiole swollen at base or apex', category: 'Leaf' },
      { id: 'leaf-petiole-winged', label: 'Petiole or rachis winged', category: 'Leaf' },
      { id: 'leaf-lamina-pellucid', label: 'Pellucid dots / glands on leaves', category: 'Leaf' },
      { id: 'leaf-lamina-extrafloral', label: 'Extrafloral nectaries present', category: 'Leaf' },
      { id: 'leaf-lamina-peltate', label: 'Leaves peltate', category: 'Leaf' },
      { id: 'leaf-lamina-bullate', label: 'Leaves bullate (blistered surface)', category: 'Leaf' },
      { id: 'leaf-lamina-domatia', label: 'Domatia present in vein axils', category: 'Leaf' },
      { id: 'leaf-lamina-puncticulate', label: 'Leaf surface puncticulate', category: 'Leaf' },
      { id: 'leaf-lamina-pustulate', label: 'Leaf surface pustulate', category: 'Leaf' },
      { id: 'leaf-lamina-scabrous', label: 'Leaf surface rough (scabrous)', category: 'Leaf' },
      { id: 'leaf-lamina-cystoliths', label: 'Cystoliths present', category: 'Leaf' },
      { id: 'leaf-lamina-white-threads', label: 'Broken leaf shows white threads', category: 'Leaf' },
      { id: 'leaf-lamina-blacken', label: 'Leaves blacken on drying', category: 'Leaf' },
      { id: 'leaf-lamina-wither', label: 'Leaves wither red or yellow', category: 'Leaf' },
      { id: 'leaf-lamina-glaucous', label: 'Leaves glaucous (waxy bloom)', category: 'Leaf' },
      { id: 'leaf-ind-stellate', label: 'Stellate (star-shaped) hairs', category: 'Leaf' },
      { id: 'leaf-ind-glandular', label: 'Glandular (sticky) hairs', category: 'Leaf' },
      { id: 'leaf-ind-tshaped', label: 'T-shaped (malpighiaceous) hairs', category: 'Leaf' },
      { id: 'leaf-ind-peltate', label: 'Peltate (shield-shaped) hairs', category: 'Leaf' },
      { id: 'leaf-ind-dendroid', label: 'Dendroid (tree-like) hairs', category: 'Leaf' },
      { id: 'leaf-ind-stinging', label: 'Stinging hairs present', category: 'Leaf' },
      { id: 'leaf-smell-aromatic', label: 'Leaves aromatic when crushed', category: 'Leaf' },
      { id: 'leaf-smell-curry', label: 'Leaves with curry/spice smell', category: 'Leaf' },
      { id: 'leaf-smell-foetid', label: 'Leaves with foetid/foul smell', category: 'Leaf' },
    ],
  },
  {
    category: 'Flower & Inflorescence',
    characters: [
      { id: 'fl-arch-3merous', label: 'Flowers 3-merous', category: 'Flower & Inflorescence' },
      { id: 'fl-arch-45merous', label: 'Flowers 4- or 5-merous', category: 'Flower & Inflorescence' },
      { id: 'fl-arch-tepals', label: 'Perianth undifferentiated (tepals)', category: 'Flower & Inflorescence' },
      { id: 'fl-sym-actino', label: 'Flowers actinomorphic (radial)', category: 'Flower & Inflorescence' },
      { id: 'fl-sym-zygo', label: 'Flowers zygomorphic (bilateral)', category: 'Flower & Inflorescence' },
      { id: 'fl-ovary-superior', label: 'Ovary superior', category: 'Flower & Inflorescence' },
      { id: 'fl-ovary-halfinferior', label: 'Ovary half-inferior', category: 'Flower & Inflorescence' },
      { id: 'fl-ovary-inferior', label: 'Ovary inferior', category: 'Flower & Inflorescence' },
      { id: 'fl-hypanthium', label: 'Hypanthium present', category: 'Flower & Inflorescence' },
      { id: 'fl-gyn-apocarpous', label: 'Gynoecium apocarpous', category: 'Flower & Inflorescence' },
      { id: 'fl-stam-monadelphous', label: 'Stamens monadelphous', category: 'Flower & Inflorescence' },
      { id: 'fl-stam-diadelphous', label: 'Stamens diadelphous', category: 'Flower & Inflorescence' },
      { id: 'fl-stam-synandrous', label: 'Stamens synandrous', category: 'Flower & Inflorescence' },
      { id: 'fl-stam-tetradynamous', label: 'Stamens tetradynamous', category: 'Flower & Inflorescence' },
      { id: 'fl-plac-axile', label: 'Axile placentation', category: 'Flower & Inflorescence' },
      { id: 'fl-plac-parietal', label: 'Parietal placentation', category: 'Flower & Inflorescence' },
      { id: 'fl-plac-freecentral', label: 'Free-central placentation', category: 'Flower & Inflorescence' },
      { id: 'fl-plac-marginal', label: 'Marginal placentation', category: 'Flower & Inflorescence' },
      { id: 'fl-plac-basal', label: 'Basal placentation', category: 'Flower & Inflorescence' },
      { id: 'fl-sex-unisexual', label: 'Flowers unisexual', category: 'Flower & Inflorescence' },
      { id: 'fl-sex-monoecious', label: 'Monoecious', category: 'Flower & Inflorescence' },
      { id: 'fl-sex-dioecious', label: 'Dioecious', category: 'Flower & Inflorescence' },
      { id: 'fl-parts-petals-free', label: 'Petals free', category: 'Flower & Inflorescence' },
      { id: 'fl-parts-petals-fused', label: 'Petals fused', category: 'Flower & Inflorescence' },
      { id: 'fl-parts-sepals-fused', label: 'Sepals fused', category: 'Flower & Inflorescence' },
      { id: 'fl-parts-calyx-enlarges', label: 'Calyx enlarges in fruit', category: 'Flower & Inflorescence' },
      { id: 'fl-parts-corolla-fringed', label: 'Corolla fringed or bifid', category: 'Flower & Inflorescence' },
      { id: 'fl-parts-corolla-appendages', label: 'Corolla with appendages', category: 'Flower & Inflorescence' },
      { id: 'fl-parts-nectar-disk', label: 'Nectar disk present', category: 'Flower & Inflorescence' },
      { id: 'fl-stam-numerous', label: 'Stamens numerous (>10)', category: 'Flower & Inflorescence' },
      { id: 'fl-stam-on-petals', label: 'Stamens on petals', category: 'Flower & Inflorescence' },
      { id: 'fl-stam-opposite-petals', label: 'Stamens opposite the petals', category: 'Flower & Inflorescence' },
      { id: 'fl-stam-appendages', label: 'Stamens with appendages', category: 'Flower & Inflorescence' },
      { id: 'fl-stam-apical-pores', label: 'Anthers opening by apical pores', category: 'Flower & Inflorescence' },
      { id: 'fl-stam-valves', label: 'Anthers opening by valves', category: 'Flower & Inflorescence' },
      { id: 'fl-style-broad', label: 'Stigma broad and sessile', category: 'Flower & Inflorescence' },
      { id: 'fl-style-forked', label: 'Style long and forked', category: 'Flower & Inflorescence' },
      { id: 'fl-style-offcenter', label: 'Style off-center', category: 'Flower & Inflorescence' },
      { id: 'infl-head', label: 'Inflorescence a head', category: 'Flower & Inflorescence' },
      { id: 'infl-umbel', label: 'Inflorescence an umbel', category: 'Flower & Inflorescence' },
      { id: 'infl-cyme', label: 'Inflorescence a cyme', category: 'Flower & Inflorescence' },
      { id: 'infl-raceme', label: 'Inflorescence a raceme', category: 'Flower & Inflorescence' },
      { id: 'infl-spike', label: 'Inflorescence a spike', category: 'Flower & Inflorescence' },
      { id: 'infl-panicle', label: 'Inflorescence a panicle', category: 'Flower & Inflorescence' },
      { id: 'infl-catkin', label: 'Inflorescence a catkin', category: 'Flower & Inflorescence' },
      { id: 'infl-pos-leafopposed', label: 'Inflorescence leaf-opposed', category: 'Flower & Inflorescence' },
      { id: 'infl-pos-trunk', label: 'Flowers on trunk/branches', category: 'Flower & Inflorescence' },
      { id: 'infl-pos-clustered', label: 'Inflorescence clustered', category: 'Flower & Inflorescence' },
      { id: 'infl-pos-leafsurface', label: 'Inflorescence on leaf surface', category: 'Flower & Inflorescence' },
    ],
  },
  {
    category: 'Fruit & Seed',
    characters: [
      { id: 'fr-type-fleshy', label: 'Fruit fleshy', category: 'Fruit & Seed' },
      { id: 'fr-type-capsule', label: 'Fruit a capsule', category: 'Fruit & Seed' },
      { id: 'fr-type-drupe', label: 'Fruit a drupe', category: 'Fruit & Seed' },
      { id: 'fr-type-berry', label: 'Fruit a berry', category: 'Fruit & Seed' },
      { id: 'fr-type-schizocarp', label: 'Fruit a schizocarp', category: 'Fruit & Seed' },
      { id: 'fr-type-achene', label: 'Fruit an achene', category: 'Fruit & Seed' },
      { id: 'fr-type-nut', label: 'Fruit a nut', category: 'Fruit & Seed' },
      { id: 'fr-type-samara', label: 'Fruit a samara', category: 'Fruit & Seed' },
      { id: 'fr-type-follicle', label: 'Fruit a follicle', category: 'Fruit & Seed' },
      { id: 'fr-type-aggregate', label: 'Aggregate fruit', category: 'Fruit & Seed' },
      { id: 'fr-type-multiple', label: 'Multiple fruit', category: 'Fruit & Seed' },
      { id: 'fr-form-spiny', label: 'Fruit spiny or muricate', category: 'Fruit & Seed' },
      { id: 'fr-form-constricted', label: 'Fruit constricted between seeds', category: 'Fruit & Seed' },
      { id: 'fr-form-3locular', label: 'Fruit a 3-locular capsule', category: 'Fruit & Seed' },
      { id: 'fr-form-blue', label: 'Fruit blue in color', category: 'Fruit & Seed' },
      { id: 'fr-form-woody', label: 'Fruit woody', category: 'Fruit & Seed' },
      { id: 'seed-winged', label: 'Seeds winged', category: 'Fruit & Seed' },
      { id: 'seed-tuft', label: 'Seeds with a tuft of hairs', category: 'Fruit & Seed' },
      { id: 'seed-fleshy', label: 'Seeds with a fleshy appendage', category: 'Fruit & Seed' },
      { id: 'seed-ruminate', label: 'Ruminate endosperm', category: 'Fruit & Seed' },
    ],
  },
];

export const APP_NAME = "Taxonomy Workbench Beta";
export const GEMINI_MODEL = "gemini-3.6-flash";
export const SAMPLE_DATA = "Write an identification guide, including a key, for maples (Acer) in the British Isles, focusing on how to tell them apart by their leaf shapes and samara angles.";
export const SYSTEM_PROMPT = "You are an expert botanist and taxonomist. Generate a detailed, structured identification guide based on the user's request. Use Markdown formatting. Include diagnostic features, common species, ecological context, and if requested, a dichotomous key. Be precise with botanical terminology. IMPORTANT: When generating a dichotomous key, DO NOT use standard Markdown numbered lists (like '1. ', '2. ') because Markdown will auto-renumber them and break the lead correspondence. Instead, use bold text for the leads (e.g., '**1a.** Leaves simple... 2') without list formatting. CRITICAL: You MUST separate EVERY lead with a blank line (two newlines) so they render as separate paragraphs. DO NOT put 1a and 1b on the same line.";

