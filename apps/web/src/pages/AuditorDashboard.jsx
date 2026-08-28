import React, { useCallback, useEffect, useState } from 'react';
import {
  ScrollText,
  ShieldCheck,
  ShieldAlert,
  RefreshCw,
  Hash,
  Search,
  Loader2,
} from 'lucide-react';
import { fetchAuditLog, verifyAuditChain } from '../lib/api';

export default function AuditorDashboard() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [verification, setVerification] = useState(null);
  const [verifying, setVerifying] = useState(false);

  const loadAuditLog = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAuditLog({ limit: 100 });
      setEntries(Array.isArray(data) ? data : data.entries || []);
    } catch (fetchError) {
      setError('Unable to load the audit log. Please check your connection.');
    } finally {
      setLoading(false);
    }
  }, []);

  const runVerification = useCallback(async () => {
    setVerifying(true);
    try {
      const result = await verifyAuditChain();
      setVerification(result);
    } catch (verifyError) {
      setVerification({
        valid: false,
        message: 'Verification request failed. Chain integrity could not be confirmed.',
      });
    } finally {
      setVerifying(false);
    }
  }, []);

  useEffect(() => {
    loadAuditLog();
    runVerification();
  }, [loadAuditLog, runVerification]);

  const filteredEntries = entries.filter((entry) => {
    if (!search.trim()) return true;
    const query = search.toLowerCase();
    return (
      entry.action?.toLowerCase().includes(query) ||
      entry.actorName?.toLowerCase().includes(query) ||
      entry.targetId?.toLowerCase().includes(query) ||
      entry.hash?.toLowerCase().includes(query)
    );
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Audit Log</h2>
          <p className="text-slate-500 text-sm mt-1">
            Append-only record of every action, chained by cryptographic hash.
          </p>
        </div>
        <button
          onClick={() => {
            loadAuditLog();
            runVerification();
          }}
          className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
        >
          <RefreshCw size={15} />
          Refresh
        </button>
      </div>

      {/* Hash Chain Integrity Widget */}
      <div
        className={`rounded-2xl p-5 mb-6 border flex items-center justify-between flex-wrap gap-3 ${
          verifying
            ? 'bg-slate-50 border-slate-200'
            : verification?.valid
              ? 'bg-emerald-50 border-emerald-200'
              : 'bg-red-50 border-red-200'
        }`}
      >
        <div className="flex items-center gap-3">
          {verifying ? (
            <Loader2 size={22} className="text-slate-400 animate-spin" />
          ) : verification?.valid ? (
            <ShieldCheck size={22} className="text-emerald-600" />
          ) : (
            <ShieldAlert size={22} className="text-red-600" />
          )}
          <div>
            <p
              className={`font-bold text-sm ${
                verifying
                  ? 'text-slate-600'
                  : verification?.valid
                    ? 'text-emerald-800'
                    : 'text-red-800'
              }`}
            >
              {verifying
                ? 'Verifying hash chain integrity...'
                : verification?.valid
                  ? 'Hash Chain Verified — No Tampering Detected'
                  : 'Hash Chain Integrity Compromised'}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              {verification?.message ||
                (verification?.valid
                  ? `Verified ${verification?.entriesChecked ?? entries.length} entries against their previous-hash links.`
                  : 'Recompute or investigate the affected block immediately.')}
            </p>
          </div>
        </div>
        {verification?.brokenAtIndex !== undefined && verification?.brokenAtIndex !== null && (
          <span className="bg-red-600 text-white text-xs font-bold px-3 py-1.5 rounded-full">
            Break detected at entry #{verification.brokenAtIndex}
          </span>
        )}
      </div>

      {/* Search */}
      <div className="flex items-center bg-white border border-slate-200 rounded-xl px-4 mb-4">
        <Search size={16} className="text-slate-400" />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by action, actor, target ID, or hash..."
          className="flex-1 py-3 ml-2 text-sm text-slate-800 focus:outline-none"
        />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600 mb-4">
          {error}
        </div>
      )}

      {/* Log Table */}
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-slate-400 text-sm">Loading audit log...</div>
        ) : filteredEntries.length === 0 ? (
          <div className="p-10 text-center text-slate-400 text-sm">
            No audit entries match your search.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-slate-400 text-xs uppercase">
                  <th className="px-5 py-3 font-semibold">Timestamp</th>
                  <th className="px-5 py-3 font-semibold">Actor</th>
                  <th className="px-5 py-3 font-semibold">Action</th>
                  <th className="px-5 py-3 font-semibold">Target</th>
                  <th className="px-5 py-3 font-semibold">Hash</th>
                  <th className="px-5 py-3 font-semibold">Prev Hash</th>
                  <th className="px-5 py-3 font-semibold">Integrity</th>
                </tr>
              </thead>
              <tbody>
                {filteredEntries.map((entry) => (
                  <tr
                    key={entry._id || entry.hash}
                    className="border-b border-slate-50 last:border-0 hover:bg-slate-50"
                  >
                    <td className="px-5 py-3.5 text-slate-500 whitespace-nowrap">
                      {new Date(entry.timestamp || entry.createdAt).toLocaleString()}
                    </td>
                    <td className="px-5 py-3.5 text-slate-800 font-medium whitespace-nowrap">
                      {entry.actorName || entry.actorId}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="bg-slate-100 text-slate-700 text-xs font-semibold px-2.5 py-1 rounded-full">
                        {entry.action}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-slate-500 font-mono text-xs">
                      {entry.targetId || '—'}
                    </td>
                    <td className="px-5 py-3.5 text-slate-500 font-mono text-xs">
                      <div className="flex items-center gap-1.5">
                        <Hash size={12} className="text-slate-300" />
                        {entry.hash ? `${entry.hash.slice(0, 12)}…` : '—'}
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-slate-400 font-mono text-xs">
                      {entry.previousHash ? `${entry.previousHash.slice(0, 12)}…` : 'genesis'}
                    </td>
                    <td className="px-5 py-3.5">
                      {entry.integrityValid === false ? (
                        <span className="flex items-center gap-1 text-red-600 text-xs font-semibold">
                          <ShieldAlert size={13} />
                          Broken
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-emerald-600 text-xs font-semibold">
                          <ShieldCheck size={13} />
                          Intact
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 mt-4 text-xs text-slate-400">
        <ScrollText size={13} />
        Showing {filteredEntries.length} of {entries.length} loaded entries. This log is
        append-only; entries cannot be edited or deleted.
      </div>
    </div>
  );
}