// apps/web/src/pages/Analyst-Tabs/AnalystDashboard.jsx
import { useCallback, useEffect, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from 'recharts';
import apiClient from '../../lib/api';

const card = { background: '#0e0e18', border: '1px solid #1a1a2a', borderRadius: '12px', padding: '20px' };
const thS = { textAlign: 'left', paddingBottom: '8px', fontWeight: 500, color: '#4b5563', fontFamily: "'JetBrains Mono',monospace", fontSize: '9px', letterSpacing: '0.06em' };
const tdS = { padding: '8px 0', fontSize: '12px', borderTop: '1px solid #13131e' };

export default function AdminDashboard() {
  const [dashboard, setDashboard] = useState(null);
  const [error, setError] = useState('');
  const loadDashboard = useCallback(async () => {
    try {
      setError('');
      const { data } = await apiClient.get('/api/v1/admin/dashboard');
      setDashboard(data?.data || null);
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to load dashboard data.');
    }
  }, []);
  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  const patterns = (dashboard?.patterns || []).map((pattern, index) => ({ n: index + 1, pattern: pattern.category, category: pattern.category, reports: pattern.reports, wow: '—' }));
  const flagged = (dashboard?.flagged || []).map((item) => ({ id: item.id, number: item.number, label: item.label, conf: item.confidence == null ? '—' : `${(item.confidence * 100).toFixed(1)}%`, confC: item.confidence >= .85 ? '#22c55e' : item.confidence >= .65 ? '#f59e0b' : '#ef4444', status: 'Pending' }));
  const trendData = dashboard?.trend || [];
  const heatmapData = (dashboard?.heatmap || []).map((item) => ({ region: item.region, v: item.reports }));
  const kpis = dashboard ? [
    { l: 'TOTAL REPORTS (AUG)', v: dashboard.kpis.totalReports.toLocaleString(), sc: '#22c55e', sub: 'Live agency-scoped total' },
    { l: 'AI MODEL ACCURACY', v: dashboard.kpis.aiModelAccuracy == null ? '—' : `${(dashboard.kpis.aiModelAccuracy * 100).toFixed(1)}%`, sc: '#22c55e', sub: dashboard.kpis.aiModelAccuracy == null ? 'No reviewed ground-truth data yet' : 'Based on saved admin reviews' },
    { l: 'FLAGGED FOR REVIEW', v: dashboard.kpis.flaggedForReview.toLocaleString(), sc: '#f59e0b', sub: 'AI-flagged · awaiting classification' },
    { l: 'SCAM TYPES TRACKED', v: dashboard.kpis.scamTypesTracked.toLocaleString(), sc: '#a855f7', sub: 'Active categories · all channels' },
  ] : [];

  return <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
    {error && <div style={{ ...card, borderColor: '#ef444466', color: '#fca5a5', fontSize: '12px' }}>{error}</div>}
    {!dashboard && !error && <div style={{ ...card, color: '#4b5563', fontSize: '12px' }}>Loading live agency data…</div>}
    {dashboard && <>
      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '16px' }}>
        {kpis.map((s) => <div key={s.l} style={card}><div style={{ fontSize: '10px', marginBottom: '8px', color: '#6b7280', fontFamily: "'JetBrains Mono',monospace", letterSpacing: '0.07em' }}>{s.l}</div><div style={{ fontSize: '30px', fontWeight: 800, color: '#fff', marginBottom: '4px', fontFamily: "'JetBrains Mono',monospace" }}>{s.v}</div><div style={{ fontSize: '11px', color: s.sc }}>{s.sub}</div></div>)}
      </div>

      {/* Charts Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: '16px' }}>
        <div style={card}><div style={{ fontSize: '13px', fontWeight: 600, color: '#fff', marginBottom: '4px' }}>7-Day Report Trend</div><div style={{ fontSize: '11px', color: '#4b5563', marginBottom: '16px' }}>Daily incoming reports, your jurisdiction</div><ResponsiveContainer width="100%" height={180}><AreaChart data={trendData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}><defs><linearGradient id="smsGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/><stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/></linearGradient><linearGradient id="callGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#a855f7" stopOpacity={0.3}/><stop offset="95%" stopColor="#a855f7" stopOpacity={0}/></linearGradient></defs><XAxis dataKey="day" tick={{ fill: '#4b5563', fontSize: 10 }} axisLine={false} tickLine={false}/><YAxis tick={{ fill: '#4b5563', fontSize: 10 }} axisLine={false} tickLine={false}/><Tooltip contentStyle={{ background: '#111120', border: '1px solid #1a1a2a', borderRadius: '8px', color: '#e2e8f0', fontSize: 12 }}/><Area type="monotone" dataKey="sms" name="Reports" stroke="#3b82f6" strokeWidth={2} fill="url(#smsGrad)"/><Area type="monotone" dataKey="calls" name="Calls" stroke="#a855f7" strokeWidth={2} fill="url(#callGrad)"/></AreaChart></ResponsiveContainer></div>
        <div style={card}><div style={{ fontSize: '13px', fontWeight: 600, color: '#fff', marginBottom: '4px' }}>Regional Heatmap</div><div style={{ fontSize: '11px', color: '#4b5563', marginBottom: '16px' }}>Cumulative reports in your scope</div><ResponsiveContainer width="100%" height={180}><BarChart data={heatmapData} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}><XAxis type="number" tick={{ fill: '#4b5563', fontSize: 10 }} axisLine={false} tickLine={false}/><YAxis dataKey="region" type="category" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} width={80}/><Tooltip contentStyle={{ background: '#111120', border: '1px solid #1a1a2a', borderRadius: '8px', color: '#e2e8f0', fontSize: 12 }}/><Bar dataKey="v" radius={[0, 4, 4, 0]}>{heatmapData.map((_, i) => <Cell key={i} fill={`rgba(168,85,247,${0.9 - i * 0.15})`}/>)}</Bar></BarChart></ResponsiveContainer></div>
      </div>

      {/* Patterns + status */}
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: '16px' }}>
        <div style={card}><div style={{ fontSize: '13px', fontWeight: 600, color: '#fff', marginBottom: '4px' }}>Top Scam Patterns</div><div style={{ fontSize: '11px', color: '#4b5563', marginBottom: '16px' }}>Ranked by report frequency, your agency scope</div><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr>{['#', 'PATTERN', 'CATEGORY', 'REPORTS', 'WOW'].map((h) => <th key={h} style={thS}>{h}</th>)}</tr></thead><tbody>{patterns.length === 0 ? <tr><td colSpan="5" style={{ ...tdS, color: '#4b5563', textAlign: 'center' }}>No report data yet.</td></tr> : patterns.map((p) => <tr key={p.n}><td style={{ ...tdS, color: '#374151' }}>{p.n}</td><td style={{ ...tdS, fontWeight: 500, color: '#fff' }}>{p.pattern}</td><td style={{ ...tdS, color: '#a855f7' }}>{p.category}</td><td style={{ ...tdS, fontWeight: 700, color: '#fff', fontFamily: "'JetBrains Mono',monospace" }}>{p.reports.toLocaleString()}</td><td style={{ ...tdS, fontWeight: 600, color: '#6b7280', fontFamily: "'JetBrains Mono',monospace" }}>{p.wow}</td></tr>)}</tbody></table></div>
        <div style={card}><div style={{ fontSize: '13px', fontWeight: 600, color: '#fff', marginBottom: '4px' }}>AI Detector Accuracy</div><div style={{ fontSize: '11px', color: '#4b5563', marginBottom: '16px' }}>Target: ≥85% · Rolling 7-day</div><div style={{ textAlign: 'center', marginBottom: '20px' }}><div style={{ fontSize: '40px', fontWeight: 800, color: '#fff', fontFamily: "'JetBrains Mono',monospace" }}>{dashboard.modelMetrics?.accuracy == null ? '—' : `${(dashboard.modelMetrics.accuracy * 100).toFixed(1)}%`}</div><span style={{ display: 'inline-block', marginTop: '8px', padding: '4px 12px', borderRadius: '999px', fontSize: '11px', fontWeight: 600, background: dashboard.modelMetrics?.accuracy == null ? '#3c2a0c' : dashboard.modelMetrics.accuracy >= .85 ? '#14412a' : '#3c2a0c', color: dashboard.modelMetrics?.accuracy == null ? '#f59e0b' : dashboard.modelMetrics.accuracy >= .85 ? '#22c55e' : '#f59e0b' }}>{dashboard.modelMetrics?.accuracy == null ? '● AWAITING HUMAN REVIEWS' : dashboard.modelMetrics.accuracy >= .85 ? '● ON TARGET' : '● BELOW TARGET'}</span></div>{[{ l: 'Precision', v: dashboard.modelMetrics?.precision, c: '#3b82f6' }, { l: 'Recall', v: dashboard.modelMetrics?.recall, c: '#22c55e' }, { l: 'F1 Score', v: dashboard.modelMetrics?.f1, c: '#f59e0b' }].map((m) => <div key={m.l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '8px' }}><span style={{ color: '#6b7280' }}>{m.l}</span><span style={{ fontWeight: 600, color: m.c, fontFamily: "'JetBrains Mono',monospace" }}>{m.v == null ? '—' : `${(m.v * 100).toFixed(1)}%`}</span></div>)}</div>
      </div>

      {/* Flagged items */}
      <div style={card}><div style={{ fontSize: '13px', fontWeight: 600, color: '#fff', marginBottom: '4px' }}>AI-Flagged — Awaiting Human Classification</div><div style={{ fontSize: '11px', color: '#4b5563', marginBottom: '16px' }}>Reports the model could not confidently classify</div><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr>{['FLAG ID', 'NUMBER', 'AI LABEL', 'CONFIDENCE', 'STATUS'].map((h) => <th key={h} style={thS}>{h}</th>)}</tr></thead><tbody>{flagged.length === 0 ? <tr><td colSpan="5" style={{ ...tdS, color: '#4b5563', textAlign: 'center' }}>No pending AI classifications.</td></tr> : flagged.map((f) => <tr key={f.id}><td style={{ ...tdS, color: '#a855f7', fontFamily: "'JetBrains Mono',monospace" }}>{f.id}</td><td style={{ ...tdS, color: '#fff', fontFamily: "'JetBrains Mono',monospace" }}>{f.number}</td><td style={{ ...tdS, color: '#9ca3af' }}>{f.label}</td><td style={{ ...tdS, fontWeight: 600, color: f.confC, fontFamily: "'JetBrains Mono',monospace" }}>{f.conf}</td><td style={tdS}><span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#f59e0b' }}><span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#f59e0b', display: 'inline-block' }}/>Pending</span></td></tr>)}</tbody></table></div>
    </>}
  </div>;
}
