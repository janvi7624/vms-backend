let admin;
let initialized = false;

function getMessaging() {
  if (initialized) return admin.messaging();

  const projectId   = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey  = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    return null;
  }

  try {
    admin = require('firebase-admin');
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey: privateKey.replace(/\\n/g, '\n'),
      }),
    });
    initialized = true;
    console.log('[FCM] Firebase Admin initialized');
    return admin.messaging();
  } catch (e) {
    console.error('[FCM] Init error:', e.message);
    return null;
  }
}

async function sendPushNotification(fcmToken, title, body, data = {}) {
  if (!fcmToken) return;
  const messaging = getMessaging();
  if (!messaging) return;

  try {
    await messaging.send({
      token: fcmToken,
      notification: { title, body },
      data: Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, String(v ?? '')])
      ),
      android: {
        priority: 'high',
        notification: { sound: 'default' },
      },
    });
    console.log(`[FCM] ✅ Sent to ...${fcmToken.slice(-8)}: ${title}`);
  } catch (e) {
    if (e.code === 'messaging/registration-token-not-registered') {
      console.warn('[FCM] Token expired:', fcmToken.slice(-8));
    } else {
      console.error('[FCM] Send error:', e.message);
    }
  }
}

module.exports = { sendPushNotification };
