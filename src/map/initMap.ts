import maplibregl, { type LngLatBoundsLike, type Map } from 'maplibre-gl';

export const MHH_CENTER: [number, number] = [9.8049554, 52.383675];
const MHH_BOUNDS: LngLatBoundsLike = [
  [9.765, 52.355],
  [9.845, 52.41],
];
export const MAPLIBRE_MIN_ZOOM = 11;
const MAPLIBRE_MAX_ZOOM = 19;
const MAPLIBRE_DEFAULT_ZOOM = 14;

export type BasemapStyle = 'osm' | 'light';
export type ThemeMode = 'light' | 'dark';

const getBasemapConfig = (basemap: BasemapStyle, theme: ThemeMode): { tiles: string[]; attribution: string } => {
  if (theme === 'dark') {
    return {
      tiles: [
        'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
        'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
        'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
        'https://d.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
      ],
      attribution: '&copy; OpenStreetMap contributors, &copy; CARTO',
    };
  }
  if (basemap === 'light') {
    return {
      tiles: [
        'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
        'https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
        'https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
        'https://d.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
      ],
      attribution:
        '&copy; OpenStreetMap contributors, &copy; CARTO',
    };
  }
  return {
    tiles: [
      'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
      'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
      'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
    ],
    attribution: '&copy; OpenStreetMap contributors',
  };
};

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

export const initMap = (containerId: string, basemap: BasemapStyle, theme: ThemeMode): Map => {
  const basemapConfig = getBasemapConfig(basemap, theme);
  const map = new maplibregl.Map({
    container: containerId,
    style: {
      version: 8,
      sources: {
        basemap: {
          type: 'raster',
          tiles: basemapConfig.tiles,
          tileSize: 256,
          attribution: basemapConfig.attribution,
        },
      },
      layers: [
        {
          id: 'basemap-raster',
          type: 'raster',
          source: 'basemap',
          minzoom: 0,
          maxzoom: 19,
        },
      ],
    },
    center: MHH_CENTER,
    zoom: MAPLIBRE_DEFAULT_ZOOM,
    minZoom: MAPLIBRE_MIN_ZOOM,
    maxZoom: MAPLIBRE_MAX_ZOOM,
    maxBounds: MHH_BOUNDS,
  });

  map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right');
  map.addControl(new maplibregl.ScaleControl({ maxWidth: 150, unit: 'metric' }), 'bottom-right');
  return map;
};
