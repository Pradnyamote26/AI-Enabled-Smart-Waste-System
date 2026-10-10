# System Architecture & Technical Design

## 1. High-Level Architecture

```
+-----------------------------------------------------------------------------------+
|                                  USER TIERS                                       |
|  +------------------+  +------------------+  +------------------+  +-----------+  |
|  | Municipal Admin  |  | Field Crew Driver|  | Citizen Reporter |  | Anonymous |  |
|  +--------+---------+  +--------+---------+  +--------+---------+  +-----+-----+  |
+-----------|---------------------|---------------------|------------------|--------+
            |                     |                     |                  |
            v                     v                     v                  v
+-----------------------------------------------------------------------------------+
|                        REACT 19 + VITE + TYPESCRIPT FRONTEND                      |
|  - Leaflet + OpenStreetMap Interactive Maps                                       |
|  - Municipal Design System (Warm off-white, Forest Green #1b4332, Slate accents)  |
|  - Typed API Service Client (Bearer JWT token injection)                         |
|  - Role-gated shells: Admin Portal, Driver Portal, Reporter Portal, Public Pages  |
+-----------------------------------------+-----------------------------------------+
                                          | JSON REST APIs (/api/v1)
                                          v
+-----------------------------------------------------------------------------------+
|                              PYTHON + FLASK REST API                              |
|  +--------------------+--------------------------------------------------------+  |
|  | Auth & Security    | JWT validation, Role-based decorators, Input sanitization|  |
|  | Workflow Policy    | State machine guards, Photo proof policy, Conflict check|  |
|  | Routing Service    | OSRM road distance matrix with geodetic fallback       |  |
|  | Optimization Engine| Multi-stop TSP (2-Opt & Nearest Neighbor), Time windows |  |
|  | Real AI Service    | CV edge/luminance quality, waste classifier, proof diff |  |
|  | QR Code Service    | Vector/Raster QR generation with direct public token    |  |
|  | Cloudinary Bridge  | Secure media asset management with local fallback       |  |
+-----------------------------------------+-----------------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
|                             DATA & PERSISTENCE LAYER                              |
|  - Supabase PostgreSQL: 18 operational tables, constraints, foreign keys, RLS     |
|  - Thread-Safe Local Store: Instant local execution & reproducible test runs      |
+-----------------------------------------------------------------------------------+
```

## 2. Key Workflow Enforcements
1. **Routine vs. Complaint Stops (AC-06)**
   - Routine scheduled morning stops have `photo_required = false`. Drivers can start and complete them without forcing photos.
   - On-demand citizen complaints have `photo_required = true`. The system rejects completion until an after-collection photo is uploaded.
2. **Vehicle & Driver Conflict Prevention (AC-12)**
   - Two routes cannot be published or in-progress for the same vehicle or driver on the same date and shift.
3. **Driver Route Isolation (AC-05)**
   - Driver A cannot start or mutate stops on Driver B's assigned route.
4. **Anonymous Tracking Security (AC-16)**
   - Public tracking requires the 32-character secret token, matched via SHA-256 hash. Private phone numbers and driver notes are never returned in public payloads.
5. **Real AI Diagnostics (AC-08, AC-09)**
   - Models are versioned (`EcoVision-WasteNet v1.4.2-hybrid-cv`). Evaluates sharpness, blur, over/under exposure, category probabilities (`ORGANIC`, `PLASTIC`, `PAPER`, `METAL`, `GLASS`), and edge fill ratio.
