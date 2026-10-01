// apps/mobile/lib/subtypeGuidance.js
//
// Maps the AI's Level 2 subtype to user-facing guidance. Icons are
// rendered separately by <SubtypeIcon subtype={...} /> using inline
// SVG, so this file only carries the text fields:
//   { title, body, actions[] }
//
// `actions` is a list of one-line "what to do" strings shown as bullets.
// Empty actions array = nothing extra to tell the user.

export const SUBTYPE_GUIDANCE = {
  // ─── LEGITIMATE tier ──────────────────────────────────────────────
  personal_conversational: {
    title: "Personal Message",
    body: "This looks like a message from someone you know.",
    actions: [],
  },
  two_factor_auth: {
    title: "One-Time Password (OTP)",
    body: "This is a verification code. Never share it with anyone, even if they say they're from the company.",
    actions: [
      "Do not share this code",
      "Do not forward this message",
    ],
  },
  appointment_reminder: {
    title: "Appointment Reminder",
    body: "This is a reminder for a scheduled appointment or service visit.",
    actions: [],
  },
  delivery_tracking: {
    title: "Delivery Update",
    body: "This is a shipping status update for an order you placed.",
    actions: [
      "Verify the tracking number in the courier's official app",
    ],
  },
  bank_activity_alert: {
    title: "Bank Notification",
    body: "This is a transaction alert from your bank or e-wallet.",
    actions: [
      "If you don't recognize this transaction, contact your bank directly using the number on their official website",
    ],
  },

  // ─── GREY_AREA tier ───────────────────────────────────────────────
  brand_marketing: {
    title: "Promotional Message",
    body: "This is a marketing or promotional message from a brand.",
    actions: [
      "Reply STOP to unsubscribe if you no longer want to receive promos",
    ],
  },

  // ─── MALICIOUS tier ───────────────────────────────────────────────
  phishing_link: {
    title: "Phishing Link Detected",
    body: "This looks like a fake message designed to steal your personal or banking information.",
    actions: [
      "Do not click any links in this message",
      "Do not reply",
      "Do not share any personal info or OTPs",
      "Report this message",
    ],
  },
  fake_prize_lottery: {
    title: "Fake Prize / Lottery Scam",
    body: "You did not win this. Scammers use fake prizes to trick you into paying a fee or sharing bank details.",
    actions: [
      "Do not send any money",
      "Do not share your bank account details",
      "Report this message",
    ],
  },

  // ─── Fallback ─────────────────────────────────────────────────────
  UNLABELED: {
    title: "Unable to Classify",
    body: "Our AI couldn't determine what type of message this is. Treat it with caution.",
    actions: [
      "Do not click any links",
      "Report this message if it looks suspicious",
    ],
  },
};

// Friendly fallback when `subtype` is null or missing.
const DEFAULT_GUIDANCE = {
  title: "Use Caution",
  body: "We couldn't determine the specific type of this message. Treat it with caution.",
  actions: [],
};

export function getSubtypeGuidance(subtype) {
  if (!subtype) return DEFAULT_GUIDANCE;
  return SUBTYPE_GUIDANCE[subtype] || SUBTYPE_GUIDANCE.UNLABELED;
}