#!/usr/bin/env python3
import json
import math
import tempfile
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

from eccodes import codes_get, codes_get_array, codes_grib_new_from_file, codes_release

NOMADS_BASE_URL = "https://nomads.ncep.noaa.gov/cgi-bin"
BOUNDS = (-125, 24, -66, 50)
OUTPUT_DIRECTORY = Path(__file__).resolve().parents[1] / "public" / "nomads"
GRID_LONGITUDES = list(range(BOUNDS[0], BOUNDS[2] + 1))
GRID_LATITUDES = list(range(BOUNDS[3], BOUNDS[1] - 1, -1))
EMPTY_GRID = [None] * (len(GRID_LONGITUDES) * len(GRID_LATITUDES))

MODELS = [
    {
        "id": "nomads-gfs",
        "label": "GFS 0.25°",
        "filter": "filter_gfs_0p25.pl",
        "cycleHours": 6,
        "forecastHours": range(0, 25, 3),
        "file": lambda cycle, hour: f"gfs.t{cycle:%H}z.pgrb2.0p25.f{hour:03d}",
        "directory": lambda cycle: f"/gfs.{cycle:%Y%m%d}/{cycle:%H}/atmos",
    },
    {
        "id": "nomads-hrrr",
        "label": "HRRR 3 km",
        "filter": "filter_hrrr_2d.pl",
        "cycleHours": 1,
        "forecastHours": range(0, 19, 3),
        "file": lambda cycle, hour: f"hrrr.t{cycle:%H}z.wrfsfcf{hour:02d}.grib2",
        "directory": lambda cycle: f"/hrrr.{cycle:%Y%m%d}/conus",
    },
    {
        "id": "nomads-rap",
        "label": "RAP 13 km",
        "filter": "filter_rap.pl",
        "cycleHours": 1,
        "forecastHours": range(0, 19, 3),
        "file": lambda cycle, hour: f"rap.t{cycle:%H}z.awp130pgrbf{hour:02d}.grib2",
        "directory": lambda cycle: f"/rap.{cycle:%Y%m%d}",
    },
    {
        "id": "nomads-nam-nest",
        "label": "NAM CONUS Nest 3 km",
        "filter": "filter_nam_conusnest.pl",
        "cycleHours": 6,
        "forecastHours": range(0, 25, 3),
        "file": lambda cycle, hour: f"nam.t{cycle:%H}z.conusnest.hiresf{hour:02d}.tm00.grib2",
        "directory": lambda cycle: f"/nam.{cycle:%Y%m%d}",
    },
]

FIELD_DEFINITIONS = {
    "u": {"shortNames": {"10u"}, "units": "m/s", "required": True},
    "v": {"shortNames": {"10v"}, "units": "m/s", "required": True},
    "temperature": {"shortNames": {"2t"}, "units": "K", "required": True},
    "relativeHumidity": {"shortNames": {"2r", "r"}, "units": "%"},
    "windGust": {"shortNames": {"gust"}, "units": "m/s"},
    "precipitation": {"shortNames": {"tp", "acpcp"}, "units": "kg/m2"},
    "cloudCover": {"shortNames": {"tcc"}, "units": "%"},
    "cape": {"shortNames": {"cape"}, "units": "J/kg"},
}

FILTER_PARAMETERS = {
    "lev_10_m_above_ground": "on",
    "lev_2_m_above_ground": "on",
    "lev_surface": "on",
    "lev_entire_atmosphere": "on",
    "var_UGRD": "on",
    "var_VGRD": "on",
    "var_TMP": "on",
    "var_RH": "on",
    "var_GUST": "on",
    "var_APCP": "on",
    "var_TCDC": "on",
    "var_CAPE": "on",
}

LAYER_DEFINITIONS = [
    {"suffix": "wind-10m", "title": "10 m wind", "variable": "wind_10m", "visualization": "wind-particles", "fields": {"u", "v"}, "units": "m/s"},
    {"suffix": "temperature-2m", "title": "2 m temperature", "variable": "temperature_2m", "visualization": "temperature", "fields": {"temperature"}, "units": "K"},
    {"suffix": "relative-humidity-2m", "title": "2 m relative humidity", "variable": "relative_humidity_2m", "visualization": "relativeHumidity", "fields": {"relativeHumidity"}, "units": "%"},
    {"suffix": "wind-gust", "title": "Surface wind gust", "variable": "wind_gust", "visualization": "windGust", "fields": {"windGust"}, "units": "m/s"},
    {"suffix": "precipitation", "title": "Accumulated precipitation", "variable": "precipitation", "visualization": "precipitation", "fields": {"precipitation"}, "units": "kg/m²"},
    {"suffix": "cloud-cover", "title": "Total cloud cover", "variable": "cloud_cover", "visualization": "cloudCover", "fields": {"cloudCover"}, "units": "%"},
    {"suffix": "cape", "title": "Surface CAPE", "variable": "cape", "visualization": "cape", "fields": {"cape"}, "units": "J/kg"},
]


def candidate_cycles(now, interval_hours, count=12):
    cycle_hour = (now.hour // interval_hours) * interval_hours
    latest = now.replace(hour=cycle_hour, minute=0, second=0, microsecond=0)
    return [latest - timedelta(hours=interval_hours * offset) for offset in range(count)]


def filtered_url(model, cycle, forecast_hour):
    params = {
        "file": model["file"](cycle, forecast_hour),
        **FILTER_PARAMETERS,
        "subregion": "",
        "leftlon": BOUNDS[0],
        "rightlon": BOUNDS[2],
        "toplat": BOUNDS[3],
        "bottomlat": BOUNDS[1],
        "dir": model["directory"](cycle),
    }
    return f"{NOMADS_BASE_URL}/{model['filter']}?{urllib.parse.urlencode(params)}"


def download(url, destination):
    request = urllib.request.Request(url, headers={"User-Agent": "wfas-weather-viewer/0.1"})
    with urllib.request.urlopen(request, timeout=90) as response:
        content_type = response.headers.get("content-type", "")
        if response.status != 200 or "text/html" in content_type:
            raise RuntimeError(f"NOMADS returned HTTP {response.status} ({content_type}).")
        destination.write_bytes(response.read())
    if destination.stat().st_size < 100:
        raise RuntimeError("NOMADS response did not contain GRIB2 data.")


def normalized_longitude(value):
    return value - 360 if value > 180 else value


def rounded_values(message):
    latitudes = codes_get_array(message, "latitudes")
    longitudes = codes_get_array(message, "longitudes")
    values = codes_get_array(message, "values")
    points = {}
    for latitude, longitude, value in zip(latitudes, longitudes, values):
        lon = normalized_longitude(float(longitude))
        lat = float(latitude)
        if BOUNDS[0] <= lon <= BOUNDS[2] and BOUNDS[1] <= lat <= BOUNDS[3]:
            key = (round(lon * 4), round(lat * 4))
            if key not in points:
                points[key] = None if math.isnan(value) else round(float(value), 3)
    return [points.get((longitude * 4, latitude * 4)) for latitude in GRID_LATITUDES for longitude in GRID_LONGITUDES]


def field_for_short_name(short_name):
    return next((field for field, definition in FIELD_DEFINITIONS.items() if short_name in definition["shortNames"]), None)


def read_grib(path):
    fields = {}
    with path.open("rb") as stream:
        while message := codes_grib_new_from_file(stream):
            try:
                field = field_for_short_name(codes_get(message, "shortName"))
                if field and field not in fields:
                    fields[field] = rounded_values(message)
            finally:
                codes_release(message)
    missing = [field for field, definition in FIELD_DEFINITIONS.items() if definition.get("required") and field not in fields]
    if missing:
        raise RuntimeError(f"NOMADS file is missing required fields: {', '.join(missing)}.")
    return {
        field: {"units": definition["units"], "values": fields.get(field, EMPTY_GRID)}
        for field, definition in FIELD_DEFINITIONS.items()
    }


def find_cycle(model, now):
    with tempfile.TemporaryDirectory() as temporary_directory:
        probe = Path(temporary_directory) / "probe.grib2"
        for cycle in candidate_cycles(now, model["cycleHours"]):
            try:
                download(filtered_url(model, cycle, 0), probe)
                return cycle
            except Exception as error:
                print(f"{model['label']} cycle {cycle:%Y-%m-%d %HZ} unavailable: {error}")
    raise RuntimeError(f"No recent {model['label']} cycle was available.")


def available_fields(asset_payloads):
    return {
        field
        for field in FIELD_DEFINITIONS
        if any(any(value is not None for value in payload["fields"][field]["values"]) for payload in asset_payloads)
    }


def layer_catalog(model, assets, fields):
    common = {
        "source": "nomads",
        "model": model["id"],
        "modelLabel": model["label"],
        "modelKind": "Forecast",
        "times": list(assets),
        "assets": assets,
        "extent": list(BOUNDS),
        "projections": ["EPSG:4326"],
    }
    return [
        {
            **common,
            "id": f"{model['id']}:{definition['suffix']}",
            "title": definition["title"],
            "variable": definition["variable"],
            "units": definition["units"],
            "visualization": definition["visualization"],
        }
        for definition in LAYER_DEFINITIONS
        if definition["fields"] <= fields
    ]


def sync_model(model, now):
    cycle = find_cycle(model, now)
    assets = {}
    payloads = []
    with tempfile.TemporaryDirectory() as temporary_directory:
        temporary_path = Path(temporary_directory)
        for forecast_hour in model["forecastHours"]:
            grib_path = temporary_path / f"{model['id']}-f{forecast_hour:03d}.grib2"
            try:
                download(filtered_url(model, cycle, forecast_hour), grib_path)
            except Exception as error:
                if payloads:
                    print(f"Stopping {model['label']} at forecast hour {forecast_hour}: {error}")
                    break
                raise
            valid_time = cycle + timedelta(hours=forecast_hour)
            timestamp = valid_time.isoformat(timespec="milliseconds").replace("+00:00", "Z")
            asset_name = f"{model['id']}-{valid_time:%Y%m%dT%H%MZ}.json"
            payload = {
                "source": "NOMADS",
                "model": model["label"],
                "cycle": cycle.isoformat(timespec="milliseconds").replace("+00:00", "Z"),
                "validTime": timestamp,
                "bounds": list(BOUNDS),
                "width": len(GRID_LONGITUDES),
                "height": len(GRID_LATITUDES),
                "resolution": 1,
                "fields": read_grib(grib_path),
            }
            (OUTPUT_DIRECTORY / asset_name).write_text(json.dumps(payload, separators=(",", ":")) + "\n")
            assets[timestamp] = f"./nomads/{asset_name}"
            payloads.append(payload)
            print(f"Wrote {asset_name}")
    fields = available_fields(payloads)
    return {
        "model": {"id": model["id"], "label": model["label"], "kind": "Forecast", "available": True},
        "layers": layer_catalog(model, assets, fields),
        "assets": {Path(asset).name for asset in assets.values()},
    }


def main():
    now = datetime.now(timezone.utc)
    OUTPUT_DIRECTORY.mkdir(parents=True, exist_ok=True)
    results = []
    for model in MODELS:
        try:
            results.append(sync_model(model, now))
        except Exception as error:
            print(f"Skipping {model['label']}: {error}")
    if not results:
        raise RuntimeError("No NOMADS model could be synchronized.")
    catalog = {
        "source": {"id": "nomads", "label": "NOMADS"},
        "generatedAt": now.isoformat(timespec="milliseconds").replace("+00:00", "Z"),
        "models": [result["model"] for result in results],
        "layers": [layer for result in results for layer in result["layers"]],
    }
    (OUTPUT_DIRECTORY / "catalog.json").write_text(json.dumps(catalog, separators=(",", ":")) + "\n")
    retained_assets = {asset for result in results for asset in result["assets"]}
    for old_asset in OUTPUT_DIRECTORY.glob("*.json"):
        if old_asset.name != "catalog.json" and old_asset.name not in retained_assets:
            old_asset.unlink()
    print(f"Synced {len(catalog['layers'])} layers across {len(results)} NOMADS models.")


if __name__ == "__main__":
    main()
