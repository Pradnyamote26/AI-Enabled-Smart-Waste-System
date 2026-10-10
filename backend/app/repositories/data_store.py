import os
import json
import uuid
import hashlib
from datetime import datetime, timezone
import threading

class DataStore:
    _instance = None
    _lock = threading.Lock()

    def __init__(self, persistence_file=None):
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        data_dir = os.path.join(base_dir, "data")
        os.makedirs(data_dir, exist_ok=True)
        self.persistence_file = persistence_file or os.path.join(data_dir, "smart_waste_store.json")
        self.lock = threading.Lock()
        self.tables = {
            "profiles": {},
            "dumpyards": {},
            "service_areas": {},
            "buildings": {},
            "dustbins": {},
            "vehicles": {},
            "collection_schedules": {},
            "collection_routes": {},
            "route_stops": {},
            "waste_reports": {},
            "report_images": {},
            "ai_analyses": {},
            "driver_assignments": {},
            "collection_proofs": {},
            "missed_collection_complaints": {},
            "notifications": {},
            "audit_logs": {},
            "route_optimization_runs": {},
            "driver_issues": {},
            "vehicle_tracking_sessions": {},
            "location_breadcrumbs": {},
            "service_announcements": {},
            "report_followups": {}
        }
        self.load()

    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    def load(self):
        with self.lock:
            if os.path.exists(self.persistence_file):
                try:
                    with open(self.persistence_file, "r", encoding="utf-8") as f:
                        data = json.load(f)
                        for tbl in self.tables:
                            if tbl in data:
                                self.tables[tbl] = data[tbl]
                    if len(self.tables["profiles"]) > 0:
                        if not self.tables.get("service_announcements"):
                            self._seed_announcements()
                            self._save_unlocked()
                        return
                except Exception as e:
                    print(f"Error loading data store: {e}")
            self._seed_default_data()
            self._seed_announcements()
            self._save_unlocked()

    def save(self):
        with self.lock:
            self._save_unlocked()

    def _save_unlocked(self):
        try:
            with open(self.persistence_file, "w", encoding="utf-8") as f:
                json.dump(self.tables, f, indent=2, default=str)
        except Exception as e:
            print(f"Error persisting data store: {e}")

    def _seed_default_data(self):
        now = datetime.now(timezone.utc).isoformat()
        
        # 1. Profiles
        from app.services.security_service import SecurityService
        self.tables["profiles"] = {
            "a0000000-0000-0000-0000-000000000001": {
                "id": "a0000000-0000-0000-0000-000000000001",
                "full_name": "Admin Officer Vikram Deshmukh",
                "email": "admin@smartwaste.gov",
                "phone": "+91 98200 11223",
                "role": "admin",
                "is_active": True,
                "password_hash": SecurityService.hash_password("admin123"),
                "created_at": now
            },
            "d0000000-0000-0000-0000-000000000001": {
                "id": "d0000000-0000-0000-0000-000000000001",
                "full_name": "Rajesh K. Pawar (Driver)",
                "email": "driver.rajesh@smartwaste.gov",
                "phone": "+91 98200 44556",
                "role": "driver",
                "is_active": True,
                "password_hash": SecurityService.hash_password("driver123"),
                "created_at": now
            },
            "d0000000-0000-0000-0000-000000000002": {
                "id": "d0000000-0000-0000-0000-000000000002",
                "full_name": "Sunil M. Shinde (Driver)",
                "email": "driver.sunil@smartwaste.gov",
                "phone": "+91 98200 77889",
                "role": "driver",
                "is_active": True,
                "password_hash": SecurityService.hash_password("driver123"),
                "created_at": now
            },
            "c0000000-0000-0000-0000-000000000001": {
                "id": "c0000000-0000-0000-0000-000000000001",
                "full_name": "Anita Sharma (Resident)",
                "email": "citizen.anita@example.com",
                "phone": "+91 98200 99001",
                "role": "reporter",
                "is_active": True,
                "password_hash": SecurityService.hash_password("citizen123"),
                "created_at": now
            },
            "c0000000-0000-0000-0000-000000000002": {
                "id": "c0000000-0000-0000-0000-000000000002",
                "full_name": "Priya Sharma (Resident)",
                "email": "priya.sharma@example.com",
                "phone": "+91 98200 99002",
                "role": "reporter",
                "is_active": True,
                "password_hash": SecurityService.hash_password("reporter123"),
                "created_at": now
            }
        }

        # 2. Dumpyards
        self.tables["dumpyards"] = {
            "b0000000-0000-0000-0000-000000000001": {
                "id": "b0000000-0000-0000-0000-000000000001",
                "name": "Central Municipal MRF & Dumpyard",
                "address": "Sector 18, Industrial Area, Navi Mumbai",
                "latitude": 19.033049,
                "longitude": 73.029662,
                "capacity_tonnes": 5000.0,
                "is_active": True,
                "created_at": now
            }
        }

        # 3. Service Areas
        self.tables["service_areas"] = {
            "e0000000-0000-0000-0000-000000000001": {
                "id": "e0000000-0000-0000-0000-000000000001",
                "name": "Zone A - Vashi Commercial & Residential",
                "code": "ZONE-A",
                "description": "Sectors 1-9, Vashi Station precinct",
                "is_active": True,
                "created_at": now
            },
            "e0000000-0000-0000-0000-000000000002": {
                "id": "e0000000-0000-0000-0000-000000000002",
                "name": "Zone B - Koperkhairane Hub",
                "code": "ZONE-B",
                "description": "Sectors 11-16, residential high-rises",
                "is_active": True,
                "created_at": now
            }
        }

        # 4. Buildings
        self.tables["buildings"] = {
            "10000000-0000-0000-0000-000000000001": {
                "id": "10000000-0000-0000-0000-000000000001",
                "name": "Gulmohar Residential CHS",
                "address": "Plot 42, Sector 4, Vashi",
                "latitude": 19.077065,
                "longitude": 72.998992,
                "service_area_id": "e0000000-0000-0000-0000-000000000001",
                "collection_frequency": "DAILY_MORNING",
                "collection_window": "06:30 - 07:15",
                "contact_person": "Mr. Joshi (Manager)",
                "contact_phone": "+91 98201 11222",
                "collection_point_notes": "Rear gate collection bay, 4 segregated bins",
                "is_active": True,
                "created_at": now
            },
            "10000000-0000-0000-0000-000000000002": {
                "id": "10000000-0000-0000-0000-000000000002",
                "name": "Vashi Market Plaza & Offices",
                "address": "Sector 9 Commercial Complex, Vashi",
                "latitude": 19.075421,
                "longitude": 72.996112,
                "service_area_id": "e0000000-0000-0000-0000-000000000001",
                "collection_frequency": "DAILY_MORNING",
                "collection_window": "07:15 - 08:00",
                "contact_person": "Security Desk",
                "contact_phone": "+91 98201 33445",
                "collection_point_notes": "Main loading dock behind vegetable market",
                "is_active": True,
                "created_at": now
            },
            "10000000-0000-0000-0000-000000000003": {
                "id": "10000000-0000-0000-0000-000000000003",
                "name": "Neelkanth Heights Co-op Society",
                "address": "Sector 6, Vashi",
                "latitude": 19.078912,
                "longitude": 73.001420,
                "service_area_id": "e0000000-0000-0000-0000-000000000001",
                "collection_frequency": "DAILY_MORNING",
                "collection_window": "08:00 - 08:45",
                "contact_person": "Mrs. Kulkarni",
                "contact_phone": "+91 98201 55667",
                "collection_point_notes": "Side lane next to transformer",
                "is_active": True,
                "created_at": now
            },
            "10000000-0000-0000-0000-000000000004": {
                "id": "10000000-0000-0000-0000-000000000004",
                "name": "Sunrise Tower Residency",
                "address": "Sector 14, Koperkhairane",
                "latitude": 19.102310,
                "longitude": 73.007821,
                "service_area_id": "e0000000-0000-0000-0000-000000000002",
                "collection_frequency": "DAILY_MORNING",
                "collection_window": "09:00 - 09:45",
                "contact_person": "Society Office",
                "contact_phone": "+91 98201 77889",
                "collection_point_notes": "Basement ramp collection area",
                "is_active": True,
                "created_at": now
            }
        }

        # 5. Dustbins
        self.tables["dustbins"] = {
            "20000000-0000-0000-0000-000000000001": {
                "id": "20000000-0000-0000-0000-000000000001",
                "bin_code": "BIN-VSH-001",
                "bin_type": "ORGANIC",
                "latitude": 19.077200,
                "longitude": 72.999100,
                "service_area_id": "e0000000-0000-0000-0000-000000000001",
                "building_id": "10000000-0000-0000-0000-000000000001",
                "qr_public_token": "qr-token-bin-001-organic",
                "qr_active": True,
                "capacity_liters": 240,
                "fill_level_percentage": 75,
                "is_active": True,
                "created_at": now
            },
            "20000000-0000-0000-0000-000000000002": {
                "id": "20000000-0000-0000-0000-000000000002",
                "bin_code": "BIN-VSH-002",
                "bin_type": "RECYCLABLE",
                "latitude": 19.077220,
                "longitude": 72.999120,
                "service_area_id": "e0000000-0000-0000-0000-000000000001",
                "building_id": "10000000-0000-0000-0000-000000000001",
                "qr_public_token": "qr-token-bin-002-recyclable",
                "qr_active": True,
                "capacity_liters": 240,
                "fill_level_percentage": 45,
                "is_active": True,
                "created_at": now
            },
            "20000000-0000-0000-0000-000000000003": {
                "id": "20000000-0000-0000-0000-000000000003",
                "bin_code": "BIN-MKT-003",
                "bin_type": "GENERAL_MIXED",
                "latitude": 19.075500,
                "longitude": 72.996300,
                "service_area_id": "e0000000-0000-0000-0000-000000000001",
                "building_id": "10000000-0000-0000-0000-000000000002",
                "qr_public_token": "qr-token-bin-003-market-gen",
                "qr_active": True,
                "capacity_liters": 1100,
                "fill_level_percentage": 85,
                "is_active": True,
                "created_at": now
            },
            "20000000-0000-0000-0000-000000000004": {
                "id": "20000000-0000-0000-0000-000000000004",
                "bin_code": "BIN-COR-004",
                "bin_type": "HAZARDOUS",
                "latitude": 19.079100,
                "longitude": 73.001600,
                "service_area_id": "e0000000-0000-0000-0000-000000000001",
                "building_id": "10000000-0000-0000-0000-000000000003",
                "qr_public_token": "qr-token-bin-004-hazardous",
                "qr_active": True,
                "capacity_liters": 120,
                "fill_level_percentage": 30,
                "is_active": True,
                "created_at": now
            }
        }

        # 6. Vehicles
        self.tables["vehicles"] = {
            "f0000000-0000-0000-0000-000000000001": {
                "id": "f0000000-0000-0000-0000-000000000001",
                "vehicle_number": "MH-43-AZ-1001",
                "vehicle_type": "COMPACTOR_TRUCK",
                "capacity_kg": 3500.0,
                "status": "AVAILABLE",
                "assigned_driver_id": "d0000000-0000-0000-0000-000000000001",
                "maintenance_status": "NORMAL",
                "last_known_latitude": 19.0770,
                "last_known_longitude": 72.9989,
                "is_active": True,
                "created_at": now
            },
            "f0000000-0000-0000-0000-000000000002": {
                "id": "f0000000-0000-0000-0000-000000000002",
                "vehicle_number": "MH-43-AZ-1002",
                "vehicle_type": "TIPPER_TRUCK",
                "capacity_kg": 2500.0,
                "status": "AVAILABLE",
                "assigned_driver_id": "d0000000-0000-0000-0000-000000000002",
                "maintenance_status": "NORMAL",
                "last_known_latitude": 19.0754,
                "last_known_longitude": 72.9961,
                "is_active": True,
                "created_at": now
            },
            "f0000000-0000-0000-0000-000000000003": {
                "id": "f0000000-0000-0000-0000-000000000003",
                "vehicle_number": "MH-43-EV-0401",
                "vehicle_type": "ELECTRIC_CART",
                "capacity_kg": 800.0,
                "status": "AVAILABLE",
                "assigned_driver_id": None,
                "maintenance_status": "NORMAL",
                "last_known_latitude": 19.0789,
                "last_known_longitude": 73.0014,
                "is_active": True,
                "created_at": now
            }
        }

        # 7. Collection Schedules
        self.tables["collection_schedules"] = {
            "30000000-0000-0000-0000-000000000001": {
                "id": "30000000-0000-0000-0000-000000000001",
                "title": "Vashi Residential Morning Run",
                "stop_type": "BUILDING",
                "service_area_id": "e0000000-0000-0000-0000-000000000001",
                "weekday": 1,
                "shift": "MORNING",
                "start_window": "06:30:00",
                "end_window": "10:30:00",
                "service_duration_minutes": 15,
                "is_active": True,
                "created_at": now
            }
        }

        # 8. Sample Waste Report for testing
        report_token = "demo-track-secret-token-12345"
        token_hash = hashlib.sha256(report_token.encode()).hexdigest()
        self.tables["waste_reports"] = {
            "rep-0000-0001": {
                "id": "rep-0000-0001",
                "report_number": "REP-2026-0001",
                "report_type": "OVERFLOWING_BIN",
                "dustbin_id": "20000000-0000-0000-0000-000000000003",
                "building_id": "10000000-0000-0000-0000-000000000002",
                "reporter_id": "c0000000-0000-0000-0000-000000000001",
                "anonymous_token_hash": token_hash,
                "tracking_token_display": "REP-DEMO-001",
                "reporter_contact_masked": "an***@example.com",
                "latitude": 19.0755,
                "longitude": 72.9963,
                "address_text": "Sector 9 Commercial Complex, near vegetable loading stall",
                "description": "Vegetable waste overflowing onto sidewalk, foul smell spreading.",
                "status": "APPROVED",
                "priority": "HIGH",
                "priority_suggested_by_ai": "HIGH",
                "photo_required": True,
                "created_at": now
            }
        }

    def _seed_announcements(self):
        now = datetime.now(timezone.utc).isoformat()
        self.tables["service_announcements"] = {
            "anc-001": {
                "id": "anc-001",
                "title": "Monsoon Waste Segregation & Gutter Clearing Protocol",
                "category": "WEATHER_ADVISORY",
                "urgency": "HIGH",
                "content": "Due to heavy rainfall alerts across Vashi and Koperkhairane, residents are advised to keep dry recyclable waste enclosed in waterproof bags. Morning clearance runs will commence 30 minutes earlier.",
                "affected_areas": "All Sectors (Zone A & Zone B)",
                "published_at": now,
                "is_active": True
            },
            "anc-002": {
                "id": "anc-002",
                "title": "Monthly Electronic & Hazardous Waste Drive this Saturday",
                "category": "COMMUNITY_EVENT",
                "urgency": "NORMAL",
                "content": "Central Municipal MRF Facility at Sector 18 will host a dedicated collection drive for batteries, discarded electronics, and CFL lamps this Saturday from 09:00 AM to 04:00 PM.",
                "affected_areas": "Central Municipal MRF Precinct",
                "published_at": now,
                "is_active": True
            },
            "anc-003": {
                "id": "anc-003",
                "title": "Electric Tipper Van Fleet Expanded for Narrow Alleyways",
                "category": "OPERATIONAL_UPDATE",
                "urgency": "INFO",
                "content": "Four new zero-emission Electric Waste Carts have been deployed to Sector 4 and Sector 9 for daily morning wet waste pickup in pedestrianized corridors.",
                "affected_areas": "Zone A Residential Precincts",
                "published_at": now,
                "is_active": True
            }
        }

    # Generic Table CRUD
    def get(self, table_name, record_id):
        with self.lock:
            record = self.tables.get(table_name, {}).get(record_id)
            return dict(record) if record else None

    def list(self, table_name, filter_fn=None):
        with self.lock:
            records = [dict(v) for v in self.tables.get(table_name, {}).values()]
        if filter_fn:
            records = [r for r in records if filter_fn(r)]
        return records

    def insert(self, table_name, record):
        with self.lock:
            if "id" not in record or not record["id"]:
                record["id"] = str(uuid.uuid4())
            if "created_at" not in record:
                record["created_at"] = datetime.now(timezone.utc).isoformat()
            self.tables[table_name][record["id"]] = dict(record)
            self._save_unlocked()
            return dict(record)

    def update(self, table_name, record_id, updates):
        with self.lock:
            if record_id not in self.tables[table_name]:
                return None
            record = self.tables[table_name][record_id]
            for k, v in updates.items():
                record[k] = v
            record["updated_at"] = datetime.now(timezone.utc).isoformat()
            self._save_unlocked()
            return dict(record)

    def delete(self, table_name, record_id):
        with self.lock:
            if record_id in self.tables[table_name]:
                deleted = self.tables[table_name].pop(record_id)
                self._save_unlocked()
                return dict(deleted)
            return None
