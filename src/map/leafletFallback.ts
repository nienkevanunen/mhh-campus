import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import type { GeoJSON } from 'geojson';
import { getCategoryMeta } from '../config/categories';
import type { Locale } from '../i18n';
import type { BasemapStyle, ThemeMode } from './initMap';
import type { CampusFeature, CampusFeatureCollection } from '../types/campus';
import { deriveTransitRouteLines } from './transitRoutes';

type FilterOptions = {
  searchText: string;
  categories: Set<string>;
};

type LeafletCampusMap = {
  applyFilters: (options: FilterOptions) => void;
  focusFeature: (feature: CampusFeature) => void;
  setTransitLabelsVisible: (visible: boolean) => void;
  setThreeDEnabled: (enabled: boolean) => void;
  setEmojiEnabledCategories: (enabledCategories: Set<string>) => void;
  setLabelEnabledCategories: (enabledCategories: Set<string>) => void;
  setWalkingRoute: (coordinates: [number, number][], animate: boolean) => void;
  clearWalkingRoute: () => void;
  closeDetailPopups: () => void;
  pickPointOnce: (onPick: (coords: [number, number]) => void) => void;
  resetView: () => void;
  alignToReferenceOrientation: () => void;
};

const MHH_CENTER: [number, number] = [52.383675, 9.8049554];
const MHH_BOUNDS = L.latLngBounds(
  [52.374, 9.789],
  [52.392, 9.821],
);
const LEAFLET_MIN_ZOOM = 15;
const LEAFLET_MAX_ZOOM = 19;
const LEAFLET_PERMANENT_LABEL_MIN_ZOOM = 16.2;
const LEAFLET_PERMANENT_SHORT_LABEL_MIN_ZOOM = 15.8;
const LEAFLET_PERMANENT_LABEL_MAX_CHARS = 24;
const CAMPUS_POLYGON_LATLNGS: [number, number][] = [
  [52.3899, 9.7958],
  [52.3899, 9.8069],
  [52.3877, 9.8083],
  [52.3847, 9.8089],
  [52.3818, 9.8089],
  [52.3793, 9.8086],
  [52.3776, 9.8081],
  [52.376, 9.8073],
  [52.3749, 9.8052],
  [52.3746, 9.801],
  [52.3749, 9.7973],
  [52.3762, 9.7962],
  [52.3784, 9.7958],
  [52.3818, 9.7957],
  [52.3855, 9.7957],
  [52.3899, 9.7958],
];

const getLeafletBasemapConfig = (basemap: BasemapStyle, theme: ThemeMode): { url: string; attribution: string } => {
  if (theme === 'dark') {
    return {
      url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      attribution: '&copy; OpenStreetMap contributors, &copy; CARTO',
    };
  }
  if (basemap === 'light') {
    return {
      url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
      attribution: '&copy; OpenStreetMap contributors, &copy; CARTO',
    };
  }
  return {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
  };
};

const colorByCategory = (category: string): string => getCategoryMeta(category).color;

const tooltipContent = (feature: CampusFeature): string => {
  const meta = getCategoryMeta(feature.properties.category);
  const p = feature.properties;
  const displayName =
    p.shortLabel && !p.name.toUpperCase().startsWith(`${p.shortLabel.toUpperCase()} -`) && p.name !== p.shortLabel
      ? `${p.shortLabel} - ${p.name}`
      : p.name;
  return `<span class="tooltip-inner">${meta.icon} <strong>${displayName}</strong></span>`;
};

const iconOnlyContent = (feature: CampusFeature): string => {
  const meta = getCategoryMeta(feature.properties.category);
  return `<span class="emoji-only">${meta.icon}</span>`;
};

const popupHtml = (feature: CampusFeature, locale: Locale): string => {
  const p = feature.properties;
  const displayName =
    p.shortLabel && !p.name.toUpperCase().startsWith(`${p.shortLabel.toUpperCase()} -`) && p.name !== p.shortLabel
      ? `${p.shortLabel} - ${p.name}`
      : p.name;
  const labels =
    locale === 'de'
      ? {
          openingHours: 'Oeffnungszeiten',
          phone: 'Telefon',
          website: 'Webseite',
          transitMode: 'Verkehrsmittel',
          lines: 'Linien',
          direction: 'Richtung',
          entrance: 'Eingang',
          wheelchair: 'Rollstuhl',
          category: 'Kategorie',
          address: 'Adresse',
          lastVerified: 'Zuletzt geprueft',
          source: 'Quelle',
        }
      : {
          openingHours: 'Opening hours',
          phone: 'Phone',
          website: 'Website',
          transitMode: 'Transit mode',
          lines: 'Lines',
          direction: 'Direction',
          entrance: 'Entrance',
          wheelchair: 'Wheelchair',
          category: 'Category',
          address: 'Address',
          lastVerified: 'Last verified',
          source: 'Source',
        };
  const openingHoursRow = p.openingHours
    ? `<p><strong>${labels.openingHours}:</strong> ${p.openingHours}</p>`
    : '';
  const phoneRow = p.phone ? `<p><strong>${labels.phone}:</strong> ${p.phone}</p>` : '';
  const websiteRow = p.website
    ? `<p><strong>${labels.website}:</strong> <a href="${p.website}" target="_blank" rel="noreferrer">${p.website}</a></p>`
    : '';
  const showTransitFields = p.category === 'transit';
  const transitModeRow = showTransitFields && p.transitMode ? `<p><strong>${labels.transitMode}:</strong> ${p.transitMode}</p>` : '';
  const transitLinesRow = showTransitFields && p.transitLines ? `<p><strong>${labels.lines}:</strong> ${p.transitLines}</p>` : '';
  const transitDirectionRow = showTransitFields && p.transitDirection
    ? `<p><strong>${labels.direction}:</strong> ${p.transitDirection}</p>`
    : '';
  const entranceRow = p.entranceType ? `<p><strong>${labels.entrance}:</strong> ${p.entranceType}</p>` : '';
  const wheelchairRow = p.wheelchair ? `<p><strong>${labels.wheelchair}:</strong> ${p.wheelchair}</p>` : '';
  return `
    <article class="popup">
      <h3>${displayName}</h3>
      <p><strong>${labels.category}:</strong> ${p.category}</p>
      <p><strong>${labels.address}:</strong> ${p.address}</p>
      ${transitModeRow}
      ${transitLinesRow}
      ${transitDirectionRow}
      ${entranceRow}
      ${wheelchairRow}
      ${openingHoursRow}
      ${phoneRow}
      ${websiteRow}
      <p><strong>${labels.lastVerified}:</strong> ${p.lastVerified}</p>
      <p><a href="${p.source}" target="_blank" rel="noreferrer">${labels.source}</a></p>
    </article>
  `;
};

const matchesFilters = (feature: CampusFeature, options: FilterOptions): boolean => {
  if (!options.categories.has(feature.properties.category)) {
    return false;
  }

  const query = options.searchText.trim().toLowerCase();
  if (!query) {
    return true;
  }

  const haystack =
    `${feature.properties.shortLabel ?? ''} ${feature.properties.name} ${feature.properties.category} ${feature.properties.address} ${feature.properties.id}`.toLowerCase();
  return query.split(/\s+/).every((term) => haystack.includes(term));
};

const getLabelTooltipOptions = (
  feature: CampusFeature,
  mapZoom: number,
  labelsEnabled: boolean,
  transitLabelsVisible: boolean,
): L.TooltipOptions => {
  const base: L.TooltipOptions = {
    sticky: false,
    direction: 'auto',
    className: 'campus-tooltip campus-tooltip-hover',
    opacity: 1,
  };
  if (transitLabelsVisible && feature.properties.category === 'transit') {
    return { ...base, className: 'campus-tooltip campus-tooltip-permanent', permanent: true };
  }
  if (!labelsEnabled) {
    return base;
  }
  const shortLabel = (feature.properties.shortLabel || '').trim();
  if (shortLabel && mapZoom >= LEAFLET_PERMANENT_SHORT_LABEL_MIN_ZOOM) {
    return { ...base, className: 'campus-tooltip campus-tooltip-permanent', permanent: true };
  }
  if (mapZoom < LEAFLET_PERMANENT_LABEL_MIN_ZOOM) {
    return base;
  }
  const labelText = (feature.properties.shortLabel || feature.properties.name || '').trim();
  if (!labelText || labelText.length > LEAFLET_PERMANENT_LABEL_MAX_CHARS) {
    return base;
  }
  return { ...base, className: 'campus-tooltip campus-tooltip-permanent', permanent: true };
};

export const initLeafletFallbackMap = (
  containerId: string,
  poiData: CampusFeatureCollection,
  buildingData: CampusFeatureCollection,
  locale: Locale,
  basemap: BasemapStyle,
  theme: ThemeMode,
  initialVisibleCategories?: Set<string>,
): LeafletCampusMap => {
  const map = L.map(containerId, {
    center: MHH_CENTER,
    zoom: LEAFLET_MIN_ZOOM,
    minZoom: LEAFLET_MIN_ZOOM,
    maxZoom: LEAFLET_MAX_ZOOM,
    maxBounds: MHH_BOUNDS,
    maxBoundsViscosity: 1.0,
  });

  const basemapConfig = getLeafletBasemapConfig(basemap, theme);
  L.tileLayer(basemapConfig.url, {
    attribution: basemapConfig.attribution,
    minZoom: LEAFLET_MIN_ZOOM,
    maxZoom: LEAFLET_MAX_ZOOM,
  }).addTo(map);

  L.polygon(CAMPUS_POLYGON_LATLNGS, {
    color: '#f43f5e',
    weight: 5,
    fillColor: '#f43f5e',
    fillOpacity: 0.03,
    interactive: false,
  }).addTo(map);

  const transitRouteLayer = L.layerGroup().addTo(map);
  const renderLayer = L.layerGroup().addTo(map);
  const allFeatures: CampusFeature[] = [...buildingData.features, ...poiData.features];
  const transitRouteFeatures = deriveTransitRouteLines(poiData).features;
  let transitLabelsVisible = false;
  let emojiEnabledCategories = new Set<string>(allFeatures.map((feature) => feature.properties.category));
  let labelEnabledCategories = new Set<string>(allFeatures.map((feature) => feature.properties.category));
  const routeLayer = L.layerGroup().addTo(map);
  let routeAnimationId: number | null = null;
  const initialCategories =
    initialVisibleCategories && initialVisibleCategories.size > 0
      ? new Set(initialVisibleCategories)
      : new Set(allFeatures.map((feature) => feature.properties.category));
  let lastOptions: FilterOptions = {
    searchText: '',
    categories: new Set(initialCategories),
  };

  const render = (options: FilterOptions): void => {
    lastOptions = options;
    renderLayer.clearLayers();
    transitRouteLayer.clearLayers();
    const mapZoom = map.getZoom();
    if (transitLabelsVisible) {
      transitRouteFeatures.forEach((feature) => {
        const latLngs = feature.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]);
        L.polyline(latLngs, {
          color: feature.properties.color,
          weight: 4,
          opacity: 0.8,
          lineCap: 'round',
          lineJoin: 'round',
        })
          .bindTooltip(
            `${feature.properties.mode === 'metro' ? 'Metro' : 'Bus'} ${feature.properties.line}`,
            { sticky: true, direction: 'top', className: 'campus-tooltip', opacity: 1 },
          )
          .addTo(transitRouteLayer);
      });
    }

    allFeatures.filter((feature) => matchesFilters(feature, options)).forEach((feature) => {
      const labelsEnabledForFeature = labelEnabledCategories.has(feature.properties.category);
      const tooltipOpts = getLabelTooltipOptions(feature, mapZoom, labelsEnabledForFeature, transitLabelsVisible);

      if (feature.geometry.type === 'Point') {
        const [lng, lat] = feature.geometry.coordinates;
        const category = feature.properties.category;
        if (emojiEnabledCategories.has(category)) {
          L.marker([lat, lng], {
            icon: L.divIcon({
              className: 'emoji-poi-marker',
              html: iconOnlyContent(feature),
              iconSize: [16, 16],
              iconAnchor: [8, 8],
            }),
          })
            .bindTooltip(tooltipContent(feature), tooltipOpts)
            .bindPopup(popupHtml(feature, locale))
            .addTo(renderLayer);
        } else {
          L.circleMarker([lat, lng], {
            radius: 6,
            weight: 1.5,
            color: '#ffffff',
            fillColor: colorByCategory(feature.properties.category),
            fillOpacity: 0.9,
          })
            .bindTooltip(tooltipContent(feature), tooltipOpts)
            .bindPopup(popupHtml(feature, locale))
            .addTo(renderLayer);
        }
        return;
      }

      L.geoJSON(feature as GeoJSON, {
        style: () => ({
          color: '#1d1d1d',
          weight: 1.2,
          fillColor: colorByCategory(feature.properties.category),
          fillOpacity: 0.45,
        }),
        onEachFeature: (_, layer) => {
          layer
            .bindTooltip(tooltipContent(feature), tooltipOpts)
            .bindPopup(popupHtml(feature, locale));
          if (
            (feature.properties.category === 'food' || feature.properties.category === 'parking') &&
            emojiEnabledCategories.has(feature.properties.category) &&
            'getBounds' in layer
          ) {
            const boundedLayer = layer as L.Polygon | L.Polyline;
            const center = boundedLayer.getBounds().getCenter();
            L.marker(center, {
              interactive: false,
              icon: L.divIcon({
                className: 'campus-area-emoji',
                html: iconOnlyContent(feature),
                iconSize: [18, 18],
                iconAnchor: [9, 9],
              }),
            }).addTo(renderLayer);
          }
        },
      }).addTo(renderLayer);
    });
  };

  render(lastOptions);

  return {
    applyFilters: render,
    setTransitLabelsVisible: (visible) => {
      transitLabelsVisible = visible;
      render(lastOptions);
    },
    setThreeDEnabled: (_enabled) => {
      // Leaflet fallback stays 2D.
    },
    setEmojiEnabledCategories: (enabledCategories) => {
      emojiEnabledCategories = new Set(enabledCategories);
      render(lastOptions);
    },
    setLabelEnabledCategories: (enabledCategories) => {
      labelEnabledCategories = new Set(enabledCategories);
      render(lastOptions);
    },
    setWalkingRoute: (coordinates, animate) => {
      routeLayer.clearLayers();
      if (routeAnimationId !== null) {
        cancelAnimationFrame(routeAnimationId);
        routeAnimationId = null;
      }
      if (coordinates.length < 2) return;
      const latLngs = coordinates.map(([lng, lat]) => [lat, lng] as [number, number]);
      L.polyline(latLngs, {
        color: '#0ea5e9',
        weight: 6,
        opacity: 0.9,
      }).addTo(routeLayer);
      L.circleMarker(latLngs[0], { radius: 6, color: '#ffffff', weight: 2, fillColor: '#16a34a', fillOpacity: 1 }).addTo(routeLayer);
      L.circleMarker(latLngs[latLngs.length - 1], {
        radius: 6,
        color: '#ffffff',
        weight: 2,
        fillColor: '#dc2626',
        fillOpacity: 1,
      }).addTo(routeLayer);
      if (!animate) return;
      const marker = L.circleMarker(latLngs[0], {
        radius: 7,
        color: '#ffffff',
        weight: 2,
        fillColor: '#0284c7',
        fillOpacity: 1,
      }).addTo(routeLayer);
      const durationMs = Math.min(20000, Math.max(5000, coordinates.length * 70));
      const startedAt = performance.now();
      const tick = (now: number): void => {
        const progress = Math.min(1, (now - startedAt) / durationMs);
        const exact = progress * (latLngs.length - 1);
        const fromIdx = Math.floor(exact);
        const toIdx = Math.min(latLngs.length - 1, fromIdx + 1);
        const t = exact - fromIdx;
        const from = latLngs[fromIdx];
        const to = latLngs[toIdx];
        const lat = from[0] + (to[0] - from[0]) * t;
        const lng = from[1] + (to[1] - from[1]) * t;
        marker.setLatLng([lat, lng]);
        if (progress < 1) {
          routeAnimationId = requestAnimationFrame(tick);
        } else {
          routeAnimationId = null;
        }
      };
      routeAnimationId = requestAnimationFrame(tick);
    },
    clearWalkingRoute: () => {
      routeLayer.clearLayers();
      if (routeAnimationId !== null) {
        cancelAnimationFrame(routeAnimationId);
        routeAnimationId = null;
      }
    },
    closeDetailPopups: () => {
      map.closePopup();
    },
    pickPointOnce: (onPick) => {
      map.once('click', (event) => {
        onPick([event.latlng.lat, event.latlng.lng]);
      });
    },
    resetView: () => {
      map.flyTo(MHH_CENTER, LEAFLET_MIN_ZOOM, { duration: 0.6 });
    },
    alignToReferenceOrientation: () => {
      // Leaflet fallback does not support map bearing rotation.
      map.flyTo(MHH_CENTER, LEAFLET_MIN_ZOOM, { duration: 0.6 });
    },
    focusFeature: (feature) => {
      const geometry = feature.geometry;
      if (geometry.type === 'Point') {
        const [lng, lat] = geometry.coordinates;
        map.flyTo([lat, lng], 18, { duration: 0.8 });
        return;
      }

      const coordinates =
        geometry.type === 'Polygon'
          ? geometry.coordinates.flat()
          : geometry.type === 'MultiPolygon'
            ? geometry.coordinates.flat(2)
            : [];

      if (coordinates.length > 0) {
        const bounds = L.latLngBounds(coordinates.map(([lng, lat]) => [lat, lng] as [number, number]));
        map.fitBounds(bounds, { padding: [80, 80], maxZoom: 18 });
      }
    },
  };
};
