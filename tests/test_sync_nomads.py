import unittest
from datetime import datetime, timezone
from urllib.parse import parse_qs, urlparse

from scripts.sync_nomads import MODELS, candidate_cycles, filtered_url


class NomadsSyncTests(unittest.TestCase):
    def test_candidate_cycles_start_at_latest_six_hour_cycle(self):
        now = datetime(2026, 11, 3, 17, 45, tzinfo=timezone.utc)
        cycles = candidate_cycles(now, 6)
        self.assertEqual(cycles[0], datetime(2026, 11, 3, 12, tzinfo=timezone.utc))
        self.assertEqual(cycles[1], datetime(2026, 11, 3, 6, tzinfo=timezone.utc))

    def test_filtered_url_limits_model_fields_and_conus(self):
        cycle = datetime(2026, 11, 3, 12, tzinfo=timezone.utc)
        query = parse_qs(urlparse(filtered_url(MODELS[0], cycle, 6)).query)
        self.assertEqual(query["file"], ["gfs.t12z.pgrb2.0p25.f006"])
        self.assertEqual(query["dir"], ["/gfs.20261103/12/atmos"])
        self.assertEqual(query["leftlon"], ["-125"])
        self.assertEqual(query["rightlon"], ["-66"])
        self.assertEqual(query["var_UGRD"], ["on"])
        self.assertEqual(query["var_VGRD"], ["on"])
        self.assertEqual(query["var_RH"], ["on"])
        self.assertEqual(query["var_GUST"], ["on"])

    def test_regional_model_urls_use_their_nomads_products(self):
        cycle = datetime(2026, 11, 3, 12, tzinfo=timezone.utc)
        expected = {
            "nomads-hrrr": ("filter_hrrr_2d.pl", "hrrr.t12z.wrfsfcf03.grib2"),
            "nomads-rap": ("filter_rap.pl", "rap.t12z.awp130pgrbf03.grib2"),
            "nomads-nam-nest": ("filter_nam_conusnest.pl", "nam.t12z.conusnest.hiresf03.tm00.grib2"),
        }
        for model in MODELS[1:]:
            url = urlparse(filtered_url(model, cycle, 3))
            query = parse_qs(url.query)
            self.assertTrue(url.path.endswith(expected[model["id"]][0]))
            self.assertEqual(query["file"], [expected[model["id"]][1]])


if __name__ == "__main__":
    unittest.main()
