# WFAS Weather Viewer

A static OpenLayers viewer for observation and forecast layers from the
[WFAS GeoServer](https://wfas.firenet.gov/geoserver/web/).

## Features

- Discovers URMA, RTMA, GFS, NDFD, NBM, GMAO, ICON, CFS, and RAP layers.
- Filters selectable layers to valid CONUS coverage.
- Displays multiple layers with visibility, opacity, ordering, and legends.
- Provides shaded wind speed, direction arrows, and isotachs in mph.
- Uses one shared timeline with Past/Forecast and Now indicators.
- Inspects all visible layers on map click through a restricted Cloudflare Worker.
- Displays temperature in °F, wind in mph, and precipitation in inches.

## Local Development

```powershell
npm install
npm run worker:dev
```

In a second terminal:

```powershell
npm run dev
```

The viewer automatically discovers the local Worker on port `8787`. Validate with:

```powershell
npm test
npm run build
npm run preview
```

## GitHub Pages

1. Create an empty public GitHub repository named `wfas-weather-viewer`.
2. Push this folder to its `main` branch.
3. Open **Settings > Pages** and choose **GitHub Actions** as the source.
4. Run **Actions > Deploy GitHub Pages**.

The Pages workflow tests and builds the site on pushes to `main`. It also runs daily
to refresh GeoServer model availability and retained timestamps.

## Cloudflare Worker

GitHub Pages cannot read WFAS feature values directly because GeoServer does not
permit cross-origin JSON requests. The included Worker accepts only WFAS WMS
`GetFeatureInfo` requests.

1. Create a free Cloudflare account and initialize **Workers & Pages**.
2. Create an API token using the **Edit Cloudflare Workers** template.
3. Copy the account ID from the Cloudflare dashboard.
4. In GitHub **Settings > Secrets and variables > Actions > Secrets**, add:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
5. Run **Actions > Deploy Feature Info Worker**.
6. Copy the resulting `https://...workers.dev` URL.
7. In GitHub Actions **Variables**, add `FEATURE_INFO_PROXY_URL` with that URL.
8. Run **Deploy GitHub Pages** again.

For production, replace `*` in `ALLOWED_ORIGINS` in `wrangler.jsonc` with the final
GitHub Pages origin.

## Data Behavior

The app does not retain weather rasters. It reads WMS capabilities during each build
and requests visible tiles directly from WFAS. Layers must advertise an extent that
intersects CONUS (`-125, 24, -66, 50`). Models and dates appear or disappear as the
upstream service changes.