module.exports = {
  ROLES: {
    SUPER_ADMIN:  'super_admin',
    ADMIN:        'admin',
    SUB_ADMIN:    'sub_admin',
    EMPLOYEE:     'employee',
    RECEPTIONIST: 'receptionist',
    CLIENT:       'client',
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
    VISITOR_CHECKED_OUT:'visitor_checked_out',
    SERVICE_REQUEST:    'service_request',
    ANNOUNCEMENT:       'announcement',
    EMERGENCY:          'emergency',
    EMPLOYEE_CHANGED:   'employee_changed',
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
    // Visit lifecycle
    VISIT_REQUEST:        'visit:request',
    VISIT_APPROVED:       'visit:approved',
    VISIT_DECLINED:       'visit:declined',
    VISITOR_CHECKED_IN:   'visit:checked_in',
    VISIT_COMPLETED:      'visit:completed',
    OTP_APPROVED:         'visit:otp_approved',
    // Notifications
    NOTIFICATION:         'notification',
    // Dashboard / analytics
    ANALYTICS_UPDATE:     'analytics:update',
    STATS_UPDATE:         'stats:update',
    // Employee management
    EMPLOYEE_CHANGED:     'employee:changed',
    // Temi robot
    TEMI_SERVICE_REQUEST: 'temi:service_request',
    TEMI_STATUS:          'temi:status',
    TEMI_LOCATIONS_SYNCED:'temi:locations_synced',
    TEMI_COMMAND:         'temi:command',
    TEMI_ESCORT:          'temi:escort',
    TEMI_ERROR:           'temi:error',
    // Announcements & alerts
    ANNOUNCEMENT:         'announcement',
    EMERGENCY:            'emergency',
    // Receptionist
    SERVICE_REQUEST_NEW:  'service_request:new',
    SERVICE_FOLLOWUP:     'service_request:followup',
    SERVICE_FULFILLED:    'service_request:fulfilled',
  },
};
