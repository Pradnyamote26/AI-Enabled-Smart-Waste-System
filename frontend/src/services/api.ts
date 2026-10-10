function resolveApiBaseUrl(): string {
  const envUrl = (import.meta.env.VITE_API_BASE_URL as string)?.trim();
  if (!envUrl) {
    return 'http://localhost:5050/api/v1';
  }
  const cleanUrl = envUrl.replace(/\/+$/, '');
  return cleanUrl.endsWith('/api/v1') ? cleanUrl : `${cleanUrl}/api/v1`;
}

const API_BASE = resolveApiBaseUrl();

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(message: string, code: string = 'ERROR', status: number = 500) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function getStoredToken(): string | null {
  return localStorage.getItem('smartwaste_token');
}

export function setStoredToken(token: string | null) {
  if (token) {
    localStorage.setItem('smartwaste_token', token);
  } else {
    localStorage.removeItem('smartwaste_token');
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {})
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new ApiError(data.message || data.error || 'Server error', data.error || 'ERROR', response.status);
  }

  return data as T;
}

export const api = {
  // Auth
  login: (credentials: { email: string; password: string }) =>
    request<{ token: string; user: any }>('/auth/login', { method: 'POST', body: JSON.stringify(credentials) }),
  
  register: (payload: { full_name: string; email: string; phone?: string; password: string }) =>
    request<{ token: string; user: any }>('/auth/register', { method: 'POST', body: JSON.stringify(payload) }),
  
  getMe: () => request<any>('/auth/me'),

  // Admin Analytics & Fleet
  getAnalyticsOverview: () => request<any>('/admin/analytics/overview'),
  
  // Drivers CRUD
  getDrivers: () => request<any[]>('/admin/drivers'),
  getDriver: (id: string) => request<any>(`/admin/drivers/${id}`),
  createDriver: (payload: any) => request<any>('/admin/drivers', { method: 'POST', body: JSON.stringify(payload) }),
  updateDriver: (id: string, updates: any) => request<any>(`/admin/drivers/${id}`, { method: 'PATCH', body: JSON.stringify(updates) }),
  deleteDriver: (id: string) => request<any>(`/admin/drivers/${id}`, { method: 'DELETE' }),

  // Vehicles CRUD
  getVehicles: () => request<any[]>('/admin/vehicles'),
  getVehicle: (id: string) => request<any>(`/admin/vehicles/${id}`),
  createVehicle: (payload: any) => request<any>('/admin/vehicles', { method: 'POST', body: JSON.stringify(payload) }),
  updateVehicle: (id: string, updates: any) => request<any>(`/admin/vehicles/${id}`, { method: 'PATCH', body: JSON.stringify(updates) }),
  unassignVehicleDriver: (id: string) => request<any>(`/admin/vehicles/${id}/unassign`, { method: 'POST' }),
  deleteVehicle: (id: string) => request<any>(`/admin/vehicles/${id}`, { method: 'DELETE' }),

  // Buildings CRUD
  getBuildings: () => request<any[]>('/admin/buildings'),
  getBuilding: (id: string) => request<any>(`/admin/buildings/${id}`),
  createBuilding: (payload: any) => request<any>('/admin/buildings', { method: 'POST', body: JSON.stringify(payload) }),
  updateBuilding: (id: string, updates: any) => request<any>(`/admin/buildings/${id}`, { method: 'PATCH', body: JSON.stringify(updates) }),
  deleteBuilding: (id: string) => request<any>(`/admin/buildings/${id}`, { method: 'DELETE' }),

  // Dustbins & QR CRUD
  getDustbins: () => request<any[]>('/admin/dustbins'),
  getDustbin: (id: string) => request<any>(`/admin/dustbins/${id}`),
  createDustbin: (payload: any) => request<any>('/admin/dustbins', { method: 'POST', body: JSON.stringify(payload) }),
  updateDustbin: (id: string, updates: any) => request<any>(`/admin/dustbins/${id}`, { method: 'PATCH', body: JSON.stringify(updates) }),
  deleteDustbin: (id: string) => request<any>(`/admin/dustbins/${id}`, { method: 'DELETE' }),
  getDustbinQR: (id: string) => request<any>(`/admin/dustbins/${id}/qr`),
  regenerateDustbinQR: (id: string) => request<any>(`/admin/dustbins/${id}/qr/regenerate`, { method: 'POST' }),
  toggleDustbinQR: (id: string) => request<any>(`/admin/dustbins/${id}/qr/toggle`, { method: 'POST' }),
  getAllQRCodes: () => request<any[]>('/admin/qr-codes'),

  // Collection Schedules & Overdue
  getSchedules: () => request<any[]>('/admin/schedules'),
  createSchedule: (payload: any) => request<any>('/admin/schedules', { method: 'POST', body: JSON.stringify(payload) }),
  updateSchedule: (id: string, updates: any) => request<any>(`/admin/schedules/${id}`, { method: 'PATCH', body: JSON.stringify(updates) }),
  deleteSchedule: (id: string) => request<any>(`/admin/schedules/${id}`, { method: 'DELETE' }),
  getOverdueCollections: () => request<any[]>('/admin/schedules/overdue'),

  // Complaints Management
  getComplaints: () => request<any[]>('/admin/complaints'),
  resolveComplaint: (id: string, payload: { status: string; resolution_note: string }) =>
    request<any>(`/admin/complaints/${id}/resolve`, { method: 'PATCH', body: JSON.stringify(payload) }),

  // Dumpyards & Areas & Audit
  getDumpyards: () => request<any[]>('/admin/dumpyards'),
  createDumpyard: (payload: any) => request<any>('/admin/dumpyards', { method: 'POST', body: JSON.stringify(payload) }),
  getServiceAreas: () => request<any[]>('/admin/service-areas'),
  createServiceArea: (payload: any) => request<any>('/admin/service-areas', { method: 'POST', body: JSON.stringify(payload) }),
  getAuditLogs: () => request<any[]>('/admin/audit-logs'),

  // Route Planning & Optimization
  getRoutes: (params?: { date?: string; status?: string }) => {
    const q = new URLSearchParams(params as any).toString();
    return request<any[]>(`/admin/routes${q ? `?${q}` : ''}`);
  },
  createRoute: (payload: any) => request<any>('/admin/routes', { method: 'POST', body: JSON.stringify(payload) }),
  getRoute: (id: string) => request<any>(`/admin/routes/${id}`),
  addStop: (routeId: string, payload: any) => request<any>(`/admin/routes/${routeId}/stops`, { method: 'POST', body: JSON.stringify(payload) }),
  optimizeRoute: (routeId: string) => request<any>(`/admin/routes/${routeId}/optimize`, { method: 'POST' }),
  publishRoute: (routeId: string) => request<any>(`/admin/routes/${routeId}/publish`, { method: 'POST' }),
  reorderRouteStops: (routeId: string, stopIds: string[]) =>
    request<any>(`/admin/routes/${routeId}/stops/reorder`, { method: 'PATCH', body: JSON.stringify({ stop_ids: stopIds }) }),
  toggleStopLock: (routeId: string, stopId: string) =>
    request<any>(`/admin/routes/${routeId}/stops/${stopId}/lock`, { method: 'PATCH' }),
  removeStop: (routeId: string, stopId: string) =>
    request<any>(`/admin/routes/${routeId}/stops/${stopId}`, { method: 'DELETE' }),
  cancelRoute: (routeId: string, reason?: string) =>
    request<any>(`/admin/routes/${routeId}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) }),
  deleteRoute: (routeId: string) =>
    request<any>(`/admin/routes/${routeId}`, { method: 'DELETE' }),

  // Driver Operations & Comprehensive Portal
  getDriverTodayRoutes: () => request<any[]>('/driver/routes/today'),
  getDriverDashboard: () => request<any>('/driver/dashboard'),
  getDriverTasks: (params?: { status?: string; date?: string; type?: string; today_only?: boolean }) => {
    const q = new URLSearchParams(params as any).toString();
    return request<any[]>(`/driver/tasks${q ? `?${q}` : ''}`);
  },
  getDriverTaskDetail: (stopId: string) => request<any>(`/driver/tasks/${stopId}`),
  getDriverRoutes: (status?: string) => request<any[]>(`/driver/routes${status ? `?status=${status}` : ''}`),
  getDriverHistory: (params?: { status?: string; start_date?: string; end_date?: string }) => {
    const q = new URLSearchParams(params as any).toString();
    return request<any[]>(`/driver/history${q ? `?${q}` : ''}`);
  },
  getDriverPerformance: () => request<any>('/driver/performance'),
  getDriverProfile: () => request<any>('/driver/profile'),
  updateDriverProfile: (payload: { phone?: string; current_password?: string; new_password?: string }) =>
    request<any>('/driver/profile', { method: 'PATCH', body: JSON.stringify(payload) }),
  getDriverNotifications: () => request<any[]>('/driver/notifications'),
  markDriverNotificationRead: (id: string) => request<any>(`/driver/notifications/${id}/read`, { method: 'PATCH' }),
  markAllDriverNotificationsRead: () => request<any>('/driver/notifications/mark-all-read', { method: 'POST' }),
  getDriverIssues: () => request<any[]>('/driver/issues'),
  createDriverIssue: (payload: { category: string; title: string; description: string; priority?: string; photo?: string; vehicle_id?: string; route_id?: string; stop_id?: string }) =>
    request<any>('/driver/issues', { method: 'POST', body: JSON.stringify(payload) }),
  getDriverVehicle: () => request<any>('/driver/vehicle'),
  startRoute: (routeId: string) => request<any>(`/driver/routes/${routeId}/start`, { method: 'POST' }),
  completeRoute: (routeId: string) => request<any>(`/driver/routes/${routeId}/complete`, { method: 'POST' }),
  startStop: (stopId: string) => request<any>(`/driver/stops/${stopId}/start`, { method: 'POST' }),
  completeStop: (stopId: string) => request<any>(`/driver/stops/${stopId}/complete`, { method: 'POST' }),
  reportStopException: (stopId: string, payload: { type: 'SKIPPED' | 'ISSUE_REPORTED'; reason: string }) =>
    request<any>(`/driver/stops/${stopId}/exception`, { method: 'POST', body: JSON.stringify(payload) }),
  uploadProof: (stopId: string, payload: { image: string; latitude?: number; longitude?: number }) =>
    request<any>(`/driver/stops/${stopId}/proof`, { method: 'POST', body: JSON.stringify(payload) }),

  // Live Driver Tracking & Telemetry (Phase 2 & Phase 3)
  startDriverTracking: (payload?: { route_id?: string; latitude?: number; longitude?: number; accuracy?: number }) =>
    request<any>('/driver/tracking/start', { method: 'POST', body: JSON.stringify(payload || {}) }),
  sendDriverLocation: (payload: { route_id?: string; latitude: number; longitude: number; accuracy?: number; timestamp?: string; heading?: number; speed?: number }) =>
    request<any>('/driver/tracking/location', { method: 'POST', body: JSON.stringify(payload) }),
  stopDriverTracking: (payload?: { route_id?: string }) =>
    request<any>('/driver/tracking/stop', { method: 'POST', body: JSON.stringify(payload || {}) }),
  getDriverTrackingStatus: () =>
    request<{ is_tracking: boolean; is_stale?: boolean; session?: any }>('/driver/tracking/status'),
  getAdminLiveFleetTracking: () =>
    request<{ count: number; timestamp: string; sessions: any[] }>('/admin/tracking/live'),
  getAdminRouteTracking: (routeId: string) =>
    request<any>(`/admin/tracking/routes/${routeId}`),

  // Admin Driver Issues
  getAdminDriverIssues: (params?: { status?: string; category?: string }) => {
    const q = new URLSearchParams(params as any).toString();
    return request<any[]>(`/admin/driver-issues${q ? `?${q}` : ''}`);
  },
  respondAdminDriverIssue: (id: string, payload: { admin_response: string; status?: string }) =>
    request<any>(`/admin/driver-issues/${id}/respond`, { method: 'PATCH', body: JSON.stringify(payload) }),

  // Waste Reports, Public Services & Citizen Tracking
  submitPublicReport: (payload: any) => request<any>('/public/reports', { method: 'POST', body: JSON.stringify(payload) }),
  trackReport: (token: string) => request<any>(`/public/track/${token}`),
  fileMissedCollection: (token: string, text: string) =>
    request<any>(`/public/reports/${token}/missed-collection`, { method: 'POST', body: JSON.stringify({ complaint_text: text }) }),
  reopenReport: (token: string, payload: { reason: string; image?: string }) =>
    request<any>(`/public/reports/${token}/reopen`, { method: 'POST', body: JSON.stringify(payload) }),
  getPublicSchedules: (params?: { service_area_id?: string; building_id?: string; weekday?: number }) => {
    const q = new URLSearchParams(params as any).toString();
    return request<{ schedules: any[]; count: number; service_areas: any[]; buildings: any[] }>(`/public/schedules${q ? `?${q}` : ''}`);
  },
  getPublicAnnouncements: () =>
    request<{ announcements: any[]; count: number }>('/public/announcements'),
  getCitizenNotifications: () =>
    request<{ notifications: any[]; unread_count: number }>('/citizen/notifications'),
  markCitizenNotificationRead: (id: string) =>
    request<any>(`/citizen/notifications/${id}/read`, { method: 'PATCH' }),
  markAllCitizenNotificationsRead: () =>
    request<any>('/citizen/notifications/mark-all-read', { method: 'POST' }),
  getMyReports: () => request<any[]>('/reports/mine'),
  getAdminReports: (params?: { status?: string; type?: string; priority?: string; search?: string; page?: number; per_page?: number }) => {
    const q = new URLSearchParams(params as any).toString();
    return request<{ reports: any[]; total_count: number; page: number; per_page: number }>(`/admin/reports${q ? `?${q}` : ''}`);
  },
  getAdminReportDetails: (id: string) => request<any>(`/admin/reports/${id}`),
  updateReportStatus: (id: string, updates: any) => request<any>(`/admin/reports/${id}/status`, { method: 'PATCH', body: JSON.stringify(updates) }),
  transitionReportStatus: (id: string, payload: { status: string; reason?: string; priority?: string; admin_notes?: string }) =>
    request<any>(`/admin/reports/${id}/transition`, { method: 'PATCH', body: JSON.stringify(payload) }),
  assignReportCrew: (id: string, payload: { vehicle_id?: string; driver_id?: string; queue_if_unavailable?: boolean; priority?: string }) =>
    request<any>(`/admin/reports/${id}/assign`, { method: 'POST', body: JSON.stringify(payload) }),
  overrideReportAI: (id: string, payload: { category: string; priority?: string; notes?: string }) =>
    request<any>(`/admin/reports/${id}/ai-override`, { method: 'PATCH', body: JSON.stringify(payload) }),

  // Proof Review
  getProofs: (status?: string) => request<any[]>(`/admin/proofs${status ? `?status=${status}` : ''}`),
  reviewProof: (proofId: string, payload: { decision: 'APPROVED' | 'REJECTED'; notes?: string }) =>
    request<any>(`/admin/proofs/${proofId}/review`, { method: 'POST', body: JSON.stringify(payload) }),

  // AI Diagnostics & Insights
  getModelInfo: () => request<any>('/ai/model-info'),
  analyzeImage: (image: string, reportType?: string) =>
    request<any>('/ai/analyze-image', { method: 'POST', body: JSON.stringify({ image, report_type: reportType }) }),
  getAdminAIInsights: () => request<any>('/admin/ai/insights'),
  compareProofDirect: (original_image: string, after_image: string) =>
    request<any>('/ai/compare-proof', { method: 'POST', body: JSON.stringify({ original_image, after_image }) }),
  checkDuplicateReports: (candidate: any) =>
    request<any>('/ai/check-duplicates', { method: 'POST', body: JSON.stringify(candidate) }),

  // Geocoding & Address Resolution
  reverseGeocode: async (lat: number, lng: number): Promise<{ success: boolean; address: string; full_address?: string }> => {
    try {
      const res = await request<{ success: boolean; address: string; full_address?: string }>(`/public/reverse-geocode?lat=${lat}&lng=${lng}`);
      if (res && res.address) return res;
    } catch {
      // Direct client fallback to OpenStreetMap Nominatim if backend endpoint is unreachable
      try {
        const resp = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=jsonv2`);
        if (resp.ok) {
          const data = await resp.json();
          const addr = data.address || {};
          const road = addr.road || addr.pedestrian || addr.street || addr.residential;
          const suburb = addr.suburb || addr.neighbourhood;
          const city = addr.city || addr.town || addr.county;
          const landmark = addr.amenity || addr.building || addr.house_name;
          const parts = [landmark, road, suburb, city].filter(Boolean);
          const formatted = parts.length > 0 ? parts.join(', ') : (data.display_name || `Coordinate ${lat.toFixed(4)}, ${lng.toFixed(4)}`);
          return { success: true, address: formatted, full_address: data.display_name };
        }
      } catch {}
    }
    return { success: true, address: `Pin Location (${lat.toFixed(4)}, ${lng.toFixed(4)})` };
  }
};

