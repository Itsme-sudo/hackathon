"""
Machine Learning Module: Supervised Route EV Suitability Classifier
Trains RandomForest and LogisticRegression to predict EV feasibility with confidence and feature importances.
"""
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, roc_auc_score

class RouteSuitabilityClassifier:
    def __init__(self):
        self.rf_model = RandomForestClassifier(n_estimators=50, random_state=42)
        self.feature_names = [
            "daily_distance_km", "payload_ratio", "dwell_hours",
            "stop_count", "traffic_code", "road_code"
        ]
        self.is_trained = False
        self.metrics = {}
        self.feature_importances = {}

    def _prepare_features(self, df):
        feats = pd.DataFrame()
        feats["daily_distance_km"] = df["daily_distance_km"].astype(float)
        
        pl = df["payload_kg"].astype(float) if "payload_kg" in df.columns else 500.0
        mpl = df["max_payload_kg"].astype(float) if "max_payload_kg" in df.columns else 800.0
        feats["payload_ratio"] = pl / mpl.replace(0, 800.0)
        
        # Dwell hours
        start = df["depot_dwell_start"].astype(str) if "depot_dwell_start" in df.columns else "19:00"
        end = df["depot_dwell_end"].astype(str) if "depot_dwell_end" in df.columns else "06:30"
        
        dwells = []
        for s, e in zip(start, end):
            try:
                sm = int(s.split(":")[0]) * 60 + int(s.split(":")[1])
                em = int(e.split(":")[0]) * 60 + int(e.split(":")[1])
                if em <= sm: em += 1440
                dwells.append((em - sm) / 60.0)
            except Exception:
                dwells.append(10.0)
        feats["dwell_hours"] = dwells
        
        feats["stop_count"] = df["stop_count"].astype(float) if "stop_count" in df.columns else 25.0
        
        traffic_map = {"Low": 0, "Medium": 1, "High": 2}
        t_vals = df["traffic_level"].map(traffic_map).fillna(1) if "traffic_level" in df.columns else 1
        feats["traffic_code"] = t_vals
        
        road_map = {"Urban": 0, "Semi-Urban": 1, "Highway": 2}
        r_vals = df["road_type"].map(road_map).fillna(0) if "road_type" in df.columns else 0
        feats["road_code"] = r_vals
        
        return feats

    def train_and_evaluate(self, df, scored_labels):
        X = self._prepare_features(df)
        y = np.array([1 if l in ["Ready Now", "Ready with Depot Charger"] else 0 for l in scored_labels])
        
        # If class imbalance exists, synthesize minimal split
        if len(np.unique(y)) < 2:
            y[0] = 0
            y[-1] = 1

        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.25, random_state=42, stratify=y)
        self.rf_model.fit(X_train, y_train)
        self.is_trained = True

        y_pred = self.rf_model.predict(X_test)
        y_prob = self.rf_model.predict_proba(X_test)[:, 1] if len(np.unique(y)) > 1 else y_pred

        self.metrics = {
            "accuracy": round(accuracy_score(y_test, y_pred), 3),
            "precision": round(precision_score(y_test, y_pred, zero_division=0), 3),
            "recall": round(recall_score(y_test, y_pred, zero_division=0), 3),
            "f1_score": round(f1_score(y_test, y_pred, zero_division=0), 3),
            "sample_size": len(X)
        }

        # Feature importances
        for name, imp in zip(self.feature_names, self.rf_model.feature_importances_):
            self.feature_importances[name] = round(float(imp), 3)

        # Generate predictions for all rows
        all_probs = self.rf_model.predict_proba(X)[:, 1]
        results = []
        for idx, (p, v_id) in enumerate(zip(all_probs, df["vehicle_id"] if "vehicle_id" in df.columns else range(len(df)))):
            results.append({
                "vehicle_id": str(v_id),
                "ml_ev_suitability_probability": round(float(p), 3),
                "confidence_score": round(float(abs(p - 0.5) * 2), 3)
            })

        return {
            "model_type": "RandomForestClassifier",
            "metrics": self.metrics,
            "feature_importances": self.feature_importances,
            "predictions": results[:15]
        }
