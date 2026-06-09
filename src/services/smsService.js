'use strict';

const ENABLED = !!(
  process.env.TWILIO_ACCOUNT_SID &&
  process.env.TWILIO_AUTH_TOKEN  &&
  process.env.TWILIO_PHONE_NUMBER
);

// Normalise a phone number for Twilio (E.164 format: +91XXXXXXXXXX etc.)
// If the number is already +prefixed, use as-is.
// Otherwise prepend the configured default country code (e.g. +91 for India).
function normalisePhone(phone) {
  const cleaned = phone.replace(/\s+/g, '');
  if (cleaned.startsWith('+')) return cleaned;
  const code = (process.env.SMS_DEFAULT_COUNTRY_CODE || '+91').replace(/^\+?/, '+');
  return `${code}${cleaned}`;
}

async function sendSms(to, body) {
  if (!ENABLED) {
    console.warn('[SMS] DISABLED — Twilio env vars not set. To:', to);
    return;
  }
  console.log('[SMS] Sending to:', to);
  const twilio = require('twilio');
  const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  try {
    const msg = await client.messages.create({
      body,
      from: process.env.TWILIO_PHONE_NUMBER,
      to,
    });
    console.log('[SMS] Sent OK — SID:', msg.sid, '| Status:', msg.status);
  } catch (err) {
    console.error('[SMS] Twilio error — Code:', err.code, '| Message:', err.message);
    throw err;
  }
}

// ── Customise your SMS message here ───────────────────────────────────────────
// Available variables: visitorName, otp, expiresMinutes
function buildOtpMessage({ visitorName, otp, expiresMinutes }) {
  return (
    `Hello ${visitorName}!\n` +
    `Your Visitor Check-In OTP is: *${otp}*\n` +
    `Valid for ${expiresMinutes} minutes only.\n` +
    `Please enter this OTP at the reception kiosk.\n` +
    `Do NOT share this OTP with anyone.\n` +
    `- NantaTech VMS`
  );
}
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Send OTP via SMS.
 * Non-throwing — caller should .catch() or await inside try/catch.
 */
async function sendOtpSms({ visitorPhone, visitorName, otp, expiresMinutes = 10 }) {
  if (!visitorPhone) {
    console.warn('[SMS] No phone number for visitor — SMS skipped');
    return;
  }
  const to   = normalisePhone(visitorPhone);
  console.log('[SMS] Raw phone:', visitorPhone, '→ normalised:', to);
  const body = buildOtpMessage({ visitorName, otp, expiresMinutes });
  await sendSms(to, body);
}

module.exports = { ENABLED, sendSms, sendOtpSms };
