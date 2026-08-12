const { ensureStarted } = require('./boss');

const EMAIL_QUEUE_NAME = 'email-send';

let queueReady;
const ensureQueue = async () => {
  const boss = await ensureStarted();
  if (!queueReady) queueReady = boss.createQueue(EMAIL_QUEUE_NAME);
  await queueReady;
  return boss;
};

// Enqueues an email for background delivery via the email worker. Enqueuing
// only fails if Postgres itself is unreachable — the actual SES send (and
// its retries) happen off the request path so a slow/failed send can never
// turn into a failed login/OTP request.
//
// `meta` is optional job metadata the worker can act on after sending — used
// today by OTP emails (meta.otpSessionId) so the worker can record delivery
// status back onto the OtpSession row for staff dashboards to display.
const enqueueEmail = async ({ to, subject, html, meta }) => {
  const boss = await ensureQueue();
  await boss.send(
    EMAIL_QUEUE_NAME,
    { to, subject, html, meta },
    {
      retryLimit: 4,
      retryDelay: 5, // seconds; grows with retryBackoff below
      retryBackoff: true, // exponential: ~5s, 10s, 20s, 40s
      expireInSeconds: 3600,
    }
  );
};

module.exports = { EMAIL_QUEUE_NAME, enqueueEmail, ensureQueue };
