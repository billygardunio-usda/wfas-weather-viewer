import unittest

import numpy

from scripts.sync_urma_daily import available_dates, circular_median, derive_fields, normalize_values


class UrmaDailyTests(unittest.TestCase):
    def test_selects_five_recent_dates_with_enough_common_hours(self):
        times = [f"2026-11-{day:02d}T{hour:02d}:00:00.000Z" for day in range(1, 8) for hour in range(24)]
        catalog = {"layers": [{"model": "urma", "variable": variable, "times": times} for variable in [
            "Temperature", "Relative_humidity", "Wind_speed", "Wind_direction", "Total_precipitation"
        ]]}
        self.assertEqual([date for date, _ in available_dates(catalog)], ["2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07"])

    def test_uses_circular_median_for_direction(self):
        values = numpy.array([[[350]], [[5]], [[10]]], dtype=float)
        self.assertAlmostEqual(float(circular_median(values)[0, 0]), 5)

    def test_derives_daily_extremes_and_precipitation(self):
        stacks = {
            "temperature": [numpy.array([[40.0]]), numpy.array([[70.0]])],
            "relativeHumidity": [numpy.array([[20.0]]), numpy.array([[80.0]])],
            "windSpeed": [numpy.array([[5.0]]), numpy.array([[15.0]])],
            "windDirection": [numpy.array([[350.0]]), numpy.array([[10.0]])],
            "precipitation": [numpy.array([[0.005]]), numpy.array([[0.02]])],
        }
        fields = derive_fields(stacks)
        self.assertEqual(fields["maxTemperature"]["values"], [70.0])
        self.assertEqual(fields["minHumidity"]["values"], [20.0])
        self.assertEqual(fields["precipitationDuration"]["values"], [1.0])
        self.assertEqual(fields["totalPrecipitation"]["values"], [0.03])

    def test_converts_wcs_temperature_and_precipitation_units(self):
        self.assertAlmostEqual(float(normalize_values("temperature", numpy.array([[273.15]]))[0, 0]), 32, places=3)
        self.assertAlmostEqual(float(normalize_values("precipitation", numpy.array([[25.4]]))[0, 0]), 1, places=3)


if __name__ == "__main__":
    unittest.main()
