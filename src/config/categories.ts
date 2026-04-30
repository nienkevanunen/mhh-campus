export type CategoryMeta = {
  label: Record<'de' | 'en', string>;
  color: string;
  icon: string;
};

export const CATEGORY_META: Record<string, CategoryMeta> = {
  clinic: { label: { de: 'Kliniken', en: 'Clinics' }, color: '#1f78b4', icon: '🩺' },
  institute: { label: { de: 'Institute', en: 'Institutes' }, color: '#33a02c', icon: '🏛️' },
  research: { label: { de: 'Forschung', en: 'Research' }, color: '#6a3d9a', icon: '🔬' },
  parking: { label: { de: 'Parken', en: 'Parking' }, color: '#0ea5e9', icon: '🅿️' },
  transit: { label: { de: 'Nahverkehr', en: 'Transit' }, color: '#e31a1c', icon: '🚆' },
  benches: { label: { de: 'Sitzbaenke', en: 'Benches' }, color: '#6b7280', icon: '🪑' },
  waste_baskets: { label: { de: 'Muelleimer', en: 'Waste Baskets' }, color: '#94a3b8', icon: '🗑️' },
  shelter: { label: { de: 'Unterstaende', en: 'Shelters' }, color: '#a16207', icon: '🛖' },
  postal: { label: { de: 'Post', en: 'Post & Mail' }, color: '#8b5cf6', icon: '📮' },
  bicycle: { label: { de: 'Fahrrad', en: 'Bicycle' }, color: '#0ea5e9', icon: '🚲' },
  charging: { label: { de: 'Ladestellen', en: 'Charging' }, color: '#14b8a6', icon: '🔌' },
  food: { label: { de: 'Essen & Cafe', en: 'Food & Cafe' }, color: '#d97706', icon: '🍽️' },
  facilities: { label: { de: 'Einrichtungen', en: 'Facilities' }, color: '#64748b', icon: '🚻' },
  finance: { label: { de: 'Finanzen', en: 'Finance' }, color: '#10b981', icon: '🏦' },
};

export const getCategoryMeta = (category: string): CategoryMeta => {
  return CATEGORY_META[category] ?? { label: { de: category, en: category }, color: '#00897b', icon: '📍' };
};
