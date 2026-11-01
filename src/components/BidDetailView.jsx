import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  AlertTriangle,
  HelpCircle,
  CheckCircle2,
  XCircle,
  FileText,
  Clock,
  Download,
  Send,
  Upload,
  MessageSquare,
  ArrowLeft,
  Scale,
  Building2,
  DollarSign,
  User,
  History,
  Check,
  AlertOctagon
} from 'lucide-react';

export default function BidDetailView({
  bidId,
  user,
  onBack,
  onRefresh
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Clarification form state
  const [clarificationMsg, setClarificationMsg] = useState('');
  const [requestedDocs, setRequestedDocs] = useState([]);
  const [clarificationSubmitting, setClarificationSubmitting] = useState(false);

  // Clarification response form state (bidder)
  const [responseText, setResponseText] = useState('');
  const [activeClarificationId, setActiveClarificationId] = useState(null);
  const [responseSubmitting, setResponseSubmitting] = useState(false);

  // Document resubmission state (bidder)
  const [resubmitDocType, setResubmitDocType] = useState('BID_BOND');
  const [resubmitFile, setResubmitFile] = useState(null);
  const [resubmitNotes, setResubmitNotes] = useState('');
  const [resubmitting, setResubmitting] = useState(false);

  // Official Decision state (officer only)
  const [officialDecision, setOfficialDecision] = useState('APPROVED');
  const [decisionNotes, setDecisionNotes] = useState('');
  const [decisionSubmitting, setDecisionSubmitting] = useState(false);

  const isOfficer = user?.role === 'officer';

  const fetchBidDetails = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('bidcheck_token');
      const res = await fetch(`/api/applications/${bidId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load bid details.');
      setData(json);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (bidId) {
      fetchBidDetails();
    }
  }, [bidId]);

  // Handle Officer Clarification Request
  const handleSendClarification = async (e) => {
    e.preventDefault();
    if (!clarificationMsg.trim()) return;
    try {
      setClarificationSubmitting(true);
      const token = localStorage.getItem('bidcheck_token');
      const res = await fetch(`/api/applications/${bidId}/clarifications`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          message: clarificationMsg,
          requested_doc_types: requestedDocs
        })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to send clarification.');
      setClarificationMsg('');
      setRequestedDocs([]);
      fetchBidDetails();
      if (onRefresh) onRefresh();
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setClarificationSubmitting(false);
    }
  };

  // Handle Bidder Clarification Response
  const handleReplyClarification = async (clarificationId) => {
    if (!responseText.trim()) return;
    try {
      setResponseSubmitting(true);
      const token = localStorage.getItem('bidcheck_token');
      const res = await fetch(`/api/clarifications/${clarificationId}/respond`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ response_text: responseText })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to submit response.');
      setResponseText('');
      setActiveClarificationId(null);
      fetchBidDetails();
      if (onRefresh) onRefresh();
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setResponseSubmitting(false);
    }
  };

  // Handle Bidder Document Resubmission
  const handleResubmitDocument = async (e) => {
    e.preventDefault();
    if (!resubmitFile) {
      alert('Please select a replacement document file.');
      return;
    }

    try {
      setResubmitting(true);
      const token = localStorage.getItem('bidcheck_token');
      const formData = new FormData();
      formData.append('document', resubmitFile);
      formData.append('doc_type', resubmitDocType);
      formData.append('notes', resubmitNotes);

      const res = await fetch(`/api/applications/${bidId}/resubmit-doc`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to resubmit document.');
      setResubmitFile(null);
      setResubmitNotes('');
      fetchBidDetails();
      if (onRefresh) onRefresh();
      alert('Document resubmitted and AI analysis refreshed successfully.');
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setResubmitting(false);
    }
  };

  // Handle Officer Official Final Decision
  const handleRecordOfficialDecision = async (e) => {
    e.preventDefault();
    if (!decisionNotes.trim() || decisionNotes.length < 5) {
      alert('Official administrative notes are mandatory for decision transparency.');
      return;
    }

    try {
      setDecisionSubmitting(true);
      const token = localStorage.getItem('bidcheck_token');
      const res = await fetch(`/api/applications/${bidId}/decision`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          official_decision: officialDecision,
          notes: decisionNotes
        })
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to record official decision.');
      setDecisionNotes('');
      fetchBidDetails();
      if (onRefresh) onRefresh();
      alert(`Official decision "${officialDecision}" successfully recorded in audit log.`);
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setDecisionSubmitting(false);
    }
  };

  const handleDownloadDoc = (docId) => {
    const token = localStorage.getItem('bidcheck_token');
    // Open through authenticated endpoint
    window.open(`/api/documents/${docId}/download?token=${encodeURIComponent(token)}`, '_blank');
  };

  if (loading) {
    return (
      <div className="py-20 text-center">
        <div className="inline-block w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-sm font-semibold text-slate-500">Loading bid analysis and audit logs...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="py-12 max-w-lg mx-auto text-center space-y-4">
        <AlertTriangle className="w-12 h-12 text-rose-500 mx-auto" />
        <h3 className="text-lg font-bold text-slate-900 dark:text-white">Unable to Load Bid</h3>
        <p className="text-sm text-slate-500">{error || 'Record could not be retrieved.'}</p>
        <button
          onClick={onBack}
          className="px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl font-bold text-xs"
        >
          Return to Queue
        </button>
      </div>
    );
  }

  const { application: app, documents = [], clarifications = [], history = [] } = data;

  let findings = {};
  try {
    findings = typeof app.ai_findings_json === 'string' ? JSON.parse(app.ai_findings_json) : (app.ai_findings_json || {});
  } catch (e) {
    findings = {};
  }

  const ruleChecks = findings.rule_checks || [];
  const uncertainties = findings.uncertainties || [];
  const redFlags = findings.red_flags || [];

  return (
    <div className="space-y-6 animate-in fade-in pb-12">
      {/* Top Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 text-xs font-bold text-emerald-700 dark:text-emerald-400 hover:text-emerald-800 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Bids Queue
        </button>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 font-mono">ID: {app.id}</span>
        </div>
      </div>

      {/* Main Banner Header */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-1 rounded-md">
                {app.tender_ref}
              </span>
              <span className={`text-xs font-bold px-3 py-1 rounded-full ${
                app.status === 'QUALIFIED' || app.status === 'AWARDED'
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                  : app.status === 'CLARIFICATION_REQUESTED'
                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                  : app.status === 'DISQUALIFIED' || app.status === 'REJECTED'
                  ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                  : 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
              }`}>
                {app.status.replace(/_/g, ' ')}
              </span>
            </div>

            <h1 className="text-2xl font-black text-slate-900 dark:text-white mt-2">
              {app.company_name}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Submission for: <strong className="text-slate-800 dark:text-slate-200">{app.tender_title}</strong>
            </p>
          </div>

          {/* Quick Metrics Bar */}
          <div className="flex flex-wrap items-center gap-4 pt-3 lg:pt-0 border-t lg:border-t-0 border-slate-100 dark:border-slate-800">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Offer Amount</span>
              <span className="text-xl font-mono font-black text-slate-900 dark:text-white">
                ${parseFloat(app.bid_amount).toLocaleString()} {app.currency}
              </span>
            </div>

            <div className="h-8 w-px bg-slate-200 dark:bg-slate-700 hidden sm:block" />

            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Statutory Tax ID</span>
              <span className="text-sm font-mono font-bold text-slate-700 dark:text-slate-300">
                {app.tax_id}
              </span>
            </div>

            <div className="h-8 w-px bg-slate-200 dark:bg-slate-700 hidden sm:block" />

            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Submitted On</span>
              <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                {new Date(app.submission_date).toLocaleDateString()}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* REQUIREMENT 12: SEPARATION OF AI RECOMMENDATION AND OFFICIAL DECISION */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left: AI Advisory Recommendation */}
        <div className="bg-gradient-to-br from-emerald-500/10 to-teal-500/5 dark:from-emerald-950/40 dark:to-slate-900 rounded-2xl border border-emerald-200 dark:border-emerald-800/60 p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-emerald-600 text-white rounded-xl">
                <Scale className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-800 dark:text-emerald-400">
                  AI Compliance Engine
                </span>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Advisory Recommendation</h3>
              </div>
            </div>

            <span className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider ${
              app.ai_recommendation === 'RECOMMEND_QUALIFY'
                ? 'bg-emerald-600 text-white'
                : app.ai_recommendation === 'REQUEST_CLARIFICATION'
                ? 'bg-amber-500 text-white'
                : 'bg-rose-600 text-white'
            }`}>
              {app.ai_recommendation?.replace(/_/g, ' ')}
            </span>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 bg-white/80 dark:bg-slate-800/80 rounded-xl border border-emerald-100 dark:border-emerald-900/40">
              <span className="text-slate-400 block text-[10px] uppercase">Compliance Score</span>
              <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                {app.ai_compliance_score || 0}%
              </span>
            </div>
            <div className="p-3 bg-white/80 dark:bg-slate-800/80 rounded-xl border border-emerald-100 dark:border-emerald-900/40">
              <span className="text-slate-400 block text-[10px] uppercase">Calculated Risk Level</span>
              <span className={`text-base font-black ${
                app.ai_risk_level === 'HIGH'
                  ? 'text-rose-600 dark:text-rose-400'
                  : app.ai_risk_level === 'UNCERTAIN'
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-emerald-600 dark:text-emerald-400'
              }`}>
                {app.ai_risk_level}
              </span>
            </div>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-3 leading-relaxed">
            {findings.summary || 'Rule-based validation performed against published requirements.'}
          </p>
        </div>

        {/* Right: Human Officer Official Decision */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-slate-800 dark:bg-slate-700 text-white rounded-xl">
                  <ShieldCheck className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 dark:text-slate-400">
                    Human Authority
                  </span>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Official Final Decision</h3>
                </div>
              </div>

              <span className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider ${
                app.official_decision === 'APPROVED' || app.official_decision === 'AWARDED'
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                  : app.official_decision === 'DISQUALIFIED' || app.official_decision === 'REJECTED'
                  ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                  : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
              }`}>
                {app.official_decision}
              </span>
            </div>

            <div className="mt-4 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl text-xs space-y-1">
              <div className="text-slate-400 text-[10px] uppercase font-bold">Officer Determination Notes:</div>
              <p className="text-slate-700 dark:text-slate-300 italic">
                {app.official_decision_notes || 'Pending evaluation. The procurement committee has not yet finalized official determination.'}
              </p>
              {app.decided_by_name && (
                <div className="text-[10px] text-slate-400 pt-1">
                  Decided by: <strong>{app.decided_by_name}</strong> on {new Date(app.decided_at).toLocaleString()}
                </div>
              )}
            </div>
          </div>

          <div className="text-[10px] text-slate-400 mt-2">
            * Strict separation maintained: AI recommendations do not bind administrative determinations.
          </div>
        </div>
      </div>

      {/* REQUIREMENT 11: FAIRNESS & ANTI-FALSE-POSITIVE GUARANTEE */}
      {uncertainties.length > 0 && (
        <div className="p-4 bg-amber-50/70 dark:bg-amber-950/30 rounded-2xl border border-amber-200 dark:border-amber-800/60 space-y-2">
          <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-bold text-sm">
            <HelpCircle className="w-5 h-5 shrink-0" />
            <span>Evidentiary Uncertainty & Non-Prejudicial Fairness Notice</span>
          </div>
          <p className="text-xs text-amber-900/80 dark:text-amber-200/80 leading-relaxed">
            In accordance with BidCheck AI Administrative Fairness Doctrine, the following items are classified as <strong>INFORMATIONAL GAPS</strong> requiring clarification or resubmission. They are <strong>NOT</strong> treated as evidence of fraud:
          </p>
          <div className="space-y-1.5 pt-1">
            {uncertainties.map((unc, idx) => (
              <div key={idx} className="p-2.5 bg-white/80 dark:bg-slate-900/80 rounded-xl text-xs border border-amber-100 dark:border-amber-900/40">
                <strong className="text-amber-800 dark:text-amber-300 font-mono">[{unc.nature || 'UNCERTAIN'}]:</strong>{' '}
                <span className="text-slate-700 dark:text-slate-300">{unc.explanation}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Red Flags (If Confirmed) */}
      {redFlags.length > 0 && (
        <div className="p-4 bg-rose-50/70 dark:bg-rose-950/30 rounded-2xl border border-rose-200 dark:border-rose-800/60 space-y-2">
          <div className="flex items-center gap-2 text-rose-800 dark:text-rose-300 font-bold text-sm">
            <AlertOctagon className="w-5 h-5 shrink-0" />
            <span>Confirmed Procurement Red Flags (Audit Mandatory)</span>
          </div>
          <div className="space-y-1.5 pt-1">
            {redFlags.map((rf, idx) => (
              <div key={idx} className="p-2.5 bg-white/80 dark:bg-slate-900/80 rounded-xl text-xs border border-rose-100 dark:border-rose-900/40">
                <strong className="text-rose-800 dark:text-rose-300 font-mono">[{rf.flag}]:</strong>{' '}
                <span className="text-slate-700 dark:text-slate-300">{rf.details}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Rule Checks Breakdown Grid */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs">
        <h3 className="text-base font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
          <span>Automated Statutory Rule Verification</span>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
            {ruleChecks.filter(r => r.passed).length}/{ruleChecks.length} Passed
          </span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {ruleChecks.map((rc, idx) => (
            <div
              key={idx}
              className={`p-3.5 rounded-xl border text-xs space-y-1 ${
                rc.passed
                  ? 'border-emerald-100 dark:border-emerald-950 bg-emerald-50/30 dark:bg-emerald-950/20'
                  : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{rc.rule}</span>
                {rc.passed ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="w-3.5 h-3.5" /> PASSED
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-600 dark:text-amber-400">
                    <HelpCircle className="w-3.5 h-3.5" /> REVIEW
                  </span>
                )}
              </div>
              <p className="text-slate-600 dark:text-slate-400 leading-relaxed">{rc.details}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Documents List & Server-Authorized Downloads */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Uploaded Procurement Documents</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Files verified through secure server-side authorization check (Requirement 16)
            </p>
          </div>
          <span className="text-xs font-mono font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950 px-2.5 py-1 rounded-md">
            {documents.length} Files
          </span>
        </div>

        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {documents.map((doc) => (
            <div key={doc.id} className="py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 rounded-xl shrink-0">
                  <FileText className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-bold text-slate-900 dark:text-white truncate">
                    {doc.original_filename}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 mt-0.5">
                    <span className="font-semibold text-slate-600 dark:text-slate-300">{doc.doc_type}</span>
                    <span>•</span>
                    <span>{(doc.file_size / 1024).toFixed(1)} KB</span>
                    <span>•</span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-medium">Status: {doc.ocr_status}</span>
                    {doc.is_resubmission === 1 && (
                      <span className="px-1.5 py-0.2 bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300 rounded-sm text-[10px] font-bold">
                        v{doc.version} Resubmitted
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <button
                onClick={() => handleDownloadDoc(doc.id)}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold rounded-xl transition-colors shrink-0"
              >
                <Download className="w-3.5 h-3.5 text-emerald-600" />
                Download Protected File
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* BIDDER RESUBMISSION SECTION (Requirement 7) */}
      {!isOfficer && app.status === 'CLARIFICATION_REQUESTED' && (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/40 dark:to-slate-900 rounded-2xl border border-amber-200 dark:border-amber-800 p-6 shadow-xs">
          <h3 className="text-base font-bold text-amber-950 dark:text-amber-200 mb-1 flex items-center gap-2">
            <Upload className="w-5 h-5 text-amber-600" />
            Resubmit Requested Document
          </h3>
          <p className="text-xs text-amber-800/80 dark:text-amber-300/80 mb-4">
            The evaluation officer has requested an updated or clarified document. Uploading will update your application version and trigger automatic re-evaluation.
          </p>

          <form onSubmit={handleResubmitDocument} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Document Type to Update *</label>
                <select
                  value={resubmitDocType}
                  onChange={(e) => setResubmitDocType(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                >
                  <option value="BID_BOND">Bank Guarantee / Bid Security Bond</option>
                  <option value="TAX_CLEARANCE">Tax Clearance Certificate</option>
                  <option value="FINANCIAL_AUDIT">Audited Financial Statements</option>
                  <option value="COMPANY_REGISTRATION">Certificate of Incorporation</option>
                  <option value="TECHNICAL_PROPOSAL">Technical Proposal Specification</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Certified File (PDF / Image) *</label>
                <input
                  type="file"
                  required
                  accept=".pdf,.png,.jpg,.jpeg"
                  onChange={(e) => setResubmitFile(e.target.files[0])}
                  className="w-full text-xs text-slate-600 dark:text-slate-300 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-emerald-600 file:text-white hover:file:bg-emerald-700"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Explanation / Attestation Notes</label>
              <textarea
                rows="2"
                value={resubmitNotes}
                onChange={(e) => setResubmitNotes(e.target.value)}
                placeholder="Detail the corrections or bank endorsements applied..."
                className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
              />
            </div>

            <button
              type="submit"
              disabled={resubmitting}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors disabled:opacity-50"
            >
              {resubmitting ? 'Processing & Re-evaluating...' : 'Submit Certified Replacement Document'}
            </button>
          </form>
        </div>
      )}

      {/* CLARIFICATION & MESSAGING THREAD (Requirement 7) */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs">
        <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-emerald-600" />
          <span>Clarification & Official Communications Thread</span>
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          All formal inquiries and responses are archived in the tamper-evident audit log.
        </p>

        {clarifications.length === 0 ? (
          <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl text-center text-xs text-slate-400">
            No clarification requests have been issued for this application yet.
          </div>
        ) : (
          <div className="space-y-4">
            {clarifications.map((clr) => (
              <div key={clr.id} className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
                      From: {clr.sender_name} ({clr.sender_role})
                    </span>
                    <p className="text-xs text-slate-800 dark:text-slate-200 mt-1 leading-relaxed font-medium">
                      {clr.message}
                    </p>
                  </div>
                  <span className="text-[10px] text-slate-400 shrink-0">
                    {new Date(clr.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                {clr.response_text ? (
                  <div className="p-3 bg-emerald-50/50 dark:bg-emerald-950/30 rounded-lg border-l-4 border-emerald-500 text-xs">
                    <span className="text-[10px] font-bold text-emerald-800 dark:text-emerald-300 uppercase block">
                      Bidder Response:
                    </span>
                    <p className="text-slate-700 dark:text-slate-300 mt-0.5">{clr.response_text}</p>
                    <span className="text-[9px] text-slate-400 block mt-1">
                      Responded at: {new Date(clr.responded_at).toLocaleString()}
                    </span>
                  </div>
                ) : (
                  !isOfficer && (
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                      {activeClarificationId === clr.id ? (
                        <div className="space-y-2">
                          <textarea
                            rows="2"
                            value={responseText}
                            onChange={(e) => setResponseText(e.target.value)}
                            placeholder="Type official response to the procurement committee..."
                            className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                          />
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setActiveClarificationId(null)}
                              className="px-3 py-1 text-xs text-slate-500"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              disabled={responseSubmitting}
                              onClick={() => handleReplyClarification(clr.id)}
                              className="px-3 py-1 bg-emerald-600 text-white text-xs font-bold rounded-lg"
                            >
                              {responseSubmitting ? 'Sending...' : 'Send Response'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => setActiveClarificationId(clr.id)}
                          className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-colors"
                        >
                          Submit Formal Response
                        </button>
                      )}
                    </div>
                  )
                )}
              </div>
            ))}
          </div>
        )}

        {/* Officer New Clarification Request Form */}
        {isOfficer && (
          <form onSubmit={handleSendClarification} className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Request Additional Clarification from Bidder
            </h4>
            <textarea
              rows="2"
              value={clarificationMsg}
              onChange={(e) => setClarificationMsg(e.target.value)}
              placeholder="State precise evidentiary clarification required from the applicant..."
              className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
            />
            <button
              type="submit"
              disabled={clarificationSubmitting}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              <Send className="w-3.5 h-3.5" />
              {clarificationSubmitting ? 'Transmitting...' : 'Issue Formal Clarification Request'}
            </button>
          </form>
        )}
      </div>

      {/* OFFICER OFFICIAL DECISION FORM (Requirement 12) */}
      {isOfficer && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border-2 border-emerald-600/30 p-6 shadow-md">
          <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-600" />
            Official Procurement Officer Final Determination
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
            Under procurement statutory rules, officers independently review AI findings and record final binding determinations with mandatory rationale notes.
          </p>

          <form onSubmit={handleRecordOfficialDecision} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Official Decision *</label>
                <select
                  value={officialDecision}
                  onChange={(e) => setOfficialDecision(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                >
                  <option value="APPROVED">APPROVE & QUALIFY</option>
                  <option value="AWARDED">AWARD TENDER CONTRACT</option>
                  <option value="DISQUALIFIED">DISQUALIFY APPLICATION</option>
                  <option value="REJECTED">REJECT BID</option>
                  <option value="PENDING">SET AS PENDING</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Official Decision Sign-off</label>
                <div className="px-3 py-2 text-xs font-medium bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                  {user?.full_name} ({user?.organization || 'National Procurement Authority'})
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Administrative Decision Rationale Notes *</label>
              <textarea
                required
                rows="3"
                value={decisionNotes}
                onChange={(e) => setDecisionNotes(e.target.value)}
                placeholder="State the formal statutory justification, evaluation committee concurrence, and resolution of any clarification..."
                className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
              />
            </div>

            <button
              type="submit"
              disabled={decisionSubmitting}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-md transition-all disabled:opacity-50"
            >
              {decisionSubmitting ? 'Recording in Audit Log...' : 'Confirm & Publish Official Decision'}
            </button>
          </form>
        </div>
      )}

      {/* STATUS HISTORY & AUDIT TRAIL TIMELINE (Requirement 8) */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs">
        <h3 className="text-base font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
          <History className="w-5 h-5 text-emerald-600" />
          Status Transition History (Requirement 8)
        </h3>

        <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-800">
          {history.map((h, idx) => (
            <div key={h.id || idx} className="relative">
              <div className="absolute -left-6 top-1 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-4 ring-white dark:ring-slate-900" />
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-900 dark:text-white font-mono">
                    {h.previous_status ? `${h.previous_status} -> ` : ''}{h.new_status}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {new Date(h.created_at).toLocaleString()}
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                  {h.reason}
                </p>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  Actor: <strong>{h.changed_by_name}</strong> ({h.changed_by_role})
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
