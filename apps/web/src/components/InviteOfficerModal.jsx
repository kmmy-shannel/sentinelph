// apps/web/src/components/InviteOfficerModal.jsx
import React, { useState } from 'react';
import apiClient from '../lib/api';

// Canonical PH region list — must match shared/regions.js exactly.
const PH_REGIONS = [
  'NCR',
  'CAR',
  'Region I',
  'Region II',
  'Region III',
  'Region IV-A',
  'MIMAROPA',
  'Region V',
  'Region VI',
  'Region VII',
  'Region VIII',
  'Region IX',
  'Region X',
  'Region XI',
  'Region XII',
  'Region XIII',
  'BARMM',
];

const INITIAL_FORM = {
  fullName: '',
  email: '',
  badgeId: '',
  agency: '',
  jurisdiction: '',
};

// ─── Purple accent (matches admin theme) ──────────────────────────────
const ACCENT = '#a855f7';
const ACCENT_HOVER = '#9333ea';

// ─── Validation ──────────────────────────────────────────────────────
// Full name: 2-80 chars, letters/spaces/hyphens/apostrophes/periods only.
const FULL_NAME_REGEX = /^[A-Za-zÀ-ÖØ-öø-ÿÑñ.'\- ]{2,80}$/;

// Invitations must come from a Gmail address. This matches the backend
// whitelist policy (ALLOWED_EMAIL_DOMAINS=gmail.com in .env).
const GMAIL_REGEX = /^[A-Za-z0-9._%+-]+@gmail\.com$/i;

function sanitizeFullName(raw) {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/[^A-Za-zÀ-ÖØ-öø-ÿÑñ.'\- ]/g, '')
    .replace(/\s{2,}/g, ' ')
    .slice(0, 80);
}

function validateForm(form) {
  const errors = {};

  const name = String(form.fullName || '').trim();
  if (!name) {
    errors.fullName = 'Full name is required.';
  } else if (name.length < 2) {
    errors.fullName = 'Full name must be at least 2 characters.';
  } else if (/\d/.test(name)) {
    errors.fullName = 'Full name must not contain numbers.';
  } else if (!FULL_NAME_REGEX.test(name)) {
    errors.fullName =
      'Full name may only contain letters, spaces, hyphens, apostrophes, and periods.';
  }

  const email = String(form.email || '').trim();
  if (!email) {
    errors.email = 'Email is required.';
  } else if (!GMAIL_REGEX.test(email)) {
    errors.email = 'Email must be a valid @gmail.com address.';
  }

  const badge = String(form.badgeId || '').trim();
  if (!badge) {
    errors.badgeId = 'Badge / ID number is required.';
  } else if (badge.length < 3) {
    errors.badgeId = 'Badge / ID must be at least 3 characters.';
  }

  const agency = String(form.agency || '').trim();
  if (!agency) {
    errors.agency = 'Agency is required.';
  } else if (agency.length < 2) {
    errors.agency = 'Agency must be at least 2 characters.';
  }

  if (!form.jurisdiction) {
    errors.jurisdiction = 'Please select a region / jurisdiction.';
  }

  return errors;
}

export default function InviteOfficerModal({ isOpen, onClose, onInvited }) {
  const [form, setForm] = useState(INITIAL_FORM);
  const [status, setStatus] = useState('idle'); // idle | submitting | success | error
  const [errorMessage, setErrorMessage] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  if (!isOpen) return null;

  const handleChange = (field) => (e) => {
    const raw = e.target.value;
    const next = field === 'fullName' ? sanitizeFullName(raw) : raw;
    setForm((prev) => ({ ...prev, [field]: next }));
    // Clear the field error as soon as the user edits it.
    if (fieldErrors[field]) {
      setFieldErrors((prev) => {
        const copy = { ...prev };
        delete copy[field];
        return copy;
      });
    }
  };

  const resetAndClose = () => {
    setForm(INITIAL_FORM);
    setStatus('idle');
    setErrorMessage('');
    setFieldErrors({});
    onClose?.();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');

    const errors = validateForm(form);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setStatus('error');
      setErrorMessage('Please correct the highlighted fields.');
      return;
    }

    setStatus('submitting');
    try {
      const response = await apiClient.post('/api/v1/admin/invite-officer', {
        fullName: form.fullName.trim(),
        email: form.email.trim().toLowerCase(),
        badgeId: form.badgeId.trim(),
        agency: form.agency.trim(),
        jurisdiction: form.jurisdiction,
      });
      setStatus('success');
      onInvited?.(response.data?.user);
    } catch (err) {
      setStatus('error');
      const backendMessage = err?.response?.data?.message;
      setErrorMessage(
        backendMessage || 'Failed to add officer. Please check the details and try again.'
      );
    }
  };

  const isSubmitting = status === 'submitting';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(6, 6, 15, 0.85)' }}
      aria-modal="true"
      role="dialog"
      aria-labelledby="invite-officer-title"
    >
      <div
        className="w-full max-w-md mx-4 rounded-xl shadow-2xl"
        style={{ backgroundColor: '#0e0e18', border: '1px solid #1a1a2a' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: '1px solid #1a1a2a' }}
        >
          <div>
            <p
              className="text-xs uppercase tracking-widest font-mono"
              style={{ color: ACCENT }}
            >
              SentinelPH
            </p>
            <h2
              id="invite-officer-title"
              className="text-lg font-semibold"
              style={{ color: '#f9fafb', fontFamily: "'Inter', sans-serif" }}
            >
              Add Officer
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

        {/* Body */}
        <div className="px-6 py-5">
          {status === 'success' ? (
            <div
              className="rounded-lg px-4 py-3 text-sm"
              style={{
                backgroundColor: 'rgba(168, 85, 247, 0.08)',
                border: '1px solid rgba(168, 85, 247, 0.35)',
                color: ACCENT,
              }}
            >
              Invitation sent to <strong>{form.email}</strong>. They'll receive an
              activation email shortly.
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              {status === 'error' && errorMessage && (
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
                error={fieldErrors.fullName}
                disabled={isSubmitting}
              />
              <Field
                label="Official Email"
                type="email"
                value={form.email}
                onChange={handleChange('email')}
                placeholder="officer@gmail.com"
                error={fieldErrors.email}
                hint="Must be a @gmail.com address."
                disabled={isSubmitting}
              />
              <Field
                label="Badge / ID Number"
                value={form.badgeId}
                onChange={handleChange('badgeId')}
                placeholder="PNP-00123"
                error={fieldErrors.badgeId}
                disabled={isSubmitting}
              />
              <Field
                label="Agency"
                value={form.agency}
                onChange={handleChange('agency')}
                placeholder="Philippine National Police"
                error={fieldErrors.agency}
                disabled={isSubmitting}
              />
              <label className="block">
                <span className="block text-xs font-medium mb-1.5" style={{ color: '#94a3b8' }}>
                  Region / Jurisdiction
                </span>
                <select
                  value={form.jurisdiction}
                  onChange={handleChange('jurisdiction')}
                  disabled={isSubmitting}
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none transition-colors focus:ring-1"
                  style={{
                    backgroundColor: '#080810',
                    border: `1px solid ${
                      fieldErrors.jurisdiction ? 'rgba(239,68,68,0.45)' : '#1a1a2a'
                    }`,
                    color: '#f9fafb',
                  }}
                >
                  <option value="">Select a region…</option>
                  {PH_REGIONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                {fieldErrors.jurisdiction ? (
                  <span className="block text-xs mt-1" style={{ color: '#f87171' }}>
                    {fieldErrors.jurisdiction}
                  </span>
                ) : null}
              </label>

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
                  style={{ backgroundColor: ACCENT, color: '#06060f' }}
                  onMouseEnter={(e) => {
                    if (!isSubmitting) e.currentTarget.style.backgroundColor = ACCENT_HOVER;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = ACCENT;
                  }}
                >
                  {isSubmitting ? 'Sending…' : 'Add Officer'}
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
                style={{ backgroundColor: ACCENT, color: '#06060f' }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = ACCENT_HOVER}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = ACCENT}
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

function Field({ label, type = 'text', value, onChange, placeholder, error, hint, disabled }) {
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
        disabled={disabled}
        className="w-full rounded-lg px-3 py-2 text-sm outline-none transition-colors focus:ring-1"
        style={{
          backgroundColor: '#080810',
          border: `1px solid ${error ? 'rgba(239,68,68,0.45)' : '#1a1a2a'}`,
          color: '#f9fafb',
        }}
      />
      {error ? (
        <span className="block text-xs mt-1" style={{ color: '#f87171' }}>
          {error}
        </span>
      ) : hint ? (
        <span className="block text-xs mt-1" style={{ color: '#6b7280' }}>
          {hint}
        </span>
      ) : null}
    </label>
  );
}