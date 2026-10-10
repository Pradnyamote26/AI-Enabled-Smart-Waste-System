# Driver Portal Expansion — Implementation Plan

> **Version**: 1.0.0  
> **Author**: Senior Full-Stack Engineer, Product Designer, & QA Lead  
> **System**: EcoRoute • AI-Enabled Smart Waste Segregation & Route Optimization System  
> **Component**: Driver Operations Portal Expansion

---

## 1. Architectural Inspection & Baseline Assessment

### Existing Capabilities
1. **Authentication**: JWT-based bearer auth with `@token_required(roles=["driver", "admin"])`. Passwords hashed with salted `scrypt`.
2. **Current Driver Routes (`driver_routes.py`)**:
   - `GET /api/v1/driver/routes/today`: Enriched with stops count and vehicle details.
   - `POST /api/v1/driver/routes/<id>/start`: Starts route, sets vehicle status to `EN_ROUTE`.
   - `POST /api/v1/driver/routes/<id>/complete`: Verifies 0 unresolved stops remain, resets vehicle to `AVAILABLE`.
   - `POST /api/v1/driver/stops/<id>/start`: Sets stop status to `STARTED`.
   - `POST /api/v1/driver/stops/<id>/complete`: Verifies proof policy and marks stop `COMPLETED`.
   - `POST /api/v1/driver/stops/<id>/exception`: Logs `SKIPPED` or `ISSUE_REPORTED` with mandatory reason.
3. **Current Proof Collection (`proof_routes.py`)**:
   - `POST /api/v1/driver/stops/<stop_id>/proof`: Secure upload, automated before/after AI comparison, records review status.
4. **Current Driver UI (`DriverPortal.tsx`)**:
   - Single-screen run sheet showing today's route with Leaflet map and stop cards.
   - Lacks dashboard KPIs, historical tasks, multi-route view, performance metrics, profile management, notification center, driver-admin communication, vehicle telemetry, and safety documentation.

### Deficits & Expansion Requirements
- **Missing Navigation & Layout**: Driver interface is locked to a single view.
- **Missing Task Center**: Tasks cannot be queried independently of today's active route run sheet.
- **Missing History & Performance**: Drivers cannot review past shifts or track their actual completion metrics.
- **Missing Driver-Admin Communication**: No persistent ticketing system to report blocked roads, bin vandalism, or truck mechanical faults.
- **Missing Profile & Security**: Driver cannot update contact details or change password securely.
- **Missing Notifications**: System notifications for route assignments, cancellations, and evidence review are stored in DB but have no driver view.

---

## 2. Data Models & Database Schema Additions

### Table Additions in `DataStore` (`backend/app/repositories/data_store.py`)
1. **`driver_issues`**:
   ```json
   {
     "id": "uuid",
     "driver_id": "uuid",
     "vehicle_id": "uuid (optional)",
     "route_id": "uuid (optional)",
     "stop_id": "uuid (optional)",
     "category": "VEHICLE_FAULT | BLOCKED_ROAD | ACCESS_ISSUE | ACCIDENT | SCHEDULE_INQUIRY | OTHER",
     "title": "string",
     "description": "string",
     "photo_url": "string (optional)",
     "status": "OPEN | IN_REVIEW | RESOLVED | REJECTED",
     "priority": "LOW | MEDIUM | HIGH | URGENT",
     "admin_response": "string (optional)",
     "resolved_by": "uuid (optional)",
     "resolved_at": "iso-date (optional)",
     "created_at": "iso-date",
     "updated_at": "iso-date"
   }
   ```
2. **`notifications`**:
   - Reused existing collection with enriched query endpoints for drivers (`GET /driver/notifications`, `PATCH /driver/notifications/<id>/read`).

---

## 3. Backend API Specifications (`driver_routes.py` & `admin_routes.py`)

| Endpoint | Method | Role | Description |
| :--- | :---: | :---: | :--- |
| `/api/v1/driver/dashboard` | `GET` | Driver | Dashboard KPIs, today's tasks, assigned vehicle, active route summary, recent performance. |
| `/api/v1/driver/tasks` | `GET` | Driver | Filterable task list (status, date, type). Authorized strictly to calling driver. |
| `/api/v1/driver/tasks/<id>` | `GET` | Driver | Full task detail, stop instructions, evidence policy, proof review status. |
| `/api/v1/driver/routes` | `GET` | Driver | All assigned routes (today, upcoming, past). |
| `/api/v1/driver/routes/<id>` | `GET` | Driver | Specific route run sheet with geometry and ordered stops. |
| `/api/v1/driver/history` | `GET` | Driver | Historical completed/failed/skipped collection records with date filters. |
| `/api/v1/driver/performance` | `GET` | Driver | Calculated metrics (total assigned, completed, completion rate %, on-time %, trends). |
| `/api/v1/driver/profile` | `GET` | Driver | Driver profile, license details, shift, assigned vehicle. |
| `/api/v1/driver/profile` | `PATCH` | Driver | Permitted profile updates (phone) and secure password change with verification. |
| `/api/v1/driver/notifications` | `GET` | Driver | Recipient driver's notifications with unread filter. |
| `/api/v1/driver/notifications/<id>/read` | `PATCH` | Driver | Mark notification as read. |
| `/api/v1/driver/notifications/mark-all-read` | `POST` | Driver | Mark all driver notifications read. |
| `/api/v1/driver/issues` | `GET` | Driver | List tickets submitted by the driver. |
| `/api/v1/driver/issues` | `POST` | Driver | Submit new ticket with category, description, and optional photo. |
| `/api/v1/driver/vehicle` | `GET` | Driver | Assigned vehicle telemetry, maintenance status, fuel type, and specifications. |
| `/api/v1/admin/driver-issues` | `GET` | Admin | Municipal admin view of all driver field issues. |
| `/api/v1/admin/driver-issues/<id>/respond`| `PATCH` | Admin | Respond to driver ticket, update status, and notify driver. |

---

## 4. Frontend Driver Portal Multi-Page Architecture

Expand `frontend/src/features/driver/DriverPortal.tsx` into a modular portal featuring:

1. **Driver Navigation Shell**:
   - Sidebar on desktop, collapsible drawer & bottom quick-navigation bar on mobile.
   - Header with active vehicle badge, current shift, and notification bell counter.
2. **Page 1: Driver Dashboard**:
   - Operational summary KPI cards (Today's Tasks, In Progress, Completed, Failed/Exceptions).
   - Current Vehicle status card with fault report shortcut.
   - Active Route banner with one-touch "Start Route" or "Resume Navigation".
   - Upcoming stops timeline.
   - Recent performance snapshot.
3. **Page 2: My Tasks**:
   - Tabbed/filtered stop list: Today, Upcoming, Completed, Exceptions.
   - Task detail modal: instructions, evidence requirement, address with GPS pin.
4. **Page 3: My Routes & Field Navigation**:
   - Interactive Leaflet map with polyline geometry.
   - Stop sequence checklist with lock status indicators.
   - "Navigate in Google Maps" external link button using GPS coordinates.
   - Stop actions: Start Stop, Finish Stop, Photo Upload, Exception Logging.
5. **Page 4: Task History**:
   - Paginated historical collection records with date range filters.
   - Evidence review badges (Approved / Needs Review / Rejected).
6. **Page 5: Performance Analytics**:
   - Real calculated metrics:
     $$\text{Completion Rate} = \frac{\text{Completed Tasks}}{\text{Eligible Assigned Tasks}} \times 100$$
   - Breakdown of routine vs complaint stops.
   - Daily and weekly completion trends.
7. **Page 6: My Profile**:
   - Personal credentials, employee ID, driver license info.
   - Contact phone update form.
   - Secure password update modal.
8. **Page 7: Notifications Center**:
   - Alert stream for new route assignments, schedule changes, evidence decisions.
   - Mark as read / Mark all as read.
9. **Page 8: Support & Admin Communication**:
   - Ticket submission modal: category, description, photo attachment.
   - Tickets list with status pills and administrative replies.
10. **Page 9: Vehicle & Shift Information**:
    - Vehicle specs: registration number, compactor capacity (kg), fuel type, maintenance status.
    - Assigned shift hours and guidelines.
11. **Page 10: Help & Safety Guide**:
    - Municipal collection SOPs, photo proof criteria, vehicle safety protocols, dispatch emergency contacts.

---

## 5. Security & Isolation Boundaries

- **Strict Identity Enforcement**: Drivers cannot query or manipulate another driver's routes, tasks, notifications, or issues.
- **Protected Profile Fields**: `role`, `is_active`, and `license_number` are read-only for the driver.
- **Password Security**: Requires old password verification; hashes new password with `SecurityService` (scrypt).
- **Audit Logging**: All stop exceptions, proof uploads, route completions, and ticket submissions log structured events.

---

## 6. Implementation & Verification Status

- [x] Add `driver_issues` table in `DataStore` and seed initial store state.
- [x] Implement backend driver endpoints in `driver_routes.py` (9 dedicated endpoints).
- [x] Implement admin driver issues endpoints in `admin_routes.py` (`GET` and `PATCH respond`).
- [x] Expand frontend API service `frontend/src/services/api.ts` with 15 typed methods.
- [x] Build expanded `DriverPortal.tsx` with 10 sections and mobile-first responsive navigation.
- [x] Add Driver Issues management tab & response workflow to `AdminPortal.tsx`.
- [x] Add styling in `frontend/src/index.css` for driver portal components and media queries.
- [x] Write and execute automated backend tests in `tests/test_driver_portal.py` (8/8 passed).
- [x] Run full backend test regression suite (24/24 passed in 19.60s).
- [x] Verify frontend build (`npm run build` passed with 0 errors) and linter (`npx oxlint` passed with 0 errors).

### Verification Results Summary

| Target Suite | Tests Run | Passed | Failed | Status |
| :--- | :---: | :---: | :---: | :---: |
| Backend Driver Portal (`test_driver_portal.py`) | 8 | 8 | 0 | **100% PASS** |
| Backend Full Regression (`pytest tests/`) | 24 | 24 | 0 | **100% PASS** |
| Frontend Production Build (`tsc -b && vite build`) | Full | OK | 0 | **0 Errors** |
| Frontend Linter (`npx oxlint`) | 11 files | OK | 0 | **0 Errors** |
