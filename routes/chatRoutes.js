const express = require("express");
const router = express.Router();
const { ChatMessage, User } = require("../models");
const { Op } = require("sequelize");

function initChatSocket(io) {
  io.on("connection", (socket) => {
    console.log("🔌 مستخدم متصل بالسوكيت");

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
      } catch (error) {
        console.error("❌ خطأ في إرسال الرسالة:", error);
      }
    });

    socket.on("disconnect", () => {
      console.log("❌ مستخدم قطع الاتصال بالسوكيت");
    });
  });
};

router.get("/MessagesForAdmin", async (req, res) => {
  try {
    const messages = await ChatMessage.findAll({
      include: [
        { model: User, as: "sender", attributes: ["id", "name"] },
        { model: User, as: "receiver", attributes: ["id", "name"] },
      ],
      order: [["createdAt", "ASC"]],
    });

    res.json(messages);
  } catch (error) {
    console.error("❌ خطأ في جلب الرسائل:", error);
    res.status(500).json({ error: "حدث خطأ أثناء جلب الرسائل" });
  }
});

router.get("/MessagesForUser/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    const messages = await ChatMessage.findAll({
      where: {
        [Op.or]: [
          { senderId: userId },
          { receiverId: userId },
        ],
      },
      include: [
        { model: User, as: "sender", attributes: ["id", "name"] },
        { model: User, as: "receiver", attributes: ["id", "name"] },
      ],
      order: [["createdAt", "ASC"]],
    });

    res.json(messages);
  } catch (error) {
    console.error("❌ خطأ في جلب رسائل المستخدم:", error);
    res.status(500).json({ error: "حدث خطأ أثناء جلب رسائل المستخدم" });
  }
});

module.exports = { router, initChatSocket };
