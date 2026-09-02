export const MATERIAL_CATEGORIES = [
  "concrete",
  "plaster",
  "brick",
  "stone",
  "wood",
  "tile",
  "flooring",
  "roof",
  "site",
] as const;

export type MaterialCategory = (typeof MATERIAL_CATEGORIES)[number];

export interface PhysicalSize {
  width: number;
  height: number;
  unit: "m";
}

export interface MaterialSource {
  provider: string;
  asset: string;
  license: string;
  url?: string;
}

export interface MaterialMaps {
  baseColor?: string;
  normal?: string;
  roughness?: string;
  metallic?: string;
  height?: string;
  ambientOcclusion?: string;
}

export interface MaterialProperties {
  roughness?: number;
  metallic?: number;
}

export interface Material {
  id: string;
  name: string;
  category: MaterialCategory;
  source: MaterialSource;
  physicalSize?: PhysicalSize;
  maps: MaterialMaps;
  properties?: MaterialProperties;
  tags?: string[];
}
