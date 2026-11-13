"""
Agent 2: Fleet Analysis & EV Readiness Scoring Agent
Calculates the 4-component weighted EV Readiness Score (0-100 scale):
Score = 0.40 * RouteFeasibility + 0.30 * DistanceSuitability + 0.20 * ChargingFeasibility + 0.10 * OperationalSuitability
Classification:
- Score >= 80: Ready Now
- Score >= 60 and < 80: Ready with Depot Charger
- Score < 60: Not Yet
"""
import math
from ..config import REF_FACTORS, EV_CATALOGUE

def parse_time_mins(time_str):
    h, m = map(int, str(time_str).strip().split(":"))
    return h * 60 + m

def calculate_dwell_hours(start_str, end_str):
    start_m = parse_time_mins(start_str)
    end_m = parse_time_mins(end_str)
    if end_m <= start_m:
        end_m += 24 * 60  # Crosses midnight
    return (end_m - start_m) / 60.0

class FleetAnalysisAgent:
    def __init__(self, target_ev_range_km=115.0, safety_buffer_pct=0.20):
        self.nominal_range = target_ev_range_km
        self.safety_buffer = safety_buffer_pct
        self.practical_range = target_ev_range_km * (1.0 - safety_buffer_pct) # ~92-96 km
        self.charging_efficiency = REF_FACTORS.get("ev_charging_efficiency", 0.90)

    def score_single_route(self, row):
        dist = float(row.get("daily_distance_km", 60.0))
        dwell_start = str(row.get("depot_dwell_start", "19:00"))
        dwell_end = str(row.get("depot_dwell_end", "06:30"))
        dwell_hours = calculate_dwell_hours(dwell_start, dwell_end)
        
        payload_kg = float(row.get("payload_kg", 500))
        max_payload_kg = float(row.get("max_payload_kg", 800))
        stop_count = int(row.get("stop_count", 25))
        road_type = str(row.get("road_type", "Urban")).strip()
        traffic = str(row.get("traffic_level", "Medium")).strip()
        weather = str(row.get("weather_condition", "Clear")).strip()
        chg_power = float(row.get("charging_power_kw", 3.3))
        if chg_power <= 0:
            chg_power = 3.3

        # 1. Route Feasibility Score (0-100, Weight: 40%)
        # Factors: road_type, traffic_level, stop_count, weather
        road_scores = {"Urban": 88.0, "Semi-Urban": 78.0, "Highway": 65.0}
        traffic_scores = {"Low": 92.0, "Medium": 82.0, "High": 68.0}
        weather_scores = {"Clear": 90.0, "Rain": 75.0, "Extreme Heat": 70.0, "Foggy": 78.0}
        
        base_route_score = (
            road_scores.get(road_type, 75.0) * 0.40 +
            traffic_scores.get(traffic, 80.0) * 0.35 +
            weather_scores.get(weather, 85.0) * 0.25
        )
        if stop_count > 30:
            base_route_score -= min(15.0, (stop_count - 30) * 0.6)
        route_feasibility = max(10.0, min(100.0, base_route_score))

        # 2. Daily Distance Suitability (0-100, Weight: 30%)
        # Fits within practical EV range (with safety buffer)
        if dist <= self.practical_range:
            # Scaled smoothly 80 to 100
            distance_suitability = 80.0 + 20.0 * (1.0 - (dist / self.practical_range))
        elif dist <= self.nominal_range:
            # Uses safety buffer: 60 to 79
            ratio = (dist - self.practical_range) / (self.nominal_range - self.practical_range)
            distance_suitability = 79.0 - ratio * 19.0
        else:
            # Beyond EV nominal single-charge range
            excess = dist - self.nominal_range
            distance_suitability = max(0.0, 58.0 - (excess / 60.0) * 50.0)

        # Energy & Charging Calculation
        kwh_per_km = 0.11 # Benchmark commercial 3W/LCV
        kwh_required = (dist * kwh_per_km) / self.charging_efficiency
        charge_hours_req = kwh_required / chg_power

        # 3. Charging Feasibility (0-100, Weight: 20%)
        # Factors: dwell time, charger availability, off-peak window overlap
        avail_chargers = int(row.get("available_chargers", 4))
        grid_cap = float(row.get("grid_connection_capacity_kw", 80.0))
        
        if dwell_hours >= charge_hours_req:
            slack_h = dwell_hours - charge_hours_req
            chg_time_score = min(100.0, 75.0 + (slack_h / 4.0) * 25.0)
        else:
            deficit_ratio = (charge_hours_req - dwell_hours) / charge_hours_req
            chg_time_score = max(0.0, 75.0 - deficit_ratio * 100.0)

        # Off-peak window (23:00 to 06:00) overlap check
        start_m = parse_time_mins(dwell_start)
        end_m = parse_time_mins(dwell_end)
        if end_m <= start_m:
            end_m += 24 * 60
        off_peak_start = 23 * 60
        off_peak_end = 30 * 60
        overlap = max(0, min(end_m, off_peak_end) - max(start_m, off_peak_start))
        tariff_score = min(100.0, (overlap / 420.0) * 100.0)

        charging_feasibility = 0.70 * chg_time_score + 0.30 * tariff_score
        charging_feasibility = max(10.0, min(100.0, charging_feasibility))

        # 4. Operational Suitability (0-100, Weight: 10%)
        # Factors: payload utilization, number_of_trips, delivery deadline margin
        payload_ratio = payload_kg / max(1.0, max_payload_kg)
        if payload_ratio <= 0.70:
            payload_score = 95.0
        elif payload_ratio <= 1.0:
            payload_score = 95.0 - (payload_ratio - 0.70) * 50.0
        else:
            payload_score = max(10.0, 80.0 - (payload_ratio - 1.0) * 80.0)

        trips = int(row.get("number_of_trips", 2))
        trip_score = 90.0 if trips <= 3 else max(40.0, 90.0 - (trips - 3) * 12.0)
        
        operational_suitability = 0.60 * payload_score + 0.40 * trip_score
        operational_suitability = max(10.0, min(100.0, operational_suitability))

        # Composite EV Readiness Score (Strictly 0 to 100, NO second multiplication)
        total_score = (
            0.40 * route_feasibility +
            0.30 * distance_suitability +
            0.20 * charging_feasibility +
            0.10 * operational_suitability
        )
        total_score = round(total_score, 1)

        # Classification
        if total_score >= 80.0 and distance_suitability >= 75.0 and dwell_hours >= charge_hours_req:
            verdict = "Ready Now"
            verdict_badge = "success"
            explanation = "Daily distance fits securely within practical EV range; overnight dwell allows 100% full recharge."
        elif total_score >= 60.0:
            verdict = "Ready with Depot Charger"
            verdict_badge = "warning"
            explanation = "Feasible with dedicated overnight depot bay allocation or opportunity charging buffer."
        else:
            verdict = "Not Yet"
            verdict_badge = "danger"
            reasons = []
            if dist > self.nominal_range:
                reasons.append(f"Route distance ({dist} km) exceeds commercial EV battery range")
            if dwell_hours < charge_hours_req:
                reasons.append("Insufficient depot dwell time for complete recharge")
            if payload_ratio > 1.0:
                reasons.append("Severe cargo overload causes rapid battery drain")
            explanation = "; ".join(reasons) if reasons else "High operational severity; recommend retaining clean CNG/Diesel for this phase."

        return {
            "vehicle_id": str(row.get("vehicle_id", "")),
            "vehicle_name": str(row.get("vehicle_name", "")),
            "route_id": str(row.get("route_id", "")),
            "route_name": str(row.get("route_name", "")),
            "depot_id": str(row.get("depot_id", "D01")),
            "daily_distance_km": dist,
            "score": total_score,
            "verdict": verdict,
            "verdict_badge": verdict_badge,
            "explanation": explanation,
            "breakdown": {
                "route_feasibility": round(route_feasibility, 1),
                "distance_suitability": round(distance_suitability, 1),
                "charging_feasibility": round(charging_feasibility, 1),
                "operational_suitability": round(operational_suitability, 1)
            },
            "charging_needs": {
                "kwh_required": round(kwh_required, 2),
                "charge_hours_required": round(charge_hours_req, 2),
                "dwell_hours_available": round(dwell_hours, 2),
                "charging_power_kw": chg_power
            }
        }

    def analyze_fleet(self, cleaned_df):
        scored_records = []
        for _, row in cleaned_df.iterrows():
            scored_records.append(self.score_single_route(row))

        ready_now = [r for r in scored_records if r["verdict"] == "Ready Now"]
        ready_with_charger = [r for r in scored_records if r["verdict"] == "Ready with Depot Charger"]
        not_yet = [r for r in scored_records if r["verdict"] == "Not Yet"]

        # Sort priority: Ready Now by highest score, then Ready with Charger
        priority_queue = sorted(
            ready_now + ready_with_charger,
            key=lambda x: x["score"],
            reverse=True
        )

        return {
            "summary": {
                "total_vehicles": len(scored_records),
                "ready_now_count": len(ready_now),
                "ready_with_charger_count": len(ready_with_charger),
                "not_yet_count": len(not_yet),
                "electrification_rate_pct": round(((len(ready_now) + len(ready_with_charger)) / max(1, len(scored_records))) * 100, 1)
            },
            "records": scored_records,
            "priority_transition_queue": priority_queue[:15]
        }
