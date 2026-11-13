"""
Agent 5: Sustainability & Carbon Abatement Agent
Calculates Well-to-Wheel CO2 emissions using Central Electricity Authority (CEA) v16 grid factor.
"""
from ..config import REF_FACTORS

class SustainabilityAgent:
    def __init__(self):
        self.grid_co2_factor = REF_FACTORS.get("grid_co2_factor", 0.675) # kg CO2 / kWh
        self.diesel_co2_factor = REF_FACTORS.get("diesel_co2_factor", 2.68) # kg CO2 / L
        self.petrol_co2_factor = REF_FACTORS.get("petrol_co2_factor", 2.31)
        self.cng_co2_factor = REF_FACTORS.get("cng_co2_factor", 2.75)

    def calculate_fleet_emissions(self, scored_records, cleaned_df):
        op_days_year = 300
        electrifiable = [r for r in scored_records if r["verdict"] in ["Ready Now", "Ready with Depot Charger"]]
        
        total_electrifiable_km_day = sum(r["daily_distance_km"] for r in electrifiable) if electrifiable else 0
        annual_km = total_electrifiable_km_day * op_days_year

        # Baseline ICE Emissions:
        # Commercial LCV diesel mileage ~12.5 km/L -> 0.08 L/km * 2.68 kg CO2/L = 0.2144 kg CO2 / km
        diesel_emissions_kg_km = self.diesel_co2_factor / 12.5
        annual_diesel_co2_tonnes = (annual_km * diesel_emissions_kg_km) / 1000.0

        # EV Electricity Consumption Emissions (CEA Indian Power Sector Grid Factor v16):
        # 0.11 kWh/km * 0.675 kg CO2/kWh = 0.07425 kg CO2 / km
        ev_emissions_kg_km = 0.11 * self.grid_co2_factor
        annual_ev_co2_tonnes = (annual_km * ev_emissions_kg_km) / 1000.0

        net_abated_tonnes = max(0.0, annual_diesel_co2_tonnes - annual_ev_co2_tonnes)
        reduction_pct = round(((diesel_emissions_kg_km - ev_emissions_kg_km) / diesel_emissions_kg_km) * 100.0, 1)

        # Environmental equivalents:
        # 1 mature tree absorbs ~22 kg CO2 per year
        trees_equivalent = int((net_abated_tonnes * 1000.0) / 22.0)
        # Barrels of oil saved (~0.136 tonnes CO2 per barrel)
        barrels_oil_saved = int(net_abated_tonnes / 0.43)

        return {
            "standards_referenced": {
                "source": "Central Electricity Authority (CEA) CO2 Baseline Database for Indian Power Sector (v16)",
                "grid_emission_factor_kg_kwh": self.grid_co2_factor,
                "diesel_emission_factor_kg_liter": self.diesel_co2_factor
            },
            "annual_operating_km": round(annual_km),
            "emissions_kg_per_km": {
                "diesel_baseline": round(diesel_emissions_kg_km, 4),
                "ev_grid_well_to_wheel": round(ev_emissions_kg_km, 4),
                "net_reduction_per_km": round(diesel_emissions_kg_km - ev_emissions_kg_km, 4)
            },
            "annual_emissions_tonnes": {
                "diesel_baseline_tonnes": round(annual_diesel_co2_tonnes, 2),
                "ev_grid_tonnes": round(annual_ev_co2_tonnes, 2),
                "net_co2_abated_tonnes": round(net_abated_tonnes, 2),
                "percentage_reduction": reduction_pct
            },
            "green_equivalencies": {
                "mature_trees_planted_equivalent": trees_equivalent,
                "barrels_crude_oil_saved": barrels_oil_saved
            }
        }
