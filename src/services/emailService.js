const nodemailer = require('nodemailer');

let transporter;

const getTransporter = () => {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: parseInt(process.env.EMAIL_PORT) || 587,
      secure: parseInt(process.env.EMAIL_PORT) === 465,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
  }
  return transporter;
};

const sendEmail = async ({ to, subject, html }) => {
  if (!process.env.EMAIL_USER) {
    console.log(`[Email Skipped] To: ${to} | Subject: ${subject}`);
    return;
  }
  await getTransporter().sendMail({
    from: process.env.EMAIL_FROM || 'VMS System <noreply@vms.com>',
    to,
    subject,
    html,
  });
};

const sendVisitorInvite = async ({ visitorEmail, visitorName, employeeName, visitDate, secureLink }) => {
  await sendEmail({
    to: visitorEmail,
    subject: 'Your Visit Invitation',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f9f9f9;padding:20px;border-radius:8px">
        <div style="background:#1a1a2e;padding:20px;border-radius:8px 8px 0 0;text-align:center">
          <h1 style="color:#fff;margin:0">Visit Invitation</h1>
        </div>
        <div style="background:#fff;padding:30px;border-radius:0 0 8px 8px">
          <p>Dear <strong>${visitorName}</strong>,</p>
          <p>You have been invited for a visit by <strong>${employeeName}</strong>.</p>
          <p><strong>Scheduled Date:</strong> ${new Date(visitDate).toLocaleString()}</p>
          <p>Please complete your pre-registration by clicking the button below:</p>
          <div style="text-align:center;margin:30px 0">
            <a href="${secureLink}" style="background:#4f46e5;color:#fff;padding:14px 28px;border-radius:6px;text-decoration:none;font-weight:bold">
              Complete Registration
            </a>
          </div>
          <p style="color:#666;font-size:12px">This link expires in 24 hours before your visit.</p>
        </div>
      </div>
    `,
  });
};

const sendQRCode = async ({ visitorEmail, visitorName, qrImageBase64, visitDate, location }) => {
  const qrSrc = qrImageBase64.startsWith('data:') ? qrImageBase64 : `data:image/png;base64,${qrImageBase64}`;
  await sendEmail({
    to: visitorEmail,
    subject: 'Your Visit QR Code',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f9f9f9;padding:20px;border-radius:8px">
        <div style="background:#1a1a2e;padding:20px;border-radius:8px 8px 0 0;text-align:center">
          <h1 style="color:#fff;margin:0">Your Visit QR Code</h1>
        </div>
        <div style="background:#fff;padding:30px;border-radius:0 0 8px 8px;text-align:center">
          <p>Dear <strong>${visitorName}</strong>,</p>
          <p>Your visit is confirmed for <strong>${new Date(visitDate).toLocaleString()}</strong> at <strong>${location}</strong>.</p>
          <p>Please present this QR code to Temi robot at the reception:</p>
          <img src="${qrSrc}" alt="QR Code" style="width:200px;height:200px;margin:20px auto;display:block;border:4px solid #4f46e5;border-radius:8px"/>
          <p style="color:#666;font-size:12px">This QR code is valid for your visit day only. Do not share it.</p>
        </div>
      </div>
    `,
  });
};

const sendVisitDeclined = async ({ visitorEmail, visitorName, reason }) => {
  await sendEmail({
    to: visitorEmail,
    subject: 'Visit Request Declined',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
        <h2 style="color:#dc2626">Visit Request Declined</h2>
        <p>Dear <strong>${visitorName}</strong>,</p>
        <p>Unfortunately, your visit request has been declined.</p>
        ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
        <p>Please contact the office if you have any questions.</p>
      </div>
    `,
  });
};

const sendApprovalNotification = async ({ employeeEmail, employeeName, visitorName, visitorCompany, visitPurpose }) => {
  await sendEmail({
    to: employeeEmail,
    subject: `Visitor Approval Required: ${visitorName}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
        <h2 style="color:#1a1a2e">Visitor Approval Required</h2>
        <p>Dear <strong>${employeeName}</strong>,</p>
        <p>A visitor is waiting for your approval at reception:</p>
        <table style="border-collapse:collapse;width:100%;margin:20px 0">
          <tr><td style="padding:8px;background:#f3f4f6;font-weight:bold">Name</td><td style="padding:8px">${visitorName}</td></tr>
          <tr><td style="padding:8px;background:#f3f4f6;font-weight:bold">Company</td><td style="padding:8px">${visitorCompany || 'N/A'}</td></tr>
          <tr><td style="padding:8px;background:#f3f4f6;font-weight:bold">Purpose</td><td style="padding:8px">${visitPurpose}</td></tr>
        </table>
        <p>Please log in to the VMS portal to approve or decline this visit.</p>
      </div>
    `,
  });
};

const sendOTPCode = async ({ visitorEmail, visitorName, otp, expiresMinutes = 10, visitDate, hostName }) => {
  await sendEmail({
    to: visitorEmail,
    subject: `Your Visit OTP: ${otp}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f9f9f9;padding:20px;border-radius:8px">
        <div style="background:#1a1a2e;padding:20px;border-radius:8px 8px 0 0;text-align:center">
          <h1 style="color:#fff;margin:0">Visit Check-In OTP</h1>
        </div>
        <div style="background:#fff;padding:30px;border-radius:0 0 8px 8px;text-align:center">
          <p style="text-align:left">Dear <strong>${visitorName}</strong>,</p>
          <p style="text-align:left">Your visit${hostName ? ` with <strong>${hostName}</strong>` : ''} has been approved${visitDate ? ` for <strong>${new Date(visitDate).toLocaleString()}</strong>` : ''}.</p>
          <p style="text-align:left">Use the OTP below to check in at the Temi kiosk:</p>
          <div style="background:#1a1a2e;border-radius:12px;padding:24px;margin:24px 0;display:inline-block;min-width:220px">
            <p style="color:#aaa;margin:0 0 8px 0;font-size:12px;letter-spacing:2px;text-transform:uppercase">Your One-Time Password</p>
            <p style="color:#fff;font-size:48px;font-weight:bold;letter-spacing:12px;margin:0;font-family:monospace">${otp}</p>
          </div>
          <p style="color:#dc2626;font-size:13px">This OTP expires in <strong>${expiresMinutes} minutes</strong>. Do not share it.</p>
          <p style="color:#666;font-size:12px;margin-top:24px">If you did not request this visit, please ignore this email.</p>
        </div>
      </div>
    `,
  });
};

// ── Organization registration emails ─────────────────────────────────────────

const sendOrgRegistrationConfirmation = async ({ adminName, adminEmail, orgName }) => {
  await sendEmail({
    to: adminEmail,
    subject: `Organization Registration Received — ${orgName}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f9f9f9;padding:20px;border-radius:8px">
        <div style="background:#1a1a2e;padding:24px;border-radius:8px 8px 0 0;text-align:center">
          <h1 style="color:#fff;margin:0;font-size:22px">VMS Platform</h1>
        </div>
        <div style="background:#fff;padding:30px;border-radius:0 0 8px 8px">
          <p>Dear <strong>${adminName}</strong>,</p>
          <p>Thank you for registering <strong>${orgName}</strong> on the VMS platform.</p>
          <p>Your registration has been received and is currently <strong>pending verification</strong> by our team. We will review your details and notify you once approved.</p>
          <p style="color:#555;font-size:13px">This process typically takes 1–2 business days.</p>
          <p style="margin-top:24px;color:#666;font-size:12px">If you have any questions, please contact support.</p>
        </div>
      </div>
    `,
  });
};

const sendOrgRegistrationToAdmin = async ({ superAdminEmail, superAdminName, orgName, orgEmail, adminName, adminEmail, orgId }) => {
  const dashboardUrl = `${process.env.WEB_URL || 'http://localhost:5173'}/platform`;
  await sendEmail({
    to: superAdminEmail,
    subject: `New Organization Registration — ${orgName}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f9f9f9;padding:20px;border-radius:8px">
        <div style="background:#1a1a2e;padding:24px;border-radius:8px 8px 0 0;text-align:center">
          <h1 style="color:#fff;margin:0;font-size:22px">New Organization Registration</h1>
        </div>
        <div style="background:#fff;padding:30px;border-radius:0 0 8px 8px">
          <p>Dear <strong>${superAdminName}</strong>,</p>
          <p>A new organization has registered and is awaiting your verification.</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0">
            <tr><td style="padding:8px;background:#f5f5f5;font-weight:bold;width:40%">Organization</td><td style="padding:8px">${orgName}</td></tr>
            <tr><td style="padding:8px;background:#f5f5f5;font-weight:bold">Org Email</td><td style="padding:8px">${orgEmail}</td></tr>
            <tr><td style="padding:8px;background:#f5f5f5;font-weight:bold">Admin Name</td><td style="padding:8px">${adminName}</td></tr>
            <tr><td style="padding:8px;background:#f5f5f5;font-weight:bold">Admin Email</td><td style="padding:8px">${adminEmail}</td></tr>
          </table>
          <div style="text-align:center;margin:24px 0">
            <a href="${dashboardUrl}" style="background:#E65C3A;color:#fff;padding:14px 28px;border-radius:6px;text-decoration:none;font-weight:bold">
              Review in Dashboard
            </a>
          </div>
        </div>
      </div>
    `,
  });
};

const sendOrgApprovalEmail = async ({ adminEmail, adminName, orgName }) => {
  await sendEmail({
    to: adminEmail,
    subject: `Your Organization Has Been Approved — ${orgName}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f9f9f9;padding:20px;border-radius:8px">
        <div style="background:#16a34a;padding:24px;border-radius:8px 8px 0 0;text-align:center">
          <h1 style="color:#fff;margin:0;font-size:22px">Organization Approved!</h1>
        </div>
        <div style="background:#fff;padding:30px;border-radius:0 0 8px 8px">
          <p>Dear <strong>${adminName}</strong>,</p>
          <p>Great news! <strong>${orgName}</strong> has been approved on the VMS platform. Your account is now active.</p>
          <p>You can now log in and start managing your organization.</p>
          <div style="text-align:center;margin:24px 0">
            <a href="${process.env.WEB_URL || 'http://localhost:5173'}/login" style="background:#16a34a;color:#fff;padding:14px 28px;border-radius:6px;text-decoration:none;font-weight:bold">
              Log In Now
            </a>
          </div>
        </div>
      </div>
    `,
  });
};

const sendOrgRejectionEmail = async ({ adminEmail, adminName, orgName, reason }) => {
  await sendEmail({
    to: adminEmail,
    subject: `Organization Registration Update — ${orgName}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f9f9f9;padding:20px;border-radius:8px">
        <div style="background:#dc2626;padding:24px;border-radius:8px 8px 0 0;text-align:center">
          <h1 style="color:#fff;margin:0;font-size:22px">Registration Not Approved</h1>
        </div>
        <div style="background:#fff;padding:30px;border-radius:0 0 8px 8px">
          <p>Dear <strong>${adminName}</strong>,</p>
          <p>Unfortunately, the registration for <strong>${orgName}</strong> has not been approved at this time.</p>
          ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
          <p style="color:#555;font-size:13px">Please contact support if you believe this is an error or would like to reapply.</p>
        </div>
      </div>
    `,
  });
};

module.exports = {
  sendVisitorInvite, sendQRCode, sendVisitDeclined, sendApprovalNotification, sendOTPCode,
  sendOrgRegistrationConfirmation, sendOrgRegistrationToAdmin, sendOrgApprovalEmail, sendOrgRejectionEmail,
};
