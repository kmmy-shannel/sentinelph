// apps/web/src/pages/SuperAdmin-Tabs/ChainIntegrity.jsx
//
// On-demand hash-chain verification tool for the SuperAdmin.
//
// Verified backend contract (services/api/routes/superadmin.js +
// services/api/services/chainVerifier.js + services/api/utils/hashChain.js):
//
//   GET  /api/v1/superadmin/chain/status
//     → { data: {
//          headBlock, headHash, totalBlocks,
//          lastNightlyRun: { status, started_at, finished_at,
//                            block_range, break_index } | null,
//          nextScheduled,
//        } }
//
//   POST /api/v1/superadmin/chain/verify   body: { range }
//     where range is 'entire' | { from: number, to: number }
//     → { data: {
//          status: 'pass' | 'fail',
//          breakIndex: number | null,
//          checked, fromBlock, toBlock,
//          durationMs, headHash,
//        } }

import React, { useState, useEffect, useCallback, useMemo } from "react";
import apiClient from "../../lib/api";

// ─── SuperAdmin accent (green) ────────────────────────────────────────
const A = "#22c55e";
const A_TINT = "rgba(34,197,94,0.08)";
const A_TINT_BORDER = "rgba(34,197,94,0.30)";

// ─── Shared style tokens ──────────────────────────────────────────────
const card = {
  background: "#0e0e18",
  border: "1px solid #1a1a2a",
  borderRadius: "12px",
  padding: "20px",
};

const label = {
  fontSize: "9px",
  fontWeight: 600,
  color: "#64748b",
  fontFamily: "'JetBrains Mono',monospace",
  letterSpacing: "0.08em",
  marginBottom: "6px",
  textTransform: "uppercase",
};

const inputS = {
  padding: "10px 14px",
  borderRadius: "10px",
  fontSize: "13px",
  background: "#080810",
  border: "1px solid #1a1a2a",
  color: "#e2e8f0",
  outline: "none",
  fontFamily: "'JetBrains Mono',monospace",
  boxSizing: "border-box",
  transition: "border-color 0.15s ease",
};

// ─── Reusable metadata cell ───────────────────────────────────────────
function MetaCell({ label: lbl, value, mono = true, accent = false }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={label}>{lbl}</div>
      <div
        style={{
          fontSize: "13px",
          color: accent ? A : "#e2e8f0",
          fontFamily: mono ? "'JetBrains Mono',monospace" : "inherit",
          fontWeight: accent ? 700 : 500,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={typeof value === "string" ? value : undefined}
      >
        {value}
      </div>
    </div>
  );
}

// ─── Formatting helpers ──────────────────────────────────────────────
function formatTimestamp(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatHashShort(hash) {
  if (!hash) return "—";
  const s = String(hash);
  if (s.length <= 20) return s;
  return `${s.slice(0, 10)}…${s.slice(-6)}`;
}

export default function ChainIntegrity() {
  const [mode, setMode] = useState("entire");
  const [from, setFrom] = useState("1");
  const [to, setTo] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

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

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  // ── Run verification ───────────────────────────────────────
  async function handleRun() {
    setRunning(true);
    setResult(null);
    setError(null);
    try {
      let range;

      if (mode === "entire") {
        range = "entire";
      } else {
        // Custom range — validate BEFORE sending. This prevents the
        // backend from receiving a `to: 0` payload (which triggered
        // the earlier "Missing predecessor block #-1" error).
        const fromNum = parseInt(from, 10);
        // If `to` is empty, fall back to the current chain head.
        const toNum = parseInt(to, 10) || status.headBlock;

        if (!Number.isFinite(fromNum) || fromNum < 1) {
          setError("'From Block #' must be a positive integer (>= 1).");
          setRunning(false);
          return;
        }
        if (!Number.isFinite(toNum) || toNum < 1) {
          setError(
            "'To Block #' must be a positive integer, or left empty to use the chain head."
          );
          setRunning(false);
          return;
        }
        if (fromNum > toNum) {
          setError(
            `'From Block #' (${fromNum}) cannot be greater than 'To Block #' (${toNum}).`
          );
          setRunning(false);
          return;
        }

        range = { from: fromNum, to: toNum };
      }

      const { data } = await apiClient.post(
        "/api/v1/superadmin/chain/verify",
        { range }
      );
      setResult(data.data);
      loadStatus();
    } catch (err) {
      console.error("[ChainIntegrity] verify failed:", err);
      setError(
        err?.response?.data?.message ||
          err?.response?.data?.error ||
          "Verification failed."
      );
    } finally {
      setRunning(false);
    }
  }

  // ── Derived state ──────────────────────────────────────────
  const isEmpty = !loadingStatus && status.totalBlocks === 0;
  const passed = result?.status === "pass";
  const failed = result?.status === "fail";

  const heroTone = useMemo(() => {
    if (failed) {
      return {
        bg: "#1a0606",
        border: "#ef444440",
        iconBg: "#3f1a1a",
        iconBorder: "#ef4444",
        iconColor: "#ef4444",
        title: "Hash-Chain: INTEGRITY BREAK",
        titleColor: "#ef4444",
        subtitle: `Recomputed hash mismatch at block #${result.breakIndex}. The ledger has been tampered with or corrupted.`,
      };
    }
    if (loadingStatus) {
      return {
        bg: "#0a0a15",
        border: "#1a1a2a",
        iconBg: "#111118",
        iconBorder: "#374151",
        iconColor: "#374151",
        title: "Loading chain status…",
        titleColor: "#4b5563",
        subtitle: "Fetching ledger state",
      };
    }
    if (isEmpty) {
      return {
        bg: "#0a0a15",
        border: "#1a1a2a",
        iconBg: "#111118",
        iconBorder: "#374151",
        iconColor: "#374151",
        title: "Chain is empty",
        titleColor: "#4b5563",
        subtitle:
          "No reports in the ledger yet — submit one to start the chain",
      };
    }
    return {
      bg: "#061a0f",
      border: A_TINT_BORDER,
      iconBg: "#14412a",
      iconBorder: A,
      iconColor: A,
      title: "Hash-Chain: VERIFIED",
      titleColor: A,
      subtitle: `${status.totalBlocks.toLocaleString()} block${
        status.totalBlocks === 1 ? "" : "s"
      } secured · tamper-evident ledger`,
    };
  }, [failed, loadingStatus, isEmpty, result, status.totalBlocks]);

  const heroIcon =
    heroTone.iconColor === A ? (
      <svg width="20" height="20" viewBox="0 0 18 18" fill="none">
        <path
          d="M3 9l4 4 8-8"
          stroke={A}
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ) : heroTone.iconColor === "#ef4444" ? (
      <svg width="20" height="20" viewBox="0 0 18 18" fill="none">
        <path
          d="M9 3v7M9 14v.01"
          stroke="#ef4444"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    ) : (
      <span style={{ color: heroTone.iconColor, fontSize: "18px" }}>—</span>
    );

  const chainStatusLabel = loadingStatus
    ? "—"
    : isEmpty
    ? "EMPTY"
    : status.lastNightlyRun?.status === "pass"
    ? "VERIFIED"
    : "UNVERIFIED";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* ─── Header strip ────────────────────────────────────────── */}
      <div
        style={{
          padding: "12px 16px",
          borderRadius: "10px",
          background: "#0a0a12",
          border: "1px solid #1a1a2a",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span
            style={{
              color: A,
              fontWeight: 700,
              fontFamily: "'JetBrains Mono',monospace",
              fontSize: "11px",
              letterSpacing: "0.08em",
            }}
          >
            LEDGER INTEGRITY
          </span>
          <span style={{ color: "#374151" }}>·</span>
          <span style={{ fontSize: "12px", color: "#94a3b8" }}>
            Read-only tamper-evidence verification of the report chain
          </span>
        </div>
      </div>

      {/* ─── Hero status ─────────────────────────────────────────── */}
      <div
        style={{
          padding: "24px",
          borderRadius: "12px",
          background: heroTone.bg,
          border: `1.5px solid ${heroTone.border}`,
          display: "flex",
          alignItems: "center",
          gap: "16px",
        }}
      >
        <div
          style={{
            width: "48px",
            height: "48px",
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: heroTone.iconBg,
            border: `2px solid ${heroTone.iconBorder}`,
            flexShrink: 0,
          }}
        >
          {heroIcon}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontWeight: 800,
              fontSize: "18px",
              color: heroTone.titleColor,
              lineHeight: 1.2,
              marginBottom: "4px",
            }}
          >
            {heroTone.title}
          </div>
          <div
            style={{
              fontSize: "12px",
              color: "#4b5563",
              lineHeight: 1.6,
            }}
          >
            {heroTone.subtitle}
          </div>
        </div>

        {!isEmpty && !loadingStatus && status.headHash && (
          <div
            style={{
              textAlign: "right",
              flexShrink: 0,
              fontFamily: "'JetBrains Mono',monospace",
            }}
          >
            <div
              style={{
                fontSize: "9px",
                fontWeight: 600,
                color: "#64748b",
                letterSpacing: "0.08em",
                marginBottom: "4px",
              }}
            >
              HEAD
            </div>
            <div style={{ fontSize: "13px", color: A, fontWeight: 700 }}>
              #{status.headBlock.toLocaleString()}
            </div>
            <div
              style={{
                fontSize: "10px",
                color: "#64748b",
                marginTop: "4px",
              }}
              title={status.headHash}
            >
              {formatHashShort(status.headHash)}
            </div>
          </div>
        )}
      </div>

      {/* ─── Ledger State card ───────────────────────────────────── */}
      <div style={card}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            marginBottom: "16px",
          }}
        >
          <div>
            <div style={{ fontSize: "13px", fontWeight: 600, color: "#fff" }}>
              Ledger State
            </div>
            <div
              style={{
                fontSize: "11px",
                color: "#4b5563",
                marginTop: "3px",
              }}
            >
              Current chain head and last verification record
            </div>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr 1fr",
            gap: "16px",
            paddingTop: "16px",
            borderTop: "1px solid #13131e",
          }}
        >
          <MetaCell
            label="Total Blocks"
            value={loadingStatus ? "—" : status.totalBlocks.toLocaleString()}
          />
          <MetaCell
            label="Head Block"
            value={loadingStatus || isEmpty ? "—" : `#${status.headBlock}`}
            accent={!isEmpty && !loadingStatus}
          />
          <MetaCell
            label="Last Verified"
            value={
              loadingStatus
                ? "—"
                : status.lastNightlyRun?.finished_at
                ? formatTimestamp(status.lastNightlyRun.finished_at)
                : "Never"
            }
          />
          <MetaCell
            label="Chain Status"
            value={chainStatusLabel}
            accent={chainStatusLabel === "VERIFIED"}
          />
        </div>
      </div>

      {/* ─── Recompute panel ─────────────────────────────────────── */}
      <div style={card}>
        <div style={{ marginBottom: "20px" }}>
          <div style={{ fontSize: "13px", fontWeight: 600, color: "#fff" }}>
            On-Demand Recomputation Engine
          </div>
          <div
            style={{
              fontSize: "11px",
              color: "#4b5563",
              marginTop: "3px",
              lineHeight: 1.6,
            }}
          >
            Independent of the nightly job. Re-traverses the ledger read-only
            and compares Hₙ at each step against the stored hash.
          </div>
        </div>

        <div
          style={{
            padding: "12px 16px",
            borderRadius: "10px",
            background: "#080810",
            border: "1px solid #13131e",
            fontFamily: "'JetBrains Mono',monospace",
            fontSize: "11px",
            lineHeight: 2,
            marginBottom: "20px",
          }}
        >
          <div>
            <span style={{ color: "#4b5563" }}>H₀ = SHA-256(</span>
            <span style={{ color: A }}>genesis_seed</span>
            <span style={{ color: "#4b5563" }}>)</span>
          </div>
          <div>
            <span style={{ color: "#4b5563" }}>Hₙ = SHA-256(</span>
            <span style={{ color: "#3b82f6" }}>Dataₙ</span>
            <span style={{ color: "#4b5563" }}> ‖ </span>
            <span style={{ color: A }}>Hₙ₋₁</span>
            <span style={{ color: "#4b5563" }}>)</span>
          </div>
        </div>

        <div style={{ marginBottom: "16px" }}>
          <div style={label}>Verification Range</div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {["entire", "custom"].map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                style={{
                  padding: "9px 18px",
                  borderRadius: "10px",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                  background: mode === m ? A_TINT : "transparent",
                  border: `1px solid ${
                    mode === m ? A_TINT_BORDER : "#1a1a2a"
                  }`,
                  color: mode === m ? A : "#64748b",
                  fontFamily: "'JetBrains Mono',monospace",
                  letterSpacing: "0.04em",
                  transition: "all 0.15s ease",
                }}
              >
                {m === "entire" ? "Entire Chain" : "Custom Range"}
              </button>
            ))}
          </div>
        </div>

        {mode === "custom" && (
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              gap: "12px",
              marginBottom: "16px",
              flexWrap: "wrap",
            }}
          >
            <div>
              <div style={label}>From Block #</div>
              <input
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                min="1"
                style={{ ...inputS, width: "140px" }}
                onFocus={(e) => (e.currentTarget.style.borderColor = A)}
                onBlur={(e) =>
                  (e.currentTarget.style.borderColor = "#1a1a2a")
                }
              />
            </div>
            <div>
              <div style={label}>To Block #</div>
              <input
                value={to}
                onChange={(e) => setTo(e.target.value)}
                min="1"
                placeholder={
                  status.headBlock ? String(status.headBlock) : "head"
                }
                style={{ ...inputS, width: "140px" }}
                onFocus={(e) => (e.currentTarget.style.borderColor = A)}
                onBlur={(e) =>
                  (e.currentTarget.style.borderColor = "#1a1a2a")
                }
              />
            </div>
          </div>
        )}

        <button
          onClick={handleRun}
          disabled={running || isEmpty}
          style={{
            padding: "12px 28px",
            borderRadius: "10px",
            fontSize: "13px",
            fontWeight: 600,
            border: "none",
            cursor: running || isEmpty ? "not-allowed" : "pointer",
            background: running || isEmpty ? "#111118" : A,
            color: running || isEmpty ? "#374151" : "#08200f",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            transition: "background 0.15s ease",
            fontFamily: "'JetBrains Mono',monospace",
            letterSpacing: "0.04em",
          }}
        >
          {running && (
            <span
              style={{
                width: "14px",
                height: "14px",
                borderRadius: "50%",
                border: "2px solid rgba(8,32,15,0.3)",
                borderTopColor: "#08200f",
                animation: "spin 0.7s linear infinite",
                display: "inline-block",
              }}
            />
          )}
          {running
            ? "Recomputing…"
            : isEmpty
            ? "Nothing to verify"
            : "Run Verification"}
        </button>

        {passed && (
          <div
            style={{
              marginTop: "16px",
              padding: "16px",
              borderRadius: "10px",
              background: "#061a0f",
              border: `1px solid ${A_TINT_BORDER}`,
              display: "flex",
              alignItems: "center",
              gap: "14px",
            }}
          >
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: A_TINT,
                border: `1.5px solid ${A}`,
                flexShrink: 0,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
                <path
                  d="M3 9l4 4 8-8"
                  stroke={A}
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: "13px",
                  fontWeight: 700,
                  color: A,
                  marginBottom: "4px",
                }}
              >
                Verification complete — PASS
              </div>
              <div
                style={{
                  fontSize: "11px",
                  color: "#64748b",
                  lineHeight: 1.6,
                  fontFamily: "'JetBrains Mono',monospace",
                }}
              >
                Blocks #{result.fromBlock}–#{result.toBlock} ·{" "}
                {result.checked.toLocaleString()} checked ·{" "}
                {result.durationMs} ms · 0 discrepancies
              </div>
            </div>
          </div>
        )}

        {failed && (
          <div
            style={{
              marginTop: "16px",
              padding: "16px",
              borderRadius: "10px",
              background: "#1a0606",
              border: "1px solid #ef444440",
              display: "flex",
              alignItems: "center",
              gap: "14px",
            }}
          >
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "#3f1a1a",
                border: "1.5px solid #ef4444",
                flexShrink: 0,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
                <path
                  d="M9 3v7M9 14v.01"
                  stroke="#ef4444"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: "13px",
                  fontWeight: 700,
                  color: "#ef4444",
                  marginBottom: "4px",
                }}
              >
                Verification FAILED — break at block #{result.breakIndex}
              </div>
              <div
                style={{
                  fontSize: "11px",
                  color: "#64748b",
                  lineHeight: 1.6,
                  fontFamily: "'JetBrains Mono',monospace",
                }}
              >
                Recomputed Hₙ does not match stored hash at block #
                {result.breakIndex}. The block or its predecessors may have
                been tampered with.
              </div>
            </div>
          </div>
        )}

        {error && (
          <div
            style={{
              marginTop: "16px",
              padding: "12px 16px",
              borderRadius: "10px",
              background: "#1a0606",
              border: "1px solid #ef444440",
              fontSize: "12px",
              color: "#ef4444",
            }}
          >
            {error}
          </div>
        )}
      </div>

      {/* ─── How Verification Works card ─────────────────────────── */}
      <div style={card}>
        <div style={{ fontSize: "13px", fontWeight: 600, color: "#fff" }}>
          How Verification Works
        </div>
        <div
          style={{
            fontSize: "11px",
            color: "#4b5563",
            marginTop: "3px",
            marginBottom: "16px",
          }}
        >
          The engine re-derives every hash in the requested range and compares
          it to the stored value. A single mismatch halts the walk and reports
          the break index.
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "14px",
          }}
        >
          {[
            {
              n: "1",
              t: "Seed",
              d: "The previous hash is loaded. For block 1, the genesis seed is used. For any other starting block, the predecessor's stored hash is fetched.",
            },
            {
              n: "2",
              t: "Recompute",
              d: "For each block in the range, Hₙ = SHA-256(canonicalize(Dataₙ) ‖ Hₙ₋₁) is recomputed from the canonical payload.",
            },
            {
              n: "3",
              t: "Compare",
              d: "The recomputed hash is compared against the stored value. The first mismatch halts the walk and is reported as the break index.",
            },
          ].map((step) => (
            <div
              key={step.n}
              style={{
                padding: "14px 16px",
                borderRadius: "10px",
                background: "#080810",
                border: "1px solid #13131e",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  marginBottom: "8px",
                }}
              >
                <span
                  style={{
                    width: "22px",
                    height: "22px",
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: A_TINT,
                    border: `1px solid ${A_TINT_BORDER}`,
                    color: A,
                    fontSize: "10px",
                    fontWeight: 700,
                    fontFamily: "'JetBrains Mono',monospace",
                  }}
                >
                  {step.n}
                </span>
                <span
                  style={{
                    fontSize: "12px",
                    fontWeight: 700,
                    color: "#e2e8f0",
                    fontFamily: "'JetBrains Mono',monospace",
                    letterSpacing: "0.04em",
                  }}
                >
                  {step.t}
                </span>
              </div>
              <div
                style={{
                  fontSize: "11px",
                  color: "#64748b",
                  lineHeight: 1.65,
                }}
              >
                {step.d}
              </div>
            </div>
          ))}
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}