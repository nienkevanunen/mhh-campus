# MHH Campus Map

This project is a simple web map of the Medizinische Hochschule Hannover (MHH) campus.

It is meant as a practical internal tool: easier orientation for visitors, patients, students, and staff, plus a lightweight base that can be improved over time.

## What It Includes

- Interactive campus map with buildings and points of interest (POIs)
- Search (for example building names, clinics, parking)
- Category filters
- Popups with useful metadata (address, source, last verification date)
- Automatic fallback to Leaflet if WebGL is not available

## Why This Exists

Campus maps are often either static PDFs or hard to keep updated.  
This repository keeps things transparent and maintainable:

- data is stored in plain GeoJSON files
- updates can be run with scripts
- the final app is static and easy to host

## Seasonal Overlay Storytelling

Seasonal visuals can make a campus map more persuasive for prospective students and employees who are considering relocation.  
Leaves changing color in fall, winter snow cover, and spring/summer greenery help people picture day-to-day campus life, not just navigation routes.

For example, a college like Skidmore can keep its full wayfinding map (labels, search, routing) while applying a seasonal overlay that reflects the same campus across different times of year.  
That subtle visual layer can help visitors compare campuses and imagine themselves living and studying there.

## Quick Start

Requirements:

- Node.js 18+ (Node 20 recommended)
- npm

Install and run locally:

```bash
npm install
npm run dev
```

Then open the local URL shown in the terminal (usually `http://localhost:5173`).

## Data and Update Workflow

Main data files used by the app:

- `public/data/mhh-poi.geojson`
- `public/data/mhh-buildings.geojson`

Source/update scripts:

- `npm run fetch-osm` -> fetches raw OSM data from Overpass and writes:
  - `scripts/osm-overpass.raw.json`
  - `scripts/osm-export.example.geojson`
- `npm run prepare-data` -> normalizes/enriches features and writes:
  - `data/mhh-poi.geojson`
  - `data/mhh-buildings.geojson`
  - `public/data/mhh-poi.geojson`
  - `public/data/mhh-buildings.geojson`

Recommended refresh flow:

```bash
npm run fetch-osm
npm run prepare-data
```

## Notes for MHH Use

- OSM is the baseline, but some entries are manually enriched using verified MHH/public sources.
- Before publishing updates, quickly spot-check key locations (major clinics, parking, transport stops).
- If something is missing or wrong, the easiest fix is to improve the source data and rerun `npm run prepare-data`.

## Build and Deploy

Create a production build:

```bash
# set this for production so robots.txt + sitemap.xml contain the real domain
export VITE_SITE_URL="https://your-domain.example"
npm run build
```

For your GitHub Pages target (`https://nienkevanunen.github.io/mhh-campus/`), use:

```bash
npm run build:gh-pages
```

Preview the production build locally:

```bash
npm run preview
```

This project outputs static files in `dist/`, so it can be hosted on GitHub Pages, Vercel, or any static web server.

## SEO Setup

To make the page easier to discover by search engines:

- the app includes richer HTML metadata (description, Open Graph, Twitter, structured data)
- `npm run build` now generates `dist/robots.txt` and `dist/sitemap.xml`
- set `VITE_SITE_URL` in your deploy environment (for example `https://campus-map.example`) so sitemap links use the correct public URL
- for GitHub Pages project sites, also set `VITE_BASE_PATH` to your repo path (for example `/mhh-campus/`)
