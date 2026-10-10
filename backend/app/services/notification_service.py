import uuid
from datetime import datetime, timezone
from app.repositories.data_store import DataStore

class NotificationService:
    @staticmethod
    def send_notification(user_id, title, message, notif_type="SYSTEM", report_id=None, route_id=None):
        store = DataStore.get_instance()
        notif = {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "title": title,
            "message": message,
            "type": notif_type,
            "report_id": report_id,
            "route_id": route_id,
            "read_at": None,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        return store.insert("notifications", notif)
