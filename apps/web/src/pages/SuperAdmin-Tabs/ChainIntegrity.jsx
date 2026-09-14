// apps/web/src/pages/SuperAdmin-Tabs/ChainIntegrity.jsx
import React, { useState, useEffect, useCallback } from "react";
import apiClient from "../../lib/api";

const A = "#22c55e";
const card  = { background: "#0e0e18", border: "1px solid #1a1a2a", borderRadius: "12px", padding: "20px" };
const thS   = { textAlign: "left", paddingBottom: "8px", fontWeight: 500, color: "#4b5563", fontFamily: "'JetBrains Mono',monospace", fontSize: "9px", letterSpacing: "0.06em" };
const tdS   = { padding: "10px 0", fontSize: "12px", borderTop: "1px solid #13131e" };
const label = { fontSize: "9px", fontWeight: 500, color: "#4b5563", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.06em", marginBottom: "6px" };

export default function ChainIntegrity() {
  const [mode, setMode]         = useState("entire");
  const [from, setFrom]         = useState("1");
  const [to, setTo]             = useState("");
  const [running, setRunning]   = useState(false);
  const [result, setResult]     = useState(null);
  const [error, setError]       = useState(null);

  // Live chain head info
  const [status, setStatus] = useState({
    headBlock: 0,
    headHash: null,
    totalBlocks: 0,
    lastNightlyRun: null,
  });
  const [loadingStatus, setLoadingStatus] = useState(true);

  // ── Load chain status on mount ─────────────────────────────
  const loadStatus = useCallback(async () => {
    setLoadingStatus(true);
    try {
      const { data } = await apiClient.get("/api/v1/superadmin/chain/status");
      setStatus(data.data);
    } catch (err) {
      console.error("[ChainIntegrity] status fetch failed:", err);
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  // ── Run verification ───────────────────────────────────────
  async function handleRun() {
    setRunning(true);
    setResult(null);
    setError(null);
    try {
      const range =
        mode === "entire"
          ? "entire"
          : { from: parseInt(from, 10) || 1, to: parseInt(to, 10) || 0 };

      const { data } = await apiClient.post("/api/v1/superadmin/chain/verify", { range });
      setResult(data.data);
      // Refresh head info after verification
      loadStatus();
    } catch (err) {
      console.error("[ChainIntegrity] verify failed:", err);
      setError(err?.response?.data?.message || "Verification failed.");
    } finally {
      setRunning(false);
    }
  }

  const inputS = { padding: "10px 14px", borderRadius: "10px", fontSize: "13px", background: "#080810", border: "1px solid #1a1a2a", color: "#e2e8f0", outline: "none", fontFamily: "'JetBrains Mono',monospace" };

  const passed  = result?.status === "pass";
  const failed  = result?.status === "fail";
  const isEmpty = !loadingStatus && status.totalBlocks === 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

      {/* Status hero */}
      <div style={{ padding: "24px", borderRadius: "12px", background: isEmpty ? "#0a0a15" : "#061a0f", border: `1.5px solid ${isEmpty ? "#1a1a2a" : "#22c55e40"}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div style={{ width: "48px", height: "48px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: isEmpty ? "#111118" : "#14412a", border: `2px solid ${isEmpty ? "#374151" : "#22c55e"}`, flexShrink: 0 }}>
            {isEmpty ? (
              <span style={{ color: "#374151", fontSize: "20px" }}>—</span>
            ) : (
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none"><path d="M4 11l5 5 9-9" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            )}
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: "18px", color: isEmpty ? "#4b5563" : "#22c55e" }}>
              {loadingStatus ? "Loading chain status…" : isEmpty ? "Chain is empty" : "Hash-Chain Integrity: VERIFIED"}
            </div>
            <div style={{ fontSize: "12px", marginTop: "4px", color: "#4b5563" }}>
              {loadingStatus
                ? "—"
                : isEmpty
                ? "No reports in the ledger yet — submit one to start the chain."
                : `${status.totalBlocks.toLocaleString()} blocks · 0 discrepancies${
                    status.lastNightlyRun?.finished_at
                      ? ` · last run ${new Date(status.lastNightlyRun.finished_at).toLocaleString("en-PH")}`
                      : ""
                  }`}
            </div>
          </div>
        </div>
        <div style={{ textAlign: "right", fontSize: "11px", color: "#374151", fontFamily: "'JetBrains Mono',monospace" }}>
          <div>Head: #{status.headBlock.toLocaleString()}</div>
          <div style={{ marginTop: "4px", color: "#22c55e" }}>Hₙ = SHA-256(Dₙ ‖ Hₙ₋₁)</div>
        </div>
      </div>

      {/* Recompute form */}
      <div style={card}>
        <div style={{ fontSize: "13px", fontWeight: 600, color: "#fff", marginBottom: "4px" }}>On-Demand Recomputation Engine</div>
        <div style={{ fontSize: "11px", color: "#4b5563", marginBottom: "20px" }}>Independent of the nightly job — re-traverses the ledger read-only and compares Hₙ at each step</div>

        <div style={{ padding: "14px 16px", borderRadius: "10px", background: "#080810", border: "1px solid #13131e", fontFamily: "'JetBrains Mono',monospace", fontSize: "12px", lineHeight: 2, marginBottom: "20px" }}>
          <span style={{ color: "#4b5563" }}>H₀ = SHA-256(</span><span style={{ color: A }}>genesis_seed</span><span style={{ color: "#4b5563" }}>)</span><br />
          <span style={{ color: "#4b5563" }}>Hₙ = SHA-256(</span><span style={{ color: "#3b82f6" }}>Dataₙ</span><span style={{ color: "#4b5563" }}> ‖ </span><span style={{ color: "#22c55e" }}>Hₙ₋₁</span><span style={{ color: "#4b5563" }}>)</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
          {["entire","custom"].map(m => (
            <button key={m} onClick={() => setMode(m)}
              style={{ padding: "8px 16px", borderRadius: "8px", fontSize: "12px", fontWeight: 500, cursor: "pointer", background: mode === m ? A + "20" : "transparent", border: `1px solid ${mode === m ? A + "60" : "#1a1a2a"}`, color: mode === m ? A : "#4b5563" }}>
              {m === "entire" ? "Entire Chain" : "Custom Range"}
            </button>
          ))}
        </div>

        {mode === "custom" && (
          <div style={{ display: "flex", alignItems: "flex-end", gap: "12px", marginBottom: "16px" }}>
            <div>
              <div style={label}>FROM BLOCK #</div>
              <input value={from} onChange={e => setFrom(e.target.value)} style={inputS} />
            </div>
            <div>
              <div style={label}>TO BLOCK #</div>
              <input value={to} onChange={e => setTo(e.target.value)} placeholder={String(status.headBlock || "")} style={inputS} />
            </div>
          </div>
        )}

        <button onClick={handleRun} disabled={running || isEmpty}
          style={{ padding: "12px 28px", borderRadius: "10px", fontSize: "13px", fontWeight: 600, border: "none", cursor: running || isEmpty ? "not-allowed" : "pointer", background: running || isEmpty ? "#111118" : A, color: running || isEmpty ? "#374151" : "#fff", display: "flex", alignItems: "center", gap: "8px" }}>
          {running && <span style={{ width: "14px", height: "14px", borderRadius: "50%", border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", animation: "spin 0.7s linear infinite", display: "inline-block" }} />}
          {running ? "Recomputing…" : isEmpty ? "Nothing to verify" : "Run Verification"}
        </button>

        {passed && (
          <div style={{ marginTop: "16px", padding: "14px 16px", borderRadius: "10px", background: "#061a0f", border: "1px solid #22c55e40", display: "flex", alignItems: "center", gap: "12px" }}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M3 9l4 4 8-8" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            <div>
              <div style={{ fontSize: "13px", fontWeight: 600, color: "#22c55e" }}>Verification complete — PASS</div>
              <div style={{ fontSize: "11px", marginTop: "2px", color: "#4b5563" }}>
                Blocks #{result.fromBlock}–#{result.toBlock} · {result.checked.toLocaleString()} checked · {result.durationMs} ms · 0 discrepancies
              </div>
            </div>
          </div>
        )}

        {failed && (
          <div style={{ marginTop: "16px", padding: "14px 16px", borderRadius: "10px", background: "#1a0606", border: "1px solid #ef444440", display: "flex", alignItems: "center", gap: "12px" }}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M9 3v7M9 14v.01" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" /></svg>
            <div>
              <div style={{ fontSize: "13px", fontWeight: 600, color: "#ef4444" }}>Verification FAILED — break at block #{result.breakIndex}</div>
              <div style={{ fontSize: "11px", marginTop: "2px", color: "#4b5563" }}>
                Recomputed Hₙ does not match stored hash at block #{result.breakIndex}.
              </div>
            </div>
          </div>
        )}

        {error && (
          <div style={{ marginTop: "16px", padding: "12px 16px", borderRadius: "10px", background: "#1a0606", border: "1px solid #ef444440", fontSize: "12px", color: "#ef4444" }}>
            {error}
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}