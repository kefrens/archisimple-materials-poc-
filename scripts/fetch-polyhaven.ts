import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const API_BASE = "https://api.polyhaven.com";
const OUTPUT_DIR = join(process.cwd(), "materials");

const TARGET_CATEGORIES = [
  "concrete",
  "plaster",
  "brick",
  "stone",
  "wood",
  "tile",
] as const;

interface PolyHavenAsset {
  name?: string;
  categories?: string[];
  tags?: string[];
  type?: string;
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Poly Haven request failed (${response.status}): ${url}`);
  }
  return response.json() as Promise<T>;
}

function matchesCategory(asset: PolyHavenAsset): boolean {
  const haystack = [asset.name, ...(asset.categories ?? []), ...(asset.tags ?? [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return TARGET_CATEGORIES.some((category) => haystack.includes(category));
}

async function main() {
  console.log("Fetching Poly Haven texture index...");

  const assets = await getJson<Record<string, PolyHavenAsset>>(
    `${API_BASE}/assets?type=textures`,
  );

  const candidates = Object.entries(assets)
    .filter(([, asset]) => matchesCategory(asset))
    .map(([id, asset]) => ({
      id,
      name: asset.name ?? id,
      categories: asset.categories ?? [],
      tags: asset.tags ?? [],
      source: {
        provider: "polyhaven",
        asset: id,
        license: "CC0",
        url: `https://polyhaven.com/a/${id}`,
      },
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(
    join(OUTPUT_DIR, "polyhaven-selection.json"),
    `${JSON.stringify(
      {
        provider: "polyhaven",
        license: "CC0",
        fetchedAt: new Date().toISOString(),
        count: candidates.length,
        materials: candidates,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  console.log(`Found ${candidates.length} architectural texture candidates.`);
  for (const material of candidates.slice(0, 20)) {
    console.log(`- ${material.id}: ${material.name}`);
  }

  if (candidates.length === 0) {
    throw new Error("No architectural texture candidates found in Poly Haven index.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
