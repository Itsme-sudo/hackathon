import React, { useState, useEffect } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, Legend 
} from 'recharts';
import { 
  Zap, Upload, RefreshCw, CheckCircle2, AlertTriangle, 
  XCircle, TrendingUp, Leaf, BatteryCharging, Clock, 
  FileText, ShieldCheck, HelpCircle, Layers
} from 'lucide-react';
import './App.css';

const API_BASE = "http://localhost:5000/api";

export default function App() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [subsidyActive, setSubsidyActive] = useState(true);
  const [activeTab, setActiveTab] = useState('tco');
  const [filterVerdict, setFilterVerdict] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedVehicle, setSelectedVehicle] = useState(null);

  // Fetch initial sample data
  const loadFleetData = async (subsidy = subsidyActive) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/sample?subsidy=${subsidy}`);
      if (!res.ok) throw new Error("Failed to load sample fleet data");
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error(err);
      setError("Could not reach backend API at http://localhost:5000. Running in offline fallback mode.");
      // Self-contained demo fallback
      loadLocalMock(subsidy);
    } finally {
      setLoading(false);
    }
  };

  const loadLocalMock = (subsidy) => {
    setData({
      summary: { ready_now: 17, ready_with_charger: 6, not_yet: 2, total: 25 },
      charging_plan: {
        min_chargers: 9,
        total_energy_kwh: 241.6,
        schedule: [
          { vehicle_id: "VF-101", route_name: "Ludhiana-FocalPoint-Industrial", bay_id: "Bay 1", start_time: "20:00", end_time: "22:45", departure_time: "06:00", duration_hours: 2.7, energy_kwh: 8.5, status: "On-Time Dispatch" },
          { vehicle_id: "VF-102", route_name: "ModelTown-SarabhaNagar-Express", bay_id: "Bay 2", start_time: "20:00", end_time: "22:15", departure_time: "06:30", duration_hours: 2.2, energy_kwh: 7.0, status: "On-Time Dispatch" },
          { vehicle_id: "VF-103", route_name: "Dugri-GillRoad-Suburban", bay_id: "Bay 3", start_time: "19:00", end_time: "22:15", departure_time: "05:30", duration_hours: 3.2, energy_kwh: 10.5, status: "On-Time Dispatch" },
          { vehicle_id: "VF-105", route_name: "IndustrialAreaA-TransportNagar", bay_id: "Bay 1", start_time: "22:45", end_time: "01:30", departure_time: "06:00", duration_hours: 2.8, energy_kwh: 9.5, status: "On-Time Dispatch" }
        ]
      },
      financials: {
        subsidy_active: subsidy,
        annual_costs: { ev: 875520, diesel: 1840800, cng: 1607400, petrol: 2195640 },
        annual_net_savings_inr: 965280,
        total_capex_investment_inr: subsidy ? 1265000 : 2415000,
        payback_months: subsidy ? 15.7 : 30.0,
        co2: { diesel_tonnes_year: 52.8, ev_tonnes_year: 19.4, net_abated_tonnes_year: 33.4, reduction_pct: 63.3 }
      },
      vehicles: [
        { vehicle_id: "VF-101", route_name: "Ludhiana-FocalPoint-Industrial", distance_km: 68, dwell_start: "19:30", dwell_end: "06:00", avg_payload_pct: 72, stop_count: 28, score: 87.5, verdict: "Ready now", metrics: { R_range_fit: 82.3, D_dwell_fit: 100, Q_payload_fit: 81.1, S_tariff_fit: 100 } },
        { vehicle_id: "VF-102", route_name: "ModelTown-SarabhaNagar-Express", distance_km: 52, dwell_start: "20:00", dwell_end: "06:30", avg_payload_pct: 60, stop_count: 35, score: 91.2, verdict: "Ready now", metrics: { R_range_fit: 86.5, D_dwell_fit: 100, Q_payload_fit: 86.0, S_tariff_fit: 100 } },
        { vehicle_id: "VF-107", route_name: "JalandharBypass-PhagwaraLink", distance_km: 155, dwell_start: "21:00", dwell_end: "05:00", avg_payload_pct: 92, stop_count: 12, score: 55.4, verdict: "Ready with depot charger", metrics: { R_range_fit: 20.0, D_dwell_fit: 88.0, Q_payload_fit: 65.0, S_tariff_fit: 82.0 } },
        { vehicle_id: "VF-111", route_name: "Khanna-MandiGobindgarh-Heavy", distance_km: 175, dwell_start: "21:30", dwell_end: "04:30", avg_payload_pct: 96, stop_count: 8, score: 43.8, verdict: "Not yet", metrics: { R_range_fit: 0.0, D_dwell_fit: 72.0, Q_payload_fit: 61.0, S_tariff_fit: 75.0 } }
      ]
    });
  };

  useEffect(() => {
    loadFleetData(subsidyActive);
  }, []);

  const handleSubsidyToggle = () => {
    const nextState = !subsidyActive;
    setSubsidyActive(nextState);
    loadFleetData(nextState);
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);
    formData.append("subsidy", subsidyActive ? "true" : "false");

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/upload`, {
        method: "POST",
        body: formData
      });
      if (!res.ok) throw new Error("Upload processing failed");
      const json = await res.json();
      setData(json);
    } catch (err) {
      alert("Error processing CSV: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!data && loading) {
    return (
      <div className="app-container" style={{ textAlign: 'center', paddingTop: 100 }}>
        <RefreshCw className="animate-spin" size={48} style={{ color: '#3B82F6', margin: '0 auto 16px' }} />
        <h2>Initializing VidyutFleet Analytical Engine...</h2>
        <p style={{ color: '#9CA3AF' }}>Loading Indian logistics dispatch dataset and computing EDF bay schedules</p>
      </div>
    );
  }

  const { summary, financials, charging_plan, vehicles } = data;

  // Chart data: Running cost benchmark (CEEW 2024)
  const costChartData = [
    { name: 'EV (Electric)', cost: 1.28, fill: '#10B981' },
    { name: 'CNG', cost: 2.35, fill: '#3B82F6' },
    { name: 'Diesel', cost: 2.69, fill: '#F59E0B' },
    { name: 'Petrol', cost: 3.21, fill: '#EF4444' }
  ];

  // Pie chart data: Readiness breakdown
  const pieData = [
    { name: 'Ready Now', value: summary.ready_now, color: '#10B981' },
    { name: 'Ready w/ Charger', value: summary.ready_with_charger, color: '#F59E0B' },
    { name: 'Not Yet', value: summary.not_yet, color: '#EF4444' }
  ];

  // Filtered vehicles
  const filteredVehicles = vehicles.filter(v => {
    const matchVerdict = filterVerdict === 'ALL' || 
      (filterVerdict === 'READY_NOW' && v.verdict === 'Ready now') ||
      (filterVerdict === 'CHARGER' && v.verdict === 'Ready with depot charger') ||
      (filterVerdict === 'NOT_YET' && v.verdict === 'Not yet');
    const matchSearch = v.vehicle_id.toLowerCase().includes(searchQuery.toLowerCase()) || 
      v.route_name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchVerdict && matchSearch;
  });

  return (
    <div className="app-container">
      {/* Top Brand Header */}
      <header className="top-header">
        <div className="brand-section">
          <div className="brand-logo">
            <Zap size={24} color="#FFFFFF" />
          </div>
          <div className="brand-info">
            <h1>VidyutFleet</h1>
            <p>Data-Driven Commercial Fleet Electrification & Depot Charger Optimization</p>
          </div>
        </div>

        <div className="header-badges">
          <span className="badge-pill badge-hackathon">
            <Layers size={14} /> SMART INDIA HACKATHON 2026
          </span>
          <span className="badge-pill badge-live">
            <ShieldCheck size={14} /> DEPOT ENGINE: LIVE
          </span>
        </div>
      </header>

      {/* Control Toolbar */}
      <section className="control-toolbar">
        <div className="action-buttons">
          <label className="btn-primary">
            <Upload size={16} /> Upload Dispatch CSV
            <input type="file" accept=".csv" onChange={handleFileUpload} style={{ display: 'none' }} />
          </label>

          <button className="btn-secondary" onClick={() => loadFleetData(subsidyActive)}>
            <RefreshCw size={16} /> Reload Fleet Sample (routes.csv)
          </button>
        </div>

        <div className="toggle-group">
          <span className="toggle-label">PM E-DRIVE Subsidy (₹50,000/veh):</span>
          <div 
            className={`toggle-switch ${subsidyActive ? 'active' : ''}`}
            onClick={handleSubsidyToggle}
            title="Toggle PM E-DRIVE / FAME-II Capital Subsidy On/Off"
          >
            <div className="toggle-handle"></div>
          </div>
          <span style={{ fontSize: 13, fontWeight: 700, color: subsidyActive ? '#10B981' : '#9CA3AF' }}>
            {subsidyActive ? "ACTIVE" : "OFF"}
          </span>
        </div>
      </section>

      {/* KPI Cards Grid */}
      <section className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-title">Monitored Fleet</div>
          <div className="kpi-value">{summary.total}</div>
          <div className="kpi-subtext">Commercial 3W/4W Delivery Vans</div>
        </div>

        <div className="kpi-card green">
          <div className="kpi-title">Electrification Rate</div>
          <div className="kpi-value">
            {Math.round(((summary.ready_now + summary.ready_with_charger) / summary.total) * 100)}%
          </div>
          <div className="kpi-subtext">{summary.ready_now + summary.ready_with_charger} of {summary.total} routes viable</div>
        </div>

        <div className="kpi-card amber">
          <div className="kpi-title">Depot Chargers Sized</div>
          <div className="kpi-value">{charging_plan.min_chargers} Bays</div>
          <div className="kpi-subtext">Optimized from 20 1:1 bays via EDF</div>
        </div>

        <div className="kpi-card green">
          <div className="kpi-title">Annual Fuel Savings</div>
          <div className="kpi-value">₹{(financials.annual_net_savings_inr / 100000).toFixed(2)}L</div>
          <div className="kpi-subtext">Net vs CEEW Diesel Baseline</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-title">CO₂ Abatement</div>
          <div className="kpi-value">{financials.co2.net_abated_tonnes_year} T</div>
          <div className="kpi-subtext">CEA v16 Grid Baseline (0.71 kg/kWh)</div>
        </div>

        <div className="kpi-card amber">
          <div className="kpi-title">Payback Period</div>
          <div className="kpi-value">{financials.payback_months} Mo</div>
          <div className="kpi-subtext">{subsidyActive ? "Subsidized ROI" : "Full CAPEX Baseline"}</div>
        </div>
      </section>

      {/* 3 Decision Verdict Overview */}
      <section className="verdict-overview">
        <div className="verdict-box ready-now">
          <div className="verdict-info">
            <h3 style={{ color: '#10B981' }}>READY NOW</h3>
            <p>Score ≥ 75 & Dwell ≥ 70 | Direct drop-in EV transition</p>
          </div>
          <div className="verdict-count" style={{ color: '#10B981' }}>{summary.ready_now}</div>
        </div>

        <div className="verdict-box ready-charger">
          <div className="verdict-info">
            <h3 style={{ color: '#F59E0B' }}>READY WITH DEPOT CHARGER</h3>
            <p>Score 50–74 | Requires dedicated overnight bay charging</p>
          </div>
          <div className="verdict-count" style={{ color: '#F59E0B' }}>{summary.ready_with_charger}</div>
        </div>

        <div className="verdict-box not-yet">
          <div className="verdict-info">
            <h3 style={{ color: '#EF4444' }}>NOT YET</h3>
            <p>Score &lt; 50 | Heavy payload or excessive distance (&gt;160 km)</p>
          </div>
          <div className="verdict-count" style={{ color: '#EF4444' }}>{summary.not_yet}</div>
        </div>
      </section>

      {/* Analytics Tabs & Visuals */}
      <section className="analytics-grid">
        {/* Left Visual Panel */}
        <div className="card-panel">
          <div className="panel-header">
            <div className="panel-title">
              <TrendingUp size={18} color="#3B82F6" />
              <span>Comparative Financial & Fleet Analytics</span>
            </div>

            <div className="tabs-nav">
              <button 
                className={`tab-btn ${activeTab === 'tco' ? 'active' : ''}`}
                onClick={() => setActiveTab('tco')}
              >
                Cost per km (CEEW)
              </button>
              <button 
                className={`tab-btn ${activeTab === 'annual' ? 'active' : ''}`}
                onClick={() => setActiveTab('annual')}
              >
                Annual Spend Comparison
              </button>
            </div>
          </div>

          <div style={{ height: 260, width: '100%' }}>
            {activeTab === 'tco' ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={costChartData} margin={{ top: 15, right: 20, left: 0, bottom: 5 }}>
                  <XAxis dataKey="name" stroke="#9CA3AF" tick={{ fontSize: 12 }} />
                  <YAxis stroke="#9CA3AF" unit=" ₹" />
                  <Tooltip 
                    contentStyle={{ background: '#1F2937', border: '1px solid #374151', borderRadius: 8 }}
                    formatter={(val) => [`₹${val} / km`, 'Running Cost']}
                  />
                  <Bar dataKey="cost" radius={[6, 6, 0, 0]}>
                    {costChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart 
                  data={[
                    { name: 'Diesel Baseline', amount: financials.annual_costs.diesel / 100000 },
                    { name: 'CNG Alternative', amount: financials.annual_costs.cng / 100000 },
                    { name: 'VidyutFleet EV Plan', amount: financials.annual_costs.ev / 100000 }
                  ]}
                  margin={{ top: 15, right: 20, left: 0, bottom: 5 }}
                >
                  <XAxis dataKey="name" stroke="#9CA3AF" />
                  <YAxis stroke="#9CA3AF" unit=" Lakhs" />
                  <Tooltip 
                    contentStyle={{ background: '#1F2937', border: '1px solid #374151', borderRadius: 8 }}
                    formatter={(val) => [`₹${val.toFixed(2)} Lakhs`, 'Annual Fuel Spend']}
                  />
                  <Bar dataKey="amount" fill="#3B82F6" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
          <p style={{ fontSize: 12, color: '#9CA3AF', marginTop: 12, textAlign: 'center' }}>
            Source: Council on Energy, Environment and Water (CEEW 2024). Commercial EV operation at ₹1.28/km cuts fuel expenses by 52.4% over diesel.
          </p>
        </div>

        {/* Right Pie Distribution Panel */}
        <div className="card-panel">
          <div className="panel-header">
            <div className="panel-title">
              <Zap size={18} color="#10B981" />
              <span>Fleet Readiness Share</span>
            </div>
          </div>

          <div style={{ height: 260, width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie 
                  data={pieData} 
                  innerRadius={60} 
                  outerRadius={85} 
                  paddingAngle={5} 
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`pie-cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ background: '#1F2937', border: '1px solid #374151', borderRadius: 8 }}
                  formatter={(val, name) => [`${val} Vehicles`, name]}
                />
                <Legend 
                  verticalAlign="bottom" 
                  height={36} 
                  formatter={(value) => <span style={{ color: '#D1D5DB', fontSize: 12 }}>{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <p style={{ fontSize: 11, color: '#9CA3AF', textAlign: 'center' }}>
            Multi-factor scoring: 0.40R + 0.30D + 0.20Q + 0.10S
          </p>
        </div>
      </section>

      {/* EDF Charging Bay Schedule Panel */}
      <section className="card-panel" style={{ marginBottom: 24 }}>
        <div className="panel-header">
          <div className="panel-title">
            <BatteryCharging size={18} color="#F59E0B" />
            <span>Earliest-Deadline-First (EDF) Depot Bay Staggered Schedule ({charging_plan.min_chargers} Sized Bays)</span>
          </div>
          <span style={{ fontSize: 12, color: '#9CA3AF' }}>
            Total Night Charging Demand: {charging_plan.total_energy_kwh} kWh
          </span>
        </div>

        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Assigned Bay</th>
                <th>Vehicle ID</th>
                <th>Route Name</th>
                <th>Charging Start</th>
                <th>Charging End</th>
                <th>Departure Time</th>
                <th>Duration (Hrs)</th>
                <th>Energy (kWh)</th>
                <th>Departure Cushion</th>
                <th>Dispatch Status</th>
              </tr>
            </thead>
            <tbody>
              {charging_plan.schedule.slice(0, 10).map((s, idx) => (
                <tr key={idx}>
                  <td style={{ fontWeight: 700, color: '#3B82F6' }}>{s.bay_id}</td>
                  <td style={{ fontWeight: 600 }}>{s.vehicle_id}</td>
                  <td>{s.route_name}</td>
                  <td>{s.start_time}</td>
                  <td>{s.end_time}</td>
                  <td style={{ color: '#F59E0B' }}>{s.departure_time}</td>
                  <td>{s.duration_hours} hrs</td>
                  <td>{s.energy_kwh} kWh</td>
                  <td>+{s.buffer_mins} mins</td>
                  <td>
                    <span className="badge-tag badge-green">
                      <CheckCircle2 size={12} style={{ display: 'inline', marginRight: 4 }} />
                      {s.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: 12, color: '#9CA3AF', marginTop: 12 }}>
          Showing top 10 scheduled bay sessions. Greedily allocates bays to vehicles with the earliest morning departure deadline, preventing depot transformer overloading.
        </p>
      </section>

      {/* Detailed Vehicle Feasibility Table */}
      <section className="card-panel">
        <div className="panel-header" style={{ flexWrap: 'wrap', gap: 12 }}>
          <div className="panel-title">
            <FileText size={18} color="#3B82F6" />
            <span>Route-by-Route Feasibility Inspector ({filteredVehicles.length} Records)</span>
          </div>

          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <input 
              type="text" 
              placeholder="Search route or vehicle ID..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid var(--border-light)',
                color: 'white',
                padding: '6px 12px',
                borderRadius: 8,
                fontSize: 12
              }}
            />

            <select 
              value={filterVerdict} 
              onChange={(e) => setFilterVerdict(e.target.value)}
              style={{
                background: '#1F2937',
                border: '1px solid var(--border-light)',
                color: 'white',
                padding: '6px 12px',
                borderRadius: 8,
                fontSize: 12
              }}
            >
              <option value="ALL">All Verdicts ({vehicles.length})</option>
              <option value="READY_NOW">Ready Now ({summary.ready_now})</option>
              <option value="CHARGER">Ready w/ Charger ({summary.ready_with_charger})</option>
              <option value="NOT_YET">Not Yet ({summary.not_yet})</option>
            </select>
          </div>
        </div>

        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Vehicle ID</th>
                <th>Route Name</th>
                <th>Daily Distance</th>
                <th>Dwell Window</th>
                <th>Payload %</th>
                <th>Stops</th>
                <th>Feasibility Score</th>
                <th>Rollout Verdict</th>
                <th>Factor Inspection (R | D | Q | S)</th>
              </tr>
            </thead>
            <tbody>
              {filteredVehicles.map((v) => (
                <tr key={v.vehicle_id}>
                  <td style={{ fontWeight: 700 }}>{v.vehicle_id}</td>
                  <td>{v.route_name}</td>
                  <td>{v.distance_km} km</td>
                  <td>{v.dwell_start} → {v.dwell_end} ({v.metrics.dwell_hours}h)</td>
                  <td>{v.avg_payload_pct}%</td>
                  <td>{v.stop_count}</td>
                  <td>
                    <span style={{ 
                      fontWeight: 800, 
                      color: v.score >= 75 ? '#10B981' : v.score >= 50 ? '#F59E0B' : '#EF4444' 
                    }}>
                      {v.score} / 100
                    </span>
                  </td>
                  <td>
                    <span className={`badge-tag ${
                      v.verdict === 'Ready now' ? 'badge-green' : 
                      v.verdict === 'Ready with depot charger' ? 'badge-amber' : 'badge-red'
                    }`}>
                      {v.verdict}
                    </span>
                  </td>
                  <td style={{ fontSize: 11, color: '#9CA3AF', fontFamily: 'monospace' }}>
                    R:{v.metrics.R_range_fit} | D:{v.metrics.D_dwell_fit} | Q:{v.metrics.Q_payload_fit} | S:{v.metrics.S_tariff_fit}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Footer / Academic Accreditation */}
      <footer style={{ marginTop: 40, textAlign: 'center', color: '#6B7280', fontSize: 12, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 20 }}>
        <p>VidyutFleet · GNDEC Ludhiana · HACKNAUTS 2.0 / Smart India Hackathon 2026</p>
        <p style={{ marginTop: 4 }}>
          Algorithmic Framework: WEVJ 2024 Depot Optimization | TCO Benchmarking: CEEW 2024 | Grid Emissions: CEA CO₂ Baseline v16
        </p>
      </footer>
    </div>
  );
}
