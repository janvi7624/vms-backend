const { Op } = require('sequelize');
const { Notification, User } = require('../models');
const { SOCKET_EVENTS, NOTIFICATION_TYPES } = require('../config/constants');
const { sendPushNotification } = require('./firebaseService');

let io;

// ── Socket initialization ─────────────────────────────────────────────────────

const initializeSocket = (socketIo) => {
  io = socketIo;

  io.on('connection', (socket) => {
    // User/staff room — join with userId and role
    socket.on('join', ({ userId, role, organizationId }) => {
      socket.join(`user:${userId}`);
      if (['super_admin', 'admin', 'sub_admin'].includes(role)) {
        socket.join('admin');
      }
      if (organizationId) {
        socket.join(`org:${organizationId}`);
      }
      // Store metadata on socket for reconnect handling
      socket.data.userId = userId;
      socket.data.role = role;
      socket.data.organizationId = organizationId;
    });

    // Temi robot room
    socket.on('temi:join', ({ serial, organizationId }) => {
      socket.join(`temi:${serial}`);
      if (organizationId) socket.join(`temi:org:${organizationId}`);
    });

    // Visit-specific room (kiosk watching a specific visit)
    socket.on('visit:join', ({ visitId }) => {
      if (visitId) socket.join(`visit:${visitId}`);
    });

    // Org room (explicit join)
    socket.on('org:join', ({ organizationId }) => {
      if (organizationId) socket.join(`org:${organizationId}`);
    });

    // Client requests to leave a visit room (e.g. kiosk resets)
    socket.on('visit:leave', ({ visitId }) => {
      if (visitId) socket.leave(`visit:${visitId}`);
    });

    socket.on('disconnect', () => {
      // rooms are auto-cleaned by Socket.IO on disconnect
    });
  });
};

// ── DB notification + push helper ─────────────────────────────────────────────

const createNotification = async ({ userId, visitId, type, title, message }) => {
  const created = await Notification.create({
    user_id: userId,
    visit_id: visitId,
    type,
    title,
    message,
  });
  const notification = created.toJSON();

  // Real-time push to the specific user's socket room
  if (io) {
    io.to(`user:${userId}`).emit(SOCKET_EVENTS.NOTIFICATION, notification);
  }

  // Firebase push notification (mobile background)
  const user = await User.findByPk(userId, { attributes: ['fcm_token'], raw: true });
  if (user?.fcm_token) {
    await sendPushNotification(user.fcm_token, title, message, {
      type,
      visitId: String(visitId ?? ''),
    }).catch(() => {});
  }

  return notification;
};

// ── Org admin helper ──────────────────────────────────────────────────────────

const findOrgAdmins = async (organizationId, excludeUserId = null) => {
  const where = {
    organization_id: organizationId,
    role: { [Op.in]: ['admin', 'sub_admin'] },
    is_active: true,
  };
  if (excludeUserId) where.id = { [Op.ne]: excludeUserId };
  return User.findAll({ where, attributes: ['id'], raw: true });
};

// ── Emit helpers ──────────────────────────────────────────────────────────────

const emitToVisit = (visitId, event, data) => {
  if (io) io.to(`visit:${visitId}`).emit(event, data);
};

const emitToAdmin = (event, data) => {
  if (io) io.to('admin').emit(event, data);
};

const emitToUser = (userId, event, data) => {
  if (io) io.to(`user:${userId}`).emit(event, data);
};

const emitToOrg = (organizationId, event, data) => {
  if (io) io.to(`org:${organizationId}`).emit(event, data);
};

// Broadcast an analytics refresh signal — frontends re-fetch stats on receipt
const emitAnalyticsUpdate = (organizationId) => {
  if (!io) return;
  const payload = { organizationId, ts: Date.now() };
  io.to('admin').emit(SOCKET_EVENTS.ANALYTICS_UPDATE, payload);
  if (organizationId) io.to(`org:${organizationId}`).emit(SOCKET_EVENTS.ANALYTICS_UPDATE, payload);
};

// ── Visit lifecycle notifications ─────────────────────────────────────────────

const notifyVisitRequest = async ({
  employeeId,
  organizationId,
  employeeName,
  visitId,
  visitorName,
  visitorCompany,
}) => {
  const visitorDesc = `${visitorName}${visitorCompany ? ` from ${visitorCompany}` : ''}`;
  const payload = { visitId, visitorName, visitorCompany, organizationId };

  // 1. Notify the host employee
  await createNotification({
    userId: employeeId,
    visitId,
    type: NOTIFICATION_TYPES.VISIT_REQUEST,
    title: 'New Visitor Request',
    message: `${visitorDesc} is waiting for your approval.`,
  });

  // 2. Notify every admin/sub_admin in the org
  if (organizationId) {
    const admins = await findOrgAdmins(organizationId, employeeId);
    const staffTag = employeeName ? ` to meet ${employeeName}` : '';
    await Promise.allSettled(
      admins.map((admin) =>
        createNotification({
          userId: admin.id,
          visitId,
          type: NOTIFICATION_TYPES.VISIT_REQUEST,
          title: 'New Visit Request',
          message: `${visitorDesc} has requested a visit${staffTag}.`,
        })
      )
    );
  }

  // 3. Socket broadcast
  if (io) {
    io.to(`user:${employeeId}`).emit(SOCKET_EVENTS.VISIT_REQUEST, payload);
    io.to('admin').emit(SOCKET_EVENTS.VISIT_REQUEST, payload);
    if (organizationId) io.to(`org:${organizationId}`).emit(SOCKET_EVENTS.VISIT_REQUEST, payload);
  }

  emitAnalyticsUpdate(organizationId);
};

const notifyVisitApproved = async ({ employeeId, visitId, visitorName, organizationId, meetingRoom }) => {
  const payload = { visitId, visitorName, meetingRoom, organizationId };

  // Create a DB notification for the approver's own record (visible in notification bell)
  if (employeeId) {
    await createNotification({
      userId: employeeId,
      visitId,
      type: NOTIFICATION_TYPES.VISIT_APPROVED,
      title: 'Visit Approved',
      message: `You approved ${visitorName}'s visit${meetingRoom ? ` → ${meetingRoom}` : ''}.`,
    }).catch(() => {});
  }

  if (io) {
    io.to('admin').emit(SOCKET_EVENTS.VISIT_APPROVED, payload);
    if (organizationId) io.to(`org:${organizationId}`).emit(SOCKET_EVENTS.VISIT_APPROVED, payload);
  }

  emitAnalyticsUpdate(organizationId);
};

const notifyVisitDeclined = async ({ employeeId, visitId, visitorName, organizationId, reason }) => {
  const payload = { visitId, visitorName, reason, organizationId };

  if (io) {
    io.to('admin').emit(SOCKET_EVENTS.VISIT_DECLINED, payload);
    if (organizationId) io.to(`org:${organizationId}`).emit(SOCKET_EVENTS.VISIT_DECLINED, payload);
    // Notify kiosk watching this visit
    io.to(`visit:${visitId}`).emit(SOCKET_EVENTS.VISIT_DECLINED, payload);
  }

  emitAnalyticsUpdate(organizationId);
};

const notifyVisitorCheckedIn = async ({
  employeeId,
  organizationId,
  visitId,
  visitorName,
  meetingRoom,
}) => {
  const msg = `${visitorName} has checked in${meetingRoom ? ` and is heading to ${meetingRoom}` : ''}.`;
  const payload = { visitId, visitorName, meetingRoom, organizationId };

  // 1. Notify host employee
  await createNotification({
    userId: employeeId,
    visitId,
    type: NOTIFICATION_TYPES.VISITOR_CHECKED_IN,
    title: 'Visitor Checked In',
    message: msg,
  });

  // 2. Notify all admins/sub_admins
  if (organizationId) {
    const admins = await findOrgAdmins(organizationId, employeeId);
    await Promise.allSettled(
      admins.map((admin) =>
        createNotification({
          userId: admin.id,
          visitId,
          type: NOTIFICATION_TYPES.VISITOR_CHECKED_IN,
          title: 'Visitor Checked In',
          message: msg,
        })
      )
    );
  }

  if (io) {
    io.to(`user:${employeeId}`).emit(SOCKET_EVENTS.VISITOR_CHECKED_IN, payload);
    io.to('admin').emit(SOCKET_EVENTS.VISITOR_CHECKED_IN, payload);
    if (organizationId) io.to(`org:${organizationId}`).emit(SOCKET_EVENTS.VISITOR_CHECKED_IN, payload);
  }

  emitAnalyticsUpdate(organizationId);
};

const notifyVisitCompleted = async ({ employeeId, organizationId, visitId, visitorName }) => {
  const msg = `${visitorName}'s visit has been completed.`;
  const payload = { visitId, visitorName, organizationId };

  if (employeeId) {
    await createNotification({
      userId: employeeId,
      visitId,
      type: NOTIFICATION_TYPES.VISITOR_CHECKED_OUT,
      title: 'Visit Completed',
      message: msg,
    }).catch(() => {});
  }

  if (io) {
    io.to('admin').emit(SOCKET_EVENTS.VISIT_COMPLETED, payload);
    if (organizationId) io.to(`org:${organizationId}`).emit(SOCKET_EVENTS.VISIT_COMPLETED, payload);
    io.to(`visit:${visitId}`).emit(SOCKET_EVENTS.VISIT_COMPLETED, payload);
  }

  emitAnalyticsUpdate(organizationId);
};

const notifyServiceRequest = async ({ serial, item = 'refreshment', organizationId, requestId }) => {
  const label   = item.charAt(0).toUpperCase() + item.slice(1);
  const title   = `${label} Request`;
  const message = `A visitor at Temi (${serial}) has requested ${item}.`;

  if (organizationId) {
    const where = {
      organization_id: organizationId,
      role: { [Op.in]: ['admin', 'sub_admin'] },
      is_active: true,
    };
    const staff = await User.findAll({ where, attributes: ['id'], raw: true });
    await Promise.allSettled(
      staff.map((s) =>
        createNotification({
          userId:  s.id,
          visitId: null,
          type:    NOTIFICATION_TYPES.SERVICE_REQUEST,
          title,
          message,
        })
      )
    );
  }

  if (io) {
    io.to('admin').emit(SOCKET_EVENTS.TEMI_SERVICE_REQUEST, { requestId, serial, item, title, message });
    if (organizationId) io.to(`org:${organizationId}`).emit(SOCKET_EVENTS.TEMI_SERVICE_REQUEST, { requestId, serial, item, title, message });
  }
};

// ── Notifications CRUD ────────────────────────────────────────────────────────

const getUnreadNotifications = async (userId) => {
  return Notification.findAll({
    where: { user_id: userId },
    order: [['created_at', 'DESC']],
    limit: 50,
    raw: true,
  });
};

const markNotificationsRead = async (userId, notificationIds) => {
  const where = { user_id: userId };
  if (notificationIds && notificationIds.length > 0) {
    where.id = { [Op.in]: notificationIds };
  }
  await Notification.update({ is_read: true }, { where });
};

module.exports = {
  initializeSocket,
  createNotification,
  notifyVisitRequest,
  notifyVisitApproved,
  notifyVisitDeclined,
  notifyVisitorCheckedIn,
  notifyVisitCompleted,
  notifyServiceRequest,
  getUnreadNotifications,
  markNotificationsRead,
  emitToVisit,
  emitToAdmin,
  emitToUser,
  emitToOrg,
  emitAnalyticsUpdate,
};
