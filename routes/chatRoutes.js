const express = require("express");
const router = express.Router();
const { ChatMessage, User } = require("../models");
const { Op } = require("sequelize");

// الاحتفاظ بسوكيتات المستخدمين والأدمن
function initChatSocket(io) {
  const userSockets = new Map(); // لكل مستخدم عدة جلسات
  const adminSockets = new Set(); // كل سوكيتات الأدمن

  io.on("connection", (socket) => {
    const { userId, role } = socket.handshake.query;
    if (!userId) return socket.disconnect(true);

    console.log(`🔌 متصل: ${userId}, role: ${role}`);

    // تخزين السوكيت
    if (role === "admin") {
      adminSockets.add(socket.id);
    } else {
      if (!userSockets.has(userId)) userSockets.set(userId, []);
      userSockets.get(userId).push(socket.id);
    }

    // إرسال الرسائل عند الطلب
    socket.on("getMessages", async () => {
      try {
        const messages = await ChatMessage.findAll({
          order: [["createdAt", "ASC"]],
          include: [
            { model: User, as: "sender", attributes: ["id", "name"] },
            { model: User, as: "receiver", attributes: ["id", "name"] },
          ],
        });
        socket.emit("messagesLoaded", messages);
      } catch (err) {
        console.error("❌ خطأ في جلب الرسائل:", err);
      }
    });

    // إرسال رسالة جديدة
    socket.on("sendMessage", async (data) => {
      try {
        const { senderId, receiverId, message } = data;
        if (!senderId || !message) return;

        const newMessage = await ChatMessage.create({
          senderId,
          receiverId: receiverId || null,
          message,
        });

        const fullMessage = await ChatMessage.findOne({
          where: { id: newMessage.id },
          include: [
            { model: User, as: "sender", attributes: ["id", "name"] },
            { model: User, as: "receiver", attributes: ["id", "name"] },
          ],
        });

        // إرسال الرسالة مباشرة للمستلمين
        let recipients = [];
        if (!receiverId) {
          const admins = await User.findAll({ where: { role: "admin" }, attributes: ["id"] });
          recipients = [...admins.map(a => a.id), senderId];
        } else {
          recipients = [senderId, receiverId];
        }

        recipients.forEach(id => {
          const sockets = userSockets.get(id.toString()) || [];
          sockets.forEach(sid => io.to(sid).emit("newMessage", fullMessage));
        });

        // تحديث قائمة الأدمن realtime
        const usersWithLastMessage = await getUsersWithLastMessage();
        adminSockets.forEach(sid => io.to(sid).emit("usersWithLastMessage", usersWithLastMessage));

      } catch (err) {
        console.error("❌ خطأ في إرسال الرسالة:", err);
      }
    });

    // فصل الاتصال
    socket.on("disconnect", () => {
      console.log(`❌ قطع الاتصال: ${userId}`);
      if (role === "admin") {
        adminSockets.delete(socket.id);
      } else {
        const sockets = userSockets.get(userId) || [];
        userSockets.set(userId, sockets.filter(id => id !== socket.id));
      }
    });
  });
}

// دالة لجلب المستخدمين مع آخر رسالة لكل منهم
async function getUsersWithLastMessage() {
  const admins = await User.findAll({ where: { role: "admin" }, attributes: ["id"] });
  const adminIds = admins.map(a => a.id);

  const messages = await ChatMessage.findAll({
    where: {
      [Op.or]: [
        { senderId: { [Op.notIn]: adminIds } },
        { receiverId: { [Op.notIn]: adminIds } },
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

  return Array.from(usersMap.values());
}

module.exports = { router, initChatSocket };
