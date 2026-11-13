"""
Agent 4: Financial Analyst Agent
Calculates TCO, annual operational savings, payback period, 5-yr/10-yr TCO,
and multi-scenario sensitivity analysis (fuel prices, electricity tariff, subsidies).
"""
from ..config import REF_FACTORS

class FinancialAnalystAgent:
    def __init__(self, assumptions=None):
        self.assumptions = assumptions or {}
        self.ev_cost_per_km = self.assumptions.get("ev_operating_cost_per_km", REF_FACTORS.get("ev_operating_cost_per_km", 1.28))
        self.diesel_cost_per_km = self.assumptions.get("diesel_operating_cost_per_km", REF_FACTORS.get("diesel_operating_cost_per_km", 2.69))
        self.cng_cost_per_km = 2.35
        self.petrol_cost_per_km = 3.21
        self.charger_install_cost = self.assumptions.get("charger_installation_cost", REF_FACTORS.get("charger_installation_cost", 150000))
        self.pm_edrive_subsidy = self.assumptions.get("pm_edrive_subsidy", REF_FACTORS.get("pm_edrive_subsidy", 50000))
        self.battery_reserve_pct = self.assumptions.get("battery_replacement_reserve", 10.0)

    def analyze_fleet_financials(self, scored_records, cleaned_df, subsidy_active=True, num_chargers=6):
        op_days_year = 300
        
        # Calculate annual km for electrifiable vehicles
        electrifiable = [r for r in scored_records if r["verdict"] in ["Ready Now", "Ready with Depot Charger"]]
        num_electrifiable = len(electrifiable)
        
        if num_electrifiable == 0:
            total_electrifiable_km_day = 0
        else:
            total_electrifiable_km_day = sum(r["daily_distance_km"] for r in electrifiable)

        annual_electrifiable_km = total_electrifiable_km_day * op_days_year
        
        # Operating Costs (Annual)
        annual_ev_fuel_cost = annual_electrifiable_km * self.ev_cost_per_km
        annual_diesel_fuel_cost = annual_electrifiable_km * self.diesel_cost_per_km
        annual_cng_fuel_cost = annual_electrifiable_km * self.cng_cost_per_km
        annual_petrol_fuel_cost = annual_electrifiable_km * self.petrol_cost_per_km
        
        # Maintenance Costs: EV is ~45% lower than ICE
        avg_ice_maint = 35000
        avg_ev_maint = 18000
        annual_maint_savings = num_electrifiable * (avg_ice_maint - avg_ev_maint)
        
        annual_net_savings = (annual_diesel_fuel_cost - annual_ev_fuel_cost) + annual_maint_savings

        # Capital Expenditure Delta (EV Purchase Premium - Subsidy + Charger Share)
        # Average EV LCV/3W = 4,00,000; Average Diesel = 3,10,000. Delta = 90,000
        base_vehicle_capex_delta = 90000 * num_electrifiable
        total_charger_capex = num_chargers * 45000 # 45,000 INR per AC depot bay
        battery_reserve_fund = (base_vehicle_capex_delta * (self.battery_reserve_pct / 100.0))
        
        subsidy_total = (self.pm_edrive_subsidy * num_electrifiable) if subsidy_active else 0
        
        net_investment_capex = max(1000, (base_vehicle_capex_delta - subsidy_total + total_charger_capex + battery_reserve_fund))

        # Payback Period & ROI
        if annual_net_savings > 0:
            payback_years = net_investment_capex / annual_net_savings
            payback_months = round(payback_years * 12.0, 1)
            annual_roi_pct = round((annual_net_savings / net_investment_capex) * 100.0, 1)
        else:
            payback_years = 0
            payback_months = 0
            annual_roi_pct = 0.0

        # 5-Year and 10-Year Total Cost of Ownership (TCO)
        five_yr_diesel_tco = (annual_diesel_fuel_cost + num_electrifiable * avg_ice_maint) * 5
        five_yr_ev_tco = net_investment_capex + (annual_ev_fuel_cost + num_electrifiable * avg_ev_maint) * 5
        five_yr_net_benefit = round(five_yr_diesel_tco - five_yr_ev_tco, 2)

        ten_yr_diesel_tco = (annual_diesel_fuel_cost + num_electrifiable * avg_ice_maint) * 10
        ten_yr_ev_tco = net_investment_capex + (annual_ev_fuel_cost + num_electrifiable * avg_ev_maint) * 10 + (num_electrifiable * 75000) # battery replacement at year 6
        ten_yr_net_benefit = round(ten_yr_diesel_tco - ten_yr_ev_tco, 2)

        # Sensitivity Analysis Matrix
        sensitivity_diesel = []
        for delta_pct in [-20, -10, 0, 10, 20]:
            rate = self.diesel_cost_per_km * (1 + delta_pct / 100.0)
            sens_savings = (annual_electrifiable_km * (rate - self.ev_cost_per_km)) + annual_maint_savings
            sens_payback = round((net_investment_capex / max(1, sens_savings)) * 12.0, 1)
            sensitivity_diesel.append({
                "diesel_price_change_pct": delta_pct,
                "diesel_rate_inr_km": round(rate, 2),
                "annual_savings_inr": round(sens_savings),
                "payback_months": sens_payback
            })

        return {
            "subsidy_active": subsidy_active,
            "electrifiable_vehicles": num_electrifiable,
            "annual_operating_km": round(annual_electrifiable_km),
            "rates_per_km": {
                "ev": self.ev_cost_per_km,
                "diesel": self.diesel_cost_per_km,
                "cng": self.cng_cost_per_km,
                "petrol": self.petrol_cost_per_km
            },
            "annual_spend": {
                "ev": round(annual_ev_fuel_cost),
                "diesel": round(annual_diesel_fuel_cost),
                "cng": round(annual_cng_fuel_cost),
                "petrol": round(annual_petrol_fuel_cost)
            },
            "annual_net_savings_inr": round(annual_net_savings),
            "total_capex_investment_inr": round(net_investment_capex),
            "subsidy_total_inr": round(subsidy_total),
            "payback_period": {
                "years": round(payback_years, 2),
                "months": payback_months
            },
            "annual_roi_pct": annual_roi_pct,
            "tco_projection": {
                "five_year_diesel_tco": round(five_yr_diesel_tco),
                "five_year_ev_tco": round(five_yr_ev_tco),
                "five_year_net_savings": five_yr_net_benefit,
                "ten_year_net_savings": ten_yr_net_benefit
            },
            "sensitivity_matrix": sensitivity_diesel
        }
