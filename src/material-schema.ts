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
  /** Upstream credits, kept even when the license does not require attribution. */
  authors?: Record<string, string>;
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
  /** Square preview thumbnail, relative to the material directory. */
  preview?: string;
  description?: string;
  physicalSize?: PhysicalSize;
  maps: MaterialMaps;
  /** Pixel resolution the bundled maps were normalized at, e.g. "2k". */
  resolution?: string;
  properties?: MaterialProperties;
  tags?: string[];
}

export function isMaterialCategory(value: unknown): value is MaterialCategory {
  return (MATERIAL_CATEGORIES as readonly unknown[]).includes(value);
}
