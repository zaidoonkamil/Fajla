const axios = require('axios');
const UserDevice = require("../models/user_device");
const User = require("../models/user");
const NotificationLog = require("../models/notification_log");

const sendNotification = async (message, heading) => {
  if (!message || typeof message !== 'string' || message.trim() === '') {
      console.error('❌ message مطلوب ويجب أن يكون نصًا غير فارغ');
      return;
  }

  try {
    const users = await User.findAll({ attributes: ['id'] });
    const playerIds = [];
    for (const user of users) {
      const devices = await UserDevice.findAll({ where: { user_id: user.id } });
      playerIds.push(...devices.map(d => d.player_id));

      await NotificationLog.create({
        title: heading,
        message,
        target_type: "all",
        user_id: user.id,
        status: devices.length > 0 ? "sent" : "failed"
      });
    }

    if (playerIds.length > 0) {
      await axios.post('https://onesignal.com/api/v1/notifications', {
        app_id: process.env.ONESIGNAL_APP_ID,
        include_player_ids: playerIds,
        contents: { en: message },
        headings: { en: heading },
      }, {
        headers: {
          'Authorization': `Basic ${process.env.ONESIGNAL_API_KEY}`,
          'Content-Type': 'application/json',
        }
      });
    }

    console.log("✅ Notification sent to all users and logged");

  } catch (error) {
    console.error('❌ Error sending notification to all users:', error.response?.data || error.message);
  }
};

const sendNotificationToRole = async (role, message, title = "Notification") => {
  if (!message) throw new Error("message مطلوب");
  if (!role) throw new Error("role مطلوب");

  try {
    const users = await User.findAll({ where: { role }, attributes: ['id'] });

    for (const user of users) {
      const devices = await UserDevice.findAll({ where: { user_id: user.id } });
      const playerIds = devices.map(d => d.player_id);

      await NotificationLog.create({
        title,
        message,
        target_type: "role",
        target_value: role,
        user_id: user.id,
        status: playerIds.length > 0 ? "sent" : "failed"
      });

      if (playerIds.length > 0) {
        await axios.post('https://onesignal.com/api/v1/notifications', {
          app_id: process.env.ONESIGNAL_APP_ID,
          include_player_ids: playerIds,
          contents: { en: message },
          headings: { en: title },
        }, {
          headers: {
            'Authorization': `Basic ${process.env.ONESIGNAL_API_KEY}`,
            'Content-Type': 'application/json',
          }
        });
      }
    }

    console.log(`✅ Notification sent to all users with role ${role} and logged`);
  } catch (error) {
    console.error(`❌ Error sending notification to role ${role}:`, error.response?.data || error.message);
  }
};

const sendNotificationToUser = async (userId, message, title = "Notification") => {
  if (!message) throw new Error("message مطلوب");
  if (!userId) throw new Error("userId مطلوب");

  try {
    const devices = await UserDevice.findAll({ where: { user_id: userId } });
    const playerIds = devices.map(d => d.player_id);

    await NotificationLog.create({
      title,
      message,
      target_type: "user",
      user_id: userId,
      status: playerIds.length > 0 ? "sent" : "failed"
    });

    if (playerIds.length > 0) {
      await axios.post('https://onesignal.com/api/v1/notifications', {
        app_id: process.env.ONESIGNAL_APP_ID,
        include_player_ids: playerIds,
        contents: { en: message },
        headings: { en: title },
      }, {
        headers: {
          'Authorization': `Basic ${process.env.ONESIGNAL_API_KEY}`,
          'Content-Type': 'application/json',
        }
      });
    }

    console.log(`✅ Notification sent to user ${userId} and logged`);

  } catch (error) {
    console.error(`❌ Error sending notification to user ${userId}:`, error.response?.data || error.message);
  }
};

module.exports = {
  sendNotification,
  sendNotificationToRole,
  sendNotificationToUser,
};
