const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { Op, col, where } = require('sequelize');
const { OtpSession } = require('../models');
const { OTP } = require('../config/constants');

const generateOTP = () => {
  return String(crypto.randomInt(100000, 999999));
};

/**
 * Create a new OTP session for a visit.
 * Invalidates any previous unused sessions for this visit.
 * Returns the plaintext OTP (to be emailed) and the session id.
 */
const createOTPSession = async ({ visitId, email, organizationId }) => {
  await OtpSession.update(
    { used: true },
    { where: { visit_id: visitId, used: false } }
  );

  const otp = generateOTP();
  const hash = await bcrypt.hash(otp, 10);
  const expiresAt = new Date(Date.now() + OTP.EXPIRY_MINUTES * 60 * 1000);

  const session = await OtpSession.create({
    visit_id: visitId,
    email: email.toLowerCase(),
    otp_hash: hash,
    expires_at: expiresAt,
    organization_id: organizationId || null,
  });

  return { otp, sessionId: session.id, expiresAt };
};

/**
 * Validate an OTP.
 * When email is provided, looks up the session by email (original behaviour).
 * When email is omitted, searches all recent active sessions and matches by OTP hash.
 */
const validateOTP = async ({ email, otp }) => {
  if (email && email.trim()) {
    // Email-based lookup (original path)
    const session = await OtpSession.findOne({
      where: { email: email.toLowerCase(), used: false, expires_at: { [Op.gt]: new Date() } },
      order: [['created_at', 'DESC']],
    });

    if (!session) {
      return { valid: false, error: 'OTP_NOT_FOUND', message: 'No active OTP found. Please request a new one.' };
    }

    if (session.attempts >= session.max_attempts) {
      return { valid: false, error: 'OTP_MAX_ATTEMPTS', message: 'Too many incorrect attempts. Please request a new OTP.' };
    }

    const match = await bcrypt.compare(otp.trim(), session.otp_hash);

    if (!match) {
      const prevAttempts = session.attempts;
      await session.increment('attempts');
      const attemptsLeft = session.max_attempts - prevAttempts - 1;
      return {
        valid: false,
        error: 'OTP_INVALID',
        message: `Incorrect OTP. ${attemptsLeft} attempt${attemptsLeft !== 1 ? 's' : ''} remaining.`,
        attemptsLeft,
      };
    }

    await session.update({ used: true });
    return { valid: true, visitId: session.visit_id, sessionId: session.id };
  }

  // No email: scan recent active sessions and match by hash
  const sessions = await OtpSession.findAll({
    where: {
      used: false,
      expires_at: { [Op.gt]: new Date() },
      [Op.and]: [where(col('attempts'), Op.lt, col('max_attempts'))],
    },
    order: [['created_at', 'DESC']],
    limit: 50,
  });

  if (!sessions.length) {
    return { valid: false, error: 'OTP_NOT_FOUND', message: 'No active OTP found. Please request a new one.' };
  }

  for (const session of sessions) {
    const match = await bcrypt.compare(otp.trim(), session.otp_hash);
    if (match) {
      await session.update({ used: true });
      return { valid: true, visitId: session.visit_id, sessionId: session.id };
    }
  }

  return {
    valid: false,
    error: 'OTP_INVALID',
    message: 'Incorrect OTP. Please try again.',
  };
};

/**
 * Check if a visit already has a valid (unused, unexpired) OTP session.
 */
const hasActiveSession = async (visitId) => {
  const session = await OtpSession.findOne({
    where: { visit_id: visitId, used: false, expires_at: { [Op.gt]: new Date() } },
  });
  return !!session;
};

module.exports = { createOTPSession, validateOTP, hasActiveSession };
