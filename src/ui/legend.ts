import { getCategoryMeta } from '../config/categories';
import type { Locale } from '../i18n';

export const renderLegend = (container: HTMLDivElement, categories: string[], locale: Locale): void => {
  container.innerHTML = '';

  categories.forEach((category) => {
    const meta = getCategoryMeta(category);
    const row = document.createElement('div');
    row.className = 'legend-item';

    const swatch = document.createElement('span');
    swatch.className = 'legend-swatch';
    swatch.style.backgroundColor = meta.color;
    swatch.setAttribute('aria-hidden', 'true');

    const icon = document.createElement('span');
    icon.className = 'legend-icon';
    icon.textContent = meta.icon;

    const label = document.createElement('span');
    label.textContent = meta.label[locale];

    row.append(swatch, icon, label);
    container.appendChild(row);
  });
};
