import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const API_BASE = "https://api.polyhaven.com";
const OUTPUT_DIR = join(process.cwd(), "materials");
const USER_AGENT = "ArchiSimple-Materials-PoC/0.1 (+https://github.com/kefrens/archisimple-materials-poc-)";

const TARGET_CATEGORIES = ["concrete", "plaster", "brick", "stone", "wood", "tile"] as const;

interface PolyHavenAsset {
  name?: string;
  categories?: string[];
  tags?: string[];
  type?: string;
}

interface PolyHavenFile {
  url: string;
  md5?: string;
  size?: number;
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!response.ok) throw new Error(`Poly Haven request failed (${response.status}): ${url}`);
  return response.json() as Promise<T>;
}

function matchesCategory(asset: PolyHavenAsset): boolean {
  const haystack = [asset.name, ...(asset.categories ?? []), ...(asset.tags ?? [])].filter(Boolean).join(" ").toLowerCase();
  return TARGET_CATEGORIES.some((category) => haystack.includes(category));
}

function collectFiles(value: unknown): PolyHavenFile[] {
  const files: PolyHavenFile[] = [];
  const visit = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    for (const child of Object.values(node)) {
      if (child && typeof child === "object" && "url" in child && typeof child.url === "string") {
        files.push(child as PolyHavenFile);
      } else visit(child);
    }
  };
  visit(value);
  return files;
}

async function main() {
  console.log("Fetching Poly Haven texture index...");
  const assets = await getJson<Record<string, PolyHavenAsset>>(`${API_BASE}/assets?type=textures`);
  const candidates = Object.entries(assets)
    .filter(([, asset]) => matchesCategory(asset))
    .map(([id, asset]) => ({
      id,
      name: asset.name ?? id,
      categories: asset.categories ?? [],
      tags: asset.tags ?? [],
      source: { provider: "polyhaven", asset: id, license: "CC0", url: `https://polyhaven.com/a/${id}` },
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const enriched = [];
  for (const candidate of candidates.slice(0, 20)) {
    const files = await getJson<unknown>(`${API_BASE}/files/${candidate.id}`);
    enriched.push({ ...candidate, files: collectFiles(files) });
    console.log(`✓ ${candidate.id}: discovered ${collectFiles(files).length} files`);
  }

  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(join(OUTPUT_DIR, "polyhaven-selection.json"), `${JSON.stringify({ provider: "polyhaven", license: "CC0", fetchedAt: new Date().toISOString(), count: enriched.length, materials: enriched }, null, 2)}\n`, "utf8");
  console.log(`Saved ${enriched.length} candidates.`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
