/**
 * Fetch metadata for the curated Poly Haven starter set.
 *
 * This script performs discovery only: it resolves each curated asset to its
 * upstream metadata (display name, physical dimensions, authors) and to the
 * concrete download URLs of the PBR maps we care about. It writes a single
 * selection manifest that `normalize-material.ts` then consumes.
 *
 * Selection is an explicit allowlist rather than a keyword search, because the
 * upstream index mixes architectural surfaces with fabric, terrain and bark
 * scans that are not useful for ArchiSimple.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { MaterialCategory } from "../src/material-schema.ts";

const API_BASE = "https://api.polyhaven.com";
const OUTPUT_DIR = join(process.cwd(), "materials");
const OUTPUT_FILE = join(OUTPUT_DIR, "polyhaven-selection.json");
const USER_AGENT =
  "ArchiSimple-Materials-PoC/0.1 (+https://github.com/kefrens/archisimple-materials-poc-)";

interface CuratedEntry {
  /** Upstream Poly Haven asset slug. */
  asset: string;
  /** Stable ArchiSimple material id. Curated by hand so it never shifts. */
  id: string;
  category: MaterialCategory;
}

/**
 * The curated starter set: two materials per architectural category, chosen for
 * clean, tileable, real-world building surfaces.
 */
const CURATED: readonly CuratedEntry[] = [
  { asset: "concrete_floor_worn_001", id: "concrete-floor-worn-01", category: "concrete" },
  { asset: "concrete_floor_02", id: "concrete-floor-02", category: "concrete" },
  { asset: "beige_wall_001", id: "plaster-beige-01", category: "plaster" },
  { asset: "grey_plaster", id: "plaster-grey-01", category: "plaster" },
  { asset: "red_brick", id: "brick-red-01", category: "brick" },
  { asset: "brick_wall_001", id: "brick-wall-01", category: "brick" },
  { asset: "marble_01", id: "stone-marble-01", category: "stone" },
  { asset: "stone_tiles_02", id: "stone-slate-tiles-01", category: "stone" },
  { asset: "wood_floor", id: "wood-floor-01", category: "wood" },
  { asset: "plywood", id: "wood-plywood-01", category: "wood" },
  { asset: "tiled_floor_001", id: "tile-glazed-floor-01", category: "tile" },
  { asset: "floor_tiles_08", id: "tile-quarry-floor-01", category: "tile" },
];

/**
 * Upstream map keys mapped onto the schema's `MaterialMaps` fields.
 *
 * `nor_gl` is the OpenGL-convention normal map, which is the one web renderers
 * (three.js, glTF) expect; `nor_dx` is deliberately ignored.
 */
const MAP_TYPES = {
  Diffuse: "baseColor",
  nor_gl: "normal",
  Rough: "roughness",
  Displacement: "height",
  AO: "ambientOcclusion",
} as const;

/** Formats we can actually decode downstream. EXR is skipped on purpose. */
const KEEP_FORMATS = ["jpg", "png"] as const;

type SchemaMapName = (typeof MAP_TYPES)[keyof typeof MAP_TYPES];

interface RemoteFile {
  url: string;
  size?: number;
  md5?: string;
}

/** `maps.baseColor["2k"].jpg -> RemoteFile` */
type MapVariants = Record<string, Partial<Record<string, RemoteFile>>>;

interface PolyHavenInfo {
  name?: string;
  categories?: string[];
  tags?: string[];
  authors?: Record<string, string>;
  /** Real-world size of the captured surface, in millimetres. */
  dimensions?: [number, number];
  description?: string;
  category?: string;
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!response.ok) {
    throw new Error(`Poly Haven request failed (${response.status}): ${url}`);
  }
  return response.json() as Promise<T>;
}

function isRemoteFile(value: unknown): value is RemoteFile {
  return (
    typeof value === "object" &&
    value !== null &&
    "url" in value &&
    typeof (value as RemoteFile).url === "string"
  );
}

/**
 * Pull the maps we care about out of the `/files` response, preserving which
 * map type, resolution and format each URL belongs to. The upstream payload
 * also contains `blend`/`gltf`/`mtlx` bundles with large nested `include`
 * trees; those are dropped.
 */
function extractMaps(files: unknown): Partial<Record<SchemaMapName, MapVariants>> {
  const maps: Partial<Record<SchemaMapName, MapVariants>> = {};
  if (typeof files !== "object" || files === null) return maps;

  for (const [upstreamName, schemaName] of Object.entries(MAP_TYPES)) {
    const byResolution = (files as Record<string, unknown>)[upstreamName];
    if (typeof byResolution !== "object" || byResolution === null) continue;

    const variants: MapVariants = {};
    for (const [resolution, byFormat] of Object.entries(byResolution)) {
      if (typeof byFormat !== "object" || byFormat === null) continue;

      const kept: Partial<Record<string, RemoteFile>> = {};
      for (const format of KEEP_FORMATS) {
        const file = (byFormat as Record<string, unknown>)[format];
        if (isRemoteFile(file)) {
          kept[format] = { url: file.url, size: file.size, md5: file.md5 };
        }
      }
      if (Object.keys(kept).length > 0) variants[resolution] = kept;
    }

    if (Object.keys(variants).length > 0) maps[schemaName as SchemaMapName] = variants;
  }

  return maps;
}

/** Poly Haven reports dimensions in millimetres; the schema stores metres. */
function toPhysicalSize(dimensions: PolyHavenInfo["dimensions"]) {
  if (!dimensions || dimensions.length !== 2) return undefined;
  const [width, height] = dimensions;
  if (!Number.isFinite(width) || !Number.isFinite(height)) return undefined;
  return {
    width: Number((width / 1000).toFixed(3)),
    height: Number((height / 1000).toFixed(3)),
    unit: "m" as const,
  };
}

async function main() {
  console.log(`Resolving ${CURATED.length} curated Poly Haven assets...`);
  const materials = [];

  for (const entry of CURATED) {
    const [info, files] = await Promise.all([
      getJson<PolyHavenInfo>(`${API_BASE}/info/${entry.asset}`),
      getJson<unknown>(`${API_BASE}/files/${entry.asset}`),
    ]);

    const maps = extractMaps(files);
    const mapNames = Object.keys(maps);
    if (mapNames.length === 0) {
      throw new Error(`No usable maps found for ${entry.asset}`);
    }

    materials.push({
      id: entry.id,
      category: entry.category,
      name: info.name ?? entry.asset,
      description: info.description,
      tags: info.tags ?? [],
      upstreamCategories: info.categories ?? [],
      upstreamCategory: info.category,
      authors: info.authors ?? {},
      physicalSize: toPhysicalSize(info.dimensions),
      source: {
        provider: "polyhaven",
        asset: entry.asset,
        license: "CC0",
        url: `https://polyhaven.com/a/${entry.asset}`,
      },
      maps,
    });

    console.log(`✓ ${entry.id.padEnd(24)} ${entry.asset.padEnd(24)} maps: ${mapNames.join(", ")}`);
  }

  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(
    OUTPUT_FILE,
    `${JSON.stringify(
      {
        provider: "polyhaven",
        license: "CC0",
        fetchedAt: new Date().toISOString(),
        count: materials.length,
        materials,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  console.log(`Saved ${materials.length} curated candidates to ${OUTPUT_FILE}.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
