const express = require('express');
const bcrypt = require("bcrypt");
const saltRounds = 10;
const router = express.Router();
const jwt = require('jsonwebtoken');
const multer = require("multer");
const upload = multer();
const { User, UserDevice } = require('../models');
const { Op } = require("sequelize");
const OtpCode = require("../models/OtpCode");
const axios = require('axios');
const uploadImage = require("../middlewares/uploads");
const sequelize = require("../config/db");


router.get("/fixChatMessageTable", async (req, res) => {
  try {
    // تعديل العمود receiverId ليقبل NULL
    await sequelize.query(`
      ALTER TABLE ChatMessages
      MODIFY receiverId INT NULL;
    `);

    res.json({ message: "تم تعديل جدول ChatMessage ليقبل null في receiverId" });
  } catch (error) {
    console.error("❌ خطأ في تعديل الجدول:", error);
    res.status(500).json({ error: error.message });
  }
});

const generateToken = (user) => {
    return jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: '700d' } 
    );
};

function generateOtp() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

function normalizePhone(phone) {
  if (phone.startsWith('0')) {
    return '964' + phone.slice(1);
  }
  return phone;
}

router.post("/send-otp", upload.none(), async (req, res) => {
  const { phone } = req.body;

  try {
    const normalizedPhone = normalizePhone(phone);
    const user = await User.findOne({ where: { phone: normalizedPhone } });
    if (!user) {
      return res.status(404).json({ error: "المستخدم غير موجود" });
    }

    const code = generateOtp();
    const expiryDate = new Date(Date.now() + 1 * 60 * 1000);

    await OtpCode.create({ phone: normalizedPhone, code, expiryDate });

    const messagePayload = {
      messaging_product: "whatsapp",
      to: normalizedPhone,
      type: "template",
      template: {
        name: "fajla_otp",
        language: { code: "ar" },
        components: [
          {
            type: "body",
            parameters: [{ type: "text", text: code.toString() }],
          },
          {
            type: "button",
            sub_type: "url",
            index: "0",
            parameters: [{ type: "text", text: code.toString() }],
          },
        ],
      },
    };

    await axios.post(
      `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      messagePayload,
      {
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    res.status(200).json({ message: "تم إرسال كود التحقق بنجاح" });

  } catch (error) {
    if (error.response) {
      console.error("❌ خطأ في إرسال كود التحقق:", error.response.data);
    } else {
      console.error("❌ خطأ في إرسال كود التحقق:", error.message);
    }
    res.status(500).json({ error: "حدث خطأ أثناء إرسال كود التحقق" });
  }
});

router.post("/verify-otp", upload.none(), async (req, res) => {
  let { phone, code } = req.body;

  try {
    const normalizedPhone = normalizePhone(phone);

    const otp = await OtpCode.findOne({
      where: {
        phone: normalizedPhone,
        code,
        isUsed: false,
        expiryDate: { [Op.gt]: new Date() },
      },
    });

    if (!otp) {
      return res.status(400).json({ error: "كود تحقق غير صالح أو منتهي" });
    }

    otp.isUsed = true;
    await otp.save();

    // ✅ جلب المستخدم قبل التحديث
    const user = await User.findOne({ where: { phone: normalizedPhone } });

    if (!user) {
      return res.status(404).json({ error: "المستخدم غير موجود" });
    }

    user.isVerified = true;
    await user.save();

    console.log("✅ User verified:", normalizedPhone);
    res.status(200).json({ message: "تم تفعيل الحساب بنجاح" });

  } catch (err) {
    console.error("❌ خطأ أثناء التحقق من الكود:", err);
    res.status(500).json({ error: "حدث خطأ داخلي في الخادم" });
  }
});

router.post("/users", uploadImage.array("images", 5), async (req, res) => {
    const { name, location ,password , role = 'user'} = req.body;
    let { phone } = req.body;
    try {
        if (phone.startsWith("0")) {
          phone = "964" + phone.slice(1);
        }

        if (role === "agent" && (!req.files || req.files.length === 0)) {
            return res.status(400).json({ error: "يجب رفع صورة للـ agent" });
        }

        const existingPhone = await User.findOne({ where: { phone } });
        if (!name || !phone || !location || !password) {
          return res.status(400).json({ error: "جميع الحقول مطلوبة" });
        }

        if (existingPhone) {
          return res.status(400).json({ error: "تم استخدام رقم الهاتف من مستخدم اخر" });
        }

        const hashedPassword = await bcrypt.hash(password, saltRounds);
        const images = req.files && Array.isArray(req.files) ? req.files.map(file => file.filename) : [];
        const isVerified = (role === "admin" || role === "agent") ? true : false;

        const user = await User.create({ 
          name, 
          phone, 
          location, 
          password: hashedPassword, 
          role, 
          isVerified,
          image: images.length > 0 ? images[0] : null
        });

        res.status(201).json({
          id: user.id,
          image: user.image,
          name: user.name,
          phone: user.phone,
          location: user.location,
          role: role,
          isVerified: user.isVerified,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt
        });
    } catch (err) {
        console.error("❌ Error creating user:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});


router.post("/login", upload.none(), async (req, res) => {
  const { phone , password } = req.body;
  try {


    if (!phone) {
      return res.status(400).json({ error: "يرجى إدخال رقم الهاتف" });
    }

    const user = await User.findOne({ where: { phone } });
    if (!user) {
      return res.status(400).json({ error: "يرجى إدخال رقم الهاتف بشكل صحيح" });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({ error: "كلمة المرور غير صحيحة" });
    }

    const token = generateToken(user);

    res.status(200).json({
      message: "Login successful",
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        isVerified: user.isVerified,
        role: user.role,
        location: user.location,
      },
      token
    });

  } catch (err) {
    console.error("❌ خطأ أثناء تسجيل الدخول:", err);
    res.status(500).json({ error: "خطأ داخلي في الخادم" });
  }
});

router.delete("/users/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const user = await User.findByPk(id, {
      include: { model: UserDevice, as: "devices" },
    });

    if (!user) {
      return res.status(404).json({ error: "المستخدم غير موجود" });
    }

    await user.destroy(); 

    res.status(200).json({ message: "تم حذف المستخدم وأجهزته بنجاح" });
  } catch (err) {
    console.error("❌ خطأ أثناء الحذف:", err);
    res.status(500).json({ error: "حدث خطأ أثناء عملية الحذف" });
  }
});

router.get("/verify-token", (req, res) => {
  const token = req.headers.authorization;

  if (!token) {
    return res.json({ valid: false, message: "Token is missing" });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.json({ valid: false, message: "Invalid token" });
    }
    return res.json({ valid: true, data: decoded });
  });
});

router.get("/usersOnly", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1; 
    const limit = parseInt(req.query.limit) || 10; 
    const offset = (page - 1) * limit;

    const { count, rows: users } = await User.findAndCountAll({
      where: {
        role: {
          [Op.notIn]: ["admin", "agent"] 
        }
      },
      limit,
      offset,
      order: [["createdAt", "DESC"]]
    });

    const totalPages = Math.ceil(count / limit);

    res.status(200).json({
      users,
      pagination: {
        totalUsers: count,
        currentPage: page,
        totalPages,
        limit
      }
    });
  } catch (err) {
    console.error("❌ Error fetching users with pagination:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/agentsOnly", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1; 
    const limit = parseInt(req.query.limit) || 10; 
    const offset = (page - 1) * limit;

    const { count, rows: users } = await User.findAndCountAll({
      where: {
        role: {
          [Op.notIn]: ["admin", "user"] 
        }
      },
      limit,
      offset,
      order: [["createdAt", "DESC"]]
    });

    const totalPages = Math.ceil(count / limit);

    res.status(200).json({
      users,
      pagination: {
        totalUsers: count,
        currentPage: page,
        totalPages,
        limit
      }
    });
  } catch (err) {
    console.error("❌ Error fetching users with pagination:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/user/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({ error: "المستخدم غير موجود" });
    }
    res.status(200).json(user);
  } catch (err) {
    console.error("❌ Error fetching user:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/profile", async (req, res) => {
  const token = req.headers.authorization;

  if (!token) {
    return res.status(401).json({ error: "Token is missing" });
  }

  jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
    if (err) {
      return res.status(401).json({ error: "Invalid token" });
    }

    try {
      const user = await User.findByPk(decoded.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      res.status(200).json(user);
    } catch (error) {
      console.error("❌ Error fetching user profile:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });
});

module.exports = router;