import unittest
from datetime import datetime, timezone

from app import app
from comunicacion import SITES, _stereographic_xy, _visibility_periods


class CommunicationSimulatorTests(unittest.TestCase):
    def setUp(self):
        app.config["TESTING"] = True
        self.client = app.test_client()

    def test_candidate_coordinates_project_inside_their_site_rasters(self):
        expected_xy = {
            "shackleton": (-1_000, -7_000),
            "degerlache": (-37_000, 15_000),
            "malapert": (-500, 121_500),
        }
        for site_key, site in SITES.items():
            x, y = _stereographic_xy(site["latitude"], site["longitude"])
            expected_x, expected_y = expected_xy[site_key]
            self.assertAlmostEqual(x, expected_x, delta=1_000)
            self.assertAlmostEqual(y, expected_y, delta=1_000)

    def test_visibility_period_handles_windows_open_at_start(self):
        start = datetime(2026, 11, 14, tzinfo=timezone.utc)
        end = datetime(2026, 11, 14, 1, tzinfo=timezone.utc)
        samples = [
            {
                "time": "2026-11-14T00:00:00Z",
                "_datetime": start,
                "elevation": 3.0,
                "horizon": 0.0,
                "visible": True,
            },
            {
                "time": "2026-11-14T01:00:00Z",
                "_datetime": end,
                "elevation": 4.0,
                "horizon": 0.0,
                "visible": True,
            },
        ]

        periods = _visibility_periods(samples)
        self.assertEqual(len(periods), 1)
        self.assertEqual(periods[0]["startUtc"], "2026-11-14T00:00:00Z")
        self.assertEqual(periods[0]["endUtc"], "2026-11-14T01:00:00Z")

    def test_spice_and_dem_analysis_returns_windows_and_comparison(self):
        response = self.client.post(
            "/api/communications/analyze",
            json={
                "site": "shackleton",
                "latitude": -89.7668,
                "longitude": -171.87,
                "antennaHeight": 2,
                "startUtc": "2026-11-14T00:00:00Z",
                "durationDays": 1,
                "stepMinutes": 120,
            },
        )

        self.assertEqual(response.status_code, 200, response.get_json())
        result = response.get_json()
        self.assertEqual(result["engine"], "NAIF SPICE / CSPICE via SpiceyPy")
        self.assertEqual(result["lunarFrame"], "MOON_ME")
        self.assertGreater(result["selected"]["groundElevationMeters"], -3_000)
        self.assertIn("geometricPeriods", result["selected"])
        self.assertIn("periods", result["selected"])
        self.assertTrue(result["selected"]["samples"])
        self.assertEqual(len(result["comparison"]), 3)
        self.assertTrue(
            all("visibleHours" in site for site in result["comparison"])
        )

    def test_solar_illumination_uses_spice_over_a_full_lunar_cycle(self):
        response = self.client.post(
            "/api/illumination/analyze",
            json={
                "site": "shackleton",
                "startUtc": "2026-11-14T00:00:00Z",
            },
        )

        self.assertEqual(response.status_code, 200, response.get_json())
        result = response.get_json()
        self.assertEqual(result["engine"], "NAIF SPICE / CSPICE via SpiceyPy")
        self.assertEqual(result["ephemeris"], "DE440s")
        self.assertEqual(result["siteKey"], "shackleton")
        self.assertGreater(result["sampleCount"], 700)
        self.assertAlmostEqual(
            result["sunlitHours"] + result["shadowHours"],
            result["durationDays"] * 24,
            places=1,
        )
        for sample in result["samples"]:
            self.assertIn("terrainHorizonDeg", sample)
            self.assertEqual(
                sample["sunlit"],
                sample["sunElevationDeg"] > sample["terrainHorizonDeg"],
            )

    def test_solar_illumination_rejects_unknown_sites(self):
        response = self.client.post(
            "/api/illumination/analyze",
            json={
                "site": "unknown",
                "startUtc": "2026-11-14T00:00:00Z",
            },
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("sitio válido", response.get_json()["error"])

    def test_point_outside_selected_dem_is_rejected(self):
        response = self.client.post(
            "/api/communications/analyze",
            json={
                "site": "shackleton",
                "latitude": -85,
                "longitude": 0,
                "antennaHeight": 2,
                "startUtc": "2026-11-14T00:00:00Z",
                "durationDays": 1,
                "stepMinutes": 120,
            },
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("fuera del DEM local", response.get_json()["error"])

    def test_selection_terrain_endpoint_compares_all_candidate_sites(self):
        response = self.client.get("/api/selection/terrain")

        self.assertEqual(response.status_code, 200, response.get_json())
        sites = response.get_json()["sites"]
        self.assertEqual(
            {site["siteKey"] for site in sites},
            {"shackleton", "degerlache", "malapert"},
        )
        for site in sites:
            self.assertGreaterEqual(site["slopeUnder15Percent"], 0)
            self.assertLessEqual(site["slopeUnder15Percent"], 100)
            self.assertGreaterEqual(site["roughnessMeters"], 0)
            self.assertIsNotNone(site["meanElevationErrorMeters"])


if __name__ == "__main__":
    unittest.main()
