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
    const devices = await UserDevice.findAll({
      include: [{
        model: User,
        as: "user",
        where: { role }
      }]
    });

    if (!devices || devices.length === 0) {
      return { success: false, message: `لا توجد أجهزة للمستخدمين برول ${role}` };
    }

    const devicesByUser = {};
    devices.forEach(device => {
      const userId = device.user_id;
      if (!devicesByUser[userId]) devicesByUser[userId] = [];
      devicesByUser[userId].push(device.player_id);
    });

    for (const [userId, playerIds] of Object.entries(devicesByUser)) {
      const url = 'https://onesignal.com/api/v1/notifications';
      const headers = {
        'Authorization': `Basic ${process.env.ONESIGNAL_API_KEY}`,
        'Content-Type': 'application/json',
      };
      const data = {
        app_id: process.env.ONESIGNAL_APP_ID,
        include_player_ids: playerIds,
        contents: { en: message },
        headings: { en: title },
      };

      try {
        await axios.post(url, data, { headers });
        await NotificationLog.create({
          title,
          message,
          target_type: "user",
          target_value: userId.toString(),
          status: "sent"
        });
      } catch (err) {
        console.error(`❌ Error sending notification to user ${userId}:`, err.response ? err.response.data : err.message);
        await NotificationLog.create({
          title,
          message,
          target_type: "user",
          target_value: userId.toString(),
          status: "failed"
        });
      }
    }

    return { success: true };

  } catch (error) {
    console.error(`❌ Error sending notifications to role ${role}:`, error);
    return { success: false, error: error.message };
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
