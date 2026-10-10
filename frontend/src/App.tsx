import { useState, useEffect } from 'react';
import { Truck, Shield, Search, PlusCircle, LogIn, LogOut, User, AlertCircle, Menu, X, Sparkles } from 'lucide-react';
import { api, setStoredToken } from './services/api';
import { PublicPortal } from './features/public/PublicPortal';
import { AdminPortal } from './features/admin/AdminPortal';
import { DriverPortal } from './features/driver/DriverPortal';
import { AuthModal } from './features/auth/AuthModal';

export function App() {
  const [currentUser, setCurrentUser] = useState<any | null>(null);
  const [currentTab, setCurrentTab] = useState<'portal' | 'report' | 'track' | 'admin' | 'driver' | 'reporter'>('portal');
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authDefaultTab, setAuthDefaultTab] = useState<'admin' | 'driver' | 'reporter'>('admin');
  const [trackToken, setTrackToken] = useState<string>('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Check existing session
  useEffect(() => {
    const verifyUser = async () => {
      try {
        const u = await api.getMe();
        setCurrentUser(u);
        if (u.role === 'admin') setCurrentTab('admin');
        else if (u.role === 'driver') setCurrentTab('driver');
        else if (u.role === 'reporter') setCurrentTab('portal');
      } catch {
        setCurrentUser(null);
      }
    };
    verifyUser();
  }, []);

  const handleLogout = () => {
    setStoredToken(null);
    setCurrentUser(null);
    setCurrentTab('portal');
    setMobileMenuOpen(false);
  };

  const handleLoginSuccess = (user: any) => {
    setCurrentUser(user);
    if (user.role === 'admin') setCurrentTab('admin');
    else if (user.role === 'driver') setCurrentTab('driver');
    else if (user.role === 'reporter') setCurrentTab('portal');
    setMobileMenuOpen(false);
  };

  const openAuth = (role: 'admin' | 'driver' | 'reporter') => {
    setAuthDefaultTab(role);
    setAuthModalOpen(true);
    setMobileMenuOpen(false);
  };

  const switchTab = (tab: 'portal' | 'report' | 'track' | 'admin' | 'driver' | 'reporter') => {
    setCurrentTab(tab);
    setMobileMenuOpen(false);
  };

  return (
    <div className="app-container">
      {/* Top Municipal Header Bar */}
      <header className="top-bar">
        <div className="brand-container" onClick={() => switchTab('portal')} style={{ cursor: 'pointer' }}>
          <Truck size={22} color="#52b788" />
          <span className="brand-title">EcoRoute • Smart Waste Operations</span>
          <span className="brand-badge">Municipal MRF & Dispatch</span>
        </div>

        {/* Desktop Navigation */}
        <nav className="nav-actions desktop-nav">
          {/* Public options */}
          <button
            onClick={() => switchTab('portal')}
            className={`nav-link ${currentTab === 'portal' ? 'active' : ''}`}
            style={{ background: 'none', border: 'none', cursor: 'pointer' }}
          >
            <Sparkles size={16} /> Services Hub
          </button>

          <button
            onClick={() => switchTab('report')}
            className={`nav-link ${currentTab === 'report' ? 'active' : ''}`}
            style={{ background: 'none', border: 'none', cursor: 'pointer' }}
          >
            <PlusCircle size={16} /> Report Waste
          </button>

          <button
            onClick={() => switchTab('track')}
            className={`nav-link ${currentTab === 'track' ? 'active' : ''}`}
            style={{ background: 'none', border: 'none', cursor: 'pointer' }}
          >
            <Search size={16} /> Track Request & ETA
          </button>

          {/* Role views */}
          {currentUser?.role === 'admin' && (
            <button
              onClick={() => switchTab('admin')}
              className={`nav-link ${currentTab === 'admin' ? 'active' : ''}`}
              style={{ background: 'none', border: 'none', cursor: 'pointer' }}
            >
              <Shield size={16} /> Admin Operations
            </button>
          )}

          {currentUser?.role === 'driver' && (
            <button
              onClick={() => switchTab('driver')}
              className={`nav-link ${currentTab === 'driver' ? 'active' : ''}`}
              style={{ background: 'none', border: 'none', cursor: 'pointer' }}
            >
              <Truck size={16} /> Driver Tasks
            </button>
          )}

          {currentUser?.role === 'reporter' && (
            <button
              onClick={() => switchTab('reporter')}
              className={`nav-link ${currentTab === 'reporter' ? 'active' : ''}`}
              style={{ background: 'none', border: 'none', cursor: 'pointer' }}
            >
              <User size={16} /> My Reports
            </button>
          )}

          {/* Auth status & controls */}
          {currentUser ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginLeft: '0.5rem', borderLeft: '1px solid rgba(255,255,255,0.2)', paddingLeft: '0.75rem' }}>
              <span style={{ fontSize: '0.8rem', color: '#c9e8d8' }}>
                {currentUser.full_name} ({currentUser.role.toUpperCase()})
              </span>
              <button
                onClick={handleLogout}
                className="btn btn-sm btn-secondary"
                style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none' }}
                title="Logout"
              >
                <LogOut size={14} />
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '0.4rem', marginLeft: '0.5rem' }}>
              <button
                onClick={() => openAuth('admin')}
                className="btn btn-sm btn-outline"
                style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.3)', fontSize: '0.75rem' }}
              >
                Admin Login
              </button>
              <button
                onClick={() => openAuth('driver')}
                className="btn btn-sm btn-outline"
                style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.3)', fontSize: '0.75rem' }}
              >
                Driver Login
              </button>
              <button
                onClick={() => openAuth('reporter')}
                className="btn btn-sm btn-secondary"
                style={{ fontSize: '0.75rem' }}
              >
                <LogIn size={13} /> Sign In
              </button>
            </div>
          )}
        </nav>

        {/* Mobile Hamburger Button */}
        <button
          className="mobile-menu-toggle"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="Toggle navigation menu"
        >
          {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </header>

      {/* Mobile Drawer Navigation */}
      {mobileMenuOpen && (
        <div className="mobile-nav-drawer">
          <div className="mobile-nav-links">
            <button
              onClick={() => switchTab('report')}
              className={`mobile-nav-item ${currentTab === 'report' ? 'active' : ''}`}
            >
              <PlusCircle size={18} /> Report Waste
            </button>
            <button
              onClick={() => switchTab('track')}
              className={`mobile-nav-item ${currentTab === 'track' ? 'active' : ''}`}
            >
              <Search size={18} /> Track Request Status
            </button>
            {currentUser?.role === 'admin' && (
              <button
                onClick={() => switchTab('admin')}
                className={`mobile-nav-item ${currentTab === 'admin' ? 'active' : ''}`}
              >
                <Shield size={18} /> Admin Command Center
              </button>
            )}
            {currentUser?.role === 'driver' && (
              <button
                onClick={() => switchTab('driver')}
                className={`mobile-nav-item ${currentTab === 'driver' ? 'active' : ''}`}
              >
                <Truck size={18} /> Driver Route Tasks
              </button>
            )}
            {currentUser?.role === 'reporter' && (
              <button
                onClick={() => switchTab('reporter')}
                className={`mobile-nav-item ${currentTab === 'reporter' ? 'active' : ''}`}
              >
                <User size={18} /> Citizen Portal
              </button>
            )}
          </div>

          <div className="mobile-nav-auth">
            {currentUser ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                <div style={{ fontSize: '0.85rem', color: '#a7f3d0', fontWeight: 600 }}>
                  Signed in as: {currentUser.full_name} ({currentUser.role.toUpperCase()})
                </div>
                <button
                  onClick={handleLogout}
                  className="btn btn-secondary btn-sm"
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  <LogOut size={16} /> Sign Out
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <button
                  onClick={() => openAuth('admin')}
                  className="btn btn-outline btn-sm"
                  style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.4)', justifyContent: 'center' }}
                >
                  <Shield size={15} /> Admin Login
                </button>
                <button
                  onClick={() => openAuth('driver')}
                  className="btn btn-outline btn-sm"
                  style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.4)', justifyContent: 'center' }}
                >
                  <Truck size={15} /> Driver Login
                </button>
                <button
                  onClick={() => openAuth('reporter')}
                  className="btn btn-primary btn-sm"
                  style={{ justifyContent: 'center' }}
                >
                  <LogIn size={15} /> Citizen Sign In / Register
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main View Router */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {currentTab === 'portal' && (
          <PublicPortal
            key="portal-home"
            initialTab="home"
            initialTrackToken={trackToken}
            currentUser={currentUser}
            onOpenAuth={openAuth}
            onTrackRedirect={(token) => {
              setTrackToken(token);
              setCurrentTab('track');
            }}
          />
        )}

        {currentTab === 'report' && (
          <PublicPortal
            key="portal-report"
            initialTab="report"
            initialTrackToken={trackToken}
            currentUser={currentUser}
            onOpenAuth={openAuth}
            onTrackRedirect={(token) => {
              setTrackToken(token);
              setCurrentTab('track');
            }}
          />
        )}

        {currentTab === 'track' && (
          <PublicPortal
            key="portal-track"
            initialTab="track"
            initialTrackToken={trackToken}
            currentUser={currentUser}
            onOpenAuth={openAuth}
            onTrackRedirect={(token) => {
              setTrackToken(token);
              setCurrentTab('track');
            }}
          />
        )}

        {currentTab === 'reporter' && (
          <PublicPortal
            key="portal-my-reports"
            initialTab="my-reports"
            initialTrackToken={trackToken}
            currentUser={currentUser}
            onOpenAuth={openAuth}
            onTrackRedirect={(token) => {
              setTrackToken(token);
              setCurrentTab('track');
            }}
          />
        )}

        {currentTab === 'admin' && (
          currentUser?.role === 'admin' ? (
            <AdminPortal />
          ) : (
            <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
              <AlertCircle size={48} color="var(--status-danger)" style={{ margin: '0 auto 1rem' }} />
              <h2>Access Denied</h2>
              <p style={{ color: 'var(--text-muted)' }}>Admin credentials required to view this area.</p>
              <button onClick={() => openAuth('admin')} className="btn btn-primary" style={{ marginTop: '1rem' }}>
                Login as Administrator
              </button>
            </div>
          )
        )}

        {currentTab === 'driver' && (
          currentUser?.role === 'driver' ? (
            <DriverPortal currentUser={currentUser} />
          ) : (
            <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
              <Truck size={48} color="var(--forest-700)" style={{ margin: '0 auto 1rem' }} />
              <h2>Driver Portal</h2>
              <p style={{ color: 'var(--text-muted)' }}>Sign in with assigned driver credentials to access field route run sheets.</p>
              <button onClick={() => openAuth('driver')} className="btn btn-primary" style={{ marginTop: '1rem' }}>
                Login as Driver
              </button>
            </div>
          )
        )}
      </div>

      {/* Auth Modal */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onLoginSuccess={handleLoginSuccess}
        defaultRoleTab={authDefaultTab}
      />
    </div>
  );
}
export default App;
