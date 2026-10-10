import { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { api } from '../../services/api';

interface ReporterPortalProps {
  currentUser: any;
  onNewReport: () => void;
}

export const ReporterPortal: React.FC<ReporterPortalProps> = ({ currentUser, onNewReport }) => {
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchReports = async () => {
      try {
        const data = await api.getMyReports();
        setReports(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchReports();
  }, []);

  return (
    <div style={{ maxWidth: '900px', margin: '2rem auto', padding: '0 1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div>
          <h1 className="page-title">Citizen Waste Reporting Portal</h1>
          <p className="page-desc" style={{ marginBottom: 0 }}>
            Welcome back, {currentUser.full_name}. View your past municipal reports and real-time resolution status.
          </p>
        </div>
        <button onClick={onNewReport} className="btn btn-primary">
          <Plus size={16} /> File New Waste Report
        </button>
      </div>

      <div className="card-table-wrapper">
        <div className="card-header-row">
          <h3 className="card-title">My Filed Sanitation Requests ({reports.length})</h3>
        </div>
        <table className="op-table">
          <thead>
            <tr>
              <th>Report Number</th>
              <th>Category</th>
              <th>Location</th>
              <th>Date Filed</th>
              <th>Resolution Status</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((r: any) => (
              <tr key={r.id}>
                <td><strong>{r.report_number}</strong></td>
                <td>{r.report_type}</td>
                <td>{r.address_text}</td>
                <td>{new Date(r.created_at).toLocaleDateString()}</td>
                <td>
                  <span className={`badge ${r.status === 'RESOLVED' || r.status === 'COMPLETED' ? 'badge-success' : 'badge-active'}`}>
                    {r.status}
                  </span>
                </td>
              </tr>
            ))}
            {reports.length === 0 && !loading && (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                  You have not submitted any waste reports yet. Click "File New Waste Report" to begin.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
