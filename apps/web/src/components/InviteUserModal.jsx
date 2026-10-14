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

// ─── Validation ──────────────────────────────────────────────────────
// Full name: 2-80 chars, letters/spaces/hyphens/apostrophes/periods only.
// Rejects digits, symbols, emojis.
const FULL_NAME_REGEX = /^[A-Za-zÀ-ÖØ-öø-ÿÑñ.'\- ]{2,80}$/;

// Invitations must come from a Gmail address. Matches the backend
// whitelist policy (ALLOWED_EMAIL_DOMAINS=gmail.com in .env).
const GMAIL_REGEX = /^[A-Za-z0-9._%+-]+@gmail\.com$/i;

function sanitizeFullName(raw) {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/[^A-Za-zÀ-ÖØ-öø-ÿÑñ.'\- ]/g, '')
    .replace(/\s{2,}/g, ' ')
    .slice(0, 80);
}

function validateInviteForm(form) {
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

  if (form.role === 'officer' && !form.jurisdiction) {
    errors.jurisdiction = 'Please select a region / jurisdiction.';
  }

  return errors;
}

export default function InviteUserModal({ isOpen, onClose, onInvited }) {
  const [form, setForm] = useState(INITIAL_FORM);
  const [status, setStatus] = useState('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  if (!isOpen) return null;

  const handleChange = (field) => (e) => {
    const raw = e.target.value;
    const value = field === 'fullName' ? sanitizeFullName(raw) : raw;

    setForm((prev) => {
      if (field === 'role') {
        return {
          ...prev,
          role: value,
          jurisdiction: value === 'admin' ? ADMIN_DEFAULT_JURISDICTION : '',
        };
      }
      return { ...prev, [field]: value };
    });

    if (fieldErrors[field]) {
      setFieldErrors((prev) => {
        const copy = { ...prev };
        delete copy[field];
        // Switching role invalidates the region requirement.
        if (field === 'role') delete copy.jurisdiction;
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

    const errors = validateInviteForm(form);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setStatus('error');
      setErrorMessage('Please correct the highlighted fields.');
      return;
    }

    setStatus('submitting');

    const payload = {
      ...form,
      fullName: form.fullName.trim(),
      email: form.email.trim().toLowerCase(),
      badgeId: form.badgeId.trim(),
      agency: form.agency.trim(),
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
        backendMessage || 'Failed to add user. Please check the details and try again.'
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
                placeholder="user@gmail.com"
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
                  Role
                </span>
                <select
                  value={form.role}
                  onChange={handleChange('role')}
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

              {showRegionField && (
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
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                  {fieldErrors.jurisdiction ? (
                    <span className="block text-xs mt-1" style={{ color: '#f87171' }}>
                      {fieldErrors.jurisdiction}
                    </span>
                  ) : null}
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
                  {isSubmitting ? 'Adding…' : 'Add User'}
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