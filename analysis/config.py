"""
Configuration and reference constants for VidyutFleet.
Reads parameters from data/reference_factors.csv and data/ev_catalogue.csv.
"""
import os
import pandas as pd

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")

def load_reference_factors():
    ref_path = os.path.join(DATA_DIR, "reference_factors.csv")
    factors = {
        "electricity_tariff": 7.5,
        "diesel_price": 94.5,
        "petrol_price": 105.0,
        "cng_price": 85.0,
        "grid_co2_factor": 0.675, # CEA Baseline v16
        "diesel_co2_factor": 2.68,
        "petrol_co2_factor": 2.31,
        "cng_co2_factor": 2.75,
        "ev_charging_efficiency": 0.90,
        "charger_installation_cost": 150000,
        "battery_replacement_reserve": 10.0,
        "pm_edrive_subsidy": 50000,
        "diesel_operating_cost_per_km": 2.69,
        "ev_operating_cost_per_km": 1.28
    }
    if os.path.exists(ref_path):
        try:
            df = pd.read_csv(ref_path)
            for _, r in df.iterrows():
                p_name = str(r["parameter_name"]).strip()
                try:
                    factors[p_name] = float(r["parameter_value"])
                except ValueError:
                    pass
        except Exception as e:
            print(f"Warning loading reference_factors.csv: {e}")
    return factors

def load_ev_catalogue():
    cat_path = os.path.join(DATA_DIR, "ev_catalogue.csv")
    if os.path.exists(cat_path):
        try:
            return pd.read_csv(cat_path)
        except Exception:
            pass
    return pd.DataFrame()

REF_FACTORS = load_reference_factors()
EV_CATALOGUE = load_ev_catalogue()
