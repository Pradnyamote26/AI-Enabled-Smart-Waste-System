import { useState } from 'react';
import { X, ShieldCheck, AlertCircle } from 'lucide-react';
import { api, setStoredToken } from '../../services/api';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (user: any) => void;
  defaultRoleTab?: 'admin' | 'driver' | 'reporter';
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onLoginSuccess,
  defaultRoleTab = 'admin'
}) => {
  const [roleTab, setRoleTab] = useState<'admin' | 'driver' | 'reporter'>(defaultRoleTab);
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const handlePreFill = (e: string, p: string, r: 'admin' | 'driver' | 'reporter') => {
    setEmail(e);
    setPassword(p);
    setRoleTab(r);
    setIsRegisterMode(false);
    setErrorMsg(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setIsLoading(true);

    try {
      if (isRegisterMode && roleTab === 'reporter') {
        const res = await api.register({
          email,
          password,
          full_name: fullName,
          phone
        });
        setStoredToken(res.token);
        onLoginSuccess(res.user);
        onClose();
      } else {
        const res = await api.login({ email, password });
        setStoredToken(res.token);
        onLoginSuccess(res.user);
        onClose();
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Authentication failed. Please verify credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-dialog" style={{ maxWidth: '480px' }}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ShieldCheck size={20} color="var(--forest-700)" />
            <h3 className="card-title">
              {isRegisterMode ? 'Citizen Registration' : 'Municipal Portal Login'}
            </h3>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-subtle)' }}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          {/* Role Tabs */}
          {!isRegisterMode && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.4rem', marginBottom: '1.25rem', background: '#edf2f0', padding: '0.3rem', borderRadius: 'var(--radius-md)' }}>
              <button
                type="button"
                className={`btn btn-sm ${roleTab === 'admin' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ border: 'none', background: roleTab === 'admin' ? 'var(--forest-800)' : 'transparent' }}
                onClick={() => setRoleTab('admin')}
              >
                Admin
              </button>
              <button
                type="button"
                className={`btn btn-sm ${roleTab === 'driver' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ border: 'none', background: roleTab === 'driver' ? 'var(--forest-800)' : 'transparent' }}
                onClick={() => setRoleTab('driver')}
              >
                Driver
              </button>
              <button
                type="button"
                className={`btn btn-sm ${roleTab === 'reporter' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ border: 'none', background: roleTab === 'reporter' ? 'var(--forest-800)' : 'transparent' }}
                onClick={() => setRoleTab('reporter')}
              >
                Citizen
              </button>
            </div>
          )}

          {errorMsg && (
            <div className="alert-box alert-danger">
              <AlertCircle size={18} />
              <div>{errorMsg}</div>
            </div>
          )}

          {/* Quick Demo Pre-fills */}
          {!isRegisterMode && (
            <div style={{ background: '#f8faf9', border: '1px dashed var(--border-color)', borderRadius: 'var(--radius-md)', padding: '0.75rem', marginBottom: '1.25rem' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-subtle)', marginBottom: '0.4rem', textTransform: 'uppercase' }}>
                One-Click Demo Credentials:
              </div>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-sm btn-outline"
                  onClick={() => handlePreFill('admin@smartwaste.gov', 'admin123', 'admin')}
                >
                  Admin Officer
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-outline"
                  onClick={() => handlePreFill('driver.rajesh@smartwaste.gov', 'driver123', 'driver')}
                >
                  Driver Rajesh
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-outline"
                  onClick={() => handlePreFill('citizen.anita@example.com', 'citizen123', 'reporter')}
                >
                  Citizen Anita
                </button>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {isRegisterMode && (
              <>
                <div className="form-group">
                  <label className="form-label">Full Name *</label>
                  <input
                    type="text"
                    required
                    className="form-input"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Ramesh Kumar"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Phone Number (Optional)</label>
                  <input
                    type="text"
                    className="form-input"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+91 98200 00000"
                  />
                </div>
              </>
            )}

            <div className="form-group">
              <label className="form-label">Email Address *</label>
              <input
                type="email"
                required
                className="form-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@domain.gov"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Password *</label>
              <input
                type="password"
                required
                className="form-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="btn btn-primary btn-lg"
              style={{ width: '100%', marginTop: '0.5rem' }}
            >
              {isLoading ? 'Authenticating...' : isRegisterMode ? 'Create Citizen Account' : `Login as ${roleTab.toUpperCase()}`}
            </button>
          </form>

          {roleTab === 'reporter' && (
            <div style={{ textAlign: 'center', marginTop: '1rem', fontSize: '0.85rem' }}>
              {isRegisterMode ? (
                <span>
                  Already have an account?{' '}
                  <button onClick={() => setIsRegisterMode(false)} style={{ background: 'none', border: 'none', color: 'var(--forest-700)', fontWeight: 600, cursor: 'pointer' }}>
                    Sign In
                  </button>
                </span>
              ) : (
                <span>
                  Need an account?{' '}
                  <button onClick={() => setIsRegisterMode(true)} style={{ background: 'none', border: 'none', color: 'var(--forest-700)', fontWeight: 600, cursor: 'pointer' }}>
                    Register as Citizen Reporter
                  </button>
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
