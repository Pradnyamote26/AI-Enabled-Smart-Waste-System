import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Truck,
  CheckCircle2,
  Play,
  AlertTriangle,
  Camera,
  MapPin,
  Check,
  Radio,
  History,
  User,
  Bell,
  MessageSquare,
  HelpCircle,
  Compass,
  TrendingUp,
  ExternalLink,
  RefreshCw,
  X,
  ChevronRight,
  Plus,
  Clock,
  Shield,
  FileCheck,
  Key,
  AlertCircle,
  Menu,
  CheckCheck
} from 'lucide-react';
import { api } from '../../services/api';
import { MapComponent } from '../../components/MapComponent';
import type { MapMarkerItem } from '../../components/MapComponent';

interface DriverPortalProps {
  currentUser: any;
}

type DriverSection =
  | 'dashboard'
  | 'tasks'
  | 'routes'
  | 'history'
  | 'performance'
  | 'profile'
  | 'notifications'
  | 'issues'
  | 'vehicle'
  | 'help';

export const DriverPortal: React.FC<DriverPortalProps> = ({ currentUser }) => {
  // Navigation State
  const [activeSection, setActiveSection] = useState<DriverSection>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Core Data States
  const [dashboardData, setDashboardData] = useState<any | null>(null);
  const [routes, setRoutes] = useState<any[]>([]);
  const [activeRoute, setActiveRoute] = useState<any | null>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [historyRecords, setHistoryRecords] = useState<any[]>([]);
  const [performanceData, setPerformanceData] = useState<any | null>(null);
  const [profileData, setProfileData] = useState<any | null>(null);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [issues, setIssues] = useState<any[]>([]);
  const [vehicleData, setVehicleData] = useState<any | null>(null);

  // UI Feedback States
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Filters
  const [taskStatusFilter, setTaskStatusFilter] = useState('');
  const [taskTypeFilter, setTaskTypeFilter] = useState('');
  const [taskSearch, setTaskSearch] = useState('');
  const [historyStatusFilter, setHistoryStatusFilter] = useState('');

  // Modals & Action States
  const [selectedTaskDetail, setSelectedTaskDetail] = useState<any | null>(null);
  const [proofStop, setProofStop] = useState<any | null>(null);
  const [proofImageB64, setProofImageB64] = useState<string | null>(null);
  const [proofLocation, setProofLocation] = useState<{ lat?: number; lng?: number }>({});
  const [isUploadingProof, setIsUploadingProof] = useState(false);

  const [exceptionStop, setExceptionStop] = useState<any | null>(null);
  const [exceptionType, setExceptionType] = useState<'SKIPPED' | 'ISSUE_REPORTED'>('SKIPPED');
  const [exceptionReason, setExceptionReason] = useState('');
  const [isSubmittingException, setIsSubmittingException] = useState(false);

  const [newIssueModalOpen, setNewIssueModalOpen] = useState(false);
  const [issueForm, setIssueForm] = useState({
    category: 'VEHICLE_FAULT',
    title: '',
    description: '',
    priority: 'MEDIUM',
    photo: ''
  });
  const [isSubmittingIssue, setIsSubmittingIssue] = useState(false);

  // Profile Edit Modal
  const [profileEditModalOpen, setProfileEditModalOpen] = useState(false);
  const [phoneInput, setPhoneInput] = useState('');
  const [currentPwInput, setCurrentPwInput] = useState('');
  const [newPwInput, setNewPwInput] = useState('');
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);

  // Live GPS Telemetry Sharing State (Phase 2)
  const [isGpsSharing, setIsGpsSharing] = useState(false);
  const [gpsStatus, setGpsStatus] = useState<'IDLE' | 'SHARING' | 'WEAK_SIGNAL' | 'PERMISSION_DENIED' | 'UNAVAILABLE'>('IDLE');
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [currentGpsCoords, setCurrentGpsCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [lastGpsPingTime, setLastGpsPingTime] = useState<Date | null>(null);
  const [liveNextStopEta, setLiveNextStopEta] = useState<{ eta_time?: string; eta_minutes?: number; distance_km?: number } | null>(null);
  const [gpsConsentModalOpen, setGpsConsentModalOpen] = useState(false);
  const watchIdRef = useRef<number | null>(null);
  const lastSentCoordsRef = useRef<{ lat: number; lng: number; time: number } | null>(null);

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 4000);
  };

  // --------------------------------------------------------------------------
  // Data Loaders
  // --------------------------------------------------------------------------
  const loadDashboard = async () => {
    try {
      const data = await api.getDriverDashboard();
      setDashboardData(data);
    } catch (err: any) {
      console.error('Error loading dashboard:', err);
    }
  };

  const loadTodayRoutes = async () => {
    try {
      const data = await api.getDriverTodayRoutes();
      setRoutes(data);
      if (data.length > 0) {
        const active = data.find(r => r.status === 'IN_PROGRESS') || data[0];
        loadRouteDetails(active.id);
      } else {
        setActiveRoute(null);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to load driver routes.');
    }
  };

  const loadRouteDetails = async (routeId: string) => {
    try {
      const fullRoute = await api.getRoute(routeId);
      setActiveRoute(fullRoute);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to load route stops.');
    }
  };

  const loadTasks = async () => {
    try {
      const data = await api.getDriverTasks({
        status: taskStatusFilter || undefined,
        type: taskTypeFilter || undefined
      });
      setTasks(data);
    } catch (err: any) {
      console.error('Error loading tasks:', err);
    }
  };

  const loadHistory = async () => {
    try {
      const data = await api.getDriverHistory({
        status: historyStatusFilter || undefined
      });
      setHistoryRecords(data);
    } catch (err: any) {
      console.error('Error loading history:', err);
    }
  };

  const loadPerformance = async () => {
    try {
      const data = await api.getDriverPerformance();
      setPerformanceData(data);
    } catch (err: any) {
      console.error('Error loading performance:', err);
    }
  };

  const loadProfile = async () => {
    try {
      const data = await api.getDriverProfile();
      setProfileData(data);
      setPhoneInput(data.phone || '');
    } catch (err: any) {
      console.error('Error loading profile:', err);
    }
  };

  const loadNotifications = async () => {
    try {
      const data = await api.getDriverNotifications();
      setNotifications(data);
    } catch (err: any) {
      console.error('Error loading notifications:', err);
    }
  };

  const loadIssues = async () => {
    try {
      const data = await api.getDriverIssues();
      setIssues(data);
    } catch (err: any) {
      console.error('Error loading issues:', err);
    }
  };

  const loadVehicle = async () => {
    try {
      const data = await api.getDriverVehicle();
      setVehicleData(data);
    } catch (err: any) {
      console.error('Error loading vehicle:', err);
    }
  };

  const refreshAllData = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      await Promise.all([
        loadDashboard(),
        loadTodayRoutes(),
        loadTasks(),
        loadHistory(),
        loadPerformance(),
        loadProfile(),
        loadNotifications(),
        loadIssues(),
        loadVehicle()
      ]);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error refreshing portal data.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshAllData();
  }, []);

  useEffect(() => {
    if (activeSection === 'tasks') {
      loadTasks();
    } else if (activeSection === 'history') {
      loadHistory();
    } else if (activeSection === 'notifications') {
      loadNotifications();
    } else if (activeSection === 'issues') {
      loadIssues();
    }
  }, [activeSection, taskStatusFilter, taskTypeFilter, historyStatusFilter]);

  // --------------------------------------------------------------------------
  // Live GPS Telemetry Operations (Phase 2)
  // --------------------------------------------------------------------------
  const startGpsTelemetry = (routeId: string) => {
    if (!navigator.geolocation) {
      setGpsStatus('UNAVAILABLE');
      setErrorMsg('Geolocation is not supported by your browser or device.');
      return;
    }

    setIsGpsSharing(true);
    setGpsStatus('SHARING');
    api.startDriverTracking({ route_id: routeId }).catch(() => {});

    try {
      const id = navigator.geolocation.watchPosition(
        (pos) => {
          const { latitude, longitude, accuracy, heading, speed } = pos.coords;
          setCurrentGpsCoords({ lat: latitude, lng: longitude });
          setGpsAccuracy(accuracy);
          if (accuracy > 30) {
            setGpsStatus('WEAK_SIGNAL');
          } else {
            setGpsStatus('SHARING');
          }

          // Throttle: send every 12 seconds
          const now = Date.now();
          if (!lastSentCoordsRef.current || now - lastSentCoordsRef.current.time > 12000) {
            lastSentCoordsRef.current = { lat: latitude, lng: longitude, time: now };
            api.sendDriverLocation({
              route_id: routeId,
              latitude,
              longitude,
              accuracy,
              heading: heading || undefined,
              speed: speed || undefined,
              timestamp: new Date(pos.timestamp).toISOString()
            }).then(res => {
              setLastGpsPingTime(new Date());
              if (res?.next_stop) {
                setLiveNextStopEta(res.next_stop);
              }
            }).catch(err => {
              console.warn('GPS telemetry ping warning:', err);
            });
          }
        },
        (err) => {
          if (err.code === 1) { // PERMISSION_DENIED
            setGpsStatus('PERMISSION_DENIED');
            setIsGpsSharing(false);
          } else {
            setGpsStatus('UNAVAILABLE');
          }
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 5000 }
      );
      watchIdRef.current = id;
    } catch (e) {
      setGpsStatus('UNAVAILABLE');
    }
  };

  const stopGpsTelemetry = (routeId?: string) => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setIsGpsSharing(false);
    setGpsStatus('IDLE');
    api.stopDriverTracking({ route_id: routeId }).catch(() => {});
  };

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  // --------------------------------------------------------------------------
  // Route Operations
  // --------------------------------------------------------------------------
  const handleStartRoute = () => {
    if (!activeRoute) return;
    setGpsConsentModalOpen(true);
  };

  const confirmStartRouteRun = async (enableGps: boolean) => {
    if (!activeRoute) return;
    setGpsConsentModalOpen(false);
    try {
      await api.startRoute(activeRoute.id);
      showSuccess(`Route '${activeRoute.route_name}' started. En route to Stop #1.`);
      if (enableGps) {
        startGpsTelemetry(activeRoute.id);
      }
      await loadRouteDetails(activeRoute.id);
      await loadDashboard();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to start route.');
    }
  };

  const handleCompleteRoute = async () => {
    if (!activeRoute) return;
    try {
      await api.completeRoute(activeRoute.id);
      stopGpsTelemetry(activeRoute.id);
      showSuccess('Route run marked COMPLETED. Great job!');
      await loadRouteDetails(activeRoute.id);
      await loadDashboard();
      await loadPerformance();
    } catch (err: any) {
      setErrorMsg(err.message || 'Cannot finish route yet.');
    }
  };

  const handleStartStop = async (stopId: string) => {
    try {
      await api.startStop(stopId);
      showSuccess('Stop marked STARTED. Performing collection.');
      if (activeRoute) await loadRouteDetails(activeRoute.id);
      await loadTasks();
      await loadDashboard();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to start stop.');
    }
  };

  const handleOpenCompleteStop = (stop: any) => {
    if (stop.photo_required) {
      setProofStop(stop);
      setProofImageB64(null);
      // Auto acquire GPS coords for proof capture
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          pos => setProofLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
          () => setProofLocation({})
        );
      }
    } else {
      executeDirectStopComplete(stop);
    }
  };

  const executeDirectStopComplete = async (stop: any) => {
    try {
      await api.completeStop(stop.id);
      showSuccess(`Stop #${stop.sequence_number} marked COMPLETED.`);
      if (activeRoute) await loadRouteDetails(activeRoute.id);
      await loadTasks();
      await loadDashboard();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to complete stop.');
    }
  };

  const handlePhotoUploadChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setProofImageB64(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmitProofAndComplete = async () => {
    if (!proofStop || !proofImageB64) return;
    setIsUploadingProof(true);
    try {
      const proofRes = await api.uploadProof(proofStop.id, {
        image: proofImageB64,
        latitude: proofLocation.lat,
        longitude: proofLocation.lng
      });

      // Now complete the stop on server
      await api.completeStop(proofStop.id);
      const confMsg = proofRes.ai_comparison?.confidence_score
        ? ` (AI Check: ${Math.round(proofRes.ai_comparison.confidence_score * 100)}% Match)`
        : '';
      showSuccess(`Proof submitted${confMsg}. Stop #${proofStop.sequence_number} marked COMPLETED.`);
      setProofStop(null);
      if (activeRoute) await loadRouteDetails(activeRoute.id);
      await loadTasks();
      await loadDashboard();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to submit completion proof.');
    } finally {
      setIsUploadingProof(false);
    }
  };

  const handleOpenExceptionModal = (stop: any) => {
    setExceptionStop(stop);
    setExceptionType('SKIPPED');
    setExceptionReason('');
  };

  const handleSubmitException = async () => {
    if (!exceptionStop) return;
    if (!exceptionReason.trim()) {
      setErrorMsg('Mandatory reason is required to skip or report an issue on a stop.');
      return;
    }
    setIsSubmittingException(true);
    try {
      await api.reportStopException(exceptionStop.id, {
        type: exceptionType,
        reason: exceptionReason.trim()
      });
      showSuccess(`Stop #${exceptionStop.sequence_number} logged as ${exceptionType}.`);
      setExceptionStop(null);
      if (activeRoute) await loadRouteDetails(activeRoute.id);
      await loadTasks();
      await loadDashboard();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to log exception.');
    } finally {
      setIsSubmittingException(false);
    }
  };

  // --------------------------------------------------------------------------
  // Notifications & Issues Operations
  // --------------------------------------------------------------------------
  const handleMarkNotificationRead = async (notifId: string) => {
    try {
      await api.markDriverNotificationRead(notifId);
      loadNotifications();
      loadDashboard();
    } catch (err: any) {
      console.error(err);
    }
  };

  const handleMarkAllNotificationsRead = async () => {
    try {
      await api.markAllDriverNotificationsRead();
      showSuccess('All notifications marked as read.');
      loadNotifications();
      loadDashboard();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to mark notifications read.');
    }
  };

  const handleSubmitIssueTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!issueForm.title.trim() || !issueForm.description.trim()) {
      setErrorMsg('Title and description are required.');
      return;
    }
    setIsSubmittingIssue(true);
    try {
      await api.createDriverIssue({
        category: issueForm.category,
        title: issueForm.title.trim(),
        description: issueForm.description.trim(),
        priority: issueForm.priority,
        photo: issueForm.photo || undefined,
        vehicle_id: dashboardData?.assigned_vehicle?.id,
        route_id: activeRoute?.id
      });
      showSuccess('Issue ticket submitted to municipal dispatch.');
      setNewIssueModalOpen(false);
      setIssueForm({ category: 'VEHICLE_FAULT', title: '', description: '', priority: 'MEDIUM', photo: '' });
      loadIssues();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to submit issue ticket.');
    } finally {
      setIsSubmittingIssue(false);
    }
  };

  // --------------------------------------------------------------------------
  // Profile Update Operations
  // --------------------------------------------------------------------------
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUpdatingProfile(true);
    try {
      const payload: any = { phone: phoneInput.trim() };
      if (newPwInput) {
        if (!currentPwInput) {
          setErrorMsg('Current password is required to change password.');
          setIsUpdatingProfile(false);
          return;
        }
        payload.current_password = currentPwInput;
        payload.new_password = newPwInput;
      }
      await api.updateDriverProfile(payload);
      showSuccess('Driver profile updated successfully.');
      setProfileEditModalOpen(false);
      setCurrentPwInput('');
      setNewPwInput('');
      loadProfile();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update profile.');
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  // Memoized Map Markers
  const mapMarkers = useMemo<MapMarkerItem[]>(() => {
    if (!activeRoute || !activeRoute.stops) return [];
    const markers: MapMarkerItem[] = activeRoute.stops.map((stop: any) => ({
      id: stop.id,
      lat: Number(stop.latitude) || 19.076,
      lng: Number(stop.longitude) || 72.997,
      title: `${stop.sequence_number}. ${stop.target_name || stop.stop_type}`,
      subtitle: stop.scheduled_window,
      type: (stop.status === 'COMPLETED' ? 'BIN' : stop.status === 'STARTED' ? 'STOP' : 'PIN') as any,
      badgeNumber: stop.sequence_number
    }));

    if (currentGpsCoords) {
      markers.push({
        id: 'driver-live-vehicle',
        lat: currentGpsCoords.lat,
        lng: currentGpsCoords.lng,
        title: `Your Vehicle (${dashboardData?.assigned_vehicle?.vehicle_number || 'En Route'})`,
        subtitle: `GPS Accuracy: ±${gpsAccuracy ? Math.round(gpsAccuracy) : 10}m`,
        type: 'VEHICLE'
      });
    }

    return markers;
  }, [activeRoute, currentGpsCoords, gpsAccuracy, dashboardData]);

  // Filtered tasks
  const filteredTasks = useMemo(() => {
    return tasks.filter(t => {
      const matchSearch =
        !taskSearch ||
        (t.target_name && t.target_name.toLowerCase().includes(taskSearch.toLowerCase())) ||
        (t.target_address && t.target_address.toLowerCase().includes(taskSearch.toLowerCase()));
      return matchSearch;
    });
  }, [tasks, taskSearch]);

  const switchSection = (section: DriverSection) => {
    setActiveSection(section);
    setMobileMenuOpen(false);
  };

  return (
    <div className="driver-portal-wrapper">
      {/* Toast Messages */}
      {errorMsg && (
        <div style={{ position: 'fixed', top: '1rem', right: '1rem', zIndex: 3000, background: '#fee2e2', border: '1px solid #ef4444', color: '#991b1b', padding: '0.85rem 1.25rem', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '0.5rem', boxShadow: 'var(--shadow-lg)' }}>
          <AlertCircle size={18} />
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', marginLeft: '0.5rem', color: '#991b1b' }}><X size={16} /></button>
        </div>
      )}
      {successMsg && (
        <div style={{ position: 'fixed', top: '1rem', right: '1rem', zIndex: 3000, background: '#dcfce7', border: '1px solid #22c55e', color: '#166534', padding: '0.85rem 1.25rem', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '0.5rem', boxShadow: 'var(--shadow-lg)' }}>
          <CheckCircle2 size={18} />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Mobile Drawer Backdrop */}
      {mobileMenuOpen && (
        <div
          className="admin-sidebar-backdrop"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Driver Navigation Sidebar */}
      <aside className={`driver-sidebar ${mobileMenuOpen ? 'mobile-open' : ''}`}>
        <div style={{ padding: '0 0.5rem 1.25rem 0.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)', marginBottom: '1rem', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.25rem' }}>
              <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: '#a7f3d0', fontWeight: 700, letterSpacing: '0.06em' }}>
                Field Operations
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.68rem', color: '#6ee7b7', fontWeight: 600 }}>
                <span className="live-pulse-dot" /> ACTIVE SHIFT
              </span>
            </div>
            <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#ffffff' }}>Driver Cockpit</div>
          </div>
          <button
            onClick={() => setMobileMenuOpen(false)}
            className="mobile-sidebar-close-btn"
            aria-label="Close sidebar"
          >
            <X size={18} />
          </button>
        </div>

        {/* Assigned Vehicle Mini Chip */}
        <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: '8px', padding: '0.65rem 0.85rem', marginBottom: '1.25rem', border: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ fontSize: '0.7rem', color: '#a7f3d0', fontWeight: 700, textTransform: 'uppercase' }}>Assigned Fleet Vehicle</div>
          <div style={{ fontWeight: 800, color: '#fff', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.15rem' }}>
            <Truck size={15} color="#52b788" />
            {dashboardData?.assigned_vehicle?.vehicle_number || 'Unassigned'}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#c9e8d8', marginTop: '0.1rem' }}>
            {dashboardData?.assigned_vehicle?.vehicle_type || 'Standard'} • {dashboardData?.assigned_vehicle?.status || 'OFFLINE'}
          </div>
        </div>

        {/* Navigation Items */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <button
            onClick={() => switchSection('dashboard')}
            className={`admin-nav-item ${activeSection === 'dashboard' ? 'active' : ''}`}
          >
            <TrendingUp size={18} />
            <span style={{ flex: 1 }}>Dashboard</span>
          </button>

          <button
            onClick={() => switchSection('tasks')}
            className={`admin-nav-item ${activeSection === 'tasks' ? 'active' : ''}`}
          >
            <CheckCheck size={18} />
            <span style={{ flex: 1 }}>My Tasks</span>
            {tasks.filter(t => t.status === 'PENDING').length > 0 && (
              <span style={{ background: 'rgba(255,255,255,0.18)', color: '#fff', fontSize: '0.7rem', fontWeight: 700, padding: '0.1rem 0.45rem', borderRadius: '10px' }}>
                {tasks.filter(t => t.status === 'PENDING').length}
              </span>
            )}
          </button>

          <button
            onClick={() => switchSection('routes')}
            className={`admin-nav-item ${activeSection === 'routes' ? 'active' : ''}`}
          >
            <Compass size={18} />
            <span style={{ flex: 1 }}>Active Route</span>
            {activeRoute?.status === 'IN_PROGRESS' && (
              <span style={{ background: '#10b981', color: '#fff', fontSize: '0.65rem', fontWeight: 800, padding: '0.1rem 0.4rem', borderRadius: '4px' }}>
                EN ROUTE
              </span>
            )}
          </button>

          <button
            onClick={() => switchSection('history')}
            className={`admin-nav-item ${activeSection === 'history' ? 'active' : ''}`}
          >
            <History size={18} />
            <span style={{ flex: 1 }}>Task History</span>
          </button>

          <button
            onClick={() => switchSection('performance')}
            className={`admin-nav-item ${activeSection === 'performance' ? 'active' : ''}`}
          >
            <FileCheck size={18} />
            <span style={{ flex: 1 }}>My Performance</span>
          </button>

          <button
            onClick={() => switchSection('profile')}
            className={`admin-nav-item ${activeSection === 'profile' ? 'active' : ''}`}
          >
            <User size={18} />
            <span style={{ flex: 1 }}>My Profile</span>
          </button>

          <button
            onClick={() => switchSection('notifications')}
            className={`admin-nav-item ${activeSection === 'notifications' ? 'active' : ''}`}
          >
            <Bell size={18} />
            <span style={{ flex: 1 }}>Notifications</span>
            {dashboardData?.unread_notifications_count > 0 && (
              <span style={{ background: '#ef4444', color: '#fff', fontSize: '0.7rem', fontWeight: 800, padding: '0.1rem 0.45rem', borderRadius: '10px' }}>
                {dashboardData.unread_notifications_count}
              </span>
            )}
          </button>

          <button
            onClick={() => switchSection('issues')}
            className={`admin-nav-item ${activeSection === 'issues' ? 'active' : ''}`}
          >
            <MessageSquare size={18} />
            <span style={{ flex: 1 }}>Support & Issues</span>
          </button>

          <button
            onClick={() => switchSection('vehicle')}
            className={`admin-nav-item ${activeSection === 'vehicle' ? 'active' : ''}`}
          >
            <Truck size={18} />
            <span style={{ flex: 1 }}>Vehicle & Shift</span>
          </button>

          <button
            onClick={() => switchSection('help')}
            className={`admin-nav-item ${activeSection === 'help' ? 'active' : ''}`}
          >
            <HelpCircle size={18} />
            <span style={{ flex: 1 }}>Help & Safety</span>
          </button>
        </nav>

        <div style={{ marginTop: 'auto', paddingTop: '1.5rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          <button onClick={refreshAllData} className="btn btn-sm btn-outline" style={{ width: '100%', color: '#fff', borderColor: 'rgba(255,255,255,0.3)', justifyContent: 'center' }}>
            <RefreshCw size={14} className={isLoading ? 'spin' : ''} /> Sync Live Data
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="driver-content-area">
        {/* Mobile Header Bar */}
        <div className="admin-mobile-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="btn btn-sm btn-outline mobile-modules-toggle-btn"
              aria-label="Toggle driver navigation drawer"
            >
              <Menu size={16} />
              <span>Menu</span>
            </button>
            <div className="admin-mobile-active-label">
              {activeSection === 'dashboard' && 'Dashboard Overview'}
              {activeSection === 'tasks' && `My Tasks (${tasks.length})`}
              {activeSection === 'routes' && 'Active Route'}
              {activeSection === 'history' && 'Collection History'}
              {activeSection === 'performance' && 'Performance Analytics'}
              {activeSection === 'profile' && 'Driver Profile'}
              {activeSection === 'notifications' && 'Notifications'}
              {activeSection === 'issues' && 'Support Tickets'}
              {activeSection === 'vehicle' && 'Vehicle Telemetry'}
              {activeSection === 'help' && 'Help & Safety Guide'}
            </div>
          </div>

          <button onClick={refreshAllData} className="btn btn-sm btn-secondary" style={{ padding: '0.45rem 0.75rem' }} title="Sync driver data">
            <RefreshCw size={14} className={isLoading ? 'spin' : ''} />
          </button>
        </div>

        {/* Quick Horizontal Scrollable Tab Ribbon on Mobile */}
        <div className="admin-mobile-pills-bar">
          <button onClick={() => switchSection('dashboard')} className={`mobile-pill ${activeSection === 'dashboard' ? 'active' : ''}`}>
            Dashboard
          </button>
          <button onClick={() => switchSection('tasks')} className={`mobile-pill ${activeSection === 'tasks' ? 'active' : ''}`}>
            Tasks ({tasks.length})
          </button>
          <button onClick={() => switchSection('routes')} className={`mobile-pill ${activeSection === 'routes' ? 'active' : ''}`}>
            Routes
          </button>
          <button onClick={() => switchSection('history')} className={`mobile-pill ${activeSection === 'history' ? 'active' : ''}`}>
            History
          </button>
          <button onClick={() => switchSection('performance')} className={`mobile-pill ${activeSection === 'performance' ? 'active' : ''}`}>
            Performance
          </button>
          <button onClick={() => switchSection('issues')} className={`mobile-pill ${activeSection === 'issues' ? 'active' : ''}`}>
            Issues
          </button>
          <button onClick={() => switchSection('vehicle')} className={`mobile-pill ${activeSection === 'vehicle' ? 'active' : ''}`}>
            Vehicle
          </button>
          <button onClick={() => switchSection('profile')} className={`mobile-pill ${activeSection === 'profile' ? 'active' : ''}`}>
            Profile
          </button>
          <button onClick={() => switchSection('help')} className={`mobile-pill ${activeSection === 'help' ? 'active' : ''}`}>
            Help
          </button>
        </div>

        {/* =================================================================== */}
        {/* 1. DASHBOARD OVERVIEW SECTION                                      */}
        {/* =================================================================== */}
        {activeSection === 'dashboard' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <div>
                <h1 className="page-title">Driver Operational Dashboard</h1>
                <p className="page-desc" style={{ marginBottom: 0 }}>
                  Welcome back, <strong>{currentUser?.full_name}</strong>. Real-time run sheet and task progress for today's municipal shift.
                </p>
              </div>
              <button onClick={refreshAllData} className="btn btn-secondary btn-sm">
                <RefreshCw size={14} /> Refresh
              </button>
            </div>

            {/* Metric KPI Cards */}
            <div className="stat-cards-grid" style={{ marginBottom: '1.5rem' }}>
              <div className="stat-card stat-card-clickable" onClick={() => switchSection('tasks')}>
                <div className="stat-card-label">TODAY'S TASKS</div>
                <div className="stat-card-value">{dashboardData?.today_summary?.total_tasks ?? 0}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Scheduled collection stops</div>
              </div>

              <div className="stat-card stat-card-clickable" onClick={() => { setTaskStatusFilter('PENDING'); switchSection('tasks'); }}>
                <div className="stat-card-label">PENDING</div>
                <div className="stat-card-value" style={{ color: '#d97706' }}>{dashboardData?.today_summary?.pending ?? 0}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Awaiting pickup</div>
              </div>

              <div className="stat-card stat-card-clickable" onClick={() => { setTaskStatusFilter('STARTED'); switchSection('tasks'); }}>
                <div className="stat-card-label">IN PROGRESS</div>
                <div className="stat-card-value" style={{ color: '#2563eb' }}>{dashboardData?.today_summary?.in_progress ?? 0}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Active collection</div>
              </div>

              <div className="stat-card stat-card-clickable" onClick={() => { setTaskStatusFilter('COMPLETED'); switchSection('tasks'); }}>
                <div className="stat-card-label">COMPLETED</div>
                <div className="stat-card-value" style={{ color: '#10b981' }}>{dashboardData?.today_summary?.completed ?? 0}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Successfully cleared</div>
              </div>

              <div className="stat-card stat-card-clickable" onClick={() => switchSection('performance')}>
                <div className="stat-card-label">COMPLETION RATE</div>
                <div className="stat-card-value">{dashboardData?.performance_snapshot?.completion_rate ?? 0}%</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Real calculated efficiency</div>
              </div>
            </div>

            {/* Active Route Run Card */}
            {activeRoute ? (
              <div style={{ background: '#ffffff', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1.4rem', marginBottom: '1.5rem', boxShadow: '0 2px 8px rgba(8, 28, 21, 0.04)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem', borderBottom: '1px solid #edf2f0', paddingBottom: '0.75rem' }}>
                  <div>
                    <span className="badge badge-active">{activeRoute.shift} SHIFT</span>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--forest-900)', marginTop: '0.35rem' }}>
                      {activeRoute.route_name}
                    </h2>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      Assigned Truck: <strong>{activeRoute.vehicle_number || dashboardData?.assigned_vehicle?.vehicle_number || 'N/A'}</strong>
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span className={`badge ${activeRoute.status === 'COMPLETED' ? 'badge-success' : activeRoute.status === 'IN_PROGRESS' ? 'badge-active' : 'badge-pending'}`}>
                      {activeRoute.status}
                    </span>
                    <button onClick={() => switchSection('routes')} className="btn btn-sm btn-primary">
                      Open Field Route Map <ChevronRight size={15} />
                    </button>
                  </div>
                </div>

                {/* Progress bar */}
                <div style={{ marginBottom: '1.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', fontWeight: 600, color: 'var(--forest-800)', marginBottom: '0.35rem' }}>
                    <span>Route Run Completion</span>
                    <span>
                      {activeRoute.stops?.filter((s: any) => s.status === 'COMPLETED').length || 0} / {activeRoute.stops?.length || 0} Stops Cleared
                    </span>
                  </div>
                  <div style={{ height: '8px', background: '#e5e7eb', borderRadius: '4px', overflow: 'hidden' }}>
                    <div
                      style={{
                        height: '100%',
                        background: '#10b981',
                        width: `${activeRoute.stops?.length ? ((activeRoute.stops.filter((s: any) => s.status === 'COMPLETED').length / activeRoute.stops.length) * 100) : 0}%`,
                        transition: 'width 0.3s ease'
                      }}
                    />
                  </div>
                </div>

                {/* Quick actions for current route */}
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                  {activeRoute.status === 'PUBLISHED' && (
                    <button onClick={handleStartRoute} className="btn btn-primary">
                      <Play size={16} /> Start Morning Route
                    </button>
                  )}
                  {activeRoute.status === 'IN_PROGRESS' && (
                    <button onClick={handleCompleteRoute} className="btn btn-success">
                      <Check size={16} /> Finish Route Run
                    </button>
                  )}
                  <button onClick={() => switchSection('tasks')} className="btn btn-outline">
                    View Run Sheet Checklist
                  </button>
                  <button onClick={() => setNewIssueModalOpen(true)} className="btn btn-outline" style={{ color: '#b91c1c', borderColor: '#fca5a5' }}>
                    <AlertTriangle size={15} /> Report Route Obstruction
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ background: '#ffffff', border: '1px dashed var(--border-color)', borderRadius: '12px', padding: '2.5rem', textAlign: 'center', marginBottom: '1.5rem' }}>
                <Truck size={42} color="var(--forest-700)" style={{ margin: '0 auto 0.75rem' }} />
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--forest-900)' }}>No Active Route Run Today</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', maxWidth: '440px', margin: '0.25rem auto 1rem' }}>
                  Municipal dispatch has not yet published an active collection route for your shift today. Check back shortly or view past task history.
                </p>
                <button onClick={refreshAllData} className="btn btn-secondary btn-sm">
                  <RefreshCw size={14} /> Check for Route Updates
                </button>
              </div>
            )}

            {/* Upcoming Stops Preview */}
            <div className="admin-overview-grid">
              <div style={{ background: '#ffffff', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1.4rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--forest-900)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Clock size={16} color="var(--forest-700)" /> Upcoming Assigned Stops
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                  {dashboardData?.upcoming_stops?.map((stop: any) => (
                    <div key={stop.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem', borderRadius: '8px', background: '#fafcfb', border: '1px solid #edf2f0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div className="stop-badge-seq">{stop.sequence_number}</div>
                        <div>
                          <div style={{ fontWeight: 700, color: 'var(--forest-900)', fontSize: '0.88rem' }}>
                            {stop.target_name || stop.stop_type}
                          </div>
                          <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                            {stop.target_address || 'Scheduled municipal pickup'} • {stop.scheduled_window}
                          </div>
                        </div>
                      </div>
                      <span className={`badge ${stop.status === 'STARTED' ? 'badge-active' : 'badge-pending'}`}>
                        {stop.status}
                      </span>
                    </div>
                  ))}
                  {(!dashboardData?.upcoming_stops || dashboardData.upcoming_stops.length === 0) && (
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', padding: '1rem 0', textAlign: 'center' }}>
                      No upcoming pending stops on active run.
                    </p>
                  )}
                </div>
              </div>

              {/* Quick Actions Shortcuts */}
              <div style={{ background: '#ffffff', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1.4rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--forest-900)', marginBottom: '1rem' }}>
                  Driver Shortcuts
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                  <button onClick={() => switchSection('routes')} className="quick-action-btn">
                    <div className="quick-action-btn-left">
                      <div className="quick-action-icon-circle"><Compass size={16} /></div>
                      <span>Open Field Navigation Map</span>
                    </div>
                    <ChevronRight size={15} color="#85998e" />
                  </button>
                  <button onClick={() => switchSection('tasks')} className="quick-action-btn">
                    <div className="quick-action-btn-left">
                      <div className="quick-action-icon-circle"><CheckCheck size={16} /></div>
                      <span>Review Tasks Checklist</span>
                    </div>
                    <ChevronRight size={15} color="#85998e" />
                  </button>
                  <button onClick={() => setNewIssueModalOpen(true)} className="quick-action-btn">
                    <div className="quick-action-btn-left">
                      <div className="quick-action-icon-circle"><AlertTriangle size={16} /></div>
                      <span>Report Truck / Road Fault</span>
                    </div>
                    <ChevronRight size={15} color="#85998e" />
                  </button>
                  <button onClick={() => switchSection('vehicle')} className="quick-action-btn">
                    <div className="quick-action-btn-left">
                      <div className="quick-action-icon-circle"><Truck size={16} /></div>
                      <span>Assigned Vehicle Details</span>
                    </div>
                    <ChevronRight size={15} color="#85998e" />
                  </button>
                  <button onClick={() => switchSection('help')} className="quick-action-btn">
                    <div className="quick-action-btn-left">
                      <div className="quick-action-icon-circle"><HelpCircle size={16} /></div>
                      <span>Safety & Collection Protocols</span>
                    </div>
                    <ChevronRight size={15} color="#85998e" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* 2. MY TASKS SECTION                                                */}
        {/* =================================================================== */}
        {activeSection === 'tasks' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div>
                <h1 className="page-title">Assigned Collection Tasks</h1>
                <p className="page-desc" style={{ marginBottom: 0 }}>
                  Review, initiate, and finalize assigned municipal building and dustbin collection stops.
                </p>
              </div>
              <button onClick={loadTasks} className="btn btn-secondary btn-sm">
                <RefreshCw size={14} /> Refresh Tasks
              </button>
            </div>

            {/* Filter Bar */}
            <div className="filter-bar">
              <input
                type="text"
                placeholder="Search location or address..."
                value={taskSearch}
                onChange={e => setTaskSearch(e.target.value)}
                style={{ flex: 1, minWidth: '220px' }}
              />
              <select value={taskStatusFilter} onChange={e => setTaskStatusFilter(e.target.value)}>
                <option value="">All Statuses</option>
                <option value="PENDING">Pending</option>
                <option value="STARTED">In Progress (Started)</option>
                <option value="COMPLETED">Completed</option>
                <option value="SKIPPED">Skipped</option>
                <option value="ISSUE_REPORTED">Issue Reported</option>
              </select>
              <select value={taskTypeFilter} onChange={e => setTaskTypeFilter(e.target.value)}>
                <option value="">All Stop Types</option>
                <option value="BUILDING">Buildings</option>
                <option value="DUSTBIN">Smart Dustbins</option>
                <option value="COMPLAINT_REPORT">Citizen Complaint Spots</option>
              </select>
            </div>

            {/* Tasks Cards List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {filteredTasks.map(task => {
                const isDone = task.status === 'COMPLETED';
                const isStarted = task.status === 'STARTED';
                const isException = task.status === 'SKIPPED' || task.status === 'ISSUE_REPORTED';

                return (
                  <div key={task.id} className={`driver-stop-card ${isStarted ? 'active-stop' : ''}`}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '0.65rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div className="stop-badge-seq">{task.sequence_number}</div>
                        <div>
                          <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--forest-900)' }}>
                            {task.target_name || task.stop_type}
                          </h3>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            Route: <strong>{task.route_name}</strong> ({task.shift} Shift • {task.route_date})
                          </span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span className={`badge ${isDone ? 'badge-success' : isStarted ? 'badge-active' : isException ? 'badge-danger' : 'badge-neutral'}`}>
                          {task.status}
                        </span>
                      </div>
                    </div>

                    {task.target_address && (
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.65rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <MapPin size={14} color="var(--forest-700)" /> {task.target_address}
                      </p>
                    )}

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.75rem', fontSize: '0.78rem' }}>
                      <span style={{ background: '#f3f4f6', padding: '0.2rem 0.5rem', borderRadius: '4px', color: '#374151' }}>
                        Window: <strong>{task.scheduled_window || 'Morning'}</strong>
                      </span>
                      {task.photo_required ? (
                        <span style={{ background: '#fee2e2', color: '#991b1b', padding: '0.2rem 0.5rem', borderRadius: '4px', fontWeight: 600 }}>
                          <Camera size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '3px' }} />
                          Photo Evidence Required
                        </span>
                      ) : (
                        <span style={{ background: '#dcfce7', color: '#166534', padding: '0.2rem 0.5rem', borderRadius: '4px', fontWeight: 600 }}>
                          ✓ Routine Stop (No Photo)
                        </span>
                      )}
                      {task.proof && (
                        <span style={{ background: '#e0e7ff', color: '#3730a3', padding: '0.2rem 0.5rem', borderRadius: '4px', fontWeight: 600 }}>
                          Proof Status: {task.proof.review_status}
                        </span>
                      )}
                    </div>

                    {/* Operational Stop Actions */}
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem' }}>
                      {task.status === 'PENDING' && (
                        <button onClick={() => handleStartStop(task.id)} className="btn btn-sm btn-primary">
                          <Play size={14} /> Start Stop
                        </button>
                      )}
                      {task.status === 'STARTED' && (
                        <button onClick={() => handleOpenCompleteStop(task)} className="btn btn-sm btn-success">
                          <Check size={14} /> Complete Stop
                        </button>
                      )}
                      {!isDone && !isException && (
                        <button onClick={() => handleOpenExceptionModal(task)} className="btn btn-sm btn-outline">
                          <AlertTriangle size={14} /> Report Issue / Skip
                        </button>
                      )}
                      {task.latitude && task.longitude && (
                        <a
                          href={`https://www.google.com/maps/dir/?api=1&destination=${task.latitude},${task.longitude}`}
                          target="_blank"
                          rel="noreferrer"
                          className="btn btn-sm btn-secondary"
                          style={{ textDecoration: 'none' }}
                        >
                          <ExternalLink size={14} /> Google Maps
                        </a>
                      )}
                      <button onClick={() => setSelectedTaskDetail(task)} className="btn btn-sm btn-outline">
                        View Details
                      </button>
                    </div>
                  </div>
                );
              })}
              {filteredTasks.length === 0 && (
                <div style={{ background: '#fff', border: '1px dashed var(--border-color)', borderRadius: '12px', padding: '3rem', textAlign: 'center' }}>
                  <CheckCircle2 size={36} color="var(--forest-600)" style={{ margin: '0 auto 0.75rem' }} />
                  <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>No Collection Tasks Found</h3>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Try clearing filters or checking for active route assignments.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* 3. MY ROUTES & FIELD NAVIGATION                                    */}
        {/* =================================================================== */}
        {activeSection === 'routes' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div>
                <h1 className="page-title">Active Field Route & Road Map</h1>
                <p className="page-desc" style={{ marginBottom: 0 }}>
                  Interactive turn-by-turn road dispatch sheet with live stop order and completion tracking.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={loadTodayRoutes} className="btn btn-secondary btn-sm">
                  <RefreshCw size={14} /> Refresh Route
                </button>
              </div>
            </div>

            {routes.length > 1 && (
              <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Switch Active Route ({routes.length} Assigned):</span>
                <select
                  className="form-select"
                  style={{ width: 'auto' }}
                  value={activeRoute?.id || ''}
                  onChange={e => loadRouteDetails(e.target.value)}
                >
                  {routes.map(r => (
                    <option key={r.id} value={r.id}>{r.route_name} ({r.status})</option>
                  ))}
                </select>
              </div>
            )}

            {activeRoute ? (
              <div>
                {/* Route Header Banner */}
                <div style={{ background: '#ffffff', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1.25rem', marginBottom: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                  <div>
                    <span className="badge badge-active">{activeRoute.shift} SHIFT</span>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--forest-900)', marginTop: '0.25rem' }}>
                      {activeRoute.route_name}
                    </h2>
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                      Vehicle: <strong>{activeRoute.vehicle_number || 'Unassigned'}</strong> • Date: <strong>{activeRoute.route_date}</strong>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {activeRoute.status === 'PUBLISHED' && (
                      <button onClick={handleStartRoute} className="btn btn-primary">
                        <Play size={16} /> Start Route Run
                      </button>
                    )}
                    {activeRoute.status === 'IN_PROGRESS' && (
                      <button onClick={handleCompleteRoute} className="btn btn-success">
                        <Check size={16} /> Finish Route
                      </button>
                    )}
                  </div>
                </div>

                {/* Live GPS Telemetry Status Banner */}
                {activeRoute.status === 'IN_PROGRESS' && (
                  <div style={{ background: '#ffffff', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1rem 1.25rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                      <div style={{ width: '38px', height: '38px', borderRadius: '50%', background: isGpsSharing ? '#dcfce7' : '#fee2e2', color: isGpsSharing ? '#15803d' : '#b91c1c', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Radio size={20} className={isGpsSharing ? 'spin' : ''} />
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--forest-900)' }}>
                            {gpsStatus === 'SHARING' && 'Live GPS Sharing Active'}
                            {gpsStatus === 'WEAK_SIGNAL' && 'GPS Signal Weak (Acquiring Satellites)'}
                            {gpsStatus === 'PERMISSION_DENIED' && 'Location Permission Denied'}
                            {gpsStatus === 'UNAVAILABLE' && 'GPS Unavailable on Device'}
                            {gpsStatus === 'IDLE' && 'GPS Sharing Inactive'}
                          </span>
                          <span className={`badge ${isGpsSharing ? 'badge-success' : 'badge-danger'}`}>
                            {isGpsSharing ? 'STREAMING' : 'OFFLINE'}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                          {gpsAccuracy !== null && `Accuracy: ±${Math.round(gpsAccuracy)}m • `}
                          {lastGpsPingTime ? `Last ping: ${Math.round((Date.now() - lastGpsPingTime.getTime()) / 1000)}s ago` : 'Awaiting position fix'}
                          {liveNextStopEta?.eta_minutes && ` • Next Stop ETA: ~${liveNextStopEta.eta_minutes} mins (${liveNextStopEta.distance_km || 0} km)`}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      {!isGpsSharing ? (
                        <button onClick={() => startGpsTelemetry(activeRoute.id)} className="btn btn-sm btn-primary">
                          <Radio size={14} /> Resume GPS Sharing
                        </button>
                      ) : (
                        <button onClick={() => stopGpsTelemetry(activeRoute.id)} className="btn btn-sm btn-outline">
                          Pause Sharing
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Split Map & Stops Layout */}
                <div className="planner-split">
                  {/* Left Column: Stops List */}
                  <div>
                    <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--forest-900)', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Stop Sequence ({activeRoute.stops?.length || 0} stops)
                    </h3>
                    <div className="stops-scroll-list">
                      {activeRoute.stops?.map((stop: any) => {
                        const isDone = stop.status === 'COMPLETED';
                        const isStarted = stop.status === 'STARTED';
                        const isException = stop.status === 'SKIPPED' || stop.status === 'ISSUE_REPORTED';

                        return (
                          <div key={stop.id} className="stop-item-card" style={{ borderLeft: isStarted ? '3px solid #2563eb' : isDone ? '3px solid #10b981' : '3px solid var(--border-color)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <div className="stop-badge-seq">{stop.sequence_number}</div>
                                <strong style={{ fontSize: '0.9rem', color: 'var(--forest-900)' }}>
                                  {stop.target_name || stop.stop_type}
                                </strong>
                              </div>
                              <span className={`badge ${isDone ? 'badge-success' : isStarted ? 'badge-active' : isException ? 'badge-danger' : 'badge-neutral'}`}>
                                {stop.status}
                              </span>
                            </div>

                            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                              {stop.target_address || 'Collection address'} • {stop.scheduled_window}
                            </p>

                            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                              {stop.status === 'PENDING' && (
                                <button onClick={() => handleStartStop(stop.id)} className="btn btn-sm btn-primary">
                                  <Play size={13} /> Start Stop
                                </button>
                              )}
                              {stop.status === 'STARTED' && (
                                <button onClick={() => handleOpenCompleteStop(stop)} className="btn btn-sm btn-success">
                                  <Check size={13} /> Complete
                                </button>
                              )}
                              {!isDone && !isException && (
                                <button onClick={() => handleOpenExceptionModal(stop)} className="btn btn-sm btn-outline">
                                  Skip
                                </button>
                              )}
                              {stop.latitude && stop.longitude && (
                                <a
                                  href={`https://www.google.com/maps/dir/?api=1&destination=${stop.latitude},${stop.longitude}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="btn btn-sm btn-secondary"
                                  style={{ textDecoration: 'none' }}
                                >
                                  <ExternalLink size={13} /> GPS
                                </a>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Right Column: Leaflet Map */}
                  <div style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: '12px', overflow: 'hidden', padding: '0.5rem' }}>
                    <MapComponent
                      markers={mapMarkers}
                      polyline={activeRoute.geometry}
                      height="520px"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ background: '#fff', border: '1px dashed var(--border-color)', borderRadius: '12px', padding: '3rem', textAlign: 'center' }}>
                <Compass size={40} color="var(--forest-600)" style={{ margin: '0 auto 0.75rem' }} />
                <h3>No Active Route Assigned Today</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Contact municipal dispatch or refresh when shifts begin.</p>
              </div>
            )}
          </div>
        )}

        {/* =================================================================== */}
        {/* 4. TASK HISTORY SECTION                                            */}
        {/* =================================================================== */}
        {activeSection === 'history' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div>
                <h1 className="page-title">Historical Collection Logs</h1>
                <p className="page-desc" style={{ marginBottom: 0 }}>
                  Audit log of all completed, skipped, and resolved collection attempts.
                </p>
              </div>
              <button onClick={loadHistory} className="btn btn-secondary btn-sm">
                <RefreshCw size={14} /> Refresh History
              </button>
            </div>

            {/* Filter Bar */}
            <div className="filter-bar">
              <select value={historyStatusFilter} onChange={e => setHistoryStatusFilter(e.target.value)}>
                <option value="">All Outcomes</option>
                <option value="COMPLETED">Completed</option>
                <option value="SKIPPED">Skipped</option>
                <option value="ISSUE_REPORTED">Issue Reported</option>
              </select>
            </div>

            {/* History Table */}
            <div className="card-table-wrapper">
              <table className="op-table">
                <thead>
                  <tr>
                    <th>Date & Time</th>
                    <th>Location / Target</th>
                    <th>Route</th>
                    <th>Outcome Status</th>
                    <th>Notes / Exception</th>
                    <th>Evidence Photo</th>
                  </tr>
                </thead>
                <tbody>
                  {historyRecords.map(rec => (
                    <tr key={rec.stop_id}>
                      <td style={{ fontSize: '0.8rem', color: 'var(--text-subtle)' }}>
                        {rec.completed_at ? new Date(rec.completed_at).toLocaleString() : rec.route_date}
                      </td>
                      <td>
                        <strong>{rec.target_name || rec.stop_type}</strong>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{rec.target_address}</div>
                      </td>
                      <td style={{ fontSize: '0.82rem' }}>
                        {rec.route_name}
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-subtle)' }}>{rec.shift} Shift</div>
                      </td>
                      <td>
                        <span className={`badge ${rec.status === 'COMPLETED' ? 'badge-success' : 'badge-danger'}`}>
                          {rec.status}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {rec.exception_reason || 'Successfully collected.'}
                      </td>
                      <td>
                        {rec.proof?.image_url ? (
                          <a href={rec.proof.image_url} target="_blank" rel="noreferrer" className="btn btn-sm btn-outline">
                            View Proof
                          </a>
                        ) : (
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>None required</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {historyRecords.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                        No historical records matching the filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* 5. PERFORMANCE ANALYTICS SECTION                                   */}
        {/* =================================================================== */}
        {activeSection === 'performance' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <div>
                <h1 className="page-title">Driver Performance Analytics</h1>
                <p className="page-desc" style={{ marginBottom: 0 }}>
                  Real metrics calculated from verified collection completions and shift reports.
                </p>
              </div>
              <button onClick={loadPerformance} className="btn btn-secondary btn-sm">
                <RefreshCw size={14} /> Refresh Analytics
              </button>
            </div>

            {/* Performance Stat Cards */}
            <div className="stat-cards-grid" style={{ marginBottom: '1.5rem' }}>
              <div className="stat-card">
                <div className="stat-card-label">COMPLETION RATE</div>
                <div className="stat-card-value" style={{ color: '#10b981' }}>
                  {performanceData?.metrics?.completion_rate ?? 0}%
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  Completed / Eligible assigned tasks
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-card-label">TOTAL ASSIGNED</div>
                <div className="stat-card-value">{performanceData?.metrics?.total_assigned ?? 0}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>All scheduled stops</div>
              </div>

              <div className="stat-card">
                <div className="stat-card-label">SUCCESSFULLY CLEARED</div>
                <div className="stat-card-value" style={{ color: '#10b981' }}>{performanceData?.metrics?.total_completed ?? 0}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Completed pickups</div>
              </div>

              <div className="stat-card">
                <div className="stat-card-label">EXCEPTIONS / SKIPPED</div>
                <div className="stat-card-value" style={{ color: '#b91c1c' }}>
                  {(performanceData?.metrics?.total_skipped ?? 0) + (performanceData?.metrics?.total_issues ?? 0)}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Inaccessible or blocked</div>
              </div>
            </div>

            {/* Performance Calculation Documentation */}
            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '1rem', marginBottom: '1.5rem', fontSize: '0.85rem', color: '#1e3a8a' }}>
              <strong>Calculation Method:</strong> Completion Rate = (Successfully Cleared Stops ÷ Eligible Stops) × 100.
              Eligible stops include Completed, Skipped, and Issue Reported stops. Cancelled routes are excluded from the denominator.
            </div>

            {/* Daily Trends & Breakdown */}
            <div className="admin-overview-grid">
              <div style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1.4rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--forest-900)', marginBottom: '1rem' }}>
                  7-Day Completion Trend
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                  {performanceData?.daily_trends?.map((day: any) => (
                    <div key={day.date} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.65rem 0.75rem', background: '#fafcfb', border: '1px solid #edf2f0', borderRadius: '8px', fontSize: '0.85rem' }}>
                      <span style={{ fontWeight: 600, color: 'var(--forest-900)' }}>{day.date}</span>
                      <div style={{ display: 'flex', gap: '1rem', fontSize: '0.8rem' }}>
                        <span>Assigned: <strong>{day.assigned}</strong></span>
                        <span style={{ color: '#10b981' }}>Cleared: <strong>{day.completed}</strong></span>
                        {day.exceptions > 0 && <span style={{ color: '#b91c1c' }}>Exceptions: <strong>{day.exceptions}</strong></span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* By Category Breakdown */}
              <div style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1.4rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--forest-900)', marginBottom: '1rem' }}>
                  Performance by Stop Category
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                  {performanceData?.by_type && Object.entries(performanceData.by_type).map(([cat, val]: any) => (
                    <div key={cat} style={{ background: '#fafcfb', padding: '0.75rem', borderRadius: '8px', border: '1px solid #edf2f0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '0.85rem', color: 'var(--forest-900)', marginBottom: '0.35rem' }}>
                        <span>{cat.replace('_', ' ')}</span>
                        <span>{val.rate}%</span>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {val.completed} cleared out of {val.total} assigned
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* 6. MY PROFILE SECTION                                              */}
        {/* =================================================================== */}
        {activeSection === 'profile' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <div>
                <h1 className="page-title">Driver Profile & Security</h1>
                <p className="page-desc" style={{ marginBottom: 0 }}>
                  Manage authorized contact phone details, assigned credentials, and secure account password.
                </p>
              </div>
              <button onClick={() => setProfileEditModalOpen(true)} className="btn btn-primary btn-sm">
                Edit Contact / Password
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.25rem' }}>
              <div style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1.4rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--forest-900)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <User size={16} color="var(--forest-700)" /> Driver Identity Details
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.88rem' }}>
                  <div>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', display: 'block' }}>FULL NAME</span>
                    <strong>{profileData?.full_name}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', display: 'block' }}>MUNICIPAL DRIVER ID</span>
                    <code>{profileData?.id}</code>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', display: 'block' }}>EMAIL</span>
                    <span>{profileData?.email}</span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', display: 'block' }}>PHONE NUMBER</span>
                    <span>{profileData?.phone || 'Not configured'}</span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', display: 'block' }}>DRIVING LICENSE NUMBER</span>
                    <strong>{profileData?.license_number || 'MH-04-COMMERCIAL-VALID'}</strong>
                  </div>
                </div>
              </div>

              <div style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1.4rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--forest-900)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Shield size={16} color="var(--forest-700)" /> Account Authorization & Security
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.88rem' }}>
                  <div>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', display: 'block' }}>ROLE LEVEL</span>
                    <span className="badge badge-active">DRIVER (FIELD CREW)</span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', display: 'block' }}>ACCOUNT STATUS</span>
                    <span className="badge badge-success">ACTIVE & VERIFIED</span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', display: 'block' }}>AUTHENTICATION TYPE</span>
                    <span>Salted scrypt Hash (Industry Standard)</span>
                  </div>
                  <div style={{ marginTop: '0.5rem' }}>
                    <button onClick={() => setProfileEditModalOpen(true)} className="btn btn-outline btn-sm" style={{ width: '100%' }}>
                      <Key size={14} /> Change Account Password
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* 7. NOTIFICATIONS CENTER SECTION                                    */}
        {/* =================================================================== */}
        {activeSection === 'notifications' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div>
                <h1 className="page-title">Driver Notifications & Dispatch Alerts</h1>
                <p className="page-desc" style={{ marginBottom: 0 }}>
                  Real-time operational alerts regarding route assignments, cancellations, and evidence review decisions.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={handleMarkAllNotificationsRead} className="btn btn-outline btn-sm">
                  Mark All as Read
                </button>
                <button onClick={loadNotifications} className="btn btn-secondary btn-sm">
                  <RefreshCw size={14} /> Refresh
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {notifications.map(n => {
                const isUnread = !n.read_at;
                return (
                  <div
                    key={n.id}
                    style={{
                      background: isUnread ? '#f0fdf4' : '#ffffff',
                      border: isUnread ? '1px solid #86efac' : '1px solid var(--border-color)',
                      borderRadius: '10px',
                      padding: '1rem',
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      gap: '0.75rem'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                      <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: isUnread ? '#dcfce7' : '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', color: isUnread ? '#166534' : '#6b7280', flexShrink: 0 }}>
                        <Bell size={16} />
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, color: 'var(--forest-900)', fontSize: '0.9rem' }}>{n.title}</div>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '0.2rem 0' }}>{n.message}</p>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-subtle)' }}>
                          {new Date(n.created_at).toLocaleString()}
                        </span>
                      </div>
                    </div>
                    {isUnread && (
                      <button onClick={() => handleMarkNotificationRead(n.id)} className="btn btn-sm btn-outline" style={{ fontSize: '0.75rem' }}>
                        Mark Read
                      </button>
                    )}
                  </div>
                );
              })}
              {notifications.length === 0 && (
                <div style={{ background: '#fff', border: '1px dashed var(--border-color)', borderRadius: '12px', padding: '3rem', textAlign: 'center' }}>
                  <Bell size={36} color="var(--forest-600)" style={{ margin: '0 auto 0.75rem' }} />
                  <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>No Notifications</h3>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>You are completely up to date.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* 8. SUPPORT & ISSUES SECTION                                        */}
        {/* =================================================================== */}
        {activeSection === 'issues' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div>
                <h1 className="page-title">Field Issues & Dispatch Tickets</h1>
                <p className="page-desc" style={{ marginBottom: 0 }}>
                  Report vehicle breakdowns, blocked roads, or inaccessible dustbins and receive administrative responses.
                </p>
              </div>
              <button onClick={() => setNewIssueModalOpen(true)} className="btn btn-primary btn-sm">
                <Plus size={15} /> Submit Field Issue
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {issues.map(iss => (
                <div key={iss.id} style={{ background: '#ffffff', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1.25rem' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <div>
                      <span className="badge badge-active" style={{ fontSize: '0.68rem', marginRight: '0.4rem' }}>{iss.category}</span>
                      <strong style={{ fontSize: '1rem', color: 'var(--forest-900)' }}>{iss.title}</strong>
                    </div>
                    <span className={`badge ${iss.status === 'RESOLVED' ? 'badge-success' : iss.status === 'IN_REVIEW' ? 'badge-active' : 'badge-pending'}`}>
                      {iss.status}
                    </span>
                  </div>

                  <p style={{ fontSize: '0.85rem', color: 'var(--text-main)', marginBottom: '0.75rem' }}>{iss.description}</p>

                  {iss.photo_url && (
                    <div style={{ marginBottom: '0.75rem' }}>
                      <img src={iss.photo_url} alt="Issue attachment" style={{ width: '120px', height: '90px', objectFit: 'cover', borderRadius: '6px', border: '1px solid #d1ded8' }} />
                    </div>
                  )}

                  {/* Admin Dispatch Response Box */}
                  {iss.admin_response ? (
                    <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '0.85rem', marginTop: '0.65rem' }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#166534', textTransform: 'uppercase', marginBottom: '0.2rem' }}>
                        Municipal Dispatch Response
                      </div>
                      <p style={{ fontSize: '0.85rem', color: '#14532d', margin: 0 }}>{iss.admin_response}</p>
                      {iss.resolved_at && (
                        <div style={{ fontSize: '0.72rem', color: '#15803d', marginTop: '0.35rem' }}>
                          Resolved at: {new Date(iss.resolved_at).toLocaleString()}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-subtle)', fontStyle: 'italic', marginTop: '0.5rem' }}>
                      Ticket is currently pending review by municipal dispatch officers.
                    </div>
                  )}

                  <div style={{ fontSize: '0.72rem', color: 'var(--text-subtle)', marginTop: '0.65rem' }}>
                    Submitted on: {new Date(iss.created_at).toLocaleString()}
                  </div>
                </div>
              ))}
              {issues.length === 0 && (
                <div style={{ background: '#fff', border: '1px dashed var(--border-color)', borderRadius: '12px', padding: '3rem', textAlign: 'center' }}>
                  <MessageSquare size={36} color="var(--forest-600)" style={{ margin: '0 auto 0.75rem' }} />
                  <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>No Field Issues Logged</h3>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Use the button above to report blocked roads or vehicle mechanical faults.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* 9. VEHICLE & SHIFT INFORMATION                                     */}
        {/* =================================================================== */}
        {activeSection === 'vehicle' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <div>
                <h1 className="page-title">Assigned Fleet Vehicle & Shift Specs</h1>
                <p className="page-desc" style={{ marginBottom: 0 }}>
                  Authorized telemetry, mechanical ratings, and municipal shift schedules.
                </p>
              </div>
              <button onClick={() => setNewIssueModalOpen(true)} className="btn btn-outline btn-sm" style={{ color: '#b91c1c', borderColor: '#fca5a5' }}>
                <AlertTriangle size={14} /> Report Vehicle Fault
              </button>
            </div>

            {vehicleData?.vehicle ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
                <div style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1.4rem' }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--forest-900)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Truck size={17} color="var(--forest-700)" /> Vehicle Specifications
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.88rem' }}>
                    <div>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', display: 'block' }}>REGISTRATION NUMBER</span>
                      <strong style={{ fontSize: '1.1rem', color: 'var(--forest-900)' }}>{vehicleData.vehicle.vehicle_number}</strong>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', display: 'block' }}>VEHICLE TYPE</span>
                      <span>{vehicleData.vehicle.vehicle_type}</span>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', display: 'block' }}>PAYLOAD CAPACITY</span>
                      <span>{vehicleData.vehicle.capacity_kg} kg (~{vehicleData.vehicle.capacity_kg / 1000} Metric Tonnes)</span>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', display: 'block' }}>OPERATIONAL STATUS</span>
                      <span className="badge badge-active">{vehicleData.vehicle.status}</span>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', display: 'block' }}>MAINTENANCE CONDITION</span>
                      <span className="badge badge-success">{vehicleData.vehicle.maintenance_status || 'NORMAL'}</span>
                    </div>
                  </div>
                </div>

                <div style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1.4rem' }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--forest-900)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Clock size={17} color="var(--forest-700)" /> Shift Timings & Guidelines
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.85rem' }}>
                    <div>
                      <strong>MORNING SHIFT: 06:30 - 14:30 IST</strong>
                      <p style={{ color: 'var(--text-muted)', margin: '0.2rem 0' }}>Primary residential building door-to-door waste collection.</p>
                    </div>
                    <div>
                      <strong>AFTERNOON SHIFT: 14:30 - 22:30 IST</strong>
                      <p style={{ color: 'var(--text-muted)', margin: '0.2rem 0' }}>Commercial zone and overflowing dustbin secondary clearance.</p>
                    </div>
                    <div>
                      <strong>NIGHT SHIFT: 22:30 - 06:30 IST</strong>
                      <p style={{ color: 'var(--text-muted)', margin: '0.2rem 0' }}>Main arterial road mechanical sweeping & transfer station transport.</p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ background: '#fff', border: '1px dashed var(--border-color)', borderRadius: '12px', padding: '3rem', textAlign: 'center' }}>
                <Truck size={36} color="var(--forest-600)" style={{ margin: '0 auto 0.75rem' }} />
                <h3>No Vehicle Currently Assigned</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Contact municipal fleet dispatch to receive your assigned truck keys.</p>
              </div>
            )}
          </div>
        )}

        {/* =================================================================== */}
        {/* 10. HELP & SAFETY SECTION                                          */}
        {/* =================================================================== */}
        {activeSection === 'help' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <div>
                <h1 className="page-title">Driver Help, SOPs & Safety Guidelines</h1>
                <p className="page-desc" style={{ marginBottom: 0 }}>
                  Standard municipal waste handling instructions, photo proof standards, and safety precautions.
                </p>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
              <div style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1.4rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--forest-900)', marginBottom: '0.75rem' }}>
                  1. Collection SOP Workflow
                </h3>
                <ol style={{ paddingLeft: '1.25rem', fontSize: '0.85rem', color: 'var(--text-main)', lineHeight: 1.6 }}>
                  <li>Arrive at scheduled building or bin coordinates within designated time window.</li>
                  <li>Inspect waste segregation (Wet, Dry, Sanitary, Hazardous).</li>
                  <li>Mark the stop as <strong>STARTED</strong> on your phone.</li>
                  <li>Load compactor bin and compress according to safety limits.</li>
                  <li>If photo proof required, take a clear picture of the empty bin or cleared roadside spot.</li>
                  <li>Submit completion status to unlock next stop in sequence.</li>
                </ol>
              </div>

              <div style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1.4rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--forest-900)', marginBottom: '0.75rem' }}>
                  2. Photo Evidence Quality Criteria
                </h3>
                <ul style={{ paddingLeft: '1.25rem', fontSize: '0.85rem', color: 'var(--text-main)', lineHeight: 1.6 }}>
                  <li>Ensure good lighting; turn on camera flash in shaded alleyways.</li>
                  <li>Capture the entire collection point or dustbin code clearly.</li>
                  <li>The area must be visibly cleared and clean.</li>
                  <li>Automated AI vision compares the proof with original citizen report photos.</li>
                </ul>
              </div>

              <div style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1.4rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--forest-900)', marginBottom: '0.75rem' }}>
                  3. Road Blockages & Vehicle Faults
                </h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-main)', lineHeight: 1.6 }}>
                  If a road is dug up or gate locked:
                  <br />- Use <strong>Report Issue / Skip</strong> button with a mandatory reason.
                  <br />- Do not attempt hazardous tight turns in narrow alleys.
                  <br />- For mechanical breakdown, submit a ticket in Support & Issues.
                </p>
              </div>

              <div style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1.4rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--forest-900)', marginBottom: '0.75rem' }}>
                  4. Emergency Dispatch Contacts
                </h3>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-main)', lineHeight: 1.6 }}>
                  <div><strong>Municipal Dispatch Helpline:</strong> 1800-22-SMART</div>
                  <div><strong>Fleet Breakdown Towing:</strong> 022-2757-9911</div>
                  <div><strong>Navi Mumbai Municipal HQ:</strong> Sector 15A, CBD Belapur</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* =================================================================== */}
      {/* MODAL 1: PROOF PHOTO CAPTURE & UPLOAD DIALOG                        */}
      {/* =================================================================== */}
      {proofStop && (
        <div className="modal-backdrop">
          <div className="modal-dialog">
            <div className="modal-header">
              <h3>Upload Collection Proof</h3>
              <button onClick={() => setProofStop(null)} className="btn btn-sm btn-outline"><X size={16} /></button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                Stop #{proofStop.sequence_number}: <strong>{proofStop.target_name || proofStop.stop_type}</strong>
                <br />
                {proofStop.target_address}
              </p>

              <div className="form-group">
                <label className="form-label">Take or Select Completion Photo *</label>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="form-input"
                  onChange={handlePhotoUploadChange}
                />
              </div>

              {proofImageB64 && (
                <div style={{ margin: '1rem 0', textAlign: 'center' }}>
                  <img src={proofImageB64} alt="Proof preview" style={{ maxWidth: '100%', maxHeight: '220px', borderRadius: '8px', border: '1px solid #d1ded8' }} />
                </div>
              )}

              {proofLocation.lat && (
                <div style={{ fontSize: '0.75rem', color: '#166534', background: '#dcfce7', padding: '0.4rem 0.6rem', borderRadius: '4px' }}>
                  GPS Location Tagged: {proofLocation.lat.toFixed(5)}, {proofLocation.lng?.toFixed(5)}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button onClick={() => setProofStop(null)} className="btn btn-secondary">Cancel</button>
              <button
                onClick={handleSubmitProofAndComplete}
                className="btn btn-primary"
                disabled={!proofImageB64 || isUploadingProof}
              >
                {isUploadingProof ? 'Uploading & Analyzing...' : 'Submit Proof & Complete Stop'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL 2: EXCEPTION / SKIP STOP DIALOG                               */}
      {/* =================================================================== */}
      {exceptionStop && (
        <div className="modal-backdrop">
          <div className="modal-dialog">
            <div className="modal-header">
              <h3>Log Stop Exception / Obstruction</h3>
              <button onClick={() => setExceptionStop(null)} className="btn btn-sm btn-outline"><X size={16} /></button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                Stop #{exceptionStop.sequence_number}: <strong>{exceptionStop.target_name || exceptionStop.stop_type}</strong>
              </p>

              <div className="form-group">
                <label className="form-label">Exception Type *</label>
                <select
                  className="form-select"
                  value={exceptionType}
                  onChange={(e: any) => setExceptionType(e.target.value)}
                >
                  <option value="SKIPPED">Skipped (Inaccessible / Blocked Alley)</option>
                  <option value="ISSUE_REPORTED">Issue Reported (Dustbin Vandalized / Overloaded)</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Mandatory Reason *</label>
                <textarea
                  className="form-textarea"
                  rows={3}
                  placeholder="Detail the road blockage, locked gate, or safety issue..."
                  value={exceptionReason}
                  onChange={e => setExceptionReason(e.target.value)}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setExceptionStop(null)} className="btn btn-secondary">Cancel</button>
              <button
                onClick={handleSubmitException}
                className="btn btn-danger"
                disabled={isSubmittingException || !exceptionReason.trim()}
              >
                {isSubmittingException ? 'Logging...' : 'Confirm Exception'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL 3: NEW DRIVER FIELD ISSUE TICKET DIALOG                       */}
      {/* =================================================================== */}
      {newIssueModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-dialog">
            <div className="modal-header">
              <h3>Submit Field Issue to Dispatch</h3>
              <button onClick={() => setNewIssueModalOpen(false)} className="btn btn-sm btn-outline"><X size={16} /></button>
            </div>
            <form onSubmit={handleSubmitIssueTicket}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Issue Category *</label>
                  <select
                    className="form-select"
                    value={issueForm.category}
                    onChange={e => setIssueForm({ ...issueForm, category: e.target.value })}
                  >
                    <option value="VEHICLE_FAULT">Vehicle Mechanical Fault / Breakdown</option>
                    <option value="BLOCKED_ROAD">Road Excavation / Blockage</option>
                    <option value="ACCESS_ISSUE">Inaccessible Collection Gate / Spot</option>
                    <option value="ACCIDENT">Traffic Collision / Incident</option>
                    <option value="SCHEDULE_INQUIRY">Shift / Route Schedule Clarification</option>
                    <option value="OTHER">Other Operational Issue</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Subject Title *</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Brief description of the problem..."
                    value={issueForm.title}
                    onChange={e => setIssueForm({ ...issueForm, title: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Detailed Notes *</label>
                  <textarea
                    className="form-textarea"
                    rows={3}
                    placeholder="Provide specific location, vehicle symptom, or problem details..."
                    value={issueForm.description}
                    onChange={e => setIssueForm({ ...issueForm, description: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Priority</label>
                  <select
                    className="form-select"
                    value={issueForm.priority}
                    onChange={e => setIssueForm({ ...issueForm, priority: e.target.value })}
                  >
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High (Urgent Attention)</option>
                    <option value="URGENT">Critical / Immediate Towing Needed</option>
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" onClick={() => setNewIssueModalOpen(false)} className="btn btn-secondary">Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={isSubmittingIssue}>
                  {isSubmittingIssue ? 'Submitting...' : 'Submit to Municipal Dispatch'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL 4: PROFILE EDIT & PASSWORD CHANGE DIALOG                      */}
      {/* =================================================================== */}
      {profileEditModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-dialog">
            <div className="modal-header">
              <h3>Edit Contact Phone & Password</h3>
              <button onClick={() => setProfileEditModalOpen(false)} className="btn btn-sm btn-outline"><X size={16} /></button>
            </div>
            <form onSubmit={handleSaveProfile}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Contact Phone Number</label>
                  <input
                    type="tel"
                    className="form-input"
                    value={phoneInput}
                    onChange={e => setPhoneInput(e.target.value)}
                    placeholder="Your active phone number..."
                  />
                </div>

                <hr style={{ margin: '1.25rem 0', borderColor: 'var(--border-color)' }} />
                <h4 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '0.75rem', color: 'var(--forest-900)' }}>
                  Change Account Password (Optional)
                </h4>

                <div className="form-group">
                  <label className="form-label">Current Password</label>
                  <input
                    type="password"
                    className="form-input"
                    value={currentPwInput}
                    onChange={e => setCurrentPwInput(e.target.value)}
                    placeholder="Enter current password..."
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">New Password</label>
                  <input
                    type="password"
                    className="form-input"
                    value={newPwInput}
                    onChange={e => setNewPwInput(e.target.value)}
                    placeholder="At least 6 characters..."
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" onClick={() => setProfileEditModalOpen(false)} className="btn btn-secondary">Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={isUpdatingProfile}>
                  {isUpdatingProfile ? 'Saving...' : 'Save Profile Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL 5: TASK DETAIL DRAWER                                         */}
      {/* =================================================================== */}
      {selectedTaskDetail && (
        <div className="modal-backdrop">
          <div className="modal-dialog">
            <div className="modal-header">
              <h3>Task Details: Stop #{selectedTaskDetail.sequence_number}</h3>
              <button onClick={() => setSelectedTaskDetail(null)} className="btn btn-sm btn-outline"><X size={16} /></button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.88rem' }}>
                <div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', display: 'block' }}>LOCATION / TARGET</span>
                  <strong>{selectedTaskDetail.target_name || selectedTaskDetail.stop_type}</strong>
                  <div style={{ color: 'var(--text-muted)' }}>{selectedTaskDetail.target_address}</div>
                </div>

                <div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', display: 'block' }}>ROUTE & SHIFT</span>
                  <span>{selectedTaskDetail.route_name} ({selectedTaskDetail.shift} Shift • {selectedTaskDetail.route_date})</span>
                </div>

                <div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', display: 'block' }}>SCHEDULED WINDOW</span>
                  <span>{selectedTaskDetail.scheduled_window || 'Morning window'}</span>
                </div>

                <div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', display: 'block' }}>CURRENT STATUS</span>
                  <span className="badge badge-active">{selectedTaskDetail.status}</span>
                </div>

                <div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', display: 'block' }}>EVIDENCE POLICY</span>
                  <span>{selectedTaskDetail.photo_required ? 'Photo evidence required for completion.' : 'Routine collection (No photo needed).'}</span>
                </div>

                {selectedTaskDetail.proof && (
                  <div style={{ background: '#f0fdf4', padding: '0.75rem', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
                    <strong>Submitted Collection Proof:</strong>
                    <div style={{ marginTop: '0.4rem' }}>
                      <img src={selectedTaskDetail.proof.image_url} alt="Proof" style={{ width: '120px', height: '90px', objectFit: 'cover', borderRadius: '4px' }} />
                    </div>
                    <span style={{ fontSize: '0.75rem', color: '#166534' }}>Review status: {selectedTaskDetail.proof.review_status}</span>
                  </div>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setSelectedTaskDetail(null)} className="btn btn-secondary">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL: GPS TELEMETRY PERMISSION & START RUN CONSENT                 */}
      {/* =================================================================== */}
      {gpsConsentModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-dialog">
            <div className="modal-header">
              <h3>Start Route Run & Enable Live Telemetry</h3>
              <button onClick={() => setGpsConsentModalOpen(false)} className="btn btn-sm btn-outline"><X size={16} /></button>
            </div>
            <div className="modal-body">
              <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
                <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#dbeafe', color: '#1d4ed8', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 0.75rem' }}>
                  <Radio size={28} />
                </div>
                <h4 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--forest-900)' }}>
                  Transmit Real-Time Vehicle GPS
                </h4>
                <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                  Live location coordinates will be securely transmitted to Municipal Fleet Operations while your route run is active.
                </p>
              </div>

              <div style={{ background: '#f8fafc', padding: '0.85rem', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '0.82rem', color: 'var(--text-main)', marginBottom: '1rem' }}>
                <ul style={{ paddingLeft: '1.25rem', margin: 0 }}>
                  <li style={{ marginBottom: '0.35rem' }}>Provides citizen arrival times (ETA) for collection points along your route.</li>
                  <li style={{ marginBottom: '0.35rem' }}>Enables operations to dispatch roadside assistance if a breakdown or blockage occurs.</li>
                  <li style={{ marginBottom: '0.35rem' }}>GPS updates automatically conclude when you tap <strong>Finish Route</strong>.</li>
                  <li><strong>Notice:</strong> Keep this browser tab open during active runs to prevent device sleep from pausing location updates.</li>
                </ul>
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => confirmStartRouteRun(false)} className="btn btn-secondary">
                Start Without GPS
              </button>
              <button onClick={() => confirmStartRouteRun(true)} className="btn btn-primary">
                Enable GPS & Begin Run
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
