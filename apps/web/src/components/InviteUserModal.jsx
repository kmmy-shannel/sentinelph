// apps/web/src/components/InviteUserModal.jsx
import React, { useState } from 'react';
import apiClient from '../lib/api';

const PH_REGIONS = [
  'NCR', 'CAR',
  'Region I', 'Region II', 'Region III', 'Region IV-A',
  'MIMAROPA', 'Region V', 'Region VI', 'Region VII', 'Region VIII',
  'Region IX', 'Region X', 'Region XI', 'Region XII', 'Region XIII',
  'BARMM',
];

const INITIAL_FORM = {
  fullName: '',
  email: '',
  badgeId: '',
  agency: '',
  jurisdiction: '',
  role: 'officer',
};

// Admins are agency-scoped, not region-scoped. This sentinel is what
// the backend treats as "see everything" (see reportScope() in admin.js).
const ADMIN_DEFAULT_JURISDICTION = 'National / Regional';

export default function InviteUserModal({ isOpen, onClose, onInvited }) {
  const [form, setForm] = useState(INITIAL_FORM);
  const [status, setStatus] = useState('idle');
  const [errorMessage, setErrorMessage] = useState('');

  if (!isOpen) return null;

  const handleChange = (field) => (e) => {
    const value = e.target.value;
    setForm((prev) => {
      // When switching roles, reset the jurisdiction appropriately so a
      // leftover region from an "Officer" selection doesn't get sent
      // along with an "Admin" invite.
      if (field === 'role') {
        return {
          ...prev,
          role: value,
          jurisdiction: value === 'admin' ? ADMIN_DEFAULT_JURISDICTION : '',
        };
      }
      return { ...prev, [field]: value };
    });
  };

  const resetAndClose = () => {
    setForm(INITIAL_FORM);
    setStatus('idle');
    setErrorMessage('');
    onClose?.();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus('submitting');
    setErrorMessage('');

    // If the role is admin, force jurisdiction to the sentinel so the
    // backend receives a valid region value even when the field is hidden.
    const payload = {
      ...form,
      jurisdiction:
        form.role === 'admin'
          ? ADMIN_DEFAULT_JURISDICTION
          : form.jurisdiction,
    };

    try {
      const response = await apiClient.post('/api/v1/superadmin/users/invite', payload);
      setStatus('success');
      onInvited?.(response.data?.data?.user);
    } catch (err) {
      setStatus('error');
      const backendMessage = err?.response?.data?.message;
      setErrorMessage(
        backendMessage || 'Failed to send invitation. Please check the details and try again.'
      );
    }
  };

  const isSubmitting = status === 'submitting';
  const showRegionField = form.role === 'officer';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(6, 6, 15, 0.85)' }}
      aria-modal="true"
      role="dialog"
      aria-labelledby="invite-user-title"
    >
      <div
        className="w-full max-w-md mx-4 rounded-xl shadow-2xl"
        style={{ backgroundColor: '#0e0e18', border: '1px solid #1a1a2a' }}
      >
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: '1px solid #1a1a2a' }}
        >
          <div>
            <p
              className="text-xs uppercase tracking-widest font-mono"
              style={{ color: '#22c55e' }}
            >
              SentinelPH
            </p>
            <h2
              id="invite-user-title"
              className="text-lg font-semibold"
              style={{ color: '#f9fafb', fontFamily: "'Inter', sans-serif" }}
            >
              Add User
            </h2>
          </div>
          <button
            type="button"
            onClick={resetAndClose}
            disabled={isSubmitting}
            className="text-2xl leading-none px-2 py-1 rounded hover:bg-white/5 transition-colors disabled:opacity-40"
            style={{ color: '#94a3b8' }}
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        <div className="px-6 py-5">
          {status === 'success' ? (
            <div
              className="rounded-lg px-4 py-3 text-sm"
              style={{
                backgroundColor: 'rgba(34, 197, 94, 0.08)',
                border: '1px solid rgba(34, 197, 94, 0.35)',
                color: '#22c55e',
              }}
            >
              Invitation sent to <strong>{form.email}</strong>. They'll receive an
              activation email shortly.
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {status === 'error' && (
                <div
                  className="rounded-lg px-4 py-3 text-sm"
                  style={{
                    backgroundColor: 'rgba(239, 68, 68, 0.08)',
                    border: '1px solid rgba(239, 68, 68, 0.35)',
                    color: '#f87171',
                  }}
                  role="alert"
                >
                  {errorMessage}
                </div>
              )}

              <Field
                label="Full Name"
                value={form.fullName}
                onChange={handleChange('fullName')}
                placeholder="Juan Dela Cruz"
                required
                disabled={isSubmitting}
              />
              <Field
                label="Official Email"
                type="email"
                value={form.email}
                onChange={handleChange('email')}
                placeholder="user@agency.gov.ph"
                required
                disabled={isSubmitting}
              />
              <Field
                label="Badge / ID Number"
                value={form.badgeId}
                onChange={handleChange('badgeId')}
                placeholder="PNP-00123"
                required
                disabled={isSubmitting}
              />
              <Field
                label="Agency"
                value={form.agency}
                onChange={handleChange('agency')}
                placeholder="Philippine National Police"
                required
                disabled={isSubmitting}
              />

              <label className="block">
                <span className="block text-xs font-medium mb-1.5" style={{ color: '#94a3b8' }}>
                  Role
                </span>
                <select
                  value={form.role}
                  onChange={handleChange('role')}
                  required
                  disabled={isSubmitting}
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none transition-colors focus:ring-1"
                  style={{
                    backgroundColor: '#080810',
                    border: '1px solid #1a1a2a',
                    color: '#f9fafb',
                  }}
                >
                  <option value="officer">Officer</option>
                  <option value="admin">Admin (Agency Admin)</option>
                </select>
              </label>

              {/* Region field is only shown for officers. Admins are
                  agency-scoped and always operate nationally within
                  their agency — the backend receives the
                  "National / Regional" sentinel automatically. */}
              {showRegionField && (
                <label className="block">
                  <span className="block text-xs font-medium mb-1.5" style={{ color: '#94a3b8' }}>
                    Region / Jurisdiction
                  </span>
                  <select
                    value={form.jurisdiction}
                    onChange={handleChange('jurisdiction')}
                    required
                    disabled={isSubmitting}
                    className="w-full rounded-lg px-3 py-2 text-sm outline-none transition-colors focus:ring-1"
                    style={{
                      backgroundColor: '#080810',
                      border: '1px solid #1a1a2a',
                      color: '#f9fafb',
                    }}
                  >
                    <option value="">Select a region…</option>
                    {PH_REGIONS.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </label>
              )}

              {!showRegionField && (
                <div
                  className="rounded-lg px-4 py-3 text-xs"
                  style={{
                    backgroundColor: 'rgba(148, 163, 184, 0.05)',
                    border: '1px solid rgba(148, 163, 184, 0.1)',
                    color: '#94a3b8',
                    lineHeight: 1.5,
                  }}
                >
                  Admins operate nationally within their agency — no region
                  assignment is required. Their scope is inherited from
                  their Agency, and they oversee officers across all
                  regions.
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={resetAndClose}
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40"
                  style={{ color: '#cbd5e1', border: '1px solid #1a1a2a' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-60"
                  style={{ backgroundColor: '#22c55e', color: '#08200f' }}
                >
                  {isSubmitting ? 'Sending…' : 'Send Invitation'}
                </button>
              </div>
            </form>
          )}

          {status === 'success' && (
            <div className="flex justify-end pt-4">
              <button
                type="button"
                onClick={resetAndClose}
                className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
                style={{ backgroundColor: '#22c55e', color: '#08200f' }}
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, type = 'text', value, onChange, placeholder, required, disabled }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium mb-1.5" style={{ color: '#94a3b8' }}>
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        className="w-full rounded-lg px-3 py-2 text-sm outline-none transition-colors focus:ring-1"
        style={{
          backgroundColor: '#080810',
          border: '1px solid #1a1a2a',
          color: '#f9fafb',
        }}
      />
    </label>
  );
}