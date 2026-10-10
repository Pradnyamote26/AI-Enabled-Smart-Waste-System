import math
import requests

class RoutingService:
    @staticmethod
    def haversine_distance(lat1, lon1, lat2, lon2):
        """Calculates distance between two coordinates in meters"""
        R = 6371000 # Earth radius in meters
        phi1 = math.radians(lat1)
        phi2 = math.radians(lat2)
        delta_phi = math.radians(lat2 - lat1)
        delta_lambda = math.radians(lon2 - lon1)

        a = math.sin(delta_phi / 2)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2)**2
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        return R * c

    @classmethod
    def get_route_details(cls, coordinates, osrm_base_url="https://router.project-osrm.org"):
        """
        Coordinates list of tuples/lists: [(lat, lon), (lat, lon), ...]
        Returns distance_meters, duration_seconds, geometry coordinates, and provider info.
        """
        if not coordinates or len(coordinates) < 2:
            return {
                "distance_meters": 0,
                "duration_seconds": 0,
                "geometry": [],
                "provider": "NONE",
                "is_road_exact": True
            }

        # Format OSRM query: lon,lat;lon,lat...
        coord_str = ";".join([f"{lon:.6f},{lat:.6f}" for lat, lon in coordinates])
        url = f"{osrm_base_url}/route/v1/driving/{coord_str}?overview=full&geometries=geojson"

        try:
            resp = requests.get(url, timeout=4.0)
            if resp.status_code == 200:
                data = resp.json()
                if data.get("code") == "Ok" and data.get("routes"):
                    best_route = data["routes"][0]
                    # GeoJSON coordinates are [lon, lat], return as [lat, lon] for Leaflet
                    geometry = [[pt[1], pt[0]] for pt in best_route["geometry"]["coordinates"]]
                    return {
                        "distance_meters": round(best_route["distance"], 1),
                        "duration_seconds": int(best_route["duration"]),
                        "geometry": geometry,
                        "provider": "OSRM_ROAD_NETWORK",
                        "is_road_exact": True
                    }
        except Exception as e:
            # Fall back to geodetic network approximation with road curvature factor
            pass

        # Haversine fallback with realistic urban road tortuosity factor (1.32x)
        total_dist = 0.0
        for i in range(len(coordinates) - 1):
            c1 = coordinates[i]
            c2 = coordinates[i + 1]
            total_dist += cls.haversine_distance(c1[0], c1[1], c2[0], c2[1]) * 1.32

        # Urban average speed 25 km/h = 6.94 m/s
        estimated_duration = int(total_dist / 6.94)

        return {
            "distance_meters": round(total_dist, 1),
            "duration_seconds": estimated_duration,
            "geometry": [[c[0], c[1]] for c in coordinates],
            "provider": "GEO_ROAD_APPROXIMATION",
            "is_road_exact": False,
            "note": "External OSRM network server was not directly reachable; used calibrated urban distance metrics."
        }
