const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
  if (transporter) {
    return transporter;
  }

  const user = process.env.SYSTEM_EMAIL_USER;
  const pass = process.env.SYSTEM_EMAIL_PASS;

  if (!user || !pass) {
    throw new Error(
      'Email transporter is not configured. Set SYSTEM_EMAIL_USER and SYSTEM_EMAIL_PASS in .env ' +
      '(use a Gmail App Password, not the account password).'
    );
  }

  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });

  return transporter;
}

function buildActivationEmailHtml({ fullName, agency, activationLink }) {
  return `
  <!DOCTYPE html>
  <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>SentinelPH Account Activation</title>
    </head>
    <body style="margin:0; padding:0; background-color:#06060f; font-family:'Inter', Arial, sans-serif; color:#e5e7eb;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#06060f; padding:40px 0;">
        <tr>
          <td align="center">
            <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background-color:#0e0e18; border:1px solid #1a1a2a; border-radius:12px; overflow:hidden;">
              <tr>
                <td style="padding:28px 32px; border-bottom:1px solid #1a1a2a;">
                  <span style="font-family:'JetBrains Mono', monospace; font-size:13px; letter-spacing:2px; color:#3b82f6; text-transform:uppercase;">
                    SentinelPH
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
                    SentinelPH platform. To activate your account and set your password,
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
                    This is an automated message from SentinelPH. Unauthorized access to or misuse
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

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Sends the officer activation email.
 * @param {string} toEmail - recipient's official email address
 * @param {string} fullName - recipient's full name
 * @param {string} agency - recipient's agency
 * @param {string} activationLink - single-use Firebase activation link
 */
async function sendActivationEmail(toEmail, fullName, agency, activationLink) {
  const mailer = getTransporter();

  const info = await mailer.sendMail({
    from: `"SentinelPH Provisioning" <${process.env.SYSTEM_EMAIL_USER}>`,
    to: toEmail,
    subject: 'SentinelPH — Activate Your Officer Account',
    html: buildActivationEmailHtml({ fullName, agency, activationLink }),
  });

  return info;
}

module.exports = { sendActivationEmail, getTransporter };