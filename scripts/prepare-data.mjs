import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const inputPath = path.join(root, 'scripts', 'osm-export.example.geojson');
const outputPoiPath = path.join(root, 'data', 'mhh-poi.geojson');
const outputBuildingPath = path.join(root, 'data', 'mhh-buildings.geojson');
const publicPoiPath = path.join(root, 'public', 'data', 'mhh-poi.geojson');
const publicBuildingPath = path.join(root, 'public', 'data', 'mhh-buildings.geojson');

// Campus selection regions from user-provided GeoJSON.
const CAMPUS_POLYGONS = [
  [
    [9.7950464, 52.3840753],
    [9.7972712, 52.3806668],
    [9.8001468, 52.3799918],
    [9.8026059, 52.3778735],
    [9.8035248, 52.378132],
    [9.8032617, 52.3787307],
    [9.8056786, 52.3793545],
    [9.8055271, 52.3795735],
    [9.8088773, 52.3806905],
    [9.8092111, 52.3819349],
    [9.8092739, 52.3823908],
    [9.8092155, 52.3828529],
    [9.8089905, 52.3836719],
    [9.8085418, 52.3844827],
    [9.8075002, 52.3859011],
    [9.80798, 52.3867566],
    [9.8075342, 52.3875631],
    [9.806328, 52.3872436],
    [9.8048951, 52.3867914],
    [9.8040168, 52.3871765],
    [9.803311, 52.3869571],
    [9.8029382, 52.3873228],
    [9.8024721, 52.3879323],
    [9.8016702, 52.3876134],
    [9.8015274, 52.3878568],
    [9.8007967, 52.3876733],
    [9.8002497, 52.3875382],
    [9.7998113, 52.3873981],
    [9.8006324, 52.386362],
    [9.7987263, 52.3853408],
    [9.7963876, 52.3847048],
    [9.7957044, 52.384521],
    [9.795276, 52.384408],
    [9.794975, 52.384302],
    [9.7950464, 52.3840753],
  ],
  [
    [9.8099451135, 52.3896324362],
    [9.8096233780, 52.3901870098],
    [9.8088468355, 52.3903026976],
    [9.8080702930, 52.3901870098],
    [9.8077485575, 52.3896324362],
    [9.8080702930, 52.3890778626],
    [9.8088468355, 52.3889621647],
    [9.8096233780, 52.3890778626],
    [9.8099451135, 52.3896324362],
  ],
  [
    [9.8026310125, 52.3773510473],
    [9.8025787455, 52.3774419236],
    [9.8024525842, 52.3774599702],
    [9.8023264229, 52.3774419236],
    [9.8022741559, 52.3773510473],
    [9.8023264229, 52.3772601709],
    [9.8024525842, 52.3772421241],
    [9.8025787455, 52.3772601709],
    [9.8026310125, 52.3773510473],
  ],
  [
    [9.8086395, 52.3895988],
    [9.8089751, 52.3896818],
    [9.8090069, 52.3896015],
    [9.8094105, 52.3890452],
    [9.8090568, 52.3889538],
    [9.8088481, 52.3892002],
    [9.8086395, 52.3895988],
  ],
  [
    [9.8086798, 52.3790073],
    [9.8086798, 52.3790073],
    [9.8086798, 52.3790073],
    [9.8086798, 52.3790073],
  ],
  [
    [9.8084412003, 52.3791350279],
    [9.8088973394, 52.3791350279],
    [9.8088973394, 52.3789610009],
    [9.8084412003, 52.3789610009],
    [9.8084412003, 52.3791350279],
  ],
  [
    [9.8097195613, 52.384649209],
    [9.8099230809, 52.384649209],
    [9.8099230809, 52.384537766],
    [9.8097195613, 52.384537766],
    [9.8097195613, 52.384649209],
  ],
  [
    [9.8096826178, 52.3841762711],
    [9.8098588799, 52.3841762711],
    [9.8098588799, 52.3840633078],
    [9.8096826178, 52.3840633078],
    [9.8096826178, 52.3841762711],
  ],
  [
    [9.8067197865, 52.3885523587],
    [9.8069089065, 52.3885523587],
    [9.8069089065, 52.3884171949],
    [9.8067197865, 52.3884171949],
    [9.8067197865, 52.3885523587],
  ],
  [
    [9.8066696228, 52.3893052007],
    [9.806866208, 52.3893052007],
    [9.806866208, 52.3891882633],
    [9.8066696228, 52.3891882633],
    [9.8066696228, 52.3893052007],
  ],
];

const NON_CAMPUS_BUILDING_TAGS = new Set([
  'house',
  'residential',
  'apartments',
  'detached',
  'semidetached_house',
  'terrace',
  'garage',
  'garages',
  'roof',
  'retail',
  'commercial',
  'yes',
]);
const WALKWAY_HIGHWAY_VALUES = new Set(['footway', 'path', 'steps', 'pedestrian']);
const ACCESSIBILITY_HIGHWAY_VALUES = new Set(['crossing']);
const GREEN_LEISURE_VALUES = new Set(['park', 'garden']);
const GREEN_LANDUSE_VALUES = new Set(['grass', 'meadow', 'forest']);
const GREEN_NATURAL_VALUES = new Set(['wood', 'tree_row']);
const hasAccessibilityHint = (props = {}) =>
  ACCESSIBILITY_HIGHWAY_VALUES.has(String(props.highway ?? '').toLowerCase()) ||
  Boolean(props.kerb) ||
  Boolean(props.tactile_paving) ||
  Boolean(props.ramp) ||
  Boolean(props.wheelchair);
const hasGreenAreaHint = (props = {}) =>
  GREEN_LEISURE_VALUES.has(String(props.leisure ?? '').toLowerCase()) ||
  GREEN_LANDUSE_VALUES.has(String(props.landuse ?? '').toLowerCase()) ||
  GREEN_NATURAL_VALUES.has(String(props.natural ?? '').toLowerCase());

const hasCampusHint = (props = {}) => {
  const rawText = [
    props.name,
    props.ref,
    props['building:ref'],
    props.operator,
    props.brand,
  ]
    .filter(Boolean)
    .join(' ');
  if (!rawText) return false;
  if (/\b([KJZA])[\s-]?(\d{1,2}[A-Z]?)\b/.test(rawText.toUpperCase())) return true;
  return /(mhh|medizinische hochschule|klinik|campus|institut|transplant|research|ciim|twincore)/i.test(rawText);
};

const isKnownNonCampusName = (props = {}) => {
  const name = String(props.name ?? '').toLowerCase();
  if (!name) return false;
  if (name.includes('roderbruchmarkt')) return true;
  if (name.includes('office building 18')) return true;
  if (name.includes('kindergarten') && !name.includes('mhh')) return true;
  return false;
};

const pointInPolygon = (lng, lat, polygon) => {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersects = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
};

const pointInAnyCampusPolygon = (lng, lat) => CAMPUS_POLYGONS.some((polygon) => pointInPolygon(lng, lat, polygon));

const representativePoint = (feature) => {
  const geometry = feature.geometry ?? {};
  if (geometry.type === 'Point') {
    return geometry.coordinates;
  }
  const coordinates =
    geometry.type === 'Polygon'
      ? geometry.coordinates.flat()
      : geometry.type === 'MultiPolygon'
        ? geometry.coordinates.flat(2)
        : geometry.type === 'LineString'
          ? geometry.coordinates
          : geometry.type === 'MultiLineString'
            ? geometry.coordinates.flat()
        : [];
  if (coordinates.length === 0) return null;
  const centroid = coordinates.reduce(
    (acc, [lng, lat]) => [acc[0] + lng, acc[1] + lat],
    [0, 0],
  );
  return [centroid[0] / coordinates.length, centroid[1] / coordinates.length];
};

const toCategory = (props = {}) => {
  const amenity = props.amenity;
  const natural = props.natural;

  if (amenity === 'bench') {
    return 'benches';
  }
  if (amenity === 'waste_basket') {
    return 'waste_baskets';
  }
  if (amenity === 'shelter') {
    return 'shelter';
  }
  if (amenity === 'post_box' || amenity === 'post_office') {
    return 'postal';
  }
  if (amenity === 'parcel_locker') {
    return 'postal';
  }
  if (amenity === 'parking') {
    return 'parking';
  }
  if (amenity === 'parking_entrance') {
    return 'parking';
  }
  if (props.entrance) {
    return 'entrance';
  }
  if (hasAccessibilityHint(props)) {
    return 'accessibility';
  }
  if (hasGreenAreaHint(props)) {
    return 'green_areas';
  }
  if (WALKWAY_HIGHWAY_VALUES.has(String(props.highway ?? '').toLowerCase())) {
    return 'walkways';
  }
  if (amenity === 'bicycle_parking' || amenity === 'bicycle_repair_station' || amenity === 'bicycle_rental') {
    return 'bicycle';
  }
  if (amenity === 'charging_station') {
    return 'charging';
  }
  if (
    amenity === 'fountain' ||
    amenity === 'clock' ||
    amenity === 'smoking_area' ||
    amenity === 'waste_disposal' ||
    props.man_made === 'clock'
  ) {
    return 'facilities';
  }
  if (amenity === 'motorcycle_parking') {
    return 'motorcycle';
  }
  if (natural === 'tree') {
    return 'trees';
  }
  if (amenity === 'restaurant' || amenity === 'cafe' || amenity === 'fast_food' || amenity === 'bar') {
    return 'food';
  }
  if (amenity === 'toilets' || amenity === 'drinking_water' || amenity === 'shower') {
    return 'facilities';
  }
  if (amenity === 'vending_machine' || amenity === 'recycling') {
    return 'facilities';
  }
  if (amenity === 'bank' || amenity === 'atm' || amenity === 'bureau_de_change') {
    return 'finance';
  }
  if (amenity === 'pharmacy' || amenity === 'doctors' || amenity === 'clinic' || amenity === 'hospital') {
    return 'clinic';
  }
  if (props.building === 'hospital' || props.healthcare) {
    return 'clinic';
  }
  if (props.office === 'research' || props.research) {
    return 'research';
  }
  if (props.public_transport || props.highway === 'bus_stop') {
    return 'transit';
  }
  return 'institute';
};

const MANUAL_NAME_BY_ADDRESS = {
  'feodor-lynen-straße|7': 'TWINCORE - Zentrum für Experimentelle und Klinische Infektionsforschung GmbH',
  'feodor-lynen-straße|15': 'CRC Clinical Research Center Hannover',
  'feodor-lynen-straße|1': 'Leonardo Hotel Hannover Medical Park',
  'nikolai-fuchs-straße|1': 'Fraunhofer Institute for Toxicology and Experimental Medicine',
  'nikolai-fuchs-straße|1a': 'Fraunhofer Institute for Toxicology and Experimental Medicine',
  'fuhrberger straße|4': 'Polizeistation Kleefeld',
  'karl-wiechert-allee|15': 'Wohnheim Karl-Wiechert-Allee',
};

const MANUAL_ENRICHMENT_BY_ADDRESS = {
  'feodor-lynen-straße|15': {
    category: 'research',
    website: 'https://crc-hannover.de',
    source: 'https://crc-hannover.de',
  },
  'feodor-lynen-straße|1': {
    website: 'https://www.leonardo-hotels.com/hannover/leonardo-hotel-hannover-medical-park',
    source: 'https://www.leonardo-hotels.com/hannover/leonardo-hotel-hannover-medical-park',
  },
  'nikolai-fuchs-straße|1': {
    category: 'research',
    website: 'https://www.item.fraunhofer.de',
    source: 'https://www.item.fraunhofer.de',
  },
  'nikolai-fuchs-straße|1a': {
    category: 'research',
    website: 'https://www.item.fraunhofer.de',
    source: 'https://www.item.fraunhofer.de',
  },
  'fuhrberger straße|4': {
    category: 'facilities',
  },
  'karl-wiechert-allee|15': {
    category: 'dormitory',
  },
};

const MANUAL_NAME_BY_RAW_NAME = {
  'Frauenklinik/Transplantationsmedizin/Stationen 81-85': 'K11 - Frauenklinik / Viszeral- und Transplantationschirurgie',
  'Frauenklinik / Transplantationsmedizin / Stationen 81-85':
    'K11 - Frauenklinik / Viszeral- und Transplantationschirurgie',
  'J6 / Theoretische Institute II/Hörsäle Q-S': 'J6',
  'Klinisch Diagnostische Labore und Transfusionsmedizin, Blutspendedienst':
    'K3 - Transfusionsmedizin und Transplantat Engeneering / Zentrallabor',
  'dormitory building 50': 'Wohnheim Karl-Wiechert-Allee',
};

const normalizeNameKey = (value = '') =>
  String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const MANUAL_NAME_BY_RAW_NAME_NORMALIZED = Object.fromEntries(
  Object.entries(MANUAL_NAME_BY_RAW_NAME).map(([key, value]) => [normalizeNameKey(key), value]),
);

const normalizeKeyPart = (value = '') =>
  String(value)
    .trim()
    .toLowerCase()
    .replaceAll('strasse', 'straße');

const manualNameFromAddress = (props = {}) => {
  const street = normalizeKeyPart(props['addr:street']);
  const houseNumber = normalizeKeyPart(props['addr:housenumber']);
  if (!street || !houseNumber) return null;
  return MANUAL_NAME_BY_ADDRESS[`${street}|${houseNumber}`] ?? null;
};

const manualEnrichmentFromAddress = (props = {}) => {
  const street = normalizeKeyPart(props['addr:street']);
  const houseNumber = normalizeKeyPart(props['addr:housenumber']);
  if (!street || !houseNumber) return null;
  return MANUAL_ENRICHMENT_BY_ADDRESS[`${street}|${houseNumber}`] ?? null;
};

const isGenericGeneratedName = (name = '') =>
  /^(yes|house|apartments|industrial|office|service|warehouse|roof|dormitory|parking|hotel|public|school|shed|hangar|toilets|farm auxiliary|kiosk) building \d+$/i.test(
    name,
  );

const toLabel = (props = {}, index) => {
  const manualName = manualNameFromAddress(props);
  if (manualName) {
    return manualName;
  }
  const manualNameByRaw = MANUAL_NAME_BY_RAW_NAME_NORMALIZED[normalizeNameKey(props.name)];
  if (manualNameByRaw) {
    return manualNameByRaw;
  }
  if (props.name) {
    if (!isGenericGeneratedName(props.name)) {
      return props.name;
    }
  }
  if (props['name:en']) {
    return props['name:en'];
  }
  if (props.building && props.ref) {
    return `Building ${props.ref}`;
  }
  if (props.building) {
    return `${String(props.building).replaceAll('_', ' ')} building ${index + 1}`;
  }
  if (props.amenity) {
    return `${String(props.amenity).replaceAll('_', ' ')} ${index + 1}`;
  }
  if (props.natural === 'tree') {
    return `Tree ${index + 1}`;
  }
  if (props.entrance) {
    const entranceType = String(props.entrance).replaceAll('_', ' ');
    return `Entrance ${entranceType} ${index + 1}`;
  }
  if (hasAccessibilityHint(props)) {
    return `Accessibility point ${index + 1}`;
  }
  if (hasGreenAreaHint(props)) {
    return `Green area ${index + 1}`;
  }
  if (WALKWAY_HIGHWAY_VALUES.has(String(props.highway ?? '').toLowerCase())) {
    return `Walkway ${index + 1}`;
  }
  if (props.highway === 'bus_stop') {
    return `Bus stop ${index + 1}`;
  }
  return `MHH feature ${index + 1}`;
};

const toAddress = (props = {}) => {
  if (props['addr:full']) {
    return props['addr:full'];
  }
  const street = props['addr:street'];
  const houseNumber = props['addr:housenumber'];
  const postcode = props['addr:postcode'];
  const city = props['addr:city'];
  const parts = [
    street ? `${street}${houseNumber ? ` ${houseNumber}` : ''}` : '',
    postcode ? `${postcode}${city ? ` ${city}` : ''}` : city ?? '',
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : 'Carl-Neuberg-Str. 1, 30625 Hannover';
};

const toPhone = (props = {}) => props.phone ?? props['contact:phone'] ?? '';
const toWebsite = (props = {}) => props.website ?? props.url ?? props['contact:website'] ?? '';
const normalizeLines = (value = '') =>
  String(value)
    .split(/[;,/]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .join(', ');

const toTransitInfo = (props = {}) => {
  const isTransitFeature =
    props.public_transport || props.highway === 'bus_stop' || props.railway === 'tram_stop' || props.bus === 'yes' || props.tram === 'yes';
  if (!isTransitFeature) {
    return {
      transitLines: undefined,
      transitMode: undefined,
      transitDirection: undefined,
    };
  }
  const transitLines = normalizeLines(props.route_ref ?? props.ref ?? props.lines ?? '');
  const transitMode =
    props.tram === 'yes' || props.railway === 'tram_stop'
      ? 'tram'
      : props.highway === 'bus_stop' || props.bus === 'yes'
        ? 'bus'
        : props.public_transport
          ? 'public_transport'
          : '';
  const transitDirection = props.towards ?? props.destination ?? '';
  return {
    transitLines: transitLines || undefined,
    transitMode: transitMode || undefined,
    transitDirection: transitDirection || undefined,
  };
};

const MANUAL_ENRICHMENT_BY_NAME = {
  'K11 - Frauenklinik / Viszeral- und Transplantationschirurgie': {
    category: 'clinic',
    source: 'https://www.mhh.de/',
  },
  'MHH Bibliothek': {
    openingHours: 'Mo-Fr 08:00-22:00; Sa-Su 09:00-20:00',
    phone: '+49 511 532-3329',
    website: 'https://www.mhh.de/bibliothek/',
    source: 'https://www.hobsy.de/bibliotheken/detail/bibliothek-der-medizinischen-hochschule-hannover/',
  },
  'Medizinische Hochschule': {
    transitMode: 'tram/bus',
    transitLines: 'U4, 123, 137',
    transitDirection: 'towards Roderbruch (tram U4)',
    source:
      'https://www.mhh.de/en/children-pneumology-allergology-and-neonatology/patients-visitors/location-and-directions',
  },
  'Misburger Straße': {
    transitMode: 'bus',
    transitLines: '124, 127',
    transitDirection: 'towards dental clinic access',
    source:
      'https://www.mhh.de/en/children-pneumology-allergology-and-neonatology/patients-visitors/location-and-directions',
  },
  'dormitory building 50': {
    category: 'dormitory',
  },
  'Studentenwohnheim Heidjerhof': {
    category: 'dormitory',
  },
};

const MANUAL_BUILDING_SHORT_LABEL_BY_NAME = {
  'Frauenklinik / Klinik für Frauenheilkunde und Geburtshilfe': 'K11',
  Frauenklinik: 'K11',
  'Department of Obstetrics, Gynaecology & Reproductive Medicine': 'K11',
  'Klinik für Frauenheilkunde und Geburtshilfe': 'K11',
};

const CLINIC_CODE_SET = new Set([
  'K1',
  'K2',
  'K3',
  'K4',
  'K5',
  'K6',
  'K7',
  'K8',
  'K9',
  'K10',
  'K11',
  'K12',
  'K14',
  'K20',
  'K21',
  'K25',
]);

const RESEARCH_CODE_SET = new Set([
  'J1',
  'J2',
  'J3',
  'J4',
  'J5',
  'J6',
  'J7',
  'J10',
  'J11',
  'K18',
  'K19',
  'K23',
]);

const ADMIN_TECH_CODE_SET = new Set([
  'J8',
  'K15',
  'K16',
  'K17',
  'K22',
  'K24',
  'K27',
  'K28',
  'K29',
  'M19',
  'Z1',
  'Z2',
  'Z3',
]);

const RESIDENTIAL_CODE_SET = new Set(['B', 'C2', 'D', 'L', 'M']);

const toShortLabel = (props = {}, fallbackName = '') => {
  const manual = MANUAL_BUILDING_SHORT_LABEL_BY_NAME[fallbackName];
  if (manual) return manual;
  const candidates = [
    props.ref,
    props['addr:housenumber'],
    props['building:ref'],
    props['name:short'],
    props.name,
    fallbackName,
  ].filter(Boolean);
  for (const candidate of candidates) {
    const match = String(candidate).toUpperCase().match(/\b([A-Z])[\s-]?(\d{1,2}[A-Z]?)\b/);
    if (match) return `${match[1]}${match[2]}`;
  }
  return undefined;
};

const toBuildingCategoryByCode = (shortLabel, currentCategory, geometryType) => {
  if (geometryType !== 'Polygon' && geometryType !== 'MultiPolygon') {
    return currentCategory;
  }
  const code = String(shortLabel ?? '').trim().toUpperCase();
  if (!code) {
    return currentCategory;
  }
  if (CLINIC_CODE_SET.has(code)) {
    return 'clinic';
  }
  if (RESEARCH_CODE_SET.has(code)) {
    return 'research';
  }
  if (ADMIN_TECH_CODE_SET.has(code)) {
    return 'administration';
  }
  if (RESIDENTIAL_CODE_SET.has(code)) {
    return 'dormitory';
  }
  return currentCategory;
};

const SHORT_LABEL_NO_PREFIX = new Set(['J6']);

const normalizeBuildingDisplayName = (name, shortLabel, geometryType) => {
  if (geometryType !== 'Polygon' && geometryType !== 'MultiPolygon') {
    return name;
  }
  const code = String(shortLabel ?? '').trim().toUpperCase();
  if (!code || SHORT_LABEL_NO_PREFIX.has(code)) {
    return name;
  }
  const rawName = String(name ?? '').trim();
  if (!rawName || rawName.toUpperCase() === code) {
    return rawName;
  }
  if (rawName.toUpperCase().startsWith(`${code} -`)) {
    return rawName;
  }

  // Normalize common patterns like "K27: Name" or "M19 Name" to "K27 - Name".
  const leadingCodePattern = new RegExp(`^${code}\\s*[:\\-]?\\s*(.+)$`, 'i');
  const match = rawName.match(leadingCodePattern);
  if (match?.[1]) {
    const rest = match[1].trim();
    return rest ? `${code} - ${rest}` : code;
  }
  return `${code} - ${rawName}`;
};

const isUsefulFeature = (feature) => {
  const repr = representativePoint(feature);
  if (!repr) {
    return false;
  }
  const [lng, lat] = repr;
  if (!pointInAnyCampusPolygon(lng, lat)) {
    return false;
  }

  const props = feature.properties ?? {};
  if (feature.geometry?.type === 'Polygon' || feature.geometry?.type === 'MultiPolygon') {
    if (isKnownNonCampusName(props) && !hasCampusHint(props)) {
      return false;
    }
    const buildingTag = String(props.building ?? '').toLowerCase();
    const isResearchSite = props.office === 'research' || Boolean(props.research);
    if (
      NON_CAMPUS_BUILDING_TAGS.has(buildingTag) &&
      !hasCampusHint(props) &&
      !props.amenity &&
      !props.healthcare &&
      !isResearchSite
    ) {
      return false;
    }
    return Boolean(props.building || props.amenity || props.healthcare || props.office || props.name || hasGreenAreaHint(props));
  }
  if (feature.geometry?.type === 'Point') {
    return Boolean(
      props.name ||
        props.amenity ||
        props.entrance ||
        hasAccessibilityHint(props) ||
        hasGreenAreaHint(props) ||
        props.natural === 'tree' ||
        props.highway === 'bus_stop' ||
        props.public_transport ||
        props.railway === 'tram_stop' ||
        props.healthcare,
    );
  }
  if (feature.geometry?.type === 'LineString' || feature.geometry?.type === 'MultiLineString') {
    const highway = String(props.highway ?? '').toLowerCase();
    return WALKWAY_HIGHWAY_VALUES.has(highway) || hasGreenAreaHint(props);
  }
  return false;
};

const toCampusFeature = (feature, index) => {
  const props = feature.properties ?? {};
  const rawName = toLabel(props, index);
  const openingHours = props.opening_hours ?? props['opening_hours:covid19'] ?? '';
  const phone = toPhone(props);
  const website = toWebsite(props);
  const transitInfo = toTransitInfo(props);
  const enrichment = MANUAL_ENRICHMENT_BY_NAME[rawName] ?? {};
  const addressEnrichment = manualEnrichmentFromAddress(props) ?? {};
  const baseCategory = toCategory(props);
  const shortLabel = toShortLabel(props, rawName);
  const enrichedCategory = addressEnrichment.category ?? enrichment.category ?? baseCategory;
  const geometryType = feature.geometry?.type;
  const category = toBuildingCategoryByCode(shortLabel, enrichedCategory, geometryType);
  const name = normalizeBuildingDisplayName(rawName, shortLabel, geometryType);
  return {
    type: 'Feature',
    geometry: feature.geometry,
    properties: {
      id: props['@id'] ?? `osm-${index + 1}`,
      name,
      category,
      address: toAddress(props),
      openingHours: (enrichment.openingHours ?? openingHours) || undefined,
      phone: (enrichment.phone ?? phone) || undefined,
      website: (addressEnrichment.website ?? enrichment.website ?? website) || undefined,
      transitMode: (enrichment.transitMode ?? transitInfo.transitMode) || undefined,
      transitLines: (enrichment.transitLines ?? transitInfo.transitLines) || undefined,
      transitDirection: (enrichment.transitDirection ?? transitInfo.transitDirection) || undefined,
      entranceType: props.entrance ? String(props.entrance) : undefined,
      wheelchair: props.wheelchair ? String(props.wheelchair) : undefined,
      crossingType: props.crossing ? String(props.crossing) : undefined,
      kerb: props.kerb ? String(props.kerb) : undefined,
      tactilePaving: props.tactile_paving ? String(props.tactile_paving) : undefined,
      ramp: props.ramp ? String(props.ramp) : undefined,
      bicycleCapacity: props.capacity ? String(props.capacity) : undefined,
      bicycleCovered: props.covered ? String(props.covered) : undefined,
      bicycleAccess: props.access ? String(props.access) : undefined,
      parkingCapacity: props.capacity ? String(props.capacity) : undefined,
      parkingFee: props.fee ? String(props.fee) : undefined,
      parkingMaxStay: props.maxstay ? String(props.maxstay) : undefined,
      parkingType: props.parking ? String(props.parking) : undefined,
      evSockets:
        props['socket:type2'] || props['socket:schuko'] || props['socket:ccs'] || props['socket:tesla_supercharger']
          ? [
              props['socket:type2'] ? `type2=${props['socket:type2']}` : '',
              props['socket:schuko'] ? `schuko=${props['socket:schuko']}` : '',
              props['socket:ccs'] ? `ccs=${props['socket:ccs']}` : '',
              props['socket:tesla_supercharger'] ? `tesla=${props['socket:tesla_supercharger']}` : '',
            ]
              .filter(Boolean)
              .join(', ')
          : undefined,
      shortLabel,
      source: addressEnrichment.source ?? enrichment.source ?? 'https://www.openstreetmap.org/',
      lastVerified: new Date().toISOString().slice(0, 10),
    },
  };
};

const shouldKeepCampusFeature = (feature) => {
  const name = String(feature?.properties?.name ?? '').toLowerCase();
  if (!name) return true;
  if (name === 'office building 18') return false;
  if (/^kindergarten building \d+$/.test(name)) return false;
  if (/^warehouse building \d+$/.test(name)) return false;
  if (name.includes('roderbruchmarkt')) return false;
  return true;
};

const pointCoordinates = (feature) => {
  if (feature?.geometry?.type !== 'Point') return null;
  const [lng, lat] = feature.geometry.coordinates ?? [];
  if (typeof lng !== 'number' || typeof lat !== 'number') return null;
  return { lng, lat };
};

const distanceMeters = (a, b) => {
  const latFactor = 111_320;
  const lngFactor = Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180)) * 111_320;
  const dLat = (a.lat - b.lat) * latFactor;
  const dLng = (a.lng - b.lng) * lngFactor;
  return Math.sqrt(dLat * dLat + dLng * dLng);
};

const transitScore = (feature) => {
  const p = feature.properties ?? {};
  let score = 0;
  if (p.transitLines) score += 3;
  if (p.transitDirection) score += 2;
  if (p.transitMode) score += 1;
  if (p.website) score += 1;
  return score;
};

const dedupeTransitPois = (poiFeatures) => {
  const kept = [];
  for (const feature of poiFeatures) {
    if (feature.properties?.category !== 'transit') {
      kept.push(feature);
      continue;
    }
    const coords = pointCoordinates(feature);
    if (!coords) {
      kept.push(feature);
      continue;
    }
    const name = String(feature.properties?.name ?? '').trim().toLowerCase();
    const duplicateIndex = kept.findIndex((candidate) => {
      if (candidate.properties?.category !== 'transit') return false;
      const candidateName = String(candidate.properties?.name ?? '').trim().toLowerCase();
      if (!name || !candidateName || name !== candidateName) return false;
      const candidateCoords = pointCoordinates(candidate);
      if (!candidateCoords) return false;
      return distanceMeters(coords, candidateCoords) <= 30;
    });
    if (duplicateIndex === -1) {
      kept.push(feature);
      continue;
    }
    if (transitScore(feature) > transitScore(kept[duplicateIndex])) {
      kept[duplicateIndex] = feature;
    }
  }
  return kept;
};

const dedupeBuildingLikePois = (poiFeatures, buildingFeatures) => {
  const normalizeAddressKey = (value = '') =>
    String(value)
      .toLowerCase()
      .replaceAll('straße', 'str')
      .replaceAll('str.', 'str')
      .replaceAll('strasse', 'str')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();

  return poiFeatures.filter((poi) => {
    const poiShort = String(poi.properties?.shortLabel ?? '').trim().toUpperCase();
    if (!poiShort) return true;
    if (!/^[A-Z]\d{1,2}[A-Z]?$/.test(poiShort)) return true;
    const poiAddress = normalizeAddressKey(poi.properties?.address ?? '');
    if (!poiAddress) return true;
    const hasNearbyBuildingWithSameCode = buildingFeatures.some((building) => {
      const buildingShort = String(building.properties?.shortLabel ?? '').trim().toUpperCase();
      if (buildingShort !== poiShort) return false;
      const buildingAddress = normalizeAddressKey(building.properties?.address ?? '');
      if (!buildingAddress) return false;
      return buildingAddress === poiAddress;
    });
    return !hasNearbyBuildingWithSameCode;
  });
};

const main = async () => {
  let raw;
  try {
    raw = await fs.readFile(inputPath, 'utf8');
  } catch {
    console.error('Missing scripts/osm-export.example.geojson. Add your OSM export first.');
    process.exit(1);
  }

  const data = JSON.parse(raw);
  const features = Array.isArray(data.features) ? data.features : [];
  const normalized = features.filter(isUsefulFeature).map(toCampusFeature).filter(shouldKeepCampusFeature);

  const buildings = normalized.filter((f) => f.geometry?.type === 'Polygon' || f.geometry?.type === 'MultiPolygon');
  const poiPoints = normalized.filter((f) => f.geometry?.type === 'Point');
  const poiLineFeatures = normalized.filter(
    (f) => f.geometry?.type === 'LineString' || f.geometry?.type === 'MultiLineString',
  );
  const poiAfterTransitDedupe = dedupeTransitPois(poiPoints);
  const dedupedPointPois = dedupeBuildingLikePois(poiAfterTransitDedupe, buildings);
  const poi = [...dedupedPointPois, ...poiLineFeatures];

  const poiJson = JSON.stringify({ type: 'FeatureCollection', features: poi }, null, 2);
  const buildingJson = JSON.stringify({ type: 'FeatureCollection', features: buildings }, null, 2);

  await fs.mkdir(path.join(root, 'public', 'data'), { recursive: true });
  await Promise.all([
    fs.writeFile(outputPoiPath, poiJson),
    fs.writeFile(outputBuildingPath, buildingJson),
    fs.writeFile(publicPoiPath, poiJson),
    fs.writeFile(publicBuildingPath, buildingJson),
  ]);

  console.log(`Prepared ${poi.length} POIs and ${buildings.length} building features → data/ and public/data/`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
