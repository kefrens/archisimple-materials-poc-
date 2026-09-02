# ArchiSimple Materials PoC

Proof of concept for a bundled architectural material library for ArchiSimple.

## Goal

Validate a pipeline that can:

1. ingest CC0 PBR materials from upstream libraries such as Poly Haven;
2. normalize them into a stable ArchiSimple material format;
3. build a searchable catalog;
4. keep source and license provenance alongside every asset;
5. eventually bundle the normalized library with ArchiSimple.

## Initial scope

The first PoC deliberately avoids trying to mirror an entire upstream library. It focuses on a small architectural starter set:

- concrete
- plaster / render
- brick
- stone
- wood
- tile

The target is a small, curated set of high-quality materials that can later be used consistently for walls, floors, ceilings, exteriors, roofs, and site surfaces.

## Repository layout

```text
materials/
  <material-id>/
    material.json
    preview.webp
    maps/
      basecolor.webp
      normal.webp
      roughness.webp
      height.webp
      ao.webp

src/
  material-schema.ts

scripts/
  fetch-polyhaven.ts
  normalize-material.ts
  build-library.ts

catalog.json
```

## Pipeline

```bash
npm run fetch:polyhaven   # resolve the curated asset list against the Poly Haven API
npm run normalize         # download maps, convert to WebP, write materials/<id>/
npm run build:catalog     # validate, then aggregate into catalog.json
npm run validate          # validate only, write nothing (CI-friendly)
npm run typecheck
```

`fetch:polyhaven` writes `materials/polyhaven-selection.json`, a discovery
manifest that records the display name, real-world dimensions, authors and
per-map download URLs for each curated asset. Selection is an explicit
allowlist in `scripts/fetch-polyhaven.ts` rather than a keyword search, because
the upstream index mixes architectural surfaces with fabric, terrain and bark
scans.

`normalize` accepts options:

```bash
npm run normalize -- --resolution 1k    # default is 2k
npm run normalize -- brick-red-01       # a single material
npm run normalize -- --force            # re-encode existing maps
```

Downloads are cached under `.tmp/` (gitignored), so re-runs only re-encode.

## Material model

Materials are first-class assets rather than standalone images. The metadata records the provider, source asset, license, physical dimensions, and available PBR maps.

Example:

```json
{
  "id": "concrete-light-01",
  "name": "Light Concrete",
  "category": "concrete",
  "source": {
    "provider": "polyhaven",
    "asset": "example",
    "license": "CC0"
  },
  "physicalSize": {
    "width": 2,
    "height": 2,
    "unit": "m"
  },
  "maps": {
    "baseColor": "maps/basecolor.webp",
    "normal": "maps/normal.webp",
    "roughness": "maps/roughness.webp",
    "height": "maps/height.webp"
  }
}
```

## Upstream sources

The PoC is designed around sources whose redistribution terms are compatible with bundling into an application. Poly Haven is the primary candidate; other CC0 sources such as ambientCG and CGBookcase can be added later as secondary providers.

Keep upstream provenance in the repository even when attribution is not required by the license.

## Roadmap

- [x] Define normalized material schema
- [x] Define initial repository layout
- [x] Implement Poly Haven metadata/download ingestion
- [x] Add 10–20 representative materials
- [x] Generate `catalog.json`
- [x] Measure bundle size at 1K and 2K resolutions
- [x] Validate material entries and fail loudly on incomplete assets
- [ ] Build a small visual material browser
- [ ] Define the format for importing the library into ArchiSimple

## Validation

`src/validate-material.ts` holds the runtime validator. It has no npm or Node
built-in dependencies, so the consuming application can reuse it to check a
catalog it loads at runtime; filesystem checks live in the build script.

Every directory under `materials/` is expected to be a normalized material.
The build reports all problems across all materials in one pass and then
refuses to write, rather than dropping bad entries silently:

- required keys, kebab-case ids, and ids matching their directory name
- categories against `MATERIAL_CATEGORIES`
- map names against the schema, with `baseColor` mandatory
- map and preview paths being relative and not escaping the material directory
- physical size positive and in metres, `properties` values within 0..1
- every referenced map and preview actually existing on disk

`normalize` runs the same validator before writing each `material.json`, so a
malformed record fails at the point it is produced. A failing build exits
non-zero and leaves the existing `catalog.json` untouched.

## Bundle size

12 materials, 5 maps each, WebP. Roughness, height and ambient occlusion are
stored single-channel; normal maps get a higher quality budget because
compression artifacts there read as lighting noise.

| Resolution | Total | Per material (avg) |
| ---------- | ----- | ------------------ |
| 1K         | 9.0 MB  | 0.75 MB |
| 2K         | 39.3 MB | 3.27 MB |

## Status

The ingestion pipeline is working end to end: 12 curated CC0 materials
(two each of concrete, plaster, brick, stone, wood and tile) normalize into
`materials/<id>/` and build a populated `catalog.json`.
