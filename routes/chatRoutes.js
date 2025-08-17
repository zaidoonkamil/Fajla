const express = require("express");
const router = express.Router();
const { ChatMessage, User } = require("../models");
const { Op } = require("sequelize");

function initChatSocket(io) {
  const userSockets = new Map();

  io.on("connection", (socket) => {
    const { userId } = socket.handshake.query;
    console.log(`🔌 مستخدم متصل بالسوكيت: ${userId}`);

    if (!userSockets.has(userId)) userSockets.set(userId, []);
    userSockets.get(userId).push(socket.id);

    socket.on("sendMessage", async (data) => {
      try {
        const { senderId, receiverId, message } = data;

        // إنشاء الرسالة في قاعدة البيانات
        const newMessage = await ChatMessage.create({
          senderId,
          receiverId: receiverId || null,
          message,
        });

        // جلب الرسالة كاملة مع بيانات المرسل والمستقبل
        const fullMessage = await ChatMessage.findOne({
          where: { id: newMessage.id },
          include: [
            { model: User, as: "sender", attributes: ["id", "name"] },
            { model: User, as: "receiver", attributes: ["id", "name"] },
          ],
        });

        let recipients = [];

        if (!receiverId) {
          // رسالة عامة: كل الأدمن + المرسل نفسه
          const admins = await User.findAll({ where: { role: "admin" }, attributes: ["id"] });
          recipients = [...admins.map(a => a.id), senderId]; // <-- أضف senderId هنا
        } else {
          // رسالة خاصة: المرسل + المستقبل
          recipients = [senderId, receiverId];
        }

        // إرسال الرسالة لكل المستلمين
        recipients.forEach(id => {
          const sockets = userSockets.get(id.toString()) || [];
          sockets.forEach(sid => io.to(sid).emit("newMessage", fullMessage));
        });

      } catch (error) {
        console.error("❌ خطأ في إرسال الرسالة:", error);
      }
    });

    socket.on("disconnect", () => {
      console.log(`❌ مستخدم قطع الاتصال: ${userId}`);
      const sockets = userSockets.get(userId) || [];
      userSockets.set(userId, sockets.filter(id => id !== socket.id));
    });
  });
}

// ------------------- API -------------------

router.post("/sendMessage", async (req, res) => {
  try {
    const { senderId, receiverId, message } = req.body;

    if (!senderId || !message) {
      return res.status(400).json({ error: "البيانات غير كاملة" });
    }

    const finalReceiverId = receiverId && receiverId !== 0 ? receiverId : null;

    const newMessage = await ChatMessage.create({
      senderId,
      receiverId: finalReceiverId,
      message,
    });

    const fullMessage = await ChatMessage.findOne({
      where: { id: newMessage.id },
      include: [
        { model: User, as: "sender", attributes: ["id", "name"] },
        { model: User, as: "receiver", attributes: ["id", "name"] },
      ],
    });

    res.json(fullMessage);
  } catch (err) {
    console.error("❌ خطأ في إرسال الرسالة:", err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/MessagesForUser/:userId", async (req, res) => {
  const { userId } = req.params;
  const user = await User.findByPk(userId);

  if (!user) return res.status(404).json({ error: "المستخدم غير موجود" });

  let whereCondition;

  if (user.role === "admin") {
    whereCondition = {
      [Op.or]: [
        { senderId: userId },
        { receiverId: userId },
        { receiverId: null }, // رسائل عامة
      ],
    };
  } else {
    whereCondition = {
      [Op.or]: [
        { senderId: userId },
        { receiverId: userId },
      ],
    };
  }

  const messages = await ChatMessage.findAll({
    where: whereCondition,
    include: [
      { model: User, as: "sender", attributes: ["id", "name"] },
      { model: User, as: "receiver", attributes: ["id", "name"] },
    ],
    order: [["createdAt", "ASC"]],
  });

  res.json(messages);
});

router.get("/UsersWithLastMessage", async (req, res) => {
  try {
    const admins = await User.findAll({ where: { role: "admin" }, attributes: ["id"] });
    const adminIds = admins.map(a => a.id);

    const messages = await ChatMessage.findAll({
      where: {
        [Op.or]: [
          { senderId: { [Op.in]: adminIds } },
          { receiverId: { [Op.in]: adminIds } },
        ],
      },
      include: [
        { model: User, as: "sender", attributes: ["id", "name"] },
        { model: User, as: "receiver", attributes: ["id", "name"] },
      ],
      order: [["createdAt", "DESC"]],
    });

    const usersMap = new Map();

    messages.forEach(msg => {
      if (!adminIds.includes(msg.senderId) && msg.sender) {
        if (!usersMap.has(msg.senderId)) usersMap.set(msg.senderId, { user: msg.sender, lastMessage: msg });
      }
      if (!adminIds.includes(msg.receiverId) && msg.receiver) {
        if (!usersMap.has(msg.receiverId)) usersMap.set(msg.receiverId, { user: msg.receiver, lastMessage: msg });
      }
    });

    res.json(Array.from(usersMap.values()));
  } catch (error) {
    console.error("❌ خطأ في جلب المستخدمين مع آخر رسالة:", error);
    res.status(500).json({ error: "حدث خطأ أثناء جلب المستخدمين مع آخر رسالة" });
  }
});

module.exports = { router, initChatSocket };
