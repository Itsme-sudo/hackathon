import React, { useState, useEffect, useMemo } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, Legend, LineChart, Line, AreaChart, Area
} from 'recharts';
import { 
  Truck, BatteryCharging, DollarSign, Leaf, Settings, Upload, 
  MessageSquare, Zap, ShieldCheck, Download, RefreshCw, CheckCircle2, 
  AlertTriangle, XCircle, Search, Filter, ChevronRight, X, ArrowUpRight,
  Sliders, RotateCcw, Building2
} from 'lucide-react';
import './App.css';

const API_BASE = "http://localhost:5000/api";

export default function App() {
  const [currentView, setCurrentView] = useState('FLEET');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeFileName, setActiveFileName] = useState("fleet_routes.csv (120 Vehicles, 3 Depots)");
  
  // Dynamic Real-Time Sliders for Finance sensitivity
  const [subsidyActive, setSubsidyActive] = useState(true);
  const [dieselPriceSlider, setDieselPriceSlider] = useState(94.5);
  const [tariffSlider, setTariffSlider] = useState(7.5);
  
  // Depot Filter for Depot Manager View
  const [selectedDepot, setSelectedDepot] = useState('ALL');
  
  // AI Advisor drawer state
  const [advisorOpen, setAdvisorOpen] = useState(false);
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: 'Hello! I am VidyutFleet Advisor. Ask me anything about your fleet readiness scores, EDF depot bay schedules, or CEEW/CEA payback calculations.',
      citations: ['VidyutFleet Knowledge Base']
    }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  // Table Filters & Modal
  const [searchQuery, setSearchQuery] = useState('');
  const [verdictFilter, setVerdictFilter] = useState('ALL');
  const [selectedVehicle, setSelectedVehicle] = useState(null);

  // Load initial data
  const fetchAnalysis = async (sub = subsidyActive, dPrice = dieselPriceSlider, eTariff = tariffSlider) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/analysis/latest?subsidy=${sub}&diesel_price=${dPrice}&electricity_tariff=${eTariff}`);
      if (!res.ok) throw new Error("Backend query failed");
      const json = await res.json();
      setData(json);
    } catch (e) {
      console.warn("Using offline fallback mode", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalysis(subsidyActive, dieselPriceSlider, tariffSlider);
  }, []);

  // Handle subsidy toggle with real-time reactive update
  const handleSubsidyToggle = () => {
    const next = !subsidyActive;
    setSubsidyActive(next);
  };

  const resetFinanceSliders = () => {
    setDieselPriceSlider(94.5);
    setTariffSlider(7.5);
    setSubsidyActive(true);
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/uploads/csv`, { method: "POST", body: formData });
      const upl = await res.json();
      
      const runRes = await fetch(`${API_BASE}/analysis/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          uploadId: upl.uploadId, 
          subsidyActive,
          dieselPrice: dieselPriceSlider,
          electricityTariff: tariffSlider 
        })
      });
      const runJson = await runRes.json();
      setData(runJson);
      setActiveFileName(file.name);
      alert(`CSV "${file.name}" uploaded & analyzed dynamically!`);
      setCurrentView('FLEET');
    } catch (err) {
      alert("Upload failed: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadPresetFleet = async (presetName) => {
    setLoading(true);
    try {
      await fetchAnalysis(subsidyActive, dieselPriceSlider, tariffSlider);
      setActiveFileName(presetName);
      alert(`Loaded ${presetName} successfully!`);
    } catch (e) {
      alert("Failed to load preset");
    } finally {
      setLoading(false);
    }
  };

  const sendChatMessage = async (textToSend) => {
    const query = textToSend || chatInput;
    if (!query.trim()) return;

    const userMsg = { role: 'user', content: query };
    setMessages(prev => [...prev, userMsg]);
    setChatInput('');
    setChatLoading(true);

    try {
      const res = await fetch(`${API_BASE}/assistant/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query })
      });
      const data = await res.json();
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.answer,
        citations: data.citations || []
      }]);
    } catch (e) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: "I do not have sufficient route or tariff data in your uploaded dispatch logs to answer this accurately.",
        citations: []
      }]);
    } finally {
      setChatLoading(false);
    }
  };

  // Base payload extracted
  const { summary, charging_plan, financials, sustainability, records, priority_transition_queue } = data || {};

  // ====================================================================
  // DYNAMIC REACTIVE COMPUTATIONS: Instantly recalculates on slider changes
  // ====================================================================
  const reactiveFinancials = useMemo(() => {
    const electrifiableVehicles = (records || []).filter(
      r => r.verdict === 'Ready Now' || r.verdict === 'Ready with Depot Charger'
    );
    const electrifiableCount = electrifiableVehicles.length;
    const totalDailyKm = electrifiableVehicles.reduce((acc, v) => acc + (parseFloat(v.daily_distance_km) || 0), 0);
    const annualKm = totalDailyKm * 300;

    // Diesel running cost scaled with diesel price slider (Base 94.5 INR/L -> 2.69 INR/km)
    const dieselCostPerKm = Math.round((2.69 * (dieselPriceSlider / 94.5)) * 100) / 100;
    // EV running cost scaled with tariff slider (Base 7.5 INR/kWh -> 1.28 INR/km)
    const evCostPerKm = Math.round((1.28 * (tariffSlider / 7.5)) * 100) / 100;

    const annualDieselFuelSpend = Math.round(annualKm * dieselCostPerKm);
    const annualEvFuelSpend = Math.round(annualKm * evCostPerKm);
    const annualMaintenanceSavings = electrifiableCount * 17000;
    const annualNetSavings = Math.round((annualDieselFuelSpend - annualEvFuelSpend) + annualMaintenanceSavings);

    const recBays = charging_plan?.recommended_chargers || 27;
    const subsidyPerVeh = subsidyActive ? 50000 : 0;
    const capexDeltaPerVeh = 90000 - subsidyPerVeh;
    const chargerCapex = recBays * 45000;
    const batteryReserve = Math.round(capexDeltaPerVeh * 0.10 * electrifiableCount);
    const totalCapex = Math.max(1000, (capexDeltaPerVeh * electrifiableCount) + chargerCapex + batteryReserve);

    const paybackYears = annualNetSavings > 0 ? totalCapex / annualNetSavings : 0;
    const paybackMonths = Math.round(paybackYears * 12.0 * 10) / 10;
    const roiPercent = annualNetSavings > 0 ? Math.round((annualNetSavings / totalCapex) * 1000) / 10 : 0;

    const fiveYearTcoBenefit = Math.round((annualNetSavings * 5) - totalCapex);
    const tenYearTcoBenefit = Math.round((annualNetSavings * 10) - totalCapex - (electrifiableCount * 75000));

    return {
      electrifiableCount,
      annualKm,
      dieselCostPerKm,
      evCostPerKm,
      annualDieselFuelSpend,
      annualEvFuelSpend,
      annualNetSavings,
      totalCapex,
      paybackMonths,
      paybackYears: Math.round(paybackYears * 100) / 100,
      roiPercent,
      fiveYearTcoBenefit,
      tenYearTcoBenefit
    };
  }, [records, dieselPriceSlider, tariffSlider, subsidyActive, charging_plan]);

  // ====================================================================
  // DEPOT DYNAMIC FILTER: Recalculates chargers and timeline by depot
  // ====================================================================
  const reactiveDepotMetrics = useMemo(() => {
    const allRecords = records || [];
    const depotFilteredVehicles = selectedDepot === 'ALL'
      ? allRecords
      : allRecords.filter(r => r.depot_id === selectedDepot);

    const depotEligible = depotFilteredVehicles.filter(
      r => r.verdict === 'Ready Now' || r.verdict === 'Ready with Depot Charger'
    );

    const depotTotalKwh = Math.round(
      depotEligible.reduce((acc, v) => acc + (v.charging_needs?.kwh_required || 0), 0) * 10
    ) / 10;

    // Sizing for this depot
    const minBays = Math.max(1, Math.ceil(depotTotalKwh / (3.3 * 9.5 * 0.85)));
    const recBays = Math.ceil(minBays * 1.25);
    const peakKw = Math.min(depotEligible.length, recBays) * 3.3;

    // Filtered Gantt schedule
    const schedule = (charging_plan?.gantt_schedule || []).filter(s => {
      if (selectedDepot === 'ALL') return true;
      const v = allRecords.find(r => r.vehicle_id === s.vehicle_id);
      return v ? v.depot_id === selectedDepot : true;
    });

    return {
      depotVehiclesCount: depotFilteredVehicles.length,
      depotEligibleCount: depotEligible.length,
      depotTotalKwh,
      minBays,
      recBays,
      peakKw: Math.round(peakKw * 10) / 10,
      schedule
    };
  }, [records, charging_plan, selectedDepot]);

  // Dynamic bar chart data reacting to sliders
  const dynamicCostChartData = [
    { powertrain: 'Electric (EV)', cost: reactiveFinancials.evCostPerKm, fill: '#10B981', note: `Tariff: ₹${tariffSlider}/kWh` },
    { powertrain: 'CNG', cost: 2.35, fill: '#3B82F6', note: '₹85/kg' },
    { powertrain: 'Diesel', cost: reactiveFinancials.dieselCostPerKm, fill: '#F59E0B', note: `Price: ₹${dieselPriceSlider}/L` },
    { powertrain: 'Petrol', cost: 3.21, fill: '#EF4444', note: '₹105/L' }
  ];

  // Pie chart data
  const pieReadiness = [
    { name: 'Ready Now', value: summary?.ready_now_count || 0, color: '#10B981' },
    { name: 'Ready w/ Charger', value: summary?.ready_with_charger_count || 0, color: '#F59E0B' },
    { name: 'Not Yet', value: summary?.not_yet_count || 0, color: '#EF4444' }
  ];

  // Filter vehicles
  const filteredVehicles = (records || []).filter(v => {
    const matchVerdict = verdictFilter === 'ALL' || 
      (verdictFilter === 'READY_NOW' && v.verdict === 'Ready Now') ||
      (verdictFilter === 'CHARGER' && v.verdict === 'Ready with Depot Charger') ||
      (verdictFilter === 'NOT_YET' && v.verdict === 'Not Yet');
    const matchQuery = v.vehicle_id.toLowerCase().includes(searchQuery.toLowerCase()) || 
      v.route_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      v.depot_id.toLowerCase().includes(searchQuery.toLowerCase());
    return matchVerdict && matchQuery;
  });

  if (!data && loading) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: '#0B0F19', color: 'white' }}>
        <RefreshCw className="animate-spin" size={40} style={{ color: '#2563EB', marginRight: 12 }} />
        <h2>Initializing VidyutFleet Multi-Agent Engine...</h2>
      </div>
    );
  }

  return (
    <div className="app-shell">
      {/* Sidebar Navigation */}
      <aside className="app-sidebar">
        <div className="sidebar-brand">
          <div className="brand-icon">
            <Zap size={22} color="white" />
          </div>
          <div className="brand-text">
            <h1>VidyutFleet</h1>
            <span>Smart India Hackathon 2026</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <button 
            className={`nav-item ${currentView === 'FLEET' ? 'active' : ''}`}
            onClick={() => setCurrentView('FLEET')}
          >
            <Truck size={18} /> Fleet Manager View
          </button>

          <button 
            className={`nav-item ${currentView === 'DEPOT' ? 'active' : ''}`}
            onClick={() => setCurrentView('DEPOT')}
          >
            <BatteryCharging size={18} /> Depot Manager View
          </button>

          <button 
            className={`nav-item ${currentView === 'FINANCE' ? 'active' : ''}`}
            onClick={() => setCurrentView('FINANCE')}
          >
            <DollarSign size={18} /> Finance Team View
          </button>

          <button 
            className={`nav-item ${currentView === 'SUSTAINABILITY' ? 'active' : ''}`}
            onClick={() => setCurrentView('SUSTAINABILITY')}
          >
            <Leaf size={18} /> Sustainability View
          </button>

          <button 
            className={`nav-item ${currentView === 'UPLOAD' ? 'active' : ''}`}
            onClick={() => setCurrentView('UPLOAD')}
          >
            <Upload size={18} /> CSV Upload & Ingest
          </button>

          <button 
            className={`nav-item ${currentView === 'ADMIN' ? 'active' : ''}`}
            onClick={() => setCurrentView('ADMIN')}
          >
            <Settings size={18} /> Admin & Catalogue
          </button>
        </nav>

        <div className="sidebar-footer">
          <p style={{ fontWeight: 700, color: '#E2E8F0' }}>Active Dataset:</p>
          <p style={{ marginTop: 2, color: '#38BDF8', fontSize: 11, wordBreak: 'break-all' }}>{activeFileName}</p>
          <p style={{ marginTop: 8, color: '#64748B' }}>Team Vidyut · GNDEC Ludhiana</p>
        </div>
      </aside>

      {/* Main Wrapper */}
      <div className="main-wrapper">
        {/* Top Navbar */}
        <header className="app-navbar">
          <div className="navbar-status">
            <span className="status-badge">
              <ShieldCheck size={14} /> LIVE REACTIVE ENGINE
            </span>
            <span style={{ fontSize: 13, color: '#94A3B8' }}>
              Active Fleet: <strong>{summary?.total_vehicles || 0} Vehicles across 3 Depots</strong>
            </span>
          </div>

          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <a 
              href={`${API_BASE}/reports/excel?subsidy=${subsidyActive}`}
              download 
              className="btn-secondary"
              style={{ textDecoration: 'none', padding: '6px 14px', fontSize: 12 }}
            >
              <Download size={14} /> Download Excel Report
            </a>

            <button 
              className="btn-primary" 
              style={{ padding: '6px 14px', fontSize: 12 }}
              onClick={() => setAdvisorOpen(true)}
            >
              <MessageSquare size={14} /> VidyutFleet Advisor (RAG)
            </button>
          </div>
        </header>

        {/* Dynamic Content Views */}
        <main className="content-body">
          {/* Top Shared KPI Row: Values React Immediately to Data & Sliders */}
          <div className="kpi-row">
            <div className="kpi-box">
              <div className="kpi-label">Monitored Fleet</div>
              <div className="kpi-num">{summary?.total_vehicles || 0}</div>
              <div className="kpi-sub">Commercial 3W & LCVs</div>
            </div>

            <div className="kpi-box green">
              <div className="kpi-label">Electrification Rate</div>
              <div className="kpi-num">{summary?.electrification_rate_pct || 0}%</div>
              <div className="kpi-sub">{(summary?.ready_now_count || 0) + (summary?.ready_with_charger_count || 0)} of {summary?.total_vehicles || 0} Viable</div>
            </div>

            <div className="kpi-box amber">
              <div className="kpi-label">Depot Chargers Sized</div>
              <div className="kpi-num">{charging_plan?.recommended_chargers || 0} Bays</div>
              <div className="kpi-sub">EDF Overlap Lower Bound</div>
            </div>

            <div className="kpi-box green">
              <div className="kpi-label">Annual Net Savings (Dynamic)</div>
              <div className="kpi-num">₹{(reactiveFinancials.annualNetSavings / 100000).toFixed(1)}L</div>
              <div className="kpi-sub">Reactive at ₹{dieselPriceSlider}/L Diesel</div>
            </div>

            <div className="kpi-box amber">
              <div className="kpi-label">Payback Period (Dynamic)</div>
              <div className="kpi-num">{reactiveFinancials.paybackMonths} Mo</div>
              <div className="kpi-sub">{subsidyActive ? "PM E-DRIVE Active" : "Unsubsidized Baseline"}</div>
            </div>

            <div className="kpi-box">
              <div className="kpi-label">Well-to-Wheel CO₂ Abated</div>
              <div className="kpi-num">{sustainability?.annual_emissions_tonnes?.net_co2_abated_tonnes || 0} T</div>
              <div className="kpi-sub">CEA Grid Factor (0.675 kg/kWh)</div>
            </div>
          </div>

          {/* ==================================================== */}
          {/* VIEW 1: FLEET MANAGER VIEW                           */}
          {/* ==================================================== */}
          {currentView === 'FLEET' && (
            <div>
              {/* Transition Priority Queue Card */}
              <div className="glass-panel">
                <div className="panel-title-bar">
                  <div className="panel-heading">
                    <Truck size={18} color="#2563EB" />
                    <span>Top Transition Priority Queue (Recommended First Rollout Batch)</span>
                  </div>
                  <span style={{ fontSize: 12, color: '#94A3B8' }}>Sorted by Multi-Factor Feasibility Score</span>
                </div>

                <div className="table-responsive">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Rollout Priority</th>
                        <th>Vehicle Code</th>
                        <th>Route Name</th>
                        <th>Depot</th>
                        <th>Daily Distance</th>
                        <th>Feasibility Score</th>
                        <th>Rollout Verdict</th>
                        <th>Recharge Duration</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(priority_transition_queue || []).slice(0, 8).map((v, i) => (
                        <tr key={v.vehicle_id}>
                          <td style={{ fontWeight: 800, color: '#60A5FA' }}>#{i + 1}</td>
                          <td style={{ fontWeight: 700 }}>{v.vehicle_id}</td>
                          <td>{v.route_name}</td>
                          <td style={{ color: '#94A3B8' }}>{v.depot_id}</td>
                          <td>{v.daily_distance_km} km</td>
                          <td style={{ fontWeight: 800, color: '#10B981' }}>{v.score} / 100</td>
                          <td>
                            <span className={v.verdict === 'Ready Now' ? 'badge-ready-now' : 'badge-charger'}>
                              {v.verdict}
                            </span>
                          </td>
                          <td>{v.charging_needs?.charge_hours_required} hrs</td>
                          <td>
                            <button 
                              className="btn-secondary" 
                              style={{ padding: '4px 10px', fontSize: 11 }}
                              onClick={() => setSelectedVehicle(v)}
                            >
                              Inspect Factor Breakdown
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Full Fleet Table */}
              <div className="glass-panel">
                <div className="panel-title-bar" style={{ flexWrap: 'wrap', gap: 12 }}>
                  <div className="panel-heading">
                    <span>Complete Route Readiness Master Explorer ({filteredVehicles.length} Vehicles)</span>
                  </div>

                  <div style={{ display: 'flex', gap: 12 }}>
                    <div style={{ position: 'relative' }}>
                      <input 
                        type="text" 
                        placeholder="Search vehicle, route, depot..." 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={{
                          background: 'rgba(255,255,255,0.05)',
                          border: '1px solid var(--border-light)',
                          color: 'white',
                          padding: '6px 12px 6px 30px',
                          borderRadius: 8,
                          fontSize: 12
                        }}
                      />
                      <Search size={14} style={{ position: 'absolute', left: 10, top: 9, color: '#94A3B8' }} />
                    </div>

                    <select 
                      value={verdictFilter}
                      onChange={(e) => setVerdictFilter(e.target.value)}
                      style={{
                        background: '#1E293B',
                        border: '1px solid var(--border-light)',
                        color: 'white',
                        padding: '6px 12px',
                        borderRadius: 8,
                        fontSize: 12
                      }}
                    >
                      <option value="ALL">All Verdicts</option>
                      <option value="READY_NOW">Ready Now ({summary?.ready_now_count || 0})</option>
                      <option value="CHARGER">Ready w/ Charger ({summary?.ready_with_charger_count || 0})</option>
                      <option value="NOT_YET">Not Yet ({summary?.not_yet_count || 0})</option>
                    </select>
                  </div>
                </div>

                <div className="table-responsive">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Vehicle Code</th>
                        <th>Route Name</th>
                        <th>Depot</th>
                        <th>Distance</th>
                        <th>EV Score</th>
                        <th>Rollout Verdict</th>
                        <th>Component Breakdown (R | D | Q | S)</th>
                        <th>Why This Verdict?</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredVehicles.slice(0, 25).map((v) => (
                        <tr key={v.vehicle_id}>
                          <td style={{ fontWeight: 700 }}>{v.vehicle_id}</td>
                          <td>{v.route_name}</td>
                          <td>{v.depot_id}</td>
                          <td>{v.daily_distance_km} km</td>
                          <td style={{ fontWeight: 800, color: v.score >= 80 ? '#10B981' : v.score >= 60 ? '#F59E0B' : '#EF4444' }}>
                            {v.score}
                          </td>
                          <td>
                            <span className={
                              v.verdict === 'Ready Now' ? 'badge-ready-now' :
                              v.verdict === 'Ready with Depot Charger' ? 'badge-charger' : 'badge-not-yet'
                            }>
                              {v.verdict}
                            </span>
                          </td>
                          <td style={{ fontSize: 11, fontFamily: 'monospace', color: '#94A3B8' }}>
                            R:{v.breakdown?.route_feasibility} | D:{v.breakdown?.distance_suitability} | C:{v.breakdown?.charging_feasibility} | O:{v.breakdown?.operational_suitability}
                          </td>
                          <td style={{ fontSize: 12, color: '#CBD5E1' }}>{v.explanation}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ==================================================== */}
          {/* VIEW 2: DEPOT MANAGER VIEW (Dynamic Multi-Depot)    */}
          {/* ==================================================== */}
          {currentView === 'DEPOT' && (
            <div>
              {/* Depot Selector Filter Bar */}
              <div className="glass-panel" style={{ padding: '14px 20px', marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Building2 size={20} color="#38BDF8" />
                    <span style={{ fontSize: 14, fontWeight: 700 }}>Select Depot Infrastructure Hub:</span>
                  </div>

                  <select 
                    value={selectedDepot}
                    onChange={(e) => setSelectedDepot(e.target.value)}
                    style={{
                      background: '#1E293B',
                      border: '1px solid var(--border-accent)',
                      color: '#F8FAFC',
                      padding: '8px 16px',
                      borderRadius: 8,
                      fontSize: 13,
                      fontWeight: 600
                    }}
                  >
                    <option value="ALL">All Depots (Ludhiana + Delhi NCR + Chandigarh Hubs)</option>
                    <option value="D01">D01 — Ludhiana Main Depot (Punjab)</option>
                    <option value="D02">D02 — Delhi NCR Gateway Hub (Gurugram)</option>
                    <option value="D03">D03 — Chandigarh Logistics Hub (Mohali)</option>
                  </select>
                </div>
              </div>

              {/* Dynamic Depot KPIs */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, marginBottom: 24 }}>
                <div className="kpi-box">
                  <div className="kpi-label">Minimum Chargers Required</div>
                  <div className="kpi-num">{reactiveDepotMetrics.minBays}</div>
                  <div className="kpi-sub">Dwell Overlap Lower Bound ({selectedDepot})</div>
                </div>

                <div className="kpi-box green">
                  <div className="kpi-label">Recommended Sized Bays</div>
                  <div className="kpi-num">{reactiveDepotMetrics.recBays} Bays</div>
                  <div className="kpi-sub">Includes 25% Operational Reserve</div>
                </div>

                <div className="kpi-box amber">
                  <div className="kpi-label">Peak Grid Load Demand</div>
                  <div className="kpi-num">{reactiveDepotMetrics.peakKw} kW</div>
                  <div className="kpi-sub">Simultaneous 3.3 kW Charging Bays</div>
                </div>

                <div className="kpi-box">
                  <div className="kpi-label">Depot Nightly Energy Demand</div>
                  <div className="kpi-num">{reactiveDepotMetrics.depotTotalKwh} kWh</div>
                  <div className="kpi-sub">{reactiveDepotMetrics.depotEligibleCount} Returning Electric Vehicles</div>
                </div>
              </div>

              {/* Gantt Schedule Table Filtered by Depot */}
              <div className="glass-panel">
                <div className="panel-title-bar">
                  <div className="panel-heading">
                    <BatteryCharging size={18} color="#F59E0B" />
                    <span>Earliest-Deadline-First (EDF) Bay Staggered Schedule — {selectedDepot === 'ALL' ? 'All Depots' : selectedDepot} ({reactiveDepotMetrics.schedule.length} Sessions)</span>
                  </div>
                  <span style={{ fontSize: 12, color: '#10B981' }}>
                    Zero Transformer Overloading · Sorted by Earliest Departure
                  </span>
                </div>

                <div className="table-responsive">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Allocated Bay</th>
                        <th>Vehicle ID</th>
                        <th>Route Name</th>
                        <th>Charging Start</th>
                        <th>Charging Finish</th>
                        <th>Next Departure Deadline</th>
                        <th>Duration</th>
                        <th>Energy Delivered</th>
                        <th>Departure Slack Cushion</th>
                        <th>Dispatch Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reactiveDepotMetrics.schedule.slice(0, 15).map((s, idx) => (
                        <tr key={idx}>
                          <td style={{ fontWeight: 800, color: '#38BDF8' }}>{s.bay_id}</td>
                          <td style={{ fontWeight: 700 }}>{s.vehicle_id}</td>
                          <td>{s.route_name}</td>
                          <td>{s.start_time}</td>
                          <td>{s.end_time}</td>
                          <td style={{ color: '#F59E0B', fontWeight: 600 }}>{s.departure_time}</td>
                          <td>{s.duration_hours} hrs</td>
                          <td>{s.energy_kwh} kWh</td>
                          <td>+{s.slack_buffer_mins} mins</td>
                          <td>
                            <span className="status-badge">
                              <CheckCircle2 size={12} /> {s.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ==================================================== */}
          {/* VIEW 3: FINANCE TEAM VIEW (Real-Time Reactive Math)  */}
          {/* ==================================================== */}
          {currentView === 'FINANCE' && (
            <div>
              {/* Interactive Sensitivity Controls */}
              <div className="glass-panel" style={{ background: 'rgba(30, 41, 59, 0.4)' }}>
                <div className="panel-title-bar">
                  <div className="panel-heading">
                    <Sliders size={18} color="#10B981" />
                    <span>Real-Time Financial Simulator (Move Sliders to Instantly Recalculate)</span>
                  </div>
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button 
                      onClick={resetFinanceSliders}
                      className="btn-secondary"
                      style={{ padding: '4px 10px', fontSize: 11 }}
                      title="Reset parameters to CEEW & National benchmarks"
                    >
                      <RotateCcw size={12} /> Reset to Defaults
                    </button>

                    <button 
                      onClick={handleSubsidyToggle}
                      className="btn-primary"
                      style={{ padding: '6px 14px', fontSize: 12, background: subsidyActive ? '#10B981' : '#64748B' }}
                    >
                      {subsidyActive ? "PM E-DRIVE Subsidy (₹50K) ON" : "Subsidy OFF (Unsubsidized)"}
                    </button>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
                  <div className="slider-group">
                    <div className="slider-label">
                      <span>Diesel Fuel Price (INR / Liter)</span>
                      <strong style={{ color: '#F59E0B', fontSize: 14 }}>₹{dieselPriceSlider.toFixed(1)} / L</strong>
                    </div>
                    <input 
                      type="range" 
                      min="80" 
                      max="120" 
                      step="0.5" 
                      value={dieselPriceSlider} 
                      onChange={(e) => setDieselPriceSlider(parseFloat(e.target.value))} 
                    />
                    <span style={{ fontSize: 11, color: '#64748B' }}>
                      Calculated Diesel Cost: <strong>₹{reactiveFinancials.dieselCostPerKm}/km</strong>
                    </span>
                  </div>

                  <div className="slider-group">
                    <div className="slider-label">
                      <span>Commercial Electricity Tariff (INR / kWh)</span>
                      <strong style={{ color: '#10B981', fontSize: 14 }}>₹{tariffSlider.toFixed(1)} / kWh</strong>
                    </div>
                    <input 
                      type="range" 
                      min="5.0" 
                      max="12.0" 
                      step="0.25" 
                      value={tariffSlider} 
                      onChange={(e) => setTariffSlider(parseFloat(e.target.value))} 
                    />
                    <span style={{ fontSize: 11, color: '#64748B' }}>
                      Calculated EV Running Cost: <strong>₹{reactiveFinancials.evCostPerKm}/km</strong>
                    </span>
                  </div>
                </div>
              </div>

              {/* Charts & TCO Metrics */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
                <div className="glass-panel">
                  <div className="panel-title-bar">
                    <span className="panel-heading">Reactive Running Cost per km (CEEW 2024 Benchmark)</span>
                  </div>
                  <div style={{ height: 260 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={dynamicCostChartData}>
                        <XAxis dataKey="powertrain" stroke="#94A3B8" />
                        <YAxis stroke="#94A3B8" unit=" ₹" />
                        <Tooltip 
                          contentStyle={{ background: '#1E293B', border: '1px solid #334155', borderRadius: 8 }}
                          formatter={(val) => [`₹${val} / km`, 'Running Cost']}
                        />
                        <Bar dataKey="cost" radius={[6, 6, 0, 0]}>
                          {dynamicCostChartData.map((e, i) => (
                            <Cell key={i} fill={e.fill} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <p style={{ fontSize: 11, color: '#94A3B8', marginTop: 8, textAlign: 'center' }}>
                    EV at ₹{reactiveFinancials.evCostPerKm}/km vs Diesel at ₹{reactiveFinancials.dieselCostPerKm}/km. Net difference: ₹{(reactiveFinancials.dieselCostPerKm - reactiveFinancials.evCostPerKm).toFixed(2)}/km!
                  </p>
                </div>

                <div className="glass-panel">
                  <div className="panel-title-bar">
                    <span className="panel-heading">Dynamic Financial Savings & Payback</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: 'rgba(255,255,255,0.02)', borderRadius: 8 }}>
                      <span style={{ color: '#94A3B8' }}>Net Annual Operating Fuel Savings:</span>
                      <strong style={{ color: '#10B981', fontSize: 16 }}>₹{reactiveFinancials.annualNetSavings.toLocaleString()}</strong>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: 'rgba(255,255,255,0.02)', borderRadius: 8 }}>
                      <span style={{ color: '#94A3B8' }}>Total Fleet CAPEX Investment Delta:</span>
                      <strong style={{ color: '#38BDF8', fontSize: 16 }}>₹{reactiveFinancials.totalCapex.toLocaleString()}</strong>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: 'rgba(255,255,255,0.02)', borderRadius: 8 }}>
                      <span style={{ color: '#94A3B8' }}>Estimated Payback Period:</span>
                      <strong style={{ color: '#F59E0B', fontSize: 16 }}>
                        {reactiveFinancials.paybackMonths} Months ({reactiveFinancials.paybackYears} Yrs)
                      </strong>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: 'rgba(255,255,255,0.02)', borderRadius: 8 }}>
                      <span style={{ color: '#94A3B8' }}>Annual Simple ROI:</span>
                      <strong style={{ color: '#34D399', fontSize: 16 }}>{reactiveFinancials.roiPercent}%</strong>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: 'rgba(255,255,255,0.02)', borderRadius: 8 }}>
                      <span style={{ color: '#94A3B8' }}>5-Year Cumulative Net TCO Benefit:</span>
                      <strong style={{ color: '#10B981', fontSize: 16 }}>₹{(reactiveFinancials.fiveYearTcoBenefit / 100000).toFixed(1)} Lakhs</strong>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ==================================================== */}
          {/* VIEW 4: SUSTAINABILITY VIEW                         */}
          {/* ==================================================== */}
          {currentView === 'SUSTAINABILITY' && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 24 }}>
                <div className="kpi-box green">
                  <div className="kpi-label">Annual Net CO₂ Reduction</div>
                  <div className="kpi-num">{sustainability?.annual_emissions_tonnes?.net_co2_abated_tonnes || 0} MT</div>
                  <div className="kpi-sub">Metric Tonnes Greenhouse Gases Abated</div>
                </div>

                <div className="kpi-box">
                  <div className="kpi-label">Well-to-Wheel Carbon Reduction</div>
                  <div className="kpi-num">{sustainability?.annual_emissions_tonnes?.percentage_reduction || 0}%</div>
                  <div className="kpi-sub">Over Standard Diesel Fleet Baseline</div>
                </div>

                <div className="kpi-box green">
                  <div className="kpi-label">Mature Trees Planted Equivalent</div>
                  <div className="kpi-num">{sustainability?.green_equivalencies?.mature_trees_planted_equivalent || 0}</div>
                  <div className="kpi-sub">Based on 22 kg CO₂/tree absorption</div>
                </div>
              </div>

              <div className="glass-panel">
                <div className="panel-title-bar">
                  <div className="panel-heading">
                    <Leaf size={18} color="#10B981" />
                    <span>Central Electricity Authority (CEA) v16 Official Methodology</span>
                  </div>
                </div>
                <div style={{ fontSize: 13, color: '#CBD5E1', lineHeight: 1.6 }}>
                  <p>
                    VidyutFleet calculates carbon abatement using the <strong>Central Electricity Authority (CEA) CO₂ Baseline Database for the Indian Power Sector (Version 16)</strong>.
                  </p>
                  <ul style={{ marginTop: 8, paddingLeft: 20 }}>
                    <li>National Grid Weighted Average Emission Factor: <strong>0.675 kg CO₂ / kWh</strong></li>
                    <li>Diesel Commercial Vehicle Emission Factor: <strong>2.68 kg CO₂ / Liter</strong> (at 12.5 km/L = 0.214 kg CO₂/km)</li>
                    <li>EV Commercial Consumption Factor: <strong>0.11 kWh / km</strong> (at 0.675 kg/kWh = 0.074 kg CO₂/km)</li>
                  </ul>
                  <p style={{ marginTop: 12, color: '#94A3B8' }}>
                    *Note: We do not misrepresent EVs as 100% zero-emission; we rigorously account for India's coal/thermal grid power mix.*
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ==================================================== */}
          {/* VIEW 5: CSV UPLOAD & INGESTION VIEW                  */}
          {/* ==================================================== */}
          {currentView === 'UPLOAD' && (
            <div className="glass-panel" style={{ maxWidth: 840, margin: '0 auto' }}>
              <div className="panel-title-bar">
                <div className="panel-heading">
                  <Upload size={18} color="#2563EB" />
                  <span>Upload Commercial Fleet Dispatch Logs (CSV)</span>
                </div>
              </div>

              {/* Preset Loaders */}
              <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
                <button 
                  onClick={() => loadPresetFleet("Master 120-Vehicle Fleet (data/fleet_routes.csv)")}
                  className="btn-secondary"
                  style={{ fontSize: 12 }}
                >
                  <RefreshCw size={14} /> Reload Master 120-Vehicle Fleet (Punjab & Haryana)
                </button>
              </div>

              {/* Drag & Drop Area */}
              <div style={{ textAlign: 'center', padding: '40px 20px', border: '2px dashed var(--border-light)', borderRadius: 12 }}>
                <Upload size={48} style={{ color: '#2563EB', margin: '0 auto 16px' }} />
                <h3>Drag & Drop Your Fleet Dispatch CSV</h3>
                <p style={{ color: '#94A3B8', fontSize: 13, marginTop: 6, marginBottom: 20 }}>
                  Upload a new CSV to immediately re-calculate readiness scores, EDF charger bays, and financial savings.
                </p>

                <label className="btn-primary" style={{ display: 'inline-block', cursor: 'pointer' }}>
                  Select CSV File
                  <input type="file" accept=".csv" onChange={handleFileUpload} style={{ display: 'none' }} />
                </label>
              </div>

              <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: '#94A3B8' }}>Need the format template?</span>
                <a 
                  href={`${API_BASE}/reports/sample-csv`} 
                  download 
                  className="btn-secondary"
                  style={{ textDecoration: 'none', fontSize: 12 }}
                >
                  <Download size={14} /> Download Sample fleet_routes.csv
                </a>
              </div>
            </div>
          )}

          {/* ==================================================== */}
          {/* VIEW 6: ADMIN & CATALOGUE VIEW                      */}
          {/* ==================================================== */}
          {currentView === 'ADMIN' && (
            <div className="glass-panel">
              <div className="panel-title-bar">
                <div className="panel-heading">
                  <Settings size={18} color="#38BDF8" />
                  <span>Indian Commercial Electric Vehicle Catalogue (`ev_catalogue.csv`)</span>
                </div>
                <a 
                  href={`${API_BASE}/catalogue`} 
                  download 
                  className="btn-secondary" 
                  style={{ textDecoration: 'none', fontSize: 12 }}
                >
                  <Download size={14} /> Export Catalogue CSV
                </a>
              </div>

              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Model ID</th>
                      <th>Make & Model</th>
                      <th>Category</th>
                      <th>Battery (kWh)</th>
                      <th>ARAI Range</th>
                      <th>Practical Range</th>
                      <th>Energy Use (kWh/km)</th>
                      <th>Payload Capacity</th>
                      <th>Charger Type</th>
                      <th>Price (INR)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { id: "EV001", model: "Mahindra Treo Zor", type: "3W", bat: 7.5, arai: 125, prac: 95, use: 0.08, pl: 550, chg: "AC Type 2", price: "₹3,50,000" },
                      { id: "EV002", model: "Piaggio Ape E-Xtra", type: "3W", bat: 8.9, arai: 120, prac: 90, use: 0.09, pl: 560, chg: "AC Type 2", price: "₹3,80,000" },
                      { id: "EV003", model: "Tata Ace EV", type: "LCV", bat: 21.3, arai: 152, prac: 110, use: 0.16, pl: 750, chg: "AC Type 2", price: "₹9,00,000" },
                      { id: "EV005", model: "Euler HiLoad", type: "LCV", bat: 21.0, arai: 120, prac: 90, use: 0.18, pl: 688, chg: "AC Type 2", price: "₹3,50,000" },
                      { id: "EV008", model: "Mahindra Zor Grand", type: "3W", bat: 10.24, arai: 153, prac: 115, use: 0.09, pl: 500, chg: "AC Type 2", price: "₹3,90,000" }
                    ].map((m) => (
                      <tr key={m.id}>
                        <td style={{ fontWeight: 700 }}>{m.id}</td>
                        <td style={{ fontWeight: 600 }}>{m.model}</td>
                        <td>{m.type}</td>
                        <td>{m.bat} kWh</td>
                        <td>{m.arai} km</td>
                        <td style={{ color: '#10B981', fontWeight: 600 }}>{m.prac} km</td>
                        <td>{m.use}</td>
                        <td>{m.pl} kg</td>
                        <td>{m.chg}</td>
                        <td style={{ fontWeight: 700 }}>{m.price}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Slide-out AI Advisor (RAG) Drawer */}
      {advisorOpen && (
        <aside className="chat-drawer">
          <div className="drawer-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div className="brand-icon" style={{ width: 32, height: 32 }}>
                <Zap size={16} color="white" />
              </div>
              <strong style={{ fontSize: 14 }}>VidyutFleet Advisor (RAG)</strong>
            </div>
            <button 
              onClick={() => setAdvisorOpen(false)}
              style={{ background: 'transparent', color: '#94A3B8', padding: 4 }}
            >
              <X size={20} />
            </button>
          </div>

          <div className="drawer-body">
            <div style={{ marginBottom: 12 }}>
              <span style={{ fontSize: 11, color: '#94A3B8', fontWeight: 600 }}>Suggested Questions:</span>
              <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {[
                  "Which 10 routes should I electrify first?",
                  "Why are some routes classified as Not Yet?",
                  "How many chargers are required for Ludhiana depot?",
                  "How much CO2 can my fleet reduce in one year?"
                ].map((q, i) => (
                  <div key={i} className="suggested-chip" onClick={() => sendChatMessage(q)}>
                    {q}
                  </div>
                ))}
              </div>
            </div>

            {messages.map((m, idx) => (
              <div key={idx} className={`chat-bubble ${m.role}`}>
                <div style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>
                {m.citations && m.citations.length > 0 && (
                  <div style={{ marginTop: 8, paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.1)', fontSize: 10, color: '#93C5FD' }}>
                    <strong>Sources Cited:</strong> {m.citations.join(" · ")}
                  </div>
                )}
              </div>
            ))}
            {chatLoading && (
              <div className="chat-bubble assistant">
                <RefreshCw className="animate-spin" size={14} style={{ display: 'inline', marginRight: 6 }} />
                Retrieving grounded fleet facts...
              </div>
            )}
          </div>

          <div className="drawer-footer">
            <input 
              type="text" 
              placeholder="Ask a question about your fleet..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendChatMessage()}
              style={{
                flex: 1,
                background: '#1E293B',
                border: '1px solid var(--border-light)',
                color: 'white',
                padding: '8px 12px',
                borderRadius: 8,
                fontSize: 12
              }}
            />
            <button className="btn-primary" onClick={() => sendChatMessage()}>
              Send
            </button>
          </div>
        </aside>
      )}

      {/* Vehicle Drilldown Modal */}
      {selectedVehicle && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60
        }}>
          <div className="glass-panel" style={{ width: 550, position: 'relative' }}>
            <button 
              onClick={() => setSelectedVehicle(null)}
              style={{ position: 'absolute', right: 16, top: 16, background: 'transparent', color: '#94A3B8' }}
            >
              <X size={20} />
            </button>

            <h3 style={{ fontSize: 16, marginBottom: 8, color: '#38BDF8' }}>
              Feasibility Drilldown: {selectedVehicle.vehicle_id} ({selectedVehicle.route_name})
            </h3>
            <p style={{ fontSize: 13, color: '#94A3B8', marginBottom: 16 }}>
              Score: <strong style={{ color: '#10B981', fontSize: 18 }}>{selectedVehicle.score} / 100</strong> ({selectedVehicle.verdict})
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 6 }}>
                <span>Route Feasibility Factor (40%):</span>
                <strong>{selectedVehicle.breakdown?.route_feasibility} / 100</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 6 }}>
                <span>Daily Distance Suitability (30%):</span>
                <strong>{selectedVehicle.breakdown?.distance_suitability} / 100</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 6 }}>
                <span>Charging Feasibility Factor (20%):</span>
                <strong>{selectedVehicle.breakdown?.charging_feasibility} / 100</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 6 }}>
                <span>Operational Suitability Factor (10%):</span>
                <strong>{selectedVehicle.breakdown?.operational_suitability} / 100</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(37, 99, 235, 0.1)', borderRadius: 6, color: '#93C5FD' }}>
                <span>Required Recharge Duration:</span>
                <strong>{selectedVehicle.charging_needs?.charge_hours_required} hrs ({selectedVehicle.charging_needs?.kwh_required} kWh)</strong>
              </div>
            </div>

            <p style={{ marginTop: 16, fontSize: 12, color: '#CBD5E1', fontStyle: 'italic' }}>
              Explanation: {selectedVehicle.explanation}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
