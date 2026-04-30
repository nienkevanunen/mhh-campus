import type { Feature, FeatureCollection, Geometry } from 'geojson';

export type CampusProps = {
  id: string;
  name: string;
  category: string;
  address: string;
  openingHours?: string;
  phone?: string;
  website?: string;
  transitMode?: string;
  transitLines?: string;
  transitDirection?: string;
  source: string;
  lastVerified: string;
};

export type CampusFeature = Feature<Geometry, CampusProps>;
export type CampusFeatureCollection = FeatureCollection<Geometry, CampusProps>;
