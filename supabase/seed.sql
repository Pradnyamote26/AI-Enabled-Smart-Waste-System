-- Seed Data: seed.sql
-- NOTICE: ALL ENTRIES BELOW ARE EXPLICITLY LABELED DEMO / SEED DATA FOR TESTING AND INITIAL RUNS

-- 1. Profiles (Demo Admin, Drivers, and Reporter)
-- Admin: admin@smartwaste.gov / password123
-- Driver 1: driver.rajesh@smartwaste.gov
-- Driver 2: driver.sunil@smartwaste.gov
-- Reporter: citizen.anita@example.com

INSERT INTO profiles (id, full_name, email, phone, role, is_active) VALUES
('a0000000-0000-0000-0000-000000000001', 'Admin Officer Vikram Deshmukh', 'admin@smartwaste.gov', '+91 98200 11223', 'admin', true),
('d0000000-0000-0000-0000-000000000001', 'Rajesh K. Pawar (Driver)', 'driver.rajesh@smartwaste.gov', '+91 98200 44556', 'driver', true),
('d0000000-0000-0000-0000-000000000002', 'Sunil M. Shinde (Driver)', 'driver.sunil@smartwaste.gov', '+91 98200 77889', 'driver', true),
('c0000000-0000-0000-0000-000000000001', 'Anita Sharma (Resident)', 'citizen.anita@example.com', '+91 98200 99001', 'reporter', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Dumpyards
INSERT INTO dumpyards (id, name, address, latitude, longitude, capacity_tonnes, is_active) VALUES
('b0000000-0000-0000-0000-000000000001', 'Central Municipal Dumpyard & Material Recovery Facility', 'Sector 18, Industrial Area, Navi Mumbai', 19.033049, 73.029662, 5000.0, true)
ON CONFLICT (id) DO NOTHING;

-- 3. Service Areas
INSERT INTO service_areas (id, name, code, description, is_active) VALUES
('e0000000-0000-0000-0000-000000000001', 'Zone A - Vashi Commercial & Residential', 'ZONE-A', 'Includes Sectors 1-9, Vashi Station precinct', true),
('e0000000-0000-0000-0000-000000000002', 'Zone B - Koperkhairane Hub', 'ZONE-B', 'Covers Sectors 11-16, residential high-rises', true)
ON CONFLICT (id) DO NOTHING;

-- 4. Vehicles
INSERT INTO vehicles (id, vehicle_number, vehicle_type, capacity_kg, status, assigned_driver_id, maintenance_status, is_active) VALUES
('f0000000-0000-0000-0000-000000000001', 'MH-43-AZ-1001', 'COMPACTOR_TRUCK', 3500.0, 'AVAILABLE', 'd0000000-0000-0000-0000-000000000001', 'NORMAL', true),
('f0000000-0000-0000-0000-000000000002', 'MH-43-AZ-1002', 'TIPPER_TRUCK', 2500.0, 'AVAILABLE', 'd0000000-0000-0000-0000-000000000002', 'NORMAL', true),
('f0000000-0000-0000-0000-000000000003', 'MH-43-EV-0401', 'ELECTRIC_CART', 800.0, 'AVAILABLE', NULL, 'NORMAL', true)
ON CONFLICT (id) DO NOTHING;

-- 5. Buildings
INSERT INTO buildings (id, name, address, latitude, longitude, service_area_id, collection_frequency, collection_window, contact_person, contact_phone, collection_point_notes, is_active) VALUES
('10000000-0000-0000-0000-000000000001', 'Gulmohar Residential CHS', 'Plot 42, Sector 4, Vashi', 19.077065, 72.998992, 'e0000000-0000-0000-0000-000000000001', 'DAILY_MORNING', '06:30 - 07:15', 'Mr. Joshi (Manager)', '+91 98201 11222', 'Rear gate collection bay, 4 segregated bins', true),
('10000000-0000-0000-0000-000000000002', 'Vashi Market Plaza & Offices', 'Sector 9 Commercial Complex, Vashi', 19.075421, 72.996112, 'e0000000-0000-0000-0000-000000000001', 'DAILY_MORNING', '07:15 - 08:00', 'Security Desk', '+91 98201 33445', 'Main loading dock behind vegetable market', true),
('10000000-0000-0000-0000-000000000003', 'Neelkanth Heights Co-op Society', 'Sector 6, Vashi', 19.078912, 73.001420, 'e0000000-0000-0000-0000-000000000001', 'DAILY_MORNING', '08:00 - 08:45', 'Mrs. Kulkarni', '+91 98201 55667', 'Side lane next to transformer', true),
('10000000-0000-0000-0000-000000000004', 'Sunrise Tower Residency', 'Sector 14, Koperkhairane', 19.102310, 73.007821, 'e0000000-0000-0000-0000-000000000002', 'DAILY_MORNING', '09:00 - 09:45', 'Society Office', '+91 98201 77889', 'Basement ramp collection area', true)
ON CONFLICT (id) DO NOTHING;

-- 6. Dustbins
INSERT INTO dustbins (id, bin_code, bin_type, latitude, longitude, service_area_id, building_id, qr_public_token, qr_active, capacity_liters, fill_level_percentage, is_active) VALUES
('20000000-0000-0000-0000-000000000001', 'BIN-VSH-001', 'ORGANIC', 19.077200, 72.999100, 'e0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'qr-token-bin-001-organic', true, 240, 75, true),
('20000000-0000-0000-0000-000000000002', 'BIN-VSH-002', 'RECYCLABLE', 19.077220, 72.999120, 'e0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'qr-token-bin-002-recyclable', true, 240, 45, true),
('20000000-0000-0000-0000-000000000003', 'BIN-MKT-003', 'GENERAL_MIXED', 19.075500, 72.996300, 'e0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'qr-token-bin-003-market-gen', true, 1100, 85, true),
('20000000-0000-0000-0000-000000000004', 'BIN-COR-004', 'HAZARDOUS', 19.079100, 73.001600, 'e0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'qr-token-bin-004-hazardous', true, 120, 30, true)
ON CONFLICT (id) DO NOTHING;

-- 7. Recurring Collection Schedules (Morning Shifts)
INSERT INTO collection_schedules (id, title, stop_type, service_area_id, weekday, shift, start_window, end_window, service_duration_minutes, is_active) VALUES
('30000000-0000-0000-0000-000000000001', 'Vashi Residential Morning Run (Mon-Sat)', 'BUILDING', 'e0000000-0000-0000-0000-000000000001', 1, 'MORNING', '06:30:00', '10:30:00', 15, true),
('30000000-0000-0000-0000-000000000002', 'Market Plaza Daily Clearing', 'DUSTBIN', 'e0000000-0000-0000-0000-000000000001', 1, 'MORNING', '07:15:00', '08:00:00', 20, true)
ON CONFLICT (id) DO NOTHING;
