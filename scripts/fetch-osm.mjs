import fs from 'node:fs/promises';
import path from 'node:path';
import osmtogeojson from 'osmtogeojson';

const root = process.cwd();
const overpassOutputPath = path.join(root, 'scripts', 'osm-overpass.raw.json');
const geojsonOutputPath = path.join(root, 'scripts', 'osm-export.example.geojson');

// Query must end with `out body; >; out skel qt;` so osmtogeojson can
// reconstruct Polygon/MultiPolygon geometry from way node references.

// MHH campus + immediate surroundings
const BBOX = {
  south: 52.3772,
  west: 9.7958,
  north: 52.3889,
  east: 9.8138,
};

const B = `${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east}`;

const query = `
[out:json][timeout:35];
(
  way["building"](${B});
  relation["building"](${B});
  way["amenity"](${B});
  node["amenity"](${B});
  node["healthcare"](${B});
  way["healthcare"](${B});
  node["public_transport"](${B});
  node["highway"="bus_stop"](${B});
  node["railway"="tram_stop"](${B});
  way["office"="research"](${B});
);
out body;
>;
out skel qt;
`.trim();

const main = async () => {
  const encoded = encodeURIComponent(query);
  const endpoints = [
    `https://overpass-api.de/api/interpreter?data=${encoded}`,
    `https://overpass.kumi.systems/api/interpreter?data=${encoded}`,
    `https://overpass.openstreetmap.ru/api/interpreter?data=${encoded}`,
  ];

  let response;
  for (const endpoint of endpoints) {
    try {
      response = await fetch(endpoint, { signal: AbortSignal.timeout(45_000) });
      if (response.ok) break;
    } catch {
      continue;
    }
  }

  if (!response || !response.ok) {
    const code = response ? `${response.status} ${response.statusText}` : 'no-response';
    throw new Error(`Overpass request failed (${code})`);
  }

  const overpassData = await response.json();
  const geojson = osmtogeojson(overpassData);

  await fs.writeFile(overpassOutputPath, JSON.stringify(overpassData, null, 2));
  await fs.writeFile(geojsonOutputPath, JSON.stringify(geojson, null, 2));

  const featureCount = Array.isArray(geojson.features) ? geojson.features.length : 0;
  console.log(`Fetched OSM data and wrote ${featureCount} GeoJSON features.`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
