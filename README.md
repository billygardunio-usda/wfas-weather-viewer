# WFAS Weather Viewer

A static OpenLayers viewer for observation and forecast layers from the
[WFAS GeoServer](https://wfas.firenet.gov/geoserver/web/).

## Features

- Discovers URMA, RTMA, GFS, NDFD, NBM, GMAO, ICON, CFS, and RAP layers.
- Filters selectable layers to valid CONUS coverage.
- Displays multiple layers with visibility, opacity, ordering, and legends.
- Provides shaded wind speed, direction arrows, and isotachs in mph.
- Uses one shared timeline with Past/Forecast and Now indicators.
- Creates direct WFAS value links for every visible layer when the map is clicked.

## Local Development

```powershell
npm install
npm run dev
```

Validate with:

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

## Map Values

Clicking the map places a marker and creates an **Open WFAS value** link for each
visible layer. Each link opens GeoServer's result in a separate tab, avoiding the
cross-origin restriction without a proxy or external cloud service. WFAS displays
these sampled values in their native source units.

## Data Behavior

The app does not retain weather rasters. It reads WMS capabilities during each build
and requests visible tiles directly from WFAS. Layers must advertise an extent that
intersects CONUS (`-125, 24, -66, 50`). Models and dates appear or disappear as the
upstream service changes.