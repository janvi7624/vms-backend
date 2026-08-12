const { suppressEmail } = require('../services/suppressionService');

// POST /api/public/ses/events — SNS delivers bounce/complaint/delivery
// notifications here (configured as the event destination on the SES
// configuration set). Body arrives as text/plain, not application/json, so
// the route parses it with express.text() rather than the global JSON parser.
const handleSesEvent = async (req, res) => {
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

    if (body.Type === 'SubscriptionConfirmation' && body.SubscribeURL) {
      console.log('[SES Events] SNS subscription confirmation received — confirming...');
      try {
        await fetch(body.SubscribeURL);
        console.log('[SES Events] SNS subscription confirmed');
      } catch (e) {
        console.error('[SES Events] Auto-confirm failed — visit this URL manually to confirm:', body.SubscribeURL);
      }
      return res.status(200).send('OK');
    }

    if (body.Type === 'Notification') {
      const msg = JSON.parse(body.Message);
      const eventType = msg.eventType || msg.notificationType;

      if (eventType === 'Bounce') {
        // Only permanent (hard) bounces get suppressed — transient ones
        // (e.g. mailbox full) may succeed on a later, unrelated send.
        if (msg.bounce?.bounceType === 'Permanent') {
          for (const r of msg.bounce?.bouncedRecipients || []) {
            await suppressEmail(r.emailAddress, 'bounce', r.diagnosticCode || null);
            console.warn(`[SES Events] Suppressed (hard bounce): ${r.emailAddress}`);
          }
        }
      } else if (eventType === 'Complaint') {
        for (const r of msg.complaint?.complainedRecipients || []) {
          await suppressEmail(r.emailAddress, 'complaint', msg.complaint?.complaintFeedbackType || null);
          console.warn(`[SES Events] Suppressed (complaint): ${r.emailAddress}`);
        }
      }
    }

    res.status(200).send('OK');
  } catch (err) {
    console.error('[SES Events] Error handling event:', err.message);
    // Always 200 — a non-2xx makes SNS retry-storm the endpoint.
    res.status(200).send('OK');
  }
};

module.exports = { handleSesEvent };
