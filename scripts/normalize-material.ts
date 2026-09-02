/**
 * Normalize curated Poly Haven candidates into ArchiSimple material assets.
 *
 * This is the step between discovery and catalog build: it turns each entry of
 * `materials/polyhaven-selection.json` into a self-contained directory holding
 * a schema-conforming `material.json`, a square preview and WebP PBR maps.
 *
 *   npm run normalize                      # every curated material at 2k
 *   npm run normalize -- --resolution 1k   # smaller bundle
 *   npm run normalize -- brick-red-01      # a single material
 *   npm run normalize -- --force           # re-encode even if maps exist
 *
 * Downloads are cached under `.tmp/` (gitignored) so re-runs are cheap.
 */

import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { join, dirname } from "node:path";

import sharp from "sharp";

import {
  isMaterialCategory,
  type Material,
  type MaterialMaps,
} from "../src/material-schema.ts";
import { formatIssues, validateMaterial } from "../src/validate-material.ts";

const ROOT = process.cwd();
const MATERIALS_DIR = join(ROOT, "materials");
const SELECTION_FILE = join(MATERIALS_DIR, "polyhaven-selection.json");
const CACHE_DIR = join(ROOT, ".tmp", "downloads");
const USER_AGENT =
  "ArchiSimple-Materials-PoC/0.1 (+https://github.com/kefrens/archisimple-materials-poc-)";

const DEFAULT_RESOLUTION = "2k";
const PREVIEW_SIZE = 512;

/**
 * How each schema map is written to disk.
 *
 * Roughness, height and ambient occlusion carry no colour information, so they
 * are stored as single-channel WebP — a meaningful bundle-size win. Normal maps
 * encode direction in RGB and are given a higher quality budget, since
 * compression artifacts there show up directly as lighting noise.
 */
const MAP_OUTPUTS = {
  baseColor: { file: "basecolor.webp", quality: 85, grayscale: false },
  normal: { file: "normal.webp", quality: 95, grayscale: false },
  roughness: { file: "roughness.webp", quality: 85, grayscale: true },
  height: { file: "height.webp", quality: 90, grayscale: true },
  ambientOcclusion: { file: "ao.webp", quality: 85, grayscale: true },
} as const satisfies Record<string, { file: string; quality: number; grayscale: boolean }>;

type MapName = keyof typeof MAP_OUTPUTS;

/** Source formats in preference order. JPEG keeps downloads ~10x smaller. */
const FORMAT_PREFERENCE = ["jpg", "png"] as const;

interface RemoteFile {
  url: string;
  size?: number;
  md5?: string;
}

interface SelectionMaterial {
  id: string;
  name: string;
  category: string;
  description?: string;
  tags?: string[];
  authors?: Record<string, string>;
  physicalSize?: Material["physicalSize"];
  source: { provider: string; asset: string; license: string; url?: string };
  maps: Partial<Record<MapName, Record<string, Partial<Record<string, RemoteFile>>>>>;
}

interface Selection {
  materials: SelectionMaterial[];
}

interface Options {
  resolution: string;
  force: boolean;
  ids: string[];
}

function parseArgs(argv: string[]): Options {
  const options: Options = { resolution: DEFAULT_RESOLUTION, force: false, ids: [] };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--force") {
      options.force = true;
    } else if (arg === "--resolution") {
      const value = argv[i + 1];
      if (!value) throw new Error("--resolution requires a value (e.g. 1k, 2k, 4k)");
      options.resolution = value;
      i += 1;
    } else if (arg.startsWith("--resolution=")) {
      options.resolution = arg.slice("--resolution=".length);
    } else if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      options.ids.push(arg);
    }
  }

  return options;
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/** Download `url` into the cache directory, reusing an earlier download. */
async function download(url: string): Promise<string> {
  const cachePath = join(CACHE_DIR, new URL(url).pathname.replace(/^\/+/, ""));
  if (await exists(cachePath)) return cachePath;

  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!response.ok) {
    throw new Error(`Download failed (${response.status}): ${url}`);
  }

  await mkdir(dirname(cachePath), { recursive: true });
  await writeFile(cachePath, Buffer.from(await response.arrayBuffer()));
  return cachePath;
}

/** Pick the best available source file for a map at the requested resolution. */
function pickSource(
  variants: Record<string, Partial<Record<string, RemoteFile>>> | undefined,
  resolution: string,
): RemoteFile | undefined {
  const byFormat = variants?.[resolution];
  if (!byFormat) return undefined;
  for (const format of FORMAT_PREFERENCE) {
    const file = byFormat[format];
    if (file) return file;
  }
  return undefined;
}

/**
 * Whether an already-normalized material was built at a different resolution.
 * Output paths do not encode the resolution, so without this check a re-run at
 * another resolution would keep the previously encoded maps and only rewrite
 * `material.json`, leaving the manifest describing files that do not match.
 */
async function resolutionChanged(materialDir: string, resolution: string): Promise<boolean> {
  try {
    const existing = JSON.parse(
      await readFile(join(materialDir, "material.json"), "utf8"),
    ) as Partial<Material>;
    return existing.resolution !== undefined && existing.resolution !== resolution;
  } catch {
    return false;
  }
}

async function normalize(material: SelectionMaterial, options: Options): Promise<Material> {
  if (!isMaterialCategory(material.category)) {
    throw new Error(`${material.id}: unknown category "${material.category}"`);
  }

  const materialDir = join(MATERIALS_DIR, material.id);
  const mapsDir = join(materialDir, "maps");
  await mkdir(mapsDir, { recursive: true });

  const reencode = options.force || (await resolutionChanged(materialDir, options.resolution));

  const maps: MaterialMaps = {};
  let baseColorSource: string | undefined;

  for (const [mapName, output] of Object.entries(MAP_OUTPUTS) as [
    MapName,
    (typeof MAP_OUTPUTS)[MapName],
  ][]) {
    const source = pickSource(material.maps[mapName], options.resolution);
    if (!source) continue;

    const sourcePath = await download(source.url);
    if (mapName === "baseColor") baseColorSource = sourcePath;

    const targetPath = join(mapsDir, output.file);
    const relativePath = `maps/${output.file}`;

    if (reencode || !(await exists(targetPath))) {
      const pipeline = sharp(sourcePath);
      if (output.grayscale) pipeline.grayscale();
      await pipeline.webp({ quality: output.quality, effort: 5 }).toFile(targetPath);
    }

    maps[mapName] = relativePath;
  }

  if (!maps.baseColor || !baseColorSource) {
    throw new Error(`${material.id}: no base colour map at resolution ${options.resolution}`);
  }

  // The preview is always built from the 1k base colour when available, so the
  // thumbnail cost does not scale with the chosen map resolution.
  const previewSource = pickSource(material.maps.baseColor, "1k");
  const previewPath = join(materialDir, "preview.webp");
  if (reencode || !(await exists(previewPath))) {
    await sharp(previewSource ? await download(previewSource.url) : baseColorSource)
      .resize(PREVIEW_SIZE, PREVIEW_SIZE, { fit: "cover" })
      .webp({ quality: 80 })
      .toFile(previewPath);
  }

  const normalized: Material = {
    id: material.id,
    name: material.name,
    category: material.category,
    source: {
      provider: material.source.provider,
      asset: material.source.asset,
      license: material.source.license,
      url: material.source.url,
      authors: material.authors,
    },
    preview: "preview.webp",
    description: material.description,
    physicalSize: material.physicalSize,
    maps,
    resolution: options.resolution,
    tags: material.tags,
  };

  // Catch a malformed record here rather than letting the catalog build be the
  // first thing that notices.
  const issues = validateMaterial(normalized);
  if (issues.length > 0) {
    throw new Error(`${material.id}: normalized record is invalid:\n${formatIssues(issues)}`);
  }

  await writeFile(
    join(materialDir, "material.json"),
    `${JSON.stringify(normalized, null, 2)}\n`,
    "utf8",
  );

  return normalized;
}

/** Total on-disk size of the files a normalized material contributes. */
async function materialSize(material: Material): Promise<number> {
  const dir = join(MATERIALS_DIR, material.id);
  const files = [
    "material.json",
    ...(material.preview ? [material.preview] : []),
    ...Object.values(material.maps),
  ];

  let total = 0;
  for (const file of files) {
    total += (await stat(join(dir, file))).size;
  }
  return total;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const selection = JSON.parse(await readFile(SELECTION_FILE, "utf8")) as Selection;

  let queue = selection.materials;
  if (options.ids.length > 0) {
    const wanted = new Set(options.ids);
    queue = queue.filter((material) => wanted.has(material.id));

    const missing = options.ids.filter(
      (id) => !selection.materials.some((material) => material.id === id),
    );
    if (missing.length > 0) {
      throw new Error(`Not in the curated selection: ${missing.join(", ")}`);
    }
  }

  console.log(`Normalizing ${queue.length} materials at ${options.resolution}...`);

  let totalBytes = 0;
  for (const material of queue) {
    const normalized = await normalize(material, options);
    const bytes = await materialSize(normalized);
    totalBytes += bytes;
    console.log(
      `✓ ${normalized.id.padEnd(24)} ${Object.keys(normalized.maps).length} maps` +
        `  ${(bytes / 1024 / 1024).toFixed(2)} MB`,
    );
  }

  console.log(
    `Normalized ${queue.length} materials — ${(totalBytes / 1024 / 1024).toFixed(2)} MB total at ${options.resolution}.`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
