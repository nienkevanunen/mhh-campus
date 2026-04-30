import { getCategoryMeta } from '../config/categories';
import type { Locale } from '../i18n';

export const setupCategoryFilters = (
  container: HTMLDivElement,
  categories: string[],
  initiallyHiddenCategories: Set<string>,
  initiallyEmojiDisabledCategories: Set<string>,
  locale: Locale,
  onVisibilityChange: (activeCategories: Set<string>) => void,
  onEmojiChange: (emojiEnabledCategories: Set<string>) => void,
): void => {
  const active = new Set(categories.filter((category) => !initiallyHiddenCategories.has(category)));
  const emojiEnabled = new Set(categories.filter((category) => !initiallyEmojiDisabledCategories.has(category)));
  container.innerHTML = '';

  categories.forEach((category) => {
    const row = document.createElement('div');
    row.className = 'filter-item filter-item-row';

    const visibilityInput = document.createElement('input');
    visibilityInput.type = 'checkbox';
    visibilityInput.checked = active.has(category);
    visibilityInput.title = 'Show / hide this category';
    visibilityInput.addEventListener('change', () => {
      if (visibilityInput.checked) {
        active.add(category);
      } else {
        active.delete(category);
      }
      onVisibilityChange(new Set(active));
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

    row.append(swatch, text, visibilityWrap, emojiWrap);
    container.appendChild(row);
  });
};
