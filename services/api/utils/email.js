// services/api/utils/email.js
'use strict';

const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;

if (!APPS_SCRIPT_URL) {
  console.warn(
    '[email] APPS_SCRIPT_URL is not set — email sending will fail. ' +
    'See the Google Apps Script setup instructions.'
  );
}

async function sendViaAppsScript({ to, subject, html, text = '' }) {
  if (!APPS_SCRIPT_URL) {
    throw new Error(
      'APPS_SCRIPT_URL is not configured. Set it in the environment to the ' +
      '/exec URL of your deployed Google Apps Script Web App.'
    );
  }

  const response = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to, subject, html, text }),
  });

  if (!response.ok) {
    throw new Error(`Apps Script HTTP ${response.status}`);
  }

  const result = await response.json();
  if (!result.ok) {
    throw new Error(`Apps Script error: ${result.error || 'unknown'}`);
  }
  return result;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildActivationEmailHtml({ fullName, agency, activationLink }) {
  return `
  <!DOCTYPE html>
  <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Sentinel Account Activation</title>
    </head>
    <body style="margin:0; padding:0; background-color:#06060f; font-family:'Inter', Arial, sans-serif; color:#e5e7eb;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#06060f; padding:40px 0;">
        <tr>
          <td align="center">
            <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background-color:#0e0e18; border:1px solid #1a1a2a; border-radius:12px; overflow:hidden;">
              <tr>
                <td style="padding:28px 32px; border-bottom:1px solid #1a1a2a;">
                  <span style="font-family:'JetBrains Mono', monospace; font-size:13px; letter-spacing:2px; color:#3b82f6; text-transform:uppercase;">
                    Sentinel
                  </span>
                  <div style="font-size:18px; font-weight:600; color:#f9fafb; margin-top:6px;">
                    Account Activation Required
                  </div>
                </td>
              </tr>
              <tr>
                <td style="padding:28px 32px;">
                  <p style="font-size:14px; line-height:1.6; color:#cbd5e1; margin:0 0 16px;">
                    Hello <strong style="color:#f9fafb;">${escapeHtml(fullName)}</strong>,
                  </p>
                  <p style="font-size:14px; line-height:1.6; color:#cbd5e1; margin:0 0 16px;">
                    An officer account has been provisioned for you under
                    <strong style="color:#f9fafb;">${escapeHtml(agency)}</strong> on the
                    Sentinel platform. To activate your account and set your password,
                    use the secure link below.
                  </p>
                  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
                    <tr>
                      <td style="border-radius:8px; background-color:#3b82f6;">
                        <a href="${activationLink}"
                           style="display:inline-block; padding:12px 28px; font-size:14px; font-weight:600; color:#06060f; text-decoration:none; border-radius:8px;">
                          Activate My Account
                        </a>
                      </td>
                    </tr>
                  </table>
                  <p style="font-size:12px; line-height:1.6; color:#94a3b8; margin:0 0 8px;">
                    If the button above doesn't work, copy and paste this link into your browser:
                  </p>
                  <p style="font-size:12px; line-height:1.6; word-break:break-all; color:#3b82f6; margin:0 0 20px;">
                    ${activationLink}
                  </p>
                  <p style="font-size:12px; line-height:1.6; color:#64748b; margin:0;">
                    This link is single-use and will expire. If you did not expect this email,
                    please disregard it or contact your system administrator immediately.
                  </p>
                </td>
              </tr>
              <tr>
                <td style="padding:18px 32px; border-top:1px solid #1a1a2a; background-color:#080810;">
                  <p style="font-size:11px; line-height:1.5; color:#4b5563; margin:0;">
                    This is an automated message from Sentinel. Unauthorized access to or misuse
                    of this system may be subject to prosecution under the Cybercrime Prevention
                    Act of 2012 (Republic Act No. 10175).
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>
  `;
}

function buildPasswordResetEmailHtml({ fullName, resetLink, expiresInMinutes }) {
  return `
  <!DOCTYPE html>
  <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Sentinel Password Reset</title>
    </head>
    <body style="margin:0; padding:0; background-color:#06060f; font-family:'Inter', Arial, sans-serif; color:#e5e7eb;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#06060f; padding:40px 0;">
        <tr>
          <td align="center">
            <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background-color:#0e0e18; border:1px solid #1a1a2a; border-radius:12px; overflow:hidden;">
              <tr>
                <td style="padding:28px 32px; border-bottom:1px solid #1a1a2a;">
                  <span style="font-family:'JetBrains Mono', monospace; font-size:13px; letter-spacing:2px; color:#6366f1; text-transform:uppercase;">
                    Sentinel
                  </span>
                  <div style="font-size:18px; font-weight:600; color:#f9fafb; margin-top:6px;">
                    Password Reset Requested
                  </div>
                </td>
              </tr>
              <tr>
                <td style="padding:28px 32px;">
                  <p style="font-size:14px; line-height:1.6; color:#cbd5e1; margin:0 0 16px;">
                    Hello <strong style="color:#f9fafb;">${escapeHtml(fullName || 'there')}</strong>,
                  </p>
                  <p style="font-size:14px; line-height:1.6; color:#cbd5e1; margin:0 0 16px;">
                    We received a request to reset your Sentinel password. If this was
                    you, click the button below to choose a new password. This link
                    expires in <strong style="color:#f9fafb;">${expiresInMinutes} minutes</strong>
                    and can only be used once.
                  </p>
                  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
                    <tr>
                      <td style="border-radius:8px; background-color:#4f46e5;">
                        <a href="${resetLink}"
                           style="display:inline-block; padding:12px 28px; font-size:14px; font-weight:600; color:#ffffff; text-decoration:none; border-radius:8px;">
                          Reset My Password
                        </a>
                      </td>
                    </tr>
                  </table>
                  <p style="font-size:12px; line-height:1.6; color:#94a3b8; margin:0 0 8px;">
                    If the button above doesn't work, copy and paste this link into your browser:
                  </p>
                  <p style="font-size:12px; line-height:1.6; word-break:break-all; color:#818cf8; margin:0 0 20px;">
                    ${resetLink}
                  </p>
                  <p style="font-size:12px; line-height:1.6; color:#64748b; margin:0;">
                    If you did not request a password reset, you can safely ignore this
                    email. Your password will not change until you click the link above
                    and choose a new one.
                  </p>
                </td>
              </tr>
              <tr>
                <td style="padding:18px 32px; border-top:1px solid #1a1a2a; background-color:#080810;">
                  <p style="font-size:11px; line-height:1.5; color:#4b5563; margin:0;">
                    This is an automated message from Sentinel. Unauthorized access to or
                    misuse of this system may be subject to prosecution under the Cybercrime
                    Prevention Act of 2012 (Republic Act No. 10175).
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>
  `;
}

function buildOtpEmailHtml({ fullName, otp, expiresInMinutes }) {
  const otpDigits = String(otp)
    .split('')
    .map(
      (d) =>
        `<span style="display:inline-block; min-width:38px; padding:12px 0; margin:0 4px; background:#080810; border:1px solid #1c1c2e; border-radius:10px; font-family:'JetBrains Mono', monospace; font-size:26px; font-weight:700; color:#818cf8; text-align:center;">${escapeHtml(
          d
        )}</span>`
    )
    .join('');

  return `
  <!DOCTYPE html>
  <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>SentinelPH Password Reset Code</title>
    </head>
    <body style="margin:0; padding:0; background-color:#06060f; font-family:'Inter', Arial, sans-serif; color:#e5e7eb;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#06060f; padding:40px 0;">
        <tr>
          <td align="center">
            <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background-color:#0e0e18; border:1px solid #1a1a2a; border-radius:12px; overflow:hidden;">
              <tr>
                <td style="padding:28px 32px; border-bottom:1px solid #1a1a2a;">
                  <span style="font-family:'JetBrains Mono', monospace; font-size:13px; letter-spacing:2px; color:#6366f1; text-transform:uppercase;">
                    SentinelPH
                  </span>
                  <div style="font-size:18px; font-weight:600; color:#f9fafb; margin-top:6px;">
                    Password Reset Code
                  </div>
                </td>
              </tr>
              <tr>
                <td style="padding:28px 32px;">
                  <p style="font-size:14px; line-height:1.6; color:#cbd5e1; margin:0 0 16px;">
                    Hello <strong style="color:#f9fafb;">${escapeHtml(fullName || 'there')}</strong>,
                  </p>
                  <p style="font-size:14px; line-height:1.6; color:#cbd5e1; margin:0 0 20px;">
                    Use the code below to reset your SentinelPH password. Enter it in the
                    app to continue. This code expires in
                    <strong style="color:#f9fafb;">${expiresInMinutes} minutes</strong>
                    and can only be used once.
                  </p>
                  <div style="text-align:center; padding:16px 0; margin:0 0 20px;">
                    ${otpDigits}
                  </div>
                  <p style="font-size:12px; line-height:1.6; color:#64748b; margin:0;">
                    If you did not request a password reset, you can safely ignore this
                    email. Your password will not change until you enter this code and
                    choose a new one.
                  </p>
                </td>
              </tr>
              <tr>
                <td style="padding:18px 32px; border-top:1px solid #1a1a2a; background-color:#080810;">
                  <p style="font-size:11px; line-height:1.5; color:#4b5563; margin:0;">
                    This is an automated message from SentinelPH. Unauthorized access to or
                    misuse of this system may be subject to prosecution under the Cybercrime
                    Prevention Act of 2012 (Republic Act No. 10175).
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>
  `;
}

async function sendActivationEmail(toEmail, fullName, agency, activationLink) {
  return sendViaAppsScript({
    to: toEmail,
    subject: 'Sentinel — Activate Your Officer Account',
    html: buildActivationEmailHtml({ fullName, agency, activationLink }),
  });
}

async function sendPasswordResetEmail(toEmail, fullName, resetLink, expiresInMinutes = 15) {
  return sendViaAppsScript({
    to: toEmail,
    subject: 'Sentinel — Reset Your Password',
    html: buildPasswordResetEmailHtml({ fullName, resetLink, expiresInMinutes }),
  });
}

async function sendPasswordResetOtpEmail(toEmail, fullName, otp, expiresInMinutes = 10) {
  return sendViaAppsScript({
    to: toEmail,
    subject: 'SentinelPH — Your Password Reset Code',
    html: buildOtpEmailHtml({ fullName, otp, expiresInMinutes }),
  });
}

function getTransporter() {
  return { sendViaAppsScript };
}

module.exports = {
  sendActivationEmail,
  sendPasswordResetEmail,
  sendPasswordResetOtpEmail,
  getTransporter,
};