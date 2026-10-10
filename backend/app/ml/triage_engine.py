import math
from datetime import datetime, timezone

class TriageEngine:
    """
    Intelligent Report Triage, Duplicate Candidate Detection,
    and Missed-Collection Anomaly Detection.
    """

    @classmethod
    def calculate_priority_score(cls, report_type, ai_category=None, is_overflowing=False,
                                 fill_percentage=None, hours_elapsed=0.0, address_text=""):
        """
        Calculates a transparent, multi-factor priority score (0 to 100).
        Separates deterministic business rules from ML predictions.
        """
        factors = {}
        score = 0.0

        # 1. Overflow Severity Factor (up to 35 pts)
        if is_overflowing:
            overflow_pts = 35.0 if (fill_percentage or 0) >= 85 else 28.0
            factors["overflow_severity"] = {"points": overflow_pts, "reason": "Confirmed container overflow spilling over rim"}
            score += overflow_pts
        elif fill_percentage is not None:
            if fill_percentage >= 70:
                overflow_pts = 20.0
            elif fill_percentage >= 50:
                overflow_pts = 10.0
            else:
                overflow_pts = 5.0
            factors["container_fill"] = {"points": overflow_pts, "reason": f"Container load at {fill_percentage}%"}
            score += overflow_pts

        # 2. Hazard & Waste Category Factor (up to 30 pts)
        if ai_category == "HAZARDOUS" or "hazard" in report_type.lower():
            hazard_pts = 30.0
            factors["hazardous_material"] = {"points": hazard_pts, "reason": "Potential bio/chemical hazard detected"}
            score += hazard_pts
        elif report_type == "ILLEGAL_DUMPING":
            hazard_pts = 22.0
            factors["illegal_dumping"] = {"points": hazard_pts, "reason": "Unauthorized dumping in public space"}
            score += hazard_pts
        elif ai_category == "ORGANIC":
            # Organic waste decomposes rapidly in tropical climates, attracting vectors
            org_pts = 15.0
            factors["organic_spoilage"] = {"points": org_pts, "reason": "Organic food waste subject to rapid spoilage"}
            score += org_pts
        else:
            factors["standard_waste"] = {"points": 8.0, "reason": "Standard recyclable or dry waste"}
            score += 8.0

        # 3. Report Age / Sinking SLA Factor (up to 20 pts)
        # Reports waiting over 12, 24, 48 hours accumulate urgency
        if hours_elapsed >= 48:
            age_pts = 20.0
        elif hours_elapsed >= 24:
            age_pts = 15.0
        elif hours_elapsed >= 12:
            age_pts = 10.0
        elif hours_elapsed >= 4:
            age_pts = 5.0
        else:
            age_pts = 2.0
        factors["sla_age"] = {"points": age_pts, "reason": f"Pending for {round(hours_elapsed, 1)} hours without collection"}
        score += age_pts

        # 4. Location Context / High Density Area (up to 15 pts)
        addr_lower = (address_text or "").lower()
        if any(kw in addr_lower for kw in ["hospital", "clinic", "school", "market", "promenade", "station"]):
            loc_pts = 15.0
            factors["sensitive_location"] = {"points": loc_pts, "reason": "Proximity to high-density public or healthcare facility"}
            score += loc_pts
        else:
            factors["residential_location"] = {"points": 5.0, "reason": "Standard residential or commercial street"}
            score += 5.0

        score = min(100.0, max(0.0, score))

        if score >= 75.0:
            recommended_priority = "URGENT"
        elif score >= 50.0:
            recommended_priority = "HIGH"
        elif score >= 28.0:
            recommended_priority = "MEDIUM"
        else:
            recommended_priority = "LOW"

        # Suggested triage queue
        if ai_category == "HAZARDOUS" or "hazard" in report_type.lower():
            triage_queue = "HAZARDOUS_DISPOSAL"
        elif ai_category in ["PLASTIC", "PAPER", "METAL", "GLASS"]:
            triage_queue = "RECYCLABLES_RECOVERY"
        elif ai_category == "ORGANIC":
            triage_queue = "COMPOST_ORGANIC"
        else:
            triage_queue = "GENERAL_COMPACTOR"

        return {
            "priority_score": round(score, 1),
            "recommended_priority": recommended_priority,
            "triage_queue": triage_queue,
            "scoring_factors": factors
        }

    @classmethod
    def detect_duplicates(cls, candidate_report, existing_reports, max_distance_meters=150.0, max_hours_diff=48.0):
        """
        Finds potential duplicate reports using spatio-temporal proximity
        and lexical description matching.
        """
        c_lat = candidate_report.get("latitude")
        c_lon = candidate_report.get("longitude")
        c_created_str = candidate_report.get("created_at")
        c_desc = (candidate_report.get("description") or "").lower()
        c_type = candidate_report.get("report_type")

        if c_lat is None or c_lon is None:
            return []

        try:
            c_time = datetime.fromisoformat(c_created_str.replace("Z", "+00:00")) if c_created_str else datetime.now(timezone.utc)
        except Exception:
            c_time = datetime.now(timezone.utc)

        c_tokens = set(c_desc.split())

        candidates = []
        for rep in existing_reports:
            # Skip comparing report against itself
            if rep.get("id") == candidate_report.get("id") or rep.get("report_number") == candidate_report.get("report_number"):
                continue

            r_lat = rep.get("latitude")
            r_lon = rep.get("longitude")
            if r_lat is None or r_lon is None:
                continue

            # 1. Geo distance
            dist_m = cls._haversine(float(c_lat), float(c_lon), float(r_lat), float(r_lon))
            if dist_m > max_distance_meters:
                continue

            # 2. Time difference
            r_created_str = rep.get("created_at")
            try:
                r_time = datetime.fromisoformat(r_created_str.replace("Z", "+00:00")) if r_created_str else c_time
                hours_diff = abs((c_time - r_time).total_seconds()) / 3600.0
            except Exception:
                hours_diff = 0.0

            if hours_diff > max_hours_diff:
                continue

            # 3. Lexical Jaccard similarity
            r_desc = (rep.get("description") or "").lower()
            r_tokens = set(r_desc.split())
            if c_tokens and r_tokens:
                jaccard = len(c_tokens.intersection(r_tokens)) / float(len(c_tokens.union(r_tokens)))
            else:
                jaccard = 0.5 if c_type == rep.get("report_type") else 0.2

            # Proximity score (1.0 = identical spot, 0.0 = at threshold)
            dist_score = max(0.0, 1.0 - (dist_m / max_distance_meters))
            time_score = max(0.0, 1.0 - (hours_diff / max_hours_diff))
            type_match = 1.0 if c_type == rep.get("report_type") else 0.4

            combined_similarity = round(dist_score * 0.45 + time_score * 0.25 + jaccard * 0.15 + type_match * 0.15, 3)

            if combined_similarity >= 0.50:
                candidates.append({
                    "matched_report_id": rep.get("id"),
                    "matched_report_number": rep.get("report_number"),
                    "matched_status": rep.get("status"),
                    "distance_meters": round(dist_m, 1),
                    "hours_difference": round(hours_diff, 1),
                    "similarity_score": combined_similarity,
                    "explanation": f"Within {round(dist_m)}m and filed {round(hours_diff, 1)}h apart for same/similar issue."
                })

        candidates.sort(key=lambda x: x["similarity_score"], reverse=True)
        return candidates

    @classmethod
    def detect_missed_collection_anomalies(cls, schedules, route_stops):
        """
        Compares published schedules with active route stop statuses to flag
        anomalies (e.g. overdue morning pickups, skipped bins).
        """
        now = datetime.now(timezone.utc)
        current_time_str = now.strftime("%H:%M")
        anomalies = []

        for stop in route_stops:
            status = stop.get("status")
            stop_type = stop.get("stop_type")
            est_arrival = stop.get("estimated_arrival")

            # Check if stop was skipped without exception
            if status == "SKIPPED" and not stop.get("exception_reason"):
                anomalies.append({
                    "stop_id": stop.get("id"),
                    "anomaly_type": "UNEXPLAINED_SKIP",
                    "severity": "HIGH",
                    "stop_address": stop.get("address"),
                    "details": "Stop marked skipped without recording driver exception reason."
                })

            # Check if stop is scheduled for earlier today but still pending
            if status == "PENDING" and est_arrival and est_arrival < current_time_str:
                anomalies.append({
                    "stop_id": stop.get("id"),
                    "anomaly_type": "OVERDUE_COLLECTION",
                    "severity": "MEDIUM",
                    "stop_address": stop.get("address"),
                    "details": f"Scheduled arrival was {est_arrival}, but stop has not been started."
                })

        return anomalies

    @staticmethod
    def _haversine(lat1, lon1, lat2, lon2):
        R = 6371000.0
        p1 = math.radians(lat1)
        p2 = math.radians(lat2)
        dp = math.radians(lat2 - lat1)
        dl = math.radians(lon2 - lon1)
        a = math.sin(dp / 2.0)**2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2.0)**2
        return R * 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
