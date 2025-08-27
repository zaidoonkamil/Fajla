const express = require("express");
const router = express.Router();
const { Order, OrderItem, Product, Basket, BasketItem, User} = require("../models");
const multer = require("multer");
const uploads = multer();
const { Op } = require("sequelize");
const { sendNotificationToUser } = require("../services/notifications");

router.get("/orders/admin/status", async (req, res) => {
  const allowedStatuses = ["قيد الانتضار", "قيد التوصيل", "مكتمل", "ملغي"];
  const status = (req.query.status || "").trim();
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 40;
  const offset = (page - 1) * limit;

  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({ error: "حالة الطلب غير صحيحة" });
  }

  try {
    const { rows: orders, count: totalItems } = await Order.findAndCountAll({
      where: { status: { [Op.eq]: status } },
      order: [["createdAt", "DESC"]],
      offset,
      limit,
      include: [
        {
          model: OrderItem,
          include: [
            {
              model: Product,
              attributes: ["id", "title", "price", "images", "userId"],
              include: [
                {
                  model: User,
                  as: "seller",
                  attributes: [
                    "id", "name", "phone", "location",
                    "role", "isVerified", "image"
                  ],
                },
              ],
            },
          ],
        },
      ],
    });

    const ordersData = orders.map(order => {
      const totalItemsOrder = order.OrderItems.reduce((sum, item) => sum + item.quantity, 0);
      const totalPrice = order.OrderItems.reduce((sum, item) => sum + (item.quantity * item.priceAtOrder), 0);

      return {
        id: order.id,
        phone: order.phone,
        address: order.address,
        status: order.status,
        createdAt: order.createdAt,
        totalItems: totalItemsOrder,
        totalPrice,
        items: order.OrderItems.map(item => ({
          id: item.id,
          quantity: item.quantity,
          priceAtOrder: item.priceAtOrder,
          product: {
            id: item.Product.id,
            title: item.Product.title,
            price: item.Product.price,
            images: item.Product.images,
            seller: item.Product.seller,
          },
        })),
      };
    }).filter(order => order.items.length > 0);

    const totalPages = Math.ceil(totalItems / limit);

    res.json({
      orders: ordersData,
      paginationOrders: {
        currentPage: page,
        totalPages,
        totalItems
      }
    });
  } catch (error) {
    console.error("❌ Error fetching admin orders by status:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/agent/orders/status", async (req, res) => {
  const allowedStatuses = ["قيد الانتضار", "قيد التوصيل", "مكتمل", "ملغي"];
  const status = (req.query.status || "").trim();
  const agentId = parseInt(req.query.agentId);
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 40;
  const offset = (page - 1) * limit;

  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({ error: "حالة الطلب غير صحيحة" });
  }

  try {
    const { rows: orders, count: totalItems } = await Order.findAndCountAll({
      where: { status: { [Op.eq]: status } },
      order: [["createdAt", "DESC"]],
      offset,
      limit,
      include: [
        {
          model: OrderItem,
          include: [
            {
              model: Product,
              where: { userId: { [Op.eq]: agentId } },
              attributes: ["id", "title", "price", "images", "userId"],
              include: [
                {
                  model: User,
                  as: "seller",
                  attributes: [
                    "id", "name", "phone", "location",
                    "role", "isVerified", "image"
                  ],
                },
              ],
            },
          ],
        },
      ],
    });

    const filteredOrders = orders.filter(order => order.OrderItems.length > 0);

    const ordersData = filteredOrders.map(order => {
      const totalItemsOrder = order.OrderItems.reduce((sum, item) => sum + item.quantity, 0);
      const totalPrice = order.OrderItems.reduce((sum, item) => sum + (item.quantity * item.priceAtOrder), 0);

      return {
        id: order.id,
        phone: order.phone,
        address: order.address,
        status: order.status,
        createdAt: order.createdAt,
        totalItems: totalItemsOrder,
        totalPrice,
        items: order.OrderItems.map(item => ({
          id: item.id,
          quantity: item.quantity,
          priceAtOrder: item.priceAtOrder,
          product: {
            id: item.Product.id,
            title: item.Product.title,
            price: item.Product.price,
            images: item.Product.images,
            seller: item.Product.seller,
          },
        })),
      };
    });

    const totalPages = Math.ceil(totalItems / limit);

    res.json({
      orders: ordersData,
      paginationOrdersUser: {
        currentPage: page,
        totalPages,
        totalItems
      }
    });
  } catch (error) {
    console.error("❌ Error fetching agent orders by status:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/orders/:userId", uploads.none(), async (req, res) => {
  const userId = req.params.userId;
  const { phone, address, products } = req.body;

  if (!phone || !address) {
    return res.status(400).json({ error: "رقم الهاتف والعنوان مطلوبان" });
  }

  if (!products || !Array.isArray(products) || products.length === 0) {
    return res.status(400).json({ error: "يجب تمرير قائمة المنتجات مع الكميات" });
  }

  try {
    for (const item of products) {
      if (typeof item.productId !== "number" || typeof item.quantity !== "number" || item.quantity <= 0) {
        return res.status(400).json({ error: "بيانات المنتجات غير صحيحة" });
      }
    }

    const productIds = products.map(p => p.productId);
    const dbProducts = await Product.findAll({
      where: { id: productIds },
      include: [{ model: User, as: "seller" }] 
    });

    if (dbProducts.length !== products.length) {
      return res.status(400).json({ error: "منتجات غير موجودة في النظام" });
    }

    let totalPrice = 0;
    products.forEach(item => {
      const prod = dbProducts.find(p => p.id === item.productId);
      totalPrice += prod.price * item.quantity;
    });

    const order = await Order.create({
      userId,
      phone,
      address,
      totalPrice,
      status: "قيد الانتضار"
    });

    for (const item of products) {
      const prod = dbProducts.find(p => p.id === item.productId);
      await OrderItem.create({
        orderId: order.id,
        productId: item.productId,
        quantity: item.quantity,
        priceAtOrder: prod.price,
      });
      if (prod.seller) {
        const message = `تم طلب منتجك: ${prod.name} (الكمية: ${item.quantity})`;
        const title = "طلب جديد";
        await sendNotificationToUser(prod.seller.id, message, title);
      }
    }

    const basket = await Basket.findOne({ where: { userId } });
    if (basket) {
      await BasketItem.destroy({ where: { basketId: basket.id } });
    }

    return res.status(201).json({
      message: "تم إنشاء الطلب بنجاح",
      orderId: order.id,
    });
  } catch (error) {
    console.error("❌ Error creating order:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.patch("/orders/:orderId/status", uploads.none(), async (req, res) => {
  const { orderId } = req.params;
  const { status } = req.body;

  const allowedStatuses = ["قيد الانتضار", "قيد التوصيل", "مكتمل", "ملغي"];

  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({ error: "حالة الطلب غير صحيحة" });
  }

  try {
    const order = await Order.findByPk(orderId, {
      include: [{ model: User, as: "user" }]
    });

    if (!order) {
      return res.status(404).json({ error: "الطلب غير موجود" });
    }

    order.status = status;
    await order.save();

    let notificationResult = null;

    if (order.user) {
      const message = `تم تحديث حالة طلبك إلى: ${status}`;
      const title = "تحديث حالة الطلب";
      notificationResult = await sendNotificationToUser(order.user.id, message, title);

      console.log("🔔 Notification result:", notificationResult);
    } else {
      console.log("⚠️ الطلب موجود لكن ما رجع معه مستخدم مرتبط.");
    }

    res.status(200).json({ 
      message: "تم تحديث حالة الطلب", 
      order, 
      notificationResult 
    });

  } catch (error) {
    console.error("❌ Error updating order status:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});


router.get("/orders/:userId", uploads.none(), async (req, res) => {
  const userId = req.params.userId; 

  if (!userId) {
    return res.status(400).json({ error: "يرجى تحديد معرف المستخدم userId" });
  }

  let page = parseInt(req.query.page) || 1;
  let limit = parseInt(req.query.limit) || 20;
  if (page < 1) page = 1;

  const offset = (page - 1) * limit;

  try {
    const { count, rows: orders } = await Order.findAndCountAll({
      where: { userId },
      limit,
      offset,
      order: [["createdAt", "DESC"]],
      include: [{
        model: OrderItem,
        include: [{
          model: Product,
          attributes: ['price']
        }]
      }],
    });

    const ordersData = orders.map(order => {
      const totalItems = order.OrderItems.reduce((sum, item) => sum + item.quantity, 0);
      const totalPrice = order.OrderItems.reduce((sum, item) => sum + (item.quantity * item.priceAtOrder), 0);

      return {
        id: order.id,
        createdAt: order.createdAt,
        totalItems,
        totalPrice,
        status: order.status,
      };
    });

    const totalPages = Math.ceil(count / limit);

    res.json({
      totalItems: count,
      totalPages,
      currentPage: page,
      orders: ordersData,
    });
  } catch (error) {
    console.error("❌ Error fetching orders:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});


module.exports = router;