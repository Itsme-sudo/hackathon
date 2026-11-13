"""
Unit and Integration Test Suite for VidyutFleet Multi-Agent Analytical Core.
"""
import unittest
import os
import pandas as pd
from analysis.core.validator import DataValidationAgent
from analysis.core.scoring import FleetAnalysisAgent
from analysis.core.edf_scheduler import ChargingPlannerAgent
from analysis.core.financials import FinancialAnalystAgent
from analysis.core.sustainability import SustainabilityAgent
from analysis.ml.classifier import RouteSuitabilityClassifier
from analysis.ml.clustering import RouteClusterEngine
from analysis.ml.anomaly import AnomalyDetectionEngine
from analysis.rag.advisor_agent import VidyutFleetAdvisor

class TestVidyutMultiAgents(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data_path = os.path.join(os.path.dirname(__file__), "..", "..", "data", "fleet_routes.csv")
        cls.df = pd.read_csv(cls.data_path)

    def test_1_validation_agent(self):
        val = DataValidationAgent()
        res = val.validate_and_clean(self.df)
        self.assertTrue(res["valid"])
        self.assertEqual(res["total_rows"], 120)
        self.assertIsNotNone(res["cleaned_data"])

    def test_2_scoring_agent(self):
        val = DataValidationAgent()
        cleaned = val.validate_and_clean(self.df)["cleaned_data"]
        scorer = FleetAnalysisAgent()
        res = scorer.analyze_fleet(cleaned)
        
        self.assertEqual(res["summary"]["total_vehicles"], 120)
        self.assertGreater(res["summary"]["ready_now_count"], 0)
        self.assertGreater(res["summary"]["not_yet_count"], 0)
        
        # Test first record breakdown
        first = res["records"][0]
        self.assertIn("score", first)
        self.assertIn("verdict", first)
        self.assertIn(first["verdict"], ["Ready Now", "Ready with Depot Charger", "Not Yet"])

    def test_3_edf_scheduler(self):
        val = DataValidationAgent()
        cleaned = val.validate_and_clean(self.df)["cleaned_data"]
        scorer = FleetAnalysisAgent()
        scored = scorer.analyze_fleet(cleaned)["records"]
        
        planner = ChargingPlannerAgent()
        plan = planner.plan_depot_charging(scored, cleaned)
        
        self.assertGreater(plan["min_chargers_required"], 0)
        self.assertGreaterEqual(plan["recommended_chargers"], plan["min_chargers_required"])
        self.assertGreater(len(plan["gantt_schedule"]), 0)

    def test_4_financial_analyst(self):
        val = DataValidationAgent()
        cleaned = val.validate_and_clean(self.df)["cleaned_data"]
        scorer = FleetAnalysisAgent()
        scored = scorer.analyze_fleet(cleaned)["records"]
        
        fin = FinancialAnalystAgent()
        sub_on = fin.analyze_fleet_financials(scored, cleaned, subsidy_active=True)
        sub_off = fin.analyze_fleet_financials(scored, cleaned, subsidy_active=False)
        
        self.assertGreater(sub_on["annual_net_savings_inr"], 0)
        self.assertLess(sub_on["total_capex_investment_inr"], sub_off["total_capex_investment_inr"])
        self.assertLess(sub_on["payback_period"]["months"], sub_off["payback_period"]["months"])

    def test_5_sustainability_agent(self):
        val = DataValidationAgent()
        cleaned = val.validate_and_clean(self.df)["cleaned_data"]
        scorer = FleetAnalysisAgent()
        scored = scorer.analyze_fleet(cleaned)["records"]
        
        sust = SustainabilityAgent()
        res = sust.calculate_fleet_emissions(scored, cleaned)
        self.assertGreater(res["annual_emissions_tonnes"]["net_co2_abated_tonnes"], 0)
        self.assertGreater(res["annual_emissions_tonnes"]["percentage_reduction"], 50.0)

    def test_6_ml_classifier_and_clustering(self):
        val = DataValidationAgent()
        cleaned = val.validate_and_clean(self.df)["cleaned_data"]
        scorer = FleetAnalysisAgent()
        scored = scorer.analyze_fleet(cleaned)["records"]
        labels = [r["verdict"] for r in scored]

        clf = RouteSuitabilityClassifier()
        ml_res = clf.train_and_evaluate(cleaned, labels)
        self.assertIn("accuracy", ml_res["metrics"])
        self.assertGreater(ml_res["metrics"]["accuracy"], 0.70)

        cluster_engine = RouteClusterEngine(n_clusters=4)
        clust_res = cluster_engine.cluster_routes(cleaned)
        self.assertEqual(len(clust_res["clusters"]), 4)

    def test_7_rag_advisor(self):
        val = DataValidationAgent()
        cleaned = val.validate_and_clean(self.df)["cleaned_data"]
        scorer = FleetAnalysisAgent()
        scored_res = scorer.analyze_fleet(cleaned)
        planner = ChargingPlannerAgent()
        plan_res = planner.plan_depot_charging(scored_res["records"], cleaned)
        fin = FinancialAnalystAgent()
        fin_res = fin.analyze_fleet_financials(scored_res["records"], cleaned)
        sust = SustainabilityAgent()
        sust_res = sust.calculate_fleet_emissions(scored_res["records"], cleaned)

        payload = {
            "summary": scored_res["summary"],
            "records": scored_res["records"],
            "charging_plan": plan_res,
            "financials": fin_res,
            "sustainability": sust_res
        }

        advisor = VidyutFleetAdvisor()
        advisor.index_analysis_session(payload)
        
        ans = advisor.answer_query("Which routes should I electrify first?")
        self.assertIn("Ready Now", ans["answer"])
        self.assertGreater(len(ans["citations"]), 0)

if __name__ == "__main__":
    unittest.main()
