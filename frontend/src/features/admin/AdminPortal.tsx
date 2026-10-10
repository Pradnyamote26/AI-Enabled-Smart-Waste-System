import React, { useState, useEffect, useMemo } from 'react';
import {
  LayoutDashboard,
  Truck,
  Trash2,
  Building,
  Calendar,
  AlertTriangle,
  FileCheck,
  History,
  QrCode,
  Sparkles,
  Plus,
  Play,
  CheckCircle,
  Eye,
  Download,
  Search,
  RefreshCw,
  UserCheck,
  Lock,
  Unlock,
  ArrowUp,
  ArrowDown,
  X,
  Printer,
  ChevronRight,
  ShieldAlert,
  AlertCircle,
  Compass,
  UserX,
  RotateCcw,
  Menu,
  MessageSquare,
  Radio
} from 'lucide-react';
import { api } from '../../services/api';
import { MapComponent } from '../../components/MapComponent';
import type { MapMarkerItem } from '../../components/MapComponent';

export const AdminPortal: React.FC = () => {
  // Navigation
  const [activeTab, setActiveTab] = useState<
    'overview' | 'reports' | 'fleet' | 'infrastructure' | 'qr-studio' | 'schedules' | 'routes' | 'proofs' | 'complaints' | 'audit' | 'driver-issues' | 'live-tracking' | 'ai-ops'
  >('overview');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Sub-tabs
  const [fleetSubTab, setFleetSubTab] = useState<'vehicles' | 'drivers'>('vehicles');
  const [infraSubTab, setInfraSubTab] = useState<'buildings' | 'dustbins'>('buildings');

  // AI Ops & Diagnostic State
  const [aiInsights, setAiInsights] = useState<any | null>(null);
  const [isLoadingAiInsights, setIsLoadingAiInsights] = useState(false);
  const [aiModelInfo, setAiModelInfo] = useState<any | null>(null);
  const [aiTestImagePreview, setAiTestImagePreview] = useState<string | null>(null);
  const [aiTestResult, setAiTestResult] = useState<any | null>(null);
  const [isTestingAi, setIsTestingAi] = useState(false);

  // Core Data Lists
  const [analytics, setAnalytics] = useState<any | null>(null);
  const [reports, setReports] = useState<any[]>([]);
  const [reportsTotal, setReportsTotal] = useState(0);
  const [reportsPage, setReportsPage] = useState(1);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [buildings, setBuildings] = useState<any[]>([]);
  const [dustbins, setDustbins] = useState<any[]>([]);
  const [qrCodes, setQrCodes] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [overdueStops, setOverdueStops] = useState<any[]>([]);
  const [routes, setRoutes] = useState<any[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<any | null>(null);
  const [proofs, setProofs] = useState<any[]>([]);
  const [complaints, setComplaints] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [driverIssues, setDriverIssues] = useState<any[]>([]);
  const [driverIssuesFilter, setDriverIssuesFilter] = useState<string>('ALL');
  const [selectedDriverIssueModal, setSelectedDriverIssueModal] = useState<any | null>(null);
  const [issueResponseStatus, setIssueResponseStatus] = useState<'IN_PROGRESS' | 'RESOLVED' | 'CLOSED'>('RESOLVED');
  const [issueResponseNotes, setIssueResponseNotes] = useState<string>('');

  // Live Fleet Tracking State (Phase 3)
  const [liveFleetSessions, setLiveFleetSessions] = useState<any[]>([]);
  const [selectedRouteTrackingDetail, setSelectedRouteTrackingDetail] = useState<any | null>(null);
  const [selectedVehicleSessionId, setSelectedVehicleSessionId] = useState<string | null>(null);
  const [liveFleetFilter, setLiveFleetFilter] = useState<'ALL' | 'STREAMING' | 'STALE'>('ALL');
  const [isLiveTelemetryLoading, setIsLiveTelemetryLoading] = useState(false);

  // Search & Filter State
  const [reportSearch, setReportSearch] = useState('');
  const [reportStatusFilter, setReportStatusFilter] = useState('');
  const [reportTypeFilter, setReportTypeFilter] = useState('');
  const [reportPriorityFilter, setReportPriorityFilter] = useState('');

  const [vehicleSearch, setVehicleSearch] = useState('');
  const [vehicleStatusFilter, setVehicleStatusFilter] = useState('');
  const [driverSearch, setDriverSearch] = useState('');
  const [buildingSearch, setBuildingSearch] = useState('');
  const [dustbinSearch, setDustbinSearch] = useState('');
  const [qrSearch, setQrSearch] = useState('');
  const [qrActiveFilter, setQrActiveFilter] = useState('');

  // UI / Feedback State
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizationWarnings, setOptimizationWarnings] = useState<string[]>([]);

  // Selected Detail View (Drawers)
  const [selectedReportDetail, setSelectedReportDetail] = useState<any | null>(null);

  // Modals
  const [vehicleModal, setVehicleModal] = useState<{ open: boolean; mode: 'add' | 'edit'; data?: any }>({ open: false, mode: 'add' });
  const [driverModal, setDriverModal] = useState<{ open: boolean; mode: 'add' | 'edit'; data?: any }>({ open: false, mode: 'add' });
  const [buildingModal, setBuildingModal] = useState<{ open: boolean; mode: 'add' | 'edit'; data?: any }>({ open: false, mode: 'add' });
  const [dustbinModal, setDustbinModal] = useState<{ open: boolean; mode: 'add' | 'edit'; data?: any }>({ open: false, mode: 'add' });
  const [scheduleModal, setScheduleModal] = useState<{ open: boolean; mode: 'add' | 'edit'; data?: any }>({ open: false, mode: 'add' });
  const [newRouteModal, setNewRouteModal] = useState(false);

  // Action Confirmation & Input Modals
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    message: string;
    confirmText?: string;
    danger?: boolean;
    onConfirm: () => Promise<void>;
  }>({ open: false, title: '', message: '', onConfirm: async () => {} });

  const [reportActionDialog, setReportActionDialog] = useState<{
    open: boolean;
    action: 'REJECT' | 'DUPLICATE' | 'REOPEN' | 'ASSIGN' | 'AI_OVERRIDE';
    reportId: string;
  }>({ open: false, action: 'REJECT', reportId: '' });

  // Dialog Inputs
  const [reasonInput, setReasonInput] = useState('');
  const [assignVehicleId, setAssignVehicleId] = useState('');
  const [assignDriverId, setAssignDriverId] = useState('');
  const [overrideCategory, setOverrideCategory] = useState('');
  const [overridePriority, setOverridePriority] = useState('');
  const [overrideNotes, setOverrideNotes] = useState('');

  // QR Modal
  const [qrModalItem, setQrModalItem] = useState<any | null>(null);

  // Proof Review Modal
  const [proofReviewModal, setProofReviewModal] = useState<any | null>(null);
  const [reviewDecision, setReviewDecision] = useState<'APPROVED' | 'REJECTED'>('APPROVED');
  const [reviewNotes, setReviewNotes] = useState('');

  // Complaint Resolution Modal
  const [complaintModal, setComplaintModal] = useState<any | null>(null);
  const [complaintResolutionStatus, setComplaintResolutionStatus] = useState('RESOLVED');
  const [complaintNote, setComplaintNote] = useState('');

  // Forms State
  const [vehicleForm, setVehicleForm] = useState({ vehicle_number: '', vehicle_type: 'COMPACTOR_TRUCK', capacity_kg: 2500, status: 'AVAILABLE', assigned_driver_id: '', maintenance_status: 'NORMAL' });
  const [driverForm, setDriverForm] = useState({ full_name: '', email: '', phone: '', license_number: '', password: 'driver123', is_active: true });
  const [buildingForm, setBuildingForm] = useState({ name: '', address: '', latitude: 19.0770, longitude: 72.9989, collection_window: '07:00 - 08:30', contact_person: '', contact_phone: '', collection_point_notes: '' });
  const [dustbinForm, setDustbinForm] = useState({ bin_code: '', bin_type: 'GENERAL_MIXED', capacity_liters: 240, latitude: 19.0772, longitude: 72.9991, building_id: '', fill_level_percentage: 0 });
  const [scheduleForm, setScheduleForm] = useState({ title: '', stop_type: 'BUILDING', weekday: 1, shift: 'MORNING', start_window: '06:30:00', end_window: '10:30:00', service_duration_minutes: 15, vehicle_id: '', driver_id: '', building_id: '' });
  const [routeForm, setRouteForm] = useState(() => ({ route_name: '', route_date: new Date().toISOString().split('T')[0], shift: 'MORNING', vehicle_id: '', driver_id: '' }));

  // --------------------------------------------------------------------------
  // Data Fetching
  // --------------------------------------------------------------------------
  const loadReports = async (page = 1) => {
    try {
      const resp = await api.getAdminReports({
        search: reportSearch || undefined,
        status: reportStatusFilter || undefined,
        type: reportTypeFilter || undefined,
        priority: reportPriorityFilter || undefined,
        page,
        per_page: 25
      });
      setReports(resp.reports || []);
      setReportsTotal(resp.total_count || 0);
      setReportsPage(page);
    } catch (err: any) {
      console.error(err);
    }
  };

  const loadRouteDetails = async (routeId: string) => {
    try {
      const data = await api.getRoute(routeId);
      setSelectedRoute(data);
      setOptimizationWarnings([]);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to load route details.');
    }
  };

  const loadAllData = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [
        anData,
        vhData,
        drData,
        bdData,
        dbData,
        qrData,
        scData,
        odData,
        rtData,
        pfData,
        cpData,
        auData,
        diData
      ] = await Promise.all([
        api.getAnalyticsOverview(),
        api.getVehicles(),
        api.getDrivers(),
        api.getBuildings(),
        api.getDustbins(),
        api.getAllQRCodes(),
        api.getSchedules(),
        api.getOverdueCollections(),
        api.getRoutes(),
        api.getProofs(),
        api.getComplaints(),
        api.getAuditLogs(),
        api.getAdminDriverIssues()
      ]);

      setAnalytics(anData);
      setVehicles(vhData);
      setDrivers(drData);
      setBuildings(bdData);
      setDustbins(dbData);
      setQrCodes(qrData);
      setSchedules(scData);
      setOverdueStops(odData);
      setRoutes(rtData);
      setProofs(pfData);
      setComplaints(cpData);
      setAuditLogs(auData);
      setDriverIssues(diData || []);

      await loadReports(1);

      if (rtData.length > 0 && !selectedRoute) {
        loadRouteDetails(rtData[0].id);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to connect to backend operations service.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, []);

  useEffect(() => {
    loadReports(1);
  }, [reportSearch, reportStatusFilter, reportTypeFilter, reportPriorityFilter]);

  const refreshReportDetails = async (id: string) => {
    try {
      const full = await api.getAdminReportDetails(id);
      setSelectedReportDetail(full);
      loadReports(reportsPage);
    } catch (err) {
      console.error(err);
    }
  };

  const loadAiInsights = async () => {
    setIsLoadingAiInsights(true);
    try {
      const [insights, info] = await Promise.all([
        api.getAdminAIInsights(),
        api.getModelInfo()
      ]);
      setAiInsights(insights);
      setAiModelInfo(info);
    } catch (err: any) {
      console.error('Failed to load AI insights:', err);
    } finally {
      setIsLoadingAiInsights(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'ai-ops') {
      loadAiInsights();
    }
  }, [activeTab]);

  // Helper feedback
  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 4000);
  };

  // --------------------------------------------------------------------------
  // Vehicle CRUD Operations
  // --------------------------------------------------------------------------
  const handleOpenAddVehicle = () => {
    setVehicleForm({
      vehicle_number: '',
      vehicle_type: 'COMPACTOR_TRUCK',
      capacity_kg: 2500,
      status: 'AVAILABLE',
      assigned_driver_id: '',
      maintenance_status: 'NORMAL'
    });
    setVehicleModal({ open: true, mode: 'add' });
  };

  const handleOpenEditVehicle = (v: any) => {
    setVehicleForm({
      vehicle_number: v.vehicle_number,
      vehicle_type: v.vehicle_type,
      capacity_kg: v.capacity_kg,
      status: v.status,
      assigned_driver_id: v.assigned_driver_id || '',
      maintenance_status: v.maintenance_status || 'NORMAL'
    });
    setVehicleModal({ open: true, mode: 'edit', data: v });
  };

  const handleSaveVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (vehicleModal.mode === 'add') {
        await api.createVehicle(vehicleForm);
        showSuccess(`Vehicle ${vehicleForm.vehicle_number} registered.`);
      } else {
        await api.updateVehicle(vehicleModal.data.id, vehicleForm);
        showSuccess(`Vehicle ${vehicleForm.vehicle_number} updated.`);
      }
      setVehicleModal({ open: false, mode: 'add' });
      const updated = await api.getVehicles();
      setVehicles(updated);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error saving vehicle.');
    }
  };

  const handleUnassignVehicle = async (vehId: string) => {
    try {
      await api.unassignVehicleDriver(vehId);
      showSuccess('Driver unassigned from vehicle.');
      const updated = await api.getVehicles();
      setVehicles(updated);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error unassigning driver.');
    }
  };

  const handleArchiveVehicle = (v: any) => {
    setConfirmDialog({
      open: true,
      title: 'Archive Vehicle',
      message: `Are you sure you want to deactivate vehicle ${v.vehicle_number}? It will be marked inactive and taken out of dispatch service.`,
      danger: true,
      confirmText: 'Archive Vehicle',
      onConfirm: async () => {
        try {
          await api.deleteVehicle(v.id);
          showSuccess(`Vehicle ${v.vehicle_number} archived.`);
          setConfirmDialog(prev => ({ ...prev, open: false }));
          const updated = await api.getVehicles();
          setVehicles(updated);
        } catch (err: any) {
          setErrorMsg(err.message || 'Failed to archive vehicle.');
        }
      }
    });
  };

  // --------------------------------------------------------------------------
  // Driver CRUD Operations
  // --------------------------------------------------------------------------
  const handleOpenAddDriver = () => {
    setDriverForm({
      full_name: '',
      email: '',
      phone: '',
      license_number: '',
      password: 'driver123',
      is_active: true
    });
    setDriverModal({ open: true, mode: 'add' });
  };

  const handleOpenEditDriver = (d: any) => {
    setDriverForm({
      full_name: d.full_name,
      email: d.email,
      phone: d.phone || '',
      license_number: d.license_number || '',
      password: '',
      is_active: d.is_active
    });
    setDriverModal({ open: true, mode: 'edit', data: d });
  };

  const handleSaveDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (driverModal.mode === 'add') {
        await api.createDriver(driverForm);
        showSuccess(`Driver ${driverForm.full_name} registered.`);
      } else {
        const payload: any = { ...driverForm };
        if (!payload.password) delete payload.password;
        await api.updateDriver(driverModal.data.id, payload);
        showSuccess(`Driver ${driverForm.full_name} updated.`);
      }
      setDriverModal({ open: false, mode: 'add' });
      const updated = await api.getDrivers();
      setDrivers(updated);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error saving driver.');
    }
  };

  const handleArchiveDriver = (d: any) => {
    setConfirmDialog({
      open: true,
      title: 'Archive Driver',
      message: `Deactivate driver ${d.full_name}? They will no longer be able to log in or be assigned to active collection routes.`,
      danger: true,
      confirmText: 'Archive Driver',
      onConfirm: async () => {
        try {
          await api.deleteDriver(d.id);
          showSuccess(`Driver ${d.full_name} archived.`);
          setConfirmDialog(prev => ({ ...prev, open: false }));
          const updated = await api.getDrivers();
          setDrivers(updated);
        } catch (err: any) {
          setErrorMsg(err.message || 'Failed to archive driver.');
        }
      }
    });
  };

  // --------------------------------------------------------------------------
  // Building CRUD Operations
  // --------------------------------------------------------------------------
  const handleOpenAddBuilding = () => {
    setBuildingForm({
      name: '',
      address: '',
      latitude: 19.0770,
      longitude: 72.9989,
      collection_window: '07:00 - 08:30',
      contact_person: '',
      contact_phone: '',
      collection_point_notes: ''
    });
    setBuildingModal({ open: true, mode: 'add' });
  };

  const handleOpenEditBuilding = (b: any) => {
    setBuildingForm({
      name: b.name,
      address: b.address,
      latitude: Number(b.latitude),
      longitude: Number(b.longitude),
      collection_window: b.collection_window || '07:00 - 08:30',
      contact_person: b.contact_person || '',
      contact_phone: b.contact_phone || '',
      collection_point_notes: b.collection_point_notes || ''
    });
    setBuildingModal({ open: true, mode: 'edit', data: b });
  };

  const handleSaveBuilding = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (buildingModal.mode === 'add') {
        await api.createBuilding(buildingForm);
        showSuccess(`Building ${buildingForm.name} registered.`);
      } else {
        await api.updateBuilding(buildingModal.data.id, buildingForm);
        showSuccess(`Building ${buildingForm.name} updated.`);
      }
      setBuildingModal({ open: false, mode: 'add' });
      const updated = await api.getBuildings();
      setBuildings(updated);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error saving building.');
    }
  };

  const handleArchiveBuilding = (b: any) => {
    setConfirmDialog({
      open: true,
      title: 'Archive Building',
      message: `Deactivate ${b.name}? Active collection stops referencing this building will be preserved in history.`,
      danger: true,
      confirmText: 'Archive Building',
      onConfirm: async () => {
        try {
          await api.deleteBuilding(b.id);
          showSuccess(`Building ${b.name} archived.`);
          setConfirmDialog(prev => ({ ...prev, open: false }));
          const updated = await api.getBuildings();
          setBuildings(updated);
        } catch (err: any) {
          setErrorMsg(err.message || 'Failed to archive building.');
        }
      }
    });
  };

  // --------------------------------------------------------------------------
  // Dustbin & QR CRUD Operations
  // --------------------------------------------------------------------------
  const handleOpenAddDustbin = () => {
    setDustbinForm({
      bin_code: '',
      bin_type: 'GENERAL_MIXED',
      capacity_liters: 240,
      latitude: 19.0772,
      longitude: 72.9991,
      building_id: buildings.length > 0 ? buildings[0].id : '',
      fill_level_percentage: 0
    });
    setDustbinModal({ open: true, mode: 'add' });
  };

  const handleOpenEditDustbin = (b: any) => {
    setDustbinForm({
      bin_code: b.bin_code,
      bin_type: b.bin_type,
      capacity_liters: b.capacity_liters || 240,
      latitude: Number(b.latitude),
      longitude: Number(b.longitude),
      building_id: b.building_id || '',
      fill_level_percentage: b.fill_level_percentage || 0
    });
    setDustbinModal({ open: true, mode: 'edit', data: b });
  };

  const handleSaveDustbin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (dustbinModal.mode === 'add') {
        await api.createDustbin(dustbinForm);
        showSuccess(`Dustbin ${dustbinForm.bin_code} registered with new QR token.`);
      } else {
        await api.updateDustbin(dustbinModal.data.id, dustbinForm);
        showSuccess(`Dustbin ${dustbinForm.bin_code} updated.`);
      }
      setDustbinModal({ open: false, mode: 'add' });
      const [updatedBins, updatedQRs] = await Promise.all([api.getDustbins(), api.getAllQRCodes()]);
      setDustbins(updatedBins);
      setQrCodes(updatedQRs);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error saving dustbin.');
    }
  };

  const handleRegenerateQR = async (binId: string, binCode: string) => {
    setConfirmDialog({
      open: true,
      title: 'Regenerate QR Code',
      message: `Regenerate QR code for bin ${binCode}? The old physical sticker code will immediately stop working for public reporting.`,
      danger: true,
      confirmText: 'Regenerate Code',
      onConfirm: async () => {
        try {
          const res = await api.regenerateDustbinQR(binId);
          showSuccess(res.message);
          setConfirmDialog(prev => ({ ...prev, open: false }));
          const [updatedBins, updatedQRs] = await Promise.all([api.getDustbins(), api.getAllQRCodes()]);
          setDustbins(updatedBins);
          setQrCodes(updatedQRs);
          if (qrModalItem && qrModalItem.bin_id === binId) {
            setQrModalItem({ ...qrModalItem, data_uri: res.qr_data.data_uri, qr_public_token: res.qr_data.qr_token });
          }
        } catch (err: any) {
          setErrorMsg(err.message || 'Failed to regenerate QR code.');
        }
      }
    });
  };

  const handleToggleQRActive = async (binId: string) => {
    try {
      const res = await api.toggleDustbinQR(binId);
      showSuccess(res.message);
      const [updatedBins, updatedQRs] = await Promise.all([api.getDustbins(), api.getAllQRCodes()]);
      setDustbins(updatedBins);
      setQrCodes(updatedQRs);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to toggle QR active state.');
    }
  };

  const handleArchiveDustbin = (b: any) => {
    setConfirmDialog({
      open: true,
      title: 'Archive Dustbin',
      message: `Deactivate dustbin ${b.bin_code}? Its QR code will also be deactivated.`,
      danger: true,
      confirmText: 'Archive Bin',
      onConfirm: async () => {
        try {
          await api.deleteDustbin(b.id);
          showSuccess(`Dustbin ${b.bin_code} archived.`);
          setConfirmDialog(prev => ({ ...prev, open: false }));
          const [updatedBins, updatedQRs] = await Promise.all([api.getDustbins(), api.getAllQRCodes()]);
          setDustbins(updatedBins);
          setQrCodes(updatedQRs);
        } catch (err: any) {
          setErrorMsg(err.message || 'Failed to archive dustbin.');
        }
      }
    });
  };

  const handleDownloadQRPNG = (qrItem: any) => {
    const link = document.createElement('a');
    link.href = qrItem.data_uri;
    link.download = `QR_LABEL_${qrItem.bin_code}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showSuccess(`Downloaded QR code for ${qrItem.bin_code}`);
  };

  // --------------------------------------------------------------------------
  // Actionable Waste Reports (Phase 3)
  // --------------------------------------------------------------------------
  const handleOpenReportDetails = async (rep: any) => {
    try {
      const full = await api.getAdminReportDetails(rep.id);
      setSelectedReportDetail(full);
    } catch {
      setSelectedReportDetail(rep);
    }
  };

  const handleApproveReport = async (reportId: string) => {
    try {
      await api.transitionReportStatus(reportId, { status: 'APPROVED' });
      showSuccess('Report approved. You can now assign vehicle & driver or queue for collection.');
      refreshReportDetails(reportId);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to approve report.');
    }
  };

  const handleOpenReportActionModal = (action: 'REJECT' | 'DUPLICATE' | 'REOPEN' | 'ASSIGN' | 'AI_OVERRIDE', reportId: string) => {
    setReportActionDialog({ open: true, action, reportId });
    setReasonInput('');
    setAssignVehicleId(vehicles.find(v => v.status === 'AVAILABLE')?.id || '');
    setAssignDriverId(drivers.find(d => d.is_active)?.id || '');
    if (selectedReportDetail?.ai_analysis?.result) {
      setOverrideCategory(selectedReportDetail.ai_analysis.result.primary_material || 'GENERAL_MIXED');
      setOverridePriority(selectedReportDetail.priority || 'MEDIUM');
    } else {
      setOverrideCategory('GENERAL_MIXED');
      setOverridePriority('MEDIUM');
    }
    setOverrideNotes('');
  };

  const handleExecuteReportAction = async (e: React.FormEvent) => {
    e.preventDefault();
    const { action, reportId } = reportActionDialog;

    try {
      if (action === 'REJECT') {
        if (!reasonInput.trim()) {
          setErrorMsg('Rejection reason is mandatory.');
          return;
        }
        await api.transitionReportStatus(reportId, { status: 'REJECTED', reason: reasonInput });
        showSuccess('Report rejected with recorded rationale.');
      } else if (action === 'DUPLICATE') {
        if (!reasonInput.trim()) {
          setErrorMsg('Duplicate note/reference is mandatory.');
          return;
        }
        await api.transitionReportStatus(reportId, { status: 'DUPLICATE', reason: reasonInput });
        showSuccess('Report marked as duplicate.');
      } else if (action === 'REOPEN') {
        if (!reasonInput.trim()) {
          setErrorMsg('Reopening reason is mandatory.');
          return;
        }
        await api.transitionReportStatus(reportId, { status: 'REOPENED', reason: reasonInput });
        showSuccess('Report reopened and returned to active review queue.');
      } else if (action === 'ASSIGN') {
        const resp = await api.assignReportCrew(reportId, {
          vehicle_id: assignVehicleId || undefined,
          driver_id: assignDriverId || undefined,
          queue_if_unavailable: true
        });
        showSuccess(resp.message);
      } else if (action === 'AI_OVERRIDE') {
        await api.overrideReportAI(reportId, {
          category: overrideCategory,
          priority: overridePriority,
          notes: overrideNotes
        });
        showSuccess(`AI classification updated to ${overrideCategory}.`);
      }

      setReportActionDialog(prev => ({ ...prev, open: false }));
      refreshReportDetails(reportId);
    } catch (err: any) {
      setErrorMsg(err.message || 'Operation failed.');
    }
  };

  // --------------------------------------------------------------------------
  // Schedules CRUD Operations (Phase 4)
  // --------------------------------------------------------------------------
  const handleOpenAddSchedule = () => {
    setScheduleForm({
      title: '',
      stop_type: 'BUILDING',
      weekday: 1,
      shift: 'MORNING',
      start_window: '06:30:00',
      end_window: '10:30:00',
      service_duration_minutes: 15,
      vehicle_id: vehicles.length > 0 ? vehicles[0].id : '',
      driver_id: drivers.length > 0 ? drivers[0].id : '',
      building_id: buildings.length > 0 ? buildings[0].id : ''
    });
    setScheduleModal({ open: true, mode: 'add' });
  };

  const handleSaveSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (scheduleModal.mode === 'add') {
        await api.createSchedule(scheduleForm);
        showSuccess(`Schedule '${scheduleForm.title}' created.`);
      } else {
        await api.updateSchedule(scheduleModal.data.id, scheduleForm);
        showSuccess(`Schedule '${scheduleForm.title}' updated.`);
      }
      setScheduleModal({ open: false, mode: 'add' });
      const updated = await api.getSchedules();
      setSchedules(updated);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error saving collection schedule.');
    }
  };

  const handleArchiveSchedule = (s: any) => {
    setConfirmDialog({
      open: true,
      title: 'Archive Schedule',
      message: `Deactivate recurring schedule '${s.title}'?`,
      danger: true,
      confirmText: 'Archive Schedule',
      onConfirm: async () => {
        try {
          await api.deleteSchedule(s.id);
          showSuccess(`Schedule '${s.title}' archived.`);
          setConfirmDialog(prev => ({ ...prev, open: false }));
          const updated = await api.getSchedules();
          setSchedules(updated);
        } catch (err: any) {
          setErrorMsg(err.message || 'Failed to archive schedule.');
        }
      }
    });
  };

  // --------------------------------------------------------------------------
  // Route Operations (Phase 4)
  // --------------------------------------------------------------------------
  const handleCreateRoute = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const created = await api.createRoute(routeForm);
      showSuccess(`Route '${created.route_name}' created.`);
      setNewRouteModal(false);
      const updated = await api.getRoutes();
      setRoutes(updated);
      loadRouteDetails(created.id);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to create route.');
    }
  };

  const handleAddStopToCurrentRoute = async (type: 'BUILDING' | 'DUSTBIN', id: string) => {
    if (!selectedRoute) return;
    try {
      await api.addStop(selectedRoute.id, {
        stop_type: type,
        building_id: type === 'BUILDING' ? id : undefined,
        dustbin_id: type === 'DUSTBIN' ? id : undefined,
        photo_required: false
      });
      showSuccess('Stop added to route.');
      loadRouteDetails(selectedRoute.id);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to add stop.');
    }
  };

  const handleOptimizeRoute = async () => {
    if (!selectedRoute) return;
    setIsOptimizing(true);
    setOptimizationWarnings([]);
    try {
      const res = await api.optimizeRoute(selectedRoute.id);
      showSuccess('Route sequence optimized using road network distance matrix.');
      if (res.warnings) setOptimizationWarnings(res.warnings);
      loadRouteDetails(selectedRoute.id);
    } catch (err: any) {
      setErrorMsg(err.message || 'Optimization failed.');
    } finally {
      setIsOptimizing(false);
    }
  };

  const handlePublishRoute = async () => {
    if (!selectedRoute) return;
    try {
      await api.publishRoute(selectedRoute.id);
      showSuccess(`Route '${selectedRoute.route_name}' published and dispatched to driver.`);
      loadRouteDetails(selectedRoute.id);
      const updated = await api.getRoutes();
      setRoutes(updated);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to publish route.');
    }
  };

  const handleCancelRoute = (route: any) => {
    setConfirmDialog({
      open: true,
      title: 'Cancel Active Route',
      message: `Cancel route '${route.route_name}'? The assigned vehicle will be released to available fleet.`,
      danger: true,
      confirmText: 'Cancel Route',
      onConfirm: async () => {
        try {
          await api.cancelRoute(route.id, 'Cancelled via Admin Operations');
          showSuccess(`Route '${route.route_name}' cancelled.`);
          setConfirmDialog(prev => ({ ...prev, open: false }));
          loadRouteDetails(route.id);
          const updated = await api.getRoutes();
          setRoutes(updated);
        } catch (err: any) {
          setErrorMsg(err.message || 'Failed to cancel route.');
        }
      }
    });
  };

  const handleMoveStop = async (stopId: string, direction: 'UP' | 'DOWN') => {
    if (!selectedRoute || !selectedRoute.stops) return;
    const stopsList = [...selectedRoute.stops];
    const index = stopsList.findIndex(s => s.id === stopId);
    if (index < 0) return;
    if (direction === 'UP' && index === 0) return;
    if (direction === 'DOWN' && index === stopsList.length - 1) return;

    const targetIndex = direction === 'UP' ? index - 1 : index + 1;
    const temp = stopsList[index];
    stopsList[index] = stopsList[targetIndex];
    stopsList[targetIndex] = temp;

    const stopIds = stopsList.map(s => s.id);
    try {
      await api.reorderRouteStops(selectedRoute.id, stopIds);
      loadRouteDetails(selectedRoute.id);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to reorder stops.');
    }
  };

  const handleToggleStopLock = async (stopId: string) => {
    if (!selectedRoute) return;
    try {
      await api.toggleStopLock(selectedRoute.id, stopId);
      loadRouteDetails(selectedRoute.id);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to toggle stop lock.');
    }
  };

  const handleRemoveStop = async (stopId: string) => {
    if (!selectedRoute) return;
    try {
      await api.removeStop(selectedRoute.id, stopId);
      showSuccess('Stop removed.');
      loadRouteDetails(selectedRoute.id);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to remove stop.');
    }
  };

  // --------------------------------------------------------------------------
  // Proof Reviews & AI Verification (Phase 5)
  // --------------------------------------------------------------------------
  const handleReviewProofSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!proofReviewModal) return;
    try {
      await api.reviewProof(proofReviewModal.id, {
        decision: reviewDecision,
        notes: reviewNotes
      });
      showSuccess(`Proof marked ${reviewDecision}.`);
      setProofReviewModal(null);
      const updated = await api.getProofs();
      setProofs(updated);
      loadAllData();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error submitting proof decision.');
    }
  };

  // --------------------------------------------------------------------------
  // Complaints Resolution (Phase 5)
  // --------------------------------------------------------------------------
  const handleResolveComplaintSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!complaintModal) return;
    try {
      await api.resolveComplaint(complaintModal.id, {
        status: complaintResolutionStatus,
        resolution_note: complaintNote
      });
      showSuccess(`Complaint ${complaintModal.complaint_number} updated to ${complaintResolutionStatus}.`);
      setComplaintModal(null);
      const updated = await api.getComplaints();
      setComplaints(updated);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update complaint.');
    }
  };

  // --------------------------------------------------------------------------
  // Driver Issues Response (Phase Driver Integration)
  // --------------------------------------------------------------------------
  const handleRespondDriverIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDriverIssueModal) return;
    try {
      await api.respondAdminDriverIssue(selectedDriverIssueModal.id, {
        status: issueResponseStatus,
        admin_response: issueResponseNotes
      });
      showSuccess(`Response sent to driver ${selectedDriverIssueModal.driver_name || 'Rajesh'}.`);
      setSelectedDriverIssueModal(null);
      setIssueResponseNotes('');
      const updated = await api.getAdminDriverIssues();
      setDriverIssues(updated);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to submit driver issue response.');
    }
  };

  const openDriverIssuesCount = useMemo(() => {
    return driverIssues.filter(i => i.status === 'OPEN' || i.status === 'IN_PROGRESS').length;
  }, [driverIssues]);

  // --------------------------------------------------------------------------
  // Live Fleet Tracking Operations (Phase 3)
  // --------------------------------------------------------------------------
  const loadLiveFleet = async () => {
    try {
      const res = await api.getAdminLiveFleetTracking();
      setLiveFleetSessions(res.sessions || []);
    } catch (err) {
      console.warn('Failed to load live fleet tracking:', err);
    }
  };

  useEffect(() => {
    if (activeTab === 'live-tracking') {
      loadLiveFleet();
      const interval = setInterval(loadLiveFleet, 8000);
      return () => clearInterval(interval);
    }
  }, [activeTab]);

  const handleSelectTrackedVehicle = async (session: any) => {
    setSelectedVehicleSessionId(session.session_id);
    setIsLiveTelemetryLoading(true);
    try {
      const detail = await api.getAdminRouteTracking(session.route_id);
      setSelectedRouteTrackingDetail(detail);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to load route tracking details.');
    } finally {
      setIsLiveTelemetryLoading(false);
    }
  };

  const activeTrackingCount = useMemo(() => {
    return liveFleetSessions.filter(s => !s.is_stale).length;
  }, [liveFleetSessions]);

  const liveTrackingMarkers = useMemo<MapMarkerItem[]>(() => {
    const markers: MapMarkerItem[] = [];

    // Stops of selected inspected route
    if (selectedRouteTrackingDetail?.stops) {
      selectedRouteTrackingDetail.stops.forEach((st: any) => {
        markers.push({
          id: `stop-${st.id}`,
          lat: Number(st.latitude) || 19.076,
          lng: Number(st.longitude) || 72.997,
          title: `${st.sequence_number}. ${st.target_name || st.stop_type}`,
          subtitle: st.estimated_arrival_minutes ? `ETA: ~${st.estimated_arrival_minutes}m` : st.scheduled_window,
          type: (st.status === 'COMPLETED' ? 'BIN' : st.status === 'STARTED' ? 'STOP' : 'PIN') as any,
          badgeNumber: st.sequence_number
        });
      });
    }

    // Vehicle positions
    liveFleetSessions.forEach((s) => {
      if (s.current_latitude && s.current_longitude) {
        markers.push({
          id: `veh-${s.session_id}`,
          lat: Number(s.current_latitude),
          lng: Number(s.current_longitude),
          title: `${s.vehicle_number} (${s.driver_name})`,
          subtitle: s.next_stop?.name ? `Next: ${s.next_stop.name} (${s.next_stop.eta_minutes ? `~${s.next_stop.eta_minutes}m` : 'Calculating'})` : s.route_name,
          type: 'VEHICLE'
        });
      }
    });

    return markers;
  }, [liveFleetSessions, selectedRouteTrackingDetail]);

  const liveTrackingPolyline = useMemo<[number, number][]>(() => {
    if (selectedRouteTrackingDetail?.breadcrumbs && selectedRouteTrackingDetail.breadcrumbs.length > 1) {
      return selectedRouteTrackingDetail.breadcrumbs.map((b: any) => [b.lat, b.lng]);
    }
    if (selectedRouteTrackingDetail?.stops && selectedRouteTrackingDetail.stops.length > 1) {
      return selectedRouteTrackingDetail.stops
        .filter((s: any) => s.latitude && s.longitude)
        .map((s: any) => [Number(s.latitude), Number(s.longitude)]);
    }
    return [];
  }, [selectedRouteTrackingDetail]);

  // --------------------------------------------------------------------------
  // Leaflet Map Markers Memoization
  // --------------------------------------------------------------------------
  const routeMarkers = useMemo<MapMarkerItem[]>(() => {
    if (!selectedRoute || !selectedRoute.stops) return [];
    return selectedRoute.stops.map((stop: any) => ({
      id: stop.id,
      lat: Number(stop.latitude) || 19.076,
      lng: Number(stop.longitude) || 72.997,
      title: `${stop.sequence_number}. ${stop.target_name || stop.stop_type}`,
      subtitle: stop.scheduled_window,
      type: (stop.stop_type === 'COMPLAINT_REPORT' ? 'REPORT' : stop.stop_type === 'DUSTBIN' ? 'BIN' : 'STOP') as any,
      badgeNumber: stop.sequence_number
    }));
  }, [selectedRoute]);

  // Filtered lists
  const filteredVehicles = useMemo(() => {
    return vehicles.filter(v => {
      const matchSearch = !vehicleSearch || v.vehicle_number.toLowerCase().includes(vehicleSearch.toLowerCase());
      const matchStatus = !vehicleStatusFilter || v.status === vehicleStatusFilter;
      return matchSearch && matchStatus;
    });
  }, [vehicles, vehicleSearch, vehicleStatusFilter]);

  const filteredDrivers = useMemo(() => {
    return drivers.filter(d => {
      return !driverSearch || d.full_name.toLowerCase().includes(driverSearch.toLowerCase()) || d.email.toLowerCase().includes(driverSearch.toLowerCase());
    });
  }, [drivers, driverSearch]);

  const filteredBuildings = useMemo(() => {
    return buildings.filter(b => {
      return !buildingSearch || b.name.toLowerCase().includes(buildingSearch.toLowerCase()) || b.address.toLowerCase().includes(buildingSearch.toLowerCase());
    });
  }, [buildings, buildingSearch]);

  const filteredDustbins = useMemo(() => {
    return dustbins.filter(b => {
      return !dustbinSearch || b.bin_code.toLowerCase().includes(dustbinSearch.toLowerCase()) || (b.building_name && b.building_name.toLowerCase().includes(dustbinSearch.toLowerCase()));
    });
  }, [dustbins, dustbinSearch]);

  const filteredQRCodes = useMemo(() => {
    return qrCodes.filter(q => {
      const matchSearch = !qrSearch || q.bin_code.toLowerCase().includes(qrSearch.toLowerCase()) || q.building_name.toLowerCase().includes(qrSearch.toLowerCase());
      const matchActive = qrActiveFilter === '' ? true : qrActiveFilter === 'ACTIVE' ? q.qr_active : !q.qr_active;
      return matchSearch && matchActive;
    });
  }, [qrCodes, qrSearch, qrActiveFilter]);

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------
  return (
    <div className="admin-portal-wrapper">
      {/* Toast notifications */}
      {errorMsg && (
        <div style={{ position: 'fixed', top: '1rem', right: '1rem', zIndex: 3000, background: '#fee2e2', border: '1px solid #ef4444', color: '#991b1b', padding: '0.85rem 1.25rem', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '0.5rem', boxShadow: 'var(--shadow-lg)' }}>
          <AlertCircle size={18} />
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', marginLeft: '0.5rem', color: '#991b1b' }}><X size={16} /></button>
        </div>
      )}
      {successMsg && (
        <div style={{ position: 'fixed', top: '1rem', right: '1rem', zIndex: 3000, background: '#dcfce7', border: '1px solid #22c55e', color: '#166534', padding: '0.85rem 1.25rem', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '0.5rem', boxShadow: 'var(--shadow-lg)' }}>
          <CheckCircle size={18} />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Mobile Sidebar Backdrop */}
      {mobileSidebarOpen && (
        <div
          className="admin-sidebar-backdrop"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      {/* Main Admin Navigation Sidebar */}
      <aside className={`admin-sidebar ${mobileSidebarOpen ? 'mobile-open' : ''}`}>
        <div style={{ padding: '0 0.5rem 1.25rem 0.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)', marginBottom: '1rem', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.25rem' }}>
              <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: '#a7f3d0', fontWeight: 700, letterSpacing: '0.06em' }}>
                Municipal Command
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.68rem', color: '#6ee7b7', fontWeight: 600 }}>
                <span className="live-pulse-dot" /> LIVE
              </span>
            </div>
            <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#ffffff' }}>Operations Control</div>
          </div>
          <button
            onClick={() => setMobileSidebarOpen(false)}
            className="mobile-sidebar-close-btn"
            aria-label="Close sidebar"
          >
            <X size={18} />
          </button>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <button
            onClick={() => { setActiveTab('overview'); setMobileSidebarOpen(false); }}
            className={`admin-nav-item ${activeTab === 'overview' ? 'active' : ''}`}
          >
            <LayoutDashboard size={18} />
            <span style={{ flex: 1 }}>Dashboard Overview</span>
          </button>

          <button
            onClick={() => { setActiveTab('reports'); setMobileSidebarOpen(false); }}
            className={`admin-nav-item ${activeTab === 'reports' ? 'active' : ''}`}
          >
            <AlertTriangle size={18} />
            <span style={{ flex: 1 }}>Waste Reports</span>
            {reportsTotal > 0 && (
              <span style={{ background: 'rgba(255,255,255,0.18)', color: '#fff', fontSize: '0.72rem', fontWeight: 700, padding: '0.1rem 0.45rem', borderRadius: '10px' }}>
                {reportsTotal}
              </span>
            )}
          </button>

          <button
            onClick={() => { setActiveTab('fleet'); setMobileSidebarOpen(false); }}
            className={`admin-nav-item ${activeTab === 'fleet' ? 'active' : ''}`}
          >
            <Truck size={18} />
            <span style={{ flex: 1 }}>Fleet & Personnel</span>
          </button>

          <button
            onClick={() => { setActiveTab('infrastructure'); setMobileSidebarOpen(false); }}
            className={`admin-nav-item ${activeTab === 'infrastructure' ? 'active' : ''}`}
          >
            <Building size={18} />
            <span style={{ flex: 1 }}>Buildings & Dustbins</span>
          </button>

          <button
            onClick={() => { setActiveTab('qr-studio'); setMobileSidebarOpen(false); }}
            className={`admin-nav-item ${activeTab === 'qr-studio' ? 'active' : ''}`}
          >
            <QrCode size={18} />
            <span style={{ flex: 1 }}>QR Code Studio</span>
          </button>

          <button
            onClick={() => { setActiveTab('schedules'); setMobileSidebarOpen(false); }}
            className={`admin-nav-item ${activeTab === 'schedules' ? 'active' : ''}`}
          >
            <Calendar size={18} />
            <span style={{ flex: 1 }}>Collection Schedules</span>
          </button>

          <button
            onClick={() => { setActiveTab('routes'); setMobileSidebarOpen(false); }}
            className={`admin-nav-item ${activeTab === 'routes' ? 'active' : ''}`}
          >
            <Compass size={18} />
            <span style={{ flex: 1 }}>Route Planner & Dispatch</span>
          </button>

          <button
            onClick={() => { setActiveTab('proofs'); setMobileSidebarOpen(false); }}
            className={`admin-nav-item ${activeTab === 'proofs' ? 'active' : ''}`}
          >
            <FileCheck size={18} />
            <span style={{ flex: 1 }}>Proof & AI Verification</span>
            {Boolean(analytics?.pending_proof_reviews_count > 0) && (
              <span style={{ background: '#7c3aed', color: '#fff', fontSize: '0.7rem', fontWeight: 800, padding: '0.1rem 0.45rem', borderRadius: '10px' }}>
                {analytics.pending_proof_reviews_count}
              </span>
            )}
          </button>

          <button
            onClick={() => { setActiveTab('complaints'); setMobileSidebarOpen(false); }}
            className={`admin-nav-item ${activeTab === 'complaints' ? 'active' : ''}`}
          >
            <ShieldAlert size={18} />
            <span style={{ flex: 1 }}>Citizen Complaints</span>
            {Boolean(analytics?.unresolved_complaints_count > 0) && (
              <span style={{ background: '#ef4444', color: '#fff', fontSize: '0.7rem', fontWeight: 800, padding: '0.1rem 0.45rem', borderRadius: '10px' }}>
                {analytics.unresolved_complaints_count}
              </span>
            )}
          </button>

          <button
            onClick={() => { setActiveTab('audit'); setMobileSidebarOpen(false); }}
            className={`admin-nav-item ${activeTab === 'audit' ? 'active' : ''}`}
          >
            <History size={18} />
            <span style={{ flex: 1 }}>System Audit Trail</span>
          </button>

          <button
            onClick={() => { setActiveTab('driver-issues'); setMobileSidebarOpen(false); }}
            className={`admin-nav-item ${activeTab === 'driver-issues' ? 'active' : ''}`}
          >
            <MessageSquare size={18} />
            <span style={{ flex: 1 }}>Driver Support Issues</span>
            {openDriverIssuesCount > 0 && (
              <span style={{ background: '#f59e0b', color: '#fff', fontSize: '0.7rem', fontWeight: 800, padding: '0.1rem 0.45rem', borderRadius: '10px' }}>
                {openDriverIssuesCount}
              </span>
            )}
          </button>

          <button
            onClick={() => { setActiveTab('live-tracking'); setMobileSidebarOpen(false); }}
            className={`admin-nav-item ${activeTab === 'live-tracking' ? 'active' : ''}`}
          >
            <Radio size={18} />
            <span style={{ flex: 1 }}>Live Fleet Tracking</span>
            {activeTrackingCount > 0 && (
              <span style={{ background: '#10b981', color: '#fff', fontSize: '0.7rem', fontWeight: 800, padding: '0.1rem 0.45rem', borderRadius: '10px' }}>
                {activeTrackingCount} LIVE
              </span>
            )}
          </button>

          <button
            onClick={() => { setActiveTab('ai-ops'); setMobileSidebarOpen(false); }}
            className={`admin-nav-item ${activeTab === 'ai-ops' ? 'active' : ''}`}
          >
            <Sparkles size={18} />
            <span style={{ flex: 1 }}>AI Ops & Diagnostics</span>
          </button>
        </nav>

        <div style={{ marginTop: 'auto', paddingTop: '1.5rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          <button onClick={loadAllData} className="btn btn-sm btn-outline" style={{ width: '100%', color: '#fff', borderColor: 'rgba(255,255,255,0.3)', justifyContent: 'center' }}>
            <RefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh Live Data
          </button>
        </div>
      </aside>

      {/* Main Content Viewport */}
      <main className="admin-content-area">
        {/* Mobile Header Bar & Responsive Tab Ribbon */}
        <div className="admin-mobile-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <button
              onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}
              className="btn btn-sm btn-outline mobile-modules-toggle-btn"
              aria-label="Toggle navigation drawer"
            >
              <Menu size={16} />
              <span>Modules</span>
            </button>
            <div className="admin-mobile-active-label">
              {activeTab === 'overview' && 'Dashboard Overview'}
              {activeTab === 'reports' && `Waste Reports (${reportsTotal})`}
              {activeTab === 'fleet' && 'Fleet & Drivers'}
              {activeTab === 'infrastructure' && 'Buildings & Dustbins'}
              {activeTab === 'qr-studio' && 'QR Code Studio'}
              {activeTab === 'schedules' && 'Collection Schedules'}
              {activeTab === 'routes' && 'Route Dispatch'}
              {activeTab === 'proofs' && 'Proof Review'}
              {activeTab === 'complaints' && 'Citizen Complaints'}
              {activeTab === 'audit' && 'Audit Trail'}
              {activeTab === 'driver-issues' && `Driver Issues (${openDriverIssuesCount})`}
              {activeTab === 'live-tracking' && `Live Fleet (${activeTrackingCount})`}
            </div>
          </div>

          <button onClick={loadAllData} className="btn btn-sm btn-secondary" style={{ padding: '0.45rem 0.75rem' }} title="Refresh live telemetry">
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
          </button>
        </div>

        {/* Quick Horizontal Scrollable Tab Ribbon on Mobile/Tablet */}
        <div className="admin-mobile-pills-bar">
          <button onClick={() => { setActiveTab('overview'); setMobileSidebarOpen(false); }} className={`mobile-pill ${activeTab === 'overview' ? 'active' : ''}`}>
            Dashboard
          </button>
          <button onClick={() => { setActiveTab('live-tracking'); setMobileSidebarOpen(false); }} className={`mobile-pill ${activeTab === 'live-tracking' ? 'active' : ''}`}>
            Live Fleet {activeTrackingCount > 0 ? `(${activeTrackingCount})` : ''}
          </button>
          <button onClick={() => { setActiveTab('reports'); setMobileSidebarOpen(false); }} className={`mobile-pill ${activeTab === 'reports' ? 'active' : ''}`}>
            Reports ({reportsTotal})
          </button>
          <button onClick={() => { setActiveTab('fleet'); setMobileSidebarOpen(false); }} className={`mobile-pill ${activeTab === 'fleet' ? 'active' : ''}`}>
            Fleet & Drivers
          </button>
          <button onClick={() => { setActiveTab('infrastructure'); setMobileSidebarOpen(false); }} className={`mobile-pill ${activeTab === 'infrastructure' ? 'active' : ''}`}>
            Buildings & Bins
          </button>
          <button onClick={() => { setActiveTab('qr-studio'); setMobileSidebarOpen(false); }} className={`mobile-pill ${activeTab === 'qr-studio' ? 'active' : ''}`}>
            QR Studio
          </button>
          <button onClick={() => { setActiveTab('schedules'); setMobileSidebarOpen(false); }} className={`mobile-pill ${activeTab === 'schedules' ? 'active' : ''}`}>
            Schedules
          </button>
          <button onClick={() => { setActiveTab('routes'); setMobileSidebarOpen(false); }} className={`mobile-pill ${activeTab === 'routes' ? 'active' : ''}`}>
            Routes
          </button>
          <button onClick={() => { setActiveTab('proofs'); setMobileSidebarOpen(false); }} className={`mobile-pill ${activeTab === 'proofs' ? 'active' : ''}`}>
            Proofs
          </button>
          <button onClick={() => { setActiveTab('complaints'); setMobileSidebarOpen(false); }} className={`mobile-pill ${activeTab === 'complaints' ? 'active' : ''}`}>
            Complaints
          </button>
          <button onClick={() => { setActiveTab('audit'); setMobileSidebarOpen(false); }} className={`mobile-pill ${activeTab === 'audit' ? 'active' : ''}`}>
            Audit
          </button>
          <button onClick={() => { setActiveTab('driver-issues'); setMobileSidebarOpen(false); }} className={`mobile-pill ${activeTab === 'driver-issues' ? 'active' : ''}`}>
            Driver Issues {openDriverIssuesCount > 0 ? `(${openDriverIssuesCount})` : ''}
          </button>
        </div>

        {/* ----------------------------------------------------------------- */}
        {/* 1. DASHBOARD OVERVIEW TAB                                        */}
        {/* ----------------------------------------------------------------- */}
        {activeTab === 'overview' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <div>
                <h1 className="page-title">Municipal Waste Command Center</h1>
                <p className="page-desc" style={{ marginBottom: 0 }}>
                  Real-time operational status across citizen reports, road route dispatch, fleet availability, and collection proofs.
                </p>
              </div>
              <button onClick={loadAllData} className="btn btn-secondary btn-sm">
                <RefreshCw size={14} /> Refresh Metrics
              </button>
            </div>

            {/* Urgent Alerts Banner */}
            {analytics?.urgent_alerts && analytics.urgent_alerts.length > 0 && (
              <div style={{ marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {analytics.urgent_alerts.map((al: any, idx: number) => (
                  <div
                    key={idx}
                    style={{
                      background: al.level === 'DANGER' ? '#fef2f2' : al.level === 'WARNING' ? '#fffbeb' : '#eff6ff',
                      border: `1px solid ${al.level === 'DANGER' ? '#f87171' : al.level === 'WARNING' ? '#fcd34d' : '#93c5fd'}`,
                      borderRadius: 'var(--radius-md)',
                      padding: '0.85rem 1.25rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                      <AlertTriangle size={18} color={al.level === 'DANGER' ? '#b91c1c' : al.level === 'WARNING' ? '#b45309' : '#1d4ed8'} />
                      <strong style={{ fontSize: '0.9rem', color: al.level === 'DANGER' ? '#991b1b' : al.level === 'WARNING' ? '#92400e' : '#1e40af' }}>
                        {al.message}
                      </strong>
                    </div>
                    <button
                      onClick={() => {
                        setActiveTab(al.target_tab);
                        if (al.target_tab === 'reports' && al.filter) setReportStatusFilter(al.filter);
                      }}
                      className="btn btn-sm btn-outline"
                      style={{ fontSize: '0.8rem' }}
                    >
                      Resolve Issue <ChevronRight size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Clickable Metric Statistics Cards */}
            <div className="stat-cards-grid" style={{ marginBottom: '1.75rem' }}>
              <div
                className="stat-card stat-card-clickable"
                onClick={() => { setActiveTab('reports'); setReportStatusFilter(''); }}
                title="Click to view all citizen reports"
              >
                <div className="stat-card-label">OPEN WASTE REPORTS</div>
                <div className="stat-card-value">{analytics?.open_reports_count ?? '--'}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  {analytics?.pending_review_count ?? 0} awaiting admin triage
                </div>
              </div>

              <div
                className="stat-card stat-card-clickable"
                onClick={() => { setActiveTab('reports'); setReportStatusFilter('WAITING_FOR_VEHICLE'); }}
                title="Click to view reports awaiting vehicle assignment"
              >
                <div className="stat-card-label">WAITING FOR VEHICLE</div>
                <div className="stat-card-value" style={{ color: analytics?.waiting_vehicle_count > 0 ? '#b45309' : 'inherit' }}>
                  {analytics?.waiting_vehicle_count ?? '--'}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  Approved but awaiting truck dispatch
                </div>
              </div>

              <div
                className="stat-card stat-card-clickable"
                onClick={() => { setActiveTab('fleet'); setFleetSubTab('vehicles'); setVehicleStatusFilter('AVAILABLE'); }}
                title="Click to view available fleet"
              >
                <div className="stat-card-label">AVAILABLE FLEET</div>
                <div className="stat-card-value">{analytics?.available_vehicles_count ?? '--'}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  Out of {analytics?.total_vehicles ?? 0} active municipal trucks
                </div>
              </div>

              <div
                className="stat-card stat-card-clickable"
                onClick={() => { setActiveTab('routes'); }}
                title="Click to view active route dispatch"
              >
                <div className="stat-card-label">ACTIVE ROAD ROUTES</div>
                <div className="stat-card-value">{analytics?.active_routes_count ?? '--'}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  En route / in progress
                </div>
              </div>

              <div
                className="stat-card stat-card-clickable"
                onClick={() => { setActiveTab('proofs'); }}
                title="Click to review collection photo evidence"
              >
                <div className="stat-card-label">PENDING PROOFS</div>
                <div className="stat-card-value">{analytics?.pending_proof_reviews_count ?? '--'}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  Driver photos requiring AI review
                </div>
              </div>

              <div
                className="stat-card stat-card-clickable"
                onClick={() => { setActiveTab('complaints'); }}
                title="Click to manage citizen missed collection complaints"
              >
                <div className="stat-card-label">MISSED COMPLAINTS</div>
                <div className="stat-card-value" style={{ color: analytics?.unresolved_complaints_count > 0 ? '#b91c1c' : 'inherit' }}>
                  {analytics?.unresolved_complaints_count ?? '--'}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  Public complaints needing resolution
                </div>
              </div>
            </div>

            {/* Quick Activity & Overview Grid */}
            <div className="admin-overview-grid">
              <div style={{ background: '#fff', border: '1px solid #d8e2dc', borderRadius: '12px', padding: '1.4rem', boxShadow: '0 2px 8px rgba(8, 28, 21, 0.04)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.15rem', paddingBottom: '0.65rem', borderBottom: '1px solid #eef2f0' }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--forest-900)', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                    <History size={17} color="var(--forest-700)" /> Recent Municipal Dispatch Activity
                  </h3>
                  <button onClick={() => setActiveTab('audit')} className="btn btn-sm btn-outline" style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem' }}>
                    View Full Audit
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                  {analytics?.recent_activity?.slice(0, 6).map((act: any) => (
                    <div key={act.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.65rem 0.75rem', borderRadius: '8px', background: '#fafcfb', border: '1px solid #eef2f0', fontSize: '0.85rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', flexShrink: 0 }} />
                        <div>
                          <div style={{ fontWeight: 700, color: 'var(--forest-900)', fontSize: '0.85rem' }}>{act.action}</div>
                          <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                            {act.entity_type} • ID: <code style={{ fontSize: '0.75rem', background: '#eef2f0', padding: '0.1rem 0.3rem', borderRadius: '4px' }}>{act.entity_id?.slice(0, 8)}...</code>
                          </div>
                        </div>
                      </div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', fontWeight: 600, background: '#ffffff', padding: '0.2rem 0.5rem', borderRadius: '4px', border: '1px solid #e8edea', flexShrink: 0 }}>
                        {new Date(act.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  ))}
                  {(!analytics?.recent_activity || analytics.recent_activity.length === 0) && (
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', padding: '1rem 0', textAlign: 'center' }}>No recent activities recorded.</p>
                  )}
                </div>
              </div>

              {/* Quick Actions Shortcuts */}
              <div style={{ background: '#fff', border: '1px solid #d8e2dc', borderRadius: '12px', padding: '1.4rem', boxShadow: '0 2px 8px rgba(8, 28, 21, 0.04)' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--forest-900)', marginBottom: '1.15rem', paddingBottom: '0.65rem', borderBottom: '1px solid #eef2f0', margin: 0 }}>
                  Quick Operational Actions
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', marginTop: '1rem' }}>
                  <button onClick={() => { setActiveTab('fleet'); setFleetSubTab('vehicles'); handleOpenAddVehicle(); }} className="quick-action-btn">
                    <div className="quick-action-btn-left">
                      <div className="quick-action-icon-circle"><Plus size={16} /></div>
                      <span>Register New Fleet Vehicle</span>
                    </div>
                    <ChevronRight size={15} color="#85998e" />
                  </button>
                  <button onClick={() => { setActiveTab('fleet'); setFleetSubTab('drivers'); handleOpenAddDriver(); }} className="quick-action-btn">
                    <div className="quick-action-btn-left">
                      <div className="quick-action-icon-circle"><UserCheck size={16} /></div>
                      <span>Register New Driver</span>
                    </div>
                    <ChevronRight size={15} color="#85998e" />
                  </button>
                  <button onClick={() => { setActiveTab('infrastructure'); setInfraSubTab('dustbins'); handleOpenAddDustbin(); }} className="quick-action-btn">
                    <div className="quick-action-btn-left">
                      <div className="quick-action-icon-circle"><QrCode size={16} /></div>
                      <span>Register Dustbin & QR</span>
                    </div>
                    <ChevronRight size={15} color="#85998e" />
                  </button>
                  <button onClick={() => { setActiveTab('routes'); setNewRouteModal(true); }} className="quick-action-btn">
                    <div className="quick-action-btn-left">
                      <div className="quick-action-icon-circle"><Compass size={16} /></div>
                      <span>Create Collection Route</span>
                    </div>
                    <ChevronRight size={15} color="#85998e" />
                  </button>
                  <button onClick={() => { setActiveTab('schedules'); handleOpenAddSchedule(); }} className="quick-action-btn">
                    <div className="quick-action-btn-left">
                      <div className="quick-action-icon-circle"><Calendar size={16} /></div>
                      <span>Add Recurring Schedule</span>
                    </div>
                    <ChevronRight size={15} color="#85998e" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ----------------------------------------------------------------- */}
        {/* 2. ACTIONABLE WASTE REPORTS TAB (PHASE 3)                        */}
        {/* ----------------------------------------------------------------- */}
        {activeTab === 'reports' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <div>
                <h1 className="page-title">Citizen Waste Reports Management</h1>
                <p className="page-desc" style={{ marginBottom: 0 }}>
                  Review, approve, assign to vehicles, or resolve public and citizen reports with real AI diagnostics and mandatory state transitions.
                </p>
              </div>
            </div>

            {/* Search & Filter Bar */}
            <div className="filter-bar">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flex: 1, minWidth: '220px' }}>
                <Search size={16} color="var(--text-muted)" />
                <input
                  type="text"
                  placeholder="Search by Report #, location, description..."
                  value={reportSearch}
                  onChange={e => setReportSearch(e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>

              <select value={reportStatusFilter} onChange={e => setReportStatusFilter(e.target.value)}>
                <option value="">All Statuses</option>
                <option value="SUBMITTED">Submitted</option>
                <option value="PENDING_REVIEW">Pending Review</option>
                <option value="APPROVED">Approved</option>
                <option value="WAITING_FOR_VEHICLE">Waiting for Vehicle</option>
                <option value="ASSIGNED">Assigned</option>
                <option value="IN_COLLECTION">In Collection</option>
                <option value="AWAITING_PROOF_REVIEW">Awaiting Proof Review</option>
                <option value="RESOLVED">Resolved</option>
                <option value="REJECTED">Rejected</option>
                <option value="DUPLICATE">Duplicate</option>
              </select>

              <select value={reportTypeFilter} onChange={e => setReportTypeFilter(e.target.value)}>
                <option value="">All Categories</option>
                <option value="OVERFLOWING_BIN">Overflowing Bin</option>
                <option value="NO_BIN_GARBAGE">No Bin / Open Garbage</option>
                <option value="MISSED_COLLECTION">Missed Collection</option>
                <option value="SCATTERED_WASTE">Scattered Waste</option>
                <option value="ILLEGAL_DUMPING">Illegal Dumping</option>
              </select>

              <select value={reportPriorityFilter} onChange={e => setReportPriorityFilter(e.target.value)}>
                <option value="">All Priorities</option>
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </select>

              {(reportSearch || reportStatusFilter || reportTypeFilter || reportPriorityFilter) && (
                <button
                  onClick={() => { setReportSearch(''); setReportStatusFilter(''); setReportTypeFilter(''); setReportPriorityFilter(''); }}
                  className="btn btn-sm btn-secondary"
                >
                  Clear Filters
                </button>
              )}
            </div>

            {/* Reports Table */}
            <div className="card-table-wrapper">
              <table className="op-table">
                <thead>
                  <tr>
                    <th>Report Ref</th>
                    <th>Type / Category</th>
                    <th>Location / Address</th>
                    <th>AI Classification</th>
                    <th>Priority</th>
                    <th>Current Status</th>
                    <th>Assigned Crew</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((r: any) => (
                    <tr key={r.id}>
                      <td>
                        <strong>{r.report_number}</strong>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-subtle)' }}>
                          {new Date(r.created_at).toLocaleDateString()}
                        </div>
                      </td>
                      <td>
                        <span className="badge badge-neutral">{r.report_type}</span>
                        {r.dustbin_code && <div style={{ fontSize: '0.72rem', color: 'var(--forest-700)', fontWeight: 600 }}>Bin: {r.dustbin_code}</div>}
                      </td>
                      <td style={{ maxWidth: '200px' }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.address_text}>
                          {r.address_text || 'GPS Location'}
                        </div>
                      </td>
                      <td>
                        {r.ai_analysis?.result ? (
                          <span className="badge badge-active" title={`Confidence: ${Math.round(r.ai_analysis.confidence * 100)}%`}>
                            {r.ai_analysis.result.human_corrected ? '✏️ ' : '🤖 '}
                            {r.ai_analysis.result.human_corrected_material || r.ai_analysis.result.primary_material}
                          </span>
                        ) : (
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>No AI scan</span>
                        )}
                      </td>
                      <td>
                        <span className={`badge ${r.priority === 'URGENT' || r.priority === 'HIGH' ? 'badge-danger' : r.priority === 'MEDIUM' ? 'badge-pending' : 'badge-neutral'}`}>
                          {r.priority}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${
                          r.status === 'RESOLVED' ? 'badge-success' :
                          r.status === 'REJECTED' || r.status === 'DUPLICATE' ? 'badge-danger' :
                          r.status === 'WAITING_FOR_VEHICLE' ? 'badge-pending' :
                          r.status === 'ASSIGNED' || r.status === 'IN_COLLECTION' ? 'badge-active' :
                          'badge-neutral'
                        }`}>
                          {r.status}
                        </span>
                      </td>
                      <td>
                        {r.assigned_driver_name ? (
                          <div style={{ fontSize: '0.8rem' }}>
                            <strong>{r.assigned_driver_name}</strong>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{r.assigned_vehicle_number}</div>
                          </div>
                        ) : (
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>Unassigned</span>
                        )}
                      </td>
                      <td>
                        <button
                          onClick={() => handleOpenReportDetails(r)}
                          className="btn btn-sm btn-primary"
                        >
                          <Eye size={14} /> Open Actions
                        </button>
                      </td>
                    </tr>
                  ))}
                  {reports.length === 0 && (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                        <div style={{ marginBottom: '0.5rem', fontSize: '1rem', fontWeight: 600 }}>No reports matching current filters.</div>
                        <p style={{ fontSize: '0.85rem' }}>Incoming reports from citizens will appear here in real-time.</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ----------------------------------------------------------------- */}
        {/* 3. FLEET & DRIVERS MANAGEMENT TAB (PHASE 2)                      */}
        {/* ----------------------------------------------------------------- */}
        {activeTab === 'fleet' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <div>
                <h1 className="page-title">Fleet & Driver Personnel Management</h1>
                <p className="page-desc" style={{ marginBottom: 0 }}>
                  Manage compactor trucks, capacity specs, active driver roster, and double-booking conflict prevention.
                </p>
              </div>
              <div>
                {fleetSubTab === 'vehicles' ? (
                  <button onClick={handleOpenAddVehicle} className="btn btn-primary btn-sm">
                    <Plus size={14} /> Add Vehicle
                  </button>
                ) : (
                  <button onClick={handleOpenAddDriver} className="btn btn-primary btn-sm">
                    <UserCheck size={14} /> Register Driver
                  </button>
                )}
              </div>
            </div>

            {/* Sub-nav */}
            <div className="subnav-tabs">
              <button
                className={`subnav-tab-btn ${fleetSubTab === 'vehicles' ? 'active' : ''}`}
                onClick={() => setFleetSubTab('vehicles')}
              >
                Vehicles Fleet ({vehicles.length})
              </button>
              <button
                className={`subnav-tab-btn ${fleetSubTab === 'drivers' ? 'active' : ''}`}
                onClick={() => setFleetSubTab('drivers')}
              >
                Driver Roster ({drivers.length})
              </button>
            </div>

            {/* Vehicles Table View */}
            {fleetSubTab === 'vehicles' && (
              <div>
                <div className="filter-bar">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flex: 1 }}>
                    <Search size={16} color="var(--text-muted)" />
                    <input
                      type="text"
                      placeholder="Search vehicle registration plate..."
                      value={vehicleSearch}
                      onChange={e => setVehicleSearch(e.target.value)}
                    />
                  </div>
                  <select value={vehicleStatusFilter} onChange={e => setVehicleStatusFilter(e.target.value)}>
                    <option value="">All Operational Statuses</option>
                    <option value="AVAILABLE">Available</option>
                    <option value="ASSIGNED">Assigned</option>
                    <option value="EN_ROUTE">En Route</option>
                    <option value="MAINTENANCE">Under Maintenance</option>
                    <option value="INACTIVE">Inactive</option>
                  </select>
                </div>

                <div className="card-table-wrapper">
                  <table className="op-table">
                    <thead>
                      <tr>
                        <th>Vehicle Plate</th>
                        <th>Type</th>
                        <th>Capacity</th>
                        <th>Operational Status</th>
                        <th>Assigned Driver</th>
                        <th>Active Route</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredVehicles.map(v => (
                        <tr key={v.id}>
                          <td><strong>{v.vehicle_number}</strong></td>
                          <td><span className="badge badge-neutral">{v.vehicle_type}</span></td>
                          <td>{v.capacity_kg} kg</td>
                          <td>
                            <span className={`badge ${v.status === 'AVAILABLE' ? 'badge-success' : v.status === 'MAINTENANCE' ? 'badge-danger' : 'badge-active'}`}>
                              {v.status}
                            </span>
                          </td>
                          <td>
                            {v.driver_name ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                <span>{v.driver_name}</span>
                                <button onClick={() => handleUnassignVehicle(v.id)} className="btn btn-sm btn-secondary" title="Unassign driver" style={{ padding: '0.1rem 0.35rem', fontSize: '0.7rem' }}>
                                  <UserX size={12} />
                                </button>
                              </div>
                            ) : (
                              <span style={{ color: 'var(--text-subtle)' }}>None</span>
                            )}
                          </td>
                          <td>
                            {v.active_route ? (
                              <span style={{ fontSize: '0.8rem', color: 'var(--forest-800)', fontWeight: 600 }}>{v.active_route.route_name}</span>
                            ) : (
                              <span style={{ color: 'var(--text-subtle)' }}>Idle</span>
                            )}
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: '0.4rem' }}>
                              <button onClick={() => handleOpenEditVehicle(v)} className="btn btn-sm btn-outline">Edit</button>
                              <button onClick={() => handleArchiveVehicle(v)} className="btn btn-sm btn-danger">Archive</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {filteredVehicles.length === 0 && (
                        <tr><td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No vehicles found.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Drivers Table View */}
            {fleetSubTab === 'drivers' && (
              <div>
                <div className="filter-bar">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flex: 1 }}>
                    <Search size={16} color="var(--text-muted)" />
                    <input
                      type="text"
                      placeholder="Search driver name or email..."
                      value={driverSearch}
                      onChange={e => setDriverSearch(e.target.value)}
                    />
                  </div>
                </div>

                <div className="card-table-wrapper">
                  <table className="op-table">
                    <thead>
                      <tr>
                        <th>Driver Name</th>
                        <th>Email</th>
                        <th>Phone</th>
                        <th>License #</th>
                        <th>Status</th>
                        <th>Assigned Vehicle</th>
                        <th>Active Route</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredDrivers.map(d => (
                        <tr key={d.id}>
                          <td><strong>{d.full_name}</strong></td>
                          <td>{d.email}</td>
                          <td>{d.phone || '--'}</td>
                          <td>{d.license_number || 'Standard'}</td>
                          <td>
                            <span className={`badge ${d.is_active ? 'badge-success' : 'badge-neutral'}`}>
                              {d.is_active ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td>{d.assigned_vehicle?.vehicle_number || <span style={{ color: 'var(--text-subtle)' }}>None</span>}</td>
                          <td>{d.active_route?.route_name || <span style={{ color: 'var(--text-subtle)' }}>None</span>}</td>
                          <td>
                            <div style={{ display: 'flex', gap: '0.4rem' }}>
                              <button onClick={() => handleOpenEditDriver(d)} className="btn btn-sm btn-outline">Edit</button>
                              <button onClick={() => handleArchiveDriver(d)} className="btn btn-sm btn-danger">Archive</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {filteredDrivers.length === 0 && (
                        <tr><td colSpan={8} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No drivers found.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ----------------------------------------------------------------- */}
        {/* 4. INFRASTRUCTURE: BUILDINGS & DUSTBINS (PHASE 2)                */}
        {/* ----------------------------------------------------------------- */}
        {activeTab === 'infrastructure' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <div>
                <h1 className="page-title">Municipal Infrastructure Assets</h1>
                <p className="page-desc" style={{ marginBottom: 0 }}>
                  Manage registered high-rise societies, commercial complexes, and individual waste collection dustbins.
                </p>
              </div>
              <div>
                {infraSubTab === 'buildings' ? (
                  <button onClick={handleOpenAddBuilding} className="btn btn-primary btn-sm">
                    <Plus size={14} /> Register Building
                  </button>
                ) : (
                  <button onClick={handleOpenAddDustbin} className="btn btn-primary btn-sm">
                    <Plus size={14} /> Register Dustbin
                  </button>
                )}
              </div>
            </div>

            {/* Sub-nav */}
            <div className="subnav-tabs">
              <button
                className={`subnav-tab-btn ${infraSubTab === 'buildings' ? 'active' : ''}`}
                onClick={() => setInfraSubTab('buildings')}
              >
                Registered Buildings & Societies ({buildings.length})
              </button>
              <button
                className={`subnav-tab-btn ${infraSubTab === 'dustbins' ? 'active' : ''}`}
                onClick={() => setInfraSubTab('dustbins')}
              >
                Dustbin Inventory ({dustbins.length})
              </button>
            </div>

            {/* Buildings View */}
            {infraSubTab === 'buildings' && (
              <div>
                <div className="filter-bar">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flex: 1 }}>
                    <Search size={16} color="var(--text-muted)" />
                    <input
                      type="text"
                      placeholder="Search building name or address..."
                      value={buildingSearch}
                      onChange={e => setBuildingSearch(e.target.value)}
                    />
                  </div>
                </div>

                <div className="card-table-wrapper">
                  <table className="op-table">
                    <thead>
                      <tr>
                        <th>Building / Complex</th>
                        <th>Address</th>
                        <th>Morning Window</th>
                        <th>Contact Person</th>
                        <th>Dustbins Linked</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredBuildings.map(b => (
                        <tr key={b.id}>
                          <td><strong>{b.name}</strong></td>
                          <td>{b.address}</td>
                          <td>{b.collection_window}</td>
                          <td>{b.contact_person} ({b.contact_phone})</td>
                          <td><span className="badge badge-neutral">{b.dustbins_count} Bins</span></td>
                          <td>
                            <div style={{ display: 'flex', gap: '0.4rem' }}>
                              <button onClick={() => handleOpenEditBuilding(b)} className="btn btn-sm btn-outline">Edit</button>
                              <button onClick={() => handleArchiveBuilding(b)} className="btn btn-sm btn-danger">Archive</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {filteredBuildings.length === 0 && (
                        <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No buildings registered.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Dustbins View */}
            {infraSubTab === 'dustbins' && (
              <div>
                <div className="filter-bar">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flex: 1 }}>
                    <Search size={16} color="var(--text-muted)" />
                    <input
                      type="text"
                      placeholder="Search bin code or building..."
                      value={dustbinSearch}
                      onChange={e => setDustbinSearch(e.target.value)}
                    />
                  </div>
                </div>

                <div className="card-table-wrapper">
                  <table className="op-table">
                    <thead>
                      <tr>
                        <th>Bin Code</th>
                        <th>Type</th>
                        <th>Capacity</th>
                        <th>Current Fill</th>
                        <th>Linked Building</th>
                        <th>QR Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredDustbins.map(b => (
                        <tr key={b.id}>
                          <td><strong>{b.bin_code}</strong></td>
                          <td><span className="badge badge-neutral">{b.bin_type}</span></td>
                          <td>{b.capacity_liters} L</td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <div style={{ width: '60px', height: '8px', background: '#e4ebe7', borderRadius: '4px', overflow: 'hidden' }}>
                                <div style={{ width: `${b.fill_level_percentage || 0}%`, height: '100%', background: (b.fill_level_percentage || 0) > 75 ? '#dc2626' : 'var(--forest-600)' }} />
                              </div>
                              <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{b.fill_level_percentage || 0}%</span>
                            </div>
                          </td>
                          <td>{b.building_name}</td>
                          <td>
                            <span className={`badge ${b.qr_active ? 'badge-success' : 'badge-danger'}`}>
                              {b.qr_active ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: '0.4rem' }}>
                              <button
                                onClick={async () => {
                                  const qrData = await api.getDustbinQR(b.id);
                                  setQrModalItem({ ...qrData, bin_id: b.id });
                                }}
                                className="btn btn-sm btn-primary"
                              >
                                <QrCode size={14} /> View QR
                              </button>
                              <button onClick={() => handleOpenEditDustbin(b)} className="btn btn-sm btn-outline">Edit</button>
                              <button onClick={() => handleArchiveDustbin(b)} className="btn btn-sm btn-danger">Archive</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {filteredDustbins.length === 0 && (
                        <tr><td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No dustbins registered.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ----------------------------------------------------------------- */}
        {/* 5. DEDICATED QR CODE MANAGEMENT STUDIO (PHASE 2 & AC-ADM-04)     */}
        {/* ----------------------------------------------------------------- */}
        {activeTab === 'qr-studio' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <div>
                <h1 className="page-title">Dustbin QR Code Management Studio</h1>
                <p className="page-desc" style={{ marginBottom: 0 }}>
                  Generate high-contrast public QR labels, download high-res PNGs, produce printable municipal sticker sheets, or regenerate damaged labels.
                </p>
              </div>
            </div>

            {/* Filter Bar */}
            <div className="filter-bar">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flex: 1 }}>
                <Search size={16} color="var(--text-muted)" />
                <input
                  type="text"
                  placeholder="Filter QR codes by bin code or location..."
                  value={qrSearch}
                  onChange={e => setQrSearch(e.target.value)}
                />
              </div>
              <select value={qrActiveFilter} onChange={e => setQrActiveFilter(e.target.value)}>
                <option value="">All Statuses</option>
                <option value="ACTIVE">Active QR Codes</option>
                <option value="INACTIVE">Inactive / Deactivated</option>
              </select>
            </div>

            {/* Grid of QR Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.25rem' }}>
              {filteredQRCodes.map(q => (
                <div key={q.bin_id} style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '1.25rem', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', boxShadow: 'var(--shadow-sm)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: '0.75rem' }}>
                    <span className="badge badge-neutral">{q.bin_type}</span>
                    <span className={`badge ${q.qr_active ? 'badge-success' : 'badge-danger'}`}>
                      {q.qr_active ? 'Active Token' : 'Deactivated'}
                    </span>
                  </div>

                  <img
                    src={q.data_uri}
                    alt={`QR Code ${q.bin_code}`}
                    style={{ width: '160px', height: '160px', borderRadius: '4px', border: '1px solid #e2e8f0', marginBottom: '0.75rem' }}
                  />

                  <strong style={{ fontSize: '1.1rem', color: 'var(--forest-900)' }}>{q.bin_code}</strong>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>{q.building_name}</div>

                  <div style={{ display: 'flex', gap: '0.5rem', width: '100%', marginTop: 'auto' }}>
                    <button
                      onClick={() => handleDownloadQRPNG(q)}
                      className="btn btn-sm btn-outline"
                      style={{ flex: 1 }}
                    >
                      <Download size={14} /> PNG
                    </button>
                    <button
                      onClick={() => setQrModalItem(q)}
                      className="btn btn-sm btn-primary"
                      style={{ flex: 1 }}
                    >
                      <Printer size={14} /> Print Sticker
                    </button>
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem', width: '100%', marginTop: '0.5rem' }}>
                    <button
                      onClick={() => handleRegenerateQR(q.bin_id, q.bin_code)}
                      className="btn btn-sm btn-secondary"
                      style={{ flex: 1, fontSize: '0.75rem' }}
                      title="Invalidates old token and issues fresh code"
                    >
                      <RefreshCw size={12} /> Regenerate
                    </button>
                    <button
                      onClick={() => handleToggleQRActive(q.bin_id)}
                      className="btn btn-sm btn-secondary"
                      style={{ flex: 1, fontSize: '0.75rem' }}
                    >
                      {q.qr_active ? 'Deactivate' : 'Activate'}
                    </button>
                  </div>
                </div>
              ))}
              {filteredQRCodes.length === 0 && (
                <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                  No QR codes matching current filter.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ----------------------------------------------------------------- */}
        {/* 6. COLLECTION SCHEDULES TAB (PHASE 4)                            */}
        {/* ----------------------------------------------------------------- */}
        {activeTab === 'schedules' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <div>
                <h1 className="page-title">Recurring Morning Collection Schedules</h1>
                <p className="page-desc" style={{ marginBottom: 0 }}>
                  Configure weekly collection routines by ward, building, and assigned truck without requiring driver photo evidence for routine visits.
                </p>
              </div>
              <button onClick={handleOpenAddSchedule} className="btn btn-primary btn-sm">
                <Plus size={14} /> Add Recurring Schedule
              </button>
            </div>

            {/* Overdue Collection Alerts Warning Banner */}
            {overdueStops.length > 0 && (
              <div style={{ background: '#fef2f2', border: '1px solid #f87171', borderRadius: 'var(--radius-md)', padding: '1rem 1.25rem', marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#991b1b', fontWeight: 700, marginBottom: '0.4rem' }}>
                  <AlertTriangle size={18} /> {overdueStops.length} Overdue Collection Stop(s) Detected
                </div>
                <div style={{ fontSize: '0.85rem', color: '#7f1d1d' }}>
                  Stops exceeding configured collection windows or reported with skip exceptions require operational recovery.
                </div>
              </div>
            )}

            <div className="card-table-wrapper">
              <table className="op-table">
                <thead>
                  <tr>
                    <th>Schedule Title</th>
                    <th>Weekday</th>
                    <th>Shift & Window</th>
                    <th>Duration</th>
                    <th>Assigned Truck</th>
                    <th>Assigned Driver</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {schedules.map(s => {
                    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                    return (
                      <tr key={s.id}>
                        <td><strong>{s.title}</strong></td>
                        <td><span className="badge badge-active">{days[s.weekday]}</span></td>
                        <td>
                          <div>{s.shift}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{s.start_window} - {s.end_window}</div>
                        </td>
                        <td>{s.service_duration_minutes} mins</td>
                        <td>{s.vehicle_number || <span style={{ color: 'var(--text-subtle)' }}>Auto-assign</span>}</td>
                        <td>{s.driver_name || <span style={{ color: 'var(--text-subtle)' }}>Auto-assign</span>}</td>
                        <td>
                          <span className={`badge ${s.is_active ? 'badge-success' : 'badge-neutral'}`}>
                            {s.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td>
                          <button onClick={() => handleArchiveSchedule(s)} className="btn btn-sm btn-danger">Archive</button>
                        </td>
                      </tr>
                    );
                  })}
                  {schedules.length === 0 && (
                    <tr><td colSpan={8} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>No recurring schedules configured.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ----------------------------------------------------------------- */}
        {/* 7. ROUTE PLANNER & DISPATCH TAB (PHASE 4)                        */}
        {/* ----------------------------------------------------------------- */}
        {activeTab === 'routes' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <div>
                <h1 className="page-title">Route Planner, Distance Matrix & Dispatch</h1>
                <p className="page-desc" style={{ marginBottom: 0 }}>
                  Interactive multi-stop road optimization, manual stop sequencing, stop locking, and driver assignment conflict check.
                </p>
              </div>
              <button onClick={() => setNewRouteModal(true)} className="btn btn-primary btn-sm">
                <Plus size={14} /> New Route Draft
              </button>
            </div>

            {/* Route Selector Bar */}
            <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', paddingBottom: '0.5rem', marginBottom: '1rem' }}>
              {routes.map(r => (
                <button
                  key={r.id}
                  onClick={() => loadRouteDetails(r.id)}
                  style={{
                    padding: '0.6rem 1rem',
                    borderRadius: 'var(--radius-md)',
                    border: selectedRoute?.id === r.id ? '2px solid var(--forest-700)' : '1px solid var(--border-color)',
                    background: selectedRoute?.id === r.id ? 'var(--forest-50)' : '#fff',
                    cursor: 'pointer',
                    textAlign: 'left',
                    minWidth: '180px'
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--forest-900)' }}>{r.route_name}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{r.route_date} • {r.shift}</div>
                  <span className={`badge ${r.status === 'PUBLISHED' ? 'badge-success' : r.status === 'CANCELLED' ? 'badge-danger' : 'badge-active'}`} style={{ marginTop: '0.35rem', fontSize: '9px' }}>
                    {r.status}
                  </span>
                </button>
              ))}
            </div>

            {selectedRoute ? (
              <div className="planner-split" style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '1.25rem' }}>
                {/* Left: Map & Controls */}
                <div>
                  <div style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <strong style={{ fontSize: '1.1rem', color: 'var(--forest-900)' }}>{selectedRoute.route_name}</strong>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        Date: {selectedRoute.route_date} • Shift: {selectedRoute.shift}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      {selectedRoute.status !== 'PUBLISHED' && selectedRoute.status !== 'CANCELLED' && (
                        <>
                          <button
                            onClick={handleOptimizeRoute}
                            disabled={isOptimizing}
                            className="btn btn-sm btn-outline"
                          >
                            <Sparkles size={14} /> {isOptimizing ? 'Optimizing...' : 'Optimize Order'}
                          </button>
                          <button
                            onClick={handlePublishRoute}
                            className="btn btn-sm btn-success"
                          >
                            <Play size={14} /> Publish & Dispatch
                          </button>
                        </>
                      )}
                      {selectedRoute.status !== 'CANCELLED' && (
                        <button onClick={() => handleCancelRoute(selectedRoute)} className="btn btn-sm btn-danger">
                          Cancel Route
                        </button>
                      )}
                    </div>
                  </div>

                  {optimizationWarnings.length > 0 && (
                    <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', padding: '0.65rem 1rem', borderRadius: 'var(--radius-md)', marginBottom: '1rem', fontSize: '0.82rem', color: '#92400e' }}>
                      <strong>Optimization Advisory:</strong>
                      {optimizationWarnings.map((w, i) => <div key={i}>• {w}</div>)}
                    </div>
                  )}

                  <div className="map-container" style={{ marginBottom: '1rem' }}>
                    <MapComponent
                      markers={routeMarkers}
                      polyline={selectedRoute.geometry}
                      height="440px"
                    />
                  </div>

                  {/* Summary Bar */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem', background: '#fff', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '0.85rem' }}>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>DISTANCE</div>
                      <strong>{(selectedRoute.distance_meters / 1000).toFixed(1)} km</strong>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>EST. TRAVEL DURATION</div>
                      <strong>{Math.round(selectedRoute.duration_seconds / 60)} mins</strong>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>ASSIGNED TRUCK</div>
                      <strong>{selectedRoute.vehicle?.vehicle_number || 'Unassigned'}</strong>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>ASSIGNED DRIVER</div>
                      <strong>{selectedRoute.driver?.full_name || 'Unassigned'}</strong>
                    </div>
                  </div>
                </div>

                {/* Right: Ordered Stops & Management */}
                <div style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '1rem', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                    <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--forest-900)' }}>
                      Ordered Stops ({selectedRoute.stops?.length || 0})
                    </h3>
                  </div>

                  <div className="stops-scroll-list" style={{ flex: 1, overflowY: 'auto', maxHeight: '420px', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {selectedRoute.stops?.map((stop: any, idx: number) => (
                      <div key={stop.id} className="stop-item-card" style={{ padding: '0.75rem' }}>
                        <div className="stop-badge-seq">{stop.sequence_number}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <strong style={{ fontSize: '0.88rem', color: 'var(--forest-900)' }}>
                              {stop.target_name || stop.stop_type}
                            </strong>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                              <button
                                onClick={() => handleToggleStopLock(stop.id)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: stop.is_locked ? 'var(--status-danger)' : 'var(--text-subtle)' }}
                                title={stop.is_locked ? 'Sequence locked' : 'Unlocked (auto-optimizable)'}
                              >
                                {stop.is_locked ? <Lock size={14} /> : <Unlock size={14} />}
                              </button>
                              <span className={`badge ${stop.status === 'COMPLETED' ? 'badge-success' : 'badge-neutral'}`} style={{ fontSize: '9px' }}>
                                {stop.status}
                              </span>
                            </div>
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{stop.scheduled_window || 'Morning'}</div>
                          {stop.photo_required && (
                            <div style={{ fontSize: '0.7rem', color: 'var(--status-danger)', fontWeight: 600 }}>★ Photo proof required</div>
                          )}
                        </div>

                        {selectedRoute.status !== 'PUBLISHED' && selectedRoute.status !== 'COMPLETED' && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                            <button onClick={() => handleMoveStop(stop.id, 'UP')} disabled={idx === 0} style={{ padding: '0.1rem', background: '#f1f5f3', border: 'none', borderRadius: '2px', cursor: 'pointer' }}><ArrowUp size={12} /></button>
                            <button onClick={() => handleMoveStop(stop.id, 'DOWN')} disabled={idx === (selectedRoute.stops?.length || 1) - 1} style={{ padding: '0.1rem', background: '#f1f5f3', border: 'none', borderRadius: '2px', cursor: 'pointer' }}><ArrowDown size={12} /></button>
                            <button onClick={() => handleRemoveStop(stop.id)} style={{ padding: '0.1rem', background: '#fee2e2', color: '#991b1b', border: 'none', borderRadius: '2px', cursor: 'pointer' }}><Trash2 size={12} /></button>
                          </div>
                        )}
                      </div>
                    ))}
                    {(!selectedRoute.stops || selectedRoute.stops.length === 0) && (
                      <p style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>No stops added to this route yet.</p>
                    )}
                  </div>

                  {/* Quick Add Stop Buttons */}
                  <div style={{ marginTop: '1rem', borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-subtle)', marginBottom: '0.4rem', textTransform: 'uppercase' }}>
                      Add Location to This Route:
                    </div>
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                      {buildings.slice(0, 4).map(b => (
                        <button
                          key={b.id}
                          onClick={() => handleAddStopToCurrentRoute('BUILDING', b.id)}
                          className="btn btn-sm btn-outline"
                          style={{ fontSize: '0.75rem' }}
                        >
                          + {b.name}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <p style={{ color: 'var(--text-muted)' }}>No route selected.</p>
            )}
          </div>
        )}

        {/* ----------------------------------------------------------------- */}
        {/* 8. PROOF & AI VERIFICATION TAB (PHASE 5)                         */}
        {/* ----------------------------------------------------------------- */}
        {activeTab === 'proofs' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <div>
                <h1 className="page-title">Proof & AI Evidence Verification</h1>
                <p className="page-desc" style={{ marginBottom: 0 }}>
                  Compare driver completion photos against original citizen report pictures. Real AI model suggests cleanliness level.
                </p>
              </div>
            </div>

            <div className="card-table-wrapper">
              <table className="op-table">
                <thead>
                  <tr>
                    <th>Report / Stop</th>
                    <th>Driver</th>
                    <th>Captured Time</th>
                    <th>AI Recommendation</th>
                    <th>Review Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {proofs.map(p => (
                    <tr key={p.id}>
                      <td><strong>{p.report_number || 'Collection Stop'}</strong></td>
                      <td>{p.driver_name}</td>
                      <td>{new Date(p.captured_at).toLocaleTimeString()}</td>
                      <td>
                        {p.ai_comparison_result ? (
                          <span className={`badge ${p.ai_comparison_result.outcome === 'LIKELY_CLEARED' ? 'badge-success' : 'badge-pending'}`}>
                            {p.ai_comparison_result.outcome} ({Math.round(p.ai_comparison_result.confidence * 100)}%)
                          </span>
                        ) : (
                          <span className="badge badge-neutral">Submitted</span>
                        )}
                      </td>
                      <td>
                        <span className={`badge ${p.review_status === 'APPROVED' ? 'badge-success' : p.review_status === 'REJECTED' ? 'badge-danger' : 'badge-active'}`}>
                          {p.review_status}
                        </span>
                      </td>
                      <td>
                        <button
                          onClick={() => {
                            setProofReviewModal(p);
                            setReviewDecision('APPROVED');
                            setReviewNotes('');
                          }}
                          className="btn btn-sm btn-primary"
                        >
                          <Eye size={14} /> Review Proof
                        </button>
                      </td>
                    </tr>
                  ))}
                  {proofs.length === 0 && (
                    <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No collection proofs submitted yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ----------------------------------------------------------------- */}
        {/* 9. CITIZEN COMPLAINTS TAB (PHASE 5)                              */}
        {/* ----------------------------------------------------------------- */}
        {activeTab === 'complaints' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <div>
                <h1 className="page-title">Citizen Missed-Collection Complaints</h1>
                <p className="page-desc" style={{ marginBottom: 0 }}>
                  Track and resolve citizen grievances filed regarding missed morning pickups and schedule breaches.
                </p>
              </div>
            </div>

            <div className="card-table-wrapper">
              <table className="op-table">
                <thead>
                  <tr>
                    <th>Complaint Ref</th>
                    <th>Building / Location</th>
                    <th>Dustbin</th>
                    <th>Complaint Text</th>
                    <th>Status</th>
                    <th>Filed Date</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {complaints.map(c => (
                    <tr key={c.id}>
                      <td><strong>{c.complaint_number}</strong></td>
                      <td>{c.building_name}</td>
                      <td>{c.dustbin_code}</td>
                      <td style={{ maxWidth: '280px' }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.complaint_text}>
                          {c.complaint_text}
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${c.status === 'RESOLVED' ? 'badge-success' : c.status === 'REJECTED' ? 'badge-danger' : 'badge-pending'}`}>
                          {c.status}
                        </span>
                      </td>
                      <td>{new Date(c.created_at).toLocaleDateString()}</td>
                      <td>
                        <button
                          onClick={() => {
                            setComplaintModal(c);
                            setComplaintResolutionStatus('RESOLVED');
                            setComplaintNote('');
                          }}
                          className="btn btn-sm btn-primary"
                        >
                          Investigate & Resolve
                        </button>
                      </td>
                    </tr>
                  ))}
                  {complaints.length === 0 && (
                    <tr><td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No citizen complaints filed.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ----------------------------------------------------------------- */}
        {/* 10. SYSTEM AUDIT TRAIL TAB                                       */}
        {/* ----------------------------------------------------------------- */}
        {activeTab === 'audit' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <div>
                <h1 className="page-title">Municipal Audit Trail</h1>
                <p className="page-desc" style={{ marginBottom: 0 }}>
                  Immutable log of administrative dispatches, vehicle registrations, status transitions, and proof decisions.
                </p>
              </div>
            </div>

            <div className="card-table-wrapper">
              <table className="op-table">
                <thead>
                  <tr>
                    <th>Action</th>
                    <th>Acting Officer</th>
                    <th>Entity Type</th>
                    <th>Target ID</th>
                    <th>Metadata / Details</th>
                    <th>Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map(l => (
                    <tr key={l.id}>
                      <td><strong>{l.action}</strong></td>
                      <td>{l.actor_name}</td>
                      <td><span className="badge badge-neutral">{l.entity_type}</span></td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>{l.entity_id?.slice(0, 8)}...</td>
                      <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {l.safe_metadata ? JSON.stringify(l.safe_metadata) : '--'}
                      </td>
                      <td>{new Date(l.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                  {auditLogs.length === 0 && (
                    <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No audit logs recorded yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ----------------------------------------------------------------- */}
        {/* 11. DRIVER ISSUES & FIELD TICKETS TAB                             */}
        {/* ----------------------------------------------------------------- */}
        {activeTab === 'driver-issues' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <h1 className="page-title">Driver Issues & Field Support</h1>
                <p className="page-desc" style={{ marginBottom: 0 }}>
                  Real-time roadside breakdown reports, blocked collection points, and field operational tickets from active drivers.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>Filter:</span>
                <select
                  className="form-select"
                  style={{ width: 'auto', minWidth: '150px' }}
                  value={driverIssuesFilter}
                  onChange={e => setDriverIssuesFilter(e.target.value)}
                >
                  <option value="ALL">All Issues ({driverIssues.length})</option>
                  <option value="OPEN">Open Only</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="RESOLVED">Resolved</option>
                  <option value="CLOSED">Closed</option>
                </select>
              </div>
            </div>

            <div className="card-table-wrapper">
              <table className="op-table">
                <thead>
                  <tr>
                    <th>Ticket Ref</th>
                    <th>Driver</th>
                    <th>Category</th>
                    <th>Description</th>
                    <th>Priority</th>
                    <th>Status</th>
                    <th>Admin Reply</th>
                    <th>Reported At</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {driverIssues
                    .filter(i => driverIssuesFilter === 'ALL' || i.status === driverIssuesFilter)
                    .map(issue => (
                      <tr key={issue.id}>
                        <td><strong>#{issue.id?.slice(0, 8)}</strong></td>
                        <td>
                          <div style={{ fontWeight: 700 }}>{issue.driver_name || 'Driver'}</div>
                          {issue.driver_phone && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{issue.driver_phone}</div>}
                        </td>
                        <td>
                          <span className={`badge ${
                            issue.category === 'VEHICLE_BREAKDOWN' ? 'badge-danger' :
                            issue.category === 'BLOCKED_ACCESS' ? 'badge-warning' :
                            issue.category === 'ACCIDENT_OR_HAZARD' ? 'badge-danger' : 'badge-neutral'
                          }`}>
                            {issue.category?.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td style={{ maxWidth: '280px' }}>
                          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={issue.description}>
                            {issue.description}
                          </div>
                          {issue.photo_url && (
                            <a href={issue.photo_url} target="_blank" rel="noreferrer" style={{ fontSize: '0.72rem', color: 'var(--brand-primary)', textDecoration: 'underline' }}>
                              View Attached Photo
                            </a>
                          )}
                        </td>
                        <td>
                          <span className={`badge ${issue.priority === 'URGENT' ? 'badge-danger' : issue.priority === 'HIGH' ? 'badge-warning' : 'badge-neutral'}`}>
                            {issue.priority || 'MEDIUM'}
                          </span>
                        </td>
                        <td>
                          <span className={`badge ${
                            issue.status === 'RESOLVED' ? 'badge-success' :
                            issue.status === 'IN_PROGRESS' ? 'badge-info' :
                            issue.status === 'CLOSED' ? 'badge-neutral' : 'badge-warning'
                          }`}>
                            {issue.status}
                          </span>
                        </td>
                        <td style={{ maxWidth: '200px' }}>
                          {issue.admin_response ? (
                            <div style={{ fontSize: '0.8rem', color: '#166534', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={issue.admin_response}>
                              ✓ {issue.admin_response}
                            </div>
                          ) : (
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>-- None yet --</span>
                          )}
                        </td>
                        <td style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                          {new Date(issue.created_at).toLocaleString()}
                        </td>
                        <td>
                          <button
                            onClick={() => {
                              setSelectedDriverIssueModal(issue);
                              setIssueResponseStatus(issue.status === 'OPEN' ? 'IN_PROGRESS' : (issue.status as any));
                              setIssueResponseNotes(issue.admin_response || '');
                            }}
                            className="btn btn-sm btn-primary"
                          >
                            Review & Respond
                          </button>
                        </td>
                      </tr>
                    ))}
                  {driverIssues.length === 0 && (
                    <tr>
                      <td colSpan={9} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                        No driver issues or roadside breakdowns reported. All fleet units operational.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ----------------------------------------------------------------- */}
        {/* 12. LIVE FLEET TRACKING & DISPATCH (PHASE 3)                     */}
        {/* ----------------------------------------------------------------- */}
        {activeTab === 'live-tracking' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                  <h1 className="page-title" style={{ margin: 0 }}>Live Fleet Tracking & Telemetry</h1>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.72rem', background: '#dcfce7', color: '#15803d', fontWeight: 700, padding: '0.2rem 0.55rem', borderRadius: '12px' }}>
                    <span className="live-pulse-dot" /> STREAMING (8s poll)
                  </span>
                </div>
                <p className="page-desc" style={{ marginBottom: 0 }}>
                  Real-time GPS positions of municipal waste trucks, live road dispatch sheets, and road-network arrival estimates (ETA).
                </p>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <select
                  className="form-select"
                  style={{ width: 'auto', minWidth: '150px' }}
                  value={liveFleetFilter}
                  onChange={e => setLiveFleetFilter(e.target.value as any)}
                >
                  <option value="ALL">All Trips ({liveFleetSessions.length})</option>
                  <option value="STREAMING">Live Streaming Only ({activeTrackingCount})</option>
                  <option value="STALE">Stale / Offline Pings ({liveFleetSessions.length - activeTrackingCount})</option>
                </select>

                <button onClick={loadLiveFleet} className="btn btn-secondary btn-sm" title="Refresh live telemetry">
                  <RefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh
                </button>
              </div>
            </div>

            {/* Statistics Banner */}
            <div className="stat-cards-grid" style={{ marginBottom: '1.25rem' }}>
              <div className="stat-card">
                <span className="stat-card-label">Active Trucks Streaming</span>
                <div className="stat-card-value" style={{ color: '#166534' }}>{activeTrackingCount}</div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Verified GPS fixes in last 3m</span>
              </div>
              <div className="stat-card">
                <span className="stat-card-label">Stale / Warning Trips</span>
                <div className="stat-card-value" style={{ color: '#b45309' }}>{liveFleetSessions.length - activeTrackingCount}</div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Awaiting satellite telemetry</span>
              </div>
              <div className="stat-card">
                <span className="stat-card-label">Active Route Runs</span>
                <div className="stat-card-value">{liveFleetSessions.length}</div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Vehicles dispatched on field</span>
              </div>
              <div className="stat-card">
                <span className="stat-card-label">Routing Engine</span>
                <div className="stat-card-value" style={{ fontSize: '1.25rem', marginTop: '0.4rem', color: '#1e40af' }}>OSRM / Urban</div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Road-network geometry calibrated</span>
              </div>
            </div>

            {/* Live Map & Fleet Split Layout */}
            <div className="planner-split" style={{ gridTemplateColumns: '400px 1fr', alignItems: 'stretch' }}>
              {/* Fleet Roster List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '580px', overflowY: 'auto', paddingRight: '0.25rem' }}>
                <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--forest-900)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Active Dispatched Units ({liveFleetSessions.length})
                </h3>

                {liveFleetSessions
                  .filter(s => {
                    if (liveFleetFilter === 'STREAMING') return !s.is_stale;
                    if (liveFleetFilter === 'STALE') return s.is_stale;
                    return true;
                  })
                  .map(session => {
                    const isSelected = selectedVehicleSessionId === session.session_id;

                    return (
                      <div
                        key={session.session_id}
                        className="stop-item-card"
                        style={{
                          borderLeft: isSelected ? '4px solid #2563eb' : session.is_stale ? '4px solid #f59e0b' : '4px solid #10b981',
                          background: isSelected ? '#eff6ff' : '#ffffff',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                        onClick={() => handleSelectTrackedVehicle(session)}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontSize: '1.1rem' }}>🚛</span>
                            <div>
                              <strong style={{ fontSize: '0.95rem', color: 'var(--forest-900)' }}>
                                {session.vehicle_number}
                              </strong>
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                {session.driver_name} • {session.vehicle_type}
                              </div>
                            </div>
                          </div>
                          <span className={`badge ${session.is_stale ? 'badge-warning' : 'badge-success'}`}>
                            {session.is_stale ? 'STALE PING' : 'LIVE'}
                          </span>
                        </div>

                        <div style={{ background: '#f8fafc', padding: '0.5rem 0.65rem', borderRadius: '6px', fontSize: '0.78rem', margin: '0.4rem 0' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                            <span style={{ color: 'var(--text-muted)' }}>Route:</span>
                            <strong style={{ color: 'var(--forest-900)' }}>{session.route_name}</strong>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                            <span style={{ color: 'var(--text-muted)' }}>Next Stop:</span>
                            <span style={{ fontWeight: 600, color: '#166534' }}>{session.next_stop?.name || 'In Transit'}</span>
                          </div>
                          {session.next_stop?.eta_minutes !== null && (
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span style={{ color: 'var(--text-muted)' }}>Road ETA:</span>
                              <strong style={{ color: '#1d4ed8' }}>~{session.next_stop.eta_minutes} mins ({session.next_stop.distance_km || 0} km)</strong>
                            </div>
                          )}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                          <span>
                            Progress: <strong>{session.progress?.completed_stops}</strong> / {session.progress?.total_stops} stops
                          </span>
                          <span>
                            {session.last_ping_at ? `Ping: ${new Date(session.last_ping_at).toLocaleTimeString()}` : 'Awaiting GPS'}
                          </span>
                        </div>
                      </div>
                    );
                  })}

                {liveFleetSessions.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '2rem 1rem', background: '#fff', borderRadius: '8px', border: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                    <p style={{ margin: 0, fontSize: '0.88rem' }}>No vehicles currently transmitting live GPS.</p>
                    <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.78rem' }}>When drivers start an assigned route and enable GPS telemetry, they appear here automatically.</p>
                  </div>
                )}
              </div>

              {/* Map View */}
              <div style={{ background: '#ffffff', borderRadius: '12px', border: '1px solid var(--border-color)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '0.65rem 1rem', borderBottom: '1px solid var(--border-color)', background: '#fafcfb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--forest-900)' }}>
                    {selectedRouteTrackingDetail ? `Inspecting: ${selectedRouteTrackingDetail.route?.route_name}` : 'Live Geographic Telemetry (All Units)'}
                    {isLiveTelemetryLoading && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}> (Refreshing...)</span>}
                  </div>
                  {selectedRouteTrackingDetail && (
                    <button
                      onClick={() => { setSelectedRouteTrackingDetail(null); setSelectedVehicleSessionId(null); }}
                      className="btn btn-sm btn-outline"
                      style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
                    >
                      Clear Selection
                    </button>
                  )}
                </div>

                <div style={{ flex: 1, minHeight: '520px' }}>
                  <MapComponent
                    markers={liveTrackingMarkers}
                    polyline={liveTrackingPolyline}
                    height="520px"
                    zoom={13}
                  />
                </div>
              </div>
            </div>

            {/* Selected Route Stop-by-Stop ETA Table */}
            {selectedRouteTrackingDetail && (
              <div className="card-table-wrapper" style={{ marginTop: '1.25rem' }}>
                <div style={{ padding: '0.85rem 1.25rem', borderBottom: '1px solid var(--border-color)', background: '#fafcfb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h3 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--forest-900)' }}>
                      Stop-by-Stop Road Arrival Schedule: {selectedRouteTrackingDetail.route?.route_name}
                    </h3>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      Assigned Driver: <strong>{selectedRouteTrackingDetail.driver?.full_name}</strong> • Vehicle: <strong>{selectedRouteTrackingDetail.vehicle?.vehicle_number}</strong>
                    </span>
                  </div>
                </div>

                <table className="op-table">
                  <thead>
                    <tr>
                      <th>Seq</th>
                      <th>Location / Stop Name</th>
                      <th>Type</th>
                      <th>Scheduled Window</th>
                      <th>Status</th>
                      <th>Calculated Arrival (ETA)</th>
                      <th>Distance from Vehicle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedRouteTrackingDetail.stops?.map((st: any) => (
                      <tr key={st.id}>
                        <td><strong>#{st.sequence_number}</strong></td>
                        <td>
                          <div style={{ fontWeight: 700 }}>{st.target_name || st.stop_type}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{st.target_address}</div>
                        </td>
                        <td><span className="badge badge-neutral">{st.stop_type}</span></td>
                        <td>{st.scheduled_window || 'Morning'}</td>
                        <td>
                          <span className={`badge ${st.status === 'COMPLETED' ? 'badge-success' : st.status === 'STARTED' ? 'badge-active' : 'badge-pending'}`}>
                            {st.status}
                          </span>
                        </td>
                        <td>
                          {st.estimated_arrival_minutes !== null ? (
                            <strong style={{ color: '#166534' }}>
                              ~{st.estimated_arrival_minutes} mins ({new Date(st.estimated_arrival_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})
                            </strong>
                          ) : (
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                              {st.status === 'COMPLETED' ? '✓ Completed' : '--'}
                            </span>
                          )}
                        </td>
                        <td>
                          {st.distance_meters ? `${(st.distance_meters / 1000).toFixed(2)} km` : '--'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ================================================================= */}
        {/* 13. AI INTELLIGENCE & OPERATIONAL DIAGNOSTICS TAB                  */}
        {/* ================================================================= */}
        {activeTab === 'ai-ops' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <div>
                <h1 className="page-title">Municipal AI Intelligence & Operational Diagnostics</h1>
                <p className="page-desc" style={{ marginBottom: 0 }}>
                  Live machine learning model performance, spatial waste accumulation hotspots, predictive demand forecasting, and collection anomaly detection.
                </p>
              </div>
              <button
                onClick={loadAiInsights}
                disabled={isLoadingAiInsights}
                className="btn btn-sm btn-outline"
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
              >
                <RefreshCw size={14} className={isLoadingAiInsights ? 'spin' : ''} />
                {isLoadingAiInsights ? 'Refreshing...' : 'Refresh AI Analytics'}
              </button>
            </div>

            {/* Model Architecture & Health Summary */}
            <div style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)', padding: '1.5rem', marginBottom: '1.5rem', boxShadow: 'var(--shadow-sm)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{ width: '38px', height: '38px', borderRadius: '50%', background: '#d1fae5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Sparkles size={20} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--forest-900)' }}>
                      {aiModelInfo?.model_name || 'EcoVision-WasteNet-MobileNetV3'} ({aiModelInfo?.model_version || 'v3.0-mobilenetv3-small'})
                    </h3>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {aiModelInfo?.architecture || 'MobileNetV3-Small (PyTorch Transfer Learning on TrashNet)'}
                    </p>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <span className="badge badge-success" style={{ fontSize: '0.75rem', fontWeight: 700 }}>
                    {aiModelInfo?.deployment_mode || aiInsights?.model_health?.deployment_mode || 'TRAINED_PYTORCH_ARTIFACT'}
                  </span>
                  {aiModelInfo?.evaluation_metrics?.accuracy ? (
                    <span className="badge badge-success" style={{ fontSize: '0.75rem', fontWeight: 700 }}>
                      TEST ACCURACY: {Math.round(aiModelInfo.evaluation_metrics.accuracy * 1000) / 10}% ({aiModelInfo.evaluation_metrics.test_sample_count} PHOTOS)
                    </span>
                  ) : (
                    <span className="badge badge-neutral" style={{ fontSize: '0.75rem', background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' }}>
                      EVALUATION: NO HELD-OUT DATASET
                    </span>
                  )}
                  {aiModelInfo?.evaluation_metrics?.macro_f1 && (
                    <span className="badge badge-neutral" style={{ fontSize: '0.75rem' }}>
                      MACRO-F1: {Math.round(aiModelInfo.evaluation_metrics.macro_f1 * 1000) / 10}%
                    </span>
                  )}
                </div>
              </div>

              {/* Stat Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginTop: '1.25rem' }}>
                <div style={{ background: '#f8faf9', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-subtle)', textTransform: 'uppercase', fontWeight: 700 }}>Total Inferences Run</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--forest-900)', marginTop: '0.2rem' }}>
                    {aiInsights?.model_health?.total_inferences ?? 0}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Logged municipal requests</div>
                </div>

                <div style={{ background: '#f8faf9', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-subtle)', textTransform: 'uppercase', fontWeight: 700 }}>Automated Clearance</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#059669', marginTop: '0.2rem' }}>
                    {aiInsights?.model_health?.automated_completions ?? 0}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>High-confidence decisions</div>
                </div>

                <div style={{ background: '#f8faf9', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-subtle)', textTransform: 'uppercase', fontWeight: 700 }}>Human Review Triggered</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#d97706', marginTop: '0.2rem' }}>
                    {aiInsights?.model_health?.flagged_for_review ?? 0}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {Math.round((aiInsights?.model_health?.review_rate || 0) * 100)}% review trigger rate
                  </div>
                </div>

                <div style={{ background: '#f8faf9', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-subtle)', textTransform: 'uppercase', fontWeight: 700 }}>Admin Overrides</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#2563eb', marginTop: '0.2rem' }}>
                    {aiInsights?.model_health?.admin_overrides ?? 0}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Human corrections preserved</div>
                </div>

                <div style={{ background: '#f8faf9', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-subtle)', textTransform: 'uppercase', fontWeight: 700 }}>Average Model Confidence</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--forest-900)', marginTop: '0.2rem' }}>
                    {aiInsights?.model_health?.average_confidence ? `${Math.round(aiInsights.model_health.average_confidence * 100)}%` : 'N/A'}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Softmax posterior probability</div>
                </div>
              </div>

              {/* Real Held-Out Benchmark Metrics Table */}
              {aiModelInfo?.evaluation_metrics?.per_class_metrics && (
                <div style={{ marginTop: '1.25rem', padding: '1rem', background: '#f8faf9', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--forest-900)' }}>
                      HELD-OUT BENCHMARK EVALUATION (TRASHNET 15% UNSEEN SPLIT)
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      Evaluated: {new Date(aiModelInfo.evaluation_metrics.evaluated_at || Date.now()).toLocaleDateString()}
                    </div>
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', fontSize: '0.78rem', borderCollapse: 'collapse', textAlign: 'left' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-subtle)' }}>
                          <th style={{ padding: '0.4rem' }}>Class</th>
                          <th style={{ padding: '0.4rem' }}>Precision</th>
                          <th style={{ padding: '0.4rem' }}>Recall</th>
                          <th style={{ padding: '0.4rem' }}>F1-Score</th>
                          <th style={{ padding: '0.4rem' }}>Test Support</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(aiModelInfo.evaluation_metrics.per_class_metrics).map(([c, m]: [string, any]) => (
                          <tr key={c} style={{ borderBottom: '1px solid #e2e8f0' }}>
                            <td style={{ padding: '0.4rem', fontWeight: 600 }}>{c}</td>
                            <td style={{ padding: '0.4rem' }}>{(m.precision * 100).toFixed(1)}%</td>
                            <td style={{ padding: '0.4rem' }}>{(m.recall * 100).toFixed(1)}%</td>
                            <td style={{ padding: '0.4rem', fontWeight: 600, color: 'var(--forest-900)' }}>{(m.f1_score * 100).toFixed(1)}%</td>
                            <td style={{ padding: '0.4rem' }}>{m.test_sample_count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#b45309', marginTop: '0.5rem' }}>
                    * Notice: HAZARDOUS waste is unrepresented in TrashNet and automatically routes to supervisor manual review.
                  </div>
                </div>
              )}

              {/* Supported Material Classes */}
              <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-subtle)' }}>SUPPORTED CLASSES:</span>
                {(aiModelInfo?.supported_classes || ['ORGANIC', 'PLASTIC', 'PAPER', 'METAL', 'GLASS', 'HAZARDOUS', 'UNKNOWN']).map((c: string) => (
                  <span key={c} className="badge badge-neutral" style={{ fontSize: '0.75rem' }}>{c}</span>
                ))}
              </div>
            </div>

            {/* Two-Column Grid: Hotspots & Demand Forecast */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
              {/* Hotspot Clustering Card */}
              <div style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)', padding: '1.5rem', boxShadow: 'var(--shadow-sm)' }}>
                <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.1rem', color: 'var(--forest-900)' }}>
                  Geographic Waste Hotspots (Cluster Analysis)
                </h3>
                <p style={{ margin: '0 0 1rem', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  Spatial density clustering (300m radius) on historical complaint and dustbin coordinates.
                </p>

                {aiInsights?.hotspots && aiInsights.hotspots.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {aiInsights.hotspots.map((h: any) => (
                      <div key={h.cluster_id} style={{ background: '#f8faf9', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '0.85rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                          <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--forest-900)' }}>
                            {h.sample_address}
                          </span>
                          <span className="badge badge-danger" style={{ fontSize: '0.75rem' }}>
                            {h.total_incidents} Incidents
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: '1rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                          <span>Coordinates: {h.center_latitude}, {h.center_longitude}</span>
                          <span>Primary: <strong>{h.primary_category}</strong></span>
                          <span>Overflow: <strong>{Math.round(h.overflow_rate * 100)}%</strong></span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
                    No recurring cluster anomalies detected across current dataset.
                  </div>
                )}
              </div>

              {/* Demand Forecasting Card */}
              <div style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)', padding: '1.5rem', boxShadow: 'var(--shadow-sm)' }}>
                <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.1rem', color: 'var(--forest-900)' }}>
                  Predictive Collection Demand Analytics
                </h3>
                <p style={{ margin: '0 0 1rem', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  Empirical route payload trends projected against vehicle capacity constraints.
                </p>

                {aiInsights?.demand_forecast?.forecasting_status === 'ACTIVE_EMPIRICAL' ? (
                  <div>
                    <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 'var(--radius-md)', padding: '1rem', marginBottom: '1rem' }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#065f46', textTransform: 'uppercase' }}>Projected Weekly Collection Load</div>
                      <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#047857', marginTop: '0.25rem' }}>
                        {aiInsights.demand_forecast.projected_weekly_load_kg} kg
                      </div>
                      <div style={{ fontSize: '0.82rem', color: '#065f46', marginTop: '0.35rem' }}>
                        Estimated Compactor Dispatches: <strong>{aiInsights.demand_forecast.projected_collection_trips} trips</strong>
                      </div>
                      {aiInsights.demand_forecast.confidence_interval_95 && (
                        <div style={{ fontSize: '0.75rem', color: '#047857', marginTop: '0.2rem' }}>
                          95% Confidence Interval: {aiInsights.demand_forecast.confidence_interval_95.lower_bound_kg} kg — {aiInsights.demand_forecast.confidence_interval_95.upper_bound_kg} kg
                        </div>
                      )}
                    </div>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
                      {aiInsights.demand_forecast.explanation}
                    </p>
                  </div>
                ) : (
                  <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 'var(--radius-md)', padding: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#92400e', fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.35rem' }}>
                      <AlertCircle size={16} /> Data Transparency Notice
                    </div>
                    <p style={{ fontSize: '0.82rem', color: '#78350f', margin: 0, lineHeight: 1.5 }}>
                      {aiInsights?.demand_forecast?.explanation ||
                        'Insufficient historical collection runs to project statistically rigorous demand. A minimum of 6 verified route completion cycles is required to prevent fabricated projections.'}
                    </p>
                    <div style={{ fontSize: '0.75rem', color: '#92400e', marginTop: '0.5rem', fontWeight: 600 }}>
                      Current Sample Size: {aiInsights?.demand_forecast?.sample_size ?? 0} cycles (Need: 6)
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Collection Anomalies Card */}
            <div style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)', padding: '1.5rem', marginBottom: '1.5rem', boxShadow: 'var(--shadow-sm)' }}>
              <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.1rem', color: 'var(--forest-900)' }}>
                Operational Collection Anomalies & Unexplained Skips
              </h3>
              <p style={{ margin: '0 0 1rem', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                Audits real-time task statuses against published morning schedules to identify missed or skipped collections.
              </p>

              {aiInsights?.collection_anomalies && aiInsights.collection_anomalies.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                  {aiInsights.collection_anomalies.map((an: any, idx: number) => (
                    <div key={idx} style={{ padding: '0.85rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 'var(--radius-md)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <span className="badge badge-danger" style={{ fontSize: '0.7rem' }}>{an.anomaly_type}</span>
                          <strong style={{ fontSize: '0.88rem', color: '#991b1b' }}>{an.stop_address || 'Collection Stop'}</strong>
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#7f1d1d', marginTop: '0.2rem' }}>
                          {an.details}
                        </div>
                      </div>
                      <span className="badge badge-neutral" style={{ fontSize: '0.72rem' }}>Severity: {an.severity}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '1.5rem', color: '#059669', fontSize: '0.9rem', background: '#ecfdf5', borderRadius: 'var(--radius-md)' }}>
                  ✓ All scheduled morning stops are operating within acceptable temporal bounds. Zero unexplained skips detected.
                </div>
              )}
            </div>

            {/* Interactive Model Inference Playground */}
            <div style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)', padding: '1.5rem', boxShadow: 'var(--shadow-sm)' }}>
              <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.1rem', color: 'var(--forest-900)' }}>
                Interactive Model Inference Studio
              </h3>
              <p style={{ margin: '0 0 1.25rem', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                Upload any waste photo or select a test sample to inspect raw machine learning class probabilities, image quality metrics, and fill estimation.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
                <div>
                  <label className="form-label" style={{ fontWeight: 700 }}>Upload Waste Photo</label>
                  <input
                    type="file"
                    accept="image/*"
                    className="form-input"
                    onChange={e => {
                      const f = e.target.files?.[0];
                      if (f) {
                        const r = new FileReader();
                        r.onloadend = () => setAiTestImagePreview(r.result as string);
                        r.readAsDataURL(f);
                      }
                    }}
                  />

                  {aiTestImagePreview && (
                    <div style={{ marginTop: '1rem', height: '180px', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border-color)', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <img src={aiTestImagePreview} alt="Preview" style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }} />
                    </div>
                  )}

                  <button
                    onClick={async () => {
                      if (!aiTestImagePreview) return;
                      setIsTestingAi(true);
                      try {
                        const res = await api.analyzeImage(aiTestImagePreview, 'OVERFLOWING_BIN');
                        setAiTestResult(res);
                      } catch (err: any) {
                        alert(err.message || 'Inference failed');
                      } finally {
                        setIsTestingAi(false);
                      }
                    }}
                    disabled={!aiTestImagePreview || isTestingAi}
                    className="btn btn-primary"
                    style={{ marginTop: '1rem', width: '100%', justifyContent: 'center' }}
                  >
                    {isTestingAi ? 'Running EcoVision Inference...' : 'Run Computer Vision Inference'}
                  </button>
                </div>

                <div>
                  <label className="form-label" style={{ fontWeight: 700 }}>Live Inference Diagnostic Output</label>
                  {aiTestResult ? (
                    <div style={{ background: '#f8faf9', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '1rem', fontSize: '0.85rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                        <div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>PREDICTED CATEGORY</div>
                          <strong style={{ fontSize: '1.2rem', color: 'var(--forest-900)' }}>
                            {aiTestResult.result?.primary_category || 'UNKNOWN'}
                          </strong>
                        </div>
                        <div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>CONFIDENCE</div>
                          <strong style={{ fontSize: '1.2rem', color: '#059669' }}>
                            {Math.round((aiTestResult.confidence || 0) * 100)}%
                          </strong>
                        </div>
                        <span className={`badge ${aiTestResult.status === 'COMPLETED' ? 'badge-success' : 'badge-pending'}`}>
                          {aiTestResult.status}
                        </span>
                      </div>

                      {aiTestResult.result?.category_probabilities && (
                        <div style={{ marginBottom: '0.75rem' }}>
                          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-subtle)', marginBottom: '0.35rem' }}>
                            PROBABILITY DISTRIBUTION:
                          </div>
                          {Object.entries(aiTestResult.result.category_probabilities).map(([cls, prob]: [string, any]) => (
                            <div key={cls} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem', fontSize: '0.75rem' }}>
                              <span style={{ width: '80px', fontWeight: 600 }}>{cls}</span>
                              <div style={{ flex: 1, height: '6px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
                                <div style={{ width: `${Math.round(prob * 100)}%`, height: '100%', background: 'var(--forest-600)' }} />
                              </div>
                              <span style={{ width: '35px', textAlign: 'right' }}>{Math.round(prob * 100)}%</span>
                            </div>
                          ))}
                        </div>
                      )}

                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', paddingTop: '0.5rem', borderTop: '1px solid #e2e8f0' }}>
                        <div><strong>Container Fill Assessment:</strong> {aiTestResult.result?.fill_level_percentage !== null ? `${aiTestResult.result.fill_level_percentage}% (${aiTestResult.result.fill_state} — Experimental Edge Clutter Heuristic)` : 'Not applicable (loose ground litter / no container)'}</div>
                        <div><strong>Triage Queue:</strong> {aiTestResult.result?.triage_queue || 'GENERAL_COMPACTOR'}</div>
                        <div><strong>Quality Metrics:</strong> Sharpness: {aiTestResult.result?.quality?.sharpness_score}, Mean Lum: {aiTestResult.result?.quality?.mean_luminance}</div>
                        {aiTestResult.rejection_reason && (
                          <div style={{ color: '#b45309', marginTop: '0.25rem' }}><strong>Rejection:</strong> {aiTestResult.rejection_reason}</div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div style={{ background: '#f8faf9', border: '1px dashed var(--border-color)', borderRadius: 'var(--radius-md)', padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      Select or upload an image and click "Run Computer Vision Inference" to test real model response.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

      </main>

      {/* =================================================================== */}
      {/* REPORT DETAIL DRAWER (PHASE 3)                                      */}
      {/* =================================================================== */}
      {selectedReportDetail && (
        <div className="drawer-backdrop" onClick={() => setSelectedReportDetail(null)}>
          <div className="drawer-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <span className="badge badge-neutral">{selectedReportDetail.report_type}</span>
                <h3 style={{ marginTop: '0.25rem' }}>{selectedReportDetail.report_number}</h3>
              </div>
              <button onClick={() => setSelectedReportDetail(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Status & Priority Banner */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8faf9', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>CURRENT STATUS</div>
                  <strong style={{ fontSize: '1rem', color: 'var(--forest-900)' }}>{selectedReportDetail.status}</strong>
                  {selectedReportDetail.rejection_reason && (
                    <div style={{ fontSize: '0.8rem', color: 'var(--status-danger)', marginTop: '0.2rem' }}>
                      Reason: {selectedReportDetail.rejection_reason}
                    </div>
                  )}
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>PRIORITY</div>
                  <span className={`badge ${selectedReportDetail.priority === 'URGENT' || selectedReportDetail.priority === 'HIGH' ? 'badge-danger' : 'badge-pending'}`}>
                    {selectedReportDetail.priority}
                  </span>
                </div>
              </div>

              {/* Photos & AI Decision Support Card */}
              {selectedReportDetail.images && selectedReportDetail.images.length > 0 && (
                <div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-subtle)', marginBottom: '0.4rem', textTransform: 'uppercase' }}>
                    Uploaded Evidence Photo
                  </div>
                  <div style={{ height: '200px', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border-color)', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <img src={selectedReportDetail.images[0].secure_url} alt="Report Evidence" style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }} />
                  </div>
                </div>
              )}

              {/* Real AI Inference Panel */}
              {selectedReportDetail.ai_analysis && (
                <div style={{ background: 'var(--forest-50)', border: '1px solid #a7f3d0', borderRadius: 'var(--radius-md)', padding: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700, color: 'var(--forest-900)', fontSize: '0.9rem' }}>
                      <Sparkles size={16} color="var(--forest-700)" />
                      EcoVision AI Classification Analysis
                    </div>
                    <button
                      onClick={() => handleOpenReportActionModal('AI_OVERRIDE', selectedReportDetail.id)}
                      className="btn btn-sm btn-outline"
                      style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}
                    >
                      Correct / Override AI
                    </button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', fontSize: '0.85rem' }}>
                    <div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>PRIMARY MATERIAL</div>
                      <strong>{selectedReportDetail.ai_analysis.result?.human_corrected_material || selectedReportDetail.ai_analysis.result?.primary_material || 'MIXED'}</strong>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>CONFIDENCE</div>
                      <strong>{Math.round((selectedReportDetail.ai_analysis.confidence || 0.85) * 100)}%</strong>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>MODEL VERSION</div>
                      <span>{selectedReportDetail.ai_analysis.model_version || 'v1.4.2'}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Location & Map Preview */}
              <div>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-subtle)', marginBottom: '0.4rem', textTransform: 'uppercase' }}>
                  Location Pin: {selectedReportDetail.address_text || 'GPS Coordinates'}
                </div>
                <div style={{ height: '180px', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
                  <MapComponent
                    markers={[{
                      id: selectedReportDetail.id,
                      lat: Number(selectedReportDetail.latitude),
                      lng: Number(selectedReportDetail.longitude),
                      title: selectedReportDetail.report_number,
                      type: 'REPORT'
                    }]}
                    center={[Number(selectedReportDetail.latitude) || 19.076, Number(selectedReportDetail.longitude) || 72.997]}
                    zoom={15}
                    height="180px"
                  />
                </div>
              </div>

              {/* Description & Citizen Info */}
              <div>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-subtle)', marginBottom: '0.2rem', textTransform: 'uppercase' }}>
                  Citizen Description
                </div>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-main)', background: '#fff', border: '1px solid var(--border-color)', padding: '0.75rem', borderRadius: '6px' }}>
                  {selectedReportDetail.description || 'No additional citizen remarks provided.'}
                </p>
              </div>

              {/* Assigned Crew Details */}
              {selectedReportDetail.assigned_driver_name && (
                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 'var(--radius-md)', padding: '0.85rem' }}>
                  <div style={{ fontSize: '0.75rem', color: '#166534', fontWeight: 700, textTransform: 'uppercase' }}>DISPATCHED CREW</div>
                  <div style={{ fontWeight: 800, color: '#14532d', fontSize: '0.95rem' }}>
                    {selectedReportDetail.assigned_driver_name} ({selectedReportDetail.assigned_vehicle_number})
                  </div>
                </div>
              )}
            </div>

            {/* Status-Aware Action Footer */}
            <div className="modal-footer" style={{ flexWrap: 'wrap' }}>
              {/* New / Submitted / Pending Review */}
              {(selectedReportDetail.status === 'SUBMITTED' || selectedReportDetail.status === 'PENDING_REVIEW') && (
                <>
                  <button onClick={() => handleApproveReport(selectedReportDetail.id)} className="btn btn-sm btn-success">
                    <CheckCircle size={14} /> Approve for Collection
                  </button>
                  <button onClick={() => handleOpenReportActionModal('ASSIGN', selectedReportDetail.id)} className="btn btn-sm btn-primary">
                    <Truck size={14} /> Assign Crew
                  </button>
                  <button onClick={() => handleOpenReportActionModal('DUPLICATE', selectedReportDetail.id)} className="btn btn-sm btn-secondary">
                    Flag Duplicate
                  </button>
                  <button onClick={() => handleOpenReportActionModal('REJECT', selectedReportDetail.id)} className="btn btn-sm btn-danger">
                    Reject Report
                  </button>
                </>
              )}

              {/* Approved / Waiting for Vehicle */}
              {(selectedReportDetail.status === 'APPROVED' || selectedReportDetail.status === 'WAITING_FOR_VEHICLE') && (
                <>
                  <button onClick={() => handleOpenReportActionModal('ASSIGN', selectedReportDetail.id)} className="btn btn-sm btn-primary">
                    <Truck size={14} /> Assign Vehicle & Driver
                  </button>
                  <button onClick={() => handleOpenReportActionModal('REJECT', selectedReportDetail.id)} className="btn btn-sm btn-danger">
                    Reject Report
                  </button>
                </>
              )}

              {/* Assigned */}
              {selectedReportDetail.status === 'ASSIGNED' && (
                <>
                  <button onClick={() => handleOpenReportActionModal('ASSIGN', selectedReportDetail.id)} className="btn btn-sm btn-outline">
                    Reassign Crew
                  </button>
                  <button onClick={() => handleOpenReportActionModal('REJECT', selectedReportDetail.id)} className="btn btn-sm btn-danger">
                    Cancel Task
                  </button>
                </>
              )}

              {/* Resolved / Rejected */}
              {(selectedReportDetail.status === 'RESOLVED' || selectedReportDetail.status === 'REJECTED' || selectedReportDetail.status === 'DUPLICATE') && (
                <button onClick={() => handleOpenReportActionModal('REOPEN', selectedReportDetail.id)} className="btn btn-sm btn-outline">
                  <RotateCcw size={14} /> Reopen Report
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* REPORT REASON / ASSIGN / OVERRIDE MODAL                            */}
      {/* =================================================================== */}
      {reportActionDialog.open && (
        <div className="modal-backdrop">
          <div className="modal-dialog">
            <div className="modal-header">
              <h3>
                {reportActionDialog.action === 'REJECT' && 'Reject Waste Report'}
                {reportActionDialog.action === 'DUPLICATE' && 'Flag as Duplicate Report'}
                {reportActionDialog.action === 'REOPEN' && 'Reopen Closed Report'}
                {reportActionDialog.action === 'ASSIGN' && 'Assign Vehicle & Driver Crew'}
                {reportActionDialog.action === 'AI_OVERRIDE' && 'Correct AI Waste Classification'}
              </h3>
              <button onClick={() => setReportActionDialog(prev => ({ ...prev, open: false }))} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} /></button>
            </div>

            <form onSubmit={handleExecuteReportAction}>
              <div className="modal-body">
                {(reportActionDialog.action === 'REJECT' || reportActionDialog.action === 'DUPLICATE' || reportActionDialog.action === 'REOPEN') && (
                  <div className="form-group">
                    <label className="form-label">
                      {reportActionDialog.action === 'REJECT' && 'Mandatory Rejection Reason *'}
                      {reportActionDialog.action === 'DUPLICATE' && 'Original Report Reference / Duplicate Note *'}
                      {reportActionDialog.action === 'REOPEN' && 'Mandatory Reopening Justification *'}
                    </label>
                    <textarea
                      required
                      rows={4}
                      className="form-textarea"
                      placeholder="Please enter official operational rationale..."
                      value={reasonInput}
                      onChange={e => setReasonInput(e.target.value)}
                    />
                  </div>
                )}

                {reportActionDialog.action === 'ASSIGN' && (
                  <>
                    <div className="form-group">
                      <label className="form-label">Select Available Vehicle</label>
                      <select
                        className="form-select"
                        value={assignVehicleId}
                        onChange={e => setAssignVehicleId(e.target.value)}
                      >
                        <option value="">-- No vehicle available (Hold in Queue) --</option>
                        {vehicles.map(v => (
                          <option key={v.id} value={v.id}>
                            {v.vehicle_number} ({v.vehicle_type} - {v.status})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Select Driver</label>
                      <select
                        className="form-select"
                        value={assignDriverId}
                        onChange={e => setAssignDriverId(e.target.value)}
                      >
                        <option value="">-- Select Driver --</option>
                        {drivers.filter(d => d.is_active).map(d => (
                          <option key={d.id} value={d.id}>
                            {d.full_name} ({d.email})
                          </option>
                        ))}
                      </select>
                    </div>

                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      Note: If vehicle or driver is omitted or double-booked, this report will be securely held in the <strong>Waiting for Vehicle</strong> operational queue.
                    </p>
                  </>
                )}

                {reportActionDialog.action === 'AI_OVERRIDE' && (
                  <>
                    <div className="form-group">
                      <label className="form-label">Corrected Material Category *</label>
                      <select
                        required
                        className="form-select"
                        value={overrideCategory}
                        onChange={e => setOverrideCategory(e.target.value)}
                      >
                        <option value="ORGANIC">ORGANIC (Food / Wet waste)</option>
                        <option value="PLASTIC">PLASTIC (Bottles, polythene)</option>
                        <option value="PAPER">PAPER (Cardboard, newsprint)</option>
                        <option value="METAL">METAL (Cans, scrap)</option>
                        <option value="GLASS">GLASS (Bottles, shards)</option>
                        <option value="GENERAL_MIXED">GENERAL MIXED</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Adjust Priority</label>
                      <select
                        className="form-select"
                        value={overridePriority}
                        onChange={e => setOverridePriority(e.target.value)}
                      >
                        <option value="LOW">LOW</option>
                        <option value="MEDIUM">MEDIUM</option>
                        <option value="HIGH">HIGH</option>
                        <option value="URGENT">URGENT</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Administrative Notes / Model Feedback</label>
                      <textarea
                        rows={3}
                        className="form-textarea"
                        placeholder="Why is this AI prediction being overridden?"
                        value={overrideNotes}
                        onChange={e => setOverrideNotes(e.target.value)}
                      />
                    </div>
                  </>
                )}
              </div>

              <div className="modal-footer">
                <button type="button" onClick={() => setReportActionDialog(prev => ({ ...prev, open: false }))} className="btn btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Confirm & Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* VEHICLE MODAL (ADD / EDIT)                                          */}
      {/* =================================================================== */}
      {vehicleModal.open && (
        <div className="modal-backdrop">
          <div className="modal-dialog">
            <div className="modal-header">
              <h3>{vehicleModal.mode === 'add' ? 'Register New Fleet Vehicle' : 'Edit Fleet Vehicle'}</h3>
              <button onClick={() => setVehicleModal({ open: false, mode: 'add' })} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} /></button>
            </div>
            <form onSubmit={handleSaveVehicle}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Registration Plate Number *</label>
                  <input
                    type="text"
                    required
                    className="form-input"
                    placeholder="e.g. MH-43-AK-2910"
                    value={vehicleForm.vehicle_number}
                    onChange={e => setVehicleForm({ ...vehicleForm, vehicle_number: e.target.value.toUpperCase() })}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Vehicle Type</label>
                  <select
                    className="form-select"
                    value={vehicleForm.vehicle_type}
                    onChange={e => setVehicleForm({ ...vehicleForm, vehicle_type: e.target.value })}
                  >
                    <option value="COMPACTOR_TRUCK">COMPACTOR_TRUCK (High Capacity)</option>
                    <option value="TIPPER_TRUCK">TIPPER_TRUCK (Medium Dump)</option>
                    <option value="ELECTRIC_CART">ELECTRIC_CART (Narrow Alley Sweep)</option>
                    <option value="MINI_VAN">MINI_VAN</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Payload Capacity (kg)</label>
                  <input
                    type="number"
                    required
                    min={100}
                    max={20000}
                    className="form-input"
                    value={vehicleForm.capacity_kg}
                    onChange={e => setVehicleForm({ ...vehicleForm, capacity_kg: Number(e.target.value) })}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Operational Status</label>
                  <select
                    className="form-select"
                    value={vehicleForm.status}
                    onChange={e => setVehicleForm({ ...vehicleForm, status: e.target.value })}
                  >
                    <option value="AVAILABLE">AVAILABLE (Ready for Dispatch)</option>
                    <option value="ASSIGNED">ASSIGNED</option>
                    <option value="MAINTENANCE">MAINTENANCE</option>
                    <option value="INACTIVE">INACTIVE</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Assigned Driver</label>
                  <select
                    className="form-select"
                    value={vehicleForm.assigned_driver_id}
                    onChange={e => setVehicleForm({ ...vehicleForm, assigned_driver_id: e.target.value })}
                  >
                    <option value="">-- None (Unassigned) --</option>
                    {drivers.filter(d => d.is_active).map(d => (
                      <option key={d.id} value={d.id}>{d.full_name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" onClick={() => setVehicleModal({ open: false, mode: 'add' })} className="btn btn-secondary">Cancel</button>
                <button type="submit" className="btn btn-primary">Save Vehicle</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* DRIVER MODAL (ADD / EDIT)                                           */}
      {/* =================================================================== */}
      {driverModal.open && (
        <div className="modal-backdrop">
          <div className="modal-dialog">
            <div className="modal-header">
              <h3>{driverModal.mode === 'add' ? 'Register New Driver' : 'Edit Driver Profile'}</h3>
              <button onClick={() => setDriverModal({ open: false, mode: 'add' })} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} /></button>
            </div>
            <form onSubmit={handleSaveDriver}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Full Name *</label>
                  <input
                    type="text"
                    required
                    className="form-input"
                    placeholder="e.g. Anand K. Patil"
                    value={driverForm.full_name}
                    onChange={e => setDriverForm({ ...driverForm, full_name: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Official Email *</label>
                  <input
                    type="email"
                    required
                    disabled={driverModal.mode === 'edit'}
                    className="form-input"
                    placeholder="e.g. driver.anand@smartwaste.gov"
                    value={driverForm.email}
                    onChange={e => setDriverForm({ ...driverForm, email: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Contact Phone</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="+91 98200 XXXXX"
                    value={driverForm.phone}
                    onChange={e => setDriverForm({ ...driverForm, phone: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Commercial Driving License #</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. MH-04-2019-00981"
                    value={driverForm.license_number}
                    onChange={e => setDriverForm({ ...driverForm, license_number: e.target.value })}
                  />
                </div>

                {driverModal.mode === 'add' && (
                  <div className="form-group">
                    <label className="form-label">Initial Password *</label>
                    <input
                      type="password"
                      required
                      minLength={6}
                      className="form-input"
                      value={driverForm.password}
                      onChange={e => setDriverForm({ ...driverForm, password: e.target.value })}
                    />
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" onClick={() => setDriverModal({ open: false, mode: 'add' })} className="btn btn-secondary">Cancel</button>
                <button type="submit" className="btn btn-primary">Save Driver</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* BUILDING MODAL                                                      */}
      {/* =================================================================== */}
      {buildingModal.open && (
        <div className="modal-backdrop">
          <div className="modal-dialog">
            <div className="modal-header">
              <h3>{buildingModal.mode === 'add' ? 'Register New Building' : 'Edit Building'}</h3>
              <button onClick={() => setBuildingModal({ open: false, mode: 'add' })} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} /></button>
            </div>
            <form onSubmit={handleSaveBuilding}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Building / Society Name *</label>
                  <input
                    type="text"
                    required
                    className="form-input"
                    placeholder="e.g. Seawoods Grand Central Mall"
                    value={buildingForm.name}
                    onChange={e => setBuildingForm({ ...buildingForm, name: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Address *</label>
                  <input
                    type="text"
                    required
                    className="form-input"
                    placeholder="Street, Sector, Landmark..."
                    value={buildingForm.address}
                    onChange={e => setBuildingForm({ ...buildingForm, address: e.target.value })}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div className="form-group">
                    <label className="form-label">Latitude</label>
                    <input
                      type="number"
                      step="0.000001"
                      className="form-input"
                      value={buildingForm.latitude}
                      onChange={e => setBuildingForm({ ...buildingForm, latitude: Number(e.target.value) })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Longitude</label>
                    <input
                      type="number"
                      step="0.000001"
                      className="form-input"
                      value={buildingForm.longitude}
                      onChange={e => setBuildingForm({ ...buildingForm, longitude: Number(e.target.value) })}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Morning Collection Window</label>
                  <input
                    type="text"
                    className="form-input"
                    value={buildingForm.collection_window}
                    onChange={e => setBuildingForm({ ...buildingForm, collection_window: e.target.value })}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div className="form-group">
                    <label className="form-label">Contact Person</label>
                    <input
                      type="text"
                      className="form-input"
                      value={buildingForm.contact_person}
                      onChange={e => setBuildingForm({ ...buildingForm, contact_person: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Contact Phone</label>
                    <input
                      type="text"
                      className="form-input"
                      value={buildingForm.contact_phone}
                      onChange={e => setBuildingForm({ ...buildingForm, contact_phone: e.target.value })}
                    />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" onClick={() => setBuildingModal({ open: false, mode: 'add' })} className="btn btn-secondary">Cancel</button>
                <button type="submit" className="btn btn-primary">Save Building</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* DUSTBIN MODAL                                                       */}
      {/* =================================================================== */}
      {dustbinModal.open && (
        <div className="modal-backdrop">
          <div className="modal-dialog">
            <div className="modal-header">
              <h3>{dustbinModal.mode === 'add' ? 'Register New Dustbin' : 'Edit Dustbin'}</h3>
              <button onClick={() => setDustbinModal({ open: false, mode: 'add' })} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} /></button>
            </div>
            <form onSubmit={handleSaveDustbin}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Dustbin Code *</label>
                  <input
                    type="text"
                    required
                    className="form-input"
                    placeholder="e.g. BIN-SW-005"
                    value={dustbinForm.bin_code}
                    onChange={e => setDustbinForm({ ...dustbinForm, bin_code: e.target.value.toUpperCase() })}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Bin Waste Type</label>
                  <select
                    className="form-select"
                    value={dustbinForm.bin_type}
                    onChange={e => setDustbinForm({ ...dustbinForm, bin_type: e.target.value })}
                  >
                    <option value="GENERAL_MIXED">GENERAL_MIXED (Black/Grey)</option>
                    <option value="ORGANIC">ORGANIC (Green wet waste)</option>
                    <option value="RECYCLABLE">RECYCLABLE (Blue dry waste)</option>
                    <option value="HAZARDOUS">HAZARDOUS (Red sanitary/chemical)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Linked Building / Society</label>
                  <select
                    className="form-select"
                    value={dustbinForm.building_id}
                    onChange={e => setDustbinForm({ ...dustbinForm, building_id: e.target.value })}
                  >
                    <option value="">-- Standalone Public Location --</option>
                    {buildings.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div className="form-group">
                    <label className="form-label">Capacity (Liters)</label>
                    <input
                      type="number"
                      className="form-input"
                      value={dustbinForm.capacity_liters}
                      onChange={e => setDustbinForm({ ...dustbinForm, capacity_liters: Number(e.target.value) })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Current Fill Level (%)</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      className="form-input"
                      value={dustbinForm.fill_level_percentage}
                      onChange={e => setDustbinForm({ ...dustbinForm, fill_level_percentage: Number(e.target.value) })}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div className="form-group">
                    <label className="form-label">Latitude</label>
                    <input
                      type="number"
                      step="0.000001"
                      className="form-input"
                      value={dustbinForm.latitude}
                      onChange={e => setDustbinForm({ ...dustbinForm, latitude: Number(e.target.value) })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Longitude</label>
                    <input
                      type="number"
                      step="0.000001"
                      className="form-input"
                      value={dustbinForm.longitude}
                      onChange={e => setDustbinForm({ ...dustbinForm, longitude: Number(e.target.value) })}
                    />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" onClick={() => setDustbinModal({ open: false, mode: 'add' })} className="btn btn-secondary">Cancel</button>
                <button type="submit" className="btn btn-primary">Save Dustbin</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* COLLECTION SCHEDULE MODAL                                           */}
      {/* =================================================================== */}
      {scheduleModal.open && (
        <div className="modal-backdrop">
          <div className="modal-dialog">
            <div className="modal-header">
              <h3>Create Recurring Collection Schedule</h3>
              <button onClick={() => setScheduleModal({ open: false, mode: 'add' })} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} /></button>
            </div>
            <form onSubmit={handleSaveSchedule}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Schedule Title *</label>
                  <input
                    type="text"
                    required
                    className="form-input"
                    placeholder="e.g. Sector 10 High-Rise Daily Morning Pickup"
                    value={scheduleForm.title}
                    onChange={e => setScheduleForm({ ...scheduleForm, title: e.target.value })}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div className="form-group">
                    <label className="form-label">Weekday</label>
                    <select
                      className="form-select"
                      value={scheduleForm.weekday}
                      onChange={e => setScheduleForm({ ...scheduleForm, weekday: Number(e.target.value) })}
                    >
                      <option value={1}>Monday</option>
                      <option value={2}>Tuesday</option>
                      <option value={3}>Wednesday</option>
                      <option value={4}>Thursday</option>
                      <option value={5}>Friday</option>
                      <option value={6}>Saturday</option>
                      <option value={0}>Sunday</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Shift</label>
                    <select
                      className="form-select"
                      value={scheduleForm.shift}
                      onChange={e => setScheduleForm({ ...scheduleForm, shift: e.target.value })}
                    >
                      <option value="MORNING">MORNING (06:30 - 11:00)</option>
                      <option value="AFTERNOON">AFTERNOON</option>
                      <option value="NIGHT">NIGHT</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div className="form-group">
                    <label className="form-label">Start Window</label>
                    <input
                      type="text"
                      className="form-input"
                      value={scheduleForm.start_window}
                      onChange={e => setScheduleForm({ ...scheduleForm, start_window: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">End Window</label>
                    <input
                      type="text"
                      className="form-input"
                      value={scheduleForm.end_window}
                      onChange={e => setScheduleForm({ ...scheduleForm, end_window: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Assigned Truck</label>
                  <select
                    className="form-select"
                    value={scheduleForm.vehicle_id}
                    onChange={e => setScheduleForm({ ...scheduleForm, vehicle_id: e.target.value })}
                  >
                    <option value="">-- Auto-dispatch --</option>
                    {vehicles.map(v => (
                      <option key={v.id} value={v.id}>{v.vehicle_number} ({v.capacity_kg} kg)</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Assigned Driver</label>
                  <select
                    className="form-select"
                    value={scheduleForm.driver_id}
                    onChange={e => setScheduleForm({ ...scheduleForm, driver_id: e.target.value })}
                  >
                    <option value="">-- Auto-dispatch --</option>
                    {drivers.map(d => (
                      <option key={d.id} value={d.id}>{d.full_name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" onClick={() => setScheduleModal({ open: false, mode: 'add' })} className="btn btn-secondary">Cancel</button>
                <button type="submit" className="btn btn-primary">Save Schedule</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* NEW ROUTE DRAFT MODAL                                               */}
      {/* =================================================================== */}
      {newRouteModal && (
        <div className="modal-backdrop">
          <div className="modal-dialog">
            <div className="modal-header">
              <h3>Create Route Plan Draft</h3>
              <button onClick={() => setNewRouteModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} /></button>
            </div>
            <form onSubmit={handleCreateRoute}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Route Plan Name *</label>
                  <input
                    type="text"
                    required
                    className="form-input"
                    placeholder="e.g. Ward 4 Sector 9 Morning Route"
                    value={routeForm.route_name}
                    onChange={e => setRouteForm({ ...routeForm, route_name: e.target.value })}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div className="form-group">
                    <label className="form-label">Dispatch Date</label>
                    <input
                      type="date"
                      required
                      className="form-input"
                      value={routeForm.route_date}
                      onChange={e => setRouteForm({ ...routeForm, route_date: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Shift</label>
                    <select
                      className="form-select"
                      value={routeForm.shift}
                      onChange={e => setRouteForm({ ...routeForm, shift: e.target.value })}
                    >
                      <option value="MORNING">MORNING</option>
                      <option value="AFTERNOON">AFTERNOON</option>
                      <option value="NIGHT">NIGHT</option>
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Select Truck</label>
                  <select
                    className="form-select"
                    value={routeForm.vehicle_id}
                    onChange={e => setRouteForm({ ...routeForm, vehicle_id: e.target.value })}
                  >
                    <option value="">-- Unassigned (Draft) --</option>
                    {vehicles.filter(v => v.status === 'AVAILABLE').map(v => (
                      <option key={v.id} value={v.id}>{v.vehicle_number} ({v.capacity_kg} kg)</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Select Driver</label>
                  <select
                    className="form-select"
                    value={routeForm.driver_id}
                    onChange={e => setRouteForm({ ...routeForm, driver_id: e.target.value })}
                  >
                    <option value="">-- Unassigned (Draft) --</option>
                    {drivers.filter(d => d.is_active).map(d => (
                      <option key={d.id} value={d.id}>{d.full_name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" onClick={() => setNewRouteModal(false)} className="btn btn-secondary">Cancel</button>
                <button type="submit" className="btn btn-primary">Create Route</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* QR CODE PREVIEW & PRINT MODAL                                       */}
      {/* =================================================================== */}
      {qrModalItem && (
        <div className="modal-backdrop">
          <div className="modal-dialog">
            <div className="modal-header">
              <h3>Dustbin QR Public Label</h3>
              <button onClick={() => setQrModalItem(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} /></button>
            </div>
            <div className="modal-body printable-area">
              <div className="qr-sticker-preview">
                <div className="municipal-header">
                  MUNICIPAL CORPORATION • SMART WASTE
                </div>
                <img src={qrModalItem.data_uri} alt="Dustbin QR" className="qr-img" />
                <div className="bin-code-label">{qrModalItem.bin_code}</div>
                <div style={{ fontSize: '0.8rem', color: '#4e6357', marginTop: '0.2rem' }}>
                  {qrModalItem.building_name || 'Public Waste Bin'}
                </div>
                <div className="scan-callout">
                  SCAN WITH PHONE CAMERA TO REPORT OVERFLOW
                </div>
              </div>

              <div style={{ marginTop: '1.25rem', textAlign: 'center', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Target Public URL: <code style={{ wordBreak: 'break-all' }}>{qrModalItem.target_url}</code>
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => handleDownloadQRPNG(qrModalItem)} className="btn btn-outline">
                <Download size={14} /> Download PNG
              </button>
              <button onClick={() => window.print()} className="btn btn-primary">
                <Printer size={14} /> Print Sticker
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* PROOF REVIEW MODAL (PHASE 5)                                        */}
      {/* =================================================================== */}
      {proofReviewModal && (
        <div className="modal-backdrop">
          <div className="modal-dialog modal-dialog-lg">
            <div className="modal-header">
              <h3>Collection Proof & AI Evidence Review</h3>
              <button onClick={() => setProofReviewModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} /></button>
            </div>
            <form onSubmit={handleReviewProofSubmit}>
              <div className="modal-body">
                {/* Side-by-side comparison */}
                <div className="proof-comparison-grid">
                  <div>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-subtle)', marginBottom: '0.35rem', textTransform: 'uppercase' }}>
                      Citizen Original Complaint Photo
                    </div>
                    <div className="proof-img-frame">
                      {proofReviewModal.original_image_url ? (
                        <img src={proofReviewModal.original_image_url} alt="Original Complaint" />
                      ) : (
                        <div style={{ color: '#aaa', fontSize: '0.8rem' }}>No original photo submitted</div>
                      )}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-subtle)', marginBottom: '0.35rem', textTransform: 'uppercase' }}>
                      Driver Completion Photo Proof
                    </div>
                    <div className="proof-img-frame">
                      <img src={proofReviewModal.image_url} alt="Driver Completion Proof" />
                    </div>
                  </div>
                </div>

                {/* AI Cleanliness Recommendation */}
                {proofReviewModal.ai_comparison_result && (
                  <div style={{ background: 'var(--forest-50)', border: '1px solid #a7f3d0', borderRadius: 'var(--radius-md)', padding: '0.85rem', marginBottom: '1rem' }}>
                    <div style={{ fontWeight: 700, color: 'var(--forest-900)', fontSize: '0.85rem', marginBottom: '0.2rem' }}>
                      EcoVision Cleanliness Comparison Diagnostic:
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--forest-800)' }}>
                      Outcome: <strong>{proofReviewModal.ai_comparison_result.outcome}</strong> (Confidence: {Math.round(proofReviewModal.ai_comparison_result.confidence * 100)}%)
                    </div>
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">Review Decision *</label>
                  <div style={{ display: 'flex', gap: '1rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontWeight: 600, color: 'var(--status-success)' }}>
                      <input
                        type="radio"
                        name="decision"
                        value="APPROVED"
                        checked={reviewDecision === 'APPROVED'}
                        onChange={() => setReviewDecision('APPROVED')}
                      />
                      Approve & Mark Resolved
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontWeight: 600, color: 'var(--status-danger)' }}>
                      <input
                        type="radio"
                        name="decision"
                        value="REJECTED"
                        checked={reviewDecision === 'REJECTED'}
                        onChange={() => setReviewDecision('REJECTED')}
                      />
                      Reject Proof (Request Re-collection)
                    </label>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Official Review Notes</label>
                  <textarea
                    rows={2}
                    className="form-textarea"
                    placeholder="Provide any feedback for driver or audit history..."
                    value={reviewNotes}
                    onChange={e => setReviewNotes(e.target.value)}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" onClick={() => setProofReviewModal(null)} className="btn btn-secondary">Cancel</button>
                <button type="submit" className="btn btn-primary">Submit Decision</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* COMPLAINT RESOLUTION MODAL (PHASE 5)                                */}
      {/* =================================================================== */}
      {complaintModal && (
        <div className="modal-backdrop">
          <div className="modal-dialog">
            <div className="modal-header">
              <h3>Resolve Citizen Complaint: {complaintModal.complaint_number}</h3>
              <button onClick={() => setComplaintModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} /></button>
            </div>
            <form onSubmit={handleResolveComplaintSubmit}>
              <div className="modal-body">
                <div style={{ background: '#f8faf9', padding: '0.75rem', borderRadius: '6px', marginBottom: '1rem', border: '1px solid var(--border-color)', fontSize: '0.88rem' }}>
                  <strong>Citizen Statement:</strong>
                  <p style={{ marginTop: '0.25rem', color: 'var(--text-main)' }}>"{complaintModal.complaint_text}"</p>
                </div>

                <div className="form-group">
                  <label className="form-label">Target Status *</label>
                  <select
                    className="form-select"
                    value={complaintResolutionStatus}
                    onChange={e => setComplaintResolutionStatus(e.target.value)}
                  >
                    <option value="RECOVERY_SCHEDULED">RECOVERY_SCHEDULED (Dispatch crew scheduled)</option>
                    <option value="RESOLVED">RESOLVED (Collection verified)</option>
                    <option value="UNDER_REVIEW">UNDER_REVIEW (Still investigating)</option>
                    <option value="REJECTED">REJECTED (Invalid or unfounded)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Resolution Notes / Action Taken *</label>
                  <textarea
                    required
                    rows={3}
                    className="form-textarea"
                    placeholder="Detail the operational recovery action taken..."
                    value={complaintNote}
                    onChange={e => setComplaintNote(e.target.value)}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" onClick={() => setComplaintModal(null)} className="btn btn-secondary">Cancel</button>
                <button type="submit" className="btn btn-primary">Update Complaint</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* CONFIRMATION DIALOG PRIMITIVE                                       */}
      {/* =================================================================== */}
      {confirmDialog.open && (
        <div className="modal-backdrop">
          <div className="modal-dialog" style={{ maxWidth: '440px' }}>
            <div className="modal-header">
              <h3>{confirmDialog.title}</h3>
              <button onClick={() => setConfirmDialog(prev => ({ ...prev, open: false }))} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: '0.9rem', color: 'var(--text-main)' }}>{confirmDialog.message}</p>
            </div>
            <div className="modal-footer">
              <button onClick={() => setConfirmDialog(prev => ({ ...prev, open: false }))} className="btn btn-secondary">
                Cancel
              </button>
              <button
                onClick={confirmDialog.onConfirm}
                className={`btn ${confirmDialog.danger ? 'btn-danger' : 'btn-primary'}`}
              >
                {confirmDialog.confirmText || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* DRIVER ISSUE RESPONSE MODAL                                         */}
      {/* =================================================================== */}
      {selectedDriverIssueModal && (
        <div className="modal-backdrop">
          <div className="modal-dialog">
            <div className="modal-header">
              <h3>Review Driver Issue #{selectedDriverIssueModal.id?.slice(0, 8)}</h3>
              <button onClick={() => setSelectedDriverIssueModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} /></button>
            </div>
            <form onSubmit={handleRespondDriverIssue}>
              <div className="modal-body">
                <div style={{ background: '#f8fafc', padding: '0.85rem', borderRadius: 'var(--radius-md)', marginBottom: '1rem', border: '1px solid var(--border-color)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{selectedDriverIssueModal.driver_name || 'Driver'}</span>
                    <span className="badge badge-warning">{selectedDriverIssueModal.category?.replace(/_/g, ' ')}</span>
                  </div>
                  <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.88rem', color: 'var(--text-main)', whiteSpace: 'pre-wrap' }}>
                    {selectedDriverIssueModal.description}
                  </p>
                  {selectedDriverIssueModal.photo_url && (
                    <div style={{ marginTop: '0.75rem' }}>
                      <img
                        src={selectedDriverIssueModal.photo_url}
                        alt="Issue Evidence"
                        style={{ width: '100%', maxHeight: '200px', objectFit: 'cover', borderRadius: '6px', border: '1px solid var(--border-color)' }}
                      />
                    </div>
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label">Update Ticket Status *</label>
                  <select
                    className="form-select"
                    value={issueResponseStatus}
                    onChange={e => setIssueResponseStatus(e.target.value as any)}
                  >
                    <option value="IN_PROGRESS">IN PROGRESS (Dispatched Mechanic / Alternate Route Assigned)</option>
                    <option value="RESOLVED">RESOLVED (Issue Addressed / Route Resumed)</option>
                    <option value="CLOSED">CLOSED (Archived Ticket)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Official Operations Response to Driver *</label>
                  <textarea
                    required
                    rows={4}
                    className="form-textarea"
                    placeholder="e.g. Mechanic dispatched to your location. Skip Stop #4 and proceed to Stop #5..."
                    value={issueResponseNotes}
                    onChange={e => setIssueResponseNotes(e.target.value)}
                  />
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                    This response will immediately notify the driver in their portal and update their live run sheet.
                  </p>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" onClick={() => setSelectedDriverIssueModal(null)} className="btn btn-secondary">Cancel</button>
                <button type="submit" className="btn btn-primary">Submit Response & Notify Driver</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
