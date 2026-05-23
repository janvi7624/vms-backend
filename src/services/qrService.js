const QRCode = require('qrcode');
const jwt = require('jsonwebtoken');
const { QrCode, Visit } = require('../models');
const { addHours, isExpired } = require('../utils/helpers');
const { QR_EXPIRY, VISIT_TYPES } = require('../config/constants');

const generateQRToken = (visitId, visitType) => {
  const expiryHours =
    visitType === VISIT_TYPES.PRE_PLANNED
      ? QR_EXPIRY.PRE_PLANNED_HOURS
      : QR_EXPIRY.IMPROMPTU_HOURS;

  const token = jwt.sign(
    { visitId, visitType },
    process.env.QR_SECRET,
    { expiresIn: `${expiryHours}h` }
  );

  const expiresAt = addHours(new Date(), expiryHours);
  return { token, expiresAt };
};

const generateQRImage = async (token) => {
  const qrDataUrl = await QRCode.toDataURL(token, {
    width: 300,
    margin: 2,
    color: { dark: '#1a1a2e', light: '#ffffff' },
    errorCorrectionLevel: 'H',
  });
  return qrDataUrl;
};

const createQRCodeRecord = async (visitId, visitType) => {
  const { token, expiresAt } = generateQRToken(visitId, visitType);
  const qrImage = await generateQRImage(token);

  await QrCode.destroy({ where: { visit_id: visitId } });
  await QrCode.create({
    visit_id: visitId,
    token,
    qr_image_base64: qrImage,
    expires_at: expiresAt,
  });

  return { token, qrImage, expiresAt };
};

const validateQRToken = async (token) => {
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.QR_SECRET);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw Object.assign(new Error('QR code has expired'), { code: 'QR_EXPIRED' });
    }
    throw Object.assign(new Error('Invalid QR code'), { code: 'QR_INVALID' });
  }

  const qr = await QrCode.findOne({
    where: { token },
    include: [{ model: Visit, as: 'visit', attributes: ['status'] }],
  });

  if (!qr) {
    throw Object.assign(new Error('QR code not found'), { code: 'QR_NOT_FOUND' });
  }

  const visitStatus = qr.visit ? qr.visit.status : null;

  if (qr.is_used) {
    throw Object.assign(new Error('QR code already used'), { code: 'QR_USED' });
  }
  if (isExpired(qr.expires_at)) {
    throw Object.assign(new Error('QR code has expired'), { code: 'QR_EXPIRED' });
  }
  if (visitStatus === 'declined') {
    throw Object.assign(new Error('Visit was declined'), { code: 'VISIT_DECLINED' });
  }
  if (visitStatus === 'expired') {
    throw Object.assign(new Error('Visit has expired'), { code: 'VISIT_EXPIRED' });
  }

  return { qrRecord: qr, visitId: decoded.visitId };
};

const markQRUsed = async (token) => {
  await QrCode.update(
    { is_used: true, used_at: new Date() },
    { where: { token } }
  );
};

module.exports = { createQRCodeRecord, validateQRToken, markQRUsed, generateQRImage };
