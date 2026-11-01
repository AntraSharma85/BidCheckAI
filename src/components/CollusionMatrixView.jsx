import React, { useState, useEffect } from 'react';
import {
  Scale,
  AlertTriangle,
  CheckCircle2,
  AlertOctagon,
  FileText,
  Search,
  Users,
  TrendingUp,
  HelpCircle,
  ShieldCheck,
  Info
} from 'lucide-react';

export default function CollusionMatrixView({ tenders = [], onSelectBid }) {
  const [selectedTenderId, setSelectedTenderId] = useState(tenders[0]?.id || '');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchAnalysis = async (tenderId) => {
    if (!tenderId) return;
    try {
      setLoading(true);
      setError(null);
      const token = localStorage.getItem('bidcheck_token');
      const res = await fetch(`/api/tenders/${tenderId}/collusion-analysis`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to calculate bid risk analysis.');
      setData(json);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedTenderId) {
      fetchAnalysis(selectedTenderId);
    }
  }, [selectedTenderId]);

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 text-xs font-bold rounded-lg mb-2">
              <Scale className="w-4 h-4" />
              Proposal Risk & Similarity Intelligence
            </div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-white">
              Bid Risk Analysis
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
              Comparative analysis of document similarity indicators, shared registration records, and pricing variances across competing submissions for procurement evaluation committee review.
            </p>
          </div>

          <div className="space-y-1 sm:w-72">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">Select Tender to Analyze</label>
            <select
              value={selectedTenderId}
              onChange={(e) => setSelectedTenderId(e.target.value)}
              className="w-full px-3 py-2 text-xs font-medium bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
            >
              {tenders.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.tender_ref} - {t.title}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Committee Fairness Notice */}
        <div className="mt-4 p-3 bg-emerald-50/60 dark:bg-emerald-950/30 rounded-xl border border-emerald-100 dark:border-emerald-900/40 flex items-start gap-2.5 text-xs text-emerald-900 dark:text-emerald-200">
          <Info className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            <strong>Procurement Committee Notice:</strong> Document similarity indicators and risk metrics are analytical tools designed to assist officer review. Textual similarity does not constitute independent proof of irregularity. Final determinations remain solely with the authorized procurement officer.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center">
          <div className="inline-block w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-sm font-semibold text-slate-500">Evaluating proposal similarity indicators and cross-bidder evidence...</p>
        </div>
      ) : error ? (
        <div className="p-6 bg-rose-50 dark:bg-rose-950/40 rounded-2xl border border-rose-200 dark:border-rose-800 text-center">
          <AlertTriangle className="w-8 h-8 text-rose-500 mx-auto mb-2" />
          <p className="text-sm font-bold text-rose-800 dark:text-rose-300">{error}</p>
        </div>
      ) : data?.status === 'INSUFFICIENT_BIDS' ? (
        <div className="bg-white dark:bg-slate-900 p-8 rounded-2xl border border-slate-200 dark:border-slate-800 text-center space-y-3">
          <Scale className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto" />
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">Insufficient Submissions for Comparison</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            {data.message || 'At least two competing proposals are required on this tender to perform cross-bidder similarity and risk comparisons.'}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
              <span className="text-[10px] uppercase font-bold text-slate-400">Proposals Evaluated</span>
              <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">
                {data?.total_proposals || 0} Technical Proposals
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
              <span className="text-[10px] uppercase font-bold text-slate-400">Comparative Combinations</span>
              <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">
                {data?.pairs?.length || 0} Pairs Compared
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
              <span className="text-[10px] uppercase font-bold text-slate-400">Similarity Alerts for Review</span>
              <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
                {data?.pairs?.filter(p => p.risk_level === 'HIGH').length || 0} Requiring Attention
              </div>
            </div>
          </div>

          {/* Pairs Evaluation Cards */}
          <div className="space-y-4">
            {data?.pairs?.map((pair, idx) => {
              const isHigh = pair.risk_level === 'HIGH';
              const isMed = pair.risk_level === 'MEDIUM';

              let displayRiskLabel = 'Standard Variance (Independent Submissions)';
              if (pair.shared_tax_id) {
                displayRiskLabel = 'High Risk Alert: Shared Statutory Tax ID (Verification Required)';
              } else if (isHigh) {
                displayRiskLabel = 'Document Similarity Alert: High Text Overlap (Manual Review Recommended)';
              } else if (isMed) {
                displayRiskLabel = 'Moderate Similarity: Shared Industry Specifications';
              }

              return (
                <div
                  key={idx}
                  className={`bg-white dark:bg-slate-900 rounded-2xl border p-5 shadow-xs space-y-4 ${
                    isHigh
                      ? 'border-rose-300 dark:border-rose-800'
                      : isMed
                      ? 'border-amber-300 dark:border-amber-800'
                      : 'border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className={`p-2.5 rounded-xl ${
                        isHigh ? 'bg-rose-100 dark:bg-rose-950 text-rose-700' : 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700'
                      }`}>
                        <Scale className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-bold text-slate-900 dark:text-white">
                            {pair.bidder_a.name} <span className="text-slate-400 font-normal">compared with</span> {pair.bidder_b.name}
                          </h3>
                        </div>
                        <p className="text-xs text-slate-500 font-medium">
                          Document Similarity: <strong className="text-slate-800 dark:text-slate-200 font-mono">{pair.similarity_percent}%</strong> (Cosine Index: {pair.cosine_similarity})
                        </p>
                      </div>
                    </div>

                    <span className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider self-start sm:self-auto ${
                      isHigh
                        ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                        : isMed
                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                        : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                    }`}>
                      {displayRiskLabel}
                    </span>
                  </div>

                  {/* Supporting Evidence Breakdown */}
                  <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3.5 space-y-2 text-xs">
                    <div className="font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider text-[10px]">
                      Analytical Evidence & Observations:
                    </div>
                    <ul className="space-y-1 text-slate-600 dark:text-slate-400">
                      {pair.evidence.map((ev, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="text-emerald-600 dark:text-emerald-400 font-bold">•</span>
                          <span>{ev}</span>
                        </li>
                      ))}
                    </ul>

                    {/* Shared Phrases Extraction */}
                    {pair.shared_phrases && pair.shared_phrases.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700">
                        <span className="text-[10px] uppercase font-bold text-slate-500 block mb-1">
                          Common Technical Phrasing Detected:
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {pair.shared_phrases.map((phrase, i) => (
                            <span
                              key={i}
                              className="px-2 py-0.5 bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-200 rounded-md text-[11px] font-mono"
                            >
                              "{phrase}"
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
