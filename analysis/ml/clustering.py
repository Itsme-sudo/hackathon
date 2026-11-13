"""
Machine Learning Module: Route Clustering using K-Means
Discovers operational archetypes: Hyperlocal Express, Intra-City, Suburban Heavy, Intercity Long-Haul.
"""
import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler

class RouteClusterEngine:
    def __init__(self, n_clusters=4):
        self.n_clusters = n_clusters
        self.kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
        self.scaler = StandardScaler()

    def cluster_routes(self, df):
        if len(df) < self.n_clusters:
            return {"clusters": [], "archetypes": []}

        feats = pd.DataFrame()
        feats["dist"] = df["daily_distance_km"].astype(float)
        feats["payload"] = df["payload_kg"].astype(float) if "payload_kg" in df.columns else 500.0
        feats["stops"] = df["stop_count"].astype(float) if "stop_count" in df.columns else 25.0

        X_scaled = self.scaler.fit_transform(feats)
        labels = self.kmeans.fit_predict(X_scaled)

        archetype_names = [
            "Hyperlocal Urban Express",
            "Intra-City Commercial Logistics",
            "Suburban High-Payload Feeder",
            "Regional Intercity Long-Haul"
        ]

        # Calculate cluster summaries
        cluster_summary = []
        for c_id in range(self.n_clusters):
            mask = (labels == c_id)
            sub = df[mask]
            count = len(sub)
            avg_dist = round(sub["daily_distance_km"].mean(), 1) if count > 0 else 0
            avg_stops = round(sub["stop_count"].mean(), 1) if count > 0 and "stop_count" in sub.columns else 0
            
            cluster_summary.append({
                "cluster_id": c_id,
                "archetype_name": archetype_names[c_id % len(archetype_names)],
                "vehicle_count": count,
                "average_distance_km": avg_dist,
                "average_stop_count": avg_stops,
                "ev_suitability_recommendation": "High" if avg_dist < 60 else "Moderate" if avg_dist < 110 else "Low"
            })

        return {
            "num_clusters": self.n_clusters,
            "clusters": cluster_summary
        }
