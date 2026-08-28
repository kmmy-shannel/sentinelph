import React, { useState } from 'react';
import { X, CheckCircle2, XCircle, Hash, Clock, Phone, MapPin, Users } from 'lucide-react';
import { approveCase, rejectCase } from '../lib/api';

export default function CaseReviewModal({ caseItem, onClose, onDecision }) {
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState(null);

  if (!caseItem) return null;

  const approvalsCount = caseItem.approvals?.length || 0;
  const requiredApprovals = caseItem.requiredApprovals || 2;
  const consensusReached = approvalsCount >= requiredApprovals;

  const handleDecision = async (action) => {
    setSubmitting(true);
    setActionError(null);
    try {
      const updated =
        action === 'approve'
          ? await approveCase(caseItem._id, note)
          : await rejectCase(caseItem._id, note);
      onDecision(updated);
      onClose();
    } catch (error) {
      setActionError(
        error.response?.data?.message || `Failed to ${action} this case. Please try again.`
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden="true" />

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Case Review</h2>
            <p className="text-xs text-slate-400 mt-0.5">Case ID: {caseItem._id}</p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100"
          >
            <X size={20} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Consensus Status Widget */}
          <div
            className={`rounded-xl p-4 border ${
              consensusReached
                ? 'bg-emerald-50 border-emerald-200'
                : 'bg-amber-50 border-amber-200'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users size={18} className={consensusReached ? 'text-emerald-600' : 'text-amber-600'} />
                <span
                  className={`text-sm font-semibold ${
                    consensusReached ? 'text-emerald-800' : 'text-amber-800'
                  }`}
                >
                  Consensus: {approvalsCount} of {requiredApprovals} approvals
                </span>
              </div>
              <span
                className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                  consensusReached
                    ? 'bg-emerald-600 text-white'
                    : 'bg-amber-500 text-white'
                }`}
              >
                {consensusReached ? 'Consensus Reached' : 'Awaiting Review'}
              </span>
            </div>
            <div className="flex gap-1.5 mt-3">
              {Array.from({ length: requiredApprovals }).map((_, index) => (
                <div
                  key={index}
                  className={`h-1.5 flex-1 rounded-full ${
                    index < approvalsCount
                      ? consensusReached
                        ? 'bg-emerald-500'
                        : 'bg-amber-500'
                      : 'bg-slate-200'
                  }`}
                />
              ))}
            </div>
            {caseItem.approvals?.length > 0 && (
              <p className="text-xs text-slate-500 mt-2">
                Reviewed by:{' '}
                {caseItem.approvals.map((approval) => approval.officerName).join(', ')}
              </p>
            )}
          </div>

          {/* Case Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <DetailRow icon={Phone} label="Reported Number" value={caseItem.reportedNumber} />
            <DetailRow
              icon={Clock}
              label="Submitted"
              value={new Date(caseItem.createdAt).toLocaleString()}
            />
            <DetailRow
              icon={MapPin}
              label="Location"
              value={caseItem.locationLabel || 'Not provided'}
            />
            <DetailRow
              icon={Hash}
              label="Block Hash"
              value={caseItem.hash ? `${caseItem.hash.slice(0, 16)}…` : 'N/A'}
              mono
            />
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase mb-1.5">Description</p>
            <p className="text-sm text-slate-700 bg-slate-50 border border-slate-100 rounded-xl p-4 leading-6">
              {caseItem.description || 'No description provided.'}
            </p>
          </div>

          {caseItem.evidence?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase mb-2">
                Evidence ({caseItem.evidence.length})
              </p>
              <div className="flex gap-2 flex-wrap">
                {caseItem.evidence.map((item, index) => (
                  <a
                    key={item.url || index}
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-16 h-16 rounded-lg overflow-hidden border border-slate-200 block"
                  >
                    <img
                      src={item.url}
                      alt={`Evidence ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </a>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase mb-1.5 block">
              Reviewer Note (optional)
            </label>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={3}
              placeholder="Add context for this decision..."
              className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {actionError && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">
              {actionError}
            </div>
          )}
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-slate-100 sticky bottom-0 bg-white">
          <button
            onClick={() => handleDecision('reject')}
            disabled={submitting}
            className="flex-1 flex items-center justify-center gap-2 border border-red-200 text-red-600 font-semibold text-sm py-3 rounded-xl hover:bg-red-50 transition-colors disabled:opacity-50"
          >
            <XCircle size={17} />
            Reject
          </button>
          <button
            onClick={() => handleDecision('approve')}
            disabled={submitting}
            className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 text-white font-semibold text-sm py-3 rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-50"
          >
            <CheckCircle2 size={17} />
            {submitting ? 'Submitting...' : 'Approve'}
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ icon: Icon, label, value, mono }) {
  return (
    <div className="flex items-start gap-2.5 bg-slate-50 border border-slate-100 rounded-xl px-3.5 py-3">
      <Icon size={16} className="text-slate-400 mt-0.5 flex-shrink-0" />
      <div className="min-w-0">
        <p className="text-[11px] text-slate-400 font-medium uppercase">{label}</p>
        <p className={`text-sm text-slate-800 truncate ${mono ? 'font-mono text-xs' : ''}`}>
          {value}
        </p>
      </div>
    </div>
  );
}