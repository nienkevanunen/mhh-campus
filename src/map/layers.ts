import maplibregl, { type Map } from 'maplibre-gl';
import { CATEGORY_META, getCategoryMeta } from '../config/categories';
import type { Locale } from '../i18n';
import type { CampusFeature, CampusFeatureCollection } from '../types/campus';

const BUILDINGS_SOURCE = 'campus-buildings';
const POI_SOURCE = 'campus-poi';
const BUILDINGS_LAYER = 'campus-buildings-fill';
const BUILDINGS_OUTLINE_LAYER = 'campus-buildings-outline';
const BUILDINGS_EXTRUSION_LAYER = 'campus-buildings-extrusion';
const BUILDINGS_ICON_LAYER = 'campus-buildings-icons';
const POI_LAYER = 'campus-poi-points';
const POI_ICON_LAYER = 'campus-poi-icons';
const TRANSIT_LABELS_LAYER = 'campus-transit-labels';
const ROUTE_SOURCE = 'campus-walk-route';
const ROUTE_LAYER = 'campus-walk-route-line';
const ROUTE_START_LAYER = 'campus-walk-route-start';
const ROUTE_END_LAYER = 'campus-walk-route-end';
const BUILDING_EMOJI_CATEGORIES = ['food', 'parking'];
let emojiEnabledCategories = new Set<string>();
const movingMarkers = new WeakMap<Map, maplibregl.Marker>();
const routeAnimations = new WeakMap<Map, number>();

const categoryColorExpression = (fallbackCategory = 'institute'): unknown[] => {
  const expression: unknown[] = ['match', ['get', 'category']];
  Object.entries(CATEGORY_META).forEach(([category, meta]) => {
    expression.push(category, meta.color);
  });
  expression.push(getCategoryMeta(fallbackCategory).color);
  return expression;
};

const categoryBadgeExpression = (): unknown[] => [
  'match',
  ['get', 'category'],
  'parking',
  'P',
  'food',
  'F',
  'benches',
  'B',
  'waste_baskets',
  'W',
  'postal',
  'Post',
  'bicycle',
  'Bike',
  'charging',
  'EV',
  'facilities',
  'WC',
  'finance',
  '$',
  'transit',
  'T',
  'shelter',
  'S',
  '•',
];

const getFilter = (searchText: string, categories: Set<string>) => {
  const normalized = searchText.trim().toLowerCase();
  const categoryList = [...categories];
  const terms = normalized.split(/\s+/).filter(Boolean);

  const allFilters: unknown[] = [];

  if (categoryList.length > 0) {
    allFilters.push(['in', ['get', 'category'], ['literal', categoryList]]);
  } else {
    allFilters.push(['==', ['get', 'category'], '___none___']);
  }

  if (terms.length > 0) {
    const termFilters = terms.map((term) => [
      'any',
      ['>=', ['index-of', term, ['downcase', ['coalesce', ['get', 'name'], '']]], 0],
      ['>=', ['index-of', term, ['downcase', ['coalesce', ['get', 'address'], '']]], 0],
      ['>=', ['index-of', term, ['downcase', ['coalesce', ['get', 'id'], '']]], 0],
    ]);

    allFilters.push(['all', ...termFilters]);
  }

  return allFilters.length === 1 ? allFilters[0] : ['all', ...allFilters];
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

const cancelRouteAnimation = (map: Map): void => {
  const raf = routeAnimations.get(map);
  if (raf !== undefined) {
    cancelAnimationFrame(raf);
    routeAnimations.delete(map);
  }
  const marker = movingMarkers.get(map);
  if (marker) {
    marker.remove();
    movingMarkers.delete(map);
  }
};

export const addCampusLayers = (
  map: Map,
  poiData: CampusFeatureCollection,
  buildingData: CampusFeatureCollection,
  locale: Locale,
): void => {
  map.on('load', () => {
    map.addSource(BUILDINGS_SOURCE, { type: 'geojson', data: buildingData });
    map.addSource(POI_SOURCE, { type: 'geojson', data: poiData });

    map.addLayer({
      id: BUILDINGS_LAYER,
      type: 'fill',
      source: BUILDINGS_SOURCE,
      paint: {
        'fill-color': categoryColorExpression('institute') as never,
        'fill-opacity': 0.5,
      },
    });

    map.addLayer({
      id: BUILDINGS_OUTLINE_LAYER,
      type: 'line',
      source: BUILDINGS_SOURCE,
      paint: {
        'line-color': '#1d1d1d',
        'line-width': 1.2,
      },
    });

    map.addLayer({
      id: BUILDINGS_EXTRUSION_LAYER,
      type: 'fill-extrusion',
      source: BUILDINGS_SOURCE,
      paint: {
        'fill-extrusion-color': categoryColorExpression('institute') as never,
        'fill-extrusion-height': [
          'match',
          ['get', 'category'],
          'clinic',
          34,
          'institute',
          28,
          'research',
          22,
          18,
        ],
        'fill-extrusion-base': 0,
        'fill-extrusion-opacity': 0.82,
      },
      layout: {
        visibility: 'none',
      },
    });

    map.addLayer({
      id: POI_LAYER,
      type: 'circle',
      source: POI_SOURCE,
      filter: ['all', ['!=', ['get', 'category'], 'benches'], ['!=', ['get', 'category'], 'waste_baskets']],
      paint: {
        'circle-radius': 6,
        'circle-stroke-width': 1.5,
        'circle-stroke-color': '#ffffff',
        'circle-color': categoryColorExpression('institute') as never,
      },
    });

    map.addLayer({
      id: POI_ICON_LAYER,
      type: 'symbol',
      source: POI_SOURCE,
      filter: ['==', ['get', 'id'], '__none__'],
      layout: {
        'text-field': categoryBadgeExpression() as never,
        'text-size': 11,
        'text-allow-overlap': false,
        'text-ignore-placement': false,
      },
      paint: {
        'text-color': '#111827',
        'text-halo-color': '#ffffff',
        'text-halo-width': 1.4,
      },
    });

    map.addLayer({
      id: BUILDINGS_ICON_LAYER,
      type: 'symbol',
      source: BUILDINGS_SOURCE,
      filter: ['==', ['get', 'id'], '__none__'],
      layout: {
        'text-field': categoryBadgeExpression() as never,
        'text-size': 12,
        'text-allow-overlap': false,
        'text-ignore-placement': false,
      },
      paint: {
        'text-color': '#111827',
        'text-halo-color': '#ffffff',
        'text-halo-width': 1.3,
      },
    });

    map.addLayer({
      id: TRANSIT_LABELS_LAYER,
      type: 'symbol',
      source: POI_SOURCE,
      filter: ['==', ['get', 'category'], 'transit'],
      layout: {
        'text-field': [
          'case',
          ['all', ['has', 'transitLines'], ['has', 'transitDirection']],
          [
            'concat',
            ['get', 'name'],
            ' (',
            ['get', 'transitLines'],
            ' -> ',
            ['get', 'transitDirection'],
            ')',
          ],
          ['has', 'transitLines'],
          ['concat', ['get', 'name'], ' (', ['get', 'transitLines'], ')'],
          ['has', 'transitDirection'],
          ['concat', ['get', 'name'], ' (', ['get', 'transitDirection'], ')'],
          ['get', 'name'],
        ],
        'text-size': 12,
        'text-offset': [0, 1.2],
        'text-anchor': 'top',
        'text-allow-overlap': false,
        'text-ignore-placement': false,
        'text-pitch-alignment': 'auto',
        'text-rotation-alignment': 'auto',
        visibility: 'none',
      },
      paint: {
        'text-color': '#111827',
        'text-halo-color': '#ffffff',
        'text-halo-width': 1.6,
      },
    });

    map.addSource(ROUTE_SOURCE, {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: [],
      },
    });

    map.addLayer({
      id: ROUTE_LAYER,
      type: 'line',
      source: ROUTE_SOURCE,
      paint: {
        'line-color': '#0ea5e9',
        'line-width': 6,
        'line-opacity': 0.9,
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
      },
    });
    map.addLayer({
      id: ROUTE_START_LAYER,
      type: 'circle',
      source: ROUTE_SOURCE,
      filter: ['==', ['get', 'kind'], 'start'],
      paint: {
        'circle-color': '#16a34a',
        'circle-radius': 6,
        'circle-stroke-width': 2,
        'circle-stroke-color': '#ffffff',
      },
    });
    map.addLayer({
      id: ROUTE_END_LAYER,
      type: 'circle',
      source: ROUTE_SOURCE,
      filter: ['==', ['get', 'kind'], 'end'],
      paint: {
        'circle-color': '#dc2626',
        'circle-radius': 6,
        'circle-stroke-width': 2,
        'circle-stroke-color': '#ffffff',
      },
    });

    // --- hover tooltip ---
    const tooltipEl = document.createElement('div');
    tooltipEl.className = 'maplibre-hover-tooltip';
    tooltipEl.style.display = 'none';
    map.getContainer().appendChild(tooltipEl);

    const showTooltip = (e: maplibregl.MapLayerMouseEvent): void => {
      const first = e.features?.[0] as CampusFeature | undefined;
      if (!first) return;
      const meta = getCategoryMeta(first.properties.category);
      tooltipEl.innerHTML = `${meta.icon} <strong>${first.properties.name}</strong>`;
      tooltipEl.style.display = 'block';
      map.getCanvas().style.cursor = 'pointer';
    };

    const moveTooltip = (e: maplibregl.MapMouseEvent): void => {
      const rect = map.getContainer().getBoundingClientRect();
      const x = e.originalEvent.clientX - rect.left;
      const y = e.originalEvent.clientY - rect.top;
      tooltipEl.style.left = `${x + 12}px`;
      tooltipEl.style.top = `${y - 10}px`;
    };

    const hideTooltip = (): void => {
      tooltipEl.style.display = 'none';
      map.getCanvas().style.cursor = '';
    };

    // --- click popup ---
    const openPopup = (e: maplibregl.MapLayerMouseEvent): void => {
      const first = e.features?.[0] as CampusFeature | undefined;
      if (!first) return;
      new maplibregl.Popup({ closeButton: true, closeOnClick: true })
        .setLngLat(e.lngLat)
        .setHTML(popupHtml(first, locale))
        .addTo(map);
    };

    for (const layer of [BUILDINGS_LAYER, BUILDINGS_ICON_LAYER, POI_LAYER, POI_ICON_LAYER]) {
      map.on('click', layer, openPopup);
      map.on('mouseenter', layer, showTooltip);
      map.on('mouseleave', layer, hideTooltip);
    }
    map.on('mousemove', BUILDINGS_LAYER, moveTooltip);
    map.on('mousemove', BUILDINGS_ICON_LAYER, moveTooltip);
    map.on('mousemove', POI_LAYER, moveTooltip);
    map.on('mousemove', POI_ICON_LAYER, moveTooltip);
  });
};

export const applyFeatureFilters = (
  map: Map,
  options: { searchText: string; categories: Set<string> },
): void => {
  const apply = (): void => {
    const filter = getFilter(options.searchText, options.categories);
    const enabledEmojiCategories = [...emojiEnabledCategories];
    const poiWithoutEmojiFilter =
      enabledEmojiCategories.length > 0
        ? (['all', filter, ['!', ['in', ['get', 'category'], ['literal', enabledEmojiCategories]]]] as never)
        : (filter as never);
    const poiEmojiFilter =
      enabledEmojiCategories.length > 0
        ? (['all', ['in', ['get', 'category'], ['literal', enabledEmojiCategories]], filter] as never)
        : (['==', ['get', 'id'], '__none__'] as never);

    if (map.getLayer(BUILDINGS_LAYER)) {
      map.setFilter(BUILDINGS_LAYER, filter as never);
      map.setFilter(BUILDINGS_OUTLINE_LAYER, filter as never);
      map.setFilter(BUILDINGS_EXTRUSION_LAYER, filter as never);
    }
    if (map.getLayer(POI_LAYER)) {
      map.setFilter(POI_LAYER, poiWithoutEmojiFilter);
    }
    if (map.getLayer(POI_ICON_LAYER)) {
      map.setFilter(POI_ICON_LAYER, poiEmojiFilter);
    }
    if (map.getLayer(BUILDINGS_ICON_LAYER)) {
      map.setFilter(
        BUILDINGS_ICON_LAYER,
        ['all', ['in', ['get', 'category'], ['literal', ['food', 'parking']]], filter] as never,
      );
    }
    if (map.getLayer(TRANSIT_LABELS_LAYER)) {
      map.setFilter(TRANSIT_LABELS_LAYER, ['all', ['==', ['get', 'category'], 'transit'], filter] as never);
    }
  };

  if (map.loaded()) {
    apply();
  } else {
    map.once('load', apply);
  }
};

export const focusFeature = (map: Map, feature: CampusFeature): void => {
  const geometry = feature.geometry;
  if (geometry.type === 'Point') {
    const [lng, lat] = geometry.coordinates;
    map.flyTo({ center: [lng, lat], zoom: 17.5, speed: 0.8 });
    return;
  }

  const bounds = new maplibregl.LngLatBounds();
  const coordinates =
    geometry.type === 'Polygon'
      ? geometry.coordinates.flat()
      : geometry.type === 'MultiPolygon'
        ? geometry.coordinates.flat(2)
        : [];

  coordinates.forEach(([lng, lat]) => bounds.extend([lng, lat]));
  if (!bounds.isEmpty()) {
    map.fitBounds(bounds, { padding: 80, maxZoom: 18 });
  }
};

export const clearWalkingRoute = (map: Map): void => {
  cancelRouteAnimation(map);
  const apply = (): void => {
    const source = map.getSource(ROUTE_SOURCE) as maplibregl.GeoJSONSource | undefined;
    if (!source) return;
    source.setData({
      type: 'FeatureCollection',
      features: [],
    });
  };
  if (map.loaded()) {
    apply();
  } else {
    map.once('load', apply);
  }
};

export const closeDetailPopups = (map: Map): void => {
  const container = map.getContainer();
  container.querySelectorAll('.maplibregl-popup').forEach((popup) => popup.remove());
};

export const setWalkingRoute = (
  map: Map,
  coordinates: [number, number][],
  animate: boolean,
): void => {
  cancelRouteAnimation(map);
  const apply = (): void => {
    const source = map.getSource(ROUTE_SOURCE) as maplibregl.GeoJSONSource | undefined;
    if (!source || coordinates.length < 2) return;
    source.setData({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { kind: 'line' },
          geometry: { type: 'LineString', coordinates },
        },
        {
          type: 'Feature',
          properties: { kind: 'start' },
          geometry: { type: 'Point', coordinates: coordinates[0] },
        },
        {
          type: 'Feature',
          properties: { kind: 'end' },
          geometry: { type: 'Point', coordinates: coordinates[coordinates.length - 1] },
        },
      ],
    } as never);

    if (!animate) return;
    const movingEl = document.createElement('div');
    movingEl.className = 'route-marker route-marker-moving';
    const movingMarker = new maplibregl.Marker({ element: movingEl })
      .setLngLat(coordinates[0])
      .addTo(map);
    movingMarkers.set(map, movingMarker);

    const durationMs = Math.min(20000, Math.max(5000, coordinates.length * 70));
    const startAt = performance.now();
    const tick = (now: number): void => {
      const progress = Math.min(1, (now - startAt) / durationMs);
      const exact = progress * (coordinates.length - 1);
      const fromIdx = Math.floor(exact);
      const toIdx = Math.min(coordinates.length - 1, fromIdx + 1);
      const t = exact - fromIdx;
      const from = coordinates[fromIdx];
      const to = coordinates[toIdx];
      const lng = from[0] + (to[0] - from[0]) * t;
      const lat = from[1] + (to[1] - from[1]) * t;
      movingMarker.setLngLat([lng, lat]);
      if (progress < 1) {
        routeAnimations.set(map, requestAnimationFrame(tick));
      } else {
        routeAnimations.delete(map);
      }
    };
    routeAnimations.set(map, requestAnimationFrame(tick));
  };

  if (map.loaded()) {
    apply();
  } else {
    map.once('load', apply);
  }
};

export const setTransitLabelsVisible = (map: Map, visible: boolean): void => {
  const apply = (): void => {
    if (!map.getLayer(TRANSIT_LABELS_LAYER)) {
      return;
    }
    map.setLayoutProperty(TRANSIT_LABELS_LAYER, 'visibility', visible ? 'visible' : 'none');
  };

  if (map.loaded()) {
    apply();
  } else {
    map.once('load', apply);
  }
};

export const setEmojiEnabledCategories = (map: Map, enabledCategories: Set<string>): void => {
  emojiEnabledCategories = new Set(enabledCategories);
  const apply = (): void => {
    const poiEnabled = [...emojiEnabledCategories];
    const buildingEnabled = BUILDING_EMOJI_CATEGORIES.filter((category) => enabledCategories.has(category));

    if (map.getLayer(BUILDINGS_ICON_LAYER)) {
      if (buildingEnabled.length === 0) {
        map.setFilter(BUILDINGS_ICON_LAYER, ['==', ['get', 'id'], '__none__'] as never);
      } else {
        map.setFilter(BUILDINGS_ICON_LAYER, ['in', ['get', 'category'], ['literal', buildingEnabled]] as never);
      }
    }

    if (map.getLayer(POI_ICON_LAYER)) {
      if (poiEnabled.length === 0) {
        map.setFilter(POI_ICON_LAYER, ['==', ['get', 'id'], '__none__'] as never);
      } else {
        map.setFilter(POI_ICON_LAYER, ['in', ['get', 'category'], ['literal', poiEnabled]] as never);
      }
    }
  };

  if (map.loaded()) {
    apply();
  } else {
    map.once('load', apply);
  }
};

export const setThreeDViewEnabled = (map: Map, enabled: boolean): void => {
  const apply = (): void => {
    if (map.getLayer(BUILDINGS_EXTRUSION_LAYER)) {
      map.setLayoutProperty(BUILDINGS_EXTRUSION_LAYER, 'visibility', enabled ? 'visible' : 'none');
    }
    if (map.getLayer(TRANSIT_LABELS_LAYER)) {
      map.setLayoutProperty(TRANSIT_LABELS_LAYER, 'text-allow-overlap', enabled);
      map.setLayoutProperty(TRANSIT_LABELS_LAYER, 'text-ignore-placement', enabled);
      map.setLayoutProperty(TRANSIT_LABELS_LAYER, 'text-pitch-alignment', enabled ? 'viewport' : 'auto');
      map.setLayoutProperty(TRANSIT_LABELS_LAYER, 'text-rotation-alignment', enabled ? 'viewport' : 'auto');
    }

    map.easeTo({
      pitch: enabled ? 58 : 0,
      bearing: enabled ? -20 : 0,
      duration: 550,
      essential: true,
    });
  };

  if (map.loaded()) {
    apply();
  } else {
    map.once('load', apply);
  }
};
