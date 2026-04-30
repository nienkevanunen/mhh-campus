import fs from 'node:fs/promises';
import path from 'node:path';
import osmtogeojson from 'osmtogeojson';

const root = process.cwd();
const rawPath = path.join(root, 'scripts', 'osm-overpass.raw.json');
const outPath = path.join(root, 'scripts', 'osm-export.example.geojson');

const raw = await fs.readFile(rawPath, 'utf8');
const overpassData = JSON.parse(raw);
const geojson = osmtogeojson(overpassData);

await fs.writeFile(outPath, JSON.stringify(geojson, null, 2));
console.log(`Converted ${geojson.features.length} features to GeoJSON.`);
