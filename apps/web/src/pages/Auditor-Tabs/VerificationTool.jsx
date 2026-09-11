// apps/web/src/pages/Auditor-Tabs/VerificationTool.jsx
import { useState } from "react";

const HISTORY = [
  { ts: "Aug 28 09:22", range: "#1–#1,204,881",    result: "MATCH", dur: "8m 37s", by: "Dr. J. Santos" },
  { ts: "Aug 21 09:15", range: "#1–#1,198,044",    result: "MATCH", dur: "8m 29s", by: "Dr. J. Santos" },
  { ts: "Aug 14 09:08", range: "#1–#1,190,211",    result: "MATCH", dur: "8m 14s", by: "System Auto"    },
  { ts: "Aug 7 09:03",  range: "#1–#1,181,895",    result: "MATCH", dur: "8m 02s", by: "System Auto"    },
];

export default function VerificationTool() {
  const [from, setFrom] = useState("1");
  const [to, setTo]     = useState("1204881");
  const [running, setRunning] = useState(false);
  const [done, setDone]       = useState(false);
  const [logs, setLogs]       = useState([]);

  function handleRun() {
    setRunning(true);
    setDone(false);
    setLogs([]);

    // Fake live log messages
    const steps = [
      `→ Loading block range #${from}–#${to}...`,
      `→ Fetching stored hashes from chain...`,
      `→ Recomputing SHA-256 for each block...`,
      `→ Comparing Hₙ to stored Hₙ...`,
      `✓ Verification complete. 0 discrepancies detected.`,
    ];

    steps.forEach((step, i) => {
      setTimeout(() => {
        setLogs(prev => [...prev, step]);
      }, i * 500);
    });

    // Finish after all steps
    setTimeout(() => {
      setRunning(false);
      setDone(true);
    }, steps.length * 500 + 300);
  }

  const inputS = { padding: "10px 14px", borderRadius: "10px", fontSize: "13px", background: "#080810", border: "1px solid #1a1a2a", color: "#e2e8f0", outline: "none", fontFamily: "'JetBrains Mono',monospace" };
  const card   = { borderRadius: "12px", padding: "20px", marginBottom: "16px", background: "#0e0e18", border: "1px solid #1a1a2a" };
  const thS    = { textAlign: "left", paddingBottom: "8px", fontWeight: 500, color: "#4b5563", fontFamily: "'JetBrains Mono',monospace", fontSize: "9px", letterSpacing: "0.06em" };
  const tdS    = { padding: "10px 0", fontSize: "12px", borderTop: "1px solid #13131e" };

  return (
    <div>

      {/* Formula explainer */}
      <div style={card}>
        <div style={{ fontSize: "13px", fontWeight: 600, color: "#fff", marginBottom: "12px" }}>SHA-256 Hash-Chain Formula</div>
        <div style={{ padding: "16px", borderRadius: "10px", background: "#080810", border: "1px solid #13131e", fontFamily: "'JetBrains Mono',monospace", fontSize: "12px", color: "#22c55e", lineHeight: 2 }}>
          H₀ = SHA-256(<span style={{ color: "#a855f7" }}>genesis_seed</span>)<br />
          Hₙ = SHA-256(H<span style={{ fontSize: "9px" }}>n-1</span> + <span style={{ color: "#3b82f6" }}>block_data</span> + <span style={{ color: "#f59e0b" }}>timestamp</span>)
        </div>
        <p style={{ fontSize: "12px", marginTop: "12px", color: "#4b5563", lineHeight: 1.7 }}>
          Each block hash depends on the previous hash, making any tampering detectable. A recomputed hash that does not match the stored hash indicates a discrepancy.
        </p>
      </div>

      {/* Recompute form */}
      <div style={card}>
        <div style={{ fontSize: "13px", fontWeight: 600, color: "#fff", marginBottom: "4px" }}>On-Demand Recomputation</div>
        <div style={{ fontSize: "11px", color: "#4b5563", marginBottom: "20px" }}>Select a block range and trigger a manual verification run</div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: "12px" }}>
          <div>
            <div style={{ fontSize: "10px", marginBottom: "6px", color: "#6b7280", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.06em" }}>FROM BLOCK #</div>
            <input value={from} onChange={(e) => setFrom(e.target.value)} style={inputS} />
          </div>
          <div>
            <div style={{ fontSize: "10px", marginBottom: "6px", color: "#6b7280", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.06em" }}>TO BLOCK #</div>
            <input value={to} onChange={(e) => setTo(e.target.value)} style={inputS} />
          </div>
          <button onClick={handleRun} disabled={running}
            style={{ padding: "10px 24px", borderRadius: "10px", fontSize: "13px", fontWeight: 600, border: "none", cursor: running ? "not-allowed" : "pointer", background: running ? "#111118" : "#22c55e", color: running ? "#374151" : "#fff", display: "flex", alignItems: "center", gap: "8px" }}>
            {running && <span style={{ width: "14px", height: "14px", borderRadius: "50%", border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", animation: "spin 0.7s linear infinite", display: "inline-block" }} />}
            {running ? "Running…" : "Recompute"}
          </button>
        </div>

        {/* Live log output */}
        {logs.length > 0 && (
          <div style={{ marginTop: "16px", padding: "14px 16px", borderRadius: "10px", background: "#080810", border: "1px solid #13131e", fontFamily: "'JetBrains Mono',monospace", fontSize: "11px", color: "#9ca3af", lineHeight: 1.9 }}>
            {logs.map((log, i) => (
              <div key={i} style={{ color: log.startsWith("✓") ? "#22c55e" : "#9ca3af" }}>{log}</div>
            ))}
          </div>
        )}

        {done && (
          <div style={{ marginTop: "16px", padding: "14px 16px", borderRadius: "10px", background: "#061a0f", border: "1px solid #22c55e40", display: "flex", alignItems: "center", gap: "12px" }}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M3 9l4 4 8-8" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            <div>
              <div style={{ fontSize: "13px", fontWeight: 600, color: "#22c55e" }}>Hash chain verified — MATCH</div>
              <div style={{ fontSize: "11px", marginTop: "2px", color: "#4b5563" }}>Blocks #{from}–#{to} · 0 discrepancies detected</div>
            </div>
          </div>
        )}
      </div>

      {/* History */}
      <div style={card}>
        <div style={{ fontSize: "13px", fontWeight: 600, color: "#fff", marginBottom: "16px" }}>Verification History</div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>{["TIMESTAMP","BLOCK RANGE","RESULT","DURATION","TRIGGERED BY"].map((h) => <th key={h} style={thS}>{h}</th>)}</tr></thead>
          <tbody>
            {HISTORY.map((h) => (
              <tr key={h.ts}>
                <td style={{ ...tdS, color: "#4b5563", fontFamily: "'JetBrains Mono',monospace" }}>{h.ts}</td>
                <td style={{ ...tdS, color: "#fff", fontFamily: "'JetBrains Mono',monospace" }}>{h.range}</td>
                <td style={tdS}><span style={{ display: "flex", alignItems: "center", gap: "4px", color: "#22c55e", fontWeight: 600 }}><span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#22c55e", display: "inline-block" }} />{h.result}</span></td>
                <td style={{ ...tdS, color: "#6b7280", fontFamily: "'JetBrains Mono',monospace" }}>{h.dur}</td>
                <td style={{ ...tdS, color: "#9ca3af" }}>{h.by}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}