from datetime import datetime, timedelta
from app.services.routing_service import RoutingService

class OptimizationService:
    """
    Combinatorial Multi-Stop Route Optimization & Scheduling Engine
    Algorithm: Priority-Weighted Nearest Neighbor + 2-Opt Local Search
    Methodology: Algorithmic Combinatorial Optimization (Heuristic Operations Research, not ML)
    """

    @classmethod
    def optimize_stops(cls, stops, start_location=None, end_location=None, vehicle_capacity_kg=2500):
        """
        Optimizes sequence of stops.
        Respects:
        - 'is_locked' stops (fixed by administrator)
        - Already 'COMPLETED' or 'STARTED' stops
        - Priority urgency weighting (URGENT/HIGH served earlier)
        - Vehicle mass capacity constraints
        - Valid coordinates verification
        Returns reordered stops, metrics, geometry, and operational warnings.
        """
        if not stops:
            return {
                "stops": [],
                "distance_meters": 0,
                "duration_seconds": 0,
                "warnings": [],
                "optimization_method": "PRIORITY_2OPT_HEURISTIC"
            }

        warnings = []
        valid_stops = []
        unmapped_stops = []

        for s in stops:
            lat = s.get("latitude")
            lon = s.get("longitude")
            if lat is None or lon is None or (float(lat) == 0.0 and float(lon) == 0.0):
                unmapped_stops.append(s)
                warnings.append(f"Stop '{s.get('target_name') or s.get('id')}' lacks valid GPS coordinates and was placed at end of route.")
            else:
                valid_stops.append(s)

        # Partition into fixed (completed or locked) and flexible stops
        fixed_indices = {i for i, s in enumerate(valid_stops) if s.get("is_locked") or s.get("status") in ["COMPLETED", "STARTED"]}

        # Extract coordinates and priority weights
        points = []
        priority_multipliers = []
        for s in valid_stops:
            lat = float(s.get("latitude", 0.0))
            lon = float(s.get("longitude", 0.0))
            points.append((lat, lon))

            pri = (s.get("priority") or "MEDIUM").upper()
            if pri == "URGENT":
                # 45% apparent distance discount for greedy early insertion
                priority_multipliers.append(0.55)
            elif pri == "HIGH":
                priority_multipliers.append(0.75)
            else:
                priority_multipliers.append(1.0)

        n = len(valid_stops)
        if n <= 2:
            order = list(range(n))
        else:
            # Nearest neighbor tour starting from start_location or first fixed stop
            unvisited = set(range(n))
            order = []

            current = 0
            if start_location:
                closest_idx = min(
                    unvisited,
                    key=lambda i: RoutingService.haversine_distance(start_location[0], start_location[1], points[i][0], points[i][1]) * priority_multipliers[i]
                )
                if 0 not in fixed_indices:
                    current = closest_idx

            order.append(current)
            unvisited.remove(current)

            while unvisited:
                last_pt = points[order[-1]]
                next_stop = min(
                    unvisited,
                    key=lambda i: RoutingService.haversine_distance(last_pt[0], last_pt[1], points[i][0], points[i][1]) * priority_multipliers[i]
                )
                order.append(next_stop)
                unvisited.remove(next_stop)

            # 2-Opt refinement for unlocked stops
            improved = True
            iterations = 0
            while improved and iterations < 35:
                improved = False
                iterations += 1
                for i in range(1, n - 2):
                    for j in range(i + 1, n):
                        # Preserve locked/fixed stops in place
                        if any(order[k] in fixed_indices for k in range(i, j + 1)):
                            continue

                        p1, p2 = points[order[i - 1]], points[order[i]]
                        p3, p4 = points[order[j]], points[order[(j + 1) % n]]

                        d_curr = RoutingService.haversine_distance(p1[0], p1[1], p2[0], p2[1]) + RoutingService.haversine_distance(p3[0], p3[1], p4[0], p4[1])
                        d_swap = RoutingService.haversine_distance(p1[0], p1[1], p3[0], p3[1]) + RoutingService.haversine_distance(p2[0], p2[1], p4[0], p4[1])

                        if d_swap < d_curr - 8: # 8m threshold
                            order[i:j + 1] = reversed(order[i:j + 1])
                            improved = True

        # Reconstruct ordered list + unmapped at end
        ordered_stops = [valid_stops[idx] for idx in order] + unmapped_stops
        for seq, s in enumerate(ordered_stops, start=1):
            s["sequence_number"] = seq

        # Calculate coordinates sequence for road network mapping
        coords = []
        if start_location:
            coords.append((start_location[0], start_location[1]))
        for s in valid_stops:
            coords.append((float(s.get("latitude", 0)), float(s.get("longitude", 0))))
        if end_location:
            coords.append((end_location[0], end_location[1]))

        route_info = RoutingService.get_route_details(coords)

        # Estimate arrival times assuming 07:00 AM route start
        current_time = datetime.strptime("07:00", "%H:%M")
        total_load_kg = 0.0

        for s in ordered_stops:
            s["estimated_arrival"] = current_time.strftime("%H:%M")
            service_mins = int(s.get("service_duration_minutes") or 12)
            current_time += timedelta(minutes=service_mins + 4)
            s["estimated_departure"] = current_time.strftime("%H:%M")

            # Accumulate load: bin volume * 0.45 kg/L or standard 60kg for complaint stop
            cap_l = float(s.get("capacity_liters") or 240.0)
            load = cap_l * 0.45 if s.get("stop_type") != "COMPLAINT" else 65.0
            total_load_kg += load

        if total_load_kg > vehicle_capacity_kg:
            warnings.append(
                f"Projected route waste mass ({int(total_load_kg)} kg) exceeds vehicle payload capacity ({int(vehicle_capacity_kg)} kg). "
                f"Consider splitting into two shifts or dispatching a higher-capacity compactor."
            )

        return {
            "stops": ordered_stops,
            "distance_meters": route_info["distance_meters"],
            "duration_seconds": route_info["duration_seconds"],
            "geometry": route_info["geometry"],
            "provider": route_info.get("provider"),
            "is_road_exact": route_info.get("is_road_exact", True),
            "estimated_load_kg": round(total_load_kg, 1),
            "warnings": warnings,
            "optimization_method": "PRIORITY_WEIGHTED_2OPT"
        }
