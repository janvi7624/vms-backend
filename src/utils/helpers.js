const crypto = require('crypto');

const generateSecureToken = (length = 32) =>
  crypto.randomBytes(length).toString('hex');

const addHours = (date, hours) => {
  const result = new Date(date);
  result.setHours(result.getHours() + hours);
  return result;
};

const isExpired = (expiresAt) => new Date() > new Date(expiresAt);

const formatVisitForResponse = (visit) => ({
  ...visit,
  scheduled_at: visit.scheduled_at ? new Date(visit.scheduled_at).toISOString() : null,
  checked_in_at: visit.checked_in_at ? new Date(visit.checked_in_at).toISOString() : null,
  checked_out_at: visit.checked_out_at ? new Date(visit.checked_out_at).toISOString() : null,
  created_at: new Date(visit.created_at).toISOString(),
});

const createError = (message, status = 400) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

module.exports = { generateSecureToken, addHours, isExpired, formatVisitForResponse, createError };
