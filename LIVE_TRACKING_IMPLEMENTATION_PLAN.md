# Live Driver Tracking & Public ETA — Implementation Plan

> **Version**: 1.0.0  
> **Author**: Senior Full-Stack Engineer, Geolocation Engineer, & QA Lead  
> **System**: EcoRoute • AI-Enabled Smart Waste Segregation & Route Optimization System  
> **Component**: Real-Time Vehicle Tracking & Estimated Time of Arrival (ETA)

---

## 1. Architectural Inspection & Baseline Assessment

### Existing Capabilities
1. **Routing Service (`backend/app/services/routing_service.py`)**:
   - `RoutingService.get_route_details(coordinates)` is fully implemented.
   - Integrates with Open Source Routing Machine (OSRM) at `https://router.project-osrm.org/route/v1/driving/` with polyline geometry output.
   - Includes fallback to calibrated urban road network routing (1.32x tortuosity factor, 25 km/h urban average speed) when external OSRM is unreachable.
2. **Route & Trip Lifecycle (`driver_routes.py`)**:
   - Routes transition through `PUBLISHED` -> `IN_PROGRESS` (via `/driver/routes/<id>/start`) -> `COMPLETED` (via `/driver/routes/<id>/complete`).
   - Starting a route transitions the assigned vehicle to `EN_ROUTE`.
   - Completing a route resets the vehicle to `AVAILABLE`.
   - Individual stops transition: `PENDING` -> `STARTED` -> `COMPLETED` / `SKIPPED` / `ISSUE_REPORTED`.
3. **Report Linkage (`waste_reports` & `route_stops`)**:
   - Reports have `anonymous_token_hash` and `tracking_token_display`.
   - Reports link to collection routes via `route_stops.report_id == report.id` and `report.assigned_vehicle_id`.
   - Starting a stop with `report_id` sets report status to `IN_COLLECTION`.
4. **Current Deficits**:
   - No GPS telemetry ingestion API from the driver's browser.
   - No live tracking session persistence in `DataStore`.
   - Admin panel has static maps for route stops, but lacks a dynamic live fleet tracking board showing actual vehicle GPS positions.
   - Public tracking page (`PublicTrackingPage.tsx`) shows status timeline, but lacks live vehicle coordinates, destination map marker, and ETA countdown.

---

## 2. Data Models & Database Schema Additions

### 1. `vehicle_tracking_sessions` (in `DataStore` / `smart_waste_store.json`)
```json
{
  "id": "uuid",
  "route_id": "uuid",
  "driver_id": "uuid",
  "vehicle_id": "uuid",
  "status": "ACTIVE | COMPLETED | CANCELLED | STALE",
  "current_latitude": 19.0760,
  "current_longitude": 72.8777,
  "accuracy_meters": 12.5,
  "heading": 180.0,
  "speed_mps": 6.5,
  "last_ping_at": "2026-10-10T00:30:00Z",
  "started_at": "2026-10-10T00:15:00Z",
  "ended_at": null,
  "next_stop_id": "uuid",
  "next_stop_eta_seconds": 540,
  "next_stop_eta_time": "2026-10-10T00:39:00Z",
  "next_stop_distance_meters": 3200.0,
  "eta_provider": "OSRM_ROAD_NETWORK",
  "created_at": "2026-10-10T00:15:00Z",
  "updated_at": "2026-10-10T00:30:00Z"
}
```

### 2. `location_breadcrumbs`
Stores recent GPS pings (capped to last 50 per session) for path visualization and operational audit:
```json
{
  "id": "uuid",
  "session_id": "uuid",
  "route_id": "uuid",
  "driver_id": "uuid",
  "latitude": 19.0760,
  "longitude": 72.8777,
  "accuracy_meters": 12.5,
  "timestamp": "2026-10-10T00:30:00Z"
}
```

---

## 3. Backend API Contracts & Endpoints

| Endpoint | Method | Role | Description |
| :--- | :---: | :---: | :--- |
| `/api/v1/driver/tracking/start` | `POST` | Driver | Starts or activates a tracking session for driver's active route and assigned vehicle. |
| `/api/v1/driver/tracking/location` | `POST` | Driver | Ingests device GPS ping (`latitude`, `longitude`, `accuracy`, `timestamp`, `heading`, `speed`). Validates driver ownership, computes ETA, logs breadcrumb. |
| `/api/v1/driver/tracking/stop` | `POST` | Driver | Explicitly pauses or ends tracking session. |
| `/api/v1/driver/tracking/status` | `GET` | Driver | Returns driver's active tracking session, next stop ETA, and server sync state. |
| `/api/v1/admin/tracking/live` | `GET` | Admin | Returns all active tracking sessions enriched with driver names, vehicle numbers, route progress, ETA, and stale flag. |
| `/api/v1/admin/tracking/routes/<route_id>` | `GET` | Admin | Detailed tracking data for a route: vehicle position, breadcrumb trajectory, stops ETA list, and road geometry. |
| `/api/v1/public/track/<tracking_token>` | `GET` | Public | Enriched response with `live_tracking` when report is in an active collection trip. Strict privacy filters applied. |

---

## 4. ETA Calculation Engine

1. **Current Verified Origin**: Latest validated `(latitude, longitude)` from active tracking session.
2. **Next Destination**: Next uncompleted stop (`PENDING` or `STARTED`) in sequence order.
3. **Road-Network Routing**: Call `RoutingService.get_route_details([(lat1, lon1), (lat2, lon2)])`.
4. **ETA Formula**:
   $$\text{ETA Time} = \text{now} + \Delta T_{\text{travel}} + \sum \Delta T_{\text{intermediate stops}}$$
   Where stop service allowance is 3 minutes (180s) per intermediate stop.
5. **Fallbacks & Edge Cases**:
   - If vehicle GPS is stale (> 3 minutes without ping), label ETA as `STALE`.
   - If coordinates are invalid or routing fails, return `status: "UNAVAILABLE"` with friendly notice. Never simulate fake progress.

---

## 5. Public Privacy & Security Boundaries

- **Zero PII Exposure**: The public endpoint must **never** return driver full name, driver phone number, driver email, or driver ID.
- **Scope Restriction**: Only the vehicle number, vehicle type, arrival ETA, trip status, destination coordinate, and latest vehicle coordinate are returned.
- **Lifecycle Restriction**: Once the collection stop is completed or the report is marked `RESOLVED`, live tracking is terminated immediately.
- **Cryptographic Token Verification**: Accessible only via the citizen's secure `tracking_token` SHA-256 hash match.

---

## 6. Frontend Driver Location Sharing Workflow

- When route starts, prompt driver: **"Enable Live GPS Telemetry for Route Dispatch"**.
- Use `navigator.geolocation.watchPosition` with fallback to periodic `getCurrentPosition`.
- Options: `enableHighAccuracy: true`, `timeout: 10000`, `maximumAge: 5000`.
- Interval throttling: ping backend every 12 seconds while in motion to preserve mobile battery and data.
- UI status pills:
  - 🟢 **Live GPS Sharing Active** (accuracy $\le 25\text{m}$)
  - 🟡 **GPS Signal Weak** (accuracy $> 25\text{m}$)
  - 🔴 **Location Permission Denied / GPS Off**
  - ⏸️ **Trip Inactive / Offline**
- Platform notice: Informs driver that mobile browsers may pause background timers when screen locks, advising keeping tab active during active runs.

---

## 7. Admin Live Fleet Tracking Dashboard

- Accessible as a dedicated view in `AdminPortal.tsx`: **"Live Fleet Tracking & Dispatch"**.
- Interactive Leaflet map displaying:
  - Custom vehicle truck marker at real-time GPS coordinates with popup.
  - Ordered stops route markers.
  - Active route geometry line.
  - Breadcrumb trail of recent vehicle positions.
- Fleet sidebar / drawer:
  - Filter by Active, Stale, or Completed trips.
  - Vehicle cards with driver name, plate number, route name, last ping time, and next stop ETA.
  - Selecting a vehicle highlights it on the map and opens the detail drawer.
  - Auto-refresh polling every 10 seconds.

---

## 8. Public Collection Tracking Enhancements

- Extended `PublicTrackingPage.tsx`:
  - When report has an active assignment and vehicle is on route:
    - Display **"Collection Vehicle En Route"** hero banner with live ETA countdown.
    - Leaflet map showing vehicle location and collection destination.
    - Live status pill: "Driver En Route • Updated 25s ago".
    - Status timeline tracking the actual workflow.
  - If driver has not yet started or vehicle is offline:
    - Clean informative status card stating vehicle assignment status without empty/broken maps.

---

## 9. Implementation Checklist

- [x] Add `vehicle_tracking_sessions` and `location_breadcrumbs` tables in `DataStore`.
- [x] Implement backend driver tracking endpoints (`/driver/tracking/start`, `/location`, `/stop`, `/status`) in `tracking_routes.py`.
- [x] Implement backend admin fleet tracking endpoints (`/admin/tracking/live`, `/admin/tracking/routes/<id>`).
- [x] Enrich `/public/track/<token>` with safe `live_tracking` object and ETA computation.
- [x] Implement location-sharing client hooks & UI in `DriverPortal.tsx` (consent modal, 12s throttled watchPosition, telemetry banner, stop on route finish).
- [x] Implement Live Fleet Tracking dashboard in `AdminPortal.tsx` (8s polling, vehicle selection drawer, stop-by-stop ETA, stale alerts).
- [x] Enhance `PublicTrackingPage.tsx` with live vehicle tracking map, destination pin, polyline, and ETA countdown card.
- [x] Add tracking API methods in `frontend/src/services/api.ts`.
- [x] Write automated tests in `tests/test_live_tracking.py` covering auth, session lifecycle, location ingestion, privacy, and ETA math.
- [x] Run full test regression suite (`pytest tests/ -v` -> 29/29 PASSED).
- [x] Run frontend production build (`npm run build` -> TypeScript & Vite built cleanly with 0 errors).
- [x] Run frontend linting (`oxlint` -> 0 errors).

---

## 10. QA & Verification Evidence

1. **Automated Backend Pytest Suite**:
   ```
   tests/test_admin_improvements.py: 9 passed
   tests/test_api.py: 7 passed
   tests/test_driver_portal.py: 8 passed
   tests/test_live_tracking.py: 5 passed
   TOTAL: 29 passed in 22.93s (100% pass rate)
   ```

2. **Frontend Production Build**:
   ```
   vite v8.3.4 building client environment for production...
   transforming...
   ✓ 1909 modules transformed.
   rendering chunks...
   dist/index.html                   0.92 kB │ gzip:   0.51 kB
   dist/assets/index-B3lR2ojr.css   41.53 kB │ gzip:  11.76 kB
   dist/assets/index-CSszQ2YB.js   633.99 kB │ gzip: 165.04 kB
   ✓ built in 644ms (0 errors)
   ```

3. **Privacy & Security Constraints Verified**:
   - `GET /api/v1/public/track/<token>` sanitizes all driver PII: `driver_phone`, `driver_email`, `driver_id`, and `driver_name` are guaranteed omitted.
   - Driver route isolation strictly enforced: attempting to publish coordinates for an unassigned route returns `403 Forbidden`.
   - GPS coordinate boundaries verified (-90 to 90 lat, -180 to 180 lon); invalid updates rejected with `400 Bad Request`.
   - Stale detection triggers automatically when vehicle coordinates have not been refreshed within 180 seconds.
