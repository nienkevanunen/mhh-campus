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

const getRasterStyle = (tiles: string[], attribution: string, opacity = 1) => ({
  version: 8,
  sources: {
    basemap: {
      type: 'raster',
      tiles,
      tileSize: 256,
      attribution,
    },
  },
  layers: [
    {
      id: 'basemap-raster',
      type: 'raster',
      source: 'basemap',
      minzoom: 0,
      maxzoom: 19,
      paint: {
        'raster-opacity': opacity,
      },
    },
  ],
}) as const;

const getBasemapStyle = (basemap: BasemapStyle, theme: ThemeMode): string | object => {
  if (theme === 'dark') {
    return getRasterStyle(
      [
        'https://a.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png',
        'https://b.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png',
        'https://c.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png',
        'https://d.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png',
      ],
      '&copy; OpenStreetMap contributors, &copy; CARTO',
      1,
    );
  }
  if (basemap === 'light') {
    return 'https://tiles.openfreemap.org/styles/positron';
  }
  return getRasterStyle(
    [
      'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
      'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
      'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
    ],
    '&copy; OpenStreetMap contributors',
    0.5,
  );
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
  const basemapStyle = getBasemapStyle(basemap, theme);
  const map = new maplibregl.Map({
    container: containerId,
    style: basemapStyle as never,
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
