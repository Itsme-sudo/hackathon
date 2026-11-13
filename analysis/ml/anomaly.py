"""
Machine Learning Module: Anomaly & Outlier Detection using Isolation Forest
Identifies unrealistic dispatch records, impossible dwell windows, and overload penalties.
"""
import pandas as pd
from sklearn.ensemble import IsolationForest

class AnomalyDetectionEngine:
    def __init__(self, contamination=0.05):
        self.iso_forest = IsolationForest(contamination=contamination, random_state=42)

    def detect_anomalies(self, df):
        if len(df) < 10:
            return {"anomalies_detected": 0, "flagged_records": []}

        feats = pd.DataFrame()
        feats["dist"] = df["daily_distance_km"].astype(float)
        feats["payload"] = df["payload_kg"].astype(float) if "payload_kg" in df.columns else 500.0
        feats["stops"] = df["stop_count"].astype(float) if "stop_count" in df.columns else 25.0

        preds = self.iso_forest.fit_predict(feats)
        anomaly_indices = [idx for idx, p in enumerate(preds) if p == -1]

        flagged = []
        for idx in anomaly_indices:
            row = df.iloc[idx]
            reasons = []
            d = float(row.get("daily_distance_km", 0))
            p = float(row.get("payload_kg", 0))
            mp = float(row.get("max_payload_kg", 800))
            
            if d > 200:
                reasons.append(f"Extreme daily distance ({d} km) for single-shift vehicle")
            if p > mp:
                reasons.append(f"Payload ({p} kg) exceeds rated capacity ({mp} kg)")
            if not reasons:
                reasons.append("Multi-dimensional operational anomaly detected by Isolation Forest")

            flagged.append({
                "vehicle_id": str(row.get("vehicle_id", f"Row-{idx+1}")),
                "route_name": str(row.get("route_name", "")),
                "distance_km": d,
                "payload_kg": p,
                "reasons": reasons
            })

        return {
            "total_analyzed": len(df),
            "anomalies_detected": len(flagged),
            "flagged_records": flagged[:10]
        }
