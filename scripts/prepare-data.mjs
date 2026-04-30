import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const inputPath = path.join(root, 'scripts', 'osm-export.example.geojson');
const outputPoiPath = path.join(root, 'data', 'mhh-poi.geojson');
const outputBuildingPath = path.join(root, 'data', 'mhh-buildings.geojson');
const publicPoiPath = path.join(root, 'public', 'data', 'mhh-poi.geojson');
const publicBuildingPath = path.join(root, 'public', 'data', 'mhh-buildings.geojson');

const toCategory = (props = {}) => {
  const amenity = props.amenity;

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
  if (amenity === 'bicycle_parking' || amenity === 'bicycle_repair_station' || amenity === 'bicycle_rental') {
    return 'bicycle';
  }
  if (amenity === 'charging_station') {
    return 'charging';
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

const toLabel = (props = {}, index) => {
  if (props.name) {
    return props.name;
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

const isUsefulFeature = (feature) => {
  const props = feature.properties ?? {};
  if (feature.geometry?.type === 'Polygon' || feature.geometry?.type === 'MultiPolygon') {
    return Boolean(props.building || props.amenity || props.healthcare || props.office || props.name);
  }
  if (feature.geometry?.type === 'Point') {
    return Boolean(
      props.name ||
        props.amenity ||
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
  return {
    type: 'Feature',
    geometry: feature.geometry,
    properties: {
      id: props['@id'] ?? `osm-${index + 1}`,
      name,
      category: toCategory(props),
      address: toAddress(props),
      openingHours: (enrichment.openingHours ?? openingHours) || undefined,
      phone: (enrichment.phone ?? phone) || undefined,
      website: (enrichment.website ?? website) || undefined,
      transitMode: (enrichment.transitMode ?? transitInfo.transitMode) || undefined,
      transitLines: (enrichment.transitLines ?? transitInfo.transitLines) || undefined,
      transitDirection: (enrichment.transitDirection ?? transitInfo.transitDirection) || undefined,
      source: enrichment.source ?? 'https://www.openstreetmap.org/',
      lastVerified: new Date().toISOString().slice(0, 10),
    },
  };
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
  const normalized = features.filter(isUsefulFeature).map(toCampusFeature);

  const poi = normalized.filter((f) => f.geometry?.type === 'Point');
  const buildings = normalized.filter((f) => f.geometry?.type === 'Polygon' || f.geometry?.type === 'MultiPolygon');

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
