/**
 * Build the normalized material catalog.
 *
 * The PoC keeps this script dependency-free so the catalog format can be
 * validated before choosing a specific web application/tooling stack.
 */

import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const materialsDir = join(process.cwd(), "materials");
const outputFile = join(process.cwd(), "catalog.json");

async function main() {
  let entries: string[] = [];

  try {
    entries = await readdir(materialsDir);
  } catch {
    // An empty materials directory is a valid initial PoC state.
  }

  const materials = [];

  for (const entry of entries) {
    try {
      const raw = await readFile(join(materialsDir, entry, "material.json"), "utf8");
      materials.push(JSON.parse(raw));
    } catch {
      // Ignore directories that are not normalized material assets yet.
    }
  }

  materials.sort((a, b) => a.id.localeCompare(b.id));

  await writeFile(
    outputFile,
    `${JSON.stringify({ version: 1, materials }, null, 2)}\n`,
    "utf8",
  );

  console.log(`Built catalog with ${materials.length} materials.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
