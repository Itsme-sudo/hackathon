# VidyutFleet — Fleet EV Transition & Depot Infrastructure Planner
### Smart India Hackathon 2026 / HACKNAUTS 2.0 | Team Vidyut (GNDEC Ludhiana)

> **Optimizing EV adoption for Indian commercial logistics fleets from plain dispatch CSV logs without hardware sensors.**

---

## 🚀 Live Working Prototype
- **Frontend Dashboard + Backend API (Unified):** [http://localhost:5000](http://localhost:5000)
- **PowerPoint Presentation:** `D:\hackathon\hackthon.pptx` (also copied to `Downloads\hackthon.pptx`)

---

## 📂 Repository Structure

```
D:\hackathon/
├── hackthon.pptx              # 11-slide complete pitch deck (No placeholders)
├── create_presentation.py     # Script used to generate hackthon.pptx
│
├── analysis/                  # Python 3 Analytical Core
│   ├── engine.py              # Feasibility Scorer, EDF Scheduler & CEA CO2 Engine
│   ├── routes.csv             # Realistic Indian dispatch fleet dataset (25 routes)
│   ├── test_engine.py         # Automated unit test suite (5 passing tests)
│   └── requirements.txt       # Dependencies (pandas, numpy, scikit-learn, python-pptx)
│
├── backend/                   # Node.js + Express REST API
│   ├── server.js              # Multer upload stream, Python bridge, static host
│   └── package.json           # Express, Multer, CORS
│
└── frontend/                  # React 18 + Vite Web Dashboard
    ├── src/
    │   ├── App.jsx            # KPI cards, Recharts, EDF Gantt table, vehicle explorer
    │   ├── App.css            # Executive high-contrast styling
    │   └── index.css          # Typography & glassmorphism variables
    ├── dist/                  # Production-optimized build bundle
    └── package.json           # React, Recharts, Lucide-React, Vite
```

---

## 🧮 Mathematical & Scientific Formulations

### 1. Route Feasibility Score ($0 - 100$)
$$\text{Score} = 0.40 \cdot R + 0.30 \cdot D + 0.20 \cdot Q + 0.10 \cdot S$$

| Factor | Weight | Definition & Normalized Scaling |
| :--- | :---: | :--- |
| **$R$** | **40%** | **Range & Route Distance Fit**: Ratio of daily route km to effective EV battery range with 20% safety reserve ($R = \max(0, 100 \cdot (1 - \frac{\text{km}}{96}))$). |
| **$D$** | **30%** | **Depot Dwell Time Fit**: Overnight parking duration vs required recharge time at 3.3 kW AC ($D = \min(100, \frac{\text{Dwell Hours}}{\text{Charge Hours}} \times 100)$). |
| **$Q$** | **20%** | **Payload & Stop Severity**: Penalizes high cargo payload ($>70\%$) and frequent stop-start congestion ($>25$ stops). |
| **$S$** | **10%** | **Grid Off-Peak & Tariff Alignment**: Overlap with 11:00 PM – 06:00 AM low-cost utility tariff window. |

### 2. Rollout Decision Thresholds
- **Ready Now (Score $\ge 75$ & $D \ge 70$):** Immediate drop-in EV transition.
- **Ready with Depot Charger (Score $50 - 74$):** Requires dedicated overnight depot charging bay.
- **Not Yet (Score $< 50$):** Over 160 km daily or excessive payload; retain ICE/CNG until battery tech scales.

### 3. Depot Charger Sizing Lower Bound
$$C_{\min} = \left\lceil \frac{\sum_{i=1}^N \text{Energy Required}_i / P_{\text{charger}}}{\text{Depot Common Dwell Window}} \right\rceil$$

### 4. Earliest Deadline First (EDF) Scheduling Heuristic
- Sorts returning vehicles by Next Departure Deadline ($\min t_{\text{departure}}$).
- Greedily allocates available bays to earliest-departing vehicles.
- Eliminates transformer demand spikes and guarantees on-time morning dispatches.

### 5. Financial & Environmental Baselines
- **Running Costs (CEEW 2024):** EV ₹1.28/km vs Diesel ₹2.69/km (Net saving ₹1.41/km, 52.4% reduction).
- **PM E-DRIVE Subsidy:** ₹50,000 for L5M cargo vehicles (live ON/OFF toggle).
- **Payback Period:** ~16-18 months with subsidy, ~30-32 months unsubsidized.
- **CO2 Grid Factor (CEA Database v16):** 0.71 kg CO2/kWh grid vs 0.214 kg CO2/km diesel. Net abated: 63.5%.

---

## 🛠️ How to Run & Demo
1. **Start Backend + Frontend:**
   ```bash
   cd D:\hackathon\backend
   node server.js
   ```
2. **Open Browser:** Navigate to `http://localhost:5000`
3. **Run Unit Tests:**
   ```bash
   cd D:\hackathon\analysis
   python test_engine.py
   ```
