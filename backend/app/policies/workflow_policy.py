from datetime import datetime

class WorkflowPolicy:
    VALID_ROUTE_TRANSITIONS = {
        "DRAFT": ["OPTIMIZED", "PUBLISHED", "CANCELLED"],
        "OPTIMIZED": ["PUBLISHED", "DRAFT", "CANCELLED"],
        "PUBLISHED": ["IN_PROGRESS", "CANCELLED"],
        "IN_PROGRESS": ["PAUSED", "COMPLETED", "CANCELLED"],
        "PAUSED": ["IN_PROGRESS", "CANCELLED"],
        "COMPLETED": [],
        "CANCELLED": []
    }

    VALID_STOP_TRANSITIONS = {
        "PENDING": ["STARTED", "SKIPPED", "ISSUE_REPORTED"],
        "STARTED": ["COMPLETED", "SKIPPED", "ISSUE_REPORTED"],
        "COMPLETED": [],
        "SKIPPED": [],
        "ISSUE_REPORTED": []
    }

    @staticmethod
    def validate_route_transition(current_status, new_status):
        allowed = WorkflowPolicy.VALID_ROUTE_TRANSITIONS.get(current_status, [])
        if new_status not in allowed:
            return False, f"Illegal route state transition from '{current_status}' to '{new_status}'. Allowed: {allowed}"
        return True, ""

    @staticmethod
    def validate_stop_transition(current_status, new_status, stop_data, proof_record=None):
        allowed = WorkflowPolicy.VALID_STOP_TRANSITIONS.get(current_status, [])
        if new_status not in allowed:
            return False, f"Illegal stop transition from '{current_status}' to '{new_status}'. Allowed: {allowed}"
        
        # Rule: Cannot complete without starting first
        if current_status == "PENDING" and new_status == "COMPLETED":
            return False, "Cannot complete a stop directly from PENDING. Stop must be STARTED first."

        # Rule: If photo is required, cannot complete without valid proof
        if new_status == "COMPLETED" and stop_data.get("photo_required", False):
            if not proof_record or not proof_record.get("image_url"):
                return False, "This stop requires completion photo proof before it can be marked COMPLETED."

        # Rule: Skip or issue reporting requires reason
        if new_status in ["SKIPPED", "ISSUE_REPORTED"]:
            reason = stop_data.get("exception_reason")
            if not reason or not reason.strip():
                return False, f"An exception reason is mandatory when marking a stop as {new_status}."

        return True, ""

    @staticmethod
    def check_assignment_conflicts(store, vehicle_id, driver_id, route_date, shift, exclude_route_id=None):
        """Prevents vehicle or driver overlap for active shifts (AC-12)"""
        active_routes = store.list("collection_routes", lambda r: (
            r.get("status") in ["PUBLISHED", "IN_PROGRESS"] and
            str(r.get("route_date")) == str(route_date) and
            r.get("shift") == shift and
            (exclude_route_id is None or r.get("id") != exclude_route_id)
        ))

        for r in active_routes:
            if vehicle_id and r.get("vehicle_id") == vehicle_id:
                vehicle = store.get("vehicles", vehicle_id)
                veh_no = vehicle.get("vehicle_number", vehicle_id) if vehicle else vehicle_id
                return False, f"Conflict: Vehicle '{veh_no}' is already assigned to active route '{r.get('route_name')}' for {route_date} ({shift} shift)."
            if driver_id and r.get("driver_id") == driver_id:
                driver = store.get("profiles", driver_id)
                d_name = driver.get("full_name", driver_id) if driver else driver_id
                return False, f"Conflict: Driver '{d_name}' is already assigned to active route '{r.get('route_name')}' for {route_date} ({shift} shift)."

        return True, ""

    VALID_REPORT_TRANSITIONS = {
        "SUBMITTED": ["ANALYZING", "PENDING_REVIEW", "APPROVED", "REJECTED", "DUPLICATE", "CANCELLED"],
        "ANALYZING": ["PENDING_REVIEW", "APPROVED", "REJECTED", "DUPLICATE", "CANCELLED"],
        "PENDING_REVIEW": ["APPROVED", "REJECTED", "DUPLICATE", "WAITING_FOR_VEHICLE", "ASSIGNED", "CANCELLED"],
        "APPROVED": ["WAITING_FOR_VEHICLE", "ASSIGNED", "IN_COLLECTION", "CANCELLED", "REJECTED"],
        "WAITING_FOR_VEHICLE": ["ASSIGNED", "CANCELLED", "REJECTED"],
        "ASSIGNED": ["IN_COLLECTION", "WAITING_FOR_VEHICLE", "CANCELLED", "REJECTED"],
        "IN_COLLECTION": ["AWAITING_PROOF_REVIEW", "COMPLETED", "RESOLVED", "ASSIGNED"],
        "AWAITING_PROOF_REVIEW": ["COMPLETED", "RESOLVED", "IN_COLLECTION", "REJECTED"],
        "COMPLETED": ["RESOLVED", "REOPENED"],
        "RESOLVED": ["REOPENED"],
        "REOPENED": ["PENDING_REVIEW", "APPROVED", "WAITING_FOR_VEHICLE", "ASSIGNED"],
        "REJECTED": ["REOPENED"],
        "DUPLICATE": ["REOPENED"],
        "CANCELLED": ["REOPENED"]
    }

    @staticmethod
    def validate_report_transition(current_status, new_status, reason=None):
        """Validates report state transitions and enforces mandatory rationale."""
        allowed = WorkflowPolicy.VALID_REPORT_TRANSITIONS.get(current_status, [])
        if new_status not in allowed:
            return False, f"Illegal report transition from '{current_status}' to '{new_status}'. Allowed: {allowed}"

        # Mandatory reason rules
        if new_status in ["REJECTED", "DUPLICATE"]:
            if not reason or not str(reason).strip():
                return False, f"A mandatory reason must be provided when marking a report as {new_status}."

        if new_status == "REOPENED":
            if not reason or not str(reason).strip():
                return False, "A mandatory reason must be provided when reopening a resolved, rejected, or cancelled report."

        return True, ""

