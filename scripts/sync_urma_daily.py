#!/usr/bin/env python3
import json
import math
import tempfile
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

import numpy
import rasterio

BOUNDS = (-125, 24, -66, 50)
WIDTH = 120
HEIGHT = 53
MIN_HOURS = 18
PRECIPITATION_THRESHOLD_INCHES = 0.01
DERIVATION_VERSION = 1
OUTPUT_DIRECTORY = Path(__file__).resolve().parents[1] / "public" / "urma-daily"
CATALOG_PATH = Path(__file__).resolve().parents[1] / "public" / "catalog.json"
COVERAGES = {
    "temperature": "Temperature",
    "relativeHumidity": "Relative_humidity",
    "windSpeed": "Wind_speed",
    "windDirection": "Wind_direction",
    "precipitation": "Total_precipitation",
}

LAYER_DEFINITIONS = [
    ("maxTemperature", "Maximum temperature", "max_temperature", "°F"),
    ("minTemperature", "Minimum temperature", "min_temperature", "°F"),
    ("maxHumidity", "Maximum relative humidity", "max_relative_humidity", "%"),
    ("minHumidity", "Minimum relative humidity", "min_relative_humidity", "%"),
    ("maxWindSpeed", "Maximum wind speed", "max_wind_speed", "mph"),
    ("medianWindDirection", "Median wind direction", "median_wind_direction", "degrees"),
    ("precipitationDuration", "24-hour precipitation duration", "precipitation_duration", "hours"),
    ("totalPrecipitation", "24-hour total precipitation", "total_precipitation", "in"),
]


def available_dates(catalog):
    by_variable = {
        layer["variable"]: layer["times"]
        for layer in catalog["layers"]
        if layer["model"] == "urma" and layer["variable"] in COVERAGES.values()
    }
    common = None
    for coverage in COVERAGES.values():
        timestamps = set(by_variable.get(coverage, []))
        common = timestamps if common is None else common & timestamps
    grouped = {}
    for timestamp in sorted(common or []):
        grouped.setdefault(timestamp[:10], []).append(timestamp)
    return [(date, timestamps) for date, timestamps in sorted(grouped.items()) if len(timestamps) >= MIN_HOURS][-5:]


def coverage_url(coverage, timestamp):
    params = {
        "service": "WCS",
        "version": "1.0.0",
        "request": "GetCoverage",
        "coverage": f"urma:{coverage}",
        "bbox": ",".join(map(str, BOUNDS)),
        "crs": "EPSG:4326",
        "response_crs": "EPSG:4326",
        "width": WIDTH,
        "height": HEIGHT,
        "format": "GeoTIFF",
        "time": timestamp,
    }
    return f"https://wfas.firenet.gov/geoserver/wcs?{urllib.parse.urlencode(params)}"


def fetch_grid(field, timestamp):
    request = urllib.request.Request(
        coverage_url(COVERAGES[field], timestamp),
        headers={"User-Agent": "wfas-weather-viewer/0.1"},
    )
    with urllib.request.urlopen(request, timeout=90) as response:
        body = response.read()
        if response.status != 200 or "tiff" not in response.headers.get("content-type", ""):
            raise RuntimeError(f"URMA {field} returned HTTP {response.status}.")
    with tempfile.NamedTemporaryFile(suffix=".tif") as temporary_file:
        temporary_file.write(body)
        temporary_file.flush()
        with rasterio.open(temporary_file.name) as dataset:
            values = dataset.read(1, masked=True).filled(numpy.nan).astype(numpy.float32)
    if field == "temperature":
        values /= 10
        values[(values < -100) | (values > 150)] = numpy.nan
    elif field == "relativeHumidity":
        values[(values < 0) | (values > 100)] = numpy.nan
    elif field == "windSpeed":
        values[(values < 0) | (values > 250)] = numpy.nan
    elif field == "windDirection":
        values[(values < 0) | (values > 360)] = numpy.nan
    elif field == "precipitation":
        values[(values < 0) | (values > 50)] = numpy.nan
    return field, timestamp, values


def circular_median(values):
    radians = numpy.deg2rad(values)
    center = numpy.rad2deg(numpy.arctan2(numpy.nanmean(numpy.sin(radians), axis=0), numpy.nanmean(numpy.cos(radians), axis=0)))
    offsets = (values - center + 180) % 360 - 180
    return (center + numpy.nanmedian(offsets, axis=0)) % 360


def rounded_list(values, digits=2):
    return [None if not math.isfinite(float(value)) else round(float(value), digits) for value in values.ravel()]


def derive_fields(stacks):
    temperature = numpy.stack(stacks["temperature"])
    humidity = numpy.stack(stacks["relativeHumidity"])
    wind_speed = numpy.stack(stacks["windSpeed"])
    wind_direction = numpy.stack(stacks["windDirection"])
    precipitation = numpy.stack(stacks["precipitation"])
    return {
        "maxTemperature": {"units": "°F", "values": rounded_list(numpy.nanmax(temperature, axis=0), 1)},
        "minTemperature": {"units": "°F", "values": rounded_list(numpy.nanmin(temperature, axis=0), 1)},
        "maxHumidity": {"units": "%", "values": rounded_list(numpy.nanmax(humidity, axis=0), 0)},
        "minHumidity": {"units": "%", "values": rounded_list(numpy.nanmin(humidity, axis=0), 0)},
        "maxWindSpeed": {"units": "mph", "values": rounded_list(numpy.nanmax(wind_speed, axis=0), 1)},
        "medianWindDirection": {"units": "degrees", "values": rounded_list(circular_median(wind_direction), 0)},
        "precipitationDuration": {
            "units": "hours",
            "values": rounded_list(numpy.sum(numpy.nan_to_num(precipitation) >= PRECIPITATION_THRESHOLD_INCHES, axis=0), 0),
        },
        "totalPrecipitation": {"units": "in", "values": rounded_list(numpy.nansum(precipitation, axis=0), 2)},
    }


def build_catalog(assets, generated_at):
    times = list(assets)
    common = {
        "source": "urma-daily",
        "model": "urma-daily",
        "modelLabel": "URMA Daily Summaries",
        "modelKind": "Derived observation",
        "times": times,
        "assets": assets,
        "defaultTime": times[-1] if times else None,
        "timeGranularity": "day",
        "extent": list(BOUNDS),
        "projections": ["EPSG:4326"],
    }
    return {
        "source": {"id": "urma-daily", "label": "URMA daily summaries"},
        "generatedAt": generated_at,
        "models": [{"id": "urma-daily", "label": "URMA Daily Summaries", "kind": "Derived observation", "available": bool(times)}],
        "layers": [
            {
                **common,
                "id": f"urma-daily:{variable}",
                "title": title,
                "variable": variable,
                "visualization": visualization,
                "units": units,
            }
            for variable, title, visualization, units in LAYER_DEFINITIONS
        ] if times else [],
    }


def main():
    catalog = json.loads(CATALOG_PATH.read_text())
    dates = available_dates(catalog)
    if not dates:
        raise RuntimeError("No complete URMA dates were available for daily summaries.")
    OUTPUT_DIRECTORY.mkdir(parents=True, exist_ok=True)
    assets = {}
    retained_files = set()
    for date, timestamps in dates:
        timestamp = f"{date}T00:00:00.000Z"
        asset_name = f"urma-daily-v{DERIVATION_VERSION}-{date.replace('-', '')}.json"
        asset_path = OUTPUT_DIRECTORY / asset_name
        if not asset_path.exists():
            stacks = {field: [] for field in COVERAGES}
            requests = [(field, hour) for hour in timestamps for field in COVERAGES]
            with ThreadPoolExecutor(max_workers=10) as executor:
                for field, _, values in executor.map(lambda item: fetch_grid(*item), requests):
                    stacks[field].append(values)
            payload = {
                "source": "WFAS WCS",
                "model": "URMA Daily Summaries",
                "validTime": timestamp,
                "bounds": list(BOUNDS),
                "width": WIDTH,
                "height": HEIGHT,
                "resolution": (BOUNDS[2] - BOUNDS[0]) / (WIDTH - 1),
                "hourCount": len(timestamps),
                "precipitationThresholdInches": PRECIPITATION_THRESHOLD_INCHES,
                "derivationVersion": DERIVATION_VERSION,
                "fields": derive_fields(stacks),
            }
            asset_path.write_text(json.dumps(payload, separators=(",", ":")) + "\n")
            print(f"Wrote {asset_name} from {len(timestamps)} hourly URMA grids.")
        assets[timestamp] = f"./urma-daily/{asset_name}"
        retained_files.add(asset_name)
    generated_at = datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    (OUTPUT_DIRECTORY / "catalog.json").write_text(json.dumps(build_catalog(assets, generated_at), separators=(",", ":")) + "\n")
    for old_asset in OUTPUT_DIRECTORY.glob("urma-daily-*.json"):
        if old_asset.name not in retained_files:
            old_asset.unlink()
    print(f"Synced {len(assets)} URMA daily summaries.")


if __name__ == "__main__":
    main()
