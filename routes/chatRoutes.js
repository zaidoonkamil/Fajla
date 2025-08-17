const express = require("express");
const router = express.Router();
const { ChatMessage, User } = require("../models");
const { Op } = require("sequelize");

function initChatSocket(io) {
  io.on("connection", (socket) => {
    console.log("🔌 مستخدم متصل بالسوكيت");

    const adminId = 1;

    async function sendChatUsers() {
      const messages = await ChatMessage.findAll({
        attributes: ["senderId", "receiverId"],
        where: {
          [Op.or]: [
            { senderId: adminId },
            { receiverId: adminId }
          ]
        },
        include: [
          { model: User, as: "sender", attributes: ["id", "name"] },
          { model: User, as: "receiver", attributes: ["id", "name"] },
        ],
      });

      const userList = [];
      messages.forEach(msg => {
        if (msg.sender && msg.sender.id !== adminId) userList.push(msg.sender);
        if (msg.receiver && msg.receiver.id !== adminId) userList.push(msg.receiver);
      });

      const uniqueUsers = Array.from(
        new Map(userList.map(u => [u.id, u])).values()
      );

      socket.emit("chatUsers", uniqueUsers);
    }

    sendChatUsers();

    socket.on("sendMessage", async (data) => {
      try {
        const { senderId, receiverId, message } = data;

        const newMessage = await ChatMessage.create({
          senderId,
          receiverId,
          message,
        });

        const fullMessage = await ChatMessage.findOne({
          where: { id: newMessage.id },
          include: [
            { model: User, as: "sender", attributes: ["id", "name"] },
            { model: User, as: "receiver", attributes: ["id", "name"] },
          ],
        });

        io.emit("newMessage", fullMessage);

        sendChatUsers();
      } catch (error) {
        console.error("❌ خطأ في إرسال الرسالة:", error);
      }
    });

    socket.on("disconnect", () => {
      console.log("❌ مستخدم قطع الاتصال بالسوكيت");
    });
  });
}

module.exports = { router, initChatSocket };
