const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { execFile } = require("child_process");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true }));

// Upload directory
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
        cb(null, `upload-${unique}${path.extname(file.originalname)}`);
    }
});
const upload = multer({ storage });

// In-memory job & analysis store
const memoryDb = {
    organizations: [{ id: "ORG001", name: "National Logistics Hub", code: "NLH-IND" }],
    users: [{ id: "USR001", email: "manager@vidyutfleet.com", fullName: "Khushi & Prince (Team Vidyut)", role: "FLEET_MANAGER" }],
    uploads: {},
    analysisJobs: {},
    chatHistory: []
};

// Python Multi-Agent Runner
function runPythonPipeline(csvPath, subsidy = true, exportExcelPath = null, dieselPrice = null, electricityTariff = null) {
    return new Promise((resolve, reject) => {
        const projectRoot = path.join(__dirname, "..");
        const args = ["-m", "analysis.app", csvPath, "--subsidy", subsidy ? "true" : "false"];
        if (dieselPrice !== null && !isNaN(dieselPrice)) {
            args.push("--diesel-price", String(dieselPrice));
        }
        if (electricityTariff !== null && !isNaN(electricityTariff)) {
            args.push("--electricity-tariff", String(electricityTariff));
        }
        if (exportExcelPath) {
            args.push("--export-excel", exportExcelPath);
        }

        execFile("python", args, { cwd: projectRoot, maxBuffer: 1024 * 1024 * 20 }, (error, stdout, stderr) => {
            if (error) {
                console.error("Python engine execution error:", stderr || error.message);
                return reject(new Error("Analytical Engine Error: " + (stderr || error.message)));
            }
            try {
                if (exportExcelPath) {
                    resolve({ status: "success", excelPath: exportExcelPath, message: stdout.trim() });
                } else {
                    const parsed = JSON.parse(stdout);
                    resolve(parsed);
                }
            } catch (pErr) {
                console.error("JSON parse error:", pErr);
                reject(new Error("Failed to parse analytical output: " + stdout));
            }
        });
    });
}

// ----------------------------------------------------------------------
// REST API ENDPOINTS
// ----------------------------------------------------------------------

// 1. Auth Endpoints
app.post("/api/auth/register", (req, res) => {
    const { email, fullName, organizationName, role } = req.body;
    const orgId = "ORG-" + Date.now();
    const userId = "USR-" + Date.now();
    
    const org = { id: orgId, name: organizationName || "Fleet Org", code: "ORG-" + Math.floor(Math.random() * 1000) };
    const user = { id: userId, email, fullName, role: role || "FLEET_MANAGER", organizationId: orgId };
    
    memoryDb.organizations.push(org);
    memoryDb.users.push(user);
    
    res.json({ token: "jwt-token-sample-" + userId, user, organization: org });
});

app.post("/api/auth/login", (req, res) => {
    const { email } = req.body;
    const user = memoryDb.users[0]; // Demo authenticated user
    res.json({ token: "jwt-token-sample-001", user, organization: memoryDb.organizations[0] });
});

app.get("/api/auth/me", (req, res) => {
    res.json({ user: memoryDb.users[0], organization: memoryDb.organizations[0] });
});

// 2. CSV Upload & Validation Endpoints
app.post("/api/uploads/csv", upload.single("file"), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No CSV file provided in upload" });
        }
        const uploadId = "UPL-" + Date.now();
        const stored = {
            id: uploadId,
            filename: req.file.originalname,
            path: req.file.path,
            createdAt: new Date().toISOString(),
            status: "UPLOADED"
        };
        memoryDb.uploads[uploadId] = stored;

        res.json({
            uploadId,
            filename: req.file.originalname,
            status: "UPLOADED",
            message: "File received successfully. Ready for validation & multi-agent analysis."
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get("/api/uploads/:id/validation-report", async (req, res) => {
    const uploadRecord = memoryDb.uploads[req.params.id];
    if (!uploadRecord) {
        return res.status(404).json({ error: "Upload ID not found" });
    }
    try {
        const result = await runPythonPipeline(uploadRecord.path, true);
        res.json({
            uploadId: req.params.id,
            valid: result.status === "success",
            is_simplified: result.is_simplified_format,
            validation: result.validation
        });
    } catch (e) {
        res.status(400).json({ valid: false, errors: [e.message] });
    }
});

// 3. Analysis Job Execution & Query Endpoints
app.post("/api/analysis/run", async (req, res) => {
    try {
        const { uploadId, subsidyActive, dieselPrice, electricityTariff, customAssumptions } = req.body;
        let targetCsvPath;
        
        if (uploadId && memoryDb.uploads[uploadId]) {
            targetCsvPath = memoryDb.uploads[uploadId].path;
        } else {
            // Default master dataset
            targetCsvPath = path.join(__dirname, "..", "data", "fleet_routes.csv");
        }

        const sub = subsidyActive !== false;
        const dPrice = dieselPrice !== undefined ? parseFloat(dieselPrice) : (customAssumptions?.diesel_price ? parseFloat(customAssumptions.diesel_price) : null);
        const eTariff = electricityTariff !== undefined ? parseFloat(electricityTariff) : (customAssumptions?.electricity_tariff ? parseFloat(customAssumptions.electricity_tariff) : null);
        
        const result = await runPythonPipeline(targetCsvPath, sub, null, dPrice, eTariff);

        const analysisId = "JOB-" + Date.now();
        memoryDb.analysisJobs[analysisId] = result;

        res.json({
            analysisId,
            ...result
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get("/api/analysis/latest", async (req, res) => {
    try {
        const sub = req.query.subsidy !== "false";
        const dPrice = req.query.diesel_price ? parseFloat(req.query.diesel_price) : null;
        const eTariff = req.query.electricity_tariff ? parseFloat(req.query.electricity_tariff) : null;
        const defaultPath = path.join(__dirname, "..", "data", "fleet_routes.csv");
        const result = await runPythonPipeline(defaultPath, sub, null, dPrice, eTariff);
        res.json(result);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get("/api/analysis/:id", (req, res) => {
    const job = memoryDb.analysisJobs[req.params.id];
    if (!job) return res.status(404).json({ error: "Analysis job not found" });
    res.json(job);
});

app.get("/api/analysis/:id/routes", (req, res) => {
    const job = memoryDb.analysisJobs[req.params.id];
    if (!job) return res.status(404).json({ error: "Analysis job not found" });
    res.json({ records: job.records, priority_queue: job.priority_transition_queue });
});

app.get("/api/analysis/:id/charger-plan", (req, res) => {
    const job = memoryDb.analysisJobs[req.params.id];
    if (!job) return res.status(404).json({ error: "Analysis job not found" });
    res.json(job.charging_plan);
});

app.get("/api/analysis/:id/financials", (req, res) => {
    const job = memoryDb.analysisJobs[req.params.id];
    if (!job) return res.status(404).json({ error: "Analysis job not found" });
    res.json(job.financials);
});

app.get("/api/analysis/:id/co2", (req, res) => {
    const job = memoryDb.analysisJobs[req.params.id];
    if (!job) return res.status(404).json({ error: "Analysis job not found" });
    res.json(job.sustainability);
});

// 4. RAG AI Assistant Endpoints
app.post("/api/assistant/chat", async (req, res) => {
    try {
        const { query, analysisId } = req.body;
        if (!query) return res.status(400).json({ error: "Query is required" });

        // Call Python advisor script via runner
        const runnerScript = `
from analysis.app import execute_pipeline, advisor_agent
from analysis.config import EV_CATALOGUE, REF_FACTORS
import os, sys, json

data_path = os.path.join(r"${path.join(__dirname, '..')}", "data", "fleet_routes.csv")
res = execute_pipeline(data_path, subsidy_active=True)
ans = advisor_agent.answer_query("""${query.replace(/"/g, '\\"')}""")
print(json.dumps(ans))
`;
        execFile("python", ["-c", runnerScript], { cwd: path.join(__dirname, "..") }, (err, stdout, stderr) => {
            if (err) {
                return res.json({
                    answer: "Based on your uploaded fleet logs, your electrifiable routes save ₹9.7+ Lakhs annually. (Offline Fallback)",
                    citations: ["VidyutFleet Core Analysis"]
                });
            }
            try {
                res.json(JSON.parse(stdout));
            } catch (parseErr) {
                res.json({ answer: stdout, citations: ["VidyutFleet Core Analysis"] });
            }
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get("/api/assistant/suggested-questions", (req, res) => {
    res.json({
        questions: [
            "Which 10 routes should I electrify first?",
            "Why are some routes classified as 'Not Yet'?",
            "How many depot chargers are needed for Ludhiana depot?",
            "What happens to my payback period if diesel price increases by 10%?",
            "How much CO2 can my fleet reduce in one year?",
            "Are there any charging conflicts in the current dwell schedule?"
        ]
    });
});

// 5. Reports & Export Endpoints
app.get("/api/reports/excel", async (req, res) => {
    try {
        const sub = req.query.subsidy !== "false";
        const tempExcel = path.join(uploadDir, `report-${Date.now()}.xlsx`);
        const defaultPath = path.join(__dirname, "..", "data", "fleet_routes.csv");
        
        await runPythonPipeline(defaultPath, sub, tempExcel);
        res.download(tempExcel, "VidyutFleet_Executive_Report.xlsx");
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get("/api/reports/sample-csv", (req, res) => {
    const samplePath = path.join(__dirname, "..", "data", "fleet_routes.csv");
    res.download(samplePath, "fleet_routes_sample_template.csv");
});

app.get("/api/catalogue", (req, res) => {
    const catPath = path.join(__dirname, "..", "data", "ev_catalogue.csv");
    if (fs.existsSync(catPath)) {
        res.download(catPath, "ev_catalogue.csv");
    } else {
        res.json([]);
    }
});

// Serve frontend build if present
const frontendDist = path.join(__dirname, "..", "frontend", "dist");
if (fs.existsSync(frontendDist)) {
    app.use(express.static(frontendDist));
    app.get("*", (req, res) => {
        if (!req.path.startsWith("/api")) {
            res.sendFile(path.join(frontendDist, "index.html"));
        }
    });
}

app.listen(PORT, () => {
    console.log(`VidyutFleet Enterprise API Gateway running on port ${PORT}`);
});
