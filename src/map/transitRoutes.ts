import type { Feature, FeatureCollection, LineString } from 'geojson';
import type { CampusFeatureCollection } from '../types/campus';

type TransitRouteProps = {
  id: string;
  line: string;
  mode: string;
  color: string;
};

export type TransitRouteFeature = Feature<LineString, TransitRouteProps>;
export type TransitRouteFeatureCollection = FeatureCollection<LineString, TransitRouteProps>;

type StopPoint = {
  lng: number;
  lat: number;
};

const toLineTokens = (raw: string): string[] =>
  raw
    .split(/[;,/|]/)
    .map((value) => value.trim())
    .filter(Boolean);

const uniqueByCoordinate = (points: StopPoint[]): StopPoint[] => {
  const seen = new Set<string>();
  const unique: StopPoint[] = [];
  for (const point of points) {
    const key = `${point.lng.toFixed(6)}|${point.lat.toFixed(6)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(point);
  }
  return unique;
};

const sqDistance = (a: StopPoint, b: StopPoint): number => {
  const dLng = a.lng - b.lng;
  const dLat = a.lat - b.lat;
  return dLng * dLng + dLat * dLat;
};

const orderStopsGreedy = (input: StopPoint[]): StopPoint[] => {
  if (input.length <= 2) return [...input];
  const points = [...input];
  let startIndex = 0;
  for (let i = 1; i < points.length; i += 1) {
    if (points[i].lng < points[startIndex].lng) startIndex = i;
  }
  const ordered: StopPoint[] = [points[startIndex]];
  points.splice(startIndex, 1);
  while (points.length > 0) {
    const current = ordered[ordered.length - 1];
    let nearestIndex = 0;
    let nearestDistance = sqDistance(current, points[0]);
    for (let i = 1; i < points.length; i += 1) {
      const distance = sqDistance(current, points[i]);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = i;
      }
    }
    ordered.push(points[nearestIndex]);
    points.splice(nearestIndex, 1);
  }
  return ordered;
};

const hashColor = (seed: string): string => {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 75% 48%)`;
};

const normalizeMode = (mode?: string): string => {
  const normalized = (mode ?? '').trim().toLowerCase();
  if (!normalized) return 'bus';
  if (normalized.includes('bahn') || normalized.includes('metro') || normalized.includes('tram')) return 'metro';
  return 'bus';
};

export const deriveTransitRouteLines = (poiData: CampusFeatureCollection): TransitRouteFeatureCollection => {
  const grouped = new Map<string, { mode: string; line: string; points: StopPoint[] }>();

  for (const feature of poiData.features) {
    if (feature.properties.category !== 'transit') continue;
    if (feature.geometry.type !== 'Point') continue;
    const [lng, lat] = feature.geometry.coordinates;
    const lineTokens = toLineTokens(feature.properties.transitLines ?? '');
    if (lineTokens.length === 0) continue;
    const mode = normalizeMode(feature.properties.transitMode);
    for (const line of lineTokens) {
      const key = `${mode}|${line}`;
      const group = grouped.get(key) ?? { mode, line, points: [] };
      group.points.push({ lng, lat });
      grouped.set(key, group);
    }
  }

  const features: TransitRouteFeature[] = [];
  for (const [key, group] of grouped.entries()) {
    const uniquePoints = uniqueByCoordinate(group.points);
    if (uniquePoints.length < 2) continue;
    const orderedPoints = orderStopsGreedy(uniquePoints);
    features.push({
      type: 'Feature',
      properties: {
        id: key,
        line: group.line,
        mode: group.mode,
        color: hashColor(key),
      },
      geometry: {
        type: 'LineString',
        coordinates: orderedPoints.map((point) => [point.lng, point.lat]),
      },
    });
  }

  return {
    type: 'FeatureCollection',
    features,
  };
};
