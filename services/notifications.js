const { User, UserDevice } = require("../models");
const NotificationLog = require("../models/notification_log");
const axios = require("axios");

const sendNotificationToDevices = async (playerIds, message, title = "Notification") => {
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

  return axios.post(url, data, { headers });
};

const sendNotificationToAll = async (message, title = "Notification") => {
  const users = await User.findAll({ attributes: ["id"] });
  for (const user of users) {
    const devices = await UserDevice.findAll({ where: { user_id: user.id } });
    const playerIds = devices.map(d => d.player_id);

    if (playerIds.length === 0) {
      await NotificationLog.create({
        title,
        message,
        target_type: "user",
        target_value: user.id.toString(),
        status: "failed"
      });
      continue;
    }

    try {
      await sendNotificationToDevices(playerIds, message, title);
      await NotificationLog.create({
        title,
        message,
        target_type: "user",
        target_value: user.id.toString(),
        status: "sent"
      });
    } catch (err) {
      console.error(`❌ Error sending notification to user ${user.id}:`, err.message);
      await NotificationLog.create({
        title,
        message,
        target_type: "user",
        target_value: user.id.toString(),
        status: "failed"
      });
    }
  }
};

const sendNotificationToRole = async (role, message, title = "Notification") => {
  const devices = await UserDevice.findAll({
    include: [{
      model: User,
      as: "user",
      where: { role }
    }]
  });

  const devicesByUser = {};
  devices.forEach(d => {
    if (!devicesByUser[d.user_id]) devicesByUser[d.user_id] = [];
    devicesByUser[d.user_id].push(d.player_id);
  });

  for (const [userId, playerIds] of Object.entries(devicesByUser)) {
    try {
      await sendNotificationToDevices(playerIds, message, title);
      await NotificationLog.create({
        title,
        message,
        target_type: "user",
        target_value: userId.toString(),
        status: "sent"
      });
    } catch (err) {
      console.error(`❌ Error sending notification to user ${userId}:`, err.message);
      await NotificationLog.create({
        title,
        message,
        target_type: "user",
        target_value: userId.toString(),
        status: "failed"
      });
    }
  }
};

const sendNotificationToUser = async (userId, message, title = "Notification") => {
  const devices = await UserDevice.findAll({ where: { user_id: userId } });
  const playerIds = devices.map(d => d.player_id);

  if (playerIds.length === 0) {
    await NotificationLog.create({
      title,
      message,
      target_type: "user",
      target_value: userId.toString(),
      status: "failed"
    });
    return { success: false, message: `لا توجد أجهزة للمستخدم ${userId}` };
  }

  try {
    await sendNotificationToDevices(playerIds, message, title);
    await NotificationLog.create({
      title,
      message,
      target_type: "user",
      target_value: userId.toString(),
      status: "sent"
    });
    return { success: true };
  } catch (err) {
    console.error(`❌ Error sending notification to user ${userId}:`, err.message);
    await NotificationLog.create({
      title,
      message,
      target_type: "user",
      target_value: userId.toString(),
      status: "failed"
    });
    return { success: false, error: err.message };
  }
};

module.exports = {
  sendNotificationToAll,
  sendNotificationToRole,
  sendNotificationToUser
};
