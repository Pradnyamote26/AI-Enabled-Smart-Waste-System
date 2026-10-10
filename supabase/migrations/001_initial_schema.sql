-- Migration: 001_initial_schema.sql
-- Description: AI-Enabled Smart Waste System Schema with RLS and Constraints

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. PROFILES (extends Supabase auth.users or standalone for application users)
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_user_id UUID UNIQUE,
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(255) UNIQUE,
    phone VARCHAR(30),
    role VARCHAR(30) NOT NULL CHECK (role IN ('admin', 'driver', 'reporter')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. DUMPYARDS
CREATE TABLE IF NOT EXISTS dumpyards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL,
    address TEXT NOT NULL,
    latitude NUMERIC(10, 7) NOT NULL CHECK (latitude BETWEEN -90 AND 90),
    longitude NUMERIC(10, 7) NOT NULL CHECK (longitude BETWEEN -180 AND 180),
    capacity_tonnes NUMERIC(10, 2) DEFAULT 1000.0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. SERVICE AREAS
CREATE TABLE IF NOT EXISTS service_areas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    code VARCHAR(20) NOT NULL UNIQUE,
    description TEXT,
    boundary_coordinates JSONB,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. BUILDINGS
CREATE TABLE IF NOT EXISTS buildings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL,
    address TEXT NOT NULL,
    latitude NUMERIC(10, 7) NOT NULL CHECK (latitude BETWEEN -90 AND 90),
    longitude NUMERIC(10, 7) NOT NULL CHECK (longitude BETWEEN -180 AND 180),
    service_area_id UUID REFERENCES service_areas(id) ON DELETE SET NULL,
    collection_frequency VARCHAR(50) DEFAULT 'DAILY_MORNING',
    collection_window VARCHAR(50) DEFAULT '07:00 - 09:00',
    contact_person VARCHAR(100),
    contact_phone VARCHAR(30),
    collection_point_notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. DUSTBINS
CREATE TABLE IF NOT EXISTS dustbins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bin_code VARCHAR(50) NOT NULL UNIQUE,
    bin_type VARCHAR(50) NOT NULL CHECK (bin_type IN ('ORGANIC', 'RECYCLABLE', 'HAZARDOUS', 'GENERAL_MIXED', 'E_WASTE')),
    latitude NUMERIC(10, 7) NOT NULL CHECK (latitude BETWEEN -90 AND 90),
    longitude NUMERIC(10, 7) NOT NULL CHECK (longitude BETWEEN -180 AND 180),
    service_area_id UUID REFERENCES service_areas(id) ON DELETE SET NULL,
    building_id UUID REFERENCES buildings(id) ON DELETE SET NULL,
    qr_public_token VARCHAR(64) NOT NULL UNIQUE,
    qr_active BOOLEAN NOT NULL DEFAULT true,
    capacity_liters INTEGER NOT NULL DEFAULT 240,
    fill_level_percentage INTEGER DEFAULT 0 CHECK (fill_level_percentage BETWEEN 0 AND 100),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. VEHICLES
CREATE TABLE IF NOT EXISTS vehicles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_number VARCHAR(50) NOT NULL UNIQUE,
    vehicle_type VARCHAR(50) NOT NULL CHECK (vehicle_type IN ('COMPACTOR_TRUCK', 'TIPPER_TRUCK', 'ELECTRIC_CART', 'MINI_VAN')),
    capacity_kg NUMERIC(10, 2) NOT NULL DEFAULT 2500.00,
    status VARCHAR(30) NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE', 'ASSIGNED', 'EN_ROUTE', 'COLLECTING', 'RETURNING', 'MAINTENANCE', 'INACTIVE')),
    assigned_driver_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    maintenance_status TEXT DEFAULT 'NORMAL',
    last_known_latitude NUMERIC(10, 7),
    last_known_longitude NUMERIC(10, 7),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. COLLECTION SCHEDULES (Recurring morning/evening schedules)
CREATE TABLE IF NOT EXISTS collection_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(150) NOT NULL,
    stop_type VARCHAR(50) NOT NULL CHECK (stop_type IN ('BUILDING', 'DUSTBIN', 'AREA_SWEEP')),
    service_area_id UUID REFERENCES service_areas(id) ON DELETE CASCADE,
    weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6), -- 0=Sunday, 1=Monday...
    shift VARCHAR(20) NOT NULL DEFAULT 'MORNING' CHECK (shift IN ('MORNING', 'AFTERNOON', 'NIGHT')),
    start_window TIME NOT NULL DEFAULT '06:30:00',
    end_window TIME NOT NULL DEFAULT '11:00:00',
    service_duration_minutes INTEGER NOT NULL DEFAULT 15,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. COLLECTION ROUTES
CREATE TABLE IF NOT EXISTS collection_routes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    route_name VARCHAR(150) NOT NULL,
    route_date DATE NOT NULL DEFAULT CURRENT_DATE,
    shift VARCHAR(20) NOT NULL DEFAULT 'MORNING' CHECK (shift IN ('MORNING', 'AFTERNOON', 'NIGHT')),
    vehicle_id UUID REFERENCES vehicles(id) ON DELETE RESTRICT,
    driver_id UUID REFERENCES profiles(id) ON DELETE RESTRICT,
    dumpyard_id UUID REFERENCES dumpyards(id) ON DELETE RESTRICT,
    status VARCHAR(30) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'OPTIMIZED', 'PUBLISHED', 'IN_PROGRESS', 'COMPLETED', 'PAUSED', 'CANCELLED')),
    version INTEGER NOT NULL DEFAULT 1,
    distance_meters NUMERIC(12, 2) NOT NULL DEFAULT 0.0,
    duration_seconds INTEGER NOT NULL DEFAULT 0,
    geometry JSONB, -- GeoJSON route path
    published_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. ROUTE STOPS
CREATE TABLE IF NOT EXISTS route_stops (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    route_id UUID NOT NULL REFERENCES collection_routes(id) ON DELETE CASCADE,
    sequence_number INTEGER NOT NULL,
    stop_type VARCHAR(30) NOT NULL CHECK (stop_type IN ('START_DEPOT', 'BUILDING', 'DUSTBIN', 'COMPLAINT_REPORT', 'END_DUMPYARD')),
    building_id UUID REFERENCES buildings(id) ON DELETE SET NULL,
    dustbin_id UUID REFERENCES dustbins(id) ON DELETE SET NULL,
    report_id UUID, -- References waste_reports(id) added below
    scheduled_window VARCHAR(50),
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'STARTED', 'COMPLETED', 'SKIPPED', 'ISSUE_REPORTED')),
    photo_required BOOLEAN NOT NULL DEFAULT false, -- Ordinary routine morning stops FALSE; complaints TRUE
    is_locked BOOLEAN NOT NULL DEFAULT false,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    exception_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_route_sequence UNIQUE (route_id, sequence_number)
);

-- 10. WASTE REPORTS (Public & Registered)
CREATE TABLE IF NOT EXISTS waste_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_number VARCHAR(30) NOT NULL UNIQUE,
    report_type VARCHAR(50) NOT NULL CHECK (report_type IN (
        'OVERFLOWING_BIN',
        'NO_BIN_GARBAGE',
        'MISSED_COLLECTION',
        'SCATTERED_WASTE',
        'ILLEGAL_DUMPING',
        'OTHER'
    )),
    dustbin_id UUID REFERENCES dustbins(id) ON DELETE SET NULL,
    building_id UUID REFERENCES buildings(id) ON DELETE SET NULL,
    reporter_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    anonymous_token_hash VARCHAR(128) NOT NULL, -- SHA-256 hash of secret tracking token
    tracking_token_display VARCHAR(32) NOT NULL, -- Short tracking identifier (safe prefix)
    reporter_contact_masked VARCHAR(50),
    latitude NUMERIC(10, 7) NOT NULL CHECK (latitude BETWEEN -90 AND 90),
    longitude NUMERIC(10, 7) NOT NULL CHECK (longitude BETWEEN -180 AND 180),
    address_text TEXT,
    description TEXT,
    status VARCHAR(35) NOT NULL DEFAULT 'SUBMITTED' CHECK (status IN (
        'SUBMITTED',
        'ANALYZING',
        'PENDING_REVIEW',
        'APPROVED',
        'REJECTED',
        'WAITING_FOR_VEHICLE',
        'ASSIGNED',
        'IN_COLLECTION',
        'AWAITING_PROOF_REVIEW',
        'COMPLETED',
        'RESOLVED'
    )),
    priority VARCHAR(20) NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'URGENT')),
    priority_suggested_by_ai VARCHAR(20),
    photo_required BOOLEAN NOT NULL DEFAULT true, -- On-demand complaint reports require proof
    due_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add foreign key constraint for route_stops.report_id
ALTER TABLE route_stops 
    ADD CONSTRAINT fk_route_stops_report 
    FOREIGN KEY (report_id) REFERENCES waste_reports(id) ON DELETE SET NULL;

-- 11. REPORT IMAGES
CREATE TABLE IF NOT EXISTS report_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID NOT NULL REFERENCES waste_reports(id) ON DELETE CASCADE,
    cloudinary_asset_id VARCHAR(150),
    secure_url TEXT NOT NULL,
    image_role VARCHAR(30) NOT NULL DEFAULT 'ORIGINAL_REPORT' CHECK (image_role IN ('ORIGINAL_REPORT', 'EVIDENCE_AFTER', 'INTERMEDIATE')),
    captured_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB,
    upload_status VARCHAR(20) NOT NULL DEFAULT 'COMPLETED' CHECK (upload_status IN ('UPLOADING', 'COMPLETED', 'FAILED', 'RETRYABLE')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 12. AI ANALYSES
CREATE TABLE IF NOT EXISTS ai_analyses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID NOT NULL REFERENCES waste_reports(id) ON DELETE CASCADE,
    image_id UUID REFERENCES report_images(id) ON DELETE SET NULL,
    analysis_type VARCHAR(50) NOT NULL CHECK (analysis_type IN ('WASTE_CLASSIFICATION', 'OVERFLOW_DETECTION', 'QUALITY_CHECK', 'EVIDENCE_COMPARISON')),
    model_name VARCHAR(100) NOT NULL,
    model_version VARCHAR(50) NOT NULL,
    result JSONB NOT NULL,
    confidence NUMERIC(5, 4) CHECK (confidence BETWEEN 0 AND 1),
    status VARCHAR(30) NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('COMPLETED', 'FAILED', 'NEEDS_HUMAN_REVIEW')),
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 13. DRIVER ASSIGNMENTS
CREATE TABLE IF NOT EXISTS driver_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    route_id UUID REFERENCES collection_routes(id) ON DELETE CASCADE,
    report_id UUID REFERENCES waste_reports(id) ON DELETE CASCADE,
    driver_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    vehicle_id UUID REFERENCES vehicles(id) ON DELETE RESTRICT,
    assigned_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'COMPLETED', 'REASSIGNED', 'CANCELLED')),
    notes TEXT
);

-- 14. COLLECTION PROOFS
CREATE TABLE IF NOT EXISTS collection_proofs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    route_stop_id UUID REFERENCES route_stops(id) ON DELETE CASCADE,
    report_id UUID REFERENCES waste_reports(id) ON DELETE CASCADE,
    driver_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    cloudinary_asset_id VARCHAR(150),
    captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    latitude NUMERIC(10, 7),
    longitude NUMERIC(10, 7),
    ai_comparison_result JSONB,
    review_status VARCHAR(30) NOT NULL DEFAULT 'SUBMITTED' CHECK (review_status IN (
        'NOT_REQUIRED',
        'REQUIRED',
        'SUBMITTED',
        'AI_CHECKED',
        'NEEDS_REVIEW',
        'APPROVED',
        'REJECTED'
    )),
    reviewed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    review_notes TEXT,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 15. MISSED COLLECTION COMPLAINTS
CREATE TABLE IF NOT EXISTS missed_collection_complaints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    complaint_number VARCHAR(30) NOT NULL UNIQUE,
    building_id UUID REFERENCES buildings(id) ON DELETE SET NULL,
    dustbin_id UUID REFERENCES dustbins(id) ON DELETE SET NULL,
    route_stop_id UUID REFERENCES route_stops(id) ON DELETE SET NULL,
    reporter_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    tracking_token_hash VARCHAR(128),
    complaint_text TEXT NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'UNDER_REVIEW', 'RECOVERY_SCHEDULED', 'RESOLVED', 'REJECTED')),
    resolution_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 16. NOTIFICATIONS
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    report_id UUID REFERENCES waste_reports(id) ON DELETE SET NULL,
    route_id UUID REFERENCES collection_routes(id) ON DELETE SET NULL,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(150) NOT NULL,
    message TEXT NOT NULL,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 17. AUDIT LOGS
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id VARCHAR(64) NOT NULL,
    safe_metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 18. ROUTE OPTIMIZATION RUNS
CREATE TABLE IF NOT EXISTS route_optimization_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    route_id UUID NOT NULL REFERENCES collection_routes(id) ON DELETE CASCADE,
    algorithm VARCHAR(50) NOT NULL DEFAULT 'ROAD_MATRIX_OR_TOOLS',
    input_summary JSONB NOT NULL,
    output_order JSONB NOT NULL,
    metrics JSONB NOT NULL,
    warnings JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- INDEXES FOR PERFORMANCE AND INTEGRITY
CREATE INDEX IF NOT EXISTS idx_waste_reports_status ON waste_reports(status);
CREATE INDEX IF NOT EXISTS idx_waste_reports_token_hash ON waste_reports(anonymous_token_hash);
CREATE INDEX IF NOT EXISTS idx_waste_reports_reporter ON waste_reports(reporter_id);
CREATE INDEX IF NOT EXISTS idx_collection_routes_date_status ON collection_routes(route_date, status);
CREATE INDEX IF NOT EXISTS idx_collection_routes_driver ON collection_routes(driver_id);
CREATE INDEX IF NOT EXISTS idx_collection_routes_vehicle ON collection_routes(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_route_stops_route_seq ON route_stops(route_id, sequence_number);
CREATE INDEX IF NOT EXISTS idx_dustbins_qr_token ON dustbins(qr_public_token);
CREATE INDEX IF NOT EXISTS idx_dustbins_service_area ON dustbins(service_area_id);
CREATE INDEX IF NOT EXISTS idx_buildings_service_area ON buildings(service_area_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);

-- CONFLICT PREVENTION CONSTRAINT:
-- Ensure a vehicle cannot be assigned to more than one active route on the same date and shift
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_vehicle_active_shift 
ON collection_routes(vehicle_id, route_date, shift) 
WHERE status IN ('PUBLISHED', 'IN_PROGRESS');

-- Ensure a driver cannot be assigned to more than one active route on the same date and shift
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_driver_active_shift 
ON collection_routes(driver_id, route_date, shift) 
WHERE status IN ('PUBLISHED', 'IN_PROGRESS');

-- ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE waste_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE route_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_proofs ENABLE ROW LEVEL SECURITY;
ALTER TABLE missed_collection_complaints ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Note: In Supabase, auth.uid() corresponds to auth.users.id.
-- Public anonymous select on waste_reports is blocked; tracking is mediated via backend token verification.
