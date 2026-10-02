// apps/web/src/pages/Analyst-Tabs/AIModelInsights.jsx
import { useCallback, useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import apiClient from '../../lib/api';

const CATEGORIES = ['OTP Phishing', 'Bank Impersonation', 'Parcel/Delivery', 'Investment Scam', "Gov't Impersonation", 'Unknown'];
const card = { background: '#0e0e18', border: '1px solid #1a1a2a', borderRadius: '12px', padding: '20px' };
const thS = { textAlign: 'left', paddingBottom: '8px', fontWeight: 500, color: '#4b5563', fontFamily: "'JetBrains Mono',monospace", fontSize: '9px', letterSpacing: '0.06em' };
const tdS = { padding: '10px 0', fontSize: '12px', borderTop: '1px solid #13131e' };

export default function AIModelInsights() {
  const [insights, setInsights] = useState(null);
  const [classifyModal, setClassifyModal] = useState(null);
  const [selectedLabel, setSelectedLabel] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const loadInsights = useCallback(async () => {
    try { setError(''); const response = await apiClient.get('/api/v1/admin/ai-insights'); setInsights(response.data?.data || null); }
    catch (err) { setError(err.response?.data?.message || 'Could not load AI insights.'); }
  }, []);
  useEffect(() => { loadInsights(); }, [loadInsights]);
  function openClassify(row) { setClassifyModal(row); setSelectedLabel(''); }
  function closeClassify() { setClassifyModal(null); setSelectedLabel(''); }
  async function handleSubmitClassification() {
    if (!selectedLabel || !classifyModal) return;
    try { setSaving(true); setError(''); await apiClient.post(`/api/v1/admin/ai-insights/${classifyModal.id}/review`, { selectedLabel }); closeClassify(); setShowSuccess(true); setTimeout(() => setShowSuccess(false), 3000); await loadInsights(); }
    catch (err) { setError(err.response?.data?.message || 'Could not save the classification.'); }
    finally { setSaving(false); }
  }
  if (!insights && !error) return <div style={{ color: '#4b5563', fontSize: '12px' }}>Loading AI insights…</div>;
  const flagged = insights?.items || [];
  const metrics = [
    { l: 'ACCURACY', v: insights.modelMetrics?.accuracy, target: 85, color: '#3b82f6' },
    { l: 'PRECISION', v: insights.modelMetrics?.precision, target: 85, color: '#a855f7' },
    { l: 'RECALL', v: insights.modelMetrics?.recall, target: 85, color: '#22c55e' },
    { l: 'F1 SCORE', v: insights.modelMetrics?.f1, target: 85, color: '#f59e0b' },
  ];
  return <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
    {error && <div style={{ ...card, borderColor: '#ef444466', color: '#fca5a5', fontSize: '12px' }}>{error}</div>}
    {insights && <>
      {/* Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '16px' }}>{metrics.map((m) => { const value = m.v == null ? null : m.v * 100; return <div key={m.l} style={card}><div style={{ fontSize: '10px', marginBottom: '8px', color: '#6b7280', fontFamily: "'JetBrains Mono',monospace", letterSpacing: '0.07em' }}>{m.l}</div><div style={{ fontSize: '30px', fontWeight: 800, color: '#fff', marginBottom: '12px', fontFamily: "'JetBrains Mono',monospace" }}>{value == null ? '—' : `${value.toFixed(1)}%`}</div><div style={{ height: '4px', borderRadius: '999px', background: '#13131e', marginBottom: '6px' }}><div style={{ height: '100%', borderRadius: '999px', width: `${value ?? 0}%`, background: m.color }}/></div><div style={{ fontSize: '11px', color: '#4b5563' }}>{value == null ? 'Awaiting reviewed ground truth' : `Target: ≥${m.target}%`}</div></div>; })}</div>
      {showSuccess && <div style={{ padding: '12px 16px', borderRadius: '10px', fontSize: '13px', fontWeight: 500, background: '#0a1a12', border: '1px solid #22c55e40', color: '#22c55e', display: 'flex', alignItems: 'center', gap: '10px', animation: 'fadeIn 0.3s ease' }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>Classification saved successfully.</div>}
      <div style={card}><div style={{ fontSize: '13px', fontWeight: 600, color: '#fff', marginBottom: '4px' }}>30-Day Rolling Accuracy</div><div style={{ fontSize: '11px', color: '#4b5563', marginBottom: '16px' }}>Accuracy, Precision, Recall over time · Target: 85% minimum</div><ResponsiveContainer width="100%" height={200}><LineChart data={insights.metricTrend || []} margin={{ top: 4, right: 16, left: -20, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" stroke="#13131e"/><XAxis dataKey="date" tick={{ fill: '#4b5563', fontSize: 10 }} axisLine={false} tickLine={false}/><YAxis domain={[0, 100]} tick={{ fill: '#4b5563', fontSize: 10 }} axisLine={false} tickLine={false}/><Tooltip contentStyle={{ background: '#111120', border: '1px solid #1a1a2a', borderRadius: '8px', color: '#e2e8f0', fontSize: 12 }}/><Line type="monotone" dataKey="acc" stroke="#3b82f6" strokeWidth={2} dot={false}/><Line type="monotone" dataKey="prec" stroke="#a855f7" strokeWidth={2} dot={false}/><Line type="monotone" dataKey="recall" stroke="#22c55e" strokeWidth={2} dot={false}/><Line type="monotone" dataKey="f1" stroke="#f59e0b" strokeWidth={2} dot={false}/></LineChart></ResponsiveContainer></div>
      {/* Flagged for Human Classification */}
      <div style={card}><div style={{ fontSize: '13px', fontWeight: 600, color: '#fff', marginBottom: '4px' }}>Flagged for Human Classification</div><div style={{ fontSize: '11px', color: '#4b5563', marginBottom: '16px' }}>{flagged.filter((item) => !item.reviewed).length} reports awaiting classification — feeds retraining feedback loop</div><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr>{['FLAG ID', 'NUMBER', 'AI LABEL', 'CONFIDENCE', 'STATUS', 'ACTION'].map((h) => <th key={h} style={thS}>{h}</th>)}</tr></thead><tbody>{flagged.length === 0 ? <tr><td colSpan="6" style={{ ...tdS, color: '#4b5563', textAlign: 'center' }}>No AI reports awaiting review.</td></tr> : flagged.map((f) => <tr key={f.id}><td style={{ ...tdS, color: '#3b82f6', fontFamily: "'JetBrains Mono',monospace" }}>{f.id}</td><td style={{ ...tdS, color: '#fff', fontFamily: "'JetBrains Mono',monospace" }}>{f.number}</td><td style={{ ...tdS, color: '#9ca3af' }}>{f.label}</td><td style={{ ...tdS, fontWeight: 600, color: f.confidence >= .85 ? '#22c55e' : '#f59e0b', fontFamily: "'JetBrains Mono',monospace" }}>{f.confidence == null ? '—' : `${(f.confidence * 100).toFixed(1)}%`}</td><td style={tdS}><span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: f.reviewed ? '#22c55e' : '#f59e0b' }}><span style={{ width: '6px', height: '6px', borderRadius: '50%', background: f.reviewed ? '#22c55e' : '#f59e0b', display: 'inline-block' }}/>{f.reviewed ? 'Approved' : 'Pending'}</span></td><td style={tdS}>{!f.reviewed ? <button onClick={() => openClassify(f)} style={{ fontSize: '11px', fontWeight: 600, color: '#a855f7', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Classify →</button> : <span style={{ fontSize: '11px', color: '#374151' }}>—</span>}</td></tr>)}</tbody></table></div>
      {classifyModal && <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}><div style={{ width: '100%', maxWidth: '480px', margin: '0 16px', borderRadius: '20px', padding: '28px', position: 'relative', background: '#0e0e18', border: '1px solid #1a1a2a', boxShadow: '0 40px 80px rgba(0,0,0,0.5)' }}><div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '1px', borderRadius: '20px 20px 0 0', background: 'linear-gradient(90deg,transparent,#a855f7,transparent)' }}/><div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px' }}><div><div style={{ fontWeight: 700, color: '#fff', fontSize: '16px' }}>Classify {classifyModal.id}</div><div style={{ fontSize: '11px', marginTop: '4px', color: '#4b5563' }}>{classifyModal.number} · AI Label: {classifyModal.label}</div></div><button onClick={closeClassify} disabled={saving} style={{ color: '#4b5563', background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}>✕</button></div><div style={{ marginBottom: '20px' }}><div style={{ fontSize: '10px', marginBottom: '8px', color: '#6b7280', fontFamily: "'JetBrains Mono',monospace", letterSpacing: '0.06em' }}>SELECT CORRECT CATEGORY</div><div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>{CATEGORIES.map((category) => <button key={category} onClick={() => setSelectedLabel(category)} style={{ padding: '12px 16px', borderRadius: '10px', fontSize: '13px', textAlign: 'left', cursor: 'pointer', background: selectedLabel === category ? '#a855f720' : '#111118', border: selectedLabel === category ? '1.5px solid #a855f7' : '1.5px solid #1a1a28', color: selectedLabel === category ? '#fff' : '#9ca3af', fontWeight: selectedLabel === category ? 600 : 500 }}>{category}</button>)}</div></div><button disabled={!selectedLabel || saving} onClick={handleSubmitClassification} style={{ width: '100%', padding: '12px', borderRadius: '12px', fontSize: '13px', fontWeight: 700, border: 'none', background: selectedLabel ? '#a855f7' : '#111118', color: selectedLabel ? '#fff' : '#374151', cursor: selectedLabel ? 'pointer' : 'not-allowed' }}>{saving ? 'Saving…' : 'Submit Classification'}</button></div></div>}
    </>}
    <style>{'@keyframes fadeIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }'}</style>
  </div>;
}
