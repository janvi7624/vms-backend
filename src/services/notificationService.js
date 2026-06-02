const { Op } = require('sequelize');
const { Notification, User } = require('../models');
const { SOCKET_EVENTS, NOTIFICATION_TYPES } = require('../config/constants');
const { sendPushNotification } = require('./firebaseService');

let io;

const initializeSocket = (socketIo) => {
  io = socketIo;

  io.on('connection', (socket) => {
    socket.on('join', ({ userId, role }) => {
      socket.join(`user:${userId}`);
      if (['super_admin', 'admin', 'sub_admin'].includes(role)) socket.join('admin');
      console.log(`Socket joined: user:${userId} (${role})`);
    });

    socket.on('temi:join', ({ serial, organizationId }) => {
      socket.join(`temi:${serial}`);
      if (organizationId) socket.join(`temi:${organizationId}`);
      console.log(`Temi joined: temi:${serial}`);
    });

    socket.on('visit:join', ({ visitId }) => {
      socket.join(`visit:${visitId}`);
    });

    socket.on('org:join', ({ organizationId }) => {
      if (organizationId) socket.join(`org:${organizationId}`);
    });

    socket.on('disconnect', () => {
      console.log('Socket disconnected:', socket.id);
    });
  });
};

const createNotification = async ({ userId, visitId, type, title, message }) => {
  const created = await Notification.create({
    user_id: userId,
    visit_id: visitId,
    type,
    title,
    message,
  });
  const notification = created.toJSON();

  if (io) {
    io.to(`user:${userId}`).emit(SOCKET_EVENTS.NOTIFICATION, notification);
  }

  const user = await User.findByPk(userId, { attributes: ['fcm_token'], raw: true });
  if (user?.fcm_token) {
    await sendPushNotification(user.fcm_token, title, message, {
      type,
      visitId: String(visitId ?? ''),
    });
  }

  return notification;
};

// Find all admin/sub_admin users in an org, excluding a specific userId
const findOrgAdmins = async (organizationId, excludeUserId = null) => {
  const where = {
    organization_id: organizationId,
    role: { [Op.in]: ['admin', 'sub_admin'] },
    is_active: true,
  };
  if (excludeUserId) where.id = { [Op.ne]: excludeUserId };
  return User.findAll({ where, attributes: ['id'], raw: true });
};

const notifyVisitRequest = async ({
  employeeId,
  organizationId,
  employeeName,
  visitId,
  visitorName,
  visitorCompany,
}) => {
  const visitorDesc = `${visitorName}${visitorCompany ? ` from ${visitorCompany}` : ''}`;

  // 1. Notify the target employee (host)
  await createNotification({
    userId: employeeId,
    visitId,
    type: NOTIFICATION_TYPES.VISIT_REQUEST,
    title: 'New Visitor Request',
    message: `${visitorDesc} is waiting for your approval.`,
  });

  // 2. Notify every admin / sub_admin in the same org
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

  if (io) {
    io.to(`user:${employeeId}`).emit(SOCKET_EVENTS.VISIT_REQUEST, { visitId, visitorName, visitorCompany });
    io.to('admin').emit(SOCKET_EVENTS.VISIT_REQUEST, { visitId, visitorName, visitorCompany });
  }
};

const notifyVisitApproved = async ({ employeeId, visitId, visitorEmail, visitorName }) => {
  if (io) {
    io.to('admin').emit(SOCKET_EVENTS.VISIT_APPROVED, { visitId, visitorName });
  }
};

const notifyVisitorCheckedIn = async ({
  employeeId,
  organizationId,
  visitId,
  visitorName,
  meetingRoom,
}) => {
  const msg = `${visitorName} has checked in${meetingRoom ? ` and is heading to ${meetingRoom}` : ''}.`;

  // 1. Notify the host employee
  await createNotification({
    userId: employeeId,
    visitId,
    type: NOTIFICATION_TYPES.VISITOR_CHECKED_IN,
    title: 'Visitor Checked In',
    message: msg,
  });

  // 2. Push FCM to all admins / sub_admins in the org
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
    io.to(`user:${employeeId}`).emit(SOCKET_EVENTS.VISITOR_CHECKED_IN, { visitId, visitorName, meetingRoom });
    io.to('admin').emit(SOCKET_EVENTS.VISITOR_CHECKED_IN, { visitId, visitorName, meetingRoom });
  }
};

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

const emitToVisit = (visitId, event, data) => {
  if (io) io.to(`visit:${visitId}`).emit(event, data);
};

module.exports = {
  initializeSocket,
  createNotification,
  notifyVisitRequest,
  notifyVisitApproved,
  notifyVisitorCheckedIn,
  getUnreadNotifications,
  markNotificationsRead,
  emitToVisit,
};
