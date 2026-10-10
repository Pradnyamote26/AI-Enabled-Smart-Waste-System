import React, { useState, useEffect, useMemo } from 'react';
import {
  PlusCircle, Search, Calendar, Bell, HelpCircle, AlertTriangle,
  Truck, CheckCircle2, Clock, MapPin, Radio, Shield,
  RefreshCw, Camera, ArrowRight, X, FileText,
  User, Check, AlertCircle, Copy, Sparkles,
  Zap, ShieldCheck, CheckCheck
} from 'lucide-react';
import { api } from '../../services/api';
import { MapComponent } from '../../components/MapComponent';
import type { MapMarkerItem } from '../../components/MapComponent';

export type PublicPortalTab =
  | 'home'
  | 'report'
  | 'track'
  | 'schedules'
  | 'announcements'
  | 'missed'
  | 'faq'
  | 'my-reports';

interface PublicPortalProps {
  initialTab?: PublicPortalTab;
  initialTrackToken?: string;
  currentUser?: any | null;
  onOpenAuth?: (role: 'admin' | 'driver' | 'reporter') => void;
  onTrackRedirect?: (token: string) => void;
}

export const PublicPortal: React.FC<PublicPortalProps> = ({
  initialTab = 'home',
  initialTrackToken = '',
  currentUser,
  onOpenAuth,
  onTrackRedirect
}) => {
  const [activeTab, setActiveTab] = useState<PublicPortalTab>(initialTab);
  const [trackTokenInput, setTrackTokenInput] = useState(initialTrackToken);
  const [activeReport, setActiveReport] = useState<any | null>(null);
  const [isLoadingTrack, setIsLoadingTrack] = useState(false);
  const [trackError, setTrackError] = useState<string | null>(null);

  // Schedules state
  const [schedules, setSchedules] = useState<any[]>([]);
  const [serviceAreas, setServiceAreas] = useState<any[]>([]);
  const [buildings, setBuildings] = useState<any[]>([]);
  const [selectedAreaFilter, setSelectedAreaFilter] = useState('');
  const [selectedBuildingFilter, setSelectedBuildingFilter] = useState('');
  const [selectedDayFilter, setSelectedDayFilter] = useState('');
  const [isLoadingSchedules, setIsLoadingSchedules] = useState(false);

  // Announcements state
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [isLoadingAnnouncements, setIsLoadingAnnouncements] = useState(false);

  // Notifications state (for authenticated residents)
  const [citizenNotifications, setCitizenNotifications] = useState<any[]>([]);
  const [unreadNotifsCount, setUnreadNotifsCount] = useState(0);

  // My Reports state
  const [myReports, setMyReports] = useState<any[]>([]);
  const [isLoadingMyReports, setIsLoadingMyReports] = useState(false);

  // Report Submission state
  const [reportType, setReportType] = useState('OVERFLOWING_BIN');
  const [reportDesc, setReportDesc] = useState('');
  const [reportAddress, setReportAddress] = useState('');
  const [reportContact, setReportContact] = useState('');
  const [reportLat, setReportLat] = useState(19.0760);
  const [reportLng, setReportLng] = useState(72.9975);
  const [reportImagePreview, setReportImagePreview] = useState<string | null>(null);
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [reportSubmitSuccess, setReportSubmitSuccess] = useState<any | null>(null);
  const [reportSubmitError, setReportSubmitError] = useState<string | null>(null);
  const [gpsAccuracyMsg, setGpsAccuracyMsg] = useState<string | null>(null);

  // Reopen / Follow-up modal state
  const [reopenModalOpen, setReopenModalOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState('');
  const [reopenImagePreview, setReopenImagePreview] = useState<string | null>(null);
  const [isSubmittingReopen, setIsSubmittingReopen] = useState(false);
  const [reopenSuccessMsg, setReopenSuccessMsg] = useState<string | null>(null);
  const [reopenErrorMsg, setReopenErrorMsg] = useState<string | null>(null);

  // Missed Collection direct form state
  const [missedTokenInput, setMissedTokenInput] = useState('');
  const [missedComplaintText, setMissedComplaintText] = useState('');
  const [isSubmittingMissed, setIsSubmittingMissed] = useState(false);
  const [missedSuccessMsg, setMissedSuccessMsg] = useState<string | null>(null);
  const [missedErrorMsg, setMissedErrorMsg] = useState<string | null>(null);

  // Copy token helper
  const [copiedToken, setCopiedToken] = useState(false);

  // Sync initial tab / token
  useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (initialTrackToken) {
      setTrackTokenInput(initialTrackToken);
      fetchTracking(initialTrackToken);
    }
  }, [initialTrackToken]);

  // Load announcements & schedules on mount
  useEffect(() => {
    loadAnnouncements();
    loadSchedules();
  }, []);

  // Load citizen notifications if logged in
  useEffect(() => {
    if (currentUser?.role === 'reporter') {
      loadCitizenNotifications();
      loadMyReports();
    }
  }, [currentUser]);

  // Polling for live tracking if report has active telemetry
  useEffect(() => {
    if (activeReport?.live_tracking?.has_live_tracking && trackTokenInput) {
      const interval = setInterval(() => {
        api.trackReport(trackTokenInput.trim()).then(data => {
          setActiveReport(data);
        }).catch(() => {});
      }, 10000);
      return () => clearInterval(interval);
    }
  }, [activeReport?.live_tracking?.has_live_tracking, trackTokenInput]);

  const loadAnnouncements = async () => {
    setIsLoadingAnnouncements(true);
    try {
      const data = await api.getPublicAnnouncements();
      setAnnouncements(data.announcements || []);
    } catch {
      // Fallback
    } finally {
      setIsLoadingAnnouncements(false);
    }
  };

  const loadSchedules = async () => {
    setIsLoadingSchedules(true);
    try {
      const data = await api.getPublicSchedules({
        service_area_id: selectedAreaFilter || undefined,
        building_id: selectedBuildingFilter || undefined,
        weekday: selectedDayFilter !== '' ? Number(selectedDayFilter) : undefined
      });
      setSchedules(data.schedules || []);
      if (data.service_areas) setServiceAreas(data.service_areas);
      if (data.buildings) setBuildings(data.buildings);
    } catch {
      // Fallback
    } finally {
      setIsLoadingSchedules(false);
    }
  };

  const loadCitizenNotifications = async () => {
    try {
      const data = await api.getCitizenNotifications();
      setCitizenNotifications(data.notifications || []);
      setUnreadNotifsCount(data.unread_count || 0);
    } catch {
      // Silently catch
    }
  };

  const loadMyReports = async () => {
    setIsLoadingMyReports(true);
    try {
      const data = await api.getMyReports();
      setMyReports(data || []);
    } catch {
      // Silently catch
    } finally {
      setIsLoadingMyReports(false);
    }
  };

  const fetchTracking = async (token: string) => {
    if (!token.trim()) return;
    setIsLoadingTrack(true);
    setTrackError(null);
    try {
      const data = await api.trackReport(token.trim());
      setActiveReport(data);
    } catch (err: any) {
      setTrackError(err.message || 'No report found matching this tracking token.');
      setActiveReport(null);
    } finally {
      setIsLoadingTrack(false);
    }
  };

  const handleTrackSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchTracking(trackTokenInput);
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 2500);
  };

  const handleReportImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 8 * 1024 * 1024) {
        setReportSubmitError('Image size exceeds 8MB limit. Please upload a smaller photo.');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setReportImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRequestGps = () => {
    if (!navigator.geolocation) {
      setGpsAccuracyMsg('Geolocation not supported by device. Please click on map below.');
      return;
    }
    setGpsAccuracyMsg('Acquiring high-precision GPS fix and street landmark...');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setReportLat(lat);
        setReportLng(lng);
        setGpsAccuracyMsg(`GPS acquired (±${Math.round(pos.coords.accuracy)}m) • Identifying landmark...`);
        try {
          const res = await api.reverseGeocode(lat, lng);
          if (res && res.address) {
            setReportAddress(res.address);
            setGpsAccuracyMsg(`GPS acquired (±${Math.round(pos.coords.accuracy)}m) • Landmark: ${res.address}`);
          }
        } catch {
          setGpsAccuracyMsg(`GPS coordinates acquired (±${Math.round(pos.coords.accuracy)}m accuracy)`);
        }
      },
      () => {
        setGpsAccuracyMsg('Location permission denied. Click map to set pin.');
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  const handleReportFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingReport(true);
    setReportSubmitError(null);
    setReportSubmitSuccess(null);

    try {
      const payload = {
        report_type: reportType,
        latitude: reportLat,
        longitude: reportLng,
        address_text: reportAddress || `Coordinate (${reportLat.toFixed(4)}, ${reportLng.toFixed(4)})`,
        description: reportDesc,
        reporter_contact: reportContact,
        image: reportImagePreview || undefined
      };

      const res = await api.submitPublicReport(payload);
      setReportSubmitSuccess(res);
      // Refresh user reports if logged in
      if (currentUser?.role === 'reporter') {
        loadMyReports();
      }
    } catch (err: any) {
      setReportSubmitError(err.message || 'Failed to submit report.');
    } finally {
      setIsSubmittingReport(false);
    }
  };

  const handleReopenSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reopenReason.trim() || !trackTokenInput.trim()) return;
    setIsSubmittingReopen(true);
    setReopenErrorMsg(null);
    setReopenSuccessMsg(null);

    try {
      await api.reopenReport(trackTokenInput.trim(), {
        reason: reopenReason.trim(),
        image: reopenImagePreview || undefined
      });
      setReopenSuccessMsg('Follow-up request filed successfully. Municipal supervisors have been alerted.');
      setReopenReason('');
      setReopenImagePreview(null);
      setReopenModalOpen(false);
      // Refresh tracking
      fetchTracking(trackTokenInput.trim());
    } catch (err: any) {
      setReopenErrorMsg(err.message || 'Failed to file follow-up request.');
    } finally {
      setIsSubmittingReopen(false);
    }
  };

  const handleDirectMissedSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!missedTokenInput.trim() || !missedComplaintText.trim()) return;
    setIsSubmittingMissed(true);
    setMissedErrorMsg(null);
    setMissedSuccessMsg(null);

    try {
      await api.fileMissedCollection(missedTokenInput.trim(), missedComplaintText.trim());
      setMissedSuccessMsg('Missed collection alert registered with municipal dispatch.');
      setMissedComplaintText('');
      setMissedTokenInput('');
    } catch (err: any) {
      setMissedErrorMsg(err.message || 'Failed to submit missed collection report.');
    } finally {
      setIsSubmittingMissed(false);
    }
  };

  // Map markers for tracking
  const liveTracking = activeReport?.live_tracking;
  const trackingMapMarkers = useMemo<MapMarkerItem[]>(() => {
    if (!liveTracking) return [];
    const markers: MapMarkerItem[] = [];

    if (liveTracking.vehicle_location?.latitude && liveTracking.vehicle_location?.longitude) {
      markers.push({
        id: 'truck-live',
        lat: liveTracking.vehicle_location.latitude,
        lng: liveTracking.vehicle_location.longitude,
        title: `Collection Truck (${liveTracking.vehicle_number || 'En Route'})`,
        type: 'VEHICLE',
        subtitle: liveTracking.is_stale ? 'GPS Signal Stale (>3m)' : 'Live active collection unit'
      });
    }

    if (liveTracking.destination_location?.latitude && liveTracking.destination_location?.longitude) {
      markers.push({
        id: 'target-point',
        lat: liveTracking.destination_location.latitude,
        lng: liveTracking.destination_location.longitude,
        title: 'Collection Target (Your Report)',
        type: 'REPORT',
        subtitle: liveTracking.destination_location.address || 'Reported waste point'
      });
    }

    return markers;
  }, [liveTracking]);

  const trackingPolyline = useMemo<Array<[number, number]>>(() => {
    if (
      liveTracking?.vehicle_location?.latitude &&
      liveTracking?.vehicle_location?.longitude &&
      liveTracking?.destination_location?.latitude &&
      liveTracking?.destination_location?.longitude
    ) {
      return [
        [liveTracking.vehicle_location.latitude, liveTracking.vehicle_location.longitude],
        [liveTracking.destination_location.latitude, liveTracking.destination_location.longitude]
      ];
    }
    return [];
  }, [liveTracking]);

  const reportMapMarkers: MapMarkerItem[] = useMemo(() => [
    {
      id: 'selected-location',
      lat: reportLat,
      lng: reportLng,
      title: 'Incident Location',
      type: 'PIN',
      subtitle: reportAddress || 'Selected waste position'
    }
  ], [reportLat, reportLng, reportAddress]);

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'SUBMITTED':
      case 'ANALYZING':
        return <span className="badge badge-pending">Analyzing & Queued</span>;
      case 'PENDING_REVIEW':
      case 'WAITING_FOR_VEHICLE':
        return <span className="badge badge-pending">Pending Dispatch</span>;
      case 'ASSIGNED':
      case 'IN_COLLECTION':
        return <span className="badge badge-active">Assigned to Truck</span>;
      case 'AWAITING_PROOF_REVIEW':
        return <span className="badge badge-active">Collection Proof Submitted</span>;
      case 'COMPLETED':
      case 'RESOLVED':
        return <span className="badge badge-success">Resolved & Verified</span>;
      case 'REOPENED':
        return <span className="badge badge-danger">Follow-up Under Review</span>;
      case 'REJECTED':
      case 'DUPLICATE':
        return <span className="badge badge-neutral">Closed</span>;
      default:
        return <span className="badge badge-neutral">{status}</span>;
    }
  };

  return (
    <div className="public-portal-root" style={{ minHeight: '90vh', background: '#f8faf9', paddingBottom: '4rem' }}>
      {/* Hero Header */}
      <div className="portal-hero-section">
        <div style={{ maxWidth: '1360px', margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1.25rem' }}>
            <div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', background: 'rgba(82, 183, 136, 0.2)', border: '1px solid rgba(82, 183, 136, 0.35)', padding: '0.28rem 0.75rem', borderRadius: '50px', fontSize: '0.78rem', fontWeight: 700, color: '#86efac', marginBottom: '0.6rem' }}>
                <Shield size={13} /> Official Municipal Resident Portal
              </div>
              <h1 style={{ fontSize: '1.95rem', fontWeight: 800, margin: '0 0 0.35rem', letterSpacing: '-0.025em', color: '#ffffff' }}>
                EcoRoute Waste Services Portal
              </h1>
              <p style={{ color: '#d1fae5', fontSize: '0.92rem', maxWidth: '780px', margin: 0, lineHeight: 1.5, opacity: 0.95 }}>
                AI-driven municipal sanitation intelligence: report neighborhood waste issues, follow assigned compactor trucks with live GPS radar, and view verified photographic resolution proofs.
              </p>
            </div>

            {/* Resident account status widget */}
            <div>
              {currentUser?.role === 'reporter' ? (
                <div style={{ background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(10px)', padding: '0.75rem 1.15rem', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.22)', boxShadow: '0 4px 16px rgba(0,0,0,0.1)' }}>
                  <div style={{ fontSize: '0.72rem', color: '#a7f3d0', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
                    Active Resident Session
                  </div>
                  <div style={{ fontWeight: 800, fontSize: '1rem', color: '#ffffff', marginTop: '0.15rem' }}>
                    {currentUser.full_name}
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.45rem', alignItems: 'center' }}>
                    <button
                      onClick={() => setActiveTab('my-reports')}
                      className="btn btn-sm btn-outline"
                      style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', padding: '0.25rem 0.65rem' }}
                    >
                      <FileText size={13} /> My Reports ({myReports.length})
                    </button>
                    {unreadNotifsCount > 0 && (
                      <span style={{ background: '#ef4444', color: '#fff', fontSize: '0.72rem', padding: '0.2rem 0.5rem', borderRadius: '50px', fontWeight: 700 }}>
                        {unreadNotifsCount} new
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <div style={{ background: 'rgba(0,0,0,0.28)', backdropFilter: 'blur(10px)', padding: '0.85rem 1.25rem', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.18)', textAlign: 'right' }}>
                  <div style={{ fontSize: '0.78rem', color: '#cbd5e1' }}>Registered Resident or Society Lead?</div>
                  <button
                    onClick={() => onOpenAuth && onOpenAuth('reporter')}
                    className="btn btn-sm btn-primary"
                    style={{ marginTop: '0.4rem', fontSize: '0.82rem', padding: '0.35rem 0.9rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                  >
                    <User size={13} /> Sign In to Save Tickets
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Quick-Action Navigation Tabs */}
          <div className="portal-tabs-dock">
            <button
              onClick={() => setActiveTab('home')}
              className={`portal-nav-chip ${activeTab === 'home' ? 'active' : ''}`}
            >
              <Sparkles size={14} /> Services Hub
            </button>
            <button
              onClick={() => setActiveTab('report')}
              className={`portal-nav-chip ${activeTab === 'report' ? 'active' : ''}`}
            >
              <PlusCircle size={14} /> Report Waste
            </button>
            <button
              onClick={() => setActiveTab('track')}
              className={`portal-nav-chip ${activeTab === 'track' ? 'active' : ''}`}
            >
              <Search size={14} /> Track Request & ETA
            </button>
            <button
              onClick={() => setActiveTab('schedules')}
              className={`portal-nav-chip ${activeTab === 'schedules' ? 'active' : ''}`}
            >
              <Calendar size={14} /> Collection Schedules
            </button>
            <button
              onClick={() => setActiveTab('announcements')}
              className={`portal-nav-chip ${activeTab === 'announcements' ? 'active' : ''}`}
            >
              <Bell size={14} /> Service Bulletins
              {announcements.length > 0 && <span style={{ marginLeft: '4px', background: '#22c55e', color: '#fff', fontSize: '10px', padding: '1px 6px', borderRadius: '10px', fontWeight: 800 }}>{announcements.length}</span>}
            </button>
            <button
              onClick={() => setActiveTab('missed')}
              className={`portal-nav-chip ${activeTab === 'missed' ? 'active' : ''}`}
            >
              <AlertTriangle size={14} /> Missed Pickup
            </button>
            <button
              onClick={() => setActiveTab('faq')}
              className={`portal-nav-chip ${activeTab === 'faq' ? 'active' : ''}`}
            >
              <HelpCircle size={14} /> Help & FAQs
            </button>
            {currentUser?.role === 'reporter' && (
              <button
                onClick={() => setActiveTab('my-reports')}
                className={`portal-nav-chip ${activeTab === 'my-reports' ? 'active' : ''}`}
              >
                <FileText size={14} /> My Reports ({myReports.length})
              </button>
            )}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: '1360px', margin: '2rem auto 3rem', padding: '0 1.25rem' }}>
        {/* ================================================================= */}
        {/* TAB 1: HOME SERVICES HUB                                          */}
        {/* ================================================================= */}
        {activeTab === 'home' && (
          <div>
            {/* Urgent Bulletin Notice if available */}
            {announcements.length > 0 && (
              <div className="bulletin-banner-modern">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                  <span className="pulse-beacon" />
                  <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#d1fae5', color: '#047857', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Bell size={18} />
                  </div>
                </div>
                <div style={{ flex: 1, minWidth: '220px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#047857', background: '#d1fae5', padding: '0.15rem 0.5rem', borderRadius: '4px', letterSpacing: '0.04em' }}>
                      ACTIVE CIVIC ADVISORY
                    </span>
                    <span style={{ fontWeight: 800, fontSize: '0.98rem', color: '#065f46' }}>
                      {announcements[0].title}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.86rem', color: '#047857', marginTop: '0.25rem', lineHeight: 1.45 }}>
                    {announcements[0].content}
                  </div>
                </div>
                <button
                  onClick={() => setActiveTab('announcements')}
                  className="btn btn-sm"
                  style={{ background: '#047857', color: '#ffffff', fontWeight: 700, borderRadius: '8px', padding: '0.5rem 1rem', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', border: 'none' }}
                >
                  View All Bulletins <ArrowRight size={14} />
                </button>
              </div>
            )}

            {/* Live Municipal Operations Telemetry Ribbon */}
            <div className="operations-ribbon">
              <div className="telemetry-card">
                <div className="telemetry-icon-box" style={{ background: '#ecfdf5', color: '#10b981' }}>
                  <Truck size={22} />
                </div>
                <div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--forest-900)' }}>
                    24 Fleets Active
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    Live GPS compactor telemetry
                  </div>
                </div>
              </div>

              <div className="telemetry-card">
                <div className="telemetry-icon-box" style={{ background: '#e0f2fe', color: '#0284c7' }}>
                  <Zap size={22} />
                </div>
                <div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--forest-900)' }}>
                    &lt; 1.5h Dispatch
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    Average priority response
                  </div>
                </div>
              </div>

              <div className="telemetry-card">
                <div className="telemetry-icon-box" style={{ background: '#fef3c7', color: '#d97706' }}>
                  <CheckCheck size={22} />
                </div>
                <div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--forest-900)' }}>
                    96.8% Same-Day SLA
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    Civic clearance fulfillment
                  </div>
                </div>
              </div>

              <div className="telemetry-card">
                <div className="telemetry-icon-box" style={{ background: '#f3e8ff', color: '#9333ea' }}>
                  <ShieldCheck size={22} />
                </div>
                <div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--forest-900)' }}>
                    100% Photo Proof
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    Verified site resolution
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Service Cards Section Header */}
            <div style={{ marginBottom: '1.35rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <h2 style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--forest-900)', margin: '0 0 0.25rem', letterSpacing: '-0.01em' }}>
                  Municipal Citizen Services
                </h2>
                <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text-muted)' }}>
                  Instant digital sanitation services powered by AI triage, Clarke-Wright routing, and live vehicle tracking.
                </p>
              </div>
            </div>

            {/* 4 Interactive Service Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.35rem', marginBottom: '2.75rem' }}>
              {/* Card 1: Report Waste */}
              <div
                onClick={() => setActiveTab('report')}
                className="public-service-card card-report"
              >
                <div>
                  <div className="service-card-top">
                    <div className="service-card-icon-modern" style={{ background: 'linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%)', color: '#16a34a', boxShadow: '0 4px 12px rgba(22, 163, 74, 0.15)' }}>
                      <PlusCircle size={26} />
                    </div>
                    <span className="service-card-badge" style={{ background: '#dcfce7', color: '#15803d' }}>
                      Instant AI Triage
                    </span>
                  </div>
                  <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--forest-900)', margin: '0 0 0.45rem' }}>
                    Report Waste Incident
                  </h3>
                  <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
                    Upload photo evidence of overflowing bins, street spills, or illegal dumping. On-device AI classifies waste type, volume, and tags GPS coordinates automatically.
                  </p>
                </div>
                <div className="service-card-action" style={{ color: '#16a34a' }}>
                  <span>File Incident Report</span>
                  <ArrowRight size={16} />
                </div>
              </div>

              {/* Card 2: Track Request */}
              <div
                onClick={() => setActiveTab('track')}
                className="public-service-card card-track"
              >
                <div>
                  <div className="service-card-top">
                    <div className="service-card-icon-modern" style={{ background: 'linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%)', color: '#0284c7', boxShadow: '0 4px 12px rgba(2, 132, 199, 0.15)' }}>
                      <Radio size={26} />
                    </div>
                    <span className="service-card-badge" style={{ background: '#e0f2fe', color: '#0369a1' }}>
                      Live GPS Radar
                    </span>
                  </div>
                  <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--forest-900)', margin: '0 0 0.45rem' }}>
                    Track Request & Radar
                  </h3>
                  <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
                    Follow your assigned municipal compactor in real-time with road route geometry, estimated arrival time (ETA), driver details, and before/after photos.
                  </p>
                </div>
                <div className="service-card-action" style={{ color: '#0284c7' }}>
                  <span>Track With Secret Token</span>
                  <ArrowRight size={16} />
                </div>
              </div>

              {/* Card 3: Collection Schedules */}
              <div
                onClick={() => setActiveTab('schedules')}
                className="public-service-card card-schedule"
              >
                <div>
                  <div className="service-card-top">
                    <div className="service-card-icon-modern" style={{ background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)', color: '#d97706', boxShadow: '0 4px 12px rgba(217, 119, 6, 0.15)' }}>
                      <Calendar size={26} />
                    </div>
                    <span className="service-card-badge" style={{ background: '#fef3c7', color: '#b45309' }}>
                      Daily 06:30 AM
                    </span>
                  </div>
                  <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--forest-900)', margin: '0 0 0.45rem' }}>
                    Collection Schedules
                  </h3>
                  <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
                    Find daily and weekly municipal garbage collection timings, route shifts, and compactor truck service windows for your residential sector.
                  </p>
                </div>
                <div className="service-card-action" style={{ color: '#d97706' }}>
                  <span>Explore Ward Timings</span>
                  <ArrowRight size={16} />
                </div>
              </div>

              {/* Card 4: Missed Collection */}
              <div
                onClick={() => setActiveTab('missed')}
                className="public-service-card card-missed"
              >
                <div>
                  <div className="service-card-top">
                    <div className="service-card-icon-modern" style={{ background: 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)', color: '#dc2626', boxShadow: '0 4px 12px rgba(220, 38, 38, 0.15)' }}>
                      <AlertTriangle size={26} />
                    </div>
                    <span className="service-card-badge" style={{ background: '#fee2e2', color: '#b91c1c' }}>
                      Priority Escalation
                    </span>
                  </div>
                  <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--forest-900)', margin: '0 0 0.45rem' }}>
                    Report Missed Collection
                  </h3>
                  <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
                    Has scheduled morning collection concluded without clearing your society or commercial premises? File an immediate supervisor escalation ticket.
                  </p>
                </div>
                <div className="service-card-action" style={{ color: '#dc2626' }}>
                  <span>Escalate Missed Pickup</span>
                  <ArrowRight size={16} />
                </div>
              </div>
            </div>

            {/* 3-Step Resident Workflow Guide */}
            <div className="workflow-guide-box">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--forest-700)', background: 'rgba(82, 183, 136, 0.2)', padding: '0.2rem 0.6rem', borderRadius: '50px' }}>
                  CITIZEN CHARTER WORKFLOW
                </span>
              </div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--forest-900)', margin: '0 0 0.35rem' }}>
                How EcoRoute Resolves Sanitation in 3 Connected Steps
              </h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', margin: 0 }}>
                Transparent, algorithmically optimized municipal workflow from citizen snapshot to certified supervisor clearance.
              </p>

              <div className="workflow-steps-grid">
                <div className="workflow-step-item">
                  <div className="workflow-step-num">01</div>
                  <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: '#dcfce7', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '0.75rem' }}>
                    <Camera size={18} />
                  </div>
                  <h4 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--forest-900)', margin: '0 0 0.35rem' }}>
                    Snap & Auto-Locate
                  </h4>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.45 }}>
                    Take a photo. On-device MobileNet/CNN classifies waste type & volume, while reverse geocoding tags the exact street landmark automatically.
                  </p>
                </div>

                <div className="workflow-step-item">
                  <div className="workflow-step-num">02</div>
                  <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: '#e0f2fe', color: '#0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '0.75rem' }}>
                    <Truck size={18} />
                  </div>
                  <h4 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--forest-900)', margin: '0 0 0.35rem' }}>
                    Dynamic Route Dispatch
                  </h4>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.45 }}>
                    Clarke-Wright heuristic solver re-sequences the nearest compactor vehicle's route, minimizing deadhead travel and broadcasting live GPS radar.
                  </p>
                </div>

                <div className="workflow-step-item">
                  <div className="workflow-step-num">03</div>
                  <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: '#f3e8ff', color: '#9333ea', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '0.75rem' }}>
                    <CheckCircle2 size={18} />
                  </div>
                  <h4 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--forest-900)', margin: '0 0 0.35rem' }}>
                    Photographic Proof & Sign-Off
                  </h4>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.45 }}>
                    Driver uploads timestamped before/after clearance proof. Depot supervisors verify closure, and citizens retain 48-hour reopen rights if unsatisfied.
                  </p>
                </div>
              </div>
            </div>

            {/* Service Commitments & Standards (SLAs) */}
            <div className="sla-charter-container">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                <ShieldCheck size={20} color="#16a34a" />
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--forest-900)', margin: 0 }}>
                  Municipal Service Level Commitments (SLAs)
                </h3>
              </div>
              <p style={{ fontSize: '0.86rem', color: 'var(--text-muted)', margin: '0.2rem 0 0' }}>
                Enforceable municipal standards backed by automated supervisor escalation and public verification.
              </p>

              <div className="sla-charter-grid">
                <div className="sla-metric-box">
                  <div style={{ fontSize: '1.65rem', fontWeight: 800, color: '#16a34a', letterSpacing: '-0.02em' }}>
                    &lt; 2 Hours
                  </div>
                  <div style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--forest-900)', marginTop: '0.25rem' }}>
                    High-Priority Response
                  </div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '0.25rem', lineHeight: 1.45 }}>
                    Hazardous materials, hospital clinic waste, and severe overflowing bin spills dispatched with priority.
                  </div>
                </div>

                <div className="sla-metric-box">
                  <div style={{ fontSize: '1.65rem', fontWeight: 800, color: '#0284c7', letterSpacing: '-0.02em' }}>
                    100% Proof
                  </div>
                  <div style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--forest-900)', marginTop: '0.25rem' }}>
                    Photographic Proof
                  </div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '0.25rem', lineHeight: 1.45 }}>
                    Drivers upload geo-tagged before/after photos verified by depot supervisors before tickets close.
                  </div>
                </div>

                <div className="sla-metric-box">
                  <div style={{ fontSize: '1.65rem', fontWeight: 800, color: '#d97706', letterSpacing: '-0.02em' }}>
                    06:30 AM
                  </div>
                  <div style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--forest-900)', marginTop: '0.25rem' }}>
                    Morning Shift Start
                  </div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '0.25rem', lineHeight: 1.45 }}>
                    All residential sectors serviced during allocated morning sanitation windows without skipping stops.
                  </div>
                </div>

                <div className="sla-metric-box">
                  <div style={{ fontSize: '1.65rem', fontWeight: 800, color: '#9333ea', letterSpacing: '-0.02em' }}>
                    48h Sign-Off
                  </div>
                  <div style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--forest-900)', marginTop: '0.25rem' }}>
                    Resident Protection
                  </div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '0.25rem', lineHeight: 1.45 }}>
                    Citizens can reopen any ticket if waste remains uncleared on site, escalating directly to senior officers.
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 2: REPORT WASTE INCIDENT                                      */}
        {/* ================================================================= */}
        {activeTab === 'report' && (
          <div style={{ maxWidth: '1360px', margin: '0 auto' }}>
            {reportSubmitSuccess ? (
              <div className="card-table-wrapper" style={{ padding: '2.5rem 2rem', textAlign: 'center', background: '#ffffff', borderRadius: 'var(--radius-lg)', maxWidth: '720px', margin: '0 auto', boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
                <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: '#dcfce7', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
                  <CheckCircle2 size={36} />
                </div>
                <h3 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--forest-900)' }}>
                  Report Successfully Registered!
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.92rem', maxWidth: '500px', margin: '0.5rem auto 1.5rem' }}>
                  Your sanitation request has been cataloged under municipal dispatch reference number:
                </p>

                <div style={{ display: 'inline-block', background: '#f1f5f9', padding: '0.75rem 1.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', marginBottom: '1.5rem' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Reference Number</div>
                  <div style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--forest-900)', fontFamily: 'monospace' }}>
                    {reportSubmitSuccess.report_number}
                  </div>
                </div>

                {reportSubmitSuccess.tracking_token && (
                  <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '1.25rem', borderRadius: 'var(--radius-md)', maxWidth: '600px', margin: '0 auto 1.5rem', textAlign: 'left' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#166534', textTransform: 'uppercase' }}>
                        Secret Public Tracking Token
                      </span>
                      <button
                        onClick={() => handleCopy(reportSubmitSuccess.tracking_token)}
                        className="btn btn-sm btn-outline"
                        style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                      >
                        {copiedToken ? <Check size={12} /> : <Copy size={12} />}
                        {copiedToken ? 'Copied' : 'Copy Token'}
                      </button>
                    </div>
                    <div style={{ fontFamily: 'monospace', fontSize: '0.85rem', wordBreak: 'break-all', background: '#ffffff', padding: '0.5rem', borderRadius: '4px', border: '1px solid #86efac' }}>
                      {reportSubmitSuccess.tracking_token}
                    </div>
                    <span style={{ fontSize: '0.75rem', color: '#15803d', display: 'block', marginTop: '0.4rem' }}>
                      Save this token to track vehicle arrival or report missed pickups anonymously.
                    </span>
                  </div>
                )}

                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
                  <button
                    onClick={() => {
                      if (reportSubmitSuccess.tracking_token) {
                        setTrackTokenInput(reportSubmitSuccess.tracking_token);
                        setActiveTab('track');
                        fetchTracking(reportSubmitSuccess.tracking_token);
                        if (onTrackRedirect) onTrackRedirect(reportSubmitSuccess.tracking_token);
                      } else {
                        setActiveTab('track');
                      }
                    }}
                    className="btn btn-primary"
                  >
                    Track This Request Now
                  </button>
                  <button
                    onClick={() => {
                      setReportSubmitSuccess(null);
                      setReportDesc('');
                      setReportImagePreview(null);
                    }}
                    className="btn btn-secondary"
                  >
                    Submit Another Report
                  </button>
                </div>
              </div>
            ) : (
              <div>
                {/* Section Header */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '1.25rem',
                  flexWrap: 'wrap',
                  gap: '0.75rem',
                  borderBottom: '1px solid var(--border-color)',
                  paddingBottom: '0.85rem'
                }}>
                  <div>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', fontWeight: 700, color: '#16a34a', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      <Sparkles size={14} /> EcoVision AI Municipal Dispatch
                    </div>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--forest-900)', margin: '0.15rem 0 0' }}>
                      File Sanitation & Garbage Collection Ticket
                    </h2>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.86rem', margin: '0.15rem 0 0' }}>
                      Fill in the details or pinpoint the map. Reports are analyzed by AI and dynamically routed to the nearest municipal compactor truck.
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <button
                      type="button"
                      onClick={handleRequestGps}
                      className="btn btn-outline btn-sm"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        background: '#ffffff',
                        color: '#166534',
                        borderColor: '#86efac'
                      }}
                    >
                      <MapPin size={14} /> Acquire Device GPS
                    </button>
                  </div>
                </div>

                <form onSubmit={handleReportFormSubmit}>
                  {reportSubmitError && (
                    <div className="alert-box alert-danger" style={{ marginBottom: '1.25rem' }}>
                      <AlertCircle size={20} />
                      <span>{reportSubmitError}</span>
                    </div>
                  )}

                  <div className="public-report-grid">
                    {/* ========================================================= */}
                    {/* COLUMN 1 (LEFT): INCIDENT DETAILS & CONTACT               */}
                    {/* ========================================================= */}
                    <div style={{
                      background: '#ffffff',
                      padding: '1.75rem',
                      borderRadius: 'var(--radius-lg)',
                      border: '1px solid var(--border-color)',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
                    }}>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        paddingBottom: '0.75rem',
                        marginBottom: '1.25rem',
                        borderBottom: '1px solid #f1f5f9'
                      }}>
                        <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#dcfce7', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.85rem' }}>
                          1
                        </div>
                        <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--forest-900)', margin: 0 }}>
                          Incident Information
                        </h3>
                      </div>

                      {/* Waste Category Selector */}
                      <div style={{ marginBottom: '1.25rem' }}>
                        <label className="form-label" style={{ fontWeight: 700, fontSize: '0.85rem' }}>
                          Waste Category <span style={{ color: '#dc2626' }}>*</span>
                        </label>
                        <select
                          className="form-select"
                          value={reportType}
                          onChange={(e) => setReportType(e.target.value)}
                          style={{ fontWeight: 600 }}
                        >
                          <option value="OVERFLOWING_BIN">Overflowing Municipal Dustbin</option>
                          <option value="NO_BIN_GARBAGE">Garbage Dumped Without Dustbin (Illegal Dumping)</option>
                          <option value="SCATTERED_WASTE">Scattered Plastic & Street Debris</option>
                          <option value="MISSED_COLLECTION">Missed Society / Building Collection</option>
                          <option value="HAZARDOUS_WASTE">Hazardous / Medical / Chemical Waste</option>
                          <option value="ILLEGAL_DUMPING">Illegal Commercial Bulk Dumping</option>
                        </select>
                      </div>

                      {/* Location & Street Landmark */}
                      <div style={{ marginBottom: '1.25rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                          <label className="form-label" style={{ fontWeight: 700, fontSize: '0.85rem', margin: 0 }}>
                            Location & Street Landmark <span style={{ color: '#dc2626' }}>*</span>
                          </label>
                          <span style={{ fontSize: '0.72rem', color: '#166534', fontWeight: 600 }}>
                            Auto-detected from GPS / Map
                          </span>
                        </div>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="e.g. Near Sector 4 Bus Stop, opposite Gulmohar Society main gate"
                          value={reportAddress}
                          onChange={(e) => setReportAddress(e.target.value)}
                          required
                          style={{ fontWeight: 500 }}
                        />
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-subtle)', marginTop: '0.25rem' }}>
                          Coordinates: {reportLat.toFixed(5)}, {reportLng.toFixed(5)} (Click map on right to adjust)
                        </div>
                      </div>

                      {/* Description & Observations */}
                      <div style={{ marginBottom: '1.25rem' }}>
                        <label className="form-label" style={{ fontWeight: 700, fontSize: '0.85rem' }}>
                          Description & Observations
                        </label>
                        <textarea
                          className="form-textarea"
                          rows={3}
                          placeholder="Describe severity, spillover onto pedestrian footpath, foul odor, or stray animal disturbance..."
                          value={reportDesc}
                          onChange={(e) => setReportDesc(e.target.value)}
                        />
                        {/* Quick-Pick Tags */}
                        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginTop: '0.4rem' }}>
                          {['Overflowing', 'Foul Odor', 'Footpath Blocked', 'Stray Animals', 'Plastic Dump'].map((tag) => (
                            <button
                              key={tag}
                              type="button"
                              onClick={() => {
                                setReportDesc((prev) => prev ? `${prev}, ${tag}` : tag);
                              }}
                              className="btn btn-sm btn-ghost"
                              style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem', background: '#f1f5f9', borderRadius: '12px' }}
                            >
                              + {tag}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Contact Info (Phone / Email) */}
                      <div style={{ marginBottom: '1.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                          <label className="form-label" style={{ fontWeight: 700, fontSize: '0.85rem', margin: 0 }}>
                            Phone / Email (For Status Alerts)
                          </label>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-subtle)' }}>
                            Optional & Protected
                          </span>
                        </div>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="e.g. 9820098200 or citizen@example.com (Kept strictly private)"
                          value={reportContact}
                          onChange={(e) => setReportContact(e.target.value)}
                        />
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-subtle)', display: 'block', marginTop: '0.25rem' }}>
                          🔒 Contact details are never public and only used for municipal resolution updates.
                        </span>
                      </div>

                      {/* Submit Button */}
                      <button
                        type="submit"
                        disabled={isSubmittingReport}
                        className="btn btn-primary btn-lg"
                        style={{ width: '100%', justifyContent: 'center', fontSize: '1rem', fontWeight: 700, padding: '0.85rem' }}
                      >
                        {isSubmittingReport ? (
                          <>
                            <RefreshCw size={18} className="animate-spin" />
                            Analyzing with EcoVision AI & Dispatching...
                          </>
                        ) : (
                          <>
                            <Sparkles size={18} /> Submit Municipal Waste Ticket
                          </>
                        )}
                      </button>
                    </div>

                    {/* ========================================================= */}
                    {/* COLUMN 2 (RIGHT): VISUAL EVIDENCE & MAP PINPICKER         */}
                    {/* ========================================================= */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                      {/* Map Card */}
                      <div style={{
                        background: '#ffffff',
                        padding: '1.5rem',
                        borderRadius: 'var(--radius-lg)',
                        border: '1px solid var(--border-color)',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#dbeafe', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.85rem' }}>
                              2
                            </div>
                            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--forest-900)', margin: 0 }}>
                              Map Location Pinpoint
                            </h3>
                          </div>
                          <button
                            type="button"
                            onClick={handleRequestGps}
                            className="btn btn-sm btn-outline"
                            style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.3rem', color: '#166534', borderColor: '#86efac' }}
                          >
                            <MapPin size={12} /> Acquire GPS
                          </button>
                        </div>

                        {gpsAccuracyMsg && (
                          <div style={{
                            fontSize: '0.75rem',
                            color: '#166534',
                            background: '#f0fdf4',
                            border: '1px solid #bbf7d0',
                            padding: '0.4rem 0.65rem',
                            borderRadius: 'var(--radius-sm)',
                            marginBottom: '0.65rem',
                            fontWeight: 600
                          }}>
                            {gpsAccuracyMsg}
                          </div>
                        )}

                        <div style={{ borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
                          <MapComponent
                            markers={reportMapMarkers}
                            onLocationSelect={async (lat, lng) => {
                              setReportLat(lat);
                              setReportLng(lng);
                              setGpsAccuracyMsg(`Pinned at: ${lat.toFixed(5)}, ${lng.toFixed(5)} • Identifying landmark...`);
                              try {
                                const res = await api.reverseGeocode(lat, lng);
                                if (res && res.address) {
                                  setReportAddress(res.address);
                                  setGpsAccuracyMsg(`Pinned: ${res.address}`);
                                }
                              } catch {
                                setGpsAccuracyMsg(`Pinned at: ${lat.toFixed(5)}, ${lng.toFixed(5)}`);
                              }
                            }}
                            center={[reportLat, reportLng]}
                            height="280px"
                            zoom={15}
                          />
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-subtle)', marginTop: '0.4rem', textAlign: 'center' }}>
                          💡 Tip: Click anywhere on the map to pinpoint exact bin or street location
                        </div>
                      </div>

                      {/* Photo Upload Card */}
                      <div style={{
                        background: '#ffffff',
                        padding: '1.5rem',
                        borderRadius: 'var(--radius-lg)',
                        border: '1px solid var(--border-color)',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                          <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#fef3c7', color: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.85rem' }}>
                            3
                          </div>
                          <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--forest-900)', margin: 0 }}>
                            Photo Evidence (EcoVision AI)
                          </h3>
                        </div>

                        <div style={{
                          border: '2px dashed var(--border-color)',
                          borderRadius: 'var(--radius-md)',
                          padding: '1.25rem',
                          textAlign: 'center',
                          background: reportImagePreview ? '#ffffff' : '#fafbfc',
                          transition: 'all 0.2s ease'
                        }}>
                          {reportImagePreview ? (
                            <div>
                              <img
                                src={reportImagePreview}
                                alt="Incident Preview"
                                style={{ maxHeight: '180px', borderRadius: 'var(--radius-sm)', objectFit: 'cover', margin: '0 auto 0.75rem', display: 'block', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}
                              />
                              <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.75rem', color: '#16a34a', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                                  <CheckCircle2 size={13} /> Photo Ready for AI Analysis
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setReportImagePreview(null)}
                                  className="btn btn-sm btn-danger"
                                  style={{ fontSize: '0.75rem' }}
                                >
                                  Remove Photo
                                </button>
                              </div>
                            </div>
                          ) : (
                            <label style={{ cursor: 'pointer', display: 'block', padding: '0.5rem' }}>
                              <Camera size={34} style={{ color: 'var(--forest-700)', margin: '0 auto 0.5rem' }} />
                              <span style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--forest-900)', display: 'block' }}>
                                Take Photo or Upload Image
                              </span>
                              <span style={{ fontSize: '0.76rem', color: 'var(--text-subtle)', display: 'block', marginTop: '0.2rem' }}>
                                Supports JPG, PNG up to 8MB. Automatically analyzed for waste category & volume.
                              </span>
                              <input
                                type="file"
                                accept="image/*"
                                onChange={handleReportImageUpload}
                                style={{ display: 'none' }}
                              />
                            </label>
                          )}
                        </div>
                      </div>

                      {/* Security & Token Guarantee Pill */}
                      <div style={{
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        borderRadius: 'var(--radius-md)',
                        padding: '0.85rem 1rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem'
                      }}>
                        <Shield size={20} color="#059669" />
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                          <strong style={{ color: 'var(--forest-900)' }}>Anonymous Tracking Guarantee:</strong> You will receive a private, unguessable tracking code to follow vehicle dispatch in real time.
                        </div>
                      </div>
                    </div>
                  </div>
                </form>
              </div>
            )}
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 3: TRACK REQUEST & LIVE VEHICLE RADAR                        */}
        {/* ================================================================= */}
        {activeTab === 'track' && (
          <div style={{ maxWidth: '850px', margin: '0 auto' }}>
            <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
              <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--forest-900)' }}>
                Track Garbage Request & Follow Collection Truck
              </h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.92rem', marginTop: '0.25rem' }}>
                Enter your secret tracking token to view real-time compactor truck positions, road ETAs, and verified resolution photos.
              </p>
            </div>

            <div className="card-table-wrapper" style={{ padding: '1.25rem', marginBottom: '1.5rem', background: '#ffffff', borderRadius: 'var(--radius-lg)' }}>
              <form onSubmit={handleTrackSubmit} style={{ display: 'flex', gap: '0.75rem' }}>
                <div style={{ flex: 1, position: 'relative' }}>
                  <input
                    type="text"
                    className="form-input"
                    style={{ fontFamily: 'monospace', paddingLeft: '2.5rem' }}
                    placeholder="Paste secret tracking token (e.g. demo-track-secret-token-12345)"
                    value={trackTokenInput}
                    onChange={(e) => setTrackTokenInput(e.target.value)}
                  />
                  <Search size={18} style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-subtle)' }} />
                </div>
                <button type="submit" disabled={isLoadingTrack} className="btn btn-primary">
                  {isLoadingTrack ? 'Locating...' : 'Track Ticket'}
                </button>
              </form>
            </div>

            {trackError && (
              <div className="alert-box alert-danger" style={{ marginBottom: '1.5rem' }}>
                <AlertCircle size={20} />
                <span>{trackError}</span>
              </div>
            )}

            {reopenSuccessMsg && (
              <div className="alert-box alert-success" style={{ marginBottom: '1.5rem' }}>
                <CheckCircle2 size={20} />
                <span>{reopenSuccessMsg}</span>
              </div>
            )}

            {activeReport && (
              <div className="public-form-card" style={{ padding: '1.75rem', background: '#ffffff', borderRadius: 'var(--radius-lg)' }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                  <div>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-subtle)' }}>
                      Municipal Reference Number
                    </span>
                    <h3 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--forest-900)', margin: '0.1rem 0 0' }}>
                      {activeReport.report_number}
                    </h3>
                  </div>
                  <div>{renderStatusBadge(activeReport.status)}</div>
                </div>

                {/* LIVE FLEET TRACKING HERO BANNER */}
                {liveTracking?.has_live_tracking ? (
                  <div style={{
                    background: 'linear-gradient(135deg, #0d3b2e 0%, #155d49 100%)',
                    borderRadius: 'var(--radius-lg)',
                    padding: '1.5rem',
                    color: '#ffffff',
                    marginBottom: '1.75rem',
                    boxShadow: '0 8px 24px rgba(13, 59, 46, 0.25)',
                    border: '1px solid rgba(255, 255, 255, 0.12)'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{
                          width: '42px',
                          height: '42px',
                          borderRadius: '50%',
                          background: 'rgba(255, 255, 255, 0.15)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          backdropFilter: 'blur(4px)'
                        }}>
                          <Radio size={22} className="animate-pulse" style={{ color: '#4ade80' }} />
                        </div>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#86efac', fontWeight: 700 }}>
                              Live Fleet Radar
                            </span>
                            {liveTracking.is_stale ? (
                              <span style={{ fontSize: '0.7rem', background: '#dc2626', color: '#fff', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
                                Stale Telemetry
                              </span>
                            ) : (
                              <span style={{ fontSize: '0.7rem', background: '#16a34a', color: '#fff', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
                                GPS Active
                              </span>
                            )}
                          </div>
                          <h4 style={{ fontSize: '1.25rem', fontWeight: 800, margin: '0.15rem 0 0', color: '#ffffff' }}>
                            Collection Unit En Route
                          </h4>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <div style={{ background: 'rgba(255, 255, 255, 0.12)', padding: '0.5rem 0.85rem', borderRadius: 'var(--radius-md)' }}>
                          <div style={{ fontSize: '0.7rem', color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                            <Truck size={13} /> ASSIGNED VEHICLE
                          </div>
                          <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#ffffff' }}>
                            {liveTracking.vehicle_number || 'Truck'}
                          </div>
                        </div>

                        {liveTracking.eta?.remaining_minutes !== undefined && (
                          <div style={{ background: 'rgba(74, 222, 128, 0.2)', border: '1px solid rgba(74, 222, 128, 0.4)', padding: '0.5rem 0.85rem', borderRadius: 'var(--radius-md)' }}>
                            <div style={{ fontSize: '0.7rem', color: '#86efac', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                              <Clock size={13} /> ESTIMATED ARRIVAL
                            </div>
                            <div style={{ fontWeight: 800, fontSize: '1.1rem', color: '#ffffff' }}>
                              ~{liveTracking.eta.remaining_minutes} min
                              <span style={{ fontSize: '0.75rem', fontWeight: 500, marginLeft: '0.35rem', color: '#cbd5e1' }}>
                                ({liveTracking.eta.estimated_arrival_clock_time})
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {trackingMapMarkers.length > 0 && (
                      <div style={{ borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid rgba(255, 255, 255, 0.2)', marginBottom: '1rem' }}>
                        <MapComponent
                          markers={trackingMapMarkers}
                          polyline={trackingPolyline.length >= 2 ? trackingPolyline : undefined}
                          height="320px"
                          zoom={15}
                        />
                      </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', color: '#cbd5e1', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <MapPin size={13} style={{ color: '#4ade80' }} />
                        <span>Destination: {liveTracking.destination_location?.address || activeReport.address_text}</span>
                        {liveTracking.eta?.distance_km && (
                          <span>• {liveTracking.eta.distance_km} km away</span>
                        )}
                      </div>
                      <div>
                        Last fix: {liveTracking.vehicle_location?.last_updated_at ? new Date(liveTracking.vehicle_location.last_updated_at).toLocaleTimeString() : 'Recent'}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: 'var(--radius-md)',
                    padding: '1.25rem',
                    marginBottom: '1.75rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1rem'
                  }}>
                    <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: '#e0f2fe', color: '#0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Truck size={22} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--forest-900)' }}>
                        {liveTracking?.message || 'Collection Fleet Status'}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                        {activeReport.status === 'RESOLVED' || activeReport.status === 'COMPLETED'
                          ? 'This garbage collection request has been resolved and verified by municipal supervisors.'
                          : liveTracking?.vehicle_number
                            ? `Vehicle (${liveTracking.vehicle_number}) is assigned. Live road radar activates when the driver starts the run.`
                            : 'Live road GPS radar activates automatically once a compactor truck is scheduled and dispatched.'}
                      </div>
                    </div>
                  </div>
                )}

                {/* Audit Timeline */}
                <div style={{ marginBottom: '1.75rem' }}>
                  <h4 style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--forest-900)', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Verified Status History
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', background: '#f8faf9', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                    {activeReport.timeline && activeReport.timeline.length > 0 ? (
                      activeReport.timeline.map((item: any, i: number) => (
                        <div key={i} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                          <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#dcfce7', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, marginTop: '2px' }}>
                            ✓
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--forest-900)' }}>{item.label}</span>
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                {item.timestamp ? new Date(item.timestamp).toLocaleString() : ''}
                              </span>
                            </div>
                            {item.note && (
                              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                                {item.note}
                              </div>
                            )}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        Logged on: {new Date(activeReport.created_at).toLocaleString()}
                      </div>
                    )}
                  </div>
                </div>

                {/* Report Details Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', background: '#f8faf9', padding: '1rem', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem', border: '1px solid var(--border-color)' }}>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', fontWeight: 600 }}>CATEGORY</div>
                    <div style={{ fontWeight: 700, color: 'var(--forest-900)', marginTop: '0.2rem' }}>{activeReport.report_type}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', fontWeight: 600 }}>SUBMISSION TIME</div>
                    <div style={{ fontWeight: 700, color: 'var(--forest-900)', marginTop: '0.2rem' }}>
                      {new Date(activeReport.created_at).toLocaleString()}
                    </div>
                  </div>
                  <div style={{ gridColumn: 'span 2' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', fontWeight: 600 }}>REPORTED ADDRESS</div>
                    <div style={{ color: 'var(--text-main)', marginTop: '0.2rem' }}>{activeReport.address_text}</div>
                  </div>
                  {activeReport.description && (
                    <div style={{ gridColumn: 'span 2' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', fontWeight: 600 }}>DESCRIPTION</div>
                      <div style={{ color: 'var(--text-main)', marginTop: '0.2rem', fontStyle: 'italic' }}>
                        "{activeReport.description}"
                      </div>
                    </div>
                  )}
                </div>

                {/* Evidence Photos (Before & After) */}
                {((activeReport.images && activeReport.images.length > 0) || (activeReport.proofs && activeReport.proofs.length > 0)) && (
                  <div style={{ marginBottom: '1.5rem' }}>
                    <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-subtle)', textTransform: 'uppercase', marginBottom: '0.65rem' }}>
                      Photographic Evidence
                    </h4>
                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                      {activeReport.images?.map((img: any, i: number) => (
                        <div key={i} style={{ width: '130px', height: '110px', borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid var(--border-color)', position: 'relative' }}>
                          <img src={img.secure_url} alt="Report Photo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          <span style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.65)', color: '#fff', fontSize: '9px', padding: '2px', textAlign: 'center' }}>
                            Report Photo
                          </span>
                        </div>
                      ))}
                      {activeReport.proofs?.map((prf: any, i: number) => (
                        <div key={i} style={{ width: '130px', height: '110px', borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '2px solid #22c55e', position: 'relative' }}>
                          <img src={prf.secure_url} alt="Resolution Proof" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          <span style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: '#16a34a', color: '#fff', fontSize: '9px', padding: '2px', textAlign: 'center', fontWeight: 700 }}>
                            Verified Cleaned
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Action Buttons: Report Unresolved or File Missed Collection */}
                <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    {activeReport.status === 'RESOLVED' || activeReport.status === 'COMPLETED'
                      ? 'Did garbage remain uncollected after completion?'
                      : 'Collection window overdue or delayed?'}
                  </span>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      onClick={() => setReopenModalOpen(true)}
                      className="btn btn-sm btn-outline"
                      style={{ color: '#dc2626', borderColor: '#fca5a5' }}
                    >
                      <AlertTriangle size={14} /> Report Issue Unresolved
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* REOPEN / FOLLOW-UP MODAL */}
            {reopenModalOpen && (
              <div className="modal-backdrop">
                <div className="modal-dialog">
                  <div className="modal-header">
                    <h3>Report Issue Remains Unresolved</h3>
                    <button onClick={() => setReopenModalOpen(false)} className="btn btn-sm btn-outline"><X size={16} /></button>
                  </div>
                  <form onSubmit={handleReopenSubmit}>
                    <div className="modal-body">
                      {reopenErrorMsg && (
                        <div className="alert-box alert-danger" style={{ marginBottom: '1rem' }}>
                          <AlertCircle size={18} />
                          <span>{reopenErrorMsg}</span>
                        </div>
                      )}
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                        If sanitation workers have left behind waste, partial spills, or if the reported dustbin is still overflowing, submit a supervisor alert.
                      </p>
                      <div style={{ marginBottom: '1rem' }}>
                        <label className="form-label">Explanation of Unresolved Problem</label>
                        <textarea
                          className="form-textarea"
                          rows={3}
                          placeholder="e.g. Workers emptied the main bin but left plastic cartons and overflow scattered across the sidewalk..."
                          value={reopenReason}
                          onChange={(e) => setReopenReason(e.target.value)}
                          required
                        />
                      </div>
                      <div style={{ marginBottom: '1rem' }}>
                        <label className="form-label">New Photo Evidence (Optional)</label>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const r = new FileReader();
                              r.onloadend = () => setReopenImagePreview(r.result as string);
                              r.readAsDataURL(file);
                            }
                          }}
                        />
                      </div>
                    </div>
                    <div className="modal-footer">
                      <button type="button" onClick={() => setReopenModalOpen(false)} className="btn btn-secondary">
                        Cancel
                      </button>
                      <button type="submit" disabled={isSubmittingReopen} className="btn btn-danger">
                        {isSubmittingReopen ? 'Filing Alert...' : 'Submit Supervisor Reopen Alert'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 4: PUBLISHED COLLECTION SCHEDULES                             */}
        {/* ================================================================= */}
        {activeTab === 'schedules' && (
          <div>
            <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
              <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--forest-900)' }}>
                Published Municipal Collection Schedules
              </h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.92rem', marginTop: '0.25rem' }}>
                Lookup planned morning and evening sanitation truck service windows across Navi Mumbai sectors.
              </p>
            </div>

            {/* Filters Bar */}
            <div className="card-table-wrapper" style={{ padding: '1rem 1.25rem', marginBottom: '1.5rem', background: '#ffffff', borderRadius: 'var(--radius-lg)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', alignItems: 'center' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-subtle)', display: 'block', marginBottom: '0.25rem' }}>
                    SERVICE AREA / ZONE
                  </label>
                  <select
                    className="form-select"
                    value={selectedAreaFilter}
                    onChange={(e) => setSelectedAreaFilter(e.target.value)}
                  >
                    <option value="">All Municipal Zones</option>
                    {serviceAreas.map(a => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-subtle)', display: 'block', marginBottom: '0.25rem' }}>
                    BUILDING / PRECINCT
                  </label>
                  <select
                    className="form-select"
                    value={selectedBuildingFilter}
                    onChange={(e) => setSelectedBuildingFilter(e.target.value)}
                  >
                    <option value="">All Buildings</option>
                    {buildings.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-subtle)', display: 'block', marginBottom: '0.25rem' }}>
                    DAY OF WEEK
                  </label>
                  <select
                    className="form-select"
                    value={selectedDayFilter}
                    onChange={(e) => setSelectedDayFilter(e.target.value)}
                  >
                    <option value="">All Days</option>
                    <option value="1">Monday</option>
                    <option value="2">Tuesday</option>
                    <option value="3">Wednesday</option>
                    <option value="4">Thursday</option>
                    <option value="5">Friday</option>
                    <option value="6">Saturday</option>
                    <option value="0">Sunday</option>
                  </select>
                </div>

                <div style={{ paddingTop: '1.1rem' }}>
                  <button
                    onClick={loadSchedules}
                    className="btn btn-outline"
                    style={{ width: '100%', justifyContent: 'center' }}
                  >
                    <RefreshCw size={14} /> Refresh Schedule
                  </button>
                </div>
              </div>
            </div>

            {/* Schedules Table */}
            <div className="card-table-wrapper" style={{ background: '#ffffff', borderRadius: 'var(--radius-lg)' }}>
              <table className="op-table">
                <thead>
                  <tr>
                    <th>Day & Shift</th>
                    <th>Zone & Precinct</th>
                    <th>Target Collection Point</th>
                    <th>Time Window</th>
                    <th>Vehicle Type</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {schedules.map((s: any) => (
                    <tr key={s.id}>
                      <td>
                        <strong>{s.weekday_name}</strong>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{s.shift} Shift</div>
                      </td>
                      <td>
                        <div>{s.service_area_name}</div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--forest-900)' }}>{s.building_name}</div>
                        {s.building_address && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{s.building_address}</div>
                        )}
                      </td>
                      <td>
                        <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--forest-800)' }}>
                          {s.time_window}
                        </span>
                      </td>
                      <td>
                        <span className="badge badge-neutral" style={{ fontSize: '0.75rem' }}>
                          {s.vehicle_type}
                        </span>
                      </td>
                      <td>
                        <span className="badge badge-success">Scheduled</span>
                      </td>
                    </tr>
                  ))}
                  {schedules.length === 0 && !isLoadingSchedules && (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                        No published schedules match the selected filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 5: SERVICE BULLETINS & ANNOUNCEMENTS                           */}
        {/* ================================================================= */}
        {activeTab === 'announcements' && (
          <div style={{ maxWidth: '850px', margin: '0 auto' }}>
            <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
              <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--forest-900)' }}>
                Official Municipal Bulletins & Notices
              </h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.92rem', marginTop: '0.25rem' }}>
                Operational advisories, weather contingency routes, e-waste drop-offs, and public sanitation campaigns.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {announcements.map((a: any) => (
                <div
                  key={a.id}
                  style={{
                    background: '#ffffff',
                    borderRadius: 'var(--radius-lg)',
                    padding: '1.5rem',
                    border: '1px solid var(--border-color)',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span className={`badge ${a.urgency === 'HIGH' ? 'badge-danger' : a.urgency === 'NORMAL' ? 'badge-active' : 'badge-neutral'}`}>
                        {a.category?.replace('_', ' ')}
                      </span>
                      {a.affected_areas && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          • {a.affected_areas}
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>
                      Published: {new Date(a.published_at).toLocaleDateString()}
                    </span>
                  </div>

                  <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--forest-900)', margin: '0 0 0.5rem' }}>
                    {a.title}
                  </h3>
                  <p style={{ color: 'var(--text-main)', fontSize: '0.92rem', lineHeight: 1.5, margin: 0 }}>
                    {a.content}
                  </p>
                </div>
              ))}
              {announcements.length === 0 && !isLoadingAnnouncements && (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)', background: '#fff', borderRadius: 'var(--radius-lg)' }}>
                  No active bulletins or service disruptions currently posted.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 6: DIRECT MISSED PICKUP FORM                                 */}
        {/* ================================================================= */}
        {activeTab === 'missed' && (
          <div style={{ maxWidth: '750px', margin: '0 auto' }}>
            <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
              <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--forest-900)' }}>
                Report a Missed Collection Run
              </h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.92rem', marginTop: '0.25rem' }}>
                If your scheduled morning collection run did not arrive or left containers untouched, notify municipal dispatch.
              </p>
            </div>

            {missedSuccessMsg ? (
              <div className="card-table-wrapper" style={{ padding: '2rem', textAlign: 'center', background: '#fff', borderRadius: 'var(--radius-lg)' }}>
                <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#dcfce7', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
                  <CheckCircle2 size={32} />
                </div>
                <h3 style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--forest-900)' }}>
                  Missed Collection Alert Logged!
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', maxWidth: '450px', margin: '0.5rem auto 1.5rem' }}>
                  {missedSuccessMsg} A supervisor will verify route logs and dispatch a catch-up tipper van.
                </p>
                <button
                  onClick={() => {
                    setMissedSuccessMsg(null);
                    setActiveTab('schedules');
                  }}
                  className="btn btn-primary"
                >
                  View Collection Schedules
                </button>
              </div>
            ) : (
              <form onSubmit={handleDirectMissedSubmit} className="public-form-card" style={{ background: '#ffffff', padding: '2rem', borderRadius: 'var(--radius-lg)' }}>
                {missedErrorMsg && (
                  <div className="alert-box alert-danger" style={{ marginBottom: '1.25rem' }}>
                    <AlertCircle size={20} />
                    <span>{missedErrorMsg}</span>
                  </div>
                )}

                <div style={{ marginBottom: '1.25rem' }}>
                  <label className="form-label" style={{ fontWeight: 700 }}>Tracking Token or Ticket Reference</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. demo-track-secret-token-12345"
                    value={missedTokenInput}
                    onChange={(e) => setMissedTokenInput(e.target.value)}
                    required
                  />
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', display: 'block', marginTop: '0.25rem' }}>
                    Provided when your report or society registration was submitted.
                  </span>
                </div>

                <div style={{ marginBottom: '1.5rem' }}>
                  <label className="form-label" style={{ fontWeight: 700 }}>Missed Service Details</label>
                  <textarea
                    className="form-textarea"
                    rows={4}
                    placeholder="Specify building name, wing, scheduled time window that was missed, and volume of waste accumulated..."
                    value={missedComplaintText}
                    onChange={(e) => setMissedComplaintText(e.target.value)}
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmittingMissed}
                  className="btn btn-danger btn-lg"
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  {isSubmittingMissed ? 'Transmitting Alert...' : 'Submit Missed Collection Alert'}
                </button>
              </form>
            )}
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 7: CITIZEN HELP & FAQS                                        */}
        {/* ================================================================= */}
        {activeTab === 'faq' && (
          <div style={{ maxWidth: '850px', margin: '0 auto' }}>
            <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
              <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--forest-900)' }}>
                Citizen Help & Frequently Asked Questions
              </h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.92rem', marginTop: '0.25rem' }}>
                Learn how municipal waste reports, AI assessment, and truck tracking work.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="faq-card" style={{ background: '#ffffff', padding: '1.25rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--forest-900)', margin: '0 0 0.5rem' }}>
                  How does the EcoVision AI waste assessment work?
                </h3>
                <p style={{ fontSize: '0.88rem', color: 'var(--text-main)', lineHeight: 1.5, margin: 0 }}>
                  When you upload an image of a waste site or dustbin, our real-time computer vision model analyzes material composition (organic, dry recyclable, plastic, hazardous) and calculates fill volume percentage. If spillover is detected, the report priority automatically upgrades to HIGH.
                </p>
              </div>

              <div className="faq-card" style={{ background: '#ffffff', padding: '1.25rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--forest-900)', margin: '0 0 0.5rem' }}>
                  What is the Secret Tracking Token?
                </h3>
                <p style={{ fontSize: '0.88rem', color: 'var(--text-main)', lineHeight: 1.5, margin: 0 }}>
                  The tracking token is a cryptographic, 24-byte unguessable key generated when you submit an anonymous report. It protects your privacy while granting access to the live truck radar and resolution proof. Registered residents can also view all tickets directly in their dashboard.
                </p>
              </div>

              <div className="faq-card" style={{ background: '#ffffff', padding: '1.25rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--forest-900)', margin: '0 0 0.5rem' }}>
                  How accurate is the vehicle Estimated Time of Arrival (ETA)?
                </h3>
                <p style={{ fontSize: '0.88rem', color: 'var(--text-main)', lineHeight: 1.5, margin: 0 }}>
                  ETA is calculated using road-network routing (OSRM) based on actual truck GPS telemetry transmitted from the driver's device. It updates every 12 seconds in transit. If a vehicle encounters heavy congestion or GPS delays, the system flags the signal as "Stale".
                </p>
              </div>

              <div className="faq-card" style={{ background: '#ffffff', padding: '1.25rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--forest-900)', margin: '0 0 0.5rem' }}>
                  What happens if waste is only partially collected?
                </h3>
                <p style={{ fontSize: '0.88rem', color: 'var(--text-main)', lineHeight: 1.5, margin: 0 }}>
                  You have the right to reopen any ticket. Open your report tracking page and click "Report Issue Unresolved". Provide a short note and optional photo; our municipal control center will verify driver route proof and dispatch a follow-up vehicle.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 8: MY REPORTS & NOTIFICATIONS (FOR REGISTERED RESIDENTS)      */}
        {/* ================================================================= */}
        {activeTab === 'my-reports' && currentUser?.role === 'reporter' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div>
                <h2 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--forest-900)' }}>
                  My Sanitation Requests ({myReports.length})
                </h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', margin: 0 }}>
                  All waste reports filed under your verified resident account.
                </p>
              </div>
              <button
                onClick={() => setActiveTab('report')}
                className="btn btn-primary"
              >
                <PlusCircle size={15} /> File New Ticket
              </button>
            </div>

            {/* Resident Notifications Drawer */}
            {citizenNotifications.length > 0 && (
              <div style={{ background: '#ffffff', borderRadius: 'var(--radius-lg)', padding: '1.25rem', border: '1px solid var(--border-color)', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, fontSize: '0.95rem', color: 'var(--forest-900)' }}>
                    <Bell size={16} /> Notification Updates
                    {unreadNotifsCount > 0 && (
                      <span className="badge badge-active" style={{ fontSize: '11px' }}>{unreadNotifsCount} unread</span>
                    )}
                  </div>
                  {unreadNotifsCount > 0 && (
                    <button
                      onClick={async () => {
                        await api.markAllCitizenNotificationsRead();
                        loadCitizenNotifications();
                      }}
                      className="btn btn-sm btn-outline"
                      style={{ fontSize: '0.75rem' }}
                    >
                      Mark All as Read
                    </button>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '180px', overflowY: 'auto' }}>
                  {citizenNotifications.map((n: any) => (
                    <div
                      key={n.id}
                      style={{
                        padding: '0.65rem 0.85rem',
                        borderRadius: 'var(--radius-sm)',
                        background: n.read_at ? '#f8faf9' : '#ecfdf5',
                        border: n.read_at ? '1px solid #e2e8f0' : '1px solid #86efac',
                        fontSize: '0.85rem'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <strong style={{ color: 'var(--forest-900)' }}>{n.title}</strong>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-subtle)' }}>
                          {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div style={{ color: 'var(--text-main)', marginTop: '0.15rem' }}>{n.message}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Reports Table */}
            <div className="card-table-wrapper" style={{ background: '#ffffff', borderRadius: 'var(--radius-lg)' }}>
              <table className="op-table">
                <thead>
                  <tr>
                    <th>Ticket Ref</th>
                    <th>Category</th>
                    <th>Location</th>
                    <th>Date Filed</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {myReports.map((r: any) => (
                    <tr key={r.id}>
                      <td>
                        <strong>{r.report_number}</strong>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{r.tracking_token_display}</div>
                      </td>
                      <td>{r.report_type}</td>
                      <td>
                        <div style={{ maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.address_text}
                        </div>
                      </td>
                      <td>{new Date(r.created_at).toLocaleDateString()}</td>
                      <td>{renderStatusBadge(r.status)}</td>
                      <td>
                        <button
                          onClick={() => {
                            if (r.tracking_token_display) {
                              setTrackTokenInput(r.tracking_token_display);
                              fetchTracking(r.tracking_token_display);
                              if (onTrackRedirect) onTrackRedirect(r.tracking_token_display);
                            }
                            setActiveTab('track');
                          }}
                          className="btn btn-sm btn-outline"
                          style={{ fontSize: '0.75rem' }}
                        >
                          View Radar & ETA
                        </button>
                      </td>
                    </tr>
                  ))}
                  {myReports.length === 0 && !isLoadingMyReports && (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                        You have not submitted any sanitation requests yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
