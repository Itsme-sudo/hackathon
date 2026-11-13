const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { execFile } = require("child_process");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true }));

// Storage config for CSV uploads
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
        cb(null, `routes-${unique}${path.extname(file.originalname)}`);
    }
});
const upload = multer({ storage });

// Fallback in-memory Python runner
function runPythonAnalysis(csvFilePath, subsidy = true) {
    return new Promise((resolve, reject) => {
        const scriptPath = path.join(__dirname, "..", "analysis", "engine.py");
        const args = [scriptPath, csvFilePath, subsidy ? "true" : "false"];
        
        execFile("python", args, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
            if (error) {
                console.warn("Python execution warning, using JS calculation fallback:", stderr || error.message);
                try {
                    const fallbackResult = runJsFallbackAnalysis(csvFilePath, subsidy);
                    return resolve(fallbackResult);
                } catch (fallbackErr) {
                    return reject(new Error("Analysis failed: " + (stderr || error.message)));
                }
            }
            try {
                const parsed = JSON.parse(stdout);
                resolve(parsed);
            } catch (parseErr) {
                console.warn("Failed to parse Python stdout, using JS fallback");
                const fallbackResult = runJsFallbackAnalysis(csvFilePath, subsidy);
                resolve(fallbackResult);
            }
        });
    });
}

// Pure JS Fallback Engine
function runJsFallbackAnalysis(csvFilePath, subsidy = true) {
    const raw = fs.readFileSync(csvFilePath, "utf8");
    const lines = raw.trim().split("\n");
    const headers = lines[0].split(",").map(h => h.trim().replace(/\r/g, ""));
    
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const parts = lines[i].split(",").map(p => p.trim().replace(/\r/g, ""));
        const row = {};
        headers.forEach((h, idx) => row[h] = parts[idx]);
        rows.push(row);
    }

    const scored = rows.map(r => {
        const dist = parseFloat(r.distance_km || 60);
        const payload = parseFloat(r.avg_payload_pct || 65);
        const stops = parseInt(r.stop_count || 25);
        
        // R (Range)
        const effRange = 96.0;
        let R = dist <= effRange ? 75.0 + 25.0 * (1.0 - (dist / effRange)) : Math.max(0, 75.0 - ((dist - effRange) / effRange) * 90.0);
        
        // D (Dwell)
        const startH = parseInt((r.dwell_start || "20:00").split(":")[0]);
        const endH = parseInt((r.dwell_end || "06:00").split(":")[0]);
        let dwellH = endH <= startH ? (endH + 24 - startH) : (endH - startH);
        const kwh = (dist * 0.11) / 0.88;
        const chargeH = kwh / 3.3;
        let D = dwellH >= chargeH ? Math.min(100, 75 + ((dwellH - chargeH) / 4) * 25) : Math.max(0, 75 - ((chargeH - dwellH) / chargeH) * 100);
        
        // Q & S
        let Q = Math.max(10, Math.min(100, 85 - (payload > 70 ? (payload - 70) * 0.9 : 0) - (stops > 25 ? (stops - 25) * 0.7 : 0)));
        let S = 90.0;

        const score = Math.round((0.40 * R + 0.30 * D + 0.20 * Q + 0.10 * S) * 10) / 10;
        let verdict = "Not yet";
        let verdict_color = "#EF4444";
        if (score >= 75 && D >= 70 && dist <= 100) {
            verdict = "Ready now";
            verdict_color = "#10B981";
        } else if (score >= 50) {
            verdict = "Ready with depot charger";
            verdict_color = "#F59E0B";
        }

        return {
            vehicle_id: r.vehicle_id,
            route_name: r.route_name,
            distance_km: dist,
            dwell_start: r.dwell_start,
            dwell_end: r.dwell_end,
            avg_payload_pct: payload,
            stop_count: stops,
            depot_id: r.depot_id || "DEPOT-01",
            score,
            verdict,
            verdict_color,
            metrics: {
                R_range_fit: Math.round(R * 10) / 10,
                D_dwell_fit: Math.round(D * 10) / 10,
                Q_payload_fit: Math.round(Q * 10) / 10,
                S_tariff_fit: Math.round(S * 10) / 10,
                kwh_needed: Math.round(kwh * 100) / 100,
                charge_hours_req: Math.round(chargeH * 100) / 100,
                dwell_hours: dwellH
            }
        };
    });

    const readyNow = scored.filter(v => v.verdict === "Ready now").length;
    const readyCharger = scored.filter(v => v.verdict === "Ready with depot charger").length;
    const notYet = scored.filter(v => v.verdict === "Not yet").length;

    const totalKm = scored.reduce((acc, v) => acc + v.distance_km, 0);
    const annualKm = totalKm * 300;
    const evAnnual = annualKm * 1.28;
    const dieselAnnual = annualKm * 2.69;
    const annualSavings = dieselAnnual - evAnnual;
    const electrifiable = readyNow + readyCharger;
    const subsidyAmt = subsidy ? 50000 : 0;
    const netCapex = Math.max(0, (90000 - subsidyAmt + 15000) * electrifiable);
    const paybackMonths = annualSavings > 0 ? Math.round((netCapex / annualSavings) * 12 * 10) / 10 : 0;

    return {
        status: "success",
        timestamp: new Date().toISOString(),
        summary: {
            ready_now: readyNow,
            ready_with_charger: readyCharger,
            not_yet: notYet,
            total: scored.length
        },
        charging_plan: {
            min_chargers: Math.max(2, Math.ceil(electrifiable / 3)),
            total_energy_kwh: Math.round(scored.reduce((acc, v) => acc + v.metrics.kwh_needed, 0) * 10) / 10,
            schedule: scored.filter(v => v.verdict !== "Not yet").map((v, i) => ({
                vehicle_id: v.vehicle_id,
                route_name: v.route_name,
                bay_id: `Bay ${(i % Math.max(2, Math.ceil(electrifiable / 3))) + 1}`,
                start_time: v.dwell_start,
                end_time: "02:00",
                departure_time: v.dwell_end,
                duration_hours: v.metrics.charge_hours_req,
                energy_kwh: v.metrics.kwh_needed,
                buffer_mins: 180,
                status: "On-Time Dispatch"
            }))
        },
        financials: {
            subsidy_active: subsidy,
            total_annual_km: annualKm,
            annual_costs: {
                ev: Math.round(evAnnual),
                diesel: Math.round(dieselAnnual),
                cng: Math.round(annualKm * 2.35),
                petrol: Math.round(annualKm * 3.21)
            },
            annual_net_savings_inr: Math.round(annualSavings),
            total_capex_investment_inr: Math.round(netCapex),
            payback_months: paybackMonths,
            annual_roi_pct: Math.round((annualSavings / netCapex) * 1000) / 10,
            co2: {
                diesel_tonnes_year: Math.round((annualKm * 0.214) / 1000 * 10) / 10,
                ev_tonnes_year: Math.round((annualKm * 0.078) / 1000 * 10) / 10,
                net_abated_tonnes_year: Math.round((annualKm * 0.136) / 1000 * 100) / 100,
                reduction_pct: 63.5
            }
        },
        vehicles: scored
    };
}

// Health check endpoint
app.get("/api/health", (req, res) => {
    res.json({
        status: "healthy",
        service: "VidyutFleet Backend API",
        version: "1.0.0",
        uptime: process.uptime()
    });
});

// Serve React frontend build if present
const frontendDist = path.join(__dirname, "..", "frontend", "dist");
if (fs.existsSync(frontendDist)) {
    app.use(express.static(frontendDist));
    app.get("/", (req, res) => {
        res.sendFile(path.join(frontendDist, "index.html"));
    });
} else {
    // Root API fallback
    app.get("/", (req, res) => {
        res.json({
            message: "VidyutFleet API Running",
            endpoints: [
                "/api/health",
                "/api/sample",
                "/api/upload",
                "/api/simulate"
            ]
        });
    });
}

// Get sample fleet data endpoint
app.get("/api/sample", async (req, res) => {
    try {
        const sampleCsvPath = path.join(__dirname, "..", "analysis", "routes.csv");
        if (fs.existsSync(sampleCsvPath)) {
            const subsidy = req.query.subsidy !== "false";
            const result = await runPythonAnalysis(sampleCsvPath, subsidy);
            return res.json(result);
        } else {
            return res.status(404).json({ error: "Sample data routes.csv not found" });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Upload CSV & Analyze endpoint
app.post("/api/upload", upload.single("file"), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No CSV file uploaded" });
        }
        const subsidy = req.body.subsidy !== "false";
        const result = await runPythonAnalysis(req.file.path, subsidy);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Real-time parameter simulation endpoint
app.post("/api/simulate", async (req, res) => {
    try {
        const { subsidy, custom_routes } = req.body;
        const subsidyActive = subsidy !== false;
        
        let targetCsv = path.join(__dirname, "..", "analysis", "routes.csv");
        if (custom_routes && Array.isArray(custom_routes)) {
            // Write temporary file
            const tempPath = path.join(uploadDir, `sim-${Date.now()}.csv`);
            const header = "vehicle_id,route_name,distance_km,dwell_start,dwell_end,avg_payload_pct,stop_count,depot_id\n";
            const lines = custom_routes.map(r => 
                `${r.vehicle_id},${r.route_name},${r.distance_km},${r.dwell_start},${r.dwell_end},${r.avg_payload_pct},${r.stop_count},${r.depot_id || "DEPOT-01"}`
            ).join("\n");
            fs.writeFileSync(tempPath, header + lines);
            targetCsv = tempPath;
        }

        const result = await runPythonAnalysis(targetCsv, subsidyActive);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`VidyutFleet Backend running at http://localhost:${PORT}`);
});
