# Setup & Execution Guide

## Prerequisites
- Node.js (v18+ or v24 recommended) & npm
- Python (v3.11+ or v3.14 via `uv`)
- Git

## 1. Quickstart (Under 2 Minutes)

### Backend Setup
1. Open a terminal in `backend/`:
   ```bash
   cd backend
   ```
2. Activate or create virtual environment:
   ```bash
   # Using uv:
   uv venv .venv
   uv pip install -r requirements.txt --python .venv/Scripts/python.exe
   ```
3. Run the Flask backend API:
   ```bash
   .venv/Scripts/python wsgi.py
   ```
   Backend starts on `http://localhost:5000`.

### Frontend Setup
1. Open another terminal in `frontend/`:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
2. Open `http://localhost:5173` in your browser.

## 2. Seed & Demo Credentials
The system comes preloaded with operational demo records clearly tagged as demo data:

| Role | Email | Password | Details |
|------|-------|----------|---------|
| **Admin Officer** | `admin@smartwaste.gov` | `admin123` | Full dispatch, fleet, routes & review controls |
| **Field Driver** | `driver.rajesh@smartwaste.gov` | `driver123` | Assigned to Compactor Truck `MH-43-AZ-1001` |
| **Field Driver** | `driver.sunil@smartwaste.gov` | `driver123` | Assigned to Tipper Truck `MH-43-AZ-1002` |
| **Citizen Reporter** | `citizen.anita@example.com` | `citizen123` | Resident reporter profile |
| **Public Visitor** | *No login needed* | *N/A* | Anonymous reporting + secret tracking token |

## 3. Running Automated Tests
Run the pytest test suite verifying all acceptance criteria (AC-01 through AC-16):
```bash
cd backend
.venv/Scripts/python -m pytest -v
```
All 7 tests verify role authentication, driver isolation, routine vs complaint proof enforcement, real AI inference, vehicle conflict prevention, and public token tracking.

## 4. Connecting to Remote Supabase & Cloudinary (Optional)
Copy `.env.example` to `.env` and fill in:
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`

When remote credentials are not provided, the system seamlessly operates on its local ACID-compliant store and local image storage fallback without breaking any workflow.
