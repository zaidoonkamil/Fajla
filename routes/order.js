const express = require("express");
const router = express.Router();
const { Basket, BasketItem, Order, OrderItem, Product } = require("../models");
const multer = require("multer");
const uploads = multer();

router.post("/orders", uploads.none(), async (req, res) => {
  const userId = req.user.id;
  const { phone, address } = req.body;

  if (!phone || !address) {
    return res.status(400).json({ error: "رقم الهاتف والعنوان مطلوبان" });
  }

  try {
    const basket = await Basket.findOne({ where: { userId } });
    if (!basket) {
      return res.status(400).json({ error: "السلة فارغة" });
    }

    const basketItems = await BasketItem.findAll({
      where: { basketId: basket.id },
      include: [{ model: Product }],
    });

    if (basketItems.length === 0) {
      return res.status(400).json({ error: "السلة فارغة" });
    }

    let totalPrice = 0;
    basketItems.forEach(item => {
      totalPrice += item.quantity * item.Product.price;
    });

    const order = await Order.create({
      userId,
      phone,
      address,
      totalPrice,
      status: "قيد الانتضار",
    });

    for (const item of basketItems) {
      await OrderItem.create({
        orderId: order.id,
        productId: item.productId,
        quantity: item.quantity,
        priceAtOrder: item.Product.price,
      });
    }

    await BasketItem.destroy({ where: { basketId: basket.id } });

    res.status(201).json({ message: "تم إنشاء الطلب بنجاح", orderId: order.id });
  } catch (error) {
    console.error("❌ Error creating order:", error);
    res.status(500).json({ error: "Internal Server Error" });
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
    const order = await Order.findByPk(orderId);

    if (!order) {
      return res.status(404).json({ error: "الطلب غير موجود" });
    }

    order.status = status;
    await order.save();

    res.status(200).json({ message: "تم تحديث حالة الطلب", order });
  } catch (error) {
    console.error("❌ Error updating order status:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/orders", uploads.none(), async (req, res) => {
  const userId = req.query.userId; 

  if (!userId) {
    return res.status(400).json({ error: "يرجى تحديد معرف المستخدم userId" });
  }

  let page = parseInt(req.query.page) || 1;
  let limit = parseInt(req.query.limit) || 10;
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

router.get("/orders/status/:status", async (req, res) => {
  const allowedStatuses = ["قيد الانتضار", "قيد التوصيل", "مكتمل", "ملغي"];
  const status = req.params.status;

  const page = parseInt(req.query.page) || 1; 
  const limit = parseInt(req.query.limit) || 10; 
  const offset = (page - 1) * limit;

  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({ error: "حالة الطلب غير صحيحة" });
  }

  try {
    const { count, rows: orders } = await Order.findAndCountAll({
      where: { status },
      order: [["createdAt", "DESC"]],
      limit,
      offset,
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
                  attributes: ["id", "name", "phone", "location", "role", "isVerified", "image"],
                },
              ],
            },
          ],
        },
      ],
    });

    const ordersData = orders.map(order => {
      const totalItems = order.OrderItems.reduce((sum, item) => sum + item.quantity, 0);
      const totalPrice = order.OrderItems.reduce((sum, item) => sum + (item.quantity * item.priceAtOrder), 0);

      const items = order.OrderItems.map(item => ({
        id: item.id,
        quantity: item.quantity,
        priceAtOrder: item.priceAtOrder,
        product: {
          id: item.Product.id,
          title: item.Product.title,
          price: item.Product.price,
          images: item.Product.images,
          seller: item.Product.seller,
        }
      }));

      return {
        id: order.id,
        phone: order.phone,
        address: order.address,
        status: order.status,
        createdAt: order.createdAt,
        totalItems,
        totalPrice,
        items,
      };
    });

    res.json({
      totalOrders: count,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
      orders: ordersData
    });

  } catch (error) {
    console.error("❌ Error fetching orders by status:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/agent/orders/status/:status/:agentId", async (req, res) => {
  const allowedStatuses = ["قيد الانتضار", "قيد التوصيل", "مكتمل", "ملغي"];
  const { status, agentId } = req.params;

  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({ error: "حالة الطلب غير صحيحة" });
  }

  try {
    const orders = await Order.findAll({
      where: { status },
      order: [["createdAt", "DESC"]],
      include: [
        {
          model: OrderItem,
          include: [
            {
              model: Product,
              where: { userId: agentId },
              attributes: ["id", "title", "price", "images", "userId"],
              include: [
                {
                  model: User,
                  as: "seller",
                  attributes: ["id", "name", "phone", "location", "role", "isVerified", "image"],
                },
              ],
            },
          ],
        },
      ],
    });

    const filteredOrders = orders.filter(order => order.OrderItems.length > 0);

    const ordersData = filteredOrders.map(order => {
      const totalItems = order.OrderItems.reduce((sum, item) => sum + item.quantity, 0);
      const totalPrice = order.OrderItems.reduce((sum, item) => sum + (item.quantity * item.priceAtOrder), 0);

      return {
        id: order.id,
        phone: order.phone,
        address: order.address,
        status: order.status,
        createdAt: order.createdAt,
        totalItems,
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

    res.json(ordersData);
  } catch (error) {
    console.error("❌ Error fetching agent orders by status:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});


module.exports = router;