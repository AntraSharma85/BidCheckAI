import React, { useState, useEffect } from 'react';
import {
  Users,
  Search,
  Filter,
  Download,
  Clock,
  ShieldCheck,
  CheckCircle2,
  FileText,
  AlertCircle
} from 'lucide-react';

export default function AuditLogView() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState('ALL');

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('bidcheck_token');
      const res = await fetch('/api/audit-logs', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to fetch audit trail.');
      setLogs(json.logs || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const filtered = logs.filter(log => {
    const matchesAction = actionFilter === 'ALL' || log.action === actionFilter;
    const matchesSearch =
      log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.user_name && log.user_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (log.entity_type && log.entity_type.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (log.details_json && log.details_json.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesAction && matchesSearch;
  });

  const handleExportJSON = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(logs, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `bidcheck_audit_trail_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 text-xs font-bold rounded-lg mb-2">
              <ShieldCheck className="w-4 h-4" />
              Statutory Procurement Governance
            </div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-white">
              Immutable Procurement Audit Trail
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Every tender publication, sealed proposal receipt, AI evaluation run, clarification dispatch, document resubmission, and official officer determination is logged with cryptographic timestamps.
            </p>
          </div>

          <button
            onClick={handleExportJSON}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 transition-colors shrink-0"
          >
            <Download className="w-4 h-4 text-emerald-600" />
            Export Audit Trail (JSON)
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search audit trail by actor, action, or metadata..."
            className="w-full pl-10 pr-4 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 focus:outline-hidden focus:border-emerald-500"
          />
        </div>

        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-hidden focus:border-emerald-500"
        >
          <option value="ALL">All Recorded Actions</option>
          <option value="TENDER_PUBLISHED">Tender Published</option>
          <option value="BID_SUBMITTED">Bid Submitted</option>
          <option value="CLARIFICATION_REQUESTED">Clarification Requested</option>
          <option value="CLARIFICATION_RESPONDED">Clarification Responded</option>
          <option value="DOCUMENT_RESUBMITTED">Document Resubmitted</option>
          <option value="OFFICIAL_DECISION_RECORDED">Official Decision Recorded</option>
          <option value="COLLUSION_ANALYSIS_RUN">Collusion Analysis Run</option>
        </select>
      </div>

      {/* Table & Mobile View */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-slate-400 text-sm">
            Loading audit records from SQLite...
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-sm">
            No matching audit records found.
          </div>
        ) : (
          <div>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/75 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider border-b border-slate-100 dark:border-slate-800">
                  <tr>
                    <th className="px-5 py-3.5">Timestamp</th>
                    <th className="px-5 py-3.5">Action</th>
                    <th className="px-5 py-3.5">Actor</th>
                    <th className="px-5 py-3.5">Target Entity</th>
                    <th className="px-5 py-3.5">Metadata / Details</th>
                    <th className="px-5 py-3.5">IP Address</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                  {filtered.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="px-5 py-3.5 text-slate-400 font-mono whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString()}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-sm">
                          {log.action}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="font-bold text-slate-800 dark:text-slate-200">
                          {log.user_name || 'System'}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">{log.user_role || 'audit_engine'}</div>
                      </td>
                      <td className="px-5 py-3.5 font-mono text-slate-600 dark:text-slate-300">
                        {log.entity_type} ({log.entity_id ? log.entity_id.slice(0, 10) + '...' : '-'})
                      </td>
                      <td className="px-5 py-3.5 max-w-xs truncate text-slate-500 dark:text-slate-400 font-mono text-[11px]" title={log.details_json}>
                        {log.details_json}
                      </td>
                      <td className="px-5 py-3.5 font-mono text-slate-400">
                        {log.ip_address}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile View */}
            <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800 p-4 space-y-3">
              {filtered.map((log) => (
                <div key={log.id} className="pt-2 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      {log.action}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {new Date(log.created_at).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="text-slate-700 dark:text-slate-300">
                    Actor: <strong>{log.user_name || 'System'}</strong> ({log.user_role})
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono bg-slate-50 dark:bg-slate-800 p-1.5 rounded-md truncate">
                    {log.details_json}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
