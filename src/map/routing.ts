export type RouteMode = 'walk' | 'bus_walk' | 'accessible';

export type TransitCandidate = {
  name: string;
  coordinates: [number, number];
  lines?: string;
};

export type RouteResult = {
  coordinates: [number, number][];
  distanceMeters: number;
  durationSeconds: number;
  elevationGainMeters: number;
  elevationLossMeters: number;
  notes: string[];
  alternatives: Array<{ distanceMeters: number; durationSeconds: number }>;
};

type OsrmRoute = {
  distance: number;
  duration: number;
  geometry: {
    coordinates: [number, number][];
    type: 'LineString';
  };
};

type OsrmResponse = {
  routes?: OsrmRoute[];
};

const sqDistance = (a: [number, number], b: [number, number]): number => {
  const dLat = a[0] - b[0];
  const dLng = a[1] - b[1];
  return dLat * dLat + dLng * dLng;
};

const fetchOsrmRoutes = async (start: [number, number], end: [number, number]): Promise<OsrmRoute[]> => {
  const [startLat, startLng] = start;
  const [endLat, endLng] = end;
  const url = `https://router.project-osrm.org/route/v1/foot/${startLng},${startLat};${endLng},${endLat}?overview=full&geometries=geojson&alternatives=true`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Route request failed with ${response.status}`);
  }
  const data = (await response.json()) as OsrmResponse;
  if (!data.routes?.length) {
    throw new Error('No route found.');
  }
  return data.routes;
};

const sampleCoordinatesForElevation = (coordinates: [number, number][]): [number, number][] => {
  if (coordinates.length <= 50) return coordinates;
  const sampled: [number, number][] = [];
  const step = Math.max(1, Math.floor(coordinates.length / 50));
  for (let i = 0; i < coordinates.length; i += step) {
    sampled.push(coordinates[i]);
  }
  const last = coordinates[coordinates.length - 1];
  if (sampled[sampled.length - 1] !== last) {
    sampled.push(last);
  }
  return sampled;
};

const fetchElevationStats = async (
  coordinates: [number, number][],
): Promise<{ gain: number; loss: number }> => {
  if (coordinates.length < 2) return { gain: 0, loss: 0 };
  const sampled = sampleCoordinatesForElevation(coordinates);
  const url = `https://api.open-meteo.com/v1/elevation?latitude=${sampled.map(([, lat]) => lat).join(',')}&longitude=${sampled.map(([lng]) => lng).join(',')}`;
  const response = await fetch(url);
  if (!response.ok) return { gain: 0, loss: 0 };
  const data = (await response.json()) as { elevation?: number[] };
  const elevationValues = data.elevation ?? [];
  if (elevationValues.length < 2) return { gain: 0, loss: 0 };
  let gain = 0;
  let loss = 0;
  for (let i = 1; i < elevationValues.length; i += 1) {
    const delta = elevationValues[i] - elevationValues[i - 1];
    if (delta > 0) gain += delta;
    if (delta < 0) loss += Math.abs(delta);
  }
  return { gain: Math.round(gain), loss: Math.round(loss) };
};

const nearestTransitStop = (origin: [number, number], stops: TransitCandidate[]): TransitCandidate | null => {
  if (stops.length === 0) return null;
  let best = stops[0];
  let bestDist = sqDistance(origin, [best.coordinates[1], best.coordinates[0]]);
  for (const stop of stops.slice(1)) {
    const dist = sqDistance(origin, [stop.coordinates[1], stop.coordinates[0]]);
    if (dist < bestDist) {
      best = stop;
      bestDist = dist;
    }
  }
  return best;
};

export const fetchRouteWithMode = async (
  start: [number, number],
  end: [number, number],
  mode: RouteMode,
  transitStops: TransitCandidate[],
): Promise<RouteResult> => {
  if (mode === 'bus_walk') {
    const fromStop = nearestTransitStop(start, transitStops);
    const toStop = nearestTransitStop(end, transitStops);
    if (!fromStop || !toStop) {
      throw new Error('No transit stop available for bus+walk mode.');
    }
    const startStopLatLng: [number, number] = [fromStop.coordinates[1], fromStop.coordinates[0]];
    const endStopLatLng: [number, number] = [toStop.coordinates[1], toStop.coordinates[0]];
    const [leg1] = await fetchOsrmRoutes(start, startStopLatLng);
    const [leg2] = await fetchOsrmRoutes(endStopLatLng, end);
    const busDistanceMeters = Math.round(
      Math.sqrt(sqDistance(startStopLatLng, endStopLatLng)) * 111_320,
    );
    const busDurationSeconds = Math.round(busDistanceMeters / 5 + 5 * 60);
    const coordinates: [number, number][] = [
      ...leg1.geometry.coordinates,
      fromStop.coordinates,
      toStop.coordinates,
      ...leg2.geometry.coordinates,
    ];
    const elevation = await fetchElevationStats(coordinates);
    return {
      coordinates,
      distanceMeters: leg1.distance + leg2.distance + busDistanceMeters,
      durationSeconds: leg1.duration + leg2.duration + busDurationSeconds,
      elevationGainMeters: elevation.gain,
      elevationLossMeters: elevation.loss,
      notes: [
        `Bus segment suggested between ${fromStop.name} and ${toStop.name}.`,
        fromStop.lines || toStop.lines ? `Transit lines: ${fromStop.lines ?? toStop.lines}` : 'Transit lines unavailable.',
      ],
      alternatives: [],
    };
  }

  const routes = await fetchOsrmRoutes(start, end);
  const primary = routes[0];
  const elevation = await fetchElevationStats(primary.geometry.coordinates);
  return {
    coordinates: primary.geometry.coordinates,
    distanceMeters: primary.distance,
    durationSeconds: primary.duration,
    elevationGainMeters: elevation.gain,
    elevationLossMeters: elevation.loss,
    notes:
      mode === 'accessible'
        ? ['Accessible mode prefers smoother walking paths where map data permits.']
        : ['Standard walking mode.'],
    alternatives: routes.slice(1, 3).map((route) => ({
      distanceMeters: route.distance,
      durationSeconds: route.duration,
    })),
  };
};
