import React, { useState } from 'react';
import { X, Plus, AlertCircle, FileText, CheckCircle2 } from 'lucide-react';

export default function PublishTenderModal({ isOpen, onClose, user, onSuccess }) {
  const isApproved = user?.verification_status === 'APPROVED';
  const [title, setTitle] = useState('');
  const [tenderRef, setTenderRef] = useState(`PRC-2026-${Math.floor(100 + Math.random() * 900)}`);
  const [category, setCategory] = useState('Civil Engineering & Infrastructure');
  const [department, setDepartment] = useState(user?.department || user?.organization || 'Ministry of Public Works');
  const [budget, setBudget] = useState('3500000');
  const [currency, setCurrency] = useState('USD');
  const [deadline, setDeadline] = useState('2026-12-31T18:00');
  const [summary, setSummary] = useState('');
  const [requiredDocs, setRequiredDocs] = useState([
    'TAX_CLEARANCE',
    'FINANCIAL_AUDIT',
    'COMPANY_REGISTRATION',
    'TECHNICAL_PROPOSAL',
    'BID_BOND'
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  const toggleDoc = (doc) => {
    if (requiredDocs.includes(doc)) {
      setRequiredDocs(requiredDocs.filter(d => d !== doc));
    } else {
      setRequiredDocs([...requiredDocs, doc]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const token = localStorage.getItem('bidcheck_token');
      const res = await fetch('/api/tenders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          title,
          tender_ref: tenderRef,
          category,
          department,
          budget: parseFloat(budget),
          currency,
          deadline: new Date(deadline).toISOString(),
          requirements: {
            required_docs: requiredDocs,
            summary: summary || 'Procurement project requiring verified technical architecture and compliance certification.'
          }
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to publish tender.');
      }

      onSuccess(data.tender);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-2xl w-full border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-emerald-50/50 dark:bg-emerald-950/20">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-600 text-white rounded-xl shadow-xs">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Publish Public Tender Notice</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Official Government Procurement System</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="overflow-y-auto p-6 space-y-4 flex-1">
          {error && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-xl flex items-center gap-2 text-rose-700 dark:text-rose-300 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!isApproved && (
            <div className="p-3 bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800 rounded-xl flex items-center gap-2.5 text-amber-800 dark:text-amber-300 text-xs font-medium">
              <AlertCircle className="w-5 h-5 shrink-0 text-amber-600" />
              <div>
                <strong>Authority Authorization Required:</strong> Officer account status is <span className="font-bold uppercase underline">{user?.verification_status || 'PENDING_VERIFICATION'}</span>. Publishing official tenders requires approved credentials.
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2 space-y-1">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Tender Project Title *</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Regional Clean Water Distribution & Filtration Facility"
                className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-hidden focus:border-emerald-500"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Tender Ref Code *</label>
              <input
                type="text"
                required
                value={tenderRef}
                onChange={(e) => setTenderRef(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-hidden focus:border-emerald-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Procuring Department *</label>
              <input
                type="text"
                required
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-hidden focus:border-emerald-500"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Category *</label>
              <input
                type="text"
                required
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-hidden focus:border-emerald-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Allocated Budget (USD) *</label>
              <input
                type="number"
                required
                min="1000"
                step="1000"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-hidden focus:border-emerald-500"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Submission Deadline *</label>
              <input
                type="datetime-local"
                required
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-hidden focus:border-emerald-500"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Project Scope Summary</label>
            <textarea
              rows="3"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Outline project objectives, mandatory technical requirements, and key evaluation criteria..."
              className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-hidden focus:border-emerald-500"
            />
          </div>

          <div className="space-y-2 pt-2">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
              Mandatory Compliance Documents Required from Bidders
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {[
                { id: 'TAX_CLEARANCE', label: 'Tax Clearance Certificate' },
                { id: 'FINANCIAL_AUDIT', label: 'Audited Financial Statements' },
                { id: 'COMPANY_REGISTRATION', label: 'Certificate of Incorporation' },
                { id: 'TECHNICAL_PROPOSAL', label: 'Technical Proposal Specification' },
                { id: 'BID_BOND', label: 'Bank Guarantee / Bid Security Bond' },
                { id: 'EXPERIENCE_CERTIFICATE', label: 'Past Performance References' }
              ].map((doc) => {
                const checked = requiredDocs.includes(doc.id);
                return (
                  <button
                    type="button"
                    key={doc.id}
                    onClick={() => toggleDoc(doc.id)}
                    className={`flex items-center gap-2 p-2.5 rounded-xl border text-left text-xs transition-colors ${
                      checked
                        ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 font-semibold'
                        : 'border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-md flex items-center justify-center border ${
                      checked ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-300 dark:border-slate-600'
                    }`}>
                      {checked && <CheckCircle2 className="w-3.5 h-3.5" />}
                    </div>
                    <span>{doc.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !isApproved}
              className="px-5 py-2 text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-md transition-all disabled:opacity-50 flex items-center gap-2"
            >
              {loading ? 'Publishing...' : isApproved ? 'Publish Tender Notice' : 'Approval Required'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
