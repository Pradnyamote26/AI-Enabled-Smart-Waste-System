# Public Waste Services Portal — Implementation Plan

> **Version**: 1.0.0  
> **Author**: Senior Product Engineer, Full-Stack Developer, UX Designer, & QA Lead  
> **System**: EcoRoute • AI-Enabled Smart Waste Segregation & Route Optimization System  
> **Scope**: Complete Resident-Facing Waste Services Portal, Real-Time Fleet ETA, Published Schedules, Notifications & Issue Reopen Workflow

---

## 1. System Inspection & Gap Analysis

### Existing Capabilities
1. **Public Waste Reporting (`POST /api/v1/public/reports`)**:
   - Accepts category, coordinates, address, photo, and optional QR token.
   - Runs EcoVision AI inference for fill level and priority suggestion.
   - Generates high-entropy 24-byte unguessable `raw_tracking_token` (SHA-256 hashed in DB).
2. **Public Report Tracking (`GET /api/v1/public/track/<token>`)**:
   - Returns sanitized report details and `live_tracking` block when assigned vehicle is active.
   - Zero driver personal data exposed (privacy guaranteed).
   - Missed collection endpoint: `POST /api/v1/public/reports/<token>/missed-collection`.
3. **Citizen Role (`reporter`)**:
   - `auth_routes.py` registers residents as `role: "reporter"`.
   - `GET /api/v1/reports/mine` returns reports matching `reporter_id`.

### Identified Deficits & Required Integrations
1. **No Unified Citizen Home Portal**:
   - Frontend had separate tabs (`report`, `track`) with no central services hub, announcements, schedule browser, or FAQ.
2. **Missing Public Schedules Endpoint**:
   - `GET /admin/schedules` is locked to admin only. Residents need `GET /api/v1/public/schedules` to look up collection days, windows, and service areas.
3. **Missing Service Announcements**:
   - No public announcements feed for weather disruptions, holiday schedules, or e-waste drives.
4. **Missing Report Follow-up & Reopen Workflow**:
   - Citizens had no mechanism to report that an issue was unresolved after driver completion or to request a follow-up with additional evidence.
5. **No Event-Driven Notifications for Residents**:
   - When admins approve, assign, reject, or resolve a report, no notification was sent to the resident's inbox.
6. **Authenticated Report Linking**:
   - Public reporting endpoint did not automatically link logged-in `reporter_id` from the Authorization header.
7. **Audit & Timeline Completeness**:
   - Status tracking lacked full timestamped transition history, delay explanations, and collection proof photos.

---

## 2. Architecture & API Contracts

### Backend Endpoints
| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/v1/public/schedules` | Public | Published collection schedules filtered by area, building, day |
| `GET` | `/api/v1/public/announcements` | Public | Official municipal service bulletins & notices |
| `POST` | `/api/v1/public/reports/<token>/reopen` | Public / Reporter | Submit follow-up / reopen alert for unresolved collection |
| `GET` | `/api/v1/citizen/notifications` | Reporter | Citizen notification inbox (report status changes) |
| `PATCH` | `/api/v1/citizen/notifications/<id>/read` | Reporter | Mark notification as read |
| `POST` | `/api/v1/citizen/notifications/mark-all-read` | Reporter | Mark all citizen notifications as read |
| `GET` | `/api/v1/public/track/<token>` | Public | Enriched with audit timeline, proof photos, delay reasons, live tracking |
| `POST` | `/api/v1/public/reports` | Public / Reporter | Automatically associates `reporter_id` if JWT present, anti-duplicate protection |

---

## 3. Database & Model Additions
- **`service_announcements`**: Broadcast notices (title, content, type, urgency, published date).
- **`report_followups`**: Unresolved collection follow-ups (report_id, citizen reason, proof, status, admin review note).
- **`notifications`**: Dispatched to `reporter_id` upon report transitions (APPROVED, ASSIGNED, EN_ROUTE, COMPLETED, RESOLVED, REOPENED).

---

## 4. UI/UX Design System & Public Pages

1. **Public Services Home Hub (`PublicPortal.tsx`)**:
   - Quick-action service cards (Report Waste, Track Request, View Schedules, Missed Pickup, Live Radar).
   - Urgent Municipal Bulletin banner.
   - Interactive FAQ accordion and service standards (SLAs).
2. **Enhanced Report Submission**:
   - GPS coordinate acquisition with accuracy pill + interactive Leaflet pin picker.
   - Image drag-and-drop / file upload with AI preview and size validation.
   - Anti-double-click submission guard.
   - Post-submission celebration card with one-click token copying and direct tracking launcher.
3. **Comprehensive Tracking Experience**:
   - Verified status timeline with audit log timestamps.
   - Interactive Live Vehicle Radar with real-time OSRM ETA.
   - Resolution proof inspection (before/after photos).
   - "Issue Unresolved?" follow-up modal.
4. **Collection Schedule Browser**:
   - Service area, building, and weekday filters.
   - Time windows, truck types, and missed-collection quick link.
5. **My Reports & Notifications Dashboard**:
   - Filterable list of resident's submitted tickets.
   - Notification badges with unread counters.

---

## 5. Acceptance Criteria & Verification Plan

1. **Anonymous Submission & High-Entropy Tracking**:
   - Submitting without login returns unique reference (`REP-2026-XXXX`) and unguessable 24-byte token.
   - Token grants read-only tracking without exposing internal IDs or driver PII.
2. **Authenticated Resident Integration**:
   - Submitting while logged in automatically links `reporter_id`.
   - "My Reports" shows all resident tickets with real-time status.
3. **Public Collection Schedules**:
   - `GET /public/schedules` returns published days and time windows with honest empty states.
4. **Reopen / Follow-up Workflow**:
   - Citizen can flag a resolved report as unresolved; notifies admin and logs audit entry.
5. **Notifications Lifecycle**:
   - Admin status changes dispatch notifications to resident inbox.
6. **Live Vehicle GPS Tracking**:
   - Active routes show verified truck position, polyline, and road-network ETA.
   - No mock/fake GPS coordinates.
7. **Regression Testing**:
   - 100% pass rate on full backend pytest suite (`pytest tests/ -v`).
   - Clean frontend build (`npm run build`) and linting (`oxlint`).

---

## 6. Implementation Progress Tracker

- [x] Backend: Add `service_announcements` and `report_followups` to DataStore.
- [x] Backend: Implement `GET /public/schedules` and `GET /public/announcements`.
- [x] Backend: Implement `POST /public/reports/<token>/reopen` and enrich `GET /public/track/<token>` with timeline and proofs.
- [x] Backend: Add citizen notification endpoints (`/citizen/notifications`) and link notifications on report transitions.
- [x] Frontend: Add new methods in `frontend/src/services/api.ts`.
- [x] Frontend: Build complete `PublicPortal.tsx` integrating Home, Report, Track, Schedules, Announcements, FAQ, and My Reports.
- [x] Frontend: Integrate `PublicPortal` into `App.tsx`.
- [x] Testing: Write automated tests in `backend/tests/test_public_portal.py`.
- [x] Verification: Execute `npm run build` and `oxlint`. All passed with 0 errors!
