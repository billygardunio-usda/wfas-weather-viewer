# WFAS Weather Viewer

A static OpenLayers viewer for observation and forecast layers from the
[WFAS GeoServer](https://wfas.firenet.gov/geoserver/web/).

## Features

- Discovers URMA, RTMA, GFS, NDFD, NBM, GMAO, ICON, CFS, and RAP layers.
- Filters selectable layers to valid CONUS coverage.
- Displays multiple layers with visibility, opacity, ordering, and legends.
- Provides shaded wind speed, direction arrows, and isotachs in mph.
- Uses one shared timeline with Past/Forecast and Now indicators.
- Shows values for every visible layer through an authenticated, restricted API.

## Local Development

```powershell
npm install
npm install --prefix api
npm run dev
```

Validate with:

```powershell
npm test
npm run build
npm run preview
```

The Vite development server does not emulate authentication or Azure Functions. Use
[SWA CLI](https://azure.github.io/static-web-apps-cli/) separately if end-to-end local
API testing is needed; no SWA CLI dependency is required by this repository.

## Azure Static Web Apps deployment

1. Create an Azure Static Web App linked to this repository and the `main` branch.
2. Add its deployment token as the repository Actions secret
   `AZURE_STATIC_WEB_APPS_API_TOKEN`. Never put the token in source or workflow text.
3. Configure Microsoft Entra ID for the Static Web App and assign intended users or
   groups. The committed route permits the built-in `authenticated` role. To require
   an application role such as `wfas-users`, replace that role in
   `public/staticwebapp.config.json` after configuring role assignment in Azure.
4. Push to `main` or manually run **Deploy Azure Static Web App**.

The workflow runs tests, refreshes `public/catalog.json` through the existing
`prebuild`, builds `dist`, and deploys `dist` with `api` as the Functions location.
It also deploys pull-request preview environments and rebuilds daily so model
availability and retained timestamps stay current. The deployment token must be
available to each event that deploys; fork previews may be skipped by GitHub's secret
policy.

## Map Values

Clicking the map places a marker and requests each visible layer's value from the
same-origin `/api/wfas-values` function. The inspector preserves layer, location, and
time context and reports sign-in, timeout, upstream, and response errors inline.
WFAS values remain in their native source units.

## API security boundary

Azure Static Web Apps enforces authentication before the function runs. The function
then accepts only JSON `POST` requests containing one layer in an approved WFAS model
workspace, an `EPSG:3857` coordinate inside the CONUS extent, bounded resolution and
image dimensions, and an optional UTC timestamp. It constructs the fixed WFAS WMS
`GetFeatureInfo` URL itself; callers cannot supply a host or target URL. Upstream
requests time out after five seconds and responses are limited to 64 KiB.

No runtime environment variables or WFAS credentials are required. If WFAS requires
a stable outbound address or private networking, use a separately managed Azure
Function with the required network integration instead of the managed Static Web
Apps API. Azure subscription approval, Entra role assignment, and organizational
authorization remain portal/governance setup outside this repository.

## Data Behavior

The app does not retain weather rasters. It reads WMS capabilities during each build
and requests visible tiles directly from WFAS. Layers must advertise an extent that
intersects CONUS (`-125, 24, -66, 50`). Models and dates appear or disappear as the
upstream service changes.