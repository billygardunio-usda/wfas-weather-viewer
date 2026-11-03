import unittest
from datetime import datetime, timezone
from urllib.parse import parse_qs, urlparse

from scripts.sync_nomads import candidate_cycles, filtered_url


class NomadsSyncTests(unittest.TestCase):
    def test_candidate_cycles_start_at_latest_six_hour_cycle(self):
        now = datetime(2026, 11, 3, 17, 45, tzinfo=timezone.utc)
        cycles = candidate_cycles(now)
        self.assertEqual(cycles[0], datetime(2026, 11, 3, 12, tzinfo=timezone.utc))
        self.assertEqual(cycles[1], datetime(2026, 11, 3, 6, tzinfo=timezone.utc))

    def test_filtered_url_limits_model_fields_and_conus(self):
        cycle = datetime(2026, 11, 3, 12, tzinfo=timezone.utc)
        query = parse_qs(urlparse(filtered_url(cycle, 6)).query)
        self.assertEqual(query["file"], ["gfs.t12z.pgrb2.0p25.f006"])
        self.assertEqual(query["dir"], ["/gfs.20261103/12/atmos"])
        self.assertEqual(query["leftlon"], ["-125"])
        self.assertEqual(query["rightlon"], ["-66"])
        self.assertEqual(query["var_UGRD"], ["on"])
        self.assertEqual(query["var_VGRD"], ["on"])


if __name__ == "__main__":
    unittest.main()
