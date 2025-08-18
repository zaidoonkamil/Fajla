require('dotenv').config();
const express = require('express');
const router = express.Router();
const multer = require("multer");
const upload = multer();
const axios = require('axios');
const { User, UserDevice } = require('../models'); 
const NotificationLog = require("../models/notification_log");
const { Op } = require("sequelize");
const { sendNotificationToAll,  sendNotificationToRole, sendNotificationToUser} = require('../services/notifications');

require('dotenv').config();
const express = require('express');
const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST || 'localhost',
    dialect: 'mysql',
    logging: false,
  }
);

router.get("/cleanup-indexes", async (req, res) => {
  try {
    // نتأكد من الاتصال
    await sequelize.authenticate();

    // 1. جلب كل الفهارس على العمود player_id
    const [indexes] = await sequelize.query(
      "SHOW INDEX FROM user_devices WHERE Column_name = 'player_id'"
    );

    if (indexes.length <= 1) {
      return res.json({ message: "✅ لا توجد فهارس مكررة، كل شيء نظيف" });
    }

    // 2. نحتفظ بأول index ونمسح الباقي
    const keep = indexes[0].Key_name;
    const duplicates = indexes.slice(1).map(i => i.Key_name);

    for (const dup of duplicates) {
      await sequelize.query(`ALTER TABLE user_devices DROP INDEX \`${dup}\``);
    }

    return res.json({
      message: "🧹 تم تنظيف الفهارس المكررة",
      kept: keep,
      dropped: duplicates
    });
  } catch (err) {
    console.error("❌ Error cleaning indexes:", err);
    res.status(500).json({ error: err.message });
  }
});


router.post("/register-device", async (req, res) => {
  const { user_id, player_id } = req.body;

  if (!user_id || !player_id) {
    return res.status(400).json({ error: "user_id و player_id مطلوبان" });
  }

  try {
    let device = await UserDevice.findOne({ where: { player_id } });

    if (device) {
      device.user_id = user_id;
      await device.save();
    } else {
      await UserDevice.create({ user_id, player_id });
    }

    res.json({ success: true, message: "تم تسجيل الجهاز بنجاح" });
  } catch (error) {
    console.error("❌ Error registering device:", error);
    res.status(500).json({ error: "حدث خطأ أثناء تسجيل الجهاز" });
  }
});

router.post("/notification", upload.none(), async (req, res) => {
  try {
    const { target_type, target_value, message, title } = req.body;

    if (!target_type || !message || !title) {
      return res.status(400).json({ error: "الحقول مطلوبة: target_type, message, title" });
    }

    let result;

    if (target_type === "all") {
      result = await sendNotificationToAll(message, title);
    } else if (target_type === "role") {
      if (!target_value) return res.status(400).json({ error: "يجب إدخال اسم الدور" });
      result = await sendNotificationToRole(target_value, message, title);
    } else if (target_type === "user") {
      if (!target_value) return res.status(400).json({ error: "يجب إدخال userId" });
      result = await sendNotificationToUser(target_value, message, title);
    } else {
      return res.status(400).json({ error: "target_type غير صحيح (all, role, user)" });
    }

    res.json({ success: true, result });
  } catch (err) {
    console.error("❌ Error sending notification:", err);
    res.status(500).json({ error: "خطأ في السيرفر", details: err.message });
  }
});


router.get("/notifications-log", async (req, res) => {
  const { role, user_id, page = 1, limit = 10 } = req.query;

  try {
    const whereCondition = {
      [Op.or]: [{ target_type: 'all' }],
    };

    if (role) {
      whereCondition[Op.or].push({ target_type: 'role', target_value: role });
    }

    if (user_id) {
      whereCondition[Op.or].push({ target_type: 'user', user_id });
    }

    const offset = (page - 1) * limit;

    const { count, rows: logs } = await NotificationLog.findAndCountAll({
      where: whereCondition,
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset),
    });

    res.json({
      total: count,
      page: parseInt(page),
      totalPages: Math.ceil(count / limit),
      logs
    });

  } catch (err) {
    console.error("❌ Error fetching notification logs:", err);
    res.status(500).json({ error: "خطأ أثناء جلب السجل" });
  }
});


module.exports = router;
