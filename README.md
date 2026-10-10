# EcoRoute • AI-Enabled Smart Waste Segregation & Route Optimization System

> An enterprise municipal operations platform connecting public waste reporting, scheduled multi-area morning collection, real computer vision analysis, driver dispatch, Leaflet road routing, and collection verification. Built strictly according to the Project Specification SRS.

---

## 🌟 Key Capabilities
- **Role-Based Portals**:
  - **Admin Operations**: Multi-stop route planning, road distance matrix optimization, vehicle fleet status, dustbin QR code generator, and side-by-side proof verification.
  - **Driver Field Portal**: Mobile-first, high-contrast task run sheet, start/complete stop controls, exception reporting, and photo upload enforcement.
  - **Citizen Reporter Portal**: Secure login to view personal waste report timeline history.
  - **Public Anonymous Reporting & Tracking**: No login required. Interactive GPS/map pin selection, photo upload with live AI analysis, cryptographically unguessable tracking tokens, and missed-collection complaints.
- **Real AI Inference**: Computer vision model (`EcoVision-WasteNet v1.4.2`) for waste categorization (`ORGANIC`, `PLASTIC`, `PAPER`, `METAL`, `GLASS`), fill level estimation, image quality flags, and before/after evidence comparison.
- **Strict Operational Business Rules**:
  - Routine morning stops complete without requiring photos.
  - Complaint stops strictly enforce completion proof upload.
  - Vehicle and driver assignment conflict prevention for overlapping active shifts.
  - Public tracking security isolating citizen data from guessing attacks.

---

## 🏗️ Tech Stack
- **Frontend**: React 19, Vite, TypeScript, Leaflet, OpenStreetMap, Lucide React, and a dedicated Municipal Design System (Vanilla CSS).
- **Backend**: Python 3.14 / Flask REST API (`/api/v1`), PyJWT, Pillow (Computer Vision), QRCode, Pytest.
- **Database**: Supabase PostgreSQL (18 operational tables with migrations and RLS policies in `supabase/migrations/001_initial_schema.sql`), with local ACID store fallback for out-of-the-box local runs.

---

## 🚀 Quick Start Instructions

### 1. Start the Flask Backend API
```bash
cd backend
.venv\Scripts\python.exe wsgi.py
```
*API runs on `http://localhost:5000`*

### 2. Start the React Frontend Application
```bash
cd frontend
npm run dev
```
*Web application runs on `http://localhost:5173`*

---

## 🧪 Running Acceptance Tests
Run the comprehensive test suite verifying acceptance criteria (AC-01 through AC-16):
```bash
cd backend
.venv\Scripts\python.exe -m pytest -v
```
All tests verify role-based authentication, driver isolation, routine vs complaint proof enforcement, real AI inference, vehicle conflict prevention, and public token tracking.

---

## 🔑 Demo Accounts

| Role | Email | Password |
|------|-------|----------|
| **Admin Officer** | `admin@smartwaste.gov` | `admin123` |
| **Driver Rajesh** | `driver.rajesh@smartwaste.gov` | `driver123` |
| **Driver Sunil** | `driver.sunil@smartwaste.gov` | `driver123` |
| **Citizen Anita** | `citizen.anita@example.com` | `citizen123` |
| **Anonymous Public** | *No login needed* | *N/A* |

---

## 📁 Repository Structure
```
├── backend/
│   ├── app/
│   │   ├── api/v1/         # Auth, Admin, Routes, Driver, Reports, Proofs, AI
│   │   ├── policies/       # State machine, photo proof & conflict policies
│   │   ├── repositories/   # Persistent data store & seed records
│   │   ├── services/       # AI, OSRM routing, 2-opt optimization, QR, Cloudinary
│   │   ├── config.py
│   │   └── __init__.py
│   ├── tests/              # Acceptance test suite (pytest)
│   ├── requirements.txt
│   └── wsgi.py
├── frontend/
│   ├── src/
│   │   ├── components/     # Leaflet MapComponent, UI primitives
│   │   ├── features/       # Admin, Driver, Reporter, Public reporting & tracking
│   │   ├── services/       # Typed API client
│   │   ├── App.tsx
│   │   └── index.css       # Municipal design system tokens
│   ├── package.json
│   └── index.html
├── supabase/
│   ├── migrations/         # 001_initial_schema.sql (18 tables, constraints, RLS)
│   └── seed.sql            # Demo operational seed data
├── docs/                   # setup.md, architecture.md, api.md
├── .env.example
└── README.md
```
