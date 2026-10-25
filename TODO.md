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
- [x] Add map-click inspection with direct WFAS value links.
- [x] Display temperature in Fahrenheit, wind in mph, and precipitation in inches.
- [x] Add a GitHub Pages deployment workflow.
- [x] Add focused tests and production-build validation.

## Direct Value Links

- [x] Replace proxy-based click inspection with direct WFAS GetFeatureInfo links.
- [x] Open each visible layer's value result in a separate browser tab without CORS.
- [x] Remove Cloudflare Worker code, workflow, dependencies, and configuration.
- [x] Update documentation, tests, and the deployed GitHub Pages site.

## Notes

- Available models and dates are controlled by the live WFAS GeoServer.
- The catalog refreshes during local startup/build and daily on GitHub Pages.
- Clicked values open directly from WFAS in native source units.