const express = require("express");
const router = express.Router();
const { ChatMessage, User } = require("../models");
const { Op } = require("sequelize");

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

    // جلب كل الرسائل بين المستخدمين والأدمن بدون تحديد limit
    const messages = await ChatMessage.findAll({
      where: {
        [Op.or]: [
          { senderId: { [Op.notIn]: adminIds }, receiverId: { [Op.in]: adminIds } },
          { senderId: { [Op.in]: adminIds }, receiverId: { [Op.notIn]: adminIds } },
        ],
      },
      include: [
        { model: User, as: "sender", attributes: ["id", "name"] },
        { model: User, as: "receiver", attributes: ["id", "name"] },
      ],
      order: [["createdAt", "DESC"]],
    });

    const usersMap = new Map();

    // نأخذ آخر رسالة لكل مستخدم
    messages.forEach(msg => {
      const user = !adminIds.includes(msg.senderId) ? msg.sender : msg.receiver;
      const userId = user.id;

      if (!usersMap.has(userId)) {
        usersMap.set(userId, { user, lastMessage: msg });
      }
    });

    res.json(Array.from(usersMap.values()));
  } catch (err) {
    console.error("❌ خطأ في جلب المستخدمين مع آخر رسالة:", err);
    res.status(500).json({ error: "حدث خطأ أثناء جلب المستخدمين" });
  }
});


module.exports = { router, initChatSocket };