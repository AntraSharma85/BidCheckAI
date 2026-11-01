import React, { useState, useEffect } from 'react';
import {
  FileText,
  FileCheck2,
  FileWarning,
  Clock,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Upload,
  X,
  Download,
  AlertTriangle,
  Info,
  ShieldCheck,
  RefreshCw
} from 'lucide-react';

export default function VendorDocumentsModal({ isOpen, onClose, onRefresh }) {
  const [docsData, setDocsData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Upload Form State
  const [selectedType, setSelectedType] = useState('BUSINESS_REGISTRATION');
  const [selectedFile, setSelectedFile] = useState(null);

  const fetchDocs = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('bidcheck_token');
      const res = await fetch('/api/vendor/documents', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setDocsData(data);
      }
    } catch (err) {
      console.error('Failed to load vendor documents:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchDocs();
      setError(null);
      setSuccessMsg(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!selectedFile) {
      setError('Please choose a file to upload.');
      return;
    }

    setUploading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const token = localStorage.getItem('bidcheck_token');
      const formData = new FormData();
      formData.append('document', selectedFile);
      formData.append('doc_type', selectedType);

      const res = await fetch('/api/vendor/documents', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Upload failed.');
      }

      setSuccessMsg('Document successfully uploaded and queued for officer verification.');
      setSelectedFile(null);
      await fetchDocs();
      if (onRefresh) onRefresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (doc) => {
    try {
      const token = localStorage.getItem('bidcheck_token');
      const res = await fetch(`/api/vendor-documents/${doc.id}/download`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Download request failed.');
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

  const formatFileSize = (bytes) => {
    if (!bytes) return '0 B';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'VERIFIED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
            <CheckCircle2 className="w-3 h-3" />
            Verified
          </span>
        );
      case 'PENDING_REVIEW':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
            <Clock className="w-3 h-3" />
            Pending Review
          </span>
        );
      case 'NEEDS_CLARIFICATION':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300">
            <HelpCircle className="w-3 h-3" />
            Needs Clarification
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
            <XCircle className="w-3 h-3" />
            Rejected
          </span>
        );
      case 'MISSING':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-900">
            <FileWarning className="w-3 h-3" />
            Missing
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 animate-in fade-in">
      <div className="w-full max-w-3xl max-h-[92vh] flex flex-col bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-6 h-6 text-teal-600 dark:text-teal-400" />
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Enterprise Verification & Identity Documents
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Manage your official corporate registration records and mandatory verification certificates.
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

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {error && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-xl text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Mandatory Requirements Checklist */}
          <div className="space-y-2.5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Mandatory Corporate Verification Checklist
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {docsData?.checklist?.map((item) => (
                <div
                  key={item.type}
                  className={`p-3 rounded-xl border text-xs space-y-1.5 ${
                    item.verification_status === 'VERIFIED'
                      ? 'bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/60'
                      : item.verification_status === 'MISSING'
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
                      Uploaded: {item.document.original_filename}
                    </div>
                  ) : (
                    <div className="text-[11px] text-rose-600 dark:text-rose-400 font-semibold">
                      Please upload this certificate below
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Upload New Document Form */}
          <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700/80 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Upload className="w-4 h-4 text-teal-600" />
              Upload / Resubmit Verification Document
            </h4>

            <form onSubmit={handleUpload} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Document Type *</label>
                  <select
                    value={selectedType}
                    onChange={(e) => setSelectedType(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-hidden focus:border-teal-500"
                  >
                    <option value="BUSINESS_REGISTRATION">Certificate of Incorporation / Registration</option>
                    <option value="TAX_REGISTRATION">GSTIN / Tax Clearance Certificate</option>
                    <option value="PAN_CARD">Corporate PAN Card</option>
                    <option value="POWER_OF_ATTORNEY">Power of Attorney / Board Resolution</option>
                    <option value="FINANCIAL_STATEMENT">Audited Financial Statement</option>
                    <option value="OTHER">Other Supporting Identification</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Select File (PDF, PNG, JPG - max 15MB) *</label>
                  <input
                    type="file"
                    required
                    accept=".pdf,.png,.jpg,.jpeg,.webp"
                    onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                    className="w-full px-2 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white file:mr-2 file:py-1 file:px-2.5 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-teal-50 file:text-teal-700 dark:file:bg-teal-950 dark:file:text-teal-300"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  disabled={uploading || !selectedFile}
                  className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-lg shadow-xs transition-all disabled:opacity-50 flex items-center gap-1.5"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>{uploading ? 'Uploading...' : 'Submit Document for Review'}</span>
                </button>
              </div>
            </form>
          </div>

          {/* List of Uploaded Documents */}
          <div className="space-y-2.5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Submitted Documents History ({docsData?.documents?.length || 0})
            </h4>

            {loading ? (
              <div className="py-6 text-center text-xs text-slate-400">Loading documents...</div>
            ) : !docsData?.documents || docsData.documents.length === 0 ? (
              <div className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-center text-xs text-slate-500">
                No documents uploaded yet. Upload your mandatory certificates above.
              </div>
            ) : (
              <div className="space-y-2">
                {docsData.documents.map((doc) => (
                  <div
                    key={doc.id}
                    className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs"
                  >
                    <div className="space-y-1 flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <FileText className="w-4 h-4 text-teal-600 shrink-0" />
                        <span className="font-bold text-xs text-slate-900 dark:text-white truncate">
                          {doc.original_filename}
                        </span>
                        <span className="text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-sm">
                          {doc.doc_type?.replace(/_/g, ' ')}
                        </span>
                        {getStatusBadge(doc.verification_status)}
                      </div>

                      <div className="text-[11px] text-slate-400 flex flex-wrap items-center gap-3">
                        <span>Size: {formatFileSize(doc.file_size)}</span>
                        <span>Uploaded: {new Date(doc.uploaded_at).toLocaleString()}</span>
                        {doc.verified_by_name && (
                          <span>Reviewer: <strong className="text-slate-600 dark:text-slate-300">{doc.verified_by_name}</strong></span>
                        )}
                      </div>

                      {doc.verification_notes && (
                        <div className="text-[11px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2 py-1 rounded-md border border-amber-200/50">
                          <strong>Officer Note:</strong> {doc.verification_notes}
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => handleDownload(doc)}
                      className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1 shrink-0 self-end sm:self-center"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold rounded-lg"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
