import React, { useCallback, useEffect, useState } from 'react';
import { ClipboardList, Users, CheckCircle2, RefreshCw, AlertCircle } from 'lucide-react';
import { fetchCases } from '../lib/api';
import CaseReviewModal from "../components/CaseReviewModal";

export default function OfficerDashboard() {
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedCase, setSelectedCase] = useState(null);
  const [filter, setFilter] = useState('pending');

  const loadCases = useCallback(async (status) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchCases({ status });
      setCases(Array.isArray(data) ? data : data.cases || []);
    } catch (fetchError) {
      setError('Unable to load cases. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCases(filter);
  }, [filter, loadCases]);

  const handleDecisionApplied = (updatedCase) => {
    setCases((prev) =>
      prev
        .map((item) => (item._id === updatedCase._id ? updatedCase : item))
        .filter((item) => item.status === filter || filter === 'all')
    );
  };

  const pendingCount = cases.filter((c) => c.status === 'pending').length;
  const awaitingConsensus = cases.filter(
    (c) => (c.approvals?.length || 0) > 0 && (c.approvals?.length || 0) < (c.requiredApprovals || 2)
  ).length;
  const readyForFinalReview = cases.filter(
    (c) => (c.approvals?.length || 0) >= (c.requiredApprovals || 2) - 1 && c.status === 'pending'
  ).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Case Review</h2>
          <p className="text-slate-500 text-sm mt-1">
            Review flagged reports and cast your approval vote.
          </p>
        </div>
        <button
          onClick={() => loadCases(filter)}
          className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
        >
          <RefreshCw size={15} />
          Refresh
        </button>
      </div>

      {/* Pending Review Counter + Consensus Widgets */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard
          icon={ClipboardList}
          label="Pending Review"
          value={pendingCount}
          accent="bg-blue-600"
        />
        <StatCard
          icon={Users}
          label="Awaiting 2nd Approval"
          value={awaitingConsensus}
          accent="bg-amber-500"
        />
        <StatCard
          icon={CheckCircle2}
          label="Ready to Finalize"
          value={readyForFinalReview}
          accent="bg-emerald-600"
        />
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-4">
        {['pending', 'approved', 'rejected', 'all'].map((status) => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold capitalize transition-colors ${
              filter === status
                ? 'bg-blue-900 text-white'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            {status}
          </button>
        ))}
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600 mb-4">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* Cases List */}
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-slate-400 text-sm">Loading cases...</div>
        ) : cases.length === 0 ? (
          <div className="p-10 text-center text-slate-400 text-sm">
            No {filter !== 'all' ? filter : ''} cases found.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-slate-400 text-xs uppercase">
                <th className="px-5 py-3 font-semibold">Number</th>
                <th className="px-5 py-3 font-semibold">Location</th>
                <th className="px-5 py-3 font-semibold">Submitted</th>
                <th className="px-5 py-3 font-semibold">Consensus</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {cases.map((item) => {
                const approvals = item.approvals?.length || 0;
                const required = item.requiredApprovals || 2;
                return (
                  <tr
                    key={item._id}
                    className="border-b border-slate-50 last:border-0 hover:bg-slate-50 cursor-pointer"
                    onClick={() => setSelectedCase(item)}
                  >
                    <td className="px-5 py-4 font-medium text-slate-800">
                      {item.reportedNumber}
                    </td>
                    <td className="px-5 py-4 text-slate-500">
                      {item.locationLabel || '—'}
                    </td>
                    <td className="px-5 py-4 text-slate-500">
                      {new Date(item.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-xs font-semibold text-slate-600">
                        {approvals}/{required}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge status={item.status} />
                    </td>
                    <td className="px-5 py-4 text-right">
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedCase(item);
                        }}
                        className="text-blue-700 font-semibold text-xs hover:underline"
                      >
                        Review
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {selectedCase && (
        <CaseReviewModal
          caseItem={selectedCase}
          onClose={() => setSelectedCase(null)}
          onDecision={handleDecisionApplied}
        />
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, accent }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-5 flex items-center gap-4">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${accent}`}>
        <Icon size={20} className="text-white" />
      </div>
      <div>
        <p className="text-2xl font-bold text-slate-900">{value}</p>
        <p className="text-xs text-slate-400 font-medium">{label}</p>
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const styles = {
    pending: 'bg-amber-100 text-amber-700',
    approved: 'bg-emerald-100 text-emerald-700',
    rejected: 'bg-red-100 text-red-700',
  };
  return (
    <span
      className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${
        styles[status] || 'bg-slate-100 text-slate-600'
      }`}
    >
      {status}
    </span>
  );
}