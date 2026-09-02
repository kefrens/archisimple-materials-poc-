/**
 * Build the normalized material catalog.
 *
 * The PoC keeps this script dependency-free so the catalog format can be
 * validated before choosing a specific web application/tooling stack.
 *
 *   npm run build:catalog            # validate, then write catalog.json
 *   npm run build:catalog -- --check # validate only, write nothing
 *
 * Every directory under `materials/` is expected to be a normalized material.
 * Anything incomplete, malformed or missing its map files fails the build
 * rather than being dropped from the catalog silently.
 */

import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { Material } from "../src/material-schema.ts";
import {
  formatIssues,
  referencedFiles,
  validateMaterial,
  type ValidationIssue,
} from "../src/validate-material.ts";

const CATALOG_VERSION = 1;
const materialsDir = join(process.cwd(), "materials");
const outputFile = join(process.cwd(), "catalog.json");

interface RejectedMaterial {
  directory: string;
  issues: ValidationIssue[];
}

async function fileExists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

/** Read and validate one material directory. */
async function loadMaterial(
  directory: string,
): Promise<{ material: Material } | { issues: ValidationIssue[] }> {
  const manifestPath = join(materialsDir, directory, "material.json");

  let raw: string;
  try {
    raw = await readFile(manifestPath, "utf8");
  } catch {
    return { issues: [{ path: "material.json", message: "is missing" }] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { issues: [{ path: "material.json", message: `is not valid JSON: ${message}` }] };
  }

  const issues = validateMaterial(parsed);
  if (issues.length > 0) return { issues };

  const material = parsed as Material;

  // The directory name is the catalog's addressing scheme, so a mismatch would
  // make every relative map path in the record resolve against the wrong place.
  if (material.id !== directory) {
    issues.push({
      path: "id",
      message: `must match its directory name "${directory}", got "${material.id}"`,
    });
  }

  for (const file of referencedFiles(material)) {
    if (!(await fileExists(join(materialsDir, directory, file)))) {
      issues.push({ path: file, message: "is referenced but missing on disk" });
    }
  }

  return issues.length > 0 ? { issues } : { material };
}

async function main() {
  const checkOnly = process.argv.slice(2).includes("--check");

  let directories: string[] = [];
  try {
    const entries = await readdir(materialsDir, { withFileTypes: true });
    directories = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    // An absent materials directory is a valid initial PoC state.
  }

  const materials: Material[] = [];
  const rejected: RejectedMaterial[] = [];

  for (const directory of directories) {
    const result = await loadMaterial(directory);
    if ("material" in result) materials.push(result.material);
    else rejected.push({ directory, issues: result.issues });
  }

  // Ids are unique by construction: each must equal its directory name.
  if (rejected.length > 0) {
    console.error(`Refusing to build: ${rejected.length} invalid material(s).\n`);
    for (const { directory, issues } of rejected) {
      console.error(`materials/${directory}:\n${formatIssues(issues)}\n`);
    }
    // Texture maps are generated rather than committed, so a fresh clone hits
    // this before it has ever run the normalize step.
    if (rejected.some(({ issues }) => issues.some((issue) => issue.message.endsWith("missing on disk")))) {
      console.error("Some materials are missing their generated maps. Run `npm run normalize` first.");
    }
    process.exitCode = 1;
    return;
  }

  materials.sort(
    (a, b) => a.category.localeCompare(b.category) || a.id.localeCompare(b.id),
  );

  if (checkOnly) {
    console.log(`Validated ${materials.length} materials. No catalog written (--check).`);
    return;
  }

  await writeFile(
    outputFile,
    `${JSON.stringify(
      {
        version: CATALOG_VERSION,
        generatedAt: new Date().toISOString(),
        count: materials.length,
        materials,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  console.log(`Built catalog with ${materials.length} materials.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
