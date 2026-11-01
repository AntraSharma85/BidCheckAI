import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Building2,
  UserCheck,
  Search,
  Filter,
  Plus,
  Mail,
  Phone,
  FileText,
  Clock,
  Ban,
  BadgeCheck,
  ExternalLink,
  Info,
  ChevronDown,
  ChevronUp,
  Download,
  Eye,
  FileCheck2,
  FileWarning,
  FileQuestion,
  HelpCircle,
  X,
  FileImage,
  RefreshCw,
  Lock,
  Unlock
} from 'lucide-react';

export default function IdentityApprovalsView({ user, onActionSuccess }) {
  const [activeSubTab, setActiveSubTab] = useState('vendors'); // 'vendors' | 'officers'
  const [usersList, setUsersList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Expanded vendor dossiers state: map of vendorId -> { isOpen: boolean, loading: boolean, data: { documents: [], checklist: [], summary: {} } }
  const [vendorDossiers, setVendorDossiers] = useState({});

  // Document Viewer Modal State
  const [viewerModal, setViewerModal] = useState({
    isOpen: false,
    doc: null,
    blobUrl: null,
    loading: false,
    error: null
  });

  // Document Review Modal State (Single Document review)
  const [docReviewModal, setDocReviewModal] = useState({
    isOpen: false,
    doc: null,
    vendorId: null,
    status: 'VERIFIED', // 'PENDING_REVIEW' | 'VERIFIED' | 'NEEDS_CLARIFICATION' | 'REJECTED'
    notes: '',
    loading: false,
    error: null
  });

  // Overall Vendor / Officer Action Modal State (Final Decision)
  const [actionModal, setActionModal] = useState({
    isOpen: false,
    user: null,
    action: 'APPROVE', // 'APPROVE' | 'REJECT' | 'SUSPEND'
    notes: '',
    dossierData: null,
    loadingDossier: false,
    loading: false,
    error: null
  });

  // Provision Officer Modal State
  const [provisionModal, setProvisionModal] = useState({
    isOpen: false,
    email: '',
    password: '',
    fullName: '',
    organization: 'National Public Procurement Authority',
    department: 'Department of Public Works',
    designation: 'Procurement Evaluation Officer',
    govIdRef: `GOV-PO-2026-${Math.floor(1000 + Math.random() * 9000)}`,
    authorizedScope: 'ALL',
    initialStatus: 'APPROVED',
    loading: false,
    error: null
  });

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('bidcheck_token');
      const res = await fetch('/api/admin/users', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUsersList(data.users || []);
      }
    } catch (err) {
      console.error('Failed to fetch admin users:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Fetch documents and checklist for a specific vendor
  const fetchVendorDossier = async (vendorId) => {
    setVendorDossiers(prev => ({
      ...prev,
      [vendorId]: { ...(prev[vendorId] || {}), loading: true }
    }));

    try {
      const token = localStorage.getItem('bidcheck_token');
      const res = await fetch(`/api/admin/vendors/${vendorId}/documents`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setVendorDossiers(prev => ({
          ...prev,
          [vendorId]: {
            isOpen: true,
            loading: false,
            data
          }
        }));
        return data;
      }
    } catch (err) {
      console.error('Failed to fetch vendor documents:', err);
    } finally {
      setVendorDossiers(prev => ({
        ...prev,
        [vendorId]: { ...(prev[vendorId] || {}), loading: false }
      }));
    }
    return null;
  };

  const toggleVendorDossier = (vendorId) => {
    const current = vendorDossiers[vendorId];
    if (current && current.isOpen) {
      setVendorDossiers(prev => ({
        ...prev,
        [vendorId]: { ...prev[vendorId], isOpen: false }
      }));
    } else {
      fetchVendorDossier(vendorId);
    }
  };

  const vendors = usersList.filter(u => u.role === 'bidder');
  const officers = usersList.filter(u => u.role === 'officer');

  const currentList = activeSubTab === 'vendors' ? vendors : officers;

  const filteredUsers = currentList.filter(u => {
    const matchesStatus = statusFilter === 'ALL' || u.verification_status === statusFilter;
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      u.email.toLowerCase().includes(q) ||
      (u.full_name && u.full_name.toLowerCase().includes(q)) ||
      (u.organization && u.organization.toLowerCase().includes(q)) ||
      (u.cin_llpin && u.cin_llpin.toLowerCase().includes(q)) ||
      (u.gstin && u.gstin.toLowerCase().includes(q)) ||
      (u.pan && u.pan.toLowerCase().includes(q));
    return matchesStatus && matchesSearch;
  });

  // Open Document Viewer
  const handleOpenDocViewer = async (doc) => {
    if (viewerModal.blobUrl) {
      URL.revokeObjectURL(viewerModal.blobUrl);
    }

    setViewerModal({
      isOpen: true,
      doc,
      blobUrl: null,
      loading: true,
      error: null
    });

    try {
      const token = localStorage.getItem('bidcheck_token');
      const res = await fetch(`/api/vendor-documents/${doc.id}/view`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Server responded with status ${res.status}`);
      }

      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      setViewerModal(prev => ({
        ...prev,
        loading: false,
        blobUrl: objectUrl
      }));
    } catch (err) {
      setViewerModal(prev => ({
        ...prev,
        loading: false,
        error: err.message
      }));
    }
  };

  const handleCloseDocViewer = () => {
    if (viewerModal.blobUrl) {
      URL.revokeObjectURL(viewerModal.blobUrl);
    }
    setViewerModal({
      isOpen: false,
      doc: null,
      blobUrl: null,
      loading: false,
      error: null
    });
  };

  // Download Document
  const handleDownloadDoc = async (doc) => {
    try {
      const token = localStorage.getItem('bidcheck_token');
      const res = await fetch(`/api/vendor-documents/${doc.id}/download`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) {
        throw new Error('Download request failed');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.original_filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('Unable to download file: ' + err.message);
    }
  };

  // Open Single Document Review Modal
  const handleOpenDocReview = (doc, vendorId) => {
    setDocReviewModal({
      isOpen: true,
      doc,
      vendorId,
      status: doc.verification_status || 'VERIFIED',
      notes: doc.verification_notes || '',
      loading: false,
      error: null
    });
  };

  // Submit Single Document Review
  const handleSubmitDocReview = async (e) => {
    e.preventDefault();
    const { doc, vendorId, status, notes } = docReviewModal;
    if (!doc) return;

    if ((status === 'REJECTED' || status === 'NEEDS_CLARIFICATION') && (!notes || notes.trim().length < 5)) {
      setDocReviewModal(prev => ({
        ...prev,
        error: `A detailed reason (at least 5 characters) is required when setting status to ${status.replace(/_/g, ' ')}.`
      }));
      return;
    }

    setDocReviewModal(prev => ({ ...prev, loading: true, error: null }));

    try {
      const token = localStorage.getItem('bidcheck_token');
      const res = await fetch(`/api/admin/vendor-documents/${doc.id}/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status, notes })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update document verification status.');
      }

      setDocReviewModal({
        isOpen: false,
        doc: null,
        vendorId: null,
        status: 'VERIFIED',
        notes: '',
        loading: false,
        error: null
      });

      // Refresh vendor dossier
      if (vendorId) {
        await fetchVendorDossier(vendorId);
      }
      await fetchUsers();
      if (onActionSuccess) onActionSuccess();
    } catch (err) {
      setDocReviewModal(prev => ({ ...prev, loading: false, error: err.message }));
    }
  };

  // Open Overall Action Modal (Approve / Reject / Suspend)
  const handleOpenAction = async (targetUser, action) => {
    setActionModal({
      isOpen: true,
      user: targetUser,
      action,
      notes: targetUser.verification_notes || '',
      dossierData: null,
      loadingDossier: targetUser.role === 'bidder',
      loading: false,
      error: null
    });

    if (targetUser.role === 'bidder') {
      try {
        const token = localStorage.getItem('bidcheck_token');
        const res = await fetch(`/api/admin/vendors/${targetUser.id}/documents`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const dossier = await res.json();
          setActionModal(prev => ({
            ...prev,
            dossierData: dossier,
            loadingDossier: false
          }));
        } else {
          setActionModal(prev => ({ ...prev, loadingDossier: false }));
        }
      } catch (e) {
        setActionModal(prev => ({ ...prev, loadingDossier: false }));
      }
    }
  };

  // Execute Overall Action
  const handleExecuteAction = async (e) => {
    e.preventDefault();
    const { user: targetUser, action, notes, dossierData } = actionModal;
    if (!targetUser) return;

    if ((action === 'REJECT' || action === 'SUSPEND') && (!notes || notes.trim().length < 5)) {
      setActionModal(prev => ({
        ...prev,
        error: `A specific reason (minimum 5 characters) is required when rejecting or suspending an account.`
      }));
      return;
    }

    if (action === 'APPROVE' && targetUser.role === 'bidder' && dossierData) {
      if (!dossierData.summary?.all_mandatory_verified) {
        setActionModal(prev => ({
          ...prev,
          error: 'Cannot approve vendor enterprise: Mandatory documents have not all been uploaded and verified.'
        }));
        return;
      }
    }

    setActionModal(prev => ({ ...prev, loading: true, error: null }));
    try {
      const token = localStorage.getItem('bidcheck_token');
      const endpoint = targetUser.role === 'bidder'
        ? `/api/admin/vendors/${targetUser.id}/verify`
        : `/api/admin/officers/${targetUser.id}/approve`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ action, notes })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Action failed.');
      }

      setActionModal({
        isOpen: false,
        user: null,
        action: 'APPROVE',
        notes: '',
        dossierData: null,
        loadingDossier: false,
        loading: false,
        error: null
      });

      if (targetUser.role === 'bidder') {
        await fetchVendorDossier(targetUser.id);
      }
      await fetchUsers();
      if (onActionSuccess) onActionSuccess();
    } catch (err) {
      setActionModal(prev => ({ ...prev, loading: false, error: err.message }));
    }
  };

  const handleProvisionOfficer = async (e) => {
    e.preventDefault();
    setProvisionModal(prev => ({ ...prev, loading: true, error: null }));
    try {
      const token = localStorage.getItem('bidcheck_token');
      const res = await fetch('/api/admin/officers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          email: provisionModal.email,
          password: provisionModal.password,
          full_name: provisionModal.fullName,
          organization: provisionModal.organization,
          department: provisionModal.department,
          official_designation: provisionModal.designation,
          government_id_ref: provisionModal.govIdRef,
          authorized_tenders_scope: provisionModal.authorizedScope,
          initial_status: provisionModal.initialStatus
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Provisioning failed.');
      }

      setProvisionModal({
        isOpen: false,
        email: '',
        password: '',
        fullName: '',
        organization: 'National Public Procurement Authority',
        department: 'Department of Public Works',
        designation: 'Procurement Evaluation Officer',
        govIdRef: `GOV-PO-2026-${Math.floor(1000 + Math.random() * 9000)}`,
        authorizedScope: 'ALL',
        initialStatus: 'APPROVED',
        loading: false,
        error: null
      });

      await fetchUsers();
      if (onActionSuccess) onActionSuccess();
    } catch (err) {
      setProvisionModal(prev => ({ ...prev, loading: false, error: err.message }));
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'VERIFIED':
      case 'APPROVED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
            <CheckCircle2 className="w-3.5 h-3.5" />
            {status}
          </span>
        );
      case 'VERIFICATION_PENDING':
      case 'PENDING_VERIFICATION':
      case 'PENDING_REVIEW':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
            <Clock className="w-3.5 h-3.5" />
            Pending Review
          </span>
        );
      case 'NEEDS_CLARIFICATION':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300">
            <HelpCircle className="w-3.5 h-3.5" />
            Needs Clarification
          </span>
        );
      case 'EMAIL_PENDING':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
            <Mail className="w-3.5 h-3.5" />
            Email Unconfirmed
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
            <XCircle className="w-3.5 h-3.5" />
            Rejected
          </span>
        );
      case 'SUSPENDED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-300">
            <Ban className="w-3.5 h-3.5" />
            Suspended
          </span>
        );
      case 'MISSING':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-900">
            <FileWarning className="w-3.5 h-3.5" />
            Missing
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
            {status || 'UNKNOWN'}
          </span>
        );
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '0 B';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  const getDocTypeLabel = (docType) => {
    switch (docType) {
      case 'BUSINESS_REGISTRATION':
        return 'Certificate of Incorporation / Registration';
      case 'TAX_REGISTRATION':
        return 'GSTIN / Tax Clearance Certificate';
      case 'PAN_CARD':
        return 'Corporate PAN Card';
      case 'POWER_OF_ATTORNEY':
        return 'Power of Attorney / Board Resolution';
      case 'FINANCIAL_STATEMENT':
        return 'Audited Financial Statement';
      default:
        return docType ? docType.replace(/_/g, ' ') : 'Supporting Document';
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2.5">
            <UserCheck className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
            Identity Verification & Approvals
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Review uploaded enterprise compliance documents, inspect identification credentials, and record authoritative verification decisions.
          </p>
        </div>

        {activeSubTab === 'officers' && (
          <button
            onClick={() => setProvisionModal(prev => ({ ...prev, isOpen: true }))}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-md transition-all active:scale-95 shrink-0"
          >
            <Plus className="w-4 h-4" />
            Provision Authorized Officer
          </button>
        )}
      </div>

      {/* Due Diligence Notice */}
      <div className="p-3.5 bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-900/40 rounded-xl text-xs text-emerald-900 dark:text-emerald-300 flex items-start gap-3">
        <Info className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <strong>Mandatory Document Inspection Protocol:</strong> Tender Officers must examine submitted certificates and identification files before approving an enterprise.
          <span className="block text-[11px] text-emerald-800/80 dark:text-emerald-400/80">
            Mandatory documents (Incorporation, GSTIN, and PAN) must each be reviewed and marked "Verified". Merely uploading documents does not grant approval.
          </span>
        </div>
      </div>

      {/* Tabs & Filter Bar */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-4 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Subtabs */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl w-fit">
            <button
              onClick={() => { setActiveSubTab('vendors'); setStatusFilter('ALL'); }}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeSubTab === 'vendors'
                  ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              Vendor Enterprises ({vendors.length})
            </button>
            <button
              onClick={() => { setActiveSubTab('officers'); setStatusFilter('ALL'); }}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeSubTab === 'officers'
                  ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              Tender Officers ({officers.length})
            </button>
          </div>

          {/* Search & Filter */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 sm:w-64 min-w-[200px]">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder={activeSubTab === 'vendors' ? "Search company, CIN, PAN..." : "Search officer name, dept..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-hidden focus:border-emerald-500"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-hidden focus:border-emerald-500"
            >
              <option value="ALL">All Statuses</option>
              <option value="VERIFICATION_PENDING">Pending Review</option>
              <option value="EMAIL_PENDING">Email Pending</option>
              <option value="VERIFIED">Verified</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
              <option value="SUSPENDED">Suspended</option>
            </select>
          </div>
        </div>

        {/* Content Table / Cards */}
        {loading ? (
          <div className="py-12 text-center text-xs text-slate-400">Loading user verification records...</div>
        ) : filteredUsers.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-400">No accounts match the current filter.</div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {filteredUsers.map((u) => {
              const isVendor = u.role === 'bidder';
              const dossier = vendorDossiers[u.id];
              const isDossierOpen = dossier?.isOpen;

              return (
                <div key={u.id} className="py-4 space-y-3 hover:bg-slate-50/50 dark:hover:bg-slate-800/40 px-2 rounded-xl transition-colors">
                  {/* Card Main Row */}
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    {/* Left Column: Entity & Contact Details */}
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-sm text-slate-900 dark:text-white truncate">
                          {isVendor ? u.organization || 'Enterprise' : u.full_name}
                        </span>
                        {getStatusBadge(u.verification_status)}
                        {isVendor && u.entity_type && (
                          <span className="text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-sm">
                            {u.entity_type.replace(/_/g, ' ')}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                        <span className="flex items-center gap-1">
                          <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          {u.email}
                        </span>
                        {u.phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            {u.phone}
                          </span>
                        )}
                        {isVendor && u.rep_name && (
                          <span>
                            Rep: <strong className="text-slate-700 dark:text-slate-300">{u.rep_name}</strong> ({u.rep_designation || 'Signatory'})
                          </span>
                        )}
                        {!isVendor && (
                          <span>
                            Dept: <strong className="text-slate-700 dark:text-slate-300">{u.department || 'Procurement'}</strong> ({u.official_designation || 'Officer'})
                          </span>
                        )}
                      </div>

                      {/* Business Identifiers or Officer Credentials */}
                      {isVendor ? (
                        <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] font-mono text-slate-600 dark:text-slate-300">
                          {u.cin_llpin && (
                            <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded-sm">
                              CIN/LLPIN: <strong>{u.cin_llpin}</strong>
                            </span>
                          )}
                          {u.gstin && (
                            <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded-sm">
                              GSTIN: <strong>{u.gstin}</strong>
                            </span>
                          )}
                          {u.pan && (
                            <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded-sm">
                              PAN: <strong>{u.pan}</strong>
                            </span>
                          )}
                          {u.business_address && (
                            <span className="text-[11px] font-sans text-slate-400 truncate max-w-xs">
                              Addr: {u.business_address}
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] font-mono text-slate-600 dark:text-slate-300">
                          {u.government_id_ref && (
                            <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded-sm">
                              Gov ID: <strong>{u.government_id_ref}</strong>
                            </span>
                          )}
                          <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded-sm">
                            Scope: <strong>{u.authorized_tenders_scope || 'ALL'}</strong>
                          </span>
                        </div>
                      )}

                      {u.verification_notes && (
                        <div className="text-[11px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 p-1.5 rounded-lg border border-amber-200/50">
                          <strong>Audit Decision Notes:</strong> {u.verification_notes}
                        </div>
                      )}
                    </div>

                    {/* Right Column: Actions */}
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {isVendor && (
                        <button
                          onClick={() => toggleVendorDossier(u.id)}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5"
                        >
                          <FileText className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Inspect Documents</span>
                          {isDossierOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>
                      )}

                      {/* Approve Action */}
                      {u.verification_status !== 'VERIFIED' && u.verification_status !== 'APPROVED' && (
                        <button
                          onClick={() => handleOpenAction(u, 'APPROVE')}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-xs transition-colors flex items-center gap-1.5 active:scale-95"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Approve
                        </button>
                      )}

                      {/* Reject Action */}
                      {u.verification_status !== 'REJECTED' && (
                        <button
                          onClick={() => handleOpenAction(u, 'REJECT')}
                          className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-950/70 text-rose-700 dark:text-rose-300 text-xs font-semibold rounded-lg border border-rose-200 dark:border-rose-800 transition-colors flex items-center gap-1.5"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          Reject
                        </button>
                      )}

                      {/* Suspend Action */}
                      {u.verification_status !== 'SUSPENDED' && (
                        <button
                          onClick={() => handleOpenAction(u, 'SUSPEND')}
                          className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-medium rounded-lg transition-colors"
                          title="Suspend account access"
                        >
                          <Ban className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Expanded Vendor Documents Dossier (Requirement 1, 2, 3) */}
                  {isVendor && isDossierOpen && (
                    <div className="mt-3 p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700/80 space-y-4 animate-in fade-in">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-700 pb-3">
                        <div className="flex items-center gap-2">
                          <FileCheck2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                          <div>
                            <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                              Vendor Verification Dossier & Documents
                            </h4>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400">
                              Official compliance records for {u.organization || u.full_name}
                            </p>
                          </div>
                        </div>

                        {/* Mandatory summary pill */}
                        {dossier?.data?.summary && (
                          <div className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 ${
                            dossier.data.summary.all_mandatory_verified
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                              : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                          }`}>
                            {dossier.data.summary.all_mandatory_verified ? (
                              <>
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                                <span>All Mandatory Requirements Verified ({dossier.data.summary.verified_mandatory}/3)</span>
                              </>
                            ) : (
                              <>
                                <Lock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                                <span>Mandatory Progress: {dossier.data.summary.verified_mandatory}/3 Verified</span>
                              </>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Mandatory Document Checklist Section */}
                      <div className="space-y-2">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                          <BadgeCheck className="w-4 h-4 text-emerald-600" />
                          Mandatory Verification Checklist
                        </span>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                          {dossier?.data?.checklist?.map((item) => {
                            const isVerified = item.verification_status === 'VERIFIED';
                            const isMissing = item.verification_status === 'MISSING';

                            return (
                              <div
                                key={item.type}
                                className={`p-2.5 rounded-lg border text-xs space-y-1.5 ${
                                  isVerified
                                    ? 'bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/60'
                                    : isMissing
                                    ? 'bg-rose-50/60 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/60'
                                    : 'bg-amber-50/60 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/60'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-1">
                                  <span className="font-bold text-slate-800 dark:text-slate-200 truncate">
                                    {item.label}
                                  </span>
                                  {getStatusBadge(item.verification_status)}
                                </div>

                                {item.document ? (
                                  <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                    File: {item.document.original_filename}
                                  </div>
                                ) : (
                                  <div className="text-[11px] text-rose-600 dark:text-rose-400 font-semibold">
                                    Required document not submitted
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Uploaded Documents List */}
                      <div className="space-y-2 pt-2">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                          Submitted Verification Documents ({dossier?.data?.documents?.length || 0})
                        </span>

                        {dossier?.loading ? (
                          <div className="py-4 text-center text-xs text-slate-400">Loading documents...</div>
                        ) : !dossier?.data?.documents || dossier.data.documents.length === 0 ? (
                          <div className="p-4 bg-white dark:bg-slate-900 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 text-center text-xs text-slate-500">
                            No verification documents have been uploaded by this vendor yet.
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {dossier.data.documents.map((doc) => {
                              const isPdf = doc.mime_type === 'application/pdf' || doc.original_filename.toLowerCase().endsWith('.pdf');
                              return (
                                <div
                                  key={doc.id}
                                  className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-2xs"
                                >
                                  {/* Doc Info */}
                                  <div className="space-y-1 flex-1 min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                      {isPdf ? (
                                        <FileText className="w-4 h-4 text-rose-600 shrink-0" />
                                      ) : (
                                        <FileImage className="w-4 h-4 text-teal-600 shrink-0" />
                                      )}
                                      <span className="font-bold text-xs text-slate-900 dark:text-white truncate">
                                        {doc.original_filename}
                                      </span>
                                      <span className="text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-sm">
                                        {getDocTypeLabel(doc.doc_type)}
                                      </span>
                                      {getStatusBadge(doc.verification_status)}
                                    </div>

                                    <div className="flex flex-wrap items-center gap-x-3 text-[11px] text-slate-400">
                                      <span>Size: {formatFileSize(doc.file_size)}</span>
                                      <span>Format: {doc.mime_type}</span>
                                      <span>Uploaded: {new Date(doc.uploaded_at).toLocaleString()}</span>
                                      {doc.verified_by_name && (
                                        <span>Reviewed by: <strong className="text-slate-600 dark:text-slate-300">{doc.verified_by_name}</strong></span>
                                      )}
                                    </div>

                                    {doc.verification_notes && (
                                      <div className="text-[11px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2 py-1 rounded-md border border-amber-200/50">
                                        <strong>Officer Review Note:</strong> {doc.verification_notes}
                                      </div>
                                    )}
                                  </div>

                                  {/* Doc Actions */}
                                  <div className="flex items-center gap-1.5 shrink-0 self-end md:self-center">
                                    {/* View Document */}
                                    <button
                                      onClick={() => handleOpenDocViewer(doc)}
                                      className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 text-xs font-semibold rounded-lg border border-emerald-200 dark:border-emerald-800 transition-colors flex items-center gap-1"
                                      title="Open embedded viewer"
                                    >
                                      <Eye className="w-3.5 h-3.5" />
                                      <span>View</span>
                                    </button>

                                    {/* Download */}
                                    <button
                                      onClick={() => handleDownloadDoc(doc)}
                                      className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1"
                                      title="Download original file"
                                    >
                                      <Download className="w-3.5 h-3.5" />
                                      <span>Download</span>
                                    </button>

                                    {/* Review Action */}
                                    <button
                                      onClick={() => handleOpenDocReview(doc, u.id)}
                                      className="px-2.5 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-lg shadow-xs transition-colors flex items-center gap-1"
                                    >
                                      <CheckCircle2 className="w-3.5 h-3.5" />
                                      <span>Review Document</span>
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* EMBEDDED DOCUMENT VIEWER MODAL (Requirement 1 & 5) */}
      {viewerModal.isOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 animate-in fade-in">
          <div className="w-full max-w-4xl max-h-[92vh] flex flex-col bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
            {/* Viewer Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <FileText className="w-5 h-5 text-emerald-600 shrink-0" />
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                    {viewerModal.doc?.original_filename}
                  </h3>
                  <div className="text-[11px] text-slate-400 flex items-center gap-2">
                    <span>{getDocTypeLabel(viewerModal.doc?.doc_type)}</span>
                    <span>•</span>
                    <span>{formatFileSize(viewerModal.doc?.file_size)}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {viewerModal.blobUrl && (
                  <button
                    onClick={() => window.open(viewerModal.blobUrl, '_blank')}
                    className="p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-xs font-semibold flex items-center gap-1"
                    title="Open in new browser tab"
                  >
                    <ExternalLink className="w-4 h-4" />
                    <span className="hidden sm:inline">New Tab</span>
                  </button>
                )}

                <button
                  onClick={() => viewerModal.doc && handleDownloadDoc(viewerModal.doc)}
                  className="p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-xs font-semibold flex items-center gap-1"
                  title="Download File"
                >
                  <Download className="w-4 h-4" />
                  <span className="hidden sm:inline">Download</span>
                </button>

                <button
                  onClick={handleCloseDocViewer}
                  className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
                  title="Close viewer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Viewer Body */}
            <div className="flex-1 min-h-[50vh] max-h-[72vh] overflow-auto bg-slate-100 dark:bg-slate-950 p-2 sm:p-4 flex items-center justify-center">
              {viewerModal.loading ? (
                <div className="flex flex-col items-center gap-2 text-slate-400 text-xs">
                  <RefreshCw className="w-6 h-6 animate-spin text-emerald-600" />
                  <span>Loading document content securely...</span>
                </div>
              ) : viewerModal.error ? (
                <div className="p-4 max-w-md text-center space-y-3 bg-white dark:bg-slate-900 rounded-xl border border-rose-200 dark:border-rose-900">
                  <AlertTriangle className="w-8 h-8 text-rose-500 mx-auto" />
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">Unable to display document</h4>
                  <p className="text-xs text-rose-600 dark:text-rose-400">{viewerModal.error}</p>
                  <button
                    onClick={() => viewerModal.doc && handleDownloadDoc(viewerModal.doc)}
                    className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold"
                  >
                    Download File to View Locally
                  </button>
                </div>
              ) : viewerModal.blobUrl ? (
                viewerModal.doc?.mime_type === 'application/pdf' || viewerModal.doc?.original_filename?.toLowerCase().endsWith('.pdf') ? (
                  <iframe
                    src={viewerModal.blobUrl}
                    className="w-full h-full min-h-[60vh] rounded-lg border border-slate-200 dark:border-slate-800 bg-white"
                    title={viewerModal.doc?.original_filename}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center p-2">
                    <img
                      src={viewerModal.blobUrl}
                      alt={viewerModal.doc?.original_filename}
                      className="max-w-full max-h-[65vh] object-contain rounded-lg shadow-md"
                    />
                  </div>
                )
              ) : null}
            </div>

            {/* Viewer Footer */}
            <div className="p-3 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 shrink-0">
              <span className="truncate">
                Verification Status: <strong>{viewerModal.doc?.verification_status || 'PENDING_REVIEW'}</strong>
              </span>
              <button
                onClick={handleCloseDocViewer}
                className="px-4 py-1.5 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold rounded-lg text-xs"
              >
                Close Viewer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MANUAL DOCUMENT REVIEW MODAL (Requirement 2) */}
      {docReviewModal.isOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <FileCheck2 className="w-5 h-5 text-emerald-600" />
                Review Verification Document
              </h3>
              <button
                onClick={() => setDocReviewModal({ isOpen: false, doc: null, vendorId: null, status: 'VERIFIED', notes: '', loading: false, error: null })}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {docReviewModal.error && (
              <div className="p-2.5 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 rounded-lg text-xs text-rose-700 dark:text-rose-300">
                {docReviewModal.error}
              </div>
            )}

            <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl text-xs space-y-1">
              <div>File Name: <strong>{docReviewModal.doc?.original_filename}</strong></div>
              <div>Document Type: <strong>{getDocTypeLabel(docReviewModal.doc?.doc_type)}</strong></div>
              <div>Current Status: {getStatusBadge(docReviewModal.doc?.verification_status)}</div>
            </div>

            <form onSubmit={handleSubmitDocReview} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Verification Decision Status *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'VERIFIED', label: 'Verified', color: 'emerald', desc: 'Legible, authentic & matched' },
                    { id: 'PENDING_REVIEW', label: 'Pending Review', color: 'amber', desc: 'Queued for further review' },
                    { id: 'NEEDS_CLARIFICATION', label: 'Needs Clarification', color: 'sky', desc: 'Unclear or requires update' },
                    { id: 'REJECTED', label: 'Rejected', color: 'rose', desc: 'Invalid, forged or incorrect' }
                  ].map((s) => (
                    <button
                      type="button"
                      key={s.id}
                      onClick={() => setDocReviewModal(prev => ({ ...prev, status: s.id }))}
                      className={`p-2.5 rounded-xl border text-left transition-all ${
                        docReviewModal.status === s.id
                          ? 'border-emerald-600 bg-emerald-50/70 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 ring-2 ring-emerald-500/30'
                          : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      <div className="font-bold text-xs">{s.label}</div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400">{s.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                  <span>Officer Verification Note {docReviewModal.status === 'REJECTED' || docReviewModal.status === 'NEEDS_CLARIFICATION' ? '*' : '(Optional)'}</span>
                  {(docReviewModal.status === 'REJECTED' || docReviewModal.status === 'NEEDS_CLARIFICATION') && (
                    <span className="text-rose-500 text-[10px]">Reason required</span>
                  )}
                </label>
                <textarea
                  rows={3}
                  required={docReviewModal.status === 'REJECTED' || docReviewModal.status === 'NEEDS_CLARIFICATION'}
                  value={docReviewModal.notes}
                  onChange={(e) => setDocReviewModal(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder={
                    docReviewModal.status === 'REJECTED'
                      ? 'Specify why this document is rejected (e.g. illegible scan, mismatched entity name, expired certificate)...'
                      : docReviewModal.status === 'NEEDS_CLARIFICATION'
                      ? 'Specify what clarification or updated document is required from the vendor...'
                      : 'Record verification findings (e.g. verified against official registry, valid signature)...'
                  }
                  className="w-full p-2.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-hidden focus:border-emerald-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setDocReviewModal({ isOpen: false, doc: null, vendorId: null, status: 'VERIFIED', notes: '', loading: false, error: null })}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={docReviewModal.loading}
                  className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs disabled:opacity-50"
                >
                  {docReviewModal.loading ? 'Saving Review...' : 'Save Document Review'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* OVERALL VENDOR APPROVAL / DECISION MODAL (Requirement 3) */}
      {actionModal.isOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              {actionModal.action === 'APPROVE' && 'Approve Enterprise Verification'}
              {actionModal.action === 'REJECT' && 'Reject Enterprise Verification'}
              {actionModal.action === 'SUSPEND' && 'Suspend Enterprise Access'}
            </h3>

            {/* Enterprise Details Summary */}
            <div className="p-3 bg-slate-50 dark:bg-slate-800/80 rounded-xl space-y-2 text-xs">
              <div className="flex justify-between items-start">
                <div>
                  <span className="font-bold text-slate-900 dark:text-white">
                    {actionModal.user?.organization || actionModal.user?.full_name}
                  </span>
                  <div className="text-slate-500">{actionModal.user?.email}</div>
                </div>
                {getStatusBadge(actionModal.user?.verification_status)}
              </div>

              {actionModal.user?.role === 'bidder' && (
                <div className="grid grid-cols-2 gap-2 text-[11px] font-mono text-slate-600 dark:text-slate-300 pt-1 border-t border-slate-200 dark:border-slate-700">
                  <div>CIN/LLPIN: <strong>{actionModal.user?.cin_llpin || 'N/A'}</strong></div>
                  <div>GSTIN: <strong>{actionModal.user?.gstin || 'N/A'}</strong></div>
                  <div>PAN: <strong>{actionModal.user?.pan || 'N/A'}</strong></div>
                  <div>Entity: <strong>{actionModal.user?.entity_type || 'N/A'}</strong></div>
                </div>
              )}
            </div>

            {/* Pre-requisite Summary for Vendor Approval (Requirement 3) */}
            {actionModal.action === 'APPROVE' && actionModal.user?.role === 'bidder' && (
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                  Mandatory Verification Pre-requisites
                </span>

                {actionModal.loadingDossier ? (
                  <div className="p-3 text-center text-xs text-slate-400">Verifying mandatory documents...</div>
                ) : actionModal.dossierData ? (
                  actionModal.dossierData.summary?.all_mandatory_verified ? (
                    <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs text-emerald-900 dark:text-emerald-200 flex items-start gap-2.5">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                      <div>
                        <strong>All Mandatory Requirements Satisfied:</strong>
                        <div className="text-[11px] mt-0.5">
                          Certificate of Incorporation, GSTIN Certificate, and Corporate PAN Card are uploaded and verified. Enterprise is eligible for approval.
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl text-xs text-amber-900 dark:text-amber-200 space-y-1.5">
                      <div className="flex items-center gap-2 font-bold text-amber-800 dark:text-amber-300">
                        <Lock className="w-4 h-4 text-amber-600" />
                        <span>Approval Locked: Incomplete Requirements</span>
                      </div>
                      <p className="text-[11px]">
                        The vendor enterprise cannot be approved until all mandatory documents are submitted and verified:
                      </p>
                      <ul className="list-disc list-inside text-[11px] space-y-0.5 text-amber-800 dark:text-amber-300">
                        {actionModal.dossierData.checklist?.map(item => (
                          <li key={item.type}>
                            <strong>{item.label}:</strong> {item.verification_status}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )
                ) : null}
              </div>
            )}

            {actionModal.error && (
              <div className="p-2.5 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 rounded-lg text-xs text-rose-700 dark:text-rose-300">
                {actionModal.error}
              </div>
            )}

            <form onSubmit={handleExecuteAction} className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                  <span>Audit Rationale Notes {actionModal.action === 'REJECT' || actionModal.action === 'SUSPEND' ? '*' : '(Optional)'}</span>
                  {(actionModal.action === 'REJECT' || actionModal.action === 'SUSPEND') && (
                    <span className="text-rose-500 text-[10px]">Reason required</span>
                  )}
                </label>
                <textarea
                  required={actionModal.action === 'REJECT' || actionModal.action === 'SUSPEND'}
                  rows={3}
                  value={actionModal.notes}
                  onChange={(e) => setActionModal(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder={
                    actionModal.action === 'APPROVE'
                      ? 'Record officer due diligence rationale and registry validation notes...'
                      : 'Record detailed administrative reason for rejection or suspension (minimum 5 characters)...'
                  }
                  className="w-full p-2.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-hidden focus:border-emerald-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setActionModal({ isOpen: false, user: null, action: 'APPROVE', notes: '', dossierData: null, loadingDossier: false, loading: false, error: null })}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    actionModal.loading ||
                    (actionModal.action === 'APPROVE' && actionModal.user?.role === 'bidder' && actionModal.dossierData && !actionModal.dossierData.summary?.all_mandatory_verified)
                  }
                  className={`px-4 py-2 text-xs font-bold text-white rounded-lg shadow-xs disabled:opacity-50 flex items-center gap-1.5 ${
                    actionModal.action === 'APPROVE'
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : 'bg-rose-600 hover:bg-rose-700'
                  }`}
                >
                  {actionModal.action === 'APPROVE' && <CheckCircle2 className="w-3.5 h-3.5" />}
                  {actionModal.action === 'REJECT' && <XCircle className="w-3.5 h-3.5" />}
                  {actionModal.action === 'SUSPEND' && <Ban className="w-3.5 h-3.5" />}
                  <span>
                    {actionModal.loading ? 'Recording Decision...' : `Confirm ${actionModal.action}`}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Provision Officer Modal */}
      {provisionModal.isOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-600" />
              Provision Tender Procurement Officer
            </h3>

            <p className="text-xs text-slate-500 dark:text-slate-400">
              Only authorized procurement officials can onboard institutional officers with tender publication credentials.
            </p>

            {provisionModal.error && (
              <div className="p-2.5 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 rounded-lg text-xs text-rose-700 dark:text-rose-300">
                {provisionModal.error}
              </div>
            )}

            <form onSubmit={handleProvisionOfficer} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Official Full Name *</label>
                  <input
                    type="text"
                    required
                    value={provisionModal.fullName}
                    onChange={(e) => setProvisionModal(prev => ({ ...prev, fullName: e.target.value }))}
                    placeholder="e.g. Director James Morrison"
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-hidden focus:border-emerald-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Government Email *</label>
                  <input
                    type="email"
                    required
                    value={provisionModal.email}
                    onChange={(e) => setProvisionModal(prev => ({ ...prev, email: e.target.value }))}
                    placeholder="officer@procure.gov"
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-hidden focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Password *</label>
                  <input
                    type="password"
                    required
                    value={provisionModal.password}
                    onChange={(e) => setProvisionModal(prev => ({ ...prev, password: e.target.value }))}
                    placeholder="Enter secure initial password"
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-hidden focus:border-emerald-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Government ID / Badge Ref *</label>
                  <input
                    type="text"
                    required
                    value={provisionModal.govIdRef}
                    onChange={(e) => setProvisionModal(prev => ({ ...prev, govIdRef: e.target.value }))}
                    placeholder="GOV-PO-2026-9041"
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-hidden focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Department / Ministry</label>
                  <input
                    type="text"
                    value={provisionModal.department}
                    onChange={(e) => setProvisionModal(prev => ({ ...prev, department: e.target.value }))}
                    placeholder="Department of Public Works"
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-hidden focus:border-emerald-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Official Designation</label>
                  <input
                    type="text"
                    value={provisionModal.designation}
                    onChange={(e) => setProvisionModal(prev => ({ ...prev, designation: e.target.value }))}
                    placeholder="Senior Tender Commissioner"
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-hidden focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Authorized Tenders Scope</label>
                  <input
                    type="text"
                    value={provisionModal.authorizedScope}
                    onChange={(e) => setProvisionModal(prev => ({ ...prev, authorizedScope: e.target.value }))}
                    placeholder="ALL or INFRASTRUCTURE,ENERGY,TECH"
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-hidden focus:border-emerald-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Initial Authority Status</label>
                  <select
                    value={provisionModal.initialStatus}
                    onChange={(e) => setProvisionModal(prev => ({ ...prev, initialStatus: e.target.value }))}
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-hidden focus:border-emerald-500"
                  >
                    <option value="APPROVED">Approved (Active Immediately)</option>
                    <option value="PENDING_VERIFICATION">Pending Verification</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setProvisionModal(prev => ({ ...prev, isOpen: false }))}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={provisionModal.loading}
                  className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs disabled:opacity-50"
                >
                  {provisionModal.loading ? 'Provisioning...' : 'Provision Officer Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
