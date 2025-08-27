const express = require("express");
const router = express.Router();
const { ChatMessage, User } = require("../models");
const { Op } = require("sequelize");
const { sendNotificationToRole } = require("../services/notifications.js"); 
const { sendNotificationToUser } = require("../services/notifications.js"); 

function initChatSocket(io) {
  const userSockets = new Map();

  io.on("connection", (socket) => {
    const { userId } = socket.handshake.query;
    if (!userId) return socket.disconnect(true);

    console.log(`🔌 مستخدم متصل: ${userId}`);
    if (!userSockets.has(userId)) userSockets.set(userId, []);
    userSockets.get(userId).push(socket.id);

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

    socket.on("sendMessage", async (data) => {
      try {
        const { senderId, receiverId, message } = data;
        if (!senderId || !message) return;

        // إنشاء الرسالة
        const newMessage = await ChatMessage.create({
          senderId,
          receiverId: receiverId || null,
          message,
        });

        // جلب بيانات المرسل والمستقبل
        const fullMessage = await ChatMessage.findOne({
          where: { id: newMessage.id },
          include: [
            { model: User, as: "sender", attributes: ["id", "name", "role"] },
            { model: User, as: "receiver", attributes: ["id", "name", "role"] },
          ],
        });

        // تحديد المستلمين
        let recipients = [];

        if (!receiverId) {
          // الرسالة لجميع الأدمن + المرسل
          const admins = await User.findAll({ where: { role: "admin" }, attributes: ["id"] });
          recipients = [...admins.map(a => a.id), senderId];

          await sendNotificationToRole(
            "admin",
            fullMessage.message,
            `رسالة جديدة من ${fullMessage.sender?.name || "مستخدم"}`
          );
        } else {
          recipients = [senderId, receiverId];

          // تحقق من أن المرسل هو أدمن لإرسال إشعار للمستخدم
          if (fullMessage.sender.role === "admin") {
            await sendNotificationToUser(
              receiverId,
              fullMessage.message,
              `رسالة جديدة من الأدمن ${fullMessage.sender?.name || ""}`
            );
          }
        }

        // إرسال الرسالة مباشرة لكل sockets المستلمين
        recipients.forEach(id => {
          const sockets = userSockets.get(id.toString()) || [];
          sockets.forEach(sid => io.to(sid).emit("newMessage", fullMessage));
        });

        // **إرسال الرسالة للمرسل نفسه فورًا (خصوصًا للأدمن)**
        const senderSockets = userSockets.get(senderId.toString()) || [];
        senderSockets.forEach(sid => io.to(sid).emit("newMessage", fullMessage));

      } catch (err) {
        console.error("❌ خطأ في إرسال الرسالة:", err);
      }
    });


    socket.on("disconnect", () => {
      console.log(`❌ مستخدم قطع الاتصال: ${userId}`);
      const sockets = userSockets.get(userId) || [];
      userSockets.set(userId, sockets.filter(id => id !== socket.id));
    });
  });
}

router.get("/usersWithLastMessage", async (req, res) => {
  try {
    const admins = await User.findAll({ where: { role: "admin" }, attributes: ["id"] });
    const adminIds = admins.map(a => a.id);

    const messages = await ChatMessage.findAll({
      where: {
        [Op.or]: [
          { senderId: { [Op.notIn]: adminIds }, receiverId: { [Op.in]: adminIds } }, 
          { senderId: { [Op.in]: adminIds }, receiverId: { [Op.notIn]: adminIds } }, 
          { senderId: { [Op.notIn]: adminIds }, receiverId: null },
        ],
      },
      include: [
        { model: User, as: "sender", attributes: ["id", "name"] },
        { model: User, as: "receiver", attributes: ["id", "name"] },
      ],
      order: [["createdAt", "DESC"]],
      limit: 50,
    });

    const usersMap = new Map();

    messages.forEach(msg => {
      if (!adminIds.includes(msg.senderId) && msg.sender) {
        if (!usersMap.has(msg.senderId)) {
          usersMap.set(msg.senderId, { user: msg.sender, lastMessage: msg });
        }
      }

      // إذا المستقبل ليس أدمن ونفس الرسالة ليست null
      if (msg.receiverId && !adminIds.includes(msg.receiverId) && msg.receiver) {
        if (!usersMap.has(msg.receiverId)) {
          usersMap.set(msg.receiverId, { user: msg.receiver, lastMessage: msg });
        }
      }
    });

    res.json(Array.from(usersMap.values()));
  } catch (err) {
    console.error("❌ خطأ في جلب المستخدمين مع آخر رسالة:", err);
    res.status(500).json({ error: "حدث خطأ أثناء جلب المستخدمين" });
  }
});



module.exports = { router, initChatSocket };