import React, { useState } from 'react';
import {
  FileText,
  Plus,
  Search,
  DollarSign,
  Calendar,
  Building2,
  CheckCircle2,
  X,
  Scale,
  ArrowRight,
  ShieldCheck,
  AlertCircle
} from 'lucide-react';

export default function TendersList({
  tenders = [],
  user,
  onOpenNewTender,
  onApplyTender,
  onViewTenderBids,
  onViewCollusion
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const isOfficer = user?.role === 'officer';

  const filtered = tenders.filter(t => {
    const matchesSearch =
      t.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.tender_ref.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.department.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.category.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || t.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* Top Header & Search Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            {isOfficer ? 'Manage Tenders' : 'Open Tenders'}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            {isOfficer
              ? 'Publish formal tender specifications, review applicant compliance, and execute comparative risk analysis.'
              : 'Discover procurement contracts open for bidding. Submit certified proposals directly through the secure portal.'}
          </p>
        </div>

        {isOfficer && (
          <button
            onClick={onOpenNewTender}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl shadow-md transition-all active:scale-95 shrink-0"
          >
            <Plus className="w-4 h-4" />
            Publish New Tender
          </button>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by tender ref, title, department, or domain..."
            className="w-full pl-10 pr-4 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 focus:outline-hidden focus:border-emerald-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-hidden focus:border-emerald-500"
          >
            <option value="ALL">All Statuses</option>
            <option value="PUBLISHED">Active / Open</option>
            <option value="UNDER_EVALUATION">Under Evaluation</option>
            <option value="AWARDED">Awarded</option>
          </select>
        </div>
      </div>

      {/* Tenders Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {filtered.map((t) => {
          let reqs = {};
          try {
            reqs = typeof t.requirements_json === 'string' ? JSON.parse(t.requirements_json) : (t.requirements_json || {});
          } catch (e) {
            reqs = {};
          }
          const requiredDocs = reqs.required_docs || ['TAX_CLEARANCE', 'FINANCIAL_AUDIT', 'TECHNICAL_PROPOSAL', 'BID_BOND'];

          return (
            <div
              key={t.id}
              className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs hover:border-emerald-500/50 dark:hover:border-emerald-500/50 transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="text-xs font-mono font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-1 rounded-md">
                      {t.tender_ref}
                    </span>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white mt-2 leading-snug">
                      {t.title}
                    </h3>
                  </div>

                  <span className={`px-2.5 py-1 text-xs font-bold rounded-full shrink-0 ${
                    t.status === 'PUBLISHED'
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                      : t.status === 'UNDER_EVALUATION'
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                      : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                  }`}>
                    {t.status.replace(/_/g, ' ')}
                  </span>
                </div>

                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 line-clamp-2">
                  {reqs.summary || 'Official competitive solicitation requiring verified technical architecture and compliance documentation.'}
                </p>

                {/* Key Metrics Pill Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 text-xs">
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-semibold">Allocated Budget</span>
                    <strong className="text-slate-900 dark:text-white font-mono text-sm">
                      ${parseFloat(t.budget).toLocaleString()} {t.currency}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-semibold">Submissions</span>
                    <strong className="text-emerald-600 dark:text-emerald-400 text-sm">
                      {t.total_applications || 0} Bids Logged
                    </strong>
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <span className="text-slate-400 block text-[10px] uppercase font-semibold">Submission Deadline</span>
                    <strong className="text-slate-700 dark:text-slate-300 text-xs truncate block">
                      {new Date(t.deadline).toLocaleDateString()}
                    </strong>
                  </div>
                </div>

                {/* Mandatory Documents Badges */}
                <div className="mt-4">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">
                    Mandatory Verifications Required:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {requiredDocs.map((doc, idx) => (
                      <span
                        key={idx}
                        className="text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-sm"
                      >
                        {doc.replace(/_/g, ' ')}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-2">
                {isOfficer ? (
                  <>
                    <button
                      onClick={() => onViewTenderBids(t.id)}
                      className="flex-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-colors text-center"
                    >
                      Review Applications ({t.total_applications || 0})
                    </button>
                    <button
                      onClick={() => onViewCollusion(t.id)}
                      className="py-2 px-3 bg-slate-100 dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5"
                      title="Run Bid Risk Analysis"
                    >
                      <Scale className="w-3.5 h-3.5 text-emerald-600" />
                      Risk Analysis
                    </button>
                  </>
                ) : (
                  user?.verification_status === 'VERIFIED' ? (
                    <button
                      onClick={() => onApplyTender(t)}
                      className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 active:scale-95"
                    >
                      <FileText className="w-4 h-4" />
                      Submit Application Proposal
                    </button>
                  ) : (
                    <button
                      onClick={() => alert(`Verification Required: Your enterprise account status is "${user?.verification_status || 'UNVERIFIED'}". Only verified and approved vendors may submit bid proposals. Please wait for administrative verification.`)}
                      className="w-full py-2.5 px-4 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800 text-xs font-bold rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer hover:bg-amber-100"
                    >
                      <AlertCircle className="w-4 h-4 text-amber-600" />
                      Verification Required to Bid ({user?.verification_status || 'Pending'})
                    </button>
                  )
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
