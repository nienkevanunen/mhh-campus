import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const inputPath = path.join(root, 'scripts', 'osm-export.example.geojson');
const outputPoiPath = path.join(root, 'data', 'mhh-poi.geojson');
const outputBuildingPath = path.join(root, 'data', 'mhh-buildings.geojson');
const publicPoiPath = path.join(root, 'public', 'data', 'mhh-poi.geojson');
const publicBuildingPath = path.join(root, 'public', 'data', 'mhh-buildings.geojson');

// Polygon around MHH core campus: includes top-left research area,
// excludes east side past the main road.
const CAMPUS_POLYGON = [
  [9.7958, 52.3899],
  [9.8069, 52.3899],
  [9.8083, 52.3877],
  [9.8089, 52.3847],
  [9.8089, 52.3818],
  [9.8086, 52.3793],
  [9.8081, 52.3776],
  [9.8073, 52.3760],
  [9.8052, 52.3749],
  [9.8010, 52.3746],
  [9.7973, 52.3749],
  [9.7962, 52.3762],
  [9.7958, 52.3784],
  [9.7957, 52.3818],
  [9.7957, 52.3855],
  [9.7958, 52.3899],
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
};

const MANUAL_NAME_BY_RAW_NAME = {
  'Frauenklinik/Transplantationsmedizin/Stationen 81-85': 'K11 - Frauenklinik / Viszeral- und Transplantationschirurgie',
  'Frauenklinik / Transplantationsmedizin / Stationen 81-85':
    'K11 - Frauenklinik / Viszeral- und Transplantationschirurgie',
  'J6 / Theoretische Institute II/Hörsäle Q-S': 'J6',
  'Klinisch Diagnostische Labore und Transfusionsmedizin, Blutspendedienst':
    'K3 - Transfusionsmedizin und Transplantat Engeneering / Zentrallabor',
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

const isGenericGeneratedName = (name = '') => /^(yes|house|apartments|industrial|office|service|warehouse|roof) building \d+$/i.test(name);

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

const isUsefulFeature = (feature) => {
  const repr = representativePoint(feature);
  if (!repr) {
    return false;
  }
  const [lng, lat] = repr;
  if (!pointInPolygon(lng, lat, CAMPUS_POLYGON)) {
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
    return Boolean(props.building || props.amenity || props.healthcare || props.office || props.name);
  }
  if (feature.geometry?.type === 'Point') {
    return Boolean(
      props.name ||
        props.amenity ||
        props.entrance ||
        props.natural === 'tree' ||
        props.highway === 'bus_stop' ||
        props.public_transport ||
        props.railway === 'tram_stop' ||
        props.healthcare,
    );
  }
  return false;
};

const toCampusFeature = (feature, index) => {
  const props = feature.properties ?? {};
  const name = toLabel(props, index);
  const openingHours = props.opening_hours ?? props['opening_hours:covid19'] ?? '';
  const phone = toPhone(props);
  const website = toWebsite(props);
  const transitInfo = toTransitInfo(props);
  const enrichment = MANUAL_ENRICHMENT_BY_NAME[name] ?? {};
  const addressEnrichment = manualEnrichmentFromAddress(props) ?? {};
  const baseCategory = toCategory(props);
  const shortLabel = toShortLabel(props, name);
  const enrichedCategory = addressEnrichment.category ?? enrichment.category ?? baseCategory;
  const category = toBuildingCategoryByCode(shortLabel, enrichedCategory, feature.geometry?.type);
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
  const poiAfterTransitDedupe = dedupeTransitPois(normalized.filter((f) => f.geometry?.type === 'Point'));
  const poi = dedupeBuildingLikePois(poiAfterTransitDedupe, buildings);

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
