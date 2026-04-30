import type { CampusFeature } from '../types/campus';
import type { Locale } from '../i18n';

const MAX_RESULTS = 8;

const displayName = (feature: CampusFeature): string => {
  const p = feature.properties;
  if (p.shortLabel && !p.name.toUpperCase().startsWith(`${p.shortLabel.toUpperCase()} -`) && p.name !== p.shortLabel) {
    return `${p.shortLabel} - ${p.name}`;
  }
  return p.name;
};

const toSearchHaystack = (feature: CampusFeature): string => {
  const p = feature.properties;
  return `${displayName(feature)} ${p.shortLabel ?? ''} ${p.category} ${p.address} ${p.id}`.toLowerCase();
};

export const setupSearch = (
  input: HTMLInputElement,
  resultsContainer: HTMLDivElement,
  features: CampusFeature[],
  locale: Locale,
  onInputChange: (text: string) => void,
  onSelect: (feature: CampusFeature) => void,
): void => {
  const renderResults = (query: string): void => {
    const normalized = query.trim().toLowerCase();
    resultsContainer.innerHTML = '';

    if (!normalized) {
      return;
    }

    const matches = features
      .filter((feature) => toSearchHaystack(feature).includes(normalized))
      .slice(0, MAX_RESULTS);

    if (matches.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'empty-search';
      empty.textContent = locale === 'de' ? 'Keine Treffer.' : 'No matches yet.';
      resultsContainer.appendChild(empty);
      return;
    }

    matches.forEach((feature) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'result-item';
      button.innerHTML = `
        <strong>${displayName(feature)}</strong>
        <span>${feature.properties.category}</span>
      `;
      button.addEventListener('click', () => {
        onSelect(feature);
      });
      resultsContainer.appendChild(button);
    });
  };

  input.addEventListener('input', () => {
    const value = input.value;
    onInputChange(value);
    renderResults(value);
  });
};
