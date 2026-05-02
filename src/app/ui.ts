import type { Locale } from '../i18n';

export type RendererMode = 'auto' | 'maplibre' | 'leaflet';

export type AppElements = {
  searchInput: HTMLInputElement;
  searchResults: HTMLDivElement;
  categoryFilters: HTMLDivElement;
  localeSelect: HTMLSelectElement;
  rendererModeSelect: HTMLSelectElement;
  basemapStyleSelect: HTMLSelectElement;
  themeModeSelect: HTMLSelectElement;
  weatherCard: HTMLDivElement;
  transitLabelsToggle: HTMLInputElement;
  view3DToggle: HTMLInputElement;
  resetMapViewBtn: HTMLButtonElement;
  alignMapOrientationBtn: HTMLButtonElement;
  resetFiltersBtn: HTMLButtonElement;
  a11yDyslexicToggle: HTMLInputElement;
  a11yContrastToggle: HTMLInputElement;
  a11yLargeTextToggle: HTMLInputElement;
  a11yReduceMotionToggle: HTMLInputElement;
  a11yScreenReaderToggle: HTMLInputElement;
  a11yMinGpuToggle: HTMLInputElement;
  screenReaderPanel: HTMLDivElement;
  directionsStart: HTMLInputElement;
  directionsEnd: HTMLInputElement;
  directionsStartPickBtn: HTMLButtonElement;
  directionsStartMyLocationBtn: HTMLButtonElement;
  directionsEndPickBtn: HTMLButtonElement;
  directionsStartMatches: HTMLDivElement;
  directionsEndMatches: HTMLDivElement;
  directionsMode: HTMLSelectElement;
  directionsAnimate: HTMLInputElement;
  directionsGoBtn: HTMLButtonElement;
  directionsClearBtn: HTMLButtonElement;
  directionsStatus: HTMLParagraphElement;
  directionsMeta: HTMLDivElement;
};

const requireElement = <T extends Element>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing required UI element: ${selector}`);
  }
  return element;
};

export const renderAppShell = (locale: Locale): AppElements => {
  const app = requireElement<HTMLDivElement>('#app');

  app.innerHTML = `
    <div class="app-shell">
      <header class="topbar">
        <div class="brand">
          <h1>MHH Campus Map</h1>
          <p class="subtitle">Medizinische Hochschule Hannover</p>
        </div>
        <div class="topbar-controls">
          <label class="topbar-control">
            <span>${locale === 'de' ? 'Sprache' : 'Language'}</span>
            <select id="localeSelect">
              <option value="de"${locale === 'de' ? ' selected' : ''}>Deutsch</option>
              <option value="en"${locale === 'en' ? ' selected' : ''}>English</option>
            </select>
          </label>
          <label class="topbar-control">
            <span>${locale === 'de' ? 'Karten-Engine' : 'Renderer'}</span>
            <select id="rendererMode">
              <option value="auto">${locale === 'de' ? 'Auto (MapLibre bevorzugen)' : 'Auto (prefer MapLibre)'}</option>
              <option value="maplibre">MapLibre</option>
              <option value="leaflet">Leaflet</option>
            </select>
          </label>
          <label class="topbar-control">
            <span>${locale === 'de' ? 'Basiskarte' : 'Basemap'}</span>
            <select id="basemapStyle">
              <option value="osm">${locale === 'de' ? 'Standard (OSM)' : 'Standard (OSM)'}</option>
              <option value="light">${locale === 'de' ? 'Hell (Light)' : 'Light'}</option>
            </select>
          </label>
          <label class="topbar-control">
            <span>${locale === 'de' ? 'Farbschema' : 'Theme'}</span>
            <select id="themeMode">
              <option value="light">${locale === 'de' ? 'Hell' : 'Light'}</option>
              <option value="dark">${locale === 'de' ? 'Dunkel' : 'Dark'}</option>
            </select>
          </label>
        </div>
      </header>
      <div class="layout">
        <aside class="sidebar">
          <details class="collapsible-panel sidebar-collapsible">
            <summary>${locale === 'de' ? 'Wetter' : 'Weather'}</summary>
            <div id="weatherCard" class="weather-card">${locale === 'de' ? 'Wetter wird geladen...' : 'Loading weather...'}</div>
          </details>
        <details class="collapsible-panel sidebar-collapsible">
          <summary>${locale === 'de' ? 'Routenplaner' : 'Directions'}</summary>
          <section class="directions-panel">
          <label class="label" for="directionsStart">${locale === 'de' ? 'Startpunkt' : 'Starting point'}</label>
          <div class="directions-pick-row">
            <input id="directionsStart" type="search" placeholder="${locale === 'de' ? 'Start suchen oder auf Karte klicken' : 'Search start or click on map'}" />
            <button id="directionsStartPickBtn" type="button" class="pick-btn">${locale === 'de' ? 'Karte' : 'Pick'}</button>
            <button id="directionsStartMyLocationBtn" type="button" class="pick-btn">${locale === 'de' ? 'Standort' : 'My location'}</button>
          </div>
          <div id="directionsStartMatches" class="directions-matches" aria-live="polite"></div>
          <label class="label" for="directionsEnd">${locale === 'de' ? 'Ziel' : 'Destination'}</label>
          <div class="directions-pick-row">
            <input id="directionsEnd" type="search" placeholder="${locale === 'de' ? 'Ziel suchen oder auf Karte klicken' : 'Search destination or click on map'}" />
            <button id="directionsEndPickBtn" type="button" class="pick-btn">${locale === 'de' ? 'Karte' : 'Pick'}</button>
          </div>
          <div id="directionsEndMatches" class="directions-matches" aria-live="polite"></div>
          <label class="label" for="directionsMode">${locale === 'de' ? 'Modus' : 'Mode'}</label>
          <select id="directionsMode">
            <option value="walk">${locale === 'de' ? 'Zu Fuss' : 'Walk'}</option>
            <option value="bus_walk">${locale === 'de' ? 'Bus + Fussweg' : 'Bus + Walk'}</option>
            <option value="accessible">${locale === 'de' ? 'Barrierearm' : 'Accessible'}</option>
          </select>
          <label class="a11y-item"><input id="directionsAnimate" type="checkbox" checked /> <span>${locale === 'de' ? 'Animation anzeigen' : 'Show animation'}</span></label>
          <div class="directions-actions">
            <button id="directionsGoBtn" type="button" class="reset-btn">${locale === 'de' ? 'Route anzeigen' : 'Show route'}</button>
            <button id="directionsClearBtn" type="button" class="reset-btn">${locale === 'de' ? 'Route loeschen' : 'Clear route'}</button>
          </div>
          <p id="directionsStatus" class="weather-status">${locale === 'de' ? 'Start und Ziel waehlen.' : 'Pick a start and destination.'}</p>
          <div id="directionsMeta" class="directions-meta"></div>
        </section>
        </details>
        <label class="label" for="searchInput">${locale === 'de' ? 'Suche nach Gebaeuden und POIs' : 'Search buildings and POIs'}</label>
        <input id="searchInput" type="search" placeholder="${locale === 'de' ? 'z.B. K10, Zahnklinik, Parken' : 'e.g. K10, Dental Clinic, Parking'}" />
        <div id="searchResults" class="search-results" aria-live="polite"></div>
        <h2>${locale === 'de' ? 'Anzeigen / Ausblenden' : 'Show / Hide'}</h2>
        <button id="resetFiltersBtn" type="button" class="reset-btn">${locale === 'de' ? 'Filter zuruecksetzen' : 'Reset filters'}</button>
        <div id="categoryFilters" class="filter-list"></div>
        <label class="filter-item transit-toggle">
          <input id="transitLabelsToggle" type="checkbox" />
          <span>${locale === 'de' ? '🚏 Nahverkehrslabels anzeigen (Linien/Richtung)' : '🚏 Show transit labels (lines/directions)'}</span>
        </label>
        <label class="filter-item transit-toggle">
          <input id="view3DToggle" type="checkbox" />
          <span>${locale === 'de' ? '🧊 3D-Ansicht aktivieren (nur MapLibre)' : '🧊 Enable 3D view (MapLibre only)'}</span>
        </label>
        <button id="resetMapViewBtn" type="button" class="reset-btn">${locale === 'de' ? '🧭 Kartenansicht zuruecksetzen' : '🧭 Reset map view'}</button>
        <button id="alignMapOrientationBtn" type="button" class="reset-btn">${locale === 'de' ? '🗺️ An MHH-Plan ausrichten' : '🗺️ Match MHH map orientation'}</button>
        <section class="a11y-panel">
          <h2>${locale === 'de' ? 'Barrierefreiheit' : 'Accessibility'}</h2>
          <label class="a11y-item"><input id="a11yDyslexicToggle" type="checkbox" /> <span>${locale === 'de' ? 'OpenDyslexic Schriftart' : 'OpenDyslexic Font'}</span></label>
          <label class="a11y-item"><input id="a11yContrastToggle" type="checkbox" /> <span>${locale === 'de' ? 'Hoher Kontrast' : 'High Contrast'}</span></label>
          <label class="a11y-item"><input id="a11yLargeTextToggle" type="checkbox" /> <span>${locale === 'de' ? 'Groessere Schrift' : 'Larger Text'}</span></label>
          <label class="a11y-item"><input id="a11yReduceMotionToggle" type="checkbox" /> <span>${locale === 'de' ? 'Weniger Bewegung' : 'Reduce Motion'}</span></label>
          <label class="a11y-item"><input id="a11yScreenReaderToggle" type="checkbox" /> <span>${locale === 'de' ? 'Screen Reader Modus' : 'Screen Reader Mode'}</span></label>
          <label class="a11y-item"><input id="a11yMinGpuToggle" type="checkbox" /> <span>${locale === 'de' ? 'GPU-Nutzung minimieren' : 'Minimize GPU Usage'}</span></label>
        </section>
        <p class="hint">
          ${locale === 'de' ? 'Daten sind OSM-first und lassen sich mit verifizierten MHH-Quellen leicht erweitern.' : 'Data is OSM-first and easy to extend with verified MHH sources.'}
        </p>
      </aside>
      <main class="map-wrap">
        <div id="map"></div>
        <section id="screenReaderPanel" class="screen-reader-panel" aria-live="polite"></section>
      </main>
      </div>
    </div>
  `;

  return {
    searchInput: requireElement<HTMLInputElement>('#searchInput'),
    searchResults: requireElement<HTMLDivElement>('#searchResults'),
    categoryFilters: requireElement<HTMLDivElement>('#categoryFilters'),
    localeSelect: requireElement<HTMLSelectElement>('#localeSelect'),
    rendererModeSelect: requireElement<HTMLSelectElement>('#rendererMode'),
    basemapStyleSelect: requireElement<HTMLSelectElement>('#basemapStyle'),
    themeModeSelect: requireElement<HTMLSelectElement>('#themeMode'),
    weatherCard: requireElement<HTMLDivElement>('#weatherCard'),
    transitLabelsToggle: requireElement<HTMLInputElement>('#transitLabelsToggle'),
    view3DToggle: requireElement<HTMLInputElement>('#view3DToggle'),
    resetMapViewBtn: requireElement<HTMLButtonElement>('#resetMapViewBtn'),
    alignMapOrientationBtn: requireElement<HTMLButtonElement>('#alignMapOrientationBtn'),
    resetFiltersBtn: requireElement<HTMLButtonElement>('#resetFiltersBtn'),
    a11yDyslexicToggle: requireElement<HTMLInputElement>('#a11yDyslexicToggle'),
    a11yContrastToggle: requireElement<HTMLInputElement>('#a11yContrastToggle'),
    a11yLargeTextToggle: requireElement<HTMLInputElement>('#a11yLargeTextToggle'),
    a11yReduceMotionToggle: requireElement<HTMLInputElement>('#a11yReduceMotionToggle'),
    a11yScreenReaderToggle: requireElement<HTMLInputElement>('#a11yScreenReaderToggle'),
    a11yMinGpuToggle: requireElement<HTMLInputElement>('#a11yMinGpuToggle'),
    screenReaderPanel: requireElement<HTMLDivElement>('#screenReaderPanel'),
    directionsStart: requireElement<HTMLInputElement>('#directionsStart'),
    directionsEnd: requireElement<HTMLInputElement>('#directionsEnd'),
    directionsStartPickBtn: requireElement<HTMLButtonElement>('#directionsStartPickBtn'),
    directionsStartMyLocationBtn: requireElement<HTMLButtonElement>('#directionsStartMyLocationBtn'),
    directionsEndPickBtn: requireElement<HTMLButtonElement>('#directionsEndPickBtn'),
    directionsStartMatches: requireElement<HTMLDivElement>('#directionsStartMatches'),
    directionsEndMatches: requireElement<HTMLDivElement>('#directionsEndMatches'),
    directionsMode: requireElement<HTMLSelectElement>('#directionsMode'),
    directionsAnimate: requireElement<HTMLInputElement>('#directionsAnimate'),
    directionsGoBtn: requireElement<HTMLButtonElement>('#directionsGoBtn'),
    directionsClearBtn: requireElement<HTMLButtonElement>('#directionsClearBtn'),
    directionsStatus: requireElement<HTMLParagraphElement>('#directionsStatus'),
    directionsMeta: requireElement<HTMLDivElement>('#directionsMeta'),
  };
};

