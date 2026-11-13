"""
Agent 6: Report Generator Agent (Excel)
Generates an executive multi-sheet Excel workbook with formatted tables, KPIs, and schedules.
"""
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

def generate_fleet_excel(analysis_results, output_path):
    wb = openpyxl.Workbook()
    
    # Styles
    font_header = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
    font_title = Font(name="Calibri", size=16, bold=True, color="1E3A8A")
    font_bold = Font(name="Calibri", size=11, bold=True)
    fill_primary = PatternFill(start_color="1E3A8A", end_color="1E3A8A", fill_type="solid")
    fill_alt = PatternFill(start_color="F8FAFC", end_color="F8FAFC", fill_type="solid")
    fill_green = PatternFill(start_color="DCFCE7", end_color="DCFCE7", fill_type="solid")
    fill_amber = PatternFill(start_color="FEF3C7", end_color="FEF3C7", fill_type="solid")
    fill_red = PatternFill(start_color="FEE2E2", end_color="FEE2E2", fill_type="solid")
    
    border_thin = Border(
        left=Side(style='thin', color='CBD5E1'),
        right=Side(style='thin', color='CBD5E1'),
        top=Side(style='thin', color='CBD5E1'),
        bottom=Side(style='thin', color='CBD5E1')
    )

    # Sheet 1: Executive Summary
    ws1 = wb.active
    ws1.title = "Executive Summary"
    ws1.views.sheetView[0].showGridLines = True
    
    ws1["A1"] = "VidyutFleet — Executive EV Transition Report"
    ws1["A1"].font = font_title
    ws1["A2"] = "Optimizing EV adoption for Indian logistics fleets (CEEW 2024 & CEA v16 Standards)"
    ws1["A2"].font = Font(name="Calibri", size=11, italic=True, color="64748B")

    summary = analysis_results.get("summary", {})
    fin = analysis_results.get("financials", {})
    chg = analysis_results.get("charging_plan", {})
    sust = analysis_results.get("sustainability", {})

    kpi_rows = [
        ("Total Monitored Vehicles", summary.get("total_vehicles", 0)),
        ("Ready Now (Direct EV Transition)", summary.get("ready_now_count", 0)),
        ("Ready with Depot Charger", summary.get("ready_with_charger_count", 0)),
        ("Not Yet Viable (Keep ICE/CNG)", summary.get("not_yet_count", 0)),
        ("Overall Electrification Viability", f"{summary.get('electrification_rate_pct', 0)}%"),
        ("Minimum Shared Chargers Required", chg.get("min_chargers_required", 0)),
        ("Recommended Chargers (with buffer)", chg.get("recommended_chargers", 0)),
        ("Annual Net Fuel Savings (INR)", f"₹{fin.get('annual_net_savings_inr', 0):,}"),
        ("Total CAPEX Investment (INR)", f"₹{fin.get('total_capex_investment_inr', 0):,}"),
        ("Payback Period (Months)", f"{fin.get('payback_period', {}).get('months', 0)} Months"),
        ("Annual Simple ROI (%)", f"{fin.get('annual_roi_pct', 0)}%"),
        ("Net CO2 Abatement (Tonnes/Year)", f"{sust.get('annual_emissions_tonnes', {}).get('net_co2_abated_tonnes', 0)} Tonnes"),
        ("CO2 Percentage Reduction", f"{sust.get('annual_emissions_tonnes', {}).get('percentage_reduction', 0)}%")
    ]

    ws1["A4"] = "Key Performance Indicator (KPI)"
    ws1["B4"] = "Calculated Value"
    ws1["A4"].font = font_header
    ws1["B4"].font = font_header
    ws1["A4"].fill = fill_primary
    ws1["B4"].fill = fill_primary

    for r_idx, (k, v) in enumerate(kpi_rows, start=5):
        ws1[f"A{r_idx}"] = k
        ws1[f"B{r_idx}"] = v
        ws1[f"A{r_idx}"].border = border_thin
        ws1[f"B{r_idx}"].border = border_thin
        if r_idx % 2 == 0:
            ws1[f"A{r_idx}"].fill = fill_alt
            ws1[f"B{r_idx}"].fill = fill_alt

    # Sheet 2: Route Readiness Scores
    ws2 = wb.create_sheet(title="Route Readiness")
    ws2.views.sheetView[0].showGridLines = True
    
    headers_ws2 = [
        "Vehicle ID", "Route Name", "Depot", "Daily Distance (km)",
        "EV Readiness Score", "Rollout Verdict", "Route Feasibility (40%)",
        "Distance Fit (30%)", "Charging Fit (20%)", "Operational Fit (10%)",
        "Energy Req (kWh)", "Charge Duration (Hrs)", "Primary Explanation"
    ]
    for col_idx, h in enumerate(headers_ws2, 1):
        cell = ws2.cell(row=1, column=col_idx, value=h)
        cell.font = font_header
        cell.fill = fill_primary
        cell.alignment = Alignment(horizontal="center")

    records = analysis_results.get("records", [])
    for row_idx, r in enumerate(records, start=2):
        bd = r.get("breakdown", {})
        cn = r.get("charging_needs", {})
        
        ws2.cell(row=row_idx, column=1, value=r.get("vehicle_id"))
        ws2.cell(row=row_idx, column=2, value=r.get("route_name"))
        ws2.cell(row=row_idx, column=3, value=r.get("depot_id"))
        ws2.cell(row=row_idx, column=4, value=r.get("daily_distance_km"))
        ws2.cell(row=row_idx, column=5, value=r.get("score"))
        
        v_cell = ws2.cell(row=row_idx, column=6, value=r.get("verdict"))
        if r.get("verdict") == "Ready Now":
            v_cell.fill = fill_green
        elif r.get("verdict") == "Ready with Depot Charger":
            v_cell.fill = fill_amber
        else:
            v_cell.fill = fill_red

        ws2.cell(row=row_idx, column=7, value=bd.get("route_feasibility"))
        ws2.cell(row=row_idx, column=8, value=bd.get("distance_suitability"))
        ws2.cell(row=row_idx, column=9, value=bd.get("charging_feasibility"))
        ws2.cell(row=row_idx, column=10, value=bd.get("operational_suitability"))
        ws2.cell(row=row_idx, column=11, value=cn.get("kwh_required"))
        ws2.cell(row=row_idx, column=12, value=cn.get("charge_hours_required"))
        ws2.cell(row=row_idx, column=13, value=r.get("explanation"))

        for col_idx in range(1, 14):
            ws2.cell(row=row_idx, column=col_idx).border = border_thin

    # Sheet 3: Depot Charging Schedule
    ws3 = wb.create_sheet(title="Depot EDF Schedule")
    ws3.views.sheetView[0].showGridLines = True
    
    headers_ws3 = [
        "Assigned Bay", "Vehicle ID", "Route Name", "Start Time",
        "End Time", "Next Departure", "Duration (Hrs)", "Energy (kWh)",
        "Slack Buffer (Mins)", "Status"
    ]
    for col_idx, h in enumerate(headers_ws3, 1):
        cell = ws3.cell(row=1, column=col_idx, value=h)
        cell.font = font_header
        cell.fill = fill_primary
        cell.alignment = Alignment(horizontal="center")

    schedule = chg.get("gantt_schedule", [])
    for row_idx, s in enumerate(schedule, start=2):
        ws3.cell(row=row_idx, column=1, value=s.get("bay_id"))
        ws3.cell(row=row_idx, column=2, value=s.get("vehicle_id"))
        ws3.cell(row=row_idx, column=3, value=s.get("route_name"))
        ws3.cell(row=row_idx, column=4, value=s.get("start_time"))
        ws3.cell(row=row_idx, column=5, value=s.get("end_time"))
        ws3.cell(row=row_idx, column=6, value=s.get("departure_time"))
        ws3.cell(row=row_idx, column=7, value=s.get("duration_hours"))
        ws3.cell(row=row_idx, column=8, value=s.get("energy_kwh"))
        ws3.cell(row=row_idx, column=9, value=s.get("slack_buffer_mins"))
        ws3.cell(row=row_idx, column=10, value=s.get("status"))

        for col_idx in range(1, 11):
            ws3.cell(row=row_idx, column=col_idx).border = border_thin

    # Auto-adjust column widths for all sheets
    for ws in [ws1, ws2, ws3]:
        for col in ws.columns:
            max_len = 0
            col_letter = get_column_letter(col[0].column)
            for cell in col:
                val_str = str(cell.value or "")
                max_len = max(max_len, len(val_str))
            ws.column_dimensions[col_letter].width = max(12, min(50, max_len + 3))

    wb.save(output_path)
    return output_path
