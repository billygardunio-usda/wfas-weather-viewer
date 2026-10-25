# TODO

## Goal
Build and publish a static WFAS weather viewer for CONUS observations and forecasts.

## Completed

- [x] Build a responsive Vite and OpenLayers application.
- [x] Discover supported WFAS models, variables, styles, extents, and timestamps.
- [x] Filter malformed or non-CONUS coverage.
- [x] Support simultaneous layers with visibility, opacity, ordering, and legends.
- [x] Synchronize all layers to one timeline with playback and forecast indicators.
- [x] Add shaded wind speed, direction arrows, and isotachs.
- [x] Keep the timeline visible while the active-layer list scrolls.
- [x] Add map-click inspection through a restricted Cloudflare Worker.
- [x] Display temperature in Fahrenheit, wind in mph, and precipitation in inches.
- [x] Add GitHub Pages and Cloudflare Worker deployment workflows.
- [x] Add focused tests and production-build validation.

## Notes

- Available models and dates are controlled by the live WFAS GeoServer.
- The catalog refreshes during local startup/build and daily on GitHub Pages.
- Click values require the Worker URL in `FEATURE_INFO_PROXY_URL` when deployed.