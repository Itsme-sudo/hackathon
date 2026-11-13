"""
VidyutFleet Multi-Agent Orchestrator & FastAPI Microservice
Coordinates:
1. DataValidationAgent
2. FleetAnalysisAgent
3. ChargingPlannerAgent (EDF)
4. FinancialAnalystAgent (TCO & ROI)
5. SustainabilityAgent (CEA v16 CO2)
6. RouteSuitabilityClassifier (ML)
7. RouteClusterEngine (K-Means)
8. AnomalyDetectionEngine (Isolation Forest)
9. VidyutFleetAdvisor (RAG Agent)
10. Excel Report Generator
"""
import sys
import os
import json
import pandas as pd
from datetime import datetime

# Local imports
from .core.validator import DataValidationAgent
from .core.scoring import FleetAnalysisAgent
from .core.edf_scheduler import ChargingPlannerAgent
from .core.financials import FinancialAnalystAgent
from .core.sustainability import SustainabilityAgent
from .ml.classifier import RouteSuitabilityClassifier
from .ml.clustering import RouteClusterEngine
from .ml.anomaly import AnomalyDetectionEngine
from .rag.advisor_agent import VidyutFleetAdvisor
from .reports.excel_generator import generate_fleet_excel
from .config import REF_FACTORS, EV_CATALOGUE

# Global singletons
advisor_agent = VidyutFleetAdvisor()
latest_analysis_cache = {}

def execute_pipeline(df_or_csv_path, subsidy_active=True, custom_assumptions=None):
    """Executes the end-to-end multi-agent pipeline."""
    # 1. Validation Agent
    val_agent = DataValidationAgent()
    val_res = val_agent.validate_and_clean(df_or_csv_path)
    if not val_res["valid"]:
        return {
            "status": "error",
            "message": "Data validation failed",
            "errors": val_res["errors"],
            "warnings": val_res["warnings"]
        }

    cleaned_df = val_res["cleaned_data"]

    # 2. Fleet Analysis & Scoring Agent
    scoring_agent = FleetAnalysisAgent()
    scoring_res = scoring_agent.analyze_fleet(cleaned_df)
    scored_records = scoring_res["records"]

    # 3. Charging Planner Agent (EDF)
    chg_agent = ChargingPlannerAgent()
    charging_res = chg_agent.plan_depot_charging(scored_records, cleaned_df)

    # 4. Financial Analyst Agent
    fin_agent = FinancialAnalystAgent(custom_assumptions)
    rec_chargers = charging_res.get("recommended_chargers", 6)
    financial_res = fin_agent.analyze_fleet_financials(
        scored_records, cleaned_df, subsidy_active=subsidy_active, num_chargers=rec_chargers
    )

    # 5. Sustainability Agent
    sust_agent = SustainabilityAgent()
    sust_res = sust_agent.calculate_fleet_emissions(scored_records, cleaned_df)

    # 6. ML Engines
    scored_labels = [r["verdict"] for r in scored_records]
    ml_classifier = RouteSuitabilityClassifier()
    ml_res = ml_classifier.train_and_evaluate(cleaned_df, scored_labels)

    cluster_engine = RouteClusterEngine(n_clusters=4)
    cluster_res = cluster_engine.cluster_routes(cleaned_df)

    anomaly_engine = AnomalyDetectionEngine()
    anomaly_res = anomaly_engine.detect_anomalies(cleaned_df)

    # Combine master payload
    full_payload = {
        "status": "success",
        "timestamp": datetime.now().isoformat(),
        "is_simplified_format": val_res["is_simplified"],
        "validation": {
            "total_rows": val_res["total_rows"],
            "warnings": val_res["warnings"]
        },
        "summary": scoring_res["summary"],
        "charging_plan": charging_res,
        "financials": financial_res,
        "sustainability": sust_res,
        "ml_insights": {
            "classifier": ml_res,
            "clustering": cluster_res,
            "anomalies": anomaly_res
        },
        "priority_transition_queue": scoring_res["priority_transition_queue"],
        "records": scored_records
    }

    # Index into RAG Advisor
    advisor_agent.index_analysis_session(full_payload, EV_CATALOGUE, REF_FACTORS)
    global latest_analysis_cache
    latest_analysis_cache = full_payload

    return full_payload

# CLI execution interface
if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="VidyutFleet Multi-Agent Engine")
    parser.add_argument("csv_path", nargs="?", default=os.path.join(os.path.dirname(__file__), "..", "data", "fleet_routes.csv"))
    parser.add_argument("--subsidy", type=str, default="true")
    parser.add_argument("--diesel-price", type=float, default=None)
    parser.add_argument("--electricity-tariff", type=float, default=None)
    parser.add_argument("--export-excel", type=str, default=None)
    args = parser.parse_args()

    sub_flag = args.subsidy.lower() in ["true", "1", "yes", "on"]
    assumptions = {}
    if args.diesel_price is not None:
        # Scale diesel operating cost proportionally to price (base 94.5 -> 2.69 INR/km)
        assumptions["diesel_operating_cost_per_km"] = round(2.69 * (args.diesel_price / 94.5), 3)
    if args.electricity_tariff is not None:
        # Scale EV operating cost proportionally to tariff (base 7.5 -> 1.28 INR/km)
        assumptions["ev_operating_cost_per_km"] = round(1.28 * (args.electricity_tariff / 7.5), 3)

    results = execute_pipeline(args.csv_path, subsidy_active=sub_flag, custom_assumptions=assumptions if assumptions else None)
    
    if args.export_excel:
        generate_fleet_excel(results, args.export_excel)
        print(f"Excel report saved to: {args.export_excel}")
    else:
        print(json.dumps(results, indent=2))
