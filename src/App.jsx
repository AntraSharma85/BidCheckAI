import React, { useState, useEffect, useCallback } from 'react';
import Navbar from './components/Navbar.jsx';
import OfficerDashboard from './components/OfficerDashboard.jsx';
import TendersList from './components/TendersList.jsx';
import BidSubmissionModal from './components/BidSubmissionModal.jsx';
import PublishTenderModal from './components/PublishTenderModal.jsx';
import BidDetailView from './components/BidDetailView.jsx';
import CollusionMatrixView from './components/CollusionMatrixView.jsx';
import AuditLogView from './components/AuditLogView.jsx';
import NotificationsModal from './components/NotificationsModal.jsx';
import IdentityApprovalsView from './components/IdentityApprovalsView.jsx';
import VendorDocumentsModal from './components/VendorDocumentsModal.jsx';
import {
  ShieldCheck,
  Lock,
  Mail,
  User,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  FileText,
  Bell,
  Clock,
  Check,
  ExternalLink,
  Building2,
  UserCheck,
  Briefcase,
  Landmark,
  BadgeAlert,
  Send
} from 'lucide-react';

/**
 * Safely parses API responses by verifying content-type before invoking JSON parser.
 * Prevents "Unexpected token '<', '<!doctype...' is not valid JSON" errors when
 * proxies or unhandled routes return HTML (Requirement 7).
 */
async function parseApiResponse(res, defaultError = 'Request failed') {
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || defaultError);
    }
    return data;
  }

  // Non-JSON response received (HTML error page, 502/504 gateway error, or 404 fallback)
  const text = await res.text();
  console.warn(`[API] Received non-JSON response (${contentType}, status ${res.status}):`, text.slice(0, 150));
  if (res.status === 404) {
    throw new Error('API service endpoint not found (HTTP 404). Please ensure the backend server is active.');
  }
  if (res.status === 429) {
    throw new Error('Too many requests. Please wait a few moments before trying again.');
  }
  if (res.status === 502 || res.status === 503 || res.status === 504) {
    throw new Error(`Server temporarily unavailable (HTTP ${res.status}). Please verify the backend service is running.`);
  }
  throw new Error(`Unexpected server response (HTTP ${res.status}): Expected JSON from API.`);
}

export default function App() {
  // Theme state: Persisted green light / dark mode
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('bidcheck_theme') || 'light';
  });

  // Current authenticated user state (Requirement A)
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem('bidcheck_token') || '');
  const [authLoading, setAuthLoading] = useState(true);

  // App navigation state
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedBidId, setSelectedBidId] = useState(null);

  // Data states
  const [stats, setStats] = useState(null);
  const [tenders, setTenders] = useState([]);
  const [applications, setApplications] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);

  // Modals state
  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
  const [isApplyModalOpen, setIsApplyModalOpen] = useState(false);
  const [selectedTenderToApply, setSelectedTenderToApply] = useState(null);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);

  // TWO DISTINCT LOGIN OPTIONS (Requirement 1):
  // 'officer' (Tender Officer / Government Login) vs 'bidder' (Vendor / Company Login)
  const [loginPortal, setLoginPortal] = useState('officer');

  // Auth form state: NEVER prefill email or password (Requirement A.3)
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authError, setAuthError] = useState(null);

  // Vendor Registration state (Requirement 2 & C):
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [regFullName, setRegFullName] = useState('');
  const [regOrg, setRegOrg] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regEntityType, setRegEntityType] = useState('PRIVATE_LIMITED');
  const [regCinLlpin, setRegCinLlpin] = useState('');
  const [regGstin, setRegGstin] = useState('');
  const [regPan, setRegPan] = useState('');
  const [regAddress, setRegAddress] = useState('');
  const [regRepDesignation, setRegRepDesignation] = useState('Authorized Director');

  // Email verification feedback state
  const [emailVerifying, setEmailVerifying] = useState(false);

  // Vendor KYC and Verification Documents Modal State
  const [isVendorDocsModalOpen, setIsVendorDocsModalOpen] = useState(false);
  const [regFileIncorp, setRegFileIncorp] = useState(null);
  const [regFileGst, setRegFileGst] = useState(null);
  const [regFilePan, setRegFilePan] = useState(null);

  // Apply Theme class to documentElement
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('bidcheck_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  // Verify authentication on mount (Requirement A.1, A.2, A.5)
  const checkAuth = useCallback(async (authToken) => {
    if (!authToken) {
      setUser(null);
      setAuthLoading(false);
      return;
    }
    try {
      const res = await fetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      const data = await parseApiResponse(res, 'Session verification failed.');
      if (data && data.user) {
        setUser(data.user);
        setUnreadNotifCount(data.unread_notifications || 0);
        if (data.user.role === 'officer') {
          setActiveTab('dashboard');
        } else {
          setActiveTab('catalog');
        }
      } else {
        // Invalid or expired token: clear session
        localStorage.removeItem('bidcheck_token');
        setToken('');
        setUser(null);
      }
    } catch (e) {
      console.warn('Auth check notice:', e?.message || e);
      localStorage.removeItem('bidcheck_token');
      setToken('');
      setUser(null);
    } finally {
      setAuthLoading(false);
    }
  }, []);

  // On initial mount: only load saved session if token exists. Never auto-login (Requirement A.1)
  useEffect(() => {
    const savedToken = localStorage.getItem('bidcheck_token');
    if (savedToken) {
      checkAuth(savedToken);
    } else {
      setUser(null);
      setAuthLoading(false);
    }
  }, [checkAuth]);

  // Role-based Navigation Guard
  useEffect(() => {
    if (user) {
      if (user.role === 'bidder' && ['dashboard', 'bids', 'collusion', 'audit'].includes(activeTab)) {
        setActiveTab('catalog');
      } else if (user.role === 'officer' && ['catalog', 'my_bids'].includes(activeTab)) {
        setActiveTab('dashboard');
      }
    }
  }, [user, activeTab]);

  // Fetch core application data
  const fetchData = useCallback(async () => {
    if (!user) return;
    const currentToken = localStorage.getItem('bidcheck_token');
    try {
      // Stats
      const statsRes = await fetch('/api/dashboard/stats', {
        headers: { 'Authorization': `Bearer ${currentToken}` }
      });
      if (statsRes.status === 401) {
        localStorage.removeItem('bidcheck_token');
        setToken('');
        setUser(null);
        return;
      }
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }

      // Tenders
      const tendersRes = await fetch('/api/tenders');
      if (tendersRes.ok) {
        const tendersData = await tendersRes.json();
        setTenders(tendersData.tenders || []);
      }

      // Applications
      const appsRes = await fetch('/api/applications', {
        headers: { 'Authorization': `Bearer ${currentToken}` }
      });
      if (appsRes.status === 401) {
        localStorage.removeItem('bidcheck_token');
        setToken('');
        setUser(null);
        return;
      }
      if (appsRes.ok) {
        const appsData = await appsRes.json();
        setApplications(appsData.applications || []);
      }

      // Notifications
      const notifsRes = await fetch('/api/notifications', {
        headers: { 'Authorization': `Bearer ${currentToken}` }
      });
      if (notifsRes.ok) {
        const notifsData = await notifsRes.json();
        setNotifications(notifsData.notifications || []);
        const unread = (notifsData.notifications || []).filter(n => !n.is_read).length;
        setUnreadNotifCount(unread);
      }
    } catch (err) {
      console.warn('Sync issue in background data refresh:', err?.message || err);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      fetchData();
      const interval = setInterval(fetchData, 10000); // 10s auto refresh for multi-session sync
      return () => clearInterval(interval);
    }
  }, [user, fetchData]);

  // User Login handler with Distinct Portal Verification (Requirement 1)
  const handleLogin = async (e) => {
    if (e) e.preventDefault();
    setAuthError(null);
    setAuthSubmitting(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: authEmail.trim(),
          password: authPassword,
          portalRole: loginPortal
        })
      });
      const data = await parseApiResponse(res, 'Authentication failed. Please verify your email and password.');
      localStorage.setItem('bidcheck_token', data.token);
      setToken(data.token);
      setUser(data.user);
      setSelectedBidId(null);
      // Clear password field from memory
      setAuthPassword('');
      if (data.user.role === 'officer') {
        setActiveTab('dashboard');
      } else {
        setActiveTab('catalog');
      }
    } catch (err) {
      const msg = err.message === 'Failed to fetch'
        ? 'Cannot connect to backend server. Please verify your network connection and that the backend service is running.'
        : err.message;
      setAuthError(msg);
    } finally {
      setAuthSubmitting(false);
    }
  };

  // Vendor Registration handler with Business Identifiers and Documents (Requirements 1, 2, C)
  const handleRegister = async (e) => {
    e.preventDefault();
    setAuthError(null);
    setAuthSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('email', authEmail.trim());
      formData.append('password', authPassword);
      formData.append('full_name', regFullName.trim());
      formData.append('organization', regOrg.trim());
      formData.append('phone', regPhone.trim());
      formData.append('entity_type', regEntityType);
      formData.append('cin_llpin', regCinLlpin.trim());
      formData.append('gstin', regGstin.trim());
      formData.append('pan', regPan.trim());
      formData.append('business_address', regAddress.trim());
      formData.append('rep_designation', regRepDesignation.trim());
      formData.append('rep_phone', regPhone.trim());

      if (regFileIncorp) formData.append('doc_business_reg', regFileIncorp);
      if (regFileGst) formData.append('doc_tax_reg', regFileGst);
      if (regFilePan) formData.append('doc_pan_card', regFilePan);

      const res = await fetch('/api/auth/register', {
        method: 'POST',
        body: formData
      });
      const data = await parseApiResponse(res, 'Registration failed.');
      localStorage.setItem('bidcheck_token', data.token);
      setToken(data.token);
      setUser(data.user);
      setIsRegisterMode(false);
      setAuthPassword('');
      setActiveTab('catalog');
    } catch (err) {
      const msg = err.message === 'Failed to fetch'
        ? 'Cannot connect to backend server. Please verify your network connection and that the backend service is running.'
        : err.message;
      setAuthError(msg);
    } finally {
      setAuthSubmitting(false);
    }
  };

  // Vendor Email Verification handler (Requirement 2)
  const handleVerifyEmail = async () => {
    setEmailVerifying(true);
    try {
      const currentToken = localStorage.getItem('bidcheck_token');
      const res = await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${currentToken}`
        }
      });
      const data = await parseApiResponse(res, 'Email verification failed.');
      if (data && data.success) {
        setUser(prev => ({
          ...prev,
          verification_status: data.verification_status,
          email_verified_at: data.email_verified_at
        }));
        await fetchData();
      }
    } catch (err) {
      console.error('Email verification error:', err?.message || err);
    } finally {
      setEmailVerifying(false);
    }
  };

  // Logout handler (Requirement A.4)
  const handleLogout = async () => {
    try {
      const currentToken = localStorage.getItem('bidcheck_token');
      if (currentToken) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${currentToken}` }
        });
      }
    } catch (e) {
      // ignore network errors on logout
    }
    // Clear stored session and reset state completely
    localStorage.removeItem('bidcheck_token');
    setToken('');
    setUser(null);
    setSelectedBidId(null);
    setAuthEmail('');
    setAuthPassword('');
    setStats(null);
    setApplications([]);
    setNotifications([]);
    setActiveTab('dashboard');
  };

  // Notification actions
  const handleMarkNotificationRead = async (id) => {
    try {
      const currentToken = localStorage.getItem('bidcheck_token');
      await fetch(`/api/notifications/${id}/read`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${currentToken}` }
      });
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: 1 } : n));
      setUnreadNotifCount(prev => Math.max(0, prev - 1));
    } catch (e) {
      console.error(e);
    }
  };

  const handleMarkAllNotificationsRead = async () => {
    try {
      const currentToken = localStorage.getItem('bidcheck_token');
      await fetch('/api/notifications/mark-all-read', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${currentToken}` }
      });
      setNotifications(prev => prev.map(n => ({ ...n, is_read: 1 })));
      setUnreadNotifCount(0);
    } catch (e) {
      console.error(e);
    }
  };

  // Navigation from notifications
  const handleNavigateFromLink = (link) => {
    if (link.startsWith('/tenders/')) {
      setActiveTab(user?.role === 'officer' ? 'dashboard' : 'catalog');
    } else if (link.startsWith('/applications/')) {
      const appId = link.split('/')[2];
      setSelectedBidId(appId);
    } else if (link === '/my-bids') {
      setActiveTab('my_bids');
    }
  };

  // If not logged in, render the TWO DISTINCT LOGIN OPTIONS (Requirement 1 & 2)
  if (!user && !authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-teal-50/40 to-slate-100 dark:from-slate-950 dark:via-emerald-950/20 dark:to-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-xl bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 sm:p-8 space-y-6">
          {/* Header & Brand */}
          <div className="text-center space-y-1.5">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-700 via-emerald-600 to-teal-500 mx-auto flex items-center justify-center text-white shadow-lg shadow-emerald-700/25">
              <ShieldCheck className="w-8 h-8" />
            </div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              BidCheck<span className="text-emerald-600 dark:text-emerald-400">AI</span>
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Public Procurement Integrity & Bid Compliance Authority
            </p>
          </div>

          {/* TWO DISTINCT LOGIN OPTIONS TABS (Requirement 1) */}
          {!isRegisterMode && (
            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-2xl">
              <button
                type="button"
                onClick={() => {
                  setLoginPortal('officer');
                  setAuthError(null);
                }}
                className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                  loginPortal === 'officer'
                    ? 'bg-white dark:bg-slate-900 text-emerald-800 dark:text-emerald-300 shadow-sm border border-emerald-600/20'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Landmark className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                <div className="text-left">
                  <div className="leading-tight">Tender Officer</div>
                  <div className="text-[10px] font-normal opacity-80">Government Portal</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setLoginPortal('bidder');
                  setAuthError(null);
                }}
                className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                  loginPortal === 'bidder'
                    ? 'bg-white dark:bg-slate-900 text-teal-800 dark:text-teal-300 shadow-sm border border-teal-600/20'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Briefcase className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                <div className="text-left">
                  <div className="leading-tight">Vendor / Company</div>
                  <div className="text-[10px] font-normal opacity-80">Enterprise Portal</div>
                </div>
              </button>
            </div>
          )}

          {/* Portal Information Banner */}
          {!isRegisterMode && (
            <div className={`p-3 rounded-xl text-xs flex items-start gap-2.5 border ${
              loginPortal === 'officer'
                ? 'bg-emerald-50/80 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-200 border-emerald-200/60 dark:border-emerald-900/40'
                : 'bg-teal-50/80 dark:bg-teal-950/30 text-teal-900 dark:text-teal-200 border-teal-200/60 dark:border-teal-900/40'
            }`}>
              {loginPortal === 'officer' ? (
                <>
                  <ShieldCheck className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <strong>Tender Officer Portal:</strong> Restricted to authorized government procurement officers and evaluation board members. Accounts must be provisioned institutionally.
                  </div>
                </>
              ) : (
                <>
                  <Building2 className="w-4 h-4 text-teal-700 dark:text-teal-400 shrink-0 mt-0.5" />
                  <div>
                    <strong>Vendor Bidding Portal:</strong> Verified corporate enterprises, joint ventures, and authorized company representatives submitting tender proposals.
                  </div>
                </>
              )}
            </div>
          )}

          {authError && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-xl flex items-center gap-2 text-rose-700 dark:text-rose-300 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{authError}</span>
            </div>
          )}

          {isRegisterMode ? (
            /* VENDOR ENTERPRISE SELF-REGISTRATION FORM (Requirement 2 & C) */
            <form onSubmit={handleRegister} className="space-y-3.5">
              <div className="p-3 bg-teal-50/80 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-900/40 rounded-xl text-xs text-teal-900 dark:text-teal-200 space-y-1">
                <strong>Vendor Enterprise Registration (Public):</strong> Register your bidding entity. Corporate registration numbers (CIN/LLPIN, GSTIN, PAN) will be reviewed by the Procurement Authority before bid submissions are unlocked.
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Enterprise Legal Name *</label>
                <input
                  type="text"
                  required
                  value={regOrg}
                  onChange={(e) => setRegOrg(e.target.value)}
                  placeholder="e.g. Apex Engineering Consortium Ltd"
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-hidden focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Entity Legal Type *</label>
                  <select
                    value={regEntityType}
                    onChange={(e) => setRegEntityType(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-hidden focus:border-emerald-500"
                  >
                    <option value="PRIVATE_LIMITED">Private Limited Company</option>
                    <option value="PUBLIC_LIMITED">Public Limited Company</option>
                    <option value="LLP">Limited Liability Partnership (LLP)</option>
                    <option value="PARTNERSHIP">Registered Partnership</option>
                    <option value="SOLE_PROPRIETORSHIP">Sole Proprietorship</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">CIN / LLPIN Number</label>
                  <input
                    type="text"
                    value={regCinLlpin}
                    onChange={(e) => setRegCinLlpin(e.target.value)}
                    placeholder="e.g. U72200DL2020PTC123456"
                    className="w-full px-3 py-2 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-hidden focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">GSTIN Identification</label>
                  <input
                    type="text"
                    value={regGstin}
                    onChange={(e) => setRegGstin(e.target.value)}
                    placeholder="e.g. 07AAAAA0000A1Z5"
                    className="w-full px-3 py-2 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-hidden focus:border-emerald-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Corporate PAN Number</label>
                  <input
                    type="text"
                    value={regPan}
                    onChange={(e) => setRegPan(e.target.value)}
                    placeholder="e.g. AAAAA0000A"
                    className="w-full px-3 py-2 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-hidden focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Registered Business Address</label>
                <input
                  type="text"
                  value={regAddress}
                  onChange={(e) => setRegAddress(e.target.value)}
                  placeholder="e.g. Sector 18, Commercial Tower, New Delhi"
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-hidden focus:border-emerald-500"
                />
              </div>

              <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-2">
                  Authorized Representative Details
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Representative Name *</label>
                    <input
                      type="text"
                      required
                      value={regFullName}
                      onChange={(e) => setRegFullName(e.target.value)}
                      placeholder="e.g. Marcus Vance"
                      className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-hidden focus:border-emerald-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Designation *</label>
                    <input
                      type="text"
                      required
                      value={regRepDesignation}
                      onChange={(e) => setRegRepDesignation(e.target.value)}
                      placeholder="e.g. Managing Director"
                      className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-hidden focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-2">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Corporate Email *</label>
                    <input
                      type="email"
                      required
                      value={authEmail}
                      onChange={(e) => setAuthEmail(e.target.value)}
                      placeholder="rep@company.com"
                      className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-hidden focus:border-emerald-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Phone</label>
                    <input
                      type="tel"
                      value={regPhone}
                      onChange={(e) => setRegPhone(e.target.value)}
                      placeholder="+1-555-0199"
                      className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-hidden focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="space-y-1 mt-2">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Security Password *</label>
                  <input
                    type="password"
                    required
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    placeholder="Create a strong account password"
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-hidden focus:border-emerald-500"
                  />
                </div>

                {/* Upload Verification Documents (Requirement 1) */}
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Upload Verification Documents (PDF, PNG, JPG)
                    </span>
                    <span className="text-[10px] text-teal-600 dark:text-teal-400 font-semibold">
                      Optional now, can be updated later
                    </span>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div>
                      <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 block mb-0.5">
                        1. Certificate of Incorporation / Business Registration
                      </label>
                      <input
                        type="file"
                        accept=".pdf,.png,.jpg,.jpeg,.webp"
                        onChange={(e) => setRegFileIncorp(e.target.files?.[0] || null)}
                        className="w-full text-xs text-slate-500 file:mr-2 file:py-1 file:px-2.5 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-teal-50 file:text-teal-700 dark:file:bg-teal-950 dark:file:text-teal-300"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 block mb-0.5">
                        2. GSTIN / Tax Clearance Certificate
                      </label>
                      <input
                        type="file"
                        accept=".pdf,.png,.jpg,.jpeg,.webp"
                        onChange={(e) => setRegFileGst(e.target.files?.[0] || null)}
                        className="w-full text-xs text-slate-500 file:mr-2 file:py-1 file:px-2.5 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-teal-50 file:text-teal-700 dark:file:bg-teal-950 dark:file:text-teal-300"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 block mb-0.5">
                        3. Corporate PAN Card
                      </label>
                      <input
                        type="file"
                        accept=".pdf,.png,.jpg,.jpeg,.webp"
                        onChange={(e) => setRegFilePan(e.target.files?.[0] || null)}
                        className="w-full text-xs text-slate-500 file:mr-2 file:py-1 file:px-2.5 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-teal-50 file:text-teal-700 dark:file:bg-teal-950 dark:file:text-teal-300"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={authSubmitting}
                className="w-full py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs rounded-xl shadow-md transition-all mt-2 disabled:opacity-50"
              >
                {authSubmitting ? 'Registering Enterprise...' : 'Submit Enterprise Registration'}
              </button>

              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsRegisterMode(false);
                    setAuthError(null);
                  }}
                  className="text-xs font-semibold text-teal-600 dark:text-teal-400 hover:underline"
                >
                  Already registered? Sign in via Vendor Portal
                </button>
              </div>
            </form>
          ) : (
            /* DUAL LOGIN FORM (Requirement 1) */
            <div className="space-y-4">
              <form onSubmit={handleLogin} className="space-y-3.5">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    {loginPortal === 'officer' ? 'Official Government Email' : 'Corporate Email Address'}
                  </label>
                  <input
                    type="email"
                    required
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    placeholder={loginPortal === 'officer' ? "officer@procure.gov" : "vendor@company.com"}
                    className="w-full px-3.5 py-2.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-hidden focus:border-emerald-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    {loginPortal === 'officer' ? 'Officer Security Password' : 'Password'}
                  </label>
                  <input
                    type="password"
                    required
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    placeholder="Enter your security password"
                    className="w-full px-3.5 py-2.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-hidden focus:border-emerald-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={authSubmitting}
                  className={`w-full py-2.5 text-white font-bold text-xs rounded-xl shadow-md transition-all disabled:opacity-50 ${
                    loginPortal === 'officer'
                      ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-700/20'
                      : 'bg-teal-600 hover:bg-teal-700 shadow-teal-700/20'
                  }`}
                >
                  {authSubmitting
                    ? 'Verifying Authority Credentials...'
                    : loginPortal === 'officer'
                    ? 'Sign In as Tender Officer'
                    : 'Sign In as Vendor Enterprise'}
                </button>
              </form>

              {/* Portal-specific footer actions */}
              <div className="text-center pt-2 border-t border-slate-100 dark:border-slate-800">
                {loginPortal === 'bidder' ? (
                  <button
                    type="button"
                    onClick={() => {
                      setIsRegisterMode(true);
                      setAuthError(null);
                    }}
                    className="text-xs font-semibold text-teal-600 dark:text-teal-400 hover:underline"
                  >
                    New bidding enterprise? Complete public vendor registration
                  </button>
                ) : (
                  <p className="text-[11px] text-slate-400 dark:text-slate-500">
                    Institutional officer onboarding is managed exclusively by the Procurement Authority.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  const isOfficer = user?.role === 'officer';

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col antialiased transition-colors duration-200">
      {/* Navigation Bar */}
      <Navbar
        user={user}
        onLogout={handleLogout}
        theme={theme}
        onToggleTheme={toggleTheme}
        activeTab={activeTab}
        setActiveTab={(tab) => {
          setSelectedBidId(null);
          setActiveTab(tab);
        }}
        unreadCount={unreadNotifCount}
        onOpenNotifications={() => setIsNotificationsOpen(true)}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Verification & Identity Authorization Status Banners (Requirements 2, 3, 5) */}
        {!isOfficer && user?.verification_status === 'EMAIL_PENDING' && (
          <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-900 dark:text-amber-200 shadow-sm animate-in fade-in">
            <div className="flex items-start gap-3">
              <Mail className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <strong className="text-sm font-bold block">Action Required: Corporate Email Unverified</strong>
                Please confirm your corporate email address to submit your enterprise profile (CIN/GSTIN/PAN) for administrative verification.
              </div>
            </div>
            <button
              onClick={handleVerifyEmail}
              disabled={emailVerifying}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl shadow-xs transition-all active:scale-95 shrink-0 self-start sm:self-auto disabled:opacity-50"
            >
              {emailVerifying ? 'Verifying...' : 'Confirm Corporate Email'}
            </button>
          </div>
        )}

        {!isOfficer && user?.verification_status === 'VERIFICATION_PENDING' && (
          <div className="mb-6 p-4 bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-900/60 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-teal-900 dark:text-teal-200 shadow-sm animate-in fade-in">
            <div className="flex items-start gap-3">
              <Clock className="w-5 h-5 text-teal-600 dark:text-teal-400 shrink-0 mt-0.5" />
              <div>
                <strong className="text-sm font-bold block">Enterprise Verification Under Administrative Review</strong>
                Your business credentials ({user.cin_llpin ? `CIN: ${user.cin_llpin}` : ''} {user.gstin ? `• GSTIN: ${user.gstin}` : ''} {user.pan ? `• PAN: ${user.pan}` : ''}) and submitted certificates are under review by the Procurement Authority.
              </div>
            </div>
            <button
              onClick={() => setIsVendorDocsModalOpen(true)}
              className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl shadow-xs transition-all active:scale-95 shrink-0 self-start sm:self-auto flex items-center gap-1.5"
            >
              <FileText className="w-4 h-4" />
              <span>Manage Verification Documents</span>
            </button>
          </div>
        )}

        {!isOfficer && user?.verification_status === 'REJECTED' && (
          <div className="mb-6 p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-rose-900 dark:text-rose-200 shadow-sm animate-in fade-in">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <div>
                <strong className="text-sm font-bold block">Enterprise Verification Rejected</strong>
                Your business verification was not approved. {user.verification_notes ? `Notes: ${user.verification_notes}` : 'Please review and resubmit your business registration records.'}
              </div>
            </div>
            <button
              onClick={() => setIsVendorDocsModalOpen(true)}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl shadow-xs transition-all active:scale-95 shrink-0 self-start sm:self-auto flex items-center gap-1.5"
            >
              <FileText className="w-4 h-4" />
              <span>Resubmit Documents</span>
            </button>
          </div>
        )}

        {!isOfficer && user?.verification_status === 'SUSPENDED' && (
          <div className="mb-6 p-4 bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-2xl flex items-start gap-3 text-xs text-slate-800 dark:text-slate-200 shadow-sm animate-in fade-in">
            <AlertCircle className="w-5 h-5 text-slate-600 dark:text-slate-400 shrink-0 mt-0.5" />
            <div>
              <strong className="text-sm font-bold block">Account Suspended</strong>
              Your vendor enterprise bidding privileges have been suspended by the Procurement Authority.
            </div>
          </div>
        )}

        {isOfficer && user?.verification_status === 'PENDING_VERIFICATION' && (
          <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 rounded-2xl flex items-start gap-3 text-xs text-amber-900 dark:text-amber-200 shadow-sm animate-in fade-in">
            <Clock className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <strong className="text-sm font-bold block">Procurement Officer Authority Pending Administrative Approval</strong>
              Your officer account is awaiting verification by the Board Administration. Publishing tenders and issuing official decisions are restricted until your credential is confirmed.
            </div>
          </div>
        )}

        {/* If an individual Bid Detail is selected, show BidDetailView */}
        {selectedBidId ? (
          <BidDetailView
            bidId={selectedBidId}
            user={user}
            onBack={() => setSelectedBidId(null)}
            onRefresh={fetchData}
          />
        ) : (
          <>
            {/* Officer Views */}
            {isOfficer && activeTab === 'dashboard' && (
              <OfficerDashboard
                stats={stats}
                applications={applications}
                tenders={tenders}
                onSelectBid={(id) => setSelectedBidId(id)}
                onOpenNewTender={() => setIsPublishModalOpen(true)}
                onNavigate={(tab) => setActiveTab(tab)}
              />
            )}

            {isOfficer && activeTab === 'approvals' && (
              <IdentityApprovalsView
                user={user}
                onActionSuccess={fetchData}
              />
            )}

            {isOfficer && activeTab === 'tenders' && (
              <TendersList
                tenders={tenders}
                user={user}
                onOpenNewTender={() => setIsPublishModalOpen(true)}
                onApplyTender={(t) => {
                  setSelectedTenderToApply(t);
                  setIsApplyModalOpen(true);
                }}
                onViewTenderBids={(tenderId) => {
                  setActiveTab('bids');
                }}
                onViewCollusion={(tenderId) => {
                  setActiveTab('collusion');
                }}
              />
            )}

            {isOfficer && activeTab === 'bids' && (
              <div className="space-y-4 animate-in fade-in">
                <div className="flex items-center justify-between">
                  <div>
                    <h1 className="text-2xl font-black text-slate-900 dark:text-white">
                      Submitted Bids
                    </h1>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Inspect proposals, review rule compliance checks, and record binding official decisions.
                    </p>
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs divide-y divide-slate-100 dark:divide-slate-800">
                  {applications.map((app) => (
                    <div key={app.id} className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 dark:text-white text-base">
                            {app.company_name}
                          </span>
                          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                            app.ai_risk_level === 'HIGH'
                              ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                              : app.ai_risk_level === 'UNCERTAIN'
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                              : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                          }`}>
                            Risk: {app.ai_risk_level}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          Tender: <strong className="text-slate-800 dark:text-slate-200">{app.tender_title}</strong> (${parseFloat(app.bid_amount).toLocaleString()})
                        </div>
                      </div>

                      <div className="flex items-center gap-3 self-end sm:self-auto">
                        <div className="text-right text-xs">
                          <span className="text-slate-400 block text-[10px] uppercase">Official Decision</span>
                          <strong className="text-emerald-700 dark:text-emerald-400">{app.official_decision}</strong>
                        </div>
                        <button
                          onClick={() => setSelectedBidId(app.id)}
                          className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-colors"
                        >
                          Inspect Details
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {isOfficer && activeTab === 'collusion' && (
              <CollusionMatrixView
                tenders={tenders}
                onSelectBid={(id) => setSelectedBidId(id)}
              />
            )}

            {isOfficer && activeTab === 'audit' && (
              <AuditLogView />
            )}

            {/* Bidder Views */}
            {!isOfficer && activeTab === 'catalog' && (
              <TendersList
                tenders={tenders}
                user={user}
                onOpenNewTender={() => setIsPublishModalOpen(true)}
                onApplyTender={(t) => {
                  setSelectedTenderToApply(t);
                  setIsApplyModalOpen(true);
                }}
                onViewTenderBids={() => {}}
                onViewCollusion={() => {}}
              />
            )}

            {!isOfficer && activeTab === 'my_bids' && (
              <div className="space-y-4 animate-in fade-in">
                <div>
                  <h1 className="text-2xl font-black text-slate-900 dark:text-white">
                    My Applications
                  </h1>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Live status tracking, clarification threads, and certified document resubmission.
                  </p>
                </div>

                {applications.length === 0 ? (
                  <div className="bg-white dark:bg-slate-900 p-8 rounded-2xl border border-slate-200 dark:border-slate-800 text-center space-y-3">
                    <FileText className="w-10 h-10 text-slate-400 mx-auto" />
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                      You have not submitted any applications yet.
                    </p>
                    <button
                      onClick={() => setActiveTab('catalog')}
                      className="px-4 py-2 bg-emerald-600 text-white font-bold text-xs rounded-xl"
                    >
                      Browse Open Tenders
                    </button>
                  </div>
                ) : (
                  <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs divide-y divide-slate-100 dark:divide-slate-800">
                    {applications.map((app) => (
                      <div key={app.id} className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 dark:text-white text-base">
                              {app.tender_title}
                            </span>
                            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                              app.status === 'QUALIFIED' || app.status === 'AWARDED'
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                : app.status === 'CLARIFICATION_REQUESTED'
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 animate-pulse'
                                : 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                            }`}>
                              {app.status.replace(/_/g, ' ')}
                            </span>
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            Bid Offer: <strong>${parseFloat(app.bid_amount).toLocaleString()} {app.currency}</strong> • Submitted: {new Date(app.submission_date).toLocaleDateString()}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setSelectedBidId(app.id)}
                            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-colors"
                          >
                            View Application & Respond
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Bidder Notifications Page */}
            {!isOfficer && activeTab === 'notifications' && (
              <div className="space-y-4 animate-in fade-in max-w-4xl mx-auto">
                <div className="flex items-center justify-between">
                  <div>
                    <h1 className="text-2xl font-black text-slate-900 dark:text-white">
                      Notifications & Alerts
                    </h1>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Official updates regarding tender publications, clarification inquiries, and evaluation status.
                    </p>
                  </div>
                  {notifications.some(n => !n.is_read) && (
                    <button
                      onClick={handleMarkAllNotificationsRead}
                      className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/60 rounded-lg"
                    >
                      Mark all as read
                    </button>
                  )}
                </div>

                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
                  {notifications.length === 0 ? (
                    <div className="text-center py-12 px-4">
                      <Bell className="w-10 h-10 text-slate-300 dark:text-slate-700 mx-auto mb-2" />
                      <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">No notifications</p>
                      <p className="text-xs text-slate-400">Status changes and requests will appear here.</p>
                    </div>
                  ) : (
                    notifications.map((n) => (
                      <div
                        key={n.id}
                        className={`p-4 transition-colors flex items-start justify-between gap-3 ${
                          n.is_read
                            ? 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                            : 'bg-emerald-50/40 dark:bg-emerald-950/20'
                        }`}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-slate-900 dark:text-white">
                              {n.title}
                            </span>
                            {!n.is_read && (
                              <span className="px-1.5 py-0.2 bg-emerald-600 text-white text-[9px] font-bold rounded-sm uppercase tracking-wider">
                                New
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                            {n.message}
                          </p>
                          <div className="flex items-center gap-2 text-[10px] text-slate-400 pt-1">
                            <Clock className="w-3 h-3" />
                            <span>{new Date(n.created_at).toLocaleString()}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {!n.is_read && (
                            <button
                              onClick={() => handleMarkNotificationRead(n.id)}
                              className="px-2.5 py-1 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-emerald-600 bg-slate-100 dark:bg-slate-800 rounded-lg flex items-center gap-1"
                            >
                              <Check className="w-3 h-3" /> Mark read
                            </button>
                          )}
                          {n.link && (
                            <button
                              onClick={() => handleNavigateFromLink(n.link)}
                              className="px-2.5 py-1 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg flex items-center gap-1"
                            >
                              View <ExternalLink className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800 py-6 text-center text-xs text-slate-500 dark:text-slate-400 bg-white/50 dark:bg-slate-900/50">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            BidCheck AI — Public Procurement & Tender Compliance Portal
          </div>
          <div className="text-slate-400 text-[11px]">
            Official Government Procurement Integrity System • Confidential & Protected
          </div>
        </div>
      </footer>

      {/* Modals */}
      <PublishTenderModal
        isOpen={isPublishModalOpen}
        onClose={() => setIsPublishModalOpen(false)}
        user={user}
        onSuccess={(newTender) => {
          fetchData();
          alert(`Tender "${newTender.title}" successfully published.`);
        }}
      />

      <BidSubmissionModal
        isOpen={isApplyModalOpen}
        onClose={() => {
          setIsApplyModalOpen(false);
          setSelectedTenderToApply(null);
        }}
        tender={selectedTenderToApply}
        user={user}
        onSuccess={(newApp) => {
          fetchData();
          setActiveTab('my_bids');
          alert('Sealed bid proposal and documents successfully submitted and analyzed.');
        }}
      />

      <NotificationsModal
        isOpen={isNotificationsOpen}
        onClose={() => setIsNotificationsOpen(false)}
        notifications={notifications}
        onMarkRead={handleMarkNotificationRead}
        onMarkAllRead={handleMarkAllNotificationsRead}
        onNavigate={handleNavigateFromLink}
      />

      <VendorDocumentsModal
        isOpen={isVendorDocsModalOpen}
        onClose={() => setIsVendorDocsModalOpen(false)}
        onRefresh={fetchData}
      />
    </div>
  );
}
