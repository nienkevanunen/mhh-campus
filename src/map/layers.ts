import maplibregl, { type Map } from 'maplibre-gl';
import { CATEGORY_META, getCategoryMeta } from '../config/categories';
import type { Locale } from '../i18n';
import type { CampusFeature, CampusFeatureCollection } from '../types/campus';
import { deriveTransitRouteLines } from './transitRoutes';
import { MAPLIBRE_MIN_ZOOM, MHH_CENTER } from './initMap';

const BUILDINGS_SOURCE = 'campus-buildings';
const POI_SOURCE = 'campus-poi';
const BUILDINGS_LAYER = 'campus-buildings-fill';
const BUILDINGS_OUTLINE_LAYER = 'campus-buildings-outline';
const BUILDING_CODE_LABELS_LAYER = 'campus-buildings-code-labels';
const BUILDING_LABELS_LAYER = 'campus-buildings-labels';
const BUILDINGS_EXTRUSION_LAYER = 'campus-buildings-extrusion';
const BUILDINGS_ICON_LAYER = 'campus-buildings-icons';
const POI_LAYER = 'campus-poi-points';
const POI_ICON_LAYER = 'campus-poi-icons';
const POI_LABELS_LAYER = 'campus-poi-labels';
const TRANSIT_LABELS_LAYER = 'campus-transit-labels';
const TRANSIT_ROUTES_SOURCE = 'campus-transit-routes';
const TRANSIT_ROUTES_LAYER = 'campus-transit-routes-line';
const ROUTE_SOURCE = 'campus-walk-route';
const ROUTE_LAYER = 'campus-walk-route-line';
const ROUTE_START_LAYER = 'campus-walk-route-start';
const ROUTE_END_LAYER = 'campus-walk-route-end';
const CAMPUS_BOUNDARY_SOURCE = 'campus-boundary';
const CAMPUS_BOUNDARY_FILL_LAYER = 'campus-boundary-fill';
const CAMPUS_BOUNDARY_LINE_LAYER = 'campus-boundary-line';
const BUILDING_EMOJI_CATEGORIES = ['food', 'parking'];
let emojiEnabledCategories = new Set<string>();
let labelEnabledCategories = new Set<string>();
let lastFeatureFilterState: { searchText: string; categories: Set<string> } | null = null;
const movingMarkers = new WeakMap<Map, maplibregl.Marker>();
const routeAnimations = new WeakMap<Map, number>();
const CATEGORY_EMOJI_ICON_ID_PREFIX = 'category-emoji-icon';
const OFFICIAL_MAP_BEARING = -113;

const categoryColorExpression = (fallbackCategory = 'institute'): unknown[] => {
  const expression: unknown[] = ['match', ['get', 'category']];
  Object.entries(CATEGORY_META).forEach(([category, meta]) => {
    expression.push(category, meta.color);
  });
  expression.push(getCategoryMeta(fallbackCategory).color);
  return expression;
};

const categoryEmojiIconId = (category: string): string => `${CATEGORY_EMOJI_ICON_ID_PREFIX}-${category}`;

const categoryEmojiIconImageExpression = (fallbackCategory = 'institute'): unknown[] => {
  const expression: unknown[] = ['match', ['get', 'category']];
  Object.keys(CATEGORY_META).forEach((category) => {
    expression.push(category, categoryEmojiIconId(category));
  });
  expression.push(categoryEmojiIconId(fallbackCategory));
  return expression;
};

const emojiToTwemojiCodepoint = (emoji: string): string =>
  Array.from(emoji)
    .map((part) => part.codePointAt(0)?.toString(16))
    .filter((codepoint): codepoint is string => Boolean(codepoint) && codepoint !== 'fe0f')
    .join('-');

const twemojiUrlFor = (emoji: string): string =>
  `https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/${emojiToTwemojiCodepoint(emoji)}.png`;

const loadMapImage = async (map: Map, url: string): Promise<HTMLImageElement | ImageBitmap> => {
  const response = await map.loadImage(url);
  return response.data;
};

const ensureCategoryEmojiIcons = async (map: Map): Promise<void> => {
  for (const [category, meta] of Object.entries(CATEGORY_META)) {
    const imageId = categoryEmojiIconId(category);
    if (map.hasImage(imageId)) {
      continue;
    }
    try {
      const iconImage = await loadMapImage(map, twemojiUrlFor(meta.icon));
      map.addImage(imageId, iconImage, { pixelRatio: 2 });
    } catch {
      // Keep map usable if one icon cannot be fetched.
    }
  }
};

const genericBuildingNameGuardFilter = (): unknown[] => [
  'all',
  ['!', ['>=', ['index-of', 'building', ['downcase', ['coalesce', ['get', 'name'], '']]], 0]],
  ['!', ['>=', ['index-of', 'gebaeude', ['downcase', ['coalesce', ['get', 'name'], '']]], 0]],
];

const CAMPUS_POLYGON_RING: [number, number][] = [
  [9.7958, 52.3899],
  [9.8069, 52.3899],
  [9.8083, 52.3877],
  [9.8089, 52.3847],
  [9.8089, 52.3818],
  [9.8086, 52.3793],
  [9.8081, 52.3776],
  [9.8073, 52.376],
  [9.8052, 52.3749],
  [9.801, 52.3746],
  [9.7973, 52.3749],
  [9.7962, 52.3762],
  [9.7958, 52.3784],
  [9.7957, 52.3818],
  [9.7957, 52.3855],
  [9.7958, 52.3899],
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
      ['>=', ['index-of', term, ['downcase', ['coalesce', ['get', 'shortLabel'], '']]], 0],
      ['>=', ['index-of', term, ['downcase', ['coalesce', ['get', 'address'], '']]], 0],
      ['>=', ['index-of', term, ['downcase', ['coalesce', ['get', 'id'], '']]], 0],
    ]);

    allFilters.push(['all', ...termFilters]);
  }

  return allFilters.length === 1 ? allFilters[0] : ['all', ...allFilters];
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

const featureDisplayName = (feature: CampusFeature): string => {
  const p = feature.properties;
  if (p.shortLabel && !p.name.toUpperCase().startsWith(`${p.shortLabel.toUpperCase()} -`) && p.name !== p.shortLabel) {
    return `${p.shortLabel} - ${p.name}`;
  }
  return p.name;
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

const extractBuildingCode = (feature: CampusFeature): string | null => {
  if (feature.properties.shortLabel) {
    return feature.properties.shortLabel.toUpperCase();
  }
  const haystacks = [
    feature.properties.name ?? '',
    feature.properties.id ?? '',
    feature.properties.address ?? '',
  ];
  for (const text of haystacks) {
    const match = text.match(/\b([A-Z])[\s-]?(\d{1,2}[A-Z]?)\b/);
    if (!match) continue;
    return `${match[1]}${match[2]}`.toUpperCase();
  }
  return null;
};

export const addCampusLayers = (
  map: Map,
  poiData: CampusFeatureCollection,
  buildingData: CampusFeatureCollection,
  locale: Locale,
): void => {
  map.on('load', async () => {
    await ensureCategoryEmojiIcons(map);
    const buildingsWithCodes: CampusFeatureCollection = {
      ...buildingData,
      features: buildingData.features.map((feature) => ({
        ...feature,
        properties: {
          ...feature.properties,
          shortLabel: extractBuildingCode(feature) ?? '',
        },
      })),
    };
    map.addSource(BUILDINGS_SOURCE, { type: 'geojson', data: buildingsWithCodes });
    map.addSource(POI_SOURCE, { type: 'geojson', data: poiData });
    map.addSource(TRANSIT_ROUTES_SOURCE, {
      type: 'geojson',
      data: deriveTransitRouteLines(poiData),
    });

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
      id: BUILDING_CODE_LABELS_LAYER,
      type: 'symbol',
      source: BUILDINGS_SOURCE,
      filter: ['!=', ['coalesce', ['get', 'shortLabel'], ''], ''] as never,
      layout: {
        'text-field': ['coalesce', ['get', 'shortLabel'], ''] as never,
        'text-size': ['interpolate', ['linear'], ['zoom'], 12, 11, 14, 13] as never,
        'text-font': ['Noto Sans Bold'] as never,
        'text-allow-overlap': true,
        'text-ignore-placement': true,
        visibility: 'visible',
      },
      paint: {
        'text-color': '#0f172a',
        'text-halo-color': '#ffffff',
        'text-halo-width': 1.4,
      },
      minzoom: 12,
      maxzoom: 16,
    });

    map.addLayer({
      id: BUILDING_LABELS_LAYER,
      type: 'symbol',
      source: BUILDINGS_SOURCE,
      layout: {
        'text-field': ['coalesce', ['get', 'name'], ''] as never,
        'text-size': ['interpolate', ['linear'], ['zoom'], 14, 10, 17, 13] as never,
        'text-font': ['Noto Sans Regular'] as never,
        'text-offset': [0, 0],
        'text-allow-overlap': false,
        'text-ignore-placement': false,
        'symbol-placement': 'point',
        visibility: 'visible',
      },
      paint: {
        'text-color': '#0f172a',
        'text-halo-color': '#ffffff',
        'text-halo-width': 1.25,
      },
      minzoom: 15.8,
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
        'icon-image': categoryEmojiIconImageExpression('institute') as never,
        'icon-size': 0.28,
        'icon-allow-overlap': false,
        'icon-ignore-placement': false,
      },
    });

    map.addLayer({
      id: POI_LABELS_LAYER,
      type: 'symbol',
      source: POI_SOURCE,
      filter: ['==', ['get', 'id'], '__none__'],
      layout: {
        'text-field': ['coalesce', ['get', 'name'], ''] as never,
        'text-size': ['interpolate', ['linear'], ['zoom'], 14, 10, 17, 12] as never,
        'text-offset': [0, 1.1],
        'text-anchor': 'top',
        'text-allow-overlap': false,
        'text-ignore-placement': false,
      },
      paint: {
        'text-color': '#111827',
        'text-halo-color': '#ffffff',
        'text-halo-width': 1.2,
      },
      minzoom: 14,
    });

    map.addLayer({
      id: BUILDINGS_ICON_LAYER,
      type: 'symbol',
      source: BUILDINGS_SOURCE,
      filter: ['==', ['get', 'id'], '__none__'],
      layout: {
        'icon-image': categoryEmojiIconImageExpression('institute') as never,
        'icon-size': 0.32,
        'icon-allow-overlap': false,
        'icon-ignore-placement': false,
      },
    });

    map.addLayer({
      id: TRANSIT_ROUTES_LAYER,
      type: 'line',
      source: TRANSIT_ROUTES_SOURCE,
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
        visibility: 'none',
      },
      paint: {
        'line-color': ['coalesce', ['get', 'color'], '#0ea5e9'] as never,
        'line-width': ['interpolate', ['linear'], ['zoom'], 12, 2, 16, 5] as never,
        'line-opacity': 0.85,
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

    map.addSource(CAMPUS_BOUNDARY_SOURCE, {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'Polygon',
              coordinates: [CAMPUS_POLYGON_RING],
            },
          },
        ],
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

    map.addLayer({
      id: CAMPUS_BOUNDARY_FILL_LAYER,
      type: 'fill',
      source: CAMPUS_BOUNDARY_SOURCE,
      paint: {
        'fill-color': '#f43f5e',
        'fill-opacity': 0.03,
      },
    });
    map.addLayer({
      id: CAMPUS_BOUNDARY_LINE_LAYER,
      type: 'line',
      source: CAMPUS_BOUNDARY_SOURCE,
      paint: {
        'line-color': '#f43f5e',
        'line-width': 5,
        'line-opacity': 0.95,
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
      tooltipEl.innerHTML = `${meta.icon} <strong>${featureDisplayName(first)}</strong>`;
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
  lastFeatureFilterState = {
    searchText: options.searchText,
    categories: new Set(options.categories),
  };
  const apply = (): void => {
    const hasCoreLayers = Boolean(map.getLayer(BUILDINGS_LAYER) || map.getLayer(POI_LAYER));
    if (!hasCoreLayers) {
      map.once('idle', apply);
      return;
    }
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
      map.setFilter(BUILDING_CODE_LABELS_LAYER, filter as never);
      map.setFilter(
        BUILDING_LABELS_LAYER,
        ['all', filter, genericBuildingNameGuardFilter()] as never,
      );
      map.setFilter(BUILDINGS_EXTRUSION_LAYER, filter as never);
    }
    if (map.getLayer(POI_LAYER)) {
      map.setFilter(POI_LAYER, poiWithoutEmojiFilter);
    }
    if (map.getLayer(POI_ICON_LAYER)) {
      map.setFilter(POI_ICON_LAYER, poiEmojiFilter);
    }
    if (map.getLayer(BUILDINGS_ICON_LAYER)) {
      const buildingEmojiEnabled = BUILDING_EMOJI_CATEGORIES.filter((category) =>
        enabledEmojiCategories.includes(category),
      );
      map.setFilter(
        BUILDINGS_ICON_LAYER,
        buildingEmojiEnabled.length > 0
          ? (['all', ['in', ['get', 'category'], ['literal', buildingEmojiEnabled]], filter] as never)
          : (['==', ['get', 'id'], '__none__'] as never),
      );
    }
    const labelEnabled = [...labelEnabledCategories];
    const labelsFilter =
      labelEnabled.length > 0
        ? (['all', filter, ['in', ['get', 'category'], ['literal', labelEnabled]]] as never)
        : (['==', ['get', 'id'], '__none__'] as never);
    if (map.getLayer(BUILDING_LABELS_LAYER)) {
      map.setFilter(
        BUILDING_LABELS_LAYER,
        [
          'all',
          labelsFilter,
          genericBuildingNameGuardFilter(),
        ] as never,
      );
    }
    if (map.getLayer(BUILDING_CODE_LABELS_LAYER)) {
      map.setFilter(
        BUILDING_CODE_LABELS_LAYER,
        ['all', labelsFilter, ['!=', ['coalesce', ['get', 'shortLabel'], ''], '']] as never,
      );
    }
    if (map.getLayer(POI_LABELS_LAYER)) {
      map.setFilter(POI_LABELS_LAYER, labelsFilter);
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
    if (map.getLayer(TRANSIT_ROUTES_LAYER)) {
      map.setLayoutProperty(TRANSIT_ROUTES_LAYER, 'visibility', visible ? 'visible' : 'none');
    }
  };

  if (map.loaded()) {
    apply();
  } else {
    map.once('load', apply);
  }
};

export const setEmojiEnabledCategories = (map: Map, enabledCategories: Set<string>): void => {
  emojiEnabledCategories = new Set(enabledCategories);
  if (lastFeatureFilterState) {
    applyFeatureFilters(map, lastFeatureFilterState);
    return;
  }
  // Fallback if called before first filter sync.
  const apply = (): void => {
    if (map.getLayer(POI_ICON_LAYER)) {
      map.setFilter(POI_ICON_LAYER, ['==', ['get', 'id'], '__none__'] as never);
    }
    if (map.getLayer(BUILDINGS_ICON_LAYER)) {
      map.setFilter(BUILDINGS_ICON_LAYER, ['==', ['get', 'id'], '__none__'] as never);
    }
  };
  if (map.loaded()) {
    apply();
  } else {
    map.once('load', apply);
  }
};

export const setLabelEnabledCategories = (map: Map, enabledCategories: Set<string>): void => {
  labelEnabledCategories = new Set(enabledCategories);
  const apply = (): void => {
    const labels = [...labelEnabledCategories];
    const filter =
      labels.length > 0
        ? (['in', ['get', 'category'], ['literal', labels]] as never)
        : (['==', ['get', 'id'], '__none__'] as never);
    if (map.getLayer(BUILDING_LABELS_LAYER)) {
      map.setFilter(
        BUILDING_LABELS_LAYER,
        ['all', filter, genericBuildingNameGuardFilter()] as never,
      );
    }
    if (map.getLayer(BUILDING_CODE_LABELS_LAYER)) {
      map.setFilter(
        BUILDING_CODE_LABELS_LAYER,
        ['all', filter, ['!=', ['coalesce', ['get', 'shortLabel'], ''], '']] as never,
      );
    }
    if (map.getLayer(POI_LABELS_LAYER)) {
      map.setFilter(POI_LABELS_LAYER, filter);
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

export const resetMapView = (map: Map): void => {
  const apply = (): void => {
    map.stop();
    map.jumpTo({
      center: MHH_CENTER,
      zoom: MAPLIBRE_MIN_ZOOM,
      bearing: 0,
      pitch: 0,
    });
  };
  if (map.loaded()) {
    apply();
  } else {
    map.once('load', apply);
  }
};

export const alignToReferenceOrientation = (map: Map): void => {
  const apply = (): void => {
    map.stop();
    map.easeTo({
      center: MHH_CENTER,
      zoom: MAPLIBRE_MIN_ZOOM + 0.8,
      bearing: OFFICIAL_MAP_BEARING,
      pitch: 0,
      duration: 650,
      essential: true,
    });
  };
  if (map.loaded()) {
    apply();
  } else {
    map.once('load', apply);
  }
};
