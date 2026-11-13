"""
Agent 3: Charging Planner & Earliest-Deadline-First (EDF) Bay Scheduling Agent
Calculates depot charger sizing, EDF bay allocations, conflicts, peak power, and Gantt timeline.
"""
import math
from datetime import datetime
from ..config import REF_FACTORS

def parse_time_mins(time_str):
    h, m = map(int, str(time_str).strip().split(":"))
    return h * 60 + m

def format_mins(mins):
    norm = int(mins) % (24 * 60)
    h = norm // 60
    m = norm % 60
    return f"{h:02d}:{m:02d}"

class ChargingPlannerAgent:
    def __init__(self):
        self.default_tariff = REF_FACTORS.get("electricity_tariff", 7.5)
        self.charging_eff = REF_FACTORS.get("ev_charging_efficiency", 0.90)

    def plan_depot_charging(self, scored_records, cleaned_df):
        # Filter vehicles eligible for depot charging
        eligible_vehicles = []
        df_lookup = cleaned_df.set_index("vehicle_id").to_dict("index") if "vehicle_id" in cleaned_df.columns else {}

        for rec in scored_records:
            v_id = rec["vehicle_id"]
            if rec["verdict"] in ["Ready Now", "Ready with Depot Charger"]:
                raw = df_lookup.get(v_id, {})
                dwell_start = str(raw.get("depot_dwell_start", "19:00"))
                dwell_end = str(raw.get("depot_dwell_end", "06:30"))
                
                arr_m = parse_time_mins(dwell_start)
                dep_m = parse_time_mins(dwell_end)
                if dep_m <= arr_m:
                    dep_m += 24 * 60 # Crossed midnight
                
                kwh_req = rec["charging_needs"]["kwh_required"]
                pwr_kw = rec["charging_needs"]["charging_power_kw"]
                duration_mins = int((kwh_req / pwr_kw) * 60)
                
                eligible_vehicles.append({
                    "vehicle_id": v_id,
                    "vehicle_name": rec.get("vehicle_name", v_id),
                    "route_id": rec["route_id"],
                    "route_name": rec["route_name"],
                    "depot_id": rec.get("depot_id", "D01"),
                    "arrival_m": arr_m,
                    "departure_m": dep_m,
                    "duration_mins": duration_mins,
                    "duration_hours": round(duration_mins / 60.0, 1),
                    "kwh_required": kwh_req,
                    "power_kw": pwr_kw
                })

        if not eligible_vehicles:
            return {
                "min_chargers_required": 0,
                "recommended_chargers": 0,
                "total_nightly_kwh": 0,
                "peak_power_kw": 0,
                "charger_utilization_pct": 0,
                "conflicts_count": 0,
                "conflicts": [],
                "gantt_schedule": []
            }

        # Sizing lower bound
        total_kwh = sum(v["kwh_required"] for v in eligible_vehicles)
        avg_dwell_h = sum((v["departure_m"] - v["arrival_m"]) / 60.0 for v in eligible_vehicles) / len(eligible_vehicles)
        avg_pwr = 3.3
        
        # Analytical lower bound: Total energy / (Power * Dwell * 0.85 efficiency/buffer)
        min_chargers = math.ceil(total_kwh / (avg_pwr * avg_dwell_h * 0.85))
        min_chargers = max(2, min_chargers)
        # Recommended with 20% safety margin / maintenance reserve
        rec_chargers = math.ceil(min_chargers * 1.25)

        # Sort tasks by Earliest Deadline First (min departure_m), then earliest arrival
        eligible_vehicles.sort(key=lambda x: (x["departure_m"], x["arrival_m"]))

        # Simulate Earliest Deadline First allocation across bays
        bay_free_at = [0] * rec_chargers
        gantt_schedule = []
        conflicts = []

        for v in eligible_vehicles:
            # Find bay that frees up earliest
            best_bay = 0
            earliest_avail = bay_free_at[0]
            for b_idx in range(1, rec_chargers):
                if bay_free_at[b_idx] < earliest_avail:
                    earliest_avail = bay_free_at[b_idx]
                    best_bay = b_idx
            
            start_m = max(v["arrival_m"], bay_free_at[best_bay])
            end_m = start_m + v["duration_mins"]
            bay_free_at[best_bay] = end_m
            
            slack_mins = v["departure_m"] - end_m
            has_conflict = (slack_mins < 0)
            status = "Scheduled" if not has_conflict else "Charging Conflict"

            if has_conflict:
                conflicts.append({
                    "vehicle_id": v["vehicle_id"],
                    "route_name": v["route_name"],
                    "deficit_mins": abs(slack_mins),
                    "resolution": "Upgrade to 7.4 kW / 15 kW Fast Charger or shift to earlier arrival slot"
                })

            gantt_schedule.append({
                "vehicle_id": v["vehicle_id"],
                "vehicle_name": v["vehicle_name"],
                "route_name": v["route_name"],
                "bay_id": f"Bay {best_bay + 1}",
                "start_time": format_mins(start_m),
                "end_time": format_mins(end_m),
                "departure_time": format_mins(v["departure_m"]),
                "duration_hours": v["duration_hours"],
                "energy_kwh": round(v["kwh_required"], 1),
                "slack_buffer_mins": slack_mins,
                "status": status,
                "has_conflict": has_conflict
            })

        # Power demand & utilization
        peak_power = min(len(eligible_vehicles), rec_chargers) * 3.3
        total_bay_hours = rec_chargers * 12.0 # 12 hr overnight window
        actual_charged_hours = sum(v["duration_hours"] for v in eligible_vehicles)
        utilization_pct = round((actual_charged_hours / max(1.0, total_bay_hours)) * 100.0, 1)
        utilization_pct = min(100.0, utilization_pct)
        
        estimated_electricity_cost = round(total_kwh * self.default_tariff, 2)

        return {
            "min_chargers_required": min_chargers,
            "recommended_chargers": rec_chargers,
            "total_nightly_kwh": round(total_kwh, 1),
            "peak_power_kw": round(peak_power, 1),
            "charger_utilization_pct": utilization_pct,
            "estimated_nightly_electricity_cost_inr": estimated_electricity_cost,
            "conflicts_count": len(conflicts),
            "conflicts": conflicts,
            "gantt_schedule": gantt_schedule
        }
