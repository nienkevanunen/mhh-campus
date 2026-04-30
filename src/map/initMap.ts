import maplibregl, { type LngLatBoundsLike, type Map } from 'maplibre-gl';

const MHH_CENTER: [number, number] = [9.8049554, 52.383675];
const MHH_BOUNDS: LngLatBoundsLike = [
  [9.789, 52.374],
  [9.821, 52.392],
];
const MAPLIBRE_MIN_ZOOM = 12;
const MAPLIBRE_MAX_ZOOM = 19;

export const hasWebGlSupport = (): boolean => {
  const canvas = document.createElement('canvas');
  const gl2 = canvas.getContext('webgl2');
  if (gl2) {
    return true;
  }
  const gl =
    canvas.getContext('webgl', { failIfMajorPerformanceCaveat: false }) ||
    canvas.getContext('experimental-webgl', { failIfMajorPerformanceCaveat: false });
  return Boolean(gl);
};

export const initMap = (containerId: string): Map => {
  const map = new maplibregl.Map({
    container: containerId,
    style: {
      version: 8,
      sources: {
        osm: {
          type: 'raster',
          tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
          tileSize: 256,
          attribution: '&copy; OpenStreetMap contributors',
        },
      },
      layers: [
        {
          id: 'osm-raster',
          type: 'raster',
          source: 'osm',
          minzoom: 0,
          maxzoom: 19,
        },
      ],
    },
    center: MHH_CENTER,
    zoom: MAPLIBRE_MIN_ZOOM,
    minZoom: MAPLIBRE_MIN_ZOOM,
    maxZoom: MAPLIBRE_MAX_ZOOM,
    maxBounds: MHH_BOUNDS,
  });

  map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right');
  map.addControl(new maplibregl.ScaleControl({ maxWidth: 150, unit: 'metric' }), 'bottom-right');
  return map;
};
