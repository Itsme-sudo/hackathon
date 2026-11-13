"""
Agent 1: Data Validation & Sanitization Agent
Validates CSV schema, types, range checks, and dwell logic.
Supports both 47-column master schema and 6-column simplified format.
"""
import re
import pandas as pd
from datetime import datetime

SIMPLIFIED_COLUMNS = [
    "vehicle_id", "route_id", "daily_distance_km",
    "departure_time", "arrival_time", "depot_id"
]

MASTER_REQUIRED_COLUMNS = [
    "vehicle_id", "daily_distance_km", "departure_time", "arrival_time"
]

def is_valid_time(time_str):
    if not isinstance(time_str, str):
        return False
    match = re.match(r"^([01]?[0-9]|2[0-3]):[0-5][0-9]$", time_str.strip())
    return match is not None

def parse_time_mins(time_str):
    h, m = map(int, str(time_str).strip().split(":"))
    return h * 60 + m

class DataValidationAgent:
    def __init__(self):
        self.errors = []
        self.warnings = []

    def validate_and_clean(self, df_or_csv_path):
        self.errors = []
        self.warnings = []
        
        if isinstance(df_or_csv_path, str):
            try:
                df = pd.read_csv(df_or_csv_path)
            except Exception as e:
                return {
                    "valid": False,
                    "is_simplified": False,
                    "total_rows": 0,
                    "errors": [f"CSV Read Failure: {str(e)}"],
                    "warnings": [],
                    "cleaned_data": None
                }
        else:
            df = df_or_csv_path.copy()

        total_rows = len(df)
        if total_rows == 0:
            return {
                "valid": False,
                "is_simplified": False,
                "total_rows": 0,
                "errors": ["Uploaded CSV file is completely empty."],
                "warnings": [],
                "cleaned_data": None
            }

        # Check required columns
        cols = [c.strip() for c in df.columns]
        df.columns = cols
        
        is_simplified = set(SIMPLIFIED_COLUMNS).issubset(set(cols)) and len(cols) < 20
        
        missing_mandatory = [c for c in MASTER_REQUIRED_COLUMNS if c not in cols]
        if missing_mandatory:
            return {
                "valid": False,
                "is_simplified": is_simplified,
                "total_rows": total_rows,
                "errors": [f"Missing mandatory columns: {', '.join(missing_mandatory)}"],
                "warnings": [],
                "cleaned_data": None
            }

        # Clean and populate defaults if missing
        cleaned = df.copy()
        
        # Populate defaults for simplified CSV
        defaults = {
            "record_id": range(1, total_rows + 1),
            "analysis_date": datetime.today().strftime('%Y-%m-%d'),
            "organization_id": "ORG-DEFAULT",
            "depot_id": "D01",
            "depot_name": "Central Depot",
            "depot_city": "Ludhiana",
            "depot_state": "Punjab",
            "vehicle_name": cleaned.get("vehicle_id", "Vehicle"),
            "vehicle_type": "LCV",
            "fuel_type": "Diesel",
            "route_name": cleaned.get("route_id", "Route"),
            "origin": "Central Depot",
            "destination": "Delivery Hub",
            "number_of_trips": 2,
            "depot_dwell_start": cleaned.get("arrival_time", "19:00"),
            "depot_dwell_end": cleaned.get("departure_time", "07:00"),
            "payload_kg": 500,
            "max_payload_kg": 800,
            "road_type": "Urban",
            "traffic_level": "Medium",
            "weather_condition": "Clear",
            "route_type": "Last-mile",
            "delivery_deadline_time": "19:00",
            "monthly_operating_days": 26,
            "average_speed_kmph": 25.0,
            "stop_count": 25,
            "driver_id": "DRV-DEF",
            "vehicle_purchase_price": 650000,
            "annual_maintenance_cost": 35000,
            "fuel_efficiency": 12.0,
            "electricity_tariff_per_kwh": 7.5,
            "diesel_price_per_ltr": 94.5,
            "petrol_price_per_ltr": 105.0,
            "cng_price_per_kg": 85.0,
            "battery_capacity_kwh": 10.24,
            "ev_range_km": 115,
            "current_soc_percent": 50,
            "charging_power_kw": 3.3,
            "charger_type": "AC Type 2",
            "available_chargers": 6,
            "grid_connection_capacity_kw": 80.0,
            "ev_model_id": "EV001"
        }

        for col, def_val in defaults.items():
            if col not in cleaned.columns:
                cleaned[col] = def_val
                if not is_simplified:
                    self.warnings.append(f"Column '{col}' was missing; assigned standard reference default.")

        # Row-by-row validation
        invalid_rows = []
        for idx, row in cleaned.iterrows():
            row_num = idx + 1
            # Distance check
            try:
                dist = float(row["daily_distance_km"])
                if dist <= 0:
                    self.errors.append(f"Row {row_num} (Vehicle {row.get('vehicle_id', idx)}): daily_distance_km must be > 0 (got {dist}).")
                    invalid_rows.append(idx)
                elif dist > 500:
                    self.warnings.append(f"Row {row_num}: Extreme daily distance {dist} km; verify if multi-day route.")
            except (ValueError, TypeError):
                self.errors.append(f"Row {row_num}: Invalid numeric value for daily_distance_km.")
                invalid_rows.append(idx)

            # Time format check
            for t_col in ["departure_time", "arrival_time", "depot_dwell_start", "depot_dwell_end"]:
                t_val = str(row.get(t_col, "")).strip()
                if not is_valid_time(t_val):
                    self.errors.append(f"Row {row_num}: Column '{t_col}' has invalid HH:MM format ('{t_val}').")
                    invalid_rows.append(idx)

            # Payload validation
            try:
                pl = float(row.get("payload_kg", 0))
                mpl = float(row.get("max_payload_kg", 800))
                if pl < 0:
                    self.errors.append(f"Row {row_num}: payload_kg cannot be negative.")
                if mpl > 0 and pl > mpl * 1.3:
                    self.warnings.append(f"Row {row_num}: Payload {pl} kg exceeds rated capacity {mpl} kg by >30% (Overload penalty applied).")
            except Exception:
                pass

        # Deduplicate warnings
        self.warnings = list(dict.fromkeys(self.warnings))[:15]
        valid = (len(self.errors) == 0)

        return {
            "valid": valid,
            "is_simplified": is_simplified,
            "total_rows": total_rows,
            "errors": self.errors[:20],
            "warnings": self.warnings,
            "cleaned_data": cleaned if valid else None
        }
