# WFAS Weather Viewer

A static OpenLayers viewer for observation and forecast layers from the
[WFAS GeoServer](https://wfas.firenet.gov/geoserver/web/) and
[NCEP NOMADS](https://nomads.ncep.noaa.gov/).
A separate **Hawaii Climate Explorer** is available at
<https://billygardunio-usda.github.io/wfas-weather-viewer/hawaii/>.
The original WFAS interface remains at the site root.

## Features

- Discovers URMA, RTMA, GFS, NDFD, NBM, GMAO, ICON, CFS, RAP, and curated
  WFAS fire-danger layers.
- Filters selectable layers to valid CONUS coverage.
- Displays multiple layers with visibility, opacity, ordering, and legends.
- Provides shaded wind speed, direction arrows, and isotachs in mph.
- Uses one shared timeline with Past/Forecast and Now indicators.
- Creates direct WFAS value links for every visible layer when the map is clicked.
- Selects between WFAS gridded products and reduced NOMADS GFS, HRRR, RAP,
  and NAM CONUS Nest grids.
- Offers temperature, relative humidity, wind, gust, precipitation, cloud cover,
  and CAPE when advertised by each NOMADS model.
- Animates NOMADS 10 m U/V winds with browser-rendered particles.
- Offers WFAS BI, ERC, SFDI, and 1000-hour fuel-moisture percentile products
  when advertised by GeoServer.
- Derives five days of daily URMA maximum/minimum temperature and humidity,
  maximum wind speed, median wind direction, precipitation duration, and total
  precipitation from hourly WCS coverages.

## Hawaii Climate Data Portal

Open the separate **Hawaii Climate Explorer** at `/hawaii/`. It loads daily/monthly
rainfall and mean, maximum, or minimum temperature GeoTIFFs independently of
WFAS and NOMADS. Enter your own HCDP API token,
choose a variable, daily or monthly period, date, and statewide or county extent,
then select **Add HCDP map**. The map zooms to the downloaded coverage. Use
**Active layers** for visibility, opacity, ordering, and removal; click the map
for rainfall in millimeters or temperature in degrees Celsius.

Dates refer to Hawaii Standard Time (UTC-10). The initial date is the previous
completed Hawaii day/month, not a guarantee of upstream availability. Missing
maps produce an explicit message; try an earlier date. Daily contemporary
rainfall is experimental. Colors use fixed scales (rainfall 0–250 mm,
temperature -10–35 °C) and saturate outside those limits; inspected values are
not clipped. No-data cells remain transparent. A WebGL-capable browser is required.

Each added map is a snapshot for its selected period. Its timeline date is
the day or first of the month in HST, and it is hidden at other snapshots.
Add other dates to compare snapshots through the Hawaii-only timeline.
Daily/monthly map values are not instantaneous observations.

The browser sends the token only in the `Authorization: Bearer …` header to
`https://api.hcdp.ikewai.org/raster`. The token field is memory-only: it is not
stored in local/session storage, embedded in a URL, or included in the build.
**Clear token** clears the field and cancels any in-progress request; already
downloaded maps remain until removed or the page is reloaded. Do not commit
tokens, add them to `VITE_*` environment variables, or share them in issues.
Visitors to GitHub Pages supply their own tokens; there is no shared service key.

This integration follows the
[HCDP API specification](https://github.com/HCDP/hcdp_api_docs/blob/master/hcdp_api.yaml)
and uses its contemporary rainfall (`production=new`) and temperature
(`aggregation=mean|max|min`) filters. It relies on HCDP allowing cross-origin
requests with the Authorization header. Network, access, missing-data, and
rate-limit errors appear in the Hawaii interface. It does not load or depend on
the WFAS catalogs and makes no WFAS or NOMADS requests.
No token or backend deployment is needed to build the interface; authenticated
live access requires your valid HCDP token.

## Local Development

```powershell
npm install
npm run dev
```

Visit `http://localhost:5173/hawaii/` for the Hawaii interface, or `/` for WFAS.
Vite builds both HTML entry points; the Pages workflow deploys both together.

The committed NOMADS catalog is populated by the Pages workflow. To refresh it
locally, install the Python `eccodes` package and run:

```powershell
python -m pip install -r requirements-nomads.txt
npm run sync-nomads
```

Daily URMA summaries additionally require the refreshed WFAS catalog:

```powershell
npm run sync-catalog
npm run sync-urma-daily
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
to refresh GeoServer model availability, retained timestamps, and a constrained
NOMADS GFS dataset.

## Map Values

Clicking the map places a marker and creates an **Open WFAS value** link for each
visible layer. Each link opens GeoServer's public `GetFeatureInfo` result in a
separate tab, avoiding cross-origin response access without a proxy or cloud account.
WFAS displays sampled values in their native source units.

The **WFAS Fire Danger** model groups the confirmed public BI percentile, ERC
percentile, Severe Fire Danger Index, and 1000-hour fuel-moisture products. These
are percentile or classified products where indicated by WFAS; they should not be
interpreted as raw BI or ERC values unless the layer title explicitly says so.
Time-enabled fire-danger products open on the advertised default, which WFAS
currently publishes as Day 0 (today), followed by Days 1–6.

This deployment assumes the WFAS WMS and `GetFeatureInfo` endpoints remain publicly
accessible without credentials. GitHub Pages contains no backend, secrets, or access
control; if WFAS later restricts these endpoints, value lookup will require an
approved server-side service.

## NOMADS processing

The deployment workflow requests recent GFS, HRRR, RAP, and NAM CONUS Nest cycles
through their NOMADS GRIB filters. It limits downloads to CONUS and selected surface
fire-weather attributes: 2 m temperature and relative humidity, 10 m U/V wind,
surface gust, accumulated precipitation, total cloud cover, and surface CAPE.
Only fields returned by a model are shown. The build reduces these fields to a
one-degree browser grid and publishes static JSON assets. This keeps GitHub Pages
independent of runtime NOMADS CORS behavior and avoids shipping full GRIB2 files to
browsers.

The workflow caches the last successful NOMADS dataset. If a refresh is temporarily
unavailable, Pages can continue deploying the cached data; the source timestamps
remain visible through the shared timeline. Rapid-refresh products retain all valid
forecast hours published at build time rather than failing the whole model when a
later forecast file is not yet available.

Animated particles show wind flow while the shaded layer shows speed. Particle
animation is an interpretive display; source values remain available through map
inspection. Forecasts are sampled at three-hour intervals with shorter ranges for
rapid-refresh regional models so scheduled builds and Pages storage remain bounded.

## Daily URMA summaries

The Pages workflow requests reduced CONUS GeoTIFF coverages from WFAS WCS for
hourly URMA temperature, relative humidity, wind speed, wind direction, and total
precipitation. It publishes only 120×53 JSON summary grids for the five most recent
completed UTC days having all 24 common hourly observations; source GeoTIFFs are
temporary and are not retained.

Temperature is converted from Kelvin to degrees Fahrenheit and precipitation from
millimeters to inches. Daily products use cell-wise maxima/minima, maximum wind
speed, circular median wind direction, hourly precipitation counts at or above
0.01 inch, and summed precipitation. These are derived products and are labeled
separately from native WFAS layers.

## Predictive Service Area indices

The NOMADS grid contract is also the starting point for PSA aggregation. A subsequent
build step can intersect grid-cell centers with an authoritative PSA boundary
GeoJSON, calculate configured statistics by valid time, and publish a small
`psa-indices.json` dataset plus a choropleth layer.

Index definitions should remain configuration-driven and versioned with provenance:
input source/model/level, formula, units, temporal window, missing-data threshold,
aggregation statistic, classification breaks, and effective date. Candidate first
products are maximum wind, minimum relative humidity, precipitation accumulation,
and a reviewed composite fire-weather index. Operational labels should not be added
until the authoritative PSA boundaries and index formulas are approved.

## Data Behavior

The app does not retain source WFAS weather rasters. It reads WMS capabilities during
each build and requests visible tiles directly from WFAS. NOMADS and derived URMA
grids are retained only as reduced static JSON. Layers must intersect CONUS
(`-125, 24, -66, 50`). Models and dates appear or disappear as upstream services
change. WFAS catalog history is limited to five prior UTC calendar days while all
advertised future times remain available.