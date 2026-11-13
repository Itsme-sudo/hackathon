"""
VidyutFleet Analytical Engine
Core algorithms: Multi-factor EV Feasibility Scorer, Dwell-based Charger Sizing,
Earliest-Deadline-First (EDF) Bay Scheduler, TCO/ROI and CEA v16 CO2 Calculator.
"""

import sys
import json
import math
from datetime import datetime, timedelta
import pandas as pd
import numpy as np

# Standard Indian Commercial EV Reference Benchmarks (CEEW / CEA / ARAI / FAME-II)
REF_SPECS = {
    "ev_nominal_range_km": 120.0,      # e.g., Mahindra Zor Grand / Euler HiLoad
    "safety_buffer_pct": 0.20,         # 20% emergency reserve
    "ev_energy_consumption_kwh_km": 0.11, # kWh per km for commercial 3W cargo
    "ac_charger_power_kw": 3.3,        # Standard Type-2 / IEC 60309 depot AC point
    "dc_fast_power_kw": 11.0,          # Depot opportunity DC / fast AC
    "charging_efficiency": 0.88,       # Inverter / charging losses
    "running_cost_per_km": {
        "ev": 1.28,                    # CEEW 2024 benchmark (INR/km)
        "cng": 2.35,
        "diesel": 2.69,
        "petrol": 3.21
    },
    "capex": {
        "ev_base_inr": 380000,
        "diesel_base_inr": 290000,
        "ac_charger_per_bay_inr": 45000,
        "pm_edrive_subsidy_inr": 50000   # PM E-DRIVE / FAME-II incentive for L5M
    },
    "emissions": {
        "cea_grid_factor_kg_kwh": 0.71, # CEA CO2 Baseline Database v16
        "diesel_kg_co2_liter": 2.68,
        "diesel_mileage_km_liter": 12.5 # ~0.214 kg CO2 / km
    },
    "operating_days_per_year": 300
}

def parse_time_str(time_str):
    """Parses 'HH:MM' string into minutes from midnight."""
    h, m = map(int, time_str.strip().split(":"))
    return h * 60 + m

def format_minutes(total_mins):
    """Converts minutes from midnight to 'HH:MM' 24-hr format (handles rollover)."""
    norm = int(total_mins) % (24 * 60)
    h = norm // 60
    m = norm % 60
    return f"{h:02d}:{m:02d}"

def compute_dwell_hours(start_str, end_str):
    """Calculates dwell duration in hours, handling overnight crossing midnight."""
    start_m = parse_time_str(start_str)
    end_m = parse_time_str(end_str)
    if end_m <= start_m:
        end_m += 24 * 60  # crossed midnight
    return (end_m - start_m) / 60.0

def score_route(distance_km, dwell_hours, payload_pct, stop_count, dwell_start_str, dwell_end_str):
    """
    Computes normalized 0-100 EV Feasibility Score.
    Formula: Score = 0.40 * R + 0.30 * D + 0.20 * Q + 0.10 * S
    """
    eff_range = REF_SPECS["ev_nominal_range_km"] * (1.0 - REF_SPECS["safety_buffer_pct"]) # 96 km
    
    # R (40%): Range Fit
    if distance_km <= eff_range:
        # Scale smoothly between 75 and 100
        R = 75.0 + 25.0 * (1.0 - (distance_km / eff_range))
    else:
        # Penalty beyond effective range
        excess_ratio = (distance_km - eff_range) / eff_range
        R = max(0.0, 75.0 - excess_ratio * 90.0)
    
    # Required charging hours
    kwh_needed = (distance_km * REF_SPECS["ev_energy_consumption_kwh_km"]) / REF_SPECS["charging_efficiency"]
    charge_hours_req = kwh_needed / REF_SPECS["ac_charger_power_kw"]
    
    # D (30%): Depot Dwell Fit
    if dwell_hours >= charge_hours_req:
        margin = dwell_hours - charge_hours_req
        D = min(100.0, 75.0 + (margin / 4.0) * 25.0)
    else:
        deficit_ratio = (charge_hours_req - dwell_hours) / charge_hours_req
        D = max(0.0, 75.0 - deficit_ratio * 100.0)
        
    # Q (20%): Payload & Congestion Severity
    # Base 85, minus high payload penalty, minus frequent stop penalty
    Q = 85.0
    if payload_pct > 70:
        Q -= (payload_pct - 70) * 0.9
    if stop_count > 25:
        Q -= (stop_count - 25) * 0.7
    Q = max(10.0, min(100.0, Q))
    
    # S (10%): Off-Peak Window Alignment (11:00 PM to 06:00 AM)
    start_m = parse_time_str(dwell_start_str)
    end_m = parse_time_str(dwell_end_str)
    if end_m <= start_m:
        end_m += 24 * 60
    # Off-peak is 23:00 to 06:00 (which is 23:00 to 30:00 in relative minutes if start is evening)
    off_peak_start = 23 * 60
    off_peak_end = 30 * 60
    
    overlap_start = max(start_m, off_peak_start)
    overlap_end = min(end_m, off_peak_end)
    overlap_mins = max(0, overlap_end - overlap_start)
    S = min(100.0, (overlap_mins / (7 * 60)) * 100.0)

    # Composite Normalized Score
    score = 0.40 * R + 0.30 * D + 0.20 * Q + 0.10 * S
    score = round(score, 1)

    # 3 Actionable Decision Labels
    if score >= 75.0 and D >= 70.0 and distance_km <= (eff_range * 1.05):
        verdict = "Ready now"
        verdict_color = "#10B981" # Green
    elif score >= 50.0:
        verdict = "Ready with depot charger"
        verdict_color = "#F59E0B" # Amber
    else:
        verdict = "Not yet"
        verdict_color = "#EF4444" # Red

    return {
        "score": score,
        "verdict": verdict,
        "verdict_color": verdict_color,
        "metrics": {
            "R_range_fit": round(R, 1),
            "D_dwell_fit": round(D, 1),
            "Q_payload_fit": round(Q, 1),
            "S_tariff_fit": round(S, 1),
            "kwh_needed": round(kwh_needed, 2),
            "charge_hours_req": round(charge_hours_req, 2),
            "dwell_hours": round(dwell_hours, 2)
        }
    }

def schedule_edf_chargers(vehicles, subsidy_active=True):
    """
    Sizes minimum depot chargers and simulates Earliest-Deadline-First (EDF) bay scheduling.
    """
    eligible = [v for v in vehicles if v["verdict"] in ["Ready now", "Ready with depot charger"]]
    if not eligible:
        return {"min_chargers": 0, "schedule": [], "bay_utilization": []}

    # Aggregate energy requirement
    total_energy_kwh = sum(v["metrics"]["kwh_needed"] for v in eligible)
    avg_dwell = np.mean([v["metrics"]["dwell_hours"] for v in eligible])
    
    # Analytical Lower Bound
    charger_kw = REF_SPECS["ac_charger_power_kw"]
    min_chargers = math.ceil(total_energy_kwh / (charger_kw * avg_dwell * 0.90))
    min_chargers = max(2, min(min_chargers, len(eligible)))

    # Setup vehicle session tasks for EDF
    tasks = []
    for v in eligible:
        arr_m = parse_time_str(v["dwell_start"])
        dep_m = parse_time_str(v["dwell_end"])
        if dep_m <= arr_m:
            dep_m += 24 * 60
        charge_mins = int(v["metrics"]["charge_hours_req"] * 60)
        tasks.append({
            "vehicle_id": v["vehicle_id"],
            "route_name": v["route_name"],
            "arrival_m": arr_m,
            "deadline_m": dep_m,
            "duration_m": charge_mins,
            "kwh": v["metrics"]["kwh_needed"]
        })

    # Sort greedily by Earliest Deadline (min deadline_m), then earliest arrival
    tasks.sort(key=lambda t: (t["deadline_m"], t["arrival_m"]))

    # Simulate bays
    bay_free_at = [0] * min_chargers
    schedule = []
    
    for t in tasks:
        # Find bay that frees up earliest
        best_bay = 0
        earliest_avail = bay_free_at[0]
        for b_idx in range(1, min_chargers):
            if bay_free_at[b_idx] < earliest_avail:
                earliest_avail = bay_free_at[b_idx]
                best_bay = b_idx
        
        start_m = max(t["arrival_m"], bay_free_at[best_bay])
        end_m = start_m + t["duration_m"]
        bay_free_at[best_bay] = end_m
        
        slack_mins = t["deadline_m"] - end_m
        status = "On-Time Dispatch" if slack_mins >= 0 else "Tight Buffer"
        
        schedule.append({
            "vehicle_id": t["vehicle_id"],
            "route_name": t["route_name"],
            "bay_id": f"Bay {best_bay + 1}",
            "start_time": format_minutes(start_m),
            "end_time": format_minutes(end_m),
            "departure_time": format_minutes(t["deadline_m"]),
            "duration_hours": round(t["duration_m"] / 60.0, 1),
            "energy_kwh": round(t["kwh"], 1),
            "buffer_mins": slack_mins,
            "status": status
        })

    return {
        "min_chargers": min_chargers,
        "total_energy_kwh": round(total_energy_kwh, 1),
        "schedule": schedule
    }

def calculate_fleet_financials(vehicles, subsidy_active=True):
    """
    Computes TCO, running cost savings, ROI and CEA v16 CO2 emission reductions.
    """
    op_days = REF_SPECS["operating_days_per_year"]
    ev_rate = REF_SPECS["running_cost_per_km"]["ev"]
    diesel_rate = REF_SPECS["running_cost_per_km"]["diesel"]
    cng_rate = REF_SPECS["running_cost_per_km"]["cng"]
    petrol_rate = REF_SPECS["running_cost_per_km"]["petrol"]
    
    total_km_daily = sum(v["distance_km"] for v in vehicles)
    total_km_annual = total_km_daily * op_days
    
    # Operational Costs (Annual)
    annual_cost_ev = total_km_annual * ev_rate
    annual_cost_diesel = total_km_annual * diesel_rate
    annual_cost_cng = total_km_annual * cng_rate
    annual_cost_petrol = total_km_annual * petrol_rate
    annual_net_savings = annual_cost_diesel - annual_cost_ev
    
    # Electrifiable count (Ready now + Ready with charger)
    num_electrifiable = len([v for v in vehicles if v["verdict"] in ["Ready now", "Ready with depot charger"]])
    
    # Capital Expenditure Delta
    capex_delta_per_veh = REF_SPECS["capex"]["ev_base_inr"] - REF_SPECS["capex"]["diesel_base_inr"]
    subsidy_amount = REF_SPECS["capex"]["pm_edrive_subsidy_inr"] if subsidy_active else 0
    net_capex_per_veh = (capex_delta_per_veh - subsidy_amount) + (REF_SPECS["capex"]["ac_charger_per_bay_inr"] * 0.3)
    
    total_capex_investment = max(0, net_capex_per_veh * num_electrifiable)
    
    # Payback Period (Years & Months)
    if annual_net_savings > 0 and num_electrifiable > 0:
        annual_savings_electrifiable = (sum(v["distance_km"] for v in vehicles if v["verdict"] in ["Ready now", "Ready with depot charger"]) * op_days * (diesel_rate - ev_rate))
        payback_years = total_capex_investment / annual_savings_electrifiable if annual_savings_electrifiable > 0 else 0
        payback_months = round(payback_years * 12, 1)
        roi_pct = round((annual_savings_electrifiable / total_capex_investment) * 100, 1) if total_capex_investment > 0 else 100.0
    else:
        payback_years = 0
        payback_months = 0
        roi_pct = 0.0

    # Carbon Emissions (CEA Database v16 vs Diesel)
    # Diesel: 2.68 kg CO2/L / 12.5 km/L = 0.2144 kg CO2 / km
    # EV: 0.71 kg CO2/kWh * 0.11 kWh/km = 0.0781 kg CO2 / km
    co2_per_km_diesel = REF_SPECS["emissions"]["diesel_kg_co2_liter"] / REF_SPECS["emissions"]["diesel_mileage_km_liter"]
    co2_per_km_ev = REF_SPECS["emissions"]["cea_grid_factor_kg_kwh"] * REF_SPECS["ev_energy_consumption_kwh_km"]
    
    annual_co2_diesel_tonnes = (total_km_annual * co2_per_km_diesel) / 1000.0
    annual_co2_ev_tonnes = (total_km_annual * co2_per_km_ev) / 1000.0
    annual_co2_abated_tonnes = round(annual_co2_diesel_tonnes - annual_co2_ev_tonnes, 2)
    co2_reduction_pct = round(((co2_per_km_diesel - co2_per_km_ev) / co2_per_km_diesel) * 100, 1)

    return {
        "subsidy_active": subsidy_active,
        "total_annual_km": total_km_annual,
        "annual_costs": {
            "ev": round(annual_cost_ev),
            "diesel": round(annual_cost_diesel),
            "cng": round(annual_cost_cng),
            "petrol": round(annual_cost_petrol)
        },
        "annual_net_savings_inr": round(annual_net_savings),
        "total_capex_investment_inr": round(total_capex_investment),
        "payback_months": payback_months,
        "annual_roi_pct": roi_pct,
        "co2": {
            "diesel_tonnes_year": round(annual_co2_diesel_tonnes, 1),
            "ev_tonnes_year": round(annual_co2_ev_tonnes, 1),
            "net_abated_tonnes_year": annual_co2_abated_tonnes,
            "reduction_pct": co2_reduction_pct
        }
    }

def run_pipeline(csv_path_or_df, subsidy_active=True):
    """Executes the full VidyutFleet planning pipeline from CSV."""
    if isinstance(csv_path_or_df, str):
        df = pd.read_csv(csv_path_or_df)
    else:
        df = csv_path_or_df.copy()

    # Required column sanitization
    required = ["vehicle_id", "route_name", "distance_km", "dwell_start", "dwell_end", "avg_payload_pct", "stop_count"]
    for col in required:
        if col not in df.columns:
            raise ValueError(f"Missing required column in CSV: {col}")

    scored_vehicles = []
    for _, row in df.iterrows():
        dwell_h = compute_dwell_hours(str(row["dwell_start"]), str(row["dwell_end"]))
        scoring = score_route(
            float(row["distance_km"]),
            dwell_h,
            float(row["avg_payload_pct"]),
            int(row["stop_count"]),
            str(row["dwell_start"]),
            str(row["dwell_end"])
        )
        scored_vehicles.append({
            "vehicle_id": str(row["vehicle_id"]),
            "route_name": str(row["route_name"]),
            "distance_km": float(row["distance_km"]),
            "dwell_start": str(row["dwell_start"]),
            "dwell_end": str(row["dwell_end"]),
            "avg_payload_pct": float(row["avg_payload_pct"]),
            "stop_count": int(row["stop_count"]),
            "depot_id": str(row.get("depot_id", "DEPOT-01")),
            "score": scoring["score"],
            "verdict": scoring["verdict"],
            "verdict_color": scoring["verdict_color"],
            "metrics": scoring["metrics"]
        })

    # Summary counts
    counts = {
        "ready_now": len([v for v in scored_vehicles if v["verdict"] == "Ready now"]),
        "ready_with_charger": len([v for v in scored_vehicles if v["verdict"] == "Ready with depot charger"]),
        "not_yet": len([v for v in scored_vehicles if v["verdict"] == "Not yet"]),
        "total": len(scored_vehicles)
    }

    # Charger Sizing & EDF Scheduling
    charging_plan = schedule_edf_chargers(scored_vehicles, subsidy_active)

    # Financials & CO2 Impact
    financials = calculate_fleet_financials(scored_vehicles, subsidy_active)

    return {
        "status": "success",
        "timestamp": datetime.now().isoformat(),
        "summary": counts,
        "charging_plan": charging_plan,
        "financials": financials,
        "vehicles": scored_vehicles
    }

if __name__ == "__main__":
    csv_file = sys.argv[1] if len(sys.argv) > 1 else "routes.csv"
    subsidy = True
    if len(sys.argv) > 2 and sys.argv[2].lower() in ["false", "0", "off"]:
        subsidy = False
    
    res = run_pipeline(csv_file, subsidy_active=subsidy)
    print(json.dumps(res, indent=2))
