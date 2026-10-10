import React, { useState, useEffect } from 'react';
import { Camera, MapPin, Send, CheckCircle2, AlertTriangle, ArrowRight, Copy, Check } from 'lucide-react';
import { api } from '../../services/api';
import { MapComponent } from '../../components/MapComponent';
import type { MapMarkerItem } from '../../components/MapComponent';

interface PublicReportProps {
  initialQrToken?: string;
  initialBinCode?: string;
  onTrackRedirect?: (token: string) => void;
}

export const PublicReportPage: React.FC<PublicReportProps> = ({
  initialQrToken = '',
  initialBinCode = '',
  onTrackRedirect
}) => {
  const [reportType, setReportType] = useState('OVERFLOWING_BIN');
  const [binCode, setBinCode] = useState(initialBinCode);
  const [qrToken, setQrToken] = useState(initialQrToken);
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState('');
  const [contact, setContact] = useState('');
  const [lat, setLat] = useState(19.0760);
  const [lng, setLng] = useState(72.9975);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionResult, setSubmissionResult] = useState<any | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [gpsStatus, setGpsStatus] = useState<string | null>(null);

  useEffect(() => {
    // If QR params exist in URL
    const params = new URLSearchParams(window.location.search);
    const qToken = params.get('qr_token');
    const bCode = params.get('bin_code');
    if (qToken) setQrToken(qToken);
    if (bCode) setBinCode(bCode);
  }, []);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 8 * 1024 * 1024) {
        setErrorMsg('Image size exceeds 8MB limit. Please upload a smaller image.');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRequestGps = () => {
    if (!navigator.geolocation) {
      setGpsStatus('Geolocation not supported by this browser. Please click the map below to select location.');
      return;
    }
    setGpsStatus('Requesting GPS coordinate permission...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude);
        setLng(pos.coords.longitude);
        setGpsStatus(`GPS coordinates acquired (Accuracy: ±${Math.round(pos.coords.accuracy)}m)`);
      },
      () => {
        setGpsStatus('GPS access denied or unavailable. Please click your location on the map below.');
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  const handleMapPinSelect = (newLat: number, newLng: number) => {
    setLat(newLat);
    setLng(newLng);
    setGpsStatus(`Selected map coordinate: ${newLat.toFixed(5)}, ${newLng.toFixed(5)}`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const payload = {
        report_type: reportType,
        latitude: lat,
        longitude: lng,
        address_text: address || `Map coordinate (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
        description,
        reporter_contact: contact,
        qr_token: qrToken || undefined,
        image: imagePreview || undefined
      };

      const res = await api.submitPublicReport(payload);
      setSubmissionResult(res);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to submit waste report.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyToken = () => {
    if (submissionResult?.tracking_token) {
      navigator.clipboard.writeText(submissionResult.tracking_token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  if (submissionResult) {
    const aiAnalysis = submissionResult.ai_analysis;
    const aiData = aiAnalysis?.result;

    return (
      <div className="public-card-container" style={{ marginTop: '2rem' }}>
        <div className="public-form-card" style={{ textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', padding: '1rem', background: 'var(--forest-50)', color: 'var(--forest-700)', borderRadius: '50%', marginBottom: '1rem' }}>
            <CheckCircle2 size={48} />
          </div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--forest-900)' }}>
            Report Successfully Submitted
          </h2>
          <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem', marginBottom: '1.5rem' }}>
            Your municipal waste request <strong>{submissionResult.report_number}</strong> has been logged into the city dispatch system.
          </p>

          <div style={{ background: '#f8faf9', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '1.25rem', marginBottom: '1.5rem', textAlign: 'left' }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-subtle)', textTransform: 'uppercase' }}>
              Secret Tracking Token (Save this to check status)
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.4rem' }}>
              <input
                readOnly
                value={submissionResult.tracking_token}
                className="form-input"
                style={{ fontFamily: 'monospace', fontWeight: 600, background: '#fff' }}
              />
              <button onClick={copyToken} className="btn btn-secondary" title="Copy tracking token">
                {copied ? <Check size={18} color="green" /> : <Copy size={18} />}
              </button>
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
              Display ID: <strong>{submissionResult.display_id}</strong>
            </p>
          </div>

          {/* AI Analysis Card */}
          {aiData && (
            <div style={{ background: '#ffffff', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '1.25rem', marginBottom: '1.5rem', textAlign: 'left' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--forest-700)' }}>
                  🤖 Real AI Computer Vision Diagnostics
                </span>
                <span className="badge badge-active">{aiAnalysis.model_name} {aiAnalysis.model_version}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem', fontSize: '0.85rem' }}>
                <div style={{ padding: '0.6rem', background: '#f8faf9', borderRadius: '4px' }}>
                  <div style={{ color: 'var(--text-subtle)', fontSize: '0.75rem' }}>Primary Waste</div>
                  <strong style={{ color: 'var(--forest-900)' }}>{aiData.primary_category}</strong>
                </div>
                <div style={{ padding: '0.6rem', background: '#f8faf9', borderRadius: '4px' }}>
                  <div style={{ color: 'var(--text-subtle)', fontSize: '0.75rem' }}>Fill Load</div>
                  <strong style={{ color: 'var(--forest-900)' }}>{aiData.fill_level_percentage}%</strong>
                </div>
                <div style={{ padding: '0.6rem', background: '#f8faf9', borderRadius: '4px' }}>
                  <div style={{ color: 'var(--text-subtle)', fontSize: '0.75rem' }}>Overflow Status</div>
                  <strong style={{ color: aiData.is_overflowing ? '#dc2626' : '#166534' }}>
                    {aiData.is_overflowing ? 'OVERFLOWING' : 'Within Bounds'}
                  </strong>
                </div>
                <div style={{ padding: '0.6rem', background: '#f8faf9', borderRadius: '4px' }}>
                  <div style={{ color: 'var(--text-subtle)', fontSize: '0.75rem' }}>Confidence</div>
                  <strong>{Math.round((aiAnalysis.confidence || 0) * 100)}%</strong>
                </div>
              </div>
              {aiData.analysis_notes && (
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.75rem', fontStyle: 'italic' }}>
                  {aiData.analysis_notes}
                </p>
              )}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem' }}>
            <button
              onClick={() => {
                if (onTrackRedirect) {
                  onTrackRedirect(submissionResult.tracking_token);
                } else {
                  window.location.href = `/?tab=track&token=${submissionResult.tracking_token}`;
                }
              }}
              className="btn btn-primary"
            >
              Track Request Status <ArrowRight size={16} />
            </button>
            <button
              onClick={() => {
                setSubmissionResult(null);
                setImagePreview(null);
                setDescription('');
              }}
              className="btn btn-secondary"
            >
              Submit Another Report
            </button>
          </div>
        </div>
      </div>
    );
  }

  const mapMarkers: MapMarkerItem[] = [
    {
      id: 'current-pin',
      lat,
      lng,
      title: 'Report Incident Location',
      type: 'PIN'
    }
  ];

  return (
    <div>
      <section className="public-hero">
        <h1>Civic Waste Reporting & Segregation</h1>
        <p>Report overflowing dustbins, roadside garbage heaps, or missed collections. Real AI vision processes incoming photos to triage priority for morning routes.</p>
      </section>

      <div className="public-card-container">
        <div className="public-form-card">
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.35rem', color: 'var(--forest-900)' }}>
            Submit Waste Report
          </h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
            No citizen account required. An unguessable tracking token will be generated upon submission.
          </p>

          {errorMsg && (
            <div className="alert-box alert-danger">
              <AlertTriangle size={18} />
              <div>{errorMsg}</div>
            </div>
          )}

          {qrToken && (
            <div className="alert-box alert-info">
              <CheckCircle2 size={18} />
              <div>Linked with Registered Dustbin Token: <strong>{binCode || qrToken}</strong></div>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Report Category *</label>
              <select
                className="form-select"
                value={reportType}
                onChange={(e) => setReportType(e.target.value)}
              >
                <option value="OVERFLOWING_BIN">Overflowing Municipal Dustbin</option>
                <option value="NO_BIN_GARBAGE">Garbage Where No Dustbin Exists</option>
                <option value="MISSED_COLLECTION">Building Scheduled Morning Collection Missed</option>
                <option value="SCATTERED_WASTE">Scattered Plastic / Dry Waste</option>
                <option value="ILLEGAL_DUMPING">Large Debris / Illegal Dumping</option>
                <option value="OTHER">Other Sanitation Issue</option>
              </select>
            </div>

            {/* Photo Upload Section */}
            <div className="form-group">
              <label className="form-label">Attach Photo (Optional but Recommended for AI Analysis)</label>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                <label className="btn btn-secondary" style={{ cursor: 'pointer' }}>
                  <Camera size={18} /> Choose / Capture Photo
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    style={{ display: 'none' }}
                  />
                </label>
                {imagePreview && (
                  <div style={{ position: 'relative', width: '80px', height: '80px', borderRadius: 'var(--radius-sm)', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
                    <img src={imagePreview} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                )}
              </div>
              <p className="form-help">Real AI Computer Vision model will automatically analyze category and fill percentage.</p>
            </div>

            {/* Location Section */}
            <div className="form-group">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                <label className="form-label" style={{ marginBottom: 0 }}>Incident Location *</label>
                <button
                  type="button"
                  onClick={handleRequestGps}
                  className="btn btn-sm btn-outline"
                >
                  <MapPin size={14} /> Share Current GPS
                </button>
              </div>

              {gpsStatus && (
                <p style={{ fontSize: '0.75rem', color: 'var(--forest-700)', marginBottom: '0.5rem', fontWeight: 500 }}>
                  {gpsStatus}
                </p>
              )}

              <div className="map-container-compact" style={{ marginBottom: '0.75rem' }}>
                <MapComponent
                  markers={mapMarkers}
                  center={[lat, lng]}
                  zoom={15}
                  height="250px"
                  onLocationSelect={handleMapPinSelect}
                />
              </div>
              <p className="form-help">Click anywhere on the map above to accurately reposition your incident pin.</p>

              <input
                type="text"
                className="form-input"
                style={{ marginTop: '0.5rem' }}
                placeholder="Street name, landmark, or building name (e.g. Sector 4, near rear gate)"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Detailed Description</label>
              <textarea
                className="form-textarea"
                rows={3}
                placeholder="Describe the nature of the waste, duration noticed, or obstacles for vehicles..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Citizen Contact / Email (Optional)</label>
              <input
                type="text"
                className="form-input"
                placeholder="Enter email or phone (masked on public tracking view)"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="btn btn-primary btn-lg"
              style={{ width: '100%', marginTop: '0.5rem' }}
            >
              {isSubmitting ? (
                <span>Processing AI & Logging Report...</span>
              ) : (
                <>
                  <Send size={18} /> Submit Waste Report
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
