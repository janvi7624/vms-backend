const { Op } = require('sequelize');
const { Notification } = require('../models');
const { SOCKET_EVENTS, NOTIFICATION_TYPES } = require('../config/constants');

let io;

const initializeSocket = (socketIo) => {
  io = socketIo;

  io.on('connection', (socket) => {
    socket.on('join', ({ userId, role }) => {
      socket.join(`user:${userId}`);
      if (['admin','org_admin','org_super_admin'].includes(role)) socket.join('admin');
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

    // Kiosk joins org room to receive OTP approval events
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

  return notification;
};

const notifyVisitRequest = async ({ employeeId, visitId, visitorName, visitorCompany }) => {
  await createNotification({
    userId: employeeId,
    visitId,
    type: NOTIFICATION_TYPES.VISIT_REQUEST,
    title: 'New Visitor Request',
    message: `${visitorName}${visitorCompany ? ` from ${visitorCompany}` : ''} is waiting for your approval.`,
  });

  if (io) {
    io.to(`user:${employeeId}`).emit(SOCKET_EVENTS.VISIT_REQUEST, { visitId, visitorName, visitorCompany });
  }
};

const notifyVisitApproved = async ({ employeeId, visitId, visitorEmail, visitorName }) => {
  if (io) {
    io.to('admin').emit(SOCKET_EVENTS.VISIT_APPROVED, { visitId, visitorName });
  }
};

const notifyVisitorCheckedIn = async ({ employeeId, visitId, visitorName, meetingRoom }) => {
  await createNotification({
    userId: employeeId,
    visitId,
    type: NOTIFICATION_TYPES.VISITOR_CHECKED_IN,
    title: 'Visitor Checked In',
    message: `${visitorName} has checked in${meetingRoom ? ` and is heading to ${meetingRoom}` : ''}.`,
  });

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
