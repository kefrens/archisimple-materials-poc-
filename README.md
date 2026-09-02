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

src/
  material-schema.ts

scripts/
  fetch-polyhaven.ts
  normalize-material.ts
  build-library.ts

catalog.json
```

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
- [ ] Implement Poly Haven metadata/download ingestion
- [ ] Add 10–20 representative materials
- [ ] Generate `catalog.json`
- [ ] Build a small visual material browser
- [ ] Measure bundle size at 1K and 2K resolutions
- [ ] Define the format for importing the library into ArchiSimple

## Status

Early proof of concept.
