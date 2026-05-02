export type CategoryMeta = {
  label: Record<'de' | 'en', string>;
  color: string;
  icon: string;
};

export const CATEGORY_META: Record<string, CategoryMeta> = {
  clinic: { label: { de: 'Kliniken', en: 'Clinics' }, color: '#5EBCD2', icon: '🩺' },
  institute: { label: { de: 'Institute', en: 'Institutes' }, color: '#FEB232', icon: '🏛️' },
  research: { label: { de: 'Forschung & Lehre', en: 'Research & Teaching' }, color: '#C6C810', icon: '🔬' },
  administration: { label: { de: 'Verwaltung & Technik', en: 'Administration & Technical' }, color: '#FEB232', icon: '🏢' },
  dormitory: { label: { de: 'Wohngebaeude', en: 'Dormitory' }, color: '#c7ced6', icon: '🏠' },
  parking: { label: { de: 'Parken', en: 'Parking' }, color: '#6b7280', icon: '🅿️' },
  motorcycle: { label: { de: 'Motorrad-Parken', en: 'Motorcycle Parking' }, color: '#2563eb', icon: '🏍️' },
  transit: { label: { de: 'Nahverkehr', en: 'Transit' }, color: '#e31a1c', icon: '🚆' },
  benches: { label: { de: 'Sitzbaenke', en: 'Benches' }, color: '#6b7280', icon: '🪑' },
  waste_baskets: { label: { de: 'Muelleimer', en: 'Waste Baskets' }, color: '#94a3b8', icon: '🗑️' },
  shelter: { label: { de: 'Unterstaende', en: 'Shelters' }, color: '#b58b66', icon: '🛖' },
  entrance: { label: { de: 'Eingaenge', en: 'Entrances' }, color: '#f59e0b', icon: '🚪' },
  walkways: { label: { de: 'Fusswege', en: 'Walkways' }, color: '#0ea5e9', icon: '🚶' },
  accessibility: { label: { de: 'Barrierefreiheit', en: 'Accessibility' }, color: '#7c3aed', icon: '♿' },
  green_areas: { label: { de: 'Gruenflaechen', en: 'Green areas' }, color: '#8ccf7a', icon: '🌿' },
  postal: { label: { de: 'Post', en: 'Post & Mail' }, color: '#8b5cf6', icon: '📮' },
  bicycle: { label: { de: 'Fahrrad', en: 'Bicycle' }, color: '#0ea5e9', icon: '🚲' },
  charging: { label: { de: 'Ladestellen', en: 'Charging' }, color: '#14b8a6', icon: '🔌' },
  food: { label: { de: 'Essen & Cafe', en: 'Food & Cafe' }, color: '#d97706', icon: '🍽️' },
  trees: { label: { de: 'Baeume', en: 'Trees' }, color: '#22c55e', icon: '🌳' },
  facilities: { label: { de: 'Einrichtungen', en: 'Facilities' }, color: '#b3bcc7', icon: '🚻' },
  finance: { label: { de: 'Finanzen', en: 'Finance' }, color: '#10b981', icon: '🏦' },
};

export const getCategoryMeta = (category: string): CategoryMeta => {
  return CATEGORY_META[category] ?? { label: { de: category, en: category }, color: '#00897b', icon: '📍' };
};
