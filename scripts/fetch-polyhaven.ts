/**
 * Poly Haven ingestion entry point.
 *
 * Next step: query Poly Haven's public asset metadata, select the required
 * architectural assets, download the chosen resolution, and write normalized
 * material.json files while preserving upstream provenance.
 */

const categories = [
  "concrete",
  "plaster",
  "brick",
  "stone",
  "wood",
  "tile",
] as const;

console.log("Poly Haven ingestion PoC");
console.log("Target categories:", categories.join(", "));
console.log("Downloader implementation is the next PoC step.");
