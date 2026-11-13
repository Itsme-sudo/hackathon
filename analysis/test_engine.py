"""
Unit tests for VidyutFleet analytical engine.
"""
import unittest
import pandas as pd
from engine import score_route, compute_dwell_hours, schedule_edf_chargers, calculate_fleet_financials, run_pipeline

class TestVidyutEngine(unittest.TestCase):
    def test_dwell_hours_overnight(self):
        # 20:00 to 06:00 is 10 hours
        self.assertEqual(compute_dwell_hours("20:00", "06:00"), 10.0)
        # 19:30 to 05:30 is 10 hours
        self.assertEqual(compute_dwell_hours("19:30", "05:30"), 10.0)

    def test_score_short_route_ready_now(self):
        res = score_route(distance_km=45.0, dwell_hours=10.0, payload_pct=60.0, stop_count=20, dwell_start_str="20:00", dwell_end_str="06:00")
        self.assertGreaterEqual(res["score"], 80.0)
        self.assertEqual(res["verdict"], "Ready now")

    def test_score_long_route_not_yet(self):
        res = score_route(distance_km=180.0, dwell_hours=6.0, payload_pct=95.0, stop_count=10, dwell_start_str="22:00", dwell_end_str="04:00")
        self.assertLess(res["score"], 50.0)
        self.assertEqual(res["verdict"], "Not yet")

    def test_edf_scheduling(self):
        sample_v = [
            {"vehicle_id": "V1", "route_name": "R1", "verdict": "Ready now", "dwell_start": "20:00", "dwell_end": "05:00", "metrics": {"kwh_needed": 10.0, "charge_hours_req": 3.0, "dwell_hours": 9.0}},
            {"vehicle_id": "V2", "route_name": "R2", "verdict": "Ready now", "dwell_start": "20:00", "dwell_end": "07:00", "metrics": {"kwh_needed": 10.0, "charge_hours_req": 3.0, "dwell_hours": 11.0}}
        ]
        sched = schedule_edf_chargers(sample_v)
        self.assertGreaterEqual(sched["min_chargers"], 1)
        self.assertEqual(len(sched["schedule"]), 2)

    def test_financials_with_subsidy(self):
        sample_v = [
            {"distance_km": 80.0, "verdict": "Ready now"}
        ]
        fin_on = calculate_fleet_financials(sample_v, subsidy_active=True)
        fin_off = calculate_fleet_financials(sample_v, subsidy_active=False)
        self.assertLess(fin_on["total_capex_investment_inr"], fin_off["total_capex_investment_inr"])
        self.assertLess(fin_on["payback_months"], fin_off["payback_months"])

if __name__ == "__main__":
    unittest.main()
