const { ChatMessage, User } = require("../models");
const { Op } = require("sequelize");

function initChatSocket(io) {
  // تخزين الـ sockets لكل مستخدم
  const userSockets = new Map();

  io.on("connection", (socket) => {
    const { userId } = socket.handshake.query;
    if (!userId) return socket.disconnect(true);

    console.log(`🔌 User connected: ${userId}`);
    const uid = userId.toString();

    if (!userSockets.has(uid)) userSockets.set(uid, []);
    userSockets.get(uid).push(socket.id);

    // جلب الرسائل عند الاتصال
    socket.on("getMessages", async () => {
      try {
        const user = await User.findByPk(uid);
        if (!user) return;

        const whereCondition = user.role === "admin" ? {
          [Op.or]: [
            { senderId: uid },
            { receiverId: uid },
            { receiverId: null }
          ]
        } : {
          [Op.or]: [
            { senderId: uid },
            { receiverId: uid }
          ]
        };

        const messages = await ChatMessage.findAll({
          where: whereCondition,
          include: [
            { model: User, as: "sender", attributes: ["id", "name"] },
            { model: User, as: "receiver", attributes: ["id", "name"] }
          ],
          order: [["createdAt", "ASC"]],
        });

        socket.emit("messagesLoaded", messages);

      } catch (err) {
        console.error("❌ Failed to load messages:", err);
      }
    });

    // استقبال الرسائل وإرسالها للمستلمين
    socket.on("sendMessage", async (data) => {
      try {
        const { senderId, receiverId, message } = data;
        if (!senderId || !message) return;

        const newMessage = await ChatMessage.create({
          senderId,
          receiverId: receiverId || null,
          message
        });

        const fullMessage = await ChatMessage.findOne({
          where: { id: newMessage.id },
          include: [
            { model: User, as: "sender", attributes: ["id", "name"] },
            { model: User, as: "receiver", attributes: ["id", "name"] }
          ]
        });

        // تحديد المستلمين
        let recipients = [];
        if (!receiverId) {
          // رسالة عامة: كل الأدمن + المرسل
          const admins = await User.findAll({ where: { role: "admin" }, attributes: ["id"] });
          recipients = [...admins.map(a => a.id), senderId];
        } else {
          recipients = [senderId, receiverId];
        }

        // إرسال الرسالة لكل المستلمين المتصلين
        recipients.forEach(id => {
          const sockets = userSockets.get(id.toString()) || [];
          sockets.forEach(sid => io.to(sid).emit("newMessage", fullMessage));
        });

      } catch (err) {
        console.error("❌ Failed to send message:", err);
      }
    });

    // فصل الاتصال
    socket.on("disconnect", () => {
      console.log(`❌ User disconnected: ${uid}`);
      const sockets = userSockets.get(uid) || [];
      userSockets.set(uid, sockets.filter(id => id !== socket.id));
    });
  });
}

module.exports = { initChatSocket };
