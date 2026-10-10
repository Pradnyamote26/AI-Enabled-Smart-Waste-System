import { useState, useEffect, useMemo } from 'react';
import { Search, CheckCircle2, AlertCircle, Send, AlertTriangle, Truck, Clock, MapPin, Radio } from 'lucide-react';
import { api } from '../../services/api';
import { MapComponent } from '../../components/MapComponent';
import type { MapMarkerItem } from '../../components/MapComponent';

interface PublicTrackingProps {
  initialToken?: string;
}

export const PublicTrackingPage: React.FC<PublicTrackingProps> = ({ initialToken = '' }) => {
  const [tokenInput, setTokenInput] = useState(initialToken);
  const [report, setReport] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Missed collection complaint
  const [showComplaintForm, setShowComplaintForm] = useState(false);
  const [complaintText, setComplaintText] = useState('');
  const [complaintSuccess, setComplaintSuccess] = useState<string | null>(null);
  const [isFilingComplaint, setIsFilingComplaint] = useState(false);

  const fetchTracking = async (tokenToUse: string) => {
    if (!tokenToUse.trim()) return;
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const data = await api.trackReport(tokenToUse.trim());
      setReport(data);
    } catch (err: any) {
      setErrorMsg(err.message || 'No active report found for this secret tracking token.');
      setReport(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (initialToken) {
      fetchTracking(initialToken);
    }
  }, [initialToken]);

  // Live Tracking Polling (Phase 4)
  useEffect(() => {
    if (report?.live_tracking?.has_live_tracking && tokenInput) {
      const interval = setInterval(() => {
        api.trackReport(tokenInput.trim()).then(data => {
          setReport(data);
        }).catch(() => {});
      }, 10000);
      return () => clearInterval(interval);
    }
  }, [report?.live_tracking?.has_live_tracking, tokenInput]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchTracking(tokenInput);
  };

  const handleComplaintSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!complaintText.trim()) return;
    setIsFilingComplaint(true);
    try {
      await api.fileMissedCollection(tokenInput, complaintText);
      setComplaintSuccess('Missed collection complaint successfully linked to this report.');
      setComplaintText('');
      setShowComplaintForm(false);
      // Refresh report
      fetchTracking(tokenInput);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to file complaint.');
    } finally {
      setIsFilingComplaint(false);
    }
  };

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
        return <span className="badge badge-active">Assigned to Vehicle</span>;
      case 'AWAITING_PROOF_REVIEW':
        return <span className="badge badge-active">Collection Proof Submitted</span>;
      case 'COMPLETED':
      case 'RESOLVED':
        return <span className="badge badge-success">Resolved & Cleared</span>;
      case 'REJECTED':
        return <span className="badge badge-danger">Closed</span>;
      default:
        return <span className="badge badge-neutral">{status}</span>;
    }
  };

  const timelineSteps = [
    { key: 'SUBMITTED', label: 'Report Logged' },
    { key: 'ASSIGNED', label: 'Vehicle Assigned' },
    { key: 'IN_COLLECTION', label: 'Collection Underway' },
    { key: 'RESOLVED', label: 'Cleaned & Verified' }
  ];

  const getStepStatus = (stepKey: string, currentStatus: string) => {
    const order = ['SUBMITTED', 'PENDING_REVIEW', 'ASSIGNED', 'IN_COLLECTION', 'AWAITING_PROOF_REVIEW', 'COMPLETED', 'RESOLVED'];
    const currentIndex = order.indexOf(currentStatus);
    const stepIndex = order.indexOf(stepKey);

    if (currentStatus === 'RESOLVED' || currentStatus === 'COMPLETED') return 'completed';
    if (stepIndex <= currentIndex && currentIndex >= 0) return 'active';
    return 'upcoming';
  };

  const liveTracking = report?.live_tracking;

  const trackingMapMarkers = useMemo<MapMarkerItem[]>(() => {
    if (!liveTracking) return [];
    const markers: MapMarkerItem[] = [];

    // Vehicle live position marker
    if (liveTracking.vehicle_location?.latitude && liveTracking.vehicle_location?.longitude) {
      markers.push({
        id: 'vehicle-live',
        lat: liveTracking.vehicle_location.latitude,
        lng: liveTracking.vehicle_location.longitude,
        title: `Collection Vehicle (${liveTracking.vehicle_number || 'En Route'})`,
        type: 'VEHICLE',
        subtitle: liveTracking.is_stale
          ? 'Warning: GPS signal stale (>3 mins)'
          : `Active collection unit (${liveTracking.vehicle_type || 'Waste Truck'})`
      });
    }

    // Destination / Report point
    if (liveTracking.destination_location?.latitude && liveTracking.destination_location?.longitude) {
      markers.push({
        id: 'dest-report',
        lat: liveTracking.destination_location.latitude,
        lng: liveTracking.destination_location.longitude,
        title: 'Collection Target (Your Report)',
        type: 'REPORT',
        subtitle: liveTracking.destination_location.address || 'Reported waste location'
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

  return (
    <div style={{ maxWidth: '850px', margin: '2rem auto', padding: '0 1rem' }}>
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--forest-900)' }}>
          Track Garbage Collection Request
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.25rem' }}>
          Enter the secret tracking token provided when your report was submitted.
        </p>
      </div>

      <div className="card-table-wrapper" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: '0.75rem' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <input
              type="text"
              className="form-input"
              style={{ fontFamily: 'monospace', paddingLeft: '2.5rem' }}
              placeholder="Paste secret token (e.g. demo-track-secret-token-12345)"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
            />
            <Search size={18} style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-subtle)' }} />
          </div>
          <button type="submit" disabled={isLoading} className="btn btn-primary">
            {isLoading ? 'Verifying...' : 'Track Request'}
          </button>
        </form>
      </div>

      {errorMsg && (
        <div className="alert-box alert-danger">
          <AlertCircle size={20} />
          <div>{errorMsg}</div>
        </div>
      )}

      {complaintSuccess && (
        <div className="alert-box alert-success">
          <CheckCircle2 size={20} />
          <div>{complaintSuccess}</div>
        </div>
      )}

      {report && (
        <div className="public-form-card" style={{ padding: '1.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-subtle)' }}>
                Municipal Reference Number
              </span>
              <h2 style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--forest-900)' }}>
                {report.report_number}
              </h2>
            </div>
            <div>{renderStatusBadge(report.status)}</div>
          </div>

          {/* Live Driver Tracking Card (Phase 4 & 5) */}
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
                        Live Fleet Tracking
                      </span>
                      {liveTracking.is_stale ? (
                        <span style={{ fontSize: '0.7rem', background: '#dc2626', color: '#fff', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
                          Stale Signal
                        </span>
                      ) : (
                        <span style={{ fontSize: '0.7rem', background: '#16a34a', color: '#fff', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
                          GPS Active
                        </span>
                      )}
                    </div>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: '0.15rem 0 0 0', color: '#ffffff' }}>
                      Collection Unit En Route
                    </h3>
                  </div>
                </div>

                {/* Vehicle & ETA summary chips */}
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

              {/* Live Map */}
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
                  <span>Destination: {liveTracking.destination_location?.address || 'Your logged waste location'}</span>
                  {liveTracking.eta?.distance_km && (
                    <span>• {liveTracking.eta.distance_km} km away</span>
                  )}
                </div>
                <div>
                  Last GPS fix: {liveTracking.vehicle_location?.last_updated_at ? new Date(liveTracking.vehicle_location.last_updated_at).toLocaleTimeString() : 'Recent'}
                </div>
              </div>

              {liveTracking.is_stale && (
                <div style={{ marginTop: '0.75rem', background: 'rgba(239, 68, 68, 0.25)', border: '1px solid rgba(239, 68, 68, 0.5)', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#fecaca' }}>
                  <AlertTriangle size={15} />
                  <span>Vehicle telemetry update is delayed due to network or tunnel traversal. ETA will re-synchronize momentarily.</span>
                </div>
              )}
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
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                background: '#e0f2fe',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#0284c7'
              }}>
                <Truck size={20} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--forest-900)' }}>
                  {liveTracking?.message || 'Collection Fleet Status'}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                  {report.status === 'RESOLVED' || report.status === 'COMPLETED'
                    ? 'This garbage collection request has already been completed and verified. Live telemetry is concluded.'
                    : liveTracking?.vehicle_number
                      ? `Assigned vehicle (${liveTracking.vehicle_number}) is queued. Live road GPS will broadcast once the driver initiates transit.`
                      : 'Live vehicle tracking activates automatically once a collection truck is dispatched onto the service route.'}
                </div>
              </div>
            </div>
          )}

          {/* Timeline */}
          <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative', marginBottom: '2rem', padding: '0 1rem' }}>
            {timelineSteps.map((s, idx) => {
              const state = getStepStatus(s.key, report.status);
              const isDone = state === 'completed' || (state === 'active' && report.status === s.key);
              return (
                <div key={s.key} style={{ textAlign: 'center', zIndex: 2 }}>
                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      margin: '0 auto 0.4rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: isDone ? 'var(--forest-800)' : '#e4ebe7',
                      color: isDone ? '#fff' : 'var(--text-subtle)',
                      fontWeight: 700,
                      fontSize: '0.8rem'
                    }}
                  >
                    {isDone ? '✓' : idx + 1}
                  </div>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: isDone ? 'var(--forest-900)' : 'var(--text-subtle)' }}>
                    {s.label}
                  </span>
                </div>
              );
            })}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.5rem', background: '#f8faf9', padding: '1rem', borderRadius: 'var(--radius-md)' }}>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', fontWeight: 600 }}>ISSUE CATEGORY</div>
              <div style={{ fontWeight: 600, color: 'var(--forest-900)', marginTop: '0.2rem' }}>{report.report_type}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', fontWeight: 600 }}>DATE LOGGED</div>
              <div style={{ fontWeight: 600, color: 'var(--forest-900)', marginTop: '0.2rem' }}>
                {new Date(report.created_at).toLocaleString()}
              </div>
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', fontWeight: 600 }}>LOCATION</div>
              <div style={{ color: 'var(--text-main)', marginTop: '0.2rem' }}>{report.address_text}</div>
            </div>
            {report.description && (
              <div style={{ gridColumn: 'span 2' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', fontWeight: 600 }}>DESCRIPTION</div>
                <div style={{ color: 'var(--text-main)', marginTop: '0.2rem', fontStyle: 'italic' }}>"{report.description}"</div>
              </div>
            )}
          </div>

          {/* AI classification summary (plain language) */}
          {report.ai_summary && (
            <div style={{ background: '#eef9f2', border: '1px solid #c3e6cb', borderRadius: 'var(--radius-md)', padding: '1rem', marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--forest-800)', marginBottom: '0.35rem' }}>
                AI Model Assessment
              </div>
              <p style={{ fontSize: '0.85rem', color: 'var(--forest-900)' }}>
                Identified primary material as <strong>{report.ai_summary.primary_category}</strong> with an estimated fill volume of <strong>{report.ai_summary.fill_level_percentage}%</strong>. {report.ai_summary.is_overflowing ? 'Spillover detected around collection point.' : 'Contained within bounds.'}
              </p>
            </div>
          )}

          {/* Images */}
          {report.images && report.images.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-subtle)', textTransform: 'uppercase', display: 'block', marginBottom: '0.5rem' }}>
                Report Images
              </label>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                {report.images.map((img: any, i: number) => (
                  <div key={i} style={{ width: '130px', height: '110px', borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid var(--border-color)', position: 'relative' }}>
                    <img src={img.secure_url} alt="Report evidence" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <span style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: '9px', padding: '2px', textAlign: 'center' }}>
                      {img.role === 'ORIGINAL_REPORT' ? 'Report Photo' : 'After Collection'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Follow-up Missed Collection / Complaint button */}
          <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Collection delayed or missed?
            </span>
            <button
              onClick={() => setShowComplaintForm(!showComplaintForm)}
              className="btn btn-outline btn-sm"
            >
              <AlertTriangle size={14} /> Report Missed Service
            </button>
          </div>

          {showComplaintForm && (
            <form onSubmit={handleComplaintSubmit} style={{ marginTop: '1rem', background: '#fafcfb', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
              <label className="form-label">Missed Collection Explanation</label>
              <textarea
                className="form-textarea"
                rows={2}
                placeholder="State why collection was missed or if garbage has been left behind after scheduled morning run..."
                value={complaintText}
                onChange={(e) => setComplaintText(e.target.value)}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button type="button" onClick={() => setShowComplaintForm(false)} className="btn btn-sm btn-secondary">
                  Cancel
                </button>
                <button type="submit" disabled={isFilingComplaint} className="btn btn-sm btn-danger">
                  <Send size={14} /> Submit Missed Collection Alert
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
};
