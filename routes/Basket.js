const express = require("express");
const router = express.Router();
const { Basket, BasketItem, Product } = require("../models");
const multer = require("multer");
const uploads = multer();

router.post("/orders", uploads.none(), async (req, res) => {
  const { phone, address, products, userId} = req.body;

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
      where: { id: productIds }
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

router.get("/basket/:id", uploads.none(), async (req, res) => {
  const userId = req.params.id;

  try {
    const basket = await Basket.findOne({ where: { userId } });

    // لو ما فيه سلة نرجع مصفوفة فارغة
    if (!basket) {
      return res.status(200).json([]);
    }

    const basketItems = await BasketItem.findAll({
      where: { basketId: basket.id },
      include: [{ model: Product, attributes: ['id', 'title', 'price', 'images'] }],
    });

    // نُعيد العناصر كـ JSON عادي (بدون حقل basket)
    const items = basketItems.map(item => ({
      id: item.id,
      productId: item.productId,
      quantity: item.quantity,
      product: item.Product ? item.Product.toJSON() : null,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    }));

    return res.status(200).json(items);
  } catch (error) {
    console.error("❌ Error fetching basket:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.delete("/basket/:userId/item/:id", uploads.none(), async (req, res) => {
  const userId = req.params.userId;
  const itemId = req.params.id;
  try {
    const basket = await Basket.findOne({ where: { userId } });
    if (!basket) {
      return res.status(404).json({ error: "السلة غير موجودة" });
    }

    const basketItem = await BasketItem.findOne({ where: { id: itemId, basketId: basket.id } });
    if (!basketItem) {
      return res.status(404).json({ error: "عنصر السلة غير موجود" });
    }

    await basketItem.destroy();
    res.status(200).json({ message: "تم حذف العنصر من السلة" });
  } catch (error) {
    console.error("❌ Error deleting basket item:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});


module.exports = router;
