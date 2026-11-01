import React from 'react';
import {
  FileText,
  AlertTriangle,
  HelpCircle,
  CheckCircle,
  Clock,
  ArrowRight,
  Plus,
  Scale,
  Users,
  Search,
  Filter,
  DollarSign,
  Building2,
  ShieldAlert
} from 'lucide-react';

export default function OfficerDashboard({
  stats,
  applications = [],
  tenders = [],
  onSelectBid,
  onOpenNewTender,
  onNavigate
}) {
  return (
    <div className="space-y-6 animate-in fade-in">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-emerald-800 via-emerald-700 to-teal-800 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden">
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-950/40 rounded-full text-emerald-200 text-xs font-semibold uppercase tracking-wider mb-3 backdrop-blur-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            Official Procurement Oversight Console
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            BidCheck AI Evaluation Dashboard
          </h1>
          <p className="mt-2 text-sm text-emerald-100/90 leading-relaxed">
            Procurement compliance evaluation, comparative document similarity analysis, rule-based verification, and non-prejudicial uncertainty separation.
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              onClick={onOpenNewTender}
              className="inline-flex items-center gap-2 px-4 py-2 bg-white text-emerald-800 text-sm font-bold rounded-xl shadow-md hover:bg-emerald-50 transition-all active:scale-95"
            >
              <Plus className="w-4 h-4" />
              Publish New Tender
            </button>
            <button
              onClick={() => onNavigate('approvals')}
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-900/60 hover:bg-emerald-900/80 text-white text-sm font-semibold rounded-xl border border-emerald-500/30 transition-all"
            >
              <Users className="w-4 h-4" />
              Approvals & Verification
            </button>
            <button
              onClick={() => onNavigate('collusion')}
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-900/60 hover:bg-emerald-900/80 text-white text-sm font-semibold rounded-xl border border-emerald-500/30 transition-all"
            >
              <Scale className="w-4 h-4" />
              Bid Risk Analysis
            </button>
            <button
              onClick={() => onNavigate('audit')}
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-900/60 hover:bg-emerald-900/80 text-white text-sm font-semibold rounded-xl border border-emerald-500/30 transition-all"
            >
              <Users className="w-4 h-4" />
              Audit Trail
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Published Tenders</span>
            <div className="p-2 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 rounded-lg">
              <FileText className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900 dark:text-white">{stats?.total_tenders || tenders.length || 0}</span>
            <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">Active</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Total Bids</span>
            <div className="p-2 bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 rounded-lg">
              <Building2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900 dark:text-white">{stats?.total_bids || applications.length || 0}</span>
            <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">Recorded in DB</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Pending Decisions</span>
            <div className="p-2 bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 rounded-lg">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900 dark:text-white">{stats?.pending_decisions || 0}</span>
            <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">Requires Officer</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Info Gaps / Clarify</span>
            <div className="p-2 bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400 rounded-lg">
              <HelpCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900 dark:text-white">{stats?.uncertain_bids || 0}</span>
            <span className="text-xs text-teal-600 dark:text-teal-400 font-medium">Non-Fraud Gaps</span>
          </div>
        </div>

        <div className="col-span-2 lg:col-span-1 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">High Risk Signals</span>
            <div className="p-2 bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 rounded-lg">
              <ShieldAlert className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-rose-600 dark:text-rose-400">{stats?.high_risk_bids || 0}</span>
            <span className="text-xs text-rose-600 dark:text-rose-400 font-medium">Flagged for Audit</span>
          </div>
        </div>
      </div>

      {/* Submissions Queue Table & Mobile Cards */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span>Submitted Bids Evaluation Queue</span>
              <span className="px-2 py-0.5 text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-full">
                {applications.length}
              </span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Automated compliance rule checks, document similarity indicators, and authorized officer final determinations
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onNavigate('bids')}
              className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 flex items-center gap-1"
            >
              View Full Queue <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {applications.length === 0 ? (
          <div className="text-center py-12 px-4">
            <FileText className="w-10 h-10 text-slate-300 dark:text-slate-700 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">No applications received yet</p>
            <p className="text-xs text-slate-400 mt-1">Applications submitted by bidders will appear here automatically.</p>
          </div>
        ) : (
          <div>
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50/75 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider border-b border-slate-100 dark:border-slate-800">
                  <tr>
                    <th className="px-5 py-3.5">Company / Bidder</th>
                    <th className="px-5 py-3.5">Tender Reference</th>
                    <th className="px-5 py-3.5">Bid Amount</th>
                    <th className="px-5 py-3.5">AI Risk Level</th>
                    <th className="px-5 py-3.5">AI Recommendation</th>
                    <th className="px-5 py-3.5">Official Decision</th>
                    <th className="px-5 py-3.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {applications.map((app) => {
                    const isHighRisk = app.ai_risk_level === 'HIGH';
                    const isUncertain = app.ai_risk_level === 'UNCERTAIN';
                    const isLowRisk = app.ai_risk_level === 'LOW';

                    return (
                      <tr key={app.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="px-5 py-4">
                          <div className="font-bold text-slate-900 dark:text-white">{app.company_name}</div>
                          <div className="text-xs text-slate-400 font-mono mt-0.5">Tax ID: {app.tax_id}</div>
                        </td>
                        <td className="px-5 py-4">
                          <div className="text-xs font-bold text-emerald-700 dark:text-emerald-400">{app.tender_ref || 'PRC-TENDER'}</div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-xs">{app.tender_title}</div>
                        </td>
                        <td className="px-5 py-4">
                          <div className="font-mono font-bold text-slate-900 dark:text-white">
                            ${parseFloat(app.bid_amount).toLocaleString()}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            {app.tender_budget ? `${((app.bid_amount / app.tender_budget) * 100).toFixed(1)}% of budget` : 'Standard'}
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          {isHighRisk && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-300">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-600" />
                              HIGH RISK
                            </span>
                          )}
                          {isUncertain && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-600" />
                              UNCERTAIN (GAP)
                            </span>
                          )}
                          {isLowRisk && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                              LOW RISK
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          <span className="text-xs font-semibold px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                            {app.ai_recommendation?.replace(/_/g, ' ') || 'EVALUATING'}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <span className={`text-xs font-bold px-2.5 py-1 rounded-md ${
                            app.official_decision === 'APPROVED' || app.official_decision === 'AWARDED'
                              ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300'
                              : app.official_decision === 'DISQUALIFIED' || app.official_decision === 'REJECTED'
                              ? 'bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300'
                              : 'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                          }`}>
                            {app.official_decision}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <button
                            onClick={() => onSelectBid(app.id)}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-xs transition-colors"
                          >
                            Inspect Bid
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards View */}
            <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800 p-4 space-y-4">
              {applications.map((app) => (
                <div key={app.id} className="pt-3 first:pt-0 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-bold text-slate-900 dark:text-white text-base">{app.company_name}</div>
                      <div className="text-xs text-slate-500 font-mono">Tax ID: {app.tax_id}</div>
                    </div>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      app.ai_risk_level === 'HIGH'
                        ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                        : app.ai_risk_level === 'UNCERTAIN'
                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                        : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                    }`}>
                      {app.ai_risk_level}
                    </span>
                  </div>

                  <div className="text-xs text-slate-600 dark:text-slate-300">
                    <span className="font-semibold text-emerald-600">{app.tender_ref}: </span>
                    {app.tender_title}
                  </div>

                  <div className="flex items-center justify-between text-xs pt-1">
                    <div>
                      <span className="text-slate-400">Bid: </span>
                      <strong className="text-slate-900 dark:text-white">${parseFloat(app.bid_amount).toLocaleString()}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400">Decision: </span>
                      <strong className="text-emerald-700 dark:text-emerald-400">{app.official_decision}</strong>
                    </div>
                  </div>

                  <button
                    onClick={() => onSelectBid(app.id)}
                    className="w-full mt-2 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors text-center"
                  >
                    Inspect Full AI Analysis & Decision
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
