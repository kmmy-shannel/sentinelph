// src/pages/Officer-Tabs/Account.jsx
import { useState } from "react";
import { ShieldCheck, KeyRound, UserCircle } from 'lucide-react';

export default function Account({ user }) {
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw]         = useState("");
  const [confirmPw, setConfirmPw] = useState("");

  const fields = [
    { l: "BADGE / ID",             v: user?.badge ?? "NBI-CCRU-0041" },
    { l: "ORGANIZATION",           v: "NBI Cybercrime Research Unit" },
    { l: "ASSIGNED JURISDICTION",  v: "NCR" },
    { l: "ROLE",                   v: "Cybercrime Officer" },
    { l: "ACCOUNT STATUS",         v: "Active — MFA Verified" },
    { l: "LAST LOGIN",             v: "Aug 28 09:05 PST" },
  ];

  const card = { borderRadius: "12px", padding: "24px", marginBottom: "20px", background: "#0e0e18", border: "1px solid #1a1a2a" };
  const label = { fontSize: "9px", fontWeight: 500, marginBottom: "4px", color: "#4b5563", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.06em" };
  const inputS = { width: "100%", padding: "10px 14px", borderRadius: "10px", fontSize: "13px", background: "#080810", border: "1px solid #1a1a2a", color: "#e2e8f0", outline: "none", boxSizing: "border-box" };

  return (
    <div style={{ maxWidth: "640px" }}>

      {/* Profile */}
      <div style={card}>
        <div style={{ ...label, marginBottom: "20px", display: "flex", alignItems: "center", gap: "8px" }}>
          <UserCircle size={14} color="#4b5563" /> PROFILE
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "24px" }}>
          <div style={{ width: "48px", height: "48px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", fontWeight: 700, flexShrink: 0, background: "#1e3a5f", color: "#60a5fa", border: "1.5px solid #3b82f640" }}>
            {user?.initials ?? "RC"}
          </div>
          <div>
            <div style={{ fontWeight: 700, color: "#fff" }}>{user?.name ?? "Insp. R. Cruz"}</div>
            <div style={{ fontSize: "12px", marginTop: "2px", color: "#4b5563", fontFamily: "'JetBrains Mono',monospace" }}>{user?.email ?? "r.cruz@nbi-ccru.gov.ph"}</div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px 32px" }}>
          {fields.map((f) => (
            <div key={f.l}>
              <div style={label}>{f.l}</div>
              <div style={{ fontSize: "13px", color: "#fff" }}>{f.v}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: "16px", padding: "10px 14px", borderRadius: "8px", fontSize: "12px", background: "#080810", border: "1px solid #13131e", color: "#374151" }}>
          Jurisdiction is assigned by system administrators. Contact your NBI supervisor to request a change.
        </div>
      </div>

      {/* MFA */}
      <div style={card}>
        <div style={{ ...label, marginBottom: "20px", display: "flex", alignItems: "center", gap: "8px" }}>
          <ShieldCheck size={14} color="#4b5563" /> MULTI-FACTOR AUTHENTICATION
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
          <div>
            <div style={{ fontWeight: 600, color: "#fff", fontSize: "14px" }}>Authenticator App (TOTP)</div>
            <div style={{ fontSize: "12px", marginTop: "4px", color: "#4b5563" }}>MFA is active. Your account requires a TOTP code on each login.</div>
          </div>
          <div style={{ width: "40px", height: "24px", borderRadius: "999px", background: "#22c55e", display: "flex", alignItems: "center", padding: "0 2px", flexShrink: 0 }}>
            <div style={{ width: "20px", height: "20px", borderRadius: "50%", background: "#fff", marginLeft: "auto" }} />
          </div>
        </div>
        <div style={{ padding: "10px 14px", borderRadius: "8px", fontSize: "12px", background: "#0a1a12", border: "1px solid #22c55e30", color: "#22c55e" }}>
          ✓ MFA active — TOTP seed last rotated Aug 15, 2026
        </div>
      </div>

      {/* Change password */}
      <div style={card}>
        <div style={{ ...label, marginBottom: "20px", display: "flex", alignItems: "center", gap: "8px" }}>
          <KeyRound size={14} color="#4b5563" /> CHANGE PASSWORD
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {[
            { l: "Current Password",    v: currentPw, set: setCurrentPw },
            { l: "New Password",        v: newPw,     set: setNewPw },
            { l: "Confirm New Password",v: confirmPw, set: setConfirmPw },
          ].map((f) => (
            <div key={f.l}>
              <div style={label}>{f.l.toUpperCase()}</div>
              <input type="password" value={f.v} onChange={(e) => f.set(e.target.value)} style={inputS} />
            </div>
          ))}
          <button style={{ alignSelf: "flex-start", padding: "10px 20px", borderRadius: "10px", fontSize: "12px", fontWeight: 600, background: "#3b82f6", color: "#fff", border: "none", cursor: "pointer", marginTop: "4px" }}>
            Update Password
          </button>
        </div>
      </div>

    </div>
  );
}