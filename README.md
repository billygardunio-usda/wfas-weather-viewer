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

1. Open **Settings > Pages** and choose **GitHub Actions** as the source.
2. Push to `main` or run **Actions > Deploy GitHub Pages**.

The Pages workflow tests and builds the site on pushes to `main`. It also runs daily
to refresh GeoServer model availability and retained timestamps.

## Map Values

Clicking the map places a marker and creates an **Open WFAS value** link for each
visible layer. Each link opens GeoServer's public `GetFeatureInfo` result in a
separate tab, avoiding cross-origin response access without a proxy or cloud account.
WFAS displays sampled values in their native source units.

This deployment assumes the WFAS WMS and `GetFeatureInfo` endpoints remain publicly
accessible without credentials. GitHub Pages contains no backend, secrets, or access
control; if WFAS later restricts these endpoints, value lookup will require an
approved server-side service.

## Data Behavior

The app does not retain weather rasters. It reads WMS capabilities during each build
and requests visible tiles directly from WFAS. Layers must advertise an extent that
intersects CONUS (`-125, 24, -66, 50`). Models and dates appear or disappear as the
upstream service changes.