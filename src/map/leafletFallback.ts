import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import type { GeoJSON } from 'geojson';
import { getCategoryMeta } from '../config/categories';
import type { Locale } from '../i18n';
import type { CampusFeature, CampusFeatureCollection } from '../types/campus';

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
  setWalkingRoute: (coordinates: [number, number][], animate: boolean) => void;
  clearWalkingRoute: () => void;
  closeDetailPopups: () => void;
  pickPointOnce: (onPick: (coords: [number, number]) => void) => void;
};

const MHH_CENTER: [number, number] = [52.383675, 9.8049554];
const MHH_BOUNDS = L.latLngBounds(
  [52.374, 9.789],
  [52.392, 9.821],
);
const LEAFLET_MIN_ZOOM = 15;
const LEAFLET_MAX_ZOOM = 19;

const colorByCategory = (category: string): string => getCategoryMeta(category).color;

const tooltipContent = (feature: CampusFeature): string => {
  const meta = getCategoryMeta(feature.properties.category);
  return `<span class="tooltip-inner">${meta.icon} <strong>${feature.properties.name}</strong></span>`;
};

const iconOnlyContent = (feature: CampusFeature): string => {
  const meta = getCategoryMeta(feature.properties.category);
  return `<span class="emoji-only">${meta.icon}</span>`;
};

const popupHtml = (feature: CampusFeature, locale: Locale): string => {
  const p = feature.properties;
  const labels =
    locale === 'de'
      ? {
          openingHours: 'Oeffnungszeiten',
          phone: 'Telefon',
          website: 'Webseite',
          transitMode: 'Verkehrsmittel',
          lines: 'Linien',
          direction: 'Richtung',
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
  const transitModeRow = p.transitMode ? `<p><strong>${labels.transitMode}:</strong> ${p.transitMode}</p>` : '';
  const transitLinesRow = p.transitLines ? `<p><strong>${labels.lines}:</strong> ${p.transitLines}</p>` : '';
  const transitDirectionRow = p.transitDirection
    ? `<p><strong>${labels.direction}:</strong> ${p.transitDirection}</p>`
    : '';
  return `
    <article class="popup">
      <h3>${p.name}</h3>
      <p><strong>${labels.category}:</strong> ${p.category}</p>
      <p><strong>${labels.address}:</strong> ${p.address}</p>
      ${transitModeRow}
      ${transitLinesRow}
      ${transitDirectionRow}
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

  const haystack = `${feature.properties.name} ${feature.properties.category} ${feature.properties.address} ${feature.properties.id}`.toLowerCase();
  return query.split(/\s+/).every((term) => haystack.includes(term));
};

export const initLeafletFallbackMap = (
  containerId: string,
  poiData: CampusFeatureCollection,
  buildingData: CampusFeatureCollection,
  locale: Locale,
): LeafletCampusMap => {
  const map = L.map(containerId, {
    center: MHH_CENTER,
    zoom: LEAFLET_MIN_ZOOM,
    minZoom: LEAFLET_MIN_ZOOM,
    maxZoom: LEAFLET_MAX_ZOOM,
    maxBounds: MHH_BOUNDS,
    maxBoundsViscosity: 1.0,
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    minZoom: LEAFLET_MIN_ZOOM,
    maxZoom: LEAFLET_MAX_ZOOM,
  }).addTo(map);

  const renderLayer = L.layerGroup().addTo(map);
  const allFeatures: CampusFeature[] = [...buildingData.features, ...poiData.features];
  let transitLabelsVisible = false;
  let emojiEnabledCategories = new Set<string>(allFeatures.map((feature) => feature.properties.category));
  const routeLayer = L.layerGroup().addTo(map);
  let routeAnimationId: number | null = null;
  let lastOptions: FilterOptions = {
    searchText: '',
    categories: new Set(allFeatures.map((feature) => feature.properties.category)),
  };

  const render = (options: FilterOptions): void => {
    lastOptions = options;
    renderLayer.clearLayers();

    allFeatures.filter((feature) => matchesFilters(feature, options)).forEach((feature) => {
      const tooltipOpts: L.TooltipOptions = {
        sticky: false,
        direction: 'auto',
        className: 'campus-tooltip',
        opacity: 1,
      };
      const transitTooltipOpts: L.TooltipOptions = {
        ...tooltipOpts,
        permanent: true,
      };

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
            .bindTooltip(
              tooltipContent(feature),
              transitLabelsVisible && feature.properties.category === 'transit'
                ? transitTooltipOpts
                : tooltipOpts,
            )
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
            .bindTooltip(
              tooltipContent(feature),
              transitLabelsVisible && feature.properties.category === 'transit'
                ? transitTooltipOpts
                : tooltipOpts,
            )
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

  render({ searchText: '', categories: new Set(allFeatures.map((feature) => feature.properties.category)) });

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
