import { getCategoryMeta } from '../config/categories';
import type { Locale } from '../i18n';

const BUILDING_PRIORITY = ['clinic', 'research', 'administration', 'institute', 'dormitory', 'food'];
const PARKING_PRIORITY = ['parking', 'bicycle', 'motorcycle'];
const FACILITY_CATEGORIES = new Set([
  'benches',
  'charging',
  'waste_baskets',
  'shelter',
  'postal',
  'facilities',
  'finance',
]);

export const setupCategoryFilters = (
  container: HTMLDivElement,
  categories: string[],
  initiallyHiddenCategories: Set<string>,
  initiallyEmojiDisabledCategories: Set<string>,
  initiallyLabelDisabledCategories: Set<string>,
  locale: Locale,
  onVisibilityChange: (activeCategories: Set<string>) => void,
  onEmojiChange: (emojiEnabledCategories: Set<string>) => void,
  onLabelChange: (labelEnabledCategories: Set<string>) => void,
): void => {
  const active = new Set(categories.filter((category) => !initiallyHiddenCategories.has(category)));
  const emojiEnabled = new Set(categories.filter((category) => !initiallyEmojiDisabledCategories.has(category)));
  const labelEnabled = new Set(categories.filter((category) => !initiallyLabelDisabledCategories.has(category)));
  container.innerHTML = '';

  const categoriesSet = new Set(categories);
  const buildings = BUILDING_PRIORITY.filter((category) => categoriesSet.has(category));
  const parking = PARKING_PRIORITY.filter((category) => categoriesSet.has(category));
  const transit = categoriesSet.has('transit') ? ['transit'] : [];
  const used = new Set([...buildings, ...parking, ...transit]);
  const nonFacilityRest = categories
    .filter((category) => !used.has(category) && !FACILITY_CATEGORIES.has(category))
    .sort();
  const facilities = categories.filter((category) => FACILITY_CATEGORIES.has(category)).sort();

  const createRow = (category: string): HTMLDivElement => {
    const row = document.createElement('div');
    row.className = 'filter-item filter-item-row';

    const visibilityInput = document.createElement('input');
    visibilityInput.type = 'checkbox';
    visibilityInput.checked = active.has(category);
    visibilityInput.title = 'Show / hide this category';
    visibilityInput.addEventListener('change', () => {
      if (visibilityInput.checked) {
        active.add(category);
        onVisibilityChange(new Set(active));
      } else {
        active.delete(category);
        onVisibilityChange(new Set(active));
        // Keep state consistent: hidden categories cannot keep labels/emojis enabled.
        emojiEnabled.delete(category);
        labelEnabled.delete(category);
        emojiInput.checked = false;
        labelInput.checked = false;
        onEmojiChange(new Set(emojiEnabled));
        onLabelChange(new Set(labelEnabled));
      }
    });

    const emojiInput = document.createElement('input');
    emojiInput.type = 'checkbox';
    emojiInput.checked = emojiEnabled.has(category);
    emojiInput.title = 'Enable / disable emoji markers';
    emojiInput.addEventListener('change', () => {
      if (emojiInput.checked) {
        emojiEnabled.add(category);
      } else {
        emojiEnabled.delete(category);
      }
      onEmojiChange(new Set(emojiEnabled));
    });

    const meta = getCategoryMeta(category);
    const labelInput = document.createElement('input');
    labelInput.type = 'checkbox';
    labelInput.checked = labelEnabled.has(category);
    labelInput.title = 'Enable / disable text labels';
    labelInput.addEventListener('change', () => {
      if (labelInput.checked) {
        labelEnabled.add(category);
      } else {
        labelEnabled.delete(category);
      }
      onLabelChange(new Set(labelEnabled));
    });

    const swatch = document.createElement('span');
    swatch.className = 'legend-swatch';
    swatch.style.backgroundColor = meta.color;
    swatch.setAttribute('aria-hidden', 'true');

    const text = document.createElement('span');
    text.textContent = `${meta.icon} ${meta.label[locale]}`;
    text.className = 'filter-label';

    const visibilityWrap = document.createElement('label');
    visibilityWrap.className = 'mini-toggle';
    visibilityWrap.append(visibilityInput, document.createTextNode(locale === 'de' ? 'anzeigen' : 'show'));

    const emojiWrap = document.createElement('label');
    emojiWrap.className = 'mini-toggle';
    emojiWrap.append(emojiInput, document.createTextNode('emoji'));

    const labelWrap = document.createElement('label');
    labelWrap.className = 'mini-toggle';
    labelWrap.append(labelInput, document.createTextNode(locale === 'de' ? 'label' : 'label'));

    const syncToggleAvailability = (): void => {
      const enabled = visibilityInput.checked;
      emojiInput.disabled = !enabled;
      labelInput.disabled = !enabled;
      emojiWrap.classList.toggle('mini-toggle-disabled', !enabled);
      labelWrap.classList.toggle('mini-toggle-disabled', !enabled);
    };
    visibilityInput.addEventListener('change', syncToggleAvailability);
    syncToggleAvailability();

    row.append(swatch, text, visibilityWrap, emojiWrap, labelWrap);
    return row;
  };

  const appendSection = (title: string, sectionCategories: string[]): void => {
    if (sectionCategories.length === 0) return;
    const heading = document.createElement('p');
    heading.className = 'filter-section-title';
    heading.textContent = title;
    container.appendChild(heading);
    sectionCategories.forEach((category) => container.appendChild(createRow(category)));
  };

  appendSection(locale === 'de' ? 'Gebaeude' : 'Buildings', buildings);
  appendSection(locale === 'de' ? 'Parken' : 'Parking', parking);
  appendSection(locale === 'de' ? 'Nahverkehr' : 'Transit', transit);
  appendSection(locale === 'de' ? 'Weitere Kategorien' : 'Other categories', nonFacilityRest);

  if (facilities.length > 0) {
    const details = document.createElement('details');
    details.className = 'category-facilities-dropdown';
    const summary = document.createElement('summary');
    summary.textContent = locale === 'de' ? 'Einrichtungen & Kleinteile' : 'Facilities & Misc';
    details.appendChild(summary);
    facilities.forEach((category) => details.appendChild(createRow(category)));
    container.appendChild(details);
  }

  // Force an explicit initial sync so map/filter state is correct before first user interaction.
  onVisibilityChange(new Set(active));
  onEmojiChange(new Set(emojiEnabled));
  onLabelChange(new Set(labelEnabled));
};
