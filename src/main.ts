import 'maplibre-gl/dist/maplibre-gl.css';
import './style.css';
import { renderAppShell, type RendererMode } from './app/ui';
import { getWeatherUnit, renderWeather, WEATHER_UNIT_STORAGE_KEY, type TemperatureUnit } from './app/weather';
import { hasWebGlSupport, initMap } from './map/initMap';
import {
  addCampusLayers,
  applyFeatureFilters,
  closeDetailPopups,
  clearWalkingRoute,
  focusFeature,
  setEmojiEnabledCategories,
  setWalkingRoute,
  setThreeDViewEnabled,
  setTransitLabelsVisible,
} from './map/layers';
import { initLeafletFallbackMap } from './map/leafletFallback';
import { fetchRouteWithMode, type RouteMode, type TransitCandidate } from './map/routing';
import { getLocale, setLocalePreference } from './i18n';
import type { CampusFeature, CampusFeatureCollection } from './types/campus';
import { setupCategoryFilters } from './ui/filters';
import { setupSearch } from './ui/search';

const RENDERER_STORAGE_KEY = 'mhh-renderer-mode';
const A11Y_PREFS_STORAGE_KEY = 'mhh-a11y-prefs';
const locale = getLocale();

type A11yPrefs = {
  dyslexicFont: boolean;
  highContrast: boolean;
  largerText: boolean;
  reduceMotion: boolean;
  screenReaderMode: boolean;
  minimizeGpu: boolean;
};

const defaultA11yPrefs: A11yPrefs = {
  dyslexicFont: false,
  highContrast: false,
  largerText: false,
  reduceMotion: false,
  screenReaderMode: false,
  minimizeGpu: false,
};

const getA11yPrefs = (): A11yPrefs => {
  const raw = localStorage.getItem(A11Y_PREFS_STORAGE_KEY);
  if (!raw) return { ...defaultA11yPrefs };
  try {
    return { ...defaultA11yPrefs, ...(JSON.parse(raw) as Partial<A11yPrefs>) };
  } catch {
    return { ...defaultA11yPrefs };
  }
};

const persistA11yPrefs = (prefs: A11yPrefs): void => {
  localStorage.setItem(A11Y_PREFS_STORAGE_KEY, JSON.stringify(prefs));
};

const getRendererMode = (): RendererMode => {
  const stored = localStorage.getItem(RENDERER_STORAGE_KEY);
  if (stored === 'maplibre' || stored === 'leaflet' || stored === 'auto') return stored;
  return 'auto';
};

const loadCampusData = async (): Promise<{
  poiData: CampusFeatureCollection;
  buildingData: CampusFeatureCollection;
}> => {
  const baseUrl = import.meta.env.BASE_URL;
  const [poiRes, buildingsRes] = await Promise.all([
    fetch(`${baseUrl}data/mhh-poi.geojson`),
    fetch(`${baseUrl}data/mhh-buildings.geojson`),
  ]);
  if (!poiRes.ok || !buildingsRes.ok) throw new Error('Failed to load campus data files.');
  return {
    poiData: (await poiRes.json()) as CampusFeatureCollection,
    buildingData: (await buildingsRes.json()) as CampusFeatureCollection,
  };
};

const renderFallbackNotice = (reason: string): void => {
  const sidebar = document.querySelector<HTMLDivElement>('.sidebar');
  if (!sidebar) return;
  const existing = document.querySelector<HTMLElement>('#runtimeNotice');
  if (existing) existing.remove();
  const notice = document.createElement('section');
  notice.id = 'runtimeNotice';
  notice.className = 'fallback';
  notice.innerHTML = `
    <h2>${locale === 'de' ? 'Fallback-Modus aktiv' : 'Fallback mode active'}</h2>
    <p>${reason}</p>
    <p>${
      locale === 'de'
        ? 'Leaflet-Rasterkacheln werden statt MapLibre-WebGL verwendet.'
        : 'Running with Leaflet raster tiles instead of MapLibre WebGL.'
    }</p>
  `;
  sidebar.appendChild(notice);
};

const featureMatches = (feature: CampusFeature, categories: Set<string>, query: string): boolean => {
  if (!categories.has(feature.properties.category)) return false;
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  const haystack =
    `${feature.properties.name} ${feature.properties.category} ${feature.properties.address} ${feature.properties.id}`.toLowerCase();
  return normalized.split(/\s+/).every((term) => haystack.includes(term));
};

const featureCoordinates = (feature: CampusFeature): [number, number] | null => {
  const geometry = feature.geometry;
  if (geometry.type === 'Point') {
    return [geometry.coordinates[1], geometry.coordinates[0]];
  }
  const coordinates =
    geometry.type === 'Polygon'
      ? geometry.coordinates.flat()
      : geometry.type === 'MultiPolygon'
        ? geometry.coordinates.flat(2)
        : [];
  if (coordinates.length === 0) return null;
  const sums = coordinates.reduce(
    (acc, [lng, lat]) => [acc[0] + lat, acc[1] + lng],
    [0, 0],
  );
  return [sums[0] / coordinates.length, sums[1] / coordinates.length];
};

const sqDistance = (a: [number, number], b: [number, number]): number => {
  const dLat = a[0] - b[0];
  const dLng = a[1] - b[1];
  return dLat * dLat + dLng * dLng;
};

const start = async (): Promise<void> => {
  document.documentElement.lang = locale;
  const ui = renderAppShell(locale);

  ui.localeSelect.addEventListener('change', () => {
    setLocalePreference(ui.localeSelect.value === 'en' ? 'en' : 'de');
    window.location.reload();
  });

  const mode = getRendererMode();
  ui.rendererModeSelect.value = mode;
  ui.rendererModeSelect.addEventListener('change', () => {
    localStorage.setItem(RENDERER_STORAGE_KEY, ui.rendererModeSelect.value);
    window.location.reload();
  });

  const weatherUnit = getWeatherUnit();
  ui.weatherUnitSelect.value = weatherUnit;
  ui.weatherUnitSelect.addEventListener('change', () => {
    const nextUnit: TemperatureUnit = ui.weatherUnitSelect.value === 'fahrenheit' ? 'fahrenheit' : 'celsius';
    localStorage.setItem(WEATHER_UNIT_STORAGE_KEY, nextUnit);
    void renderWeather(ui.weatherCard, locale, nextUnit);
  });
  await renderWeather(ui.weatherCard, locale, weatherUnit);

  const { poiData, buildingData } = await loadCampusData();
  const features = [...poiData.features, ...buildingData.features];
  const categories = [...new Set(features.map((f) => f.properties.category))].sort();
  const defaultHiddenCategories = new Set(['benches', 'waste_baskets', 'shelter']);
  const defaultEmojiDisabledCategories = new Set<string>(categories);

  const getDefaultActiveCategories = (): Set<string> =>
    new Set(categories.filter((c) => !defaultHiddenCategories.has(c)));
  const getDefaultEmojiEnabledCategories = (): Set<string> =>
    new Set(categories.filter((c) => !defaultEmojiDisabledCategories.has(c)));

  let activeCategories = getDefaultActiveCategories();
  let emojiEnabledCategories = getDefaultEmojiEnabledCategories();
  let currentSearch = '';
  let transitLabelsVisible = false;
  let threeDEnabled = false;
  let a11yPrefs = getA11yPrefs();

  const canUseWebGl = hasWebGlSupport();
  const useLeaflet = mode === 'leaflet' || (mode === 'auto' && !canUseWebGl);
  const forceMapLibreWithoutWebgl = mode === 'maplibre' && !canUseWebGl;
  if (forceMapLibreWithoutWebgl) {
    renderFallbackNotice(
      locale === 'de'
        ? 'MapLibre wurde gewaehlt, aber WebGL ist nicht verfuegbar. Auf Leaflet oder Auto umstellen.'
        : 'MapLibre was selected, but WebGL is unavailable. Switch renderer to Leaflet or Auto.',
    );
    return;
  }

  const mapController = !useLeaflet
    ? (() => {
        const map = initMap('map');
        addCampusLayers(map, poiData, buildingData, locale);
        return {
          applyFilters: (searchText: string, categoriesArg: Set<string>) =>
            applyFeatureFilters(map, { searchText, categories: categoriesArg }),
          focus: (feature: (typeof features)[number]) => focusFeature(map, feature),
          setTransitLabelsVisible: (visible: boolean) => setTransitLabelsVisible(map, visible),
          setThreeDEnabled: (enabled: boolean) => setThreeDViewEnabled(map, enabled),
          setEmojiEnabledCategories: (enabled: Set<string>) => setEmojiEnabledCategories(map, enabled),
          setWalkingRoute: (coordinates: [number, number][], animate: boolean) => setWalkingRoute(map, coordinates, animate),
          clearWalkingRoute: () => clearWalkingRoute(map),
          closeDetailPopups: () => closeDetailPopups(map),
          pickPointOnce: (onPick: (coords: [number, number]) => void) => {
            map.once('click', (event) => {
              onPick([event.lngLat.lat, event.lngLat.lng]);
            });
          },
        };
      })()
    : (() => {
        renderFallbackNotice(
          mode === 'leaflet'
            ? locale === 'de'
              ? 'Leaflet-Engine ausgewaehlt.'
              : 'Leaflet renderer selected.'
            : locale === 'de'
              ? 'WebGL ist nicht verfuegbar, daher ist Leaflet-Fallback aktiv.'
              : 'WebGL is unavailable, so Leaflet fallback mode is active.',
        );
        const leafletMap = initLeafletFallbackMap('map', poiData, buildingData, locale);
        return {
          applyFilters: (searchText: string, categoriesArg: Set<string>) =>
            leafletMap.applyFilters({ searchText, categories: categoriesArg }),
          focus: (feature: (typeof features)[number]) => leafletMap.focusFeature(feature),
          setTransitLabelsVisible: (visible: boolean) => leafletMap.setTransitLabelsVisible(visible),
          setThreeDEnabled: (enabled: boolean) => leafletMap.setThreeDEnabled(enabled),
          setEmojiEnabledCategories: (enabled: Set<string>) => leafletMap.setEmojiEnabledCategories(enabled),
          setWalkingRoute: (coordinates: [number, number][], animate: boolean) => leafletMap.setWalkingRoute(coordinates, animate),
          clearWalkingRoute: () => leafletMap.clearWalkingRoute(),
          closeDetailPopups: () => leafletMap.closeDetailPopups(),
          pickPointOnce: (onPick: (coords: [number, number]) => void) => leafletMap.pickPointOnce(onPick),
        };
      })();

  const syncFilters = (): void => mapController.applyFilters(currentSearch, activeCategories);

  const applyA11yClasses = (): void => {
    const root = document.documentElement;
    root.classList.toggle('a11y-dyslexic', a11yPrefs.dyslexicFont);
    root.classList.toggle('a11y-contrast', a11yPrefs.highContrast);
    root.classList.toggle('a11y-large-text', a11yPrefs.largerText);
    root.classList.toggle('a11y-reduce-motion', a11yPrefs.reduceMotion);
    root.classList.toggle('a11y-min-gpu', a11yPrefs.minimizeGpu);
    root.classList.toggle('a11y-screen-reader', a11yPrefs.screenReaderMode);
  };

  const renderScreenReaderPanel = (): void => {
    const panel = ui.screenReaderPanel;
    if (!a11yPrefs.screenReaderMode) {
      panel.innerHTML = '';
      return;
    }
    const rows = features
      .filter((f) => featureMatches(f, activeCategories, currentSearch))
      .slice(0, 150)
      .map((f) => {
        const coords = featureCoordinates(f);
        const directions = coords
          ? `https://www.google.com/maps/dir/?api=1&destination=${coords[0]},${coords[1]}&travelmode=walking`
          : null;
        return `
          <article class="sr-item">
            <h3>${f.properties.name}</h3>
            <p><strong>${locale === 'de' ? 'Kategorie' : 'Category'}:</strong> ${f.properties.category}</p>
            <p><strong>${locale === 'de' ? 'Adresse' : 'Address'}:</strong> ${f.properties.address}</p>
            ${f.properties.transitLines ? `<p><strong>${locale === 'de' ? 'Linien' : 'Lines'}:</strong> ${f.properties.transitLines}</p>` : ''}
            ${f.properties.transitDirection ? `<p><strong>${locale === 'de' ? 'Richtung' : 'Direction'}:</strong> ${f.properties.transitDirection}</p>` : ''}
            ${f.properties.openingHours ? `<p><strong>${locale === 'de' ? 'Oeffnungszeiten' : 'Opening hours'}:</strong> ${f.properties.openingHours}</p>` : ''}
            <p class="sr-links">
              ${directions ? `<a href="${directions}" target="_blank" rel="noreferrer">${locale === 'de' ? 'Zu Fuss navigieren' : 'Walking directions'}</a>` : ''}
              <a href="${f.properties.source}" target="_blank" rel="noreferrer">${locale === 'de' ? 'Quelle' : 'Source'}</a>
            </p>
          </article>
        `;
      })
      .join('');

    panel.innerHTML = `
      <h2>${locale === 'de' ? 'Textbasierte Campus-Navigation' : 'Text-based Campus Navigation'}</h2>
      <p>${locale === 'de' ? 'Such-/Filterergebnisse mit Wegen und Nahverkehrsinformationen.' : 'Search/filter results with directions and transit context.'}</p>
      ${rows || `<p>${locale === 'de' ? 'Keine Treffer.' : 'No results.'}</p>`}
    `;
  };

  const renderCategoryFilterRows = (): void => {
    setupCategoryFilters(
      ui.categoryFilters,
      categories,
      new Set(categories.filter((c) => !activeCategories.has(c))),
      new Set(categories.filter((c) => !emojiEnabledCategories.has(c))),
      locale,
      (nextVisible) => {
        activeCategories = nextVisible;
        syncFilters();
        renderScreenReaderPanel();
      },
      (nextEmojiEnabled) => {
        emojiEnabledCategories = nextEmojiEnabled;
        mapController.setEmojiEnabledCategories(emojiEnabledCategories);
      },
    );
  };
  renderCategoryFilterRows();

  const directionCandidates = features
    .map((feature) => ({
      feature,
      label: `${feature.properties.name} (${feature.properties.category})`,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, locale));
  const labelToFeature = new Map<string, CampusFeature>();
  directionCandidates.forEach((item) => {
    labelToFeature.set(item.label, item.feature);
  });
  const transitStops: TransitCandidate[] = features
    .filter((feature) => feature.properties.category === 'transit')
    .reduce<TransitCandidate[]>((acc, feature) => {
      const coords = featureCoordinates(feature);
      if (!coords) return acc;
      acc.push({
        name: feature.properties.name,
        coordinates: [coords[1], coords[0]],
        lines: feature.properties.transitLines,
      });
      return acc;
    }, []);

  let directionStartFeature: CampusFeature | null = null;
  let directionEndFeature: CampusFeature | null = null;

  const syncDirectionInputFromFeature = (which: 'start' | 'end', feature: CampusFeature): void => {
    const label = `${feature.properties.name} (${feature.properties.category})`;
    if (which === 'start') {
      directionStartFeature = feature;
      ui.directionsStart.value = label;
      return;
    }
    directionEndFeature = feature;
    ui.directionsEnd.value = label;
  };

  const resolveFeatureFromInput = (value: string): CampusFeature | null => {
    const exact = labelToFeature.get(value.trim());
    if (exact) return exact;
    const normalized = value.trim().toLowerCase();
    if (!normalized) return null;
    const byName = directionCandidates.find((item) => item.feature.properties.name.toLowerCase() === normalized);
    if (byName) return byName.feature;
    const partial = directionCandidates.find((item) => item.feature.properties.name.toLowerCase().includes(normalized));
    return partial?.feature ?? null;
  };

  const getDirectionMatches = (value: string): CampusFeature[] => {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return [];
    return directionCandidates
      .filter((item) => {
        const name = item.feature.properties.name.toLowerCase();
        const category = item.feature.properties.category.toLowerCase();
        return name.includes(normalized) || `${name} ${category}`.includes(normalized);
      })
      .slice(0, 6)
      .map((item) => item.feature);
  };

  const renderDirectionMatches = (which: 'start' | 'end', inputValue: string): void => {
    const container = which === 'start' ? ui.directionsStartMatches : ui.directionsEndMatches;
    const matches = getDirectionMatches(inputValue);
    if (matches.length === 0) {
      container.innerHTML = '';
      return;
    }
    container.innerHTML = '';
    matches.forEach((feature) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'direction-match-item';
      button.textContent = `${feature.properties.name} (${feature.properties.category})`;
      button.addEventListener('click', () => {
        syncDirectionInputFromFeature(which, feature);
        container.innerHTML = '';
        mapController.focus(feature);
      });
      container.appendChild(button);
    });
  };

  const nearestFeatureTo = (coords: [number, number]): CampusFeature | null => {
    let bestFeature: CampusFeature | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const feature of features) {
      const center = featureCoordinates(feature);
      if (!center) continue;
      const distance = sqDistance(center, coords);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestFeature = feature;
      }
    }
    return bestFeature;
  };

  const beginMapPick = (which: 'start' | 'end'): void => {
    mapController.closeDetailPopups();
    ui.directionsStatus.textContent =
      locale === 'de'
        ? which === 'start'
          ? 'Klicke auf die Karte, um den Startpunkt zu setzen.'
          : 'Klicke auf die Karte, um das Ziel zu setzen.'
        : which === 'start'
          ? 'Click on the map to set the starting point.'
          : 'Click on the map to set the destination.';
    mapController.pickPointOnce((coords) => {
      const pickedFeature = nearestFeatureTo(coords);
      if (!pickedFeature) {
        ui.directionsStatus.textContent = locale === 'de' ? 'Kein Punkt gefunden.' : 'No nearby point found.';
        return;
      }
      syncDirectionInputFromFeature(which, pickedFeature);
      ui.directionsStatus.textContent =
        locale === 'de'
          ? `${which === 'start' ? 'Start' : 'Ziel'} gesetzt: ${pickedFeature.properties.name}`
          : `${which === 'start' ? 'Start' : 'Destination'} set: ${pickedFeature.properties.name}`;
    });
  };

  ui.directionsStart.addEventListener('input', () => {
    directionStartFeature = resolveFeatureFromInput(ui.directionsStart.value);
    renderDirectionMatches('start', ui.directionsStart.value);
  });
  ui.directionsEnd.addEventListener('input', () => {
    directionEndFeature = resolveFeatureFromInput(ui.directionsEnd.value);
    renderDirectionMatches('end', ui.directionsEnd.value);
  });
  ui.directionsStart.addEventListener('blur', () => {
    setTimeout(() => {
      ui.directionsStartMatches.innerHTML = '';
    }, 100);
  });
  ui.directionsEnd.addEventListener('blur', () => {
    setTimeout(() => {
      ui.directionsEndMatches.innerHTML = '';
    }, 100);
  });
  ui.directionsStartPickBtn.addEventListener('click', () => beginMapPick('start'));
  ui.directionsEndPickBtn.addEventListener('click', () => beginMapPick('end'));

  ui.directionsGoBtn.addEventListener('click', async () => {
    mapController.closeDetailPopups();
    directionStartFeature = resolveFeatureFromInput(ui.directionsStart.value) ?? directionStartFeature;
    directionEndFeature = resolveFeatureFromInput(ui.directionsEnd.value) ?? directionEndFeature;
    if (!directionStartFeature || !directionEndFeature) {
      ui.directionsStatus.textContent =
        locale === 'de' ? 'Bitte Start und Ziel auswaehlen.' : 'Please choose both start and destination.';
      return;
    }
    if (directionStartFeature.properties.id === directionEndFeature.properties.id) {
      ui.directionsStatus.textContent =
        locale === 'de' ? 'Start und Ziel sind identisch.' : 'Start and destination are the same place.';
      return;
    }
    const startCoords = featureCoordinates(directionStartFeature);
    const endCoords = featureCoordinates(directionEndFeature);
    if (!startCoords || !endCoords) {
      ui.directionsStatus.textContent =
        locale === 'de' ? 'Fehlende Koordinaten fuer Start oder Ziel.' : 'Missing coordinates for start or destination.';
      return;
    }
    ui.directionsStatus.textContent = locale === 'de' ? 'Route wird berechnet...' : 'Calculating route...';
    ui.directionsMeta.innerHTML = '';
    ui.directionsGoBtn.disabled = true;
    try {
      const modeValue = ui.directionsMode.value as RouteMode;
      const route = await fetchRouteWithMode(startCoords, endCoords, modeValue, transitStops);
      mapController.setWalkingRoute(route.coordinates, ui.directionsAnimate.checked);
      const minutes = Math.max(1, Math.round(route.durationSeconds / 60));
      const km = (route.distanceMeters / 1000).toFixed(2);
      ui.directionsStatus.textContent =
        locale === 'de'
          ? `Route aktiv: ${km} km, ca. ${minutes} min zu Fuss.`
          : `Route ready: ${km} km, about ${minutes} min walking.`;
      const alternatives =
        route.alternatives.length > 0
          ? route.alternatives
              .map((alt, index) => {
                const altMin = Math.max(1, Math.round(alt.durationSeconds / 60));
                const altKm = (alt.distanceMeters / 1000).toFixed(2);
                return `${locale === 'de' ? 'Option' : 'Option'} ${index + 2}: ${altKm} km, ${altMin} min`;
              })
              .join('<br />')
          : locale === 'de'
            ? 'Keine weiteren Optionen verfuegbar.'
            : 'No additional options available.';
      const notes = route.notes.map((note) => `<p>${note}</p>`).join('');
      ui.directionsMeta.innerHTML = `
        <p><strong>${locale === 'de' ? 'Hoehenprofil' : 'Elevation'}:</strong> +${route.elevationGainMeters} m / -${route.elevationLossMeters} m</p>
        <p><strong>${locale === 'de' ? 'Weitere Optionen' : 'Other options'}:</strong><br />${alternatives}</p>
        ${notes}
      `;
    } catch {
      ui.directionsStatus.textContent =
        locale === 'de' ? 'Route konnte nicht berechnet werden.' : 'Could not calculate route.';
    } finally {
      ui.directionsGoBtn.disabled = false;
    }
  });

  ui.directionsClearBtn.addEventListener('click', () => {
    mapController.clearWalkingRoute();
    ui.directionsStatus.textContent = locale === 'de' ? 'Route entfernt.' : 'Route cleared.';
    ui.directionsMeta.innerHTML = '';
  });

  ui.resetFiltersBtn.addEventListener('click', () => {
    currentSearch = '';
    ui.searchInput.value = '';
    ui.searchResults.innerHTML = '';
    activeCategories = getDefaultActiveCategories();
    emojiEnabledCategories = getDefaultEmojiEnabledCategories();
    renderCategoryFilterRows();
    syncFilters();
    mapController.setEmojiEnabledCategories(emojiEnabledCategories);
    renderScreenReaderPanel();
  });

  ui.transitLabelsToggle.addEventListener('change', () => {
    transitLabelsVisible = ui.transitLabelsToggle.checked;
    mapController.setTransitLabelsVisible(transitLabelsVisible);
  });
  ui.view3DToggle.addEventListener('change', () => {
    threeDEnabled = ui.view3DToggle.checked;
    mapController.setThreeDEnabled(threeDEnabled);
  });

  ui.a11yDyslexicToggle.checked = a11yPrefs.dyslexicFont;
  ui.a11yContrastToggle.checked = a11yPrefs.highContrast;
  ui.a11yLargeTextToggle.checked = a11yPrefs.largerText;
  ui.a11yReduceMotionToggle.checked = a11yPrefs.reduceMotion;
  ui.a11yScreenReaderToggle.checked = a11yPrefs.screenReaderMode;
  ui.a11yMinGpuToggle.checked = a11yPrefs.minimizeGpu;

  const bindA11yToggle = (
    input: HTMLInputElement,
    key: keyof A11yPrefs,
  ): void => {
    input.addEventListener('change', () => {
      a11yPrefs = { ...a11yPrefs, [key]: input.checked };
      persistA11yPrefs(a11yPrefs);
      applyA11yClasses();
      renderScreenReaderPanel();
    });
  };
  bindA11yToggle(ui.a11yDyslexicToggle, 'dyslexicFont');
  bindA11yToggle(ui.a11yContrastToggle, 'highContrast');
  bindA11yToggle(ui.a11yLargeTextToggle, 'largerText');
  bindA11yToggle(ui.a11yReduceMotionToggle, 'reduceMotion');
  bindA11yToggle(ui.a11yScreenReaderToggle, 'screenReaderMode');
  bindA11yToggle(ui.a11yMinGpuToggle, 'minimizeGpu');

  setupSearch(
    ui.searchInput,
    ui.searchResults,
    features,
    locale,
    (searchText) => {
      currentSearch = searchText;
      syncFilters();
      renderScreenReaderPanel();
    },
    (selectedFeature) => {
      mapController.focus(selectedFeature);
    },
  );

  syncFilters();
  mapController.setTransitLabelsVisible(transitLabelsVisible);
  mapController.setThreeDEnabled(threeDEnabled);
  mapController.setEmojiEnabledCategories(emojiEnabledCategories);
  applyA11yClasses();
  renderScreenReaderPanel();
};

start().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : locale === 'de' ? 'Unbekannter Startfehler' : 'Unknown startup error';
  const searchResults = document.querySelector<HTMLDivElement>('#searchResults');
  if (searchResults) {
    searchResults.textContent =
      locale === 'de' ? `Karte konnte nicht initialisiert werden: ${message}` : `Could not initialize map: ${message}`;
  }
  renderFallbackNotice(message);
});

