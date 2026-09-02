/**
 * Runtime validation for normalized material records.
 *
 * This module is deliberately free of both npm and Node built-in dependencies
 * so the consuming application can reuse it to validate a catalog it loads at
 * runtime. Checks that need the filesystem (does a referenced map actually
 * exist?) live in `scripts/build-library.ts` instead.
 */

import {
  MATERIAL_CATEGORIES,
  isMaterialCategory,
  type Material,
  type MaterialMaps,
} from "./material-schema.ts";

export interface ValidationIssue {
  /** Dotted path to the offending field, e.g. `source.license`. */
  path: string;
  message: string;
}

/** Map keys recognised by the schema, in the order previews should prefer. */
export const MAP_NAMES = [
  "baseColor",
  "normal",
  "roughness",
  "metallic",
  "height",
  "ambientOcclusion",
] as const satisfies readonly (keyof MaterialMaps)[];

/** Lowercase kebab-case, which is what the curated ids use. */
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Map and preview paths are bundled alongside `material.json`, so they must be
 * relative and must not escape the material directory.
 */
function checkRelativePath(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isNonEmptyString(value)) {
    issues.push({ path, message: "must be a non-empty string" });
    return;
  }
  if (value.startsWith("/") || /^[a-zA-Z]+:/.test(value)) {
    issues.push({ path, message: `must be a relative path, got "${value}"` });
    return;
  }
  if (value.split("/").includes("..")) {
    issues.push({ path, message: `must not escape the material directory, got "${value}"` });
  }
}

function checkUnitInterval(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    issues.push({ path, message: "must be a finite number" });
  } else if (value < 0 || value > 1) {
    issues.push({ path, message: `must be between 0 and 1, got ${value}` });
  }
}

function validateSource(source: unknown, issues: ValidationIssue[]): void {
  if (!isPlainObject(source)) {
    issues.push({ path: "source", message: "is required and must be an object" });
    return;
  }

  for (const key of ["provider", "asset", "license"] as const) {
    if (!isNonEmptyString(source[key])) {
      issues.push({ path: `source.${key}`, message: "is required and must be a non-empty string" });
    }
  }

  if (source.url !== undefined && !isNonEmptyString(source.url)) {
    issues.push({ path: "source.url", message: "must be a non-empty string when present" });
  }

  if (source.authors !== undefined) {
    if (!isPlainObject(source.authors)) {
      issues.push({ path: "source.authors", message: "must be an object of name -> role" });
    } else {
      for (const [author, role] of Object.entries(source.authors)) {
        if (!isNonEmptyString(role)) {
          issues.push({ path: `source.authors.${author}`, message: "must be a non-empty string" });
        }
      }
    }
  }
}

function validateMaps(maps: unknown, issues: ValidationIssue[]): void {
  if (!isPlainObject(maps)) {
    issues.push({ path: "maps", message: "is required and must be an object" });
    return;
  }

  for (const [name, value] of Object.entries(maps)) {
    if (!(MAP_NAMES as readonly string[]).includes(name)) {
      issues.push({
        path: `maps.${name}`,
        message: `is not a known map (expected one of: ${MAP_NAMES.join(", ")})`,
      });
      continue;
    }
    checkRelativePath(value, `maps.${name}`, issues);
  }

  // A material without a base colour cannot be rendered at all, so it is the
  // one map treated as mandatory rather than optional.
  if (!isNonEmptyString(maps.baseColor)) {
    issues.push({ path: "maps.baseColor", message: "is required" });
  }
}

function validatePhysicalSize(size: unknown, issues: ValidationIssue[]): void {
  if (!isPlainObject(size)) {
    issues.push({ path: "physicalSize", message: "must be an object when present" });
    return;
  }

  for (const key of ["width", "height"] as const) {
    const value = size[key];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      issues.push({ path: `physicalSize.${key}`, message: "must be a finite number" });
    } else if (value <= 0) {
      issues.push({ path: `physicalSize.${key}`, message: `must be greater than 0, got ${value}` });
    }
  }

  if (size.unit !== "m") {
    issues.push({ path: "physicalSize.unit", message: `must be "m", got ${JSON.stringify(size.unit)}` });
  }
}

function validateProperties(properties: unknown, issues: ValidationIssue[]): void {
  if (!isPlainObject(properties)) {
    issues.push({ path: "properties", message: "must be an object when present" });
    return;
  }
  for (const key of ["roughness", "metallic"] as const) {
    if (properties[key] !== undefined) checkUnitInterval(properties[key], `properties.${key}`, issues);
  }
}

/**
 * Validate a parsed `material.json`. Returns every problem found rather than
 * stopping at the first, so a broken asset can be fixed in one pass.
 */
export function validateMaterial(value: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!isPlainObject(value)) {
    return [{ path: ".", message: "must be a JSON object" }];
  }

  if (!isNonEmptyString(value.id)) {
    issues.push({ path: "id", message: "is required and must be a non-empty string" });
  } else if (!ID_PATTERN.test(value.id)) {
    issues.push({ path: "id", message: `must be lowercase kebab-case, got "${value.id}"` });
  }

  if (!isNonEmptyString(value.name)) {
    issues.push({ path: "name", message: "is required and must be a non-empty string" });
  }

  if (!isMaterialCategory(value.category)) {
    issues.push({
      path: "category",
      message:
        `must be one of: ${MATERIAL_CATEGORIES.join(", ")} ` +
        `(got ${JSON.stringify(value.category)})`,
    });
  }

  validateSource(value.source, issues);
  validateMaps(value.maps, issues);

  if (value.physicalSize !== undefined) validatePhysicalSize(value.physicalSize, issues);
  if (value.properties !== undefined) validateProperties(value.properties, issues);
  if (value.preview !== undefined) checkRelativePath(value.preview, "preview", issues);

  for (const key of ["description", "resolution"] as const) {
    if (value[key] !== undefined && !isNonEmptyString(value[key])) {
      issues.push({ path: key, message: "must be a non-empty string when present" });
    }
  }

  if (value.tags !== undefined) {
    if (!Array.isArray(value.tags)) {
      issues.push({ path: "tags", message: "must be an array of strings" });
    } else {
      value.tags.forEach((tag, index) => {
        if (!isNonEmptyString(tag)) {
          issues.push({ path: `tags[${index}]`, message: "must be a non-empty string" });
        }
      });
    }
  }

  return issues;
}

export function formatIssues(issues: readonly ValidationIssue[]): string {
  return issues.map((issue) => `  - ${issue.path} ${issue.message}`).join("\n");
}

/** Validate and narrow, throwing on the first invalid material. */
export function assertMaterial(value: unknown, label: string): Material {
  const issues = validateMaterial(value);
  if (issues.length > 0) {
    throw new Error(`${label} is not a valid material:\n${formatIssues(issues)}`);
  }
  return value as Material;
}

/** Every bundled file a material references, relative to its directory. */
export function referencedFiles(material: Material): string[] {
  const files = Object.values(material.maps).filter(isNonEmptyString);
  if (material.preview) files.push(material.preview);
  return files;
}
