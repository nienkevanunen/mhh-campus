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
  node["entrance"](${B});
  node["natural"="tree"](${B});
  node["highway"="crossing"](${B});
  node["kerb"](${B});
  node["tactile_paving"](${B});
  node["ramp"](${B});
  node["wheelchair"](${B});
  way["leisure"~"^(park|garden)$"](${B});
  way["landuse"~"^(grass|meadow|forest)$"](${B});
  way["natural"~"^(wood|tree_row)$"](${B});
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

const delay = (ms) => new Promise((resolve) => {
  setTimeout(resolve, ms);
});

const fetchEndpointWithRetries = async (endpoint) => {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(endpoint, { signal: AbortSignal.timeout(45_000) });
      if (response.ok) {
        return response;
      }
      if (response.status !== 429) {
        return response;
      }
      if (attempt < maxAttempts) {
        const backoffMs = attempt * 3000;
        await delay(backoffMs);
      }
    } catch {
      if (attempt < maxAttempts) {
        const backoffMs = attempt * 3000;
        await delay(backoffMs);
      }
    }
  }
  return undefined;
};

const main = async () => {
  const encoded = encodeURIComponent(query);
  const endpoints = [
    `https://overpass-api.de/api/interpreter?data=${encoded}`,
    `https://overpass.kumi.systems/api/interpreter?data=${encoded}`,
    `https://overpass.openstreetmap.ru/api/interpreter?data=${encoded}`,
  ];

  let response;
  for (const endpoint of endpoints) {
    response = await fetchEndpointWithRetries(endpoint);
    if (response?.ok) {
      break;
    }
  }

  if (!response || !response.ok) {
    const code = response ? `${response.status} ${response.statusText}` : 'no-response';
    throw new Error(
      `Overpass request failed (${code}). Try again in a few minutes, or run npm run prepare-data to keep using the latest local export.`,
    );
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
