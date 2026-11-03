#!/usr/bin/env python3
import json
import math
import tempfile
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

from eccodes import codes_get, codes_get_array, codes_grib_new_from_file, codes_release

NOMADS_FILTER_URL = "https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_0p25.pl"
FORECAST_HOURS = range(0, 25, 3)
BOUNDS = (-125, 24, -66, 50)
OUTPUT_DIRECTORY = Path(__file__).resolve().parents[1] / "public" / "nomads"
GRID_LONGITUDES = list(range(BOUNDS[0], BOUNDS[2] + 1))
GRID_LATITUDES = list(range(BOUNDS[3], BOUNDS[1] - 1, -1))
VARIABLES = {
    "10u": {"type": "wind-u", "units": "m/s"},
    "10v": {"type": "wind-v", "units": "m/s"},
    "2t": {"type": "temperature", "units": "K"},
    "tp": {"type": "precipitation", "units": "kg/m2"},
}


def candidate_cycles(now):
    cycle_hour = (now.hour // 6) * 6
    latest = now.replace(hour=cycle_hour, minute=0, second=0, microsecond=0)
    return [latest - timedelta(hours=6 * offset) for offset in range(8)]


def filtered_url(cycle, forecast_hour):
    params = {
        "file": f"gfs.t{cycle:%H}z.pgrb2.0p25.f{forecast_hour:03d}",
        "lev_10_m_above_ground": "on",
        "lev_2_m_above_ground": "on",
        "lev_surface": "on",
        "var_UGRD": "on",
        "var_VGRD": "on",
        "var_TMP": "on",
        "var_APCP": "on",
        "subregion": "",
        "leftlon": BOUNDS[0],
        "rightlon": BOUNDS[2],
        "toplat": BOUNDS[3],
        "bottomlat": BOUNDS[1],
        "dir": f"/gfs.{cycle:%Y%m%d}/{cycle:%H}/atmos",
    }
    return f"{NOMADS_FILTER_URL}?{urllib.parse.urlencode(params)}"


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
            points[(round(lon * 4), round(lat * 4))] = None if math.isnan(value) else round(float(value), 3)
    return [
        points.get((longitude * 4, latitude * 4))
        for latitude in GRID_LATITUDES
        for longitude in GRID_LONGITUDES
    ]


def read_grib(path):
    fields = {}
    with path.open("rb") as stream:
        while message := codes_grib_new_from_file(stream):
            try:
                short_name = codes_get(message, "shortName")
                if short_name in VARIABLES:
                    fields[short_name] = rounded_values(message)
            finally:
                codes_release(message)
    missing = {"10u", "10v", "2t"} - fields.keys()
    if missing:
        raise RuntimeError(f"NOMADS file is missing required fields: {', '.join(sorted(missing))}.")
    fields.setdefault("tp", [None] * (len(GRID_LONGITUDES) * len(GRID_LATITUDES)))
    return fields


def find_cycle(now):
    with tempfile.TemporaryDirectory() as temporary_directory:
        probe = Path(temporary_directory) / "probe.grib2"
        for cycle in candidate_cycles(now):
            try:
                download(filtered_url(cycle, 0), probe)
                return cycle
            except Exception as error:
                print(f"Cycle {cycle:%Y-%m-%d %HZ} unavailable: {error}")
    raise RuntimeError("No recent NOMADS GFS cycle was available.")


def layer_catalog(assets):
    times = list(assets)
    common = {
        "source": "nomads",
        "model": "nomads-gfs",
        "modelLabel": "GFS 0.25°",
        "modelKind": "Forecast",
        "times": times,
        "assets": assets,
        "extent": list(BOUNDS),
        "projections": ["EPSG:4326"],
    }
    return [
        {
            **common,
            "id": "nomads:gfs:wind-10m",
            "title": "10 m wind",
            "variable": "wind_10m",
            "units": "m/s",
            "visualization": "wind-particles",
        },
        {
            **common,
            "id": "nomads:gfs:temperature-2m",
            "title": "2 m temperature",
            "variable": "temperature_2m",
            "units": "K",
            "visualization": "temperature",
        },
        {
            **common,
            "id": "nomads:gfs:precipitation",
            "title": "Accumulated precipitation",
            "variable": "precipitation",
            "units": "kg/m²",
            "visualization": "precipitation",
        },
    ]


def main():
    now = datetime.now(timezone.utc)
    cycle = find_cycle(now)
    OUTPUT_DIRECTORY.mkdir(parents=True, exist_ok=True)
    assets = {}
    with tempfile.TemporaryDirectory() as temporary_directory:
        temporary_path = Path(temporary_directory)
        for forecast_hour in FORECAST_HOURS:
            grib_path = temporary_path / f"gfs-f{forecast_hour:03d}.grib2"
            download(filtered_url(cycle, forecast_hour), grib_path)
            fields = read_grib(grib_path)
            valid_time = cycle + timedelta(hours=forecast_hour)
            timestamp = valid_time.isoformat().replace("+00:00", "Z")
            asset_name = f"gfs-{valid_time:%Y%m%dT%H%MZ}.json"
            payload = {
                "source": "NOMADS",
                "model": "GFS 0.25°",
                "cycle": cycle.isoformat().replace("+00:00", "Z"),
                "validTime": timestamp,
                "bounds": list(BOUNDS),
                "width": len(GRID_LONGITUDES),
                "height": len(GRID_LATITUDES),
                "resolution": 1,
                "fields": {
                    "u": {"units": VARIABLES["10u"]["units"], "values": fields["10u"]},
                    "v": {"units": VARIABLES["10v"]["units"], "values": fields["10v"]},
                    "temperature": {"units": VARIABLES["2t"]["units"], "values": fields["2t"]},
                    "precipitation": {"units": VARIABLES["tp"]["units"], "values": fields["tp"]},
                },
            }
            (OUTPUT_DIRECTORY / asset_name).write_text(json.dumps(payload, separators=(",", ":")) + "\n")
            assets[timestamp] = f"./nomads/{asset_name}"
            print(f"Wrote {asset_name}")

    catalog = {
        "source": {"id": "nomads", "label": "NOMADS"},
        "generatedAt": now.isoformat().replace("+00:00", "Z"),
        "cycle": cycle.isoformat().replace("+00:00", "Z"),
        "models": [{"id": "nomads-gfs", "label": "GFS 0.25°", "kind": "Forecast", "available": True}],
        "layers": layer_catalog(assets),
    }
    (OUTPUT_DIRECTORY / "catalog.json").write_text(json.dumps(catalog, separators=(",", ":")) + "\n")
    for old_asset in OUTPUT_DIRECTORY.glob("gfs-*.json"):
        if old_asset.name not in {Path(asset).name for asset in assets.values()}:
            old_asset.unlink()
    print(f"Synced {len(assets)} GFS valid times from NOMADS cycle {cycle:%Y-%m-%d %HZ}.")


if __name__ == "__main__":
    main()
