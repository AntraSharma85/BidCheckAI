import React, { useState } from 'react';
import { X, Upload, FileText, CheckCircle, AlertCircle, ShieldCheck } from 'lucide-react';

export default function BidSubmissionModal({ isOpen, onClose, tender, user, onSuccess }) {
  const isVerified = user?.verification_status === 'VERIFIED';
  const [companyName, setCompanyName] = useState(user?.organization || 'Apex Engineering Consortium');
  const [taxId, setTaxId] = useState(user?.gstin || user?.pan || '27AABCU9603R1ZM');
  const [regNumber, setRegNumber] = useState(user?.cin_llpin || 'U45200MH2018PTC309182');
  const [bidAmount, setBidAmount] = useState(tender?.budget ? (tender.budget * 0.94).toString() : '1000000');
  const [contactPerson, setContactPerson] = useState(user?.rep_name || user?.full_name || 'Marcus Vance');
  const [contactEmail, setContactEmail] = useState(user?.email || 'vendor@example.com');

  const [files, setFiles] = useState({
    TECHNICAL_PROPOSAL: null,
    TAX_CLEARANCE: null,
    FINANCIAL_AUDIT: null,
    COMPANY_REGISTRATION: null,
    BID_BOND: null
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen || !tender) return null;

  const handleFileChange = (docType, file) => {
    setFiles(prev => ({
      ...prev,
      [docType]: file
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const token = localStorage.getItem('bidcheck_token');
      const formData = new FormData();

      formData.append('tender_id', tender.id);
      formData.append('company_name', companyName);
      formData.append('tax_id', taxId);
      formData.append('registration_number', regNumber);
      formData.append('bid_amount', bidAmount);
      formData.append('currency', tender.currency || 'USD');
      formData.append('contact_person', contactPerson);
      formData.append('contact_email', contactEmail);

      // Append files
      Object.entries(files).forEach(([type, file]) => {
        if (file) {
          formData.append(type, file);
        }
      });

      const res = await fetch('/api/applications', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit application.');
      }

      onSuccess(data.application);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const uploadFields = [
    { key: 'TECHNICAL_PROPOSAL', label: 'Technical Proposal (PDF/Doc) *', required: true },
    { key: 'TAX_CLEARANCE', label: 'Tax Clearance Certificate', required: false },
    { key: 'FINANCIAL_AUDIT', label: 'Audited Financial Statements', required: false },
    { key: 'COMPANY_REGISTRATION', label: 'Certificate of Incorporation', required: false },
    { key: 'BID_BOND', label: 'Bid Security Bond / Bank Guarantee', required: false }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-2xl w-full border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-emerald-50/50 dark:bg-emerald-950/20">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-600 text-white rounded-xl shadow-xs">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Submit Procurement Tender Bid</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Tender Ref: <span className="font-mono text-emerald-600 dark:text-emerald-400">{tender.tender_ref}</span>
              </p>
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

          {!isVerified && (
            <div className="p-3 bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800 rounded-xl flex items-center gap-2.5 text-amber-800 dark:text-amber-300 text-xs font-medium">
              <AlertCircle className="w-5 h-5 shrink-0 text-amber-600" />
              <div>
                <strong>Submission Restricted:</strong> Your enterprise account status is <span className="font-bold uppercase underline">{user?.verification_status || 'UNVERIFIED'}</span>. Only verified and approved vendor enterprises can submit sealed bids.
              </div>
            </div>
          )}

          <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
            <div className="font-bold text-slate-900 dark:text-white text-sm">{tender.title}</div>
            <div className="text-slate-500 dark:text-slate-400 mt-1 flex flex-wrap gap-x-4">
              <span>Budget: <strong>${parseFloat(tender.budget).toLocaleString()} {tender.currency}</strong></span>
              <span>Department: <strong>{tender.department}</strong></span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Company Legal Name *</label>
              <input
                type="text"
                required
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-hidden focus:border-emerald-500"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Statutory Tax ID (TIN/EIN) *</label>
              <input
                type="text"
                required
                value={taxId}
                onChange={(e) => setTaxId(e.target.value)}
                placeholder="US-XX-XXXXXXX"
                className="w-full px-3 py-2 text-sm font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-hidden focus:border-emerald-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Company Registration No. *</label>
              <input
                type="text"
                required
                value={regNumber}
                onChange={(e) => setRegNumber(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-hidden focus:border-emerald-500"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Bid Offer Amount (USD) *</label>
              <input
                type="number"
                required
                min="1"
                step="1000"
                value={bidAmount}
                onChange={(e) => setBidAmount(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-hidden focus:border-emerald-500"
              />
            </div>
          </div>

          {/* Upload Documents Section */}
          <div className="space-y-3 pt-2">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
              Certified Tender Documentation (PDF / Images)
            </label>
            <div className="space-y-2">
              {uploadFields.map((field) => {
                const currentFile = files[field.key];
                return (
                  <div
                    key={field.key}
                    className="p-3 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <FileText className="w-5 h-5 text-emerald-600 shrink-0" />
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                          {field.label}
                        </div>
                        {currentFile ? (
                          <div className="text-[11px] text-emerald-600 font-medium truncate">
                            {currentFile.name} ({(currentFile.size / 1024).toFixed(1)} KB)
                          </div>
                        ) : (
                          <div className="text-[10px] text-slate-400">
                            Upload verified PDF or scanned document
                          </div>
                        )}
                      </div>
                    </div>

                    <label className="cursor-pointer px-3 py-1.5 text-xs font-bold bg-white dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors shrink-0 flex items-center gap-1.5 shadow-2xs">
                      <Upload className="w-3.5 h-3.5 text-emerald-600" />
                      {currentFile ? 'Change' : 'Select File'}
                      <input
                        type="file"
                        accept=".pdf,.png,.jpg,.jpeg,.txt"
                        className="hidden"
                        onChange={(e) => handleFileChange(field.key, e.target.files[0])}
                      />
                    </label>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Procedural Fairness Notice */}
          <div className="p-3 bg-emerald-50/50 dark:bg-emerald-950/20 rounded-xl border border-emerald-100 dark:border-emerald-900/40 text-[11px] text-emerald-800 dark:text-emerald-300 leading-relaxed">
            <strong>Procedural Fairness Policy:</strong> Under BidCheck AI standards, any incomplete certificate is treated as an informational uncertainty for clarification, never as presumptive proof of fraud.
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
              disabled={loading || !isVerified}
              className="px-5 py-2 text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-md transition-all disabled:opacity-50 flex items-center gap-2"
            >
              {loading ? 'Submitting & Analyzing...' : isVerified ? 'Submit Sealed Bid' : 'Verification Required'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
