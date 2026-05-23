module.exports = {
  ROLES: {
    PLATFORM_SUPER_ADMIN: 'platform_super_admin',
    ORG_SUPER_ADMIN:      'org_super_admin',
    ORG_ADMIN:            'org_admin',
    ADMIN:                'admin',
    EMPLOYEE:             'employee',
    SECURITY:             'security',
  },
  VISIT_TYPES: {
    PRE_PLANNED: 'pre_planned',
    IMPROMPTU:   'impromptu',
  },
  VISIT_STATUS: {
    PENDING:    'pending',
    APPROVED:   'approved',
    DECLINED:   'declined',
    CHECKED_IN: 'checked_in',
    COMPLETED:  'completed',
    EXPIRED:    'expired',
  },
  NOTIFICATION_TYPES: {
    VISIT_REQUEST:      'visit_request',
    VISIT_APPROVED:     'visit_approved',
    VISIT_DECLINED:     'visit_declined',
    VISITOR_ARRIVED:    'visitor_arrived',
    VISITOR_CHECKED_IN: 'visitor_checked_in',
  },
  OTP: {
    LENGTH:           6,
    EXPIRY_MINUTES:   10,
    MAX_ATTEMPTS:     3,
  },
  // QR kept for backward compat with existing pre-planned visits
  QR_EXPIRY: {
    PRE_PLANNED_HOURS: parseInt(process.env.QR_PREPLANNED_EXPIRY_HOURS) || 24,
    IMPROMPTU_HOURS:   parseInt(process.env.QR_IMPROMPTU_EXPIRY_HOURS)  || 2,
  },
  SOCKET_EVENTS: {
    VISIT_REQUEST:      'visit:request',
    VISIT_APPROVED:     'visit:approved',
    VISIT_DECLINED:     'visit:declined',
    VISITOR_CHECKED_IN: 'visit:checked_in',
    NOTIFICATION:       'notification',
    OTP_APPROVED:       'visit:otp_approved',
  },
};
