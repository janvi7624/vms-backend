const { EmailSuppression } = require('../models');

const isSuppressed = async (email) => {
  const row = await EmailSuppression.findOne({ where: { email: email.toLowerCase() } });
  return !!row;
};

const suppressEmail = async (email, reason, detail) => {
  await EmailSuppression.upsert({ email: email.toLowerCase(), reason, detail: detail || null });
};

module.exports = { isSuppressed, suppressEmail };
