const { ensureQueue, EMAIL_QUEUE_NAME } = require('../queues/emailQueue');
const { sesSendEmail } = require('../services/sesClient');

// Best-effort — never lets a status-tracking failure break the actual send.
const markOtpEmailStatus = async (otpSessionId, status) => {
  if (!otpSessionId) return;
  const { OtpSession } = require('../models');
  await OtpSession.update({ email_status: status }, { where: { id: otpSessionId } }).catch(() => {});
};

const startEmailWorker = async () => {
  const boss = await ensureQueue();
  await boss.work(EMAIL_QUEUE_NAME, async ([job]) => {
    const { to, subject, html, meta } = job.data;
    try {
      const messageId = await sesSendEmail({ to, subject, html });
      console.log(`[Email] Sent — To: ${to} | Subject: ${subject} | MessageId: ${messageId}`);
      await markOtpEmailStatus(meta?.otpSessionId, 'sent');
    } catch (err) {
      // Throwing marks this job failed — pg-boss retries it per the
      // retryLimit/retryBackoff set when it was enqueued (emailQueue.js).
      // If a visitor never gets their OTP email after all retries, the
      // plaintext OTP is still readable by an admin in the app as a fallback.
      console.warn(`[Email] Send failed, will retry per queue policy — To: ${to} | Job: ${job.id} | Error: ${err.message}`);
      // job.retryCount/job.retryLimit are approximate signals for "was this
      // the last attempt" — if we're wrong and it does retry again, a later
      // success still flips this back to 'sent', so it self-corrects.
      if (job.retryCount >= job.retryLimit) {
        await markOtpEmailStatus(meta?.otpSessionId, 'failed');
      }
      throw err;
    }
  });
  console.log('[Email] Worker started (pg-boss)');
};

module.exports = { startEmailWorker };
