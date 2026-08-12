const { SESv2Client, SendEmailCommand } = require('@aws-sdk/client-sesv2');

let client;
const getClient = () => {
  if (!client) {
    client = new SESv2Client({ region: process.env.AWS_REGION || 'ap-south-1' });
  }
  return client;
};

// Low-level SES send — no retry, no queue. Only the email worker should call
// this; everything else goes through emailService.sendEmail -> the queue.
const sesSendEmail = async ({ to, subject, html }) => {
  const cmd = new SendEmailCommand({
    FromEmailAddress: process.env.SES_FROM,
    Destination: { ToAddresses: [to] },
    ConfigurationSetName: process.env.SES_CONFIG_SET || undefined,
    Content: {
      Simple: {
        Subject: { Data: subject, Charset: 'UTF-8' },
        Body: { Html: { Data: html, Charset: 'UTF-8' } },
      },
    },
  });
  const res = await getClient().send(cmd);
  return res.MessageId;
};

module.exports = { sesSendEmail };
