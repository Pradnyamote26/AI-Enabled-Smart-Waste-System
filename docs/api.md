# REST API Documentation (`/api/v1`)

All endpoints accept and return JSON. Authenticated endpoints require the `Authorization: Bearer <token>` header.

## 1. Authentication
- `POST /api/v1/auth/login`
  - Body: `{ "email": "admin@smartwaste.gov", "password": "admin123" }`
  - Returns: `{ "token": "...", "user": { "id": "...", "role": "admin", "full_name": "..." } }`
- `POST /api/v1/auth/register`
  - Body: `{ "full_name": "Anita", "email": "anita@example.com", "password": "...", "phone": "..." }`
  - Returns: User record with enforced `role: "reporter"`.
- `GET /api/v1/auth/me`
  - Returns current user profile.

## 2. Public Reporting & Tracking
- `POST /api/v1/public/reports`
  - Body: `{ "report_type": "OVERFLOWING_BIN", "latitude": 19.076, "longitude": 72.997, "address_text": "...", "description": "...", "image": "<base64>", "qr_token": "..." }`
  - Returns: `{ "report_number": "REP-2026-0002", "tracking_token": "<secret_token>", "ai_analysis": { ... } }`
- `GET /api/v1/public/track/<tracking_token>`
  - Returns sanitized report details, timeline status, and AI assessment.
- `POST /api/v1/public/reports/<tracking_token>/missed-collection`
  - Body: `{ "complaint_text": "Collection missed this morning..." }`

## 3. Routes & Optimization
- `GET /api/v1/admin/routes`
- `POST /api/v1/admin/routes`
  - Body: `{ "route_name": "Morning Sweep", "route_date": "2026-10-15", "shift": "MORNING", "vehicle_id": "...", "driver_id": "..." }`
- `GET /api/v1/admin/routes/<id>`
  - Returns route, stops in sequence, vehicle, driver, and GeoJSON route geometry.
- `POST /api/v1/admin/routes/<id>/optimize`
  - Optimizes sequence using 2-Opt and Nearest Neighbor; returns updated distance and arrival times.
- `POST /api/v1/admin/routes/<id>/publish`
  - Verifies conflict prevention and dispatches to assigned driver.

## 4. Driver Tasks
- `GET /api/v1/driver/routes/today`
- `POST /api/v1/driver/routes/<id>/start`
- `POST /api/v1/driver/routes/<id>/complete`
- `POST /api/v1/driver/stops/<id>/start`
- `POST /api/v1/driver/stops/<id>/complete`
  - Enforces photo proof if `photo_required` is true.
- `POST /api/v1/driver/stops/<id>/proof`
  - Body: `{ "image": "<base64>" }`
- `POST /api/v1/driver/stops/<id>/exception`
  - Body: `{ "type": "SKIPPED", "reason": "Road blocked by construction" }`

## 5. Proof & AI Review
- `GET /api/v1/admin/proofs`
- `POST /api/v1/admin/proofs/<id>/review`
  - Body: `{ "decision": "APPROVED" | "REJECTED", "notes": "..." }`
- `POST /api/v1/ai/analyze-image`
- `GET /api/v1/ai/model-info`
