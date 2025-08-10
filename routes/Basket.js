const express = require("express");
const router = express.Router();
const { Basket, BasketItem, Product } = require("../models");
const multer = require("multer");
const uploads = multer();

router.post("/basket", uploads.none(), async (req, res) => {
  const { productId, quantity, userId} = req.body;

  if (!productId) {
    return res.status(400).json({ error: "يجب تحديد المنتج" });
  }

  try {
    const product = await Product.findByPk(productId);
    if (!product) {
      return res.status(404).json({ error: "المنتج غير موجود" });
    }

    let basket = await Basket.findOne({ where: { userId } });
    if (!basket) {
      basket = await Basket.create({ userId });
    }

    const basketItems = await BasketItem.findAll({
      where: { basketId: basket.id },
      include: [{ model: Product, attributes: ['userId'] }],
    });

    if (basketItems.length > 0) {
      const currentSellerId = basketItems[0].Product.userId;
      if (product.userId !== currentSellerId) {
        return res.status(400).json({ error: "لا يمكن إضافة منتجات من تجار مختلفين في نفس السلة" });
      }
    }

    let basketItem = basketItems.find(item => item.productId === productId);
    if (basketItem) {
      basketItem.quantity += quantity || 1;
      await basketItem.save();
    } else {
      basketItem = await BasketItem.create({
        basketId: basket.id,
        productId,
        quantity: quantity || 1,
      });
    }

    res.status(200).json({ message: "تمت إضافة المنتج للسلة", basketItem });
  } catch (error) {
    console.error("❌ Error adding to basket:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/basket", uploads.none(), async (req, res) => {
  const userId = req.body.id;

  try {
    const basket = await Basket.findOne({ where: { userId } });
    if (!basket) {
      return res.status(404).json({ error: "السلة غير موجودة" });
    }

    const basketItems = await BasketItem.findAll({
      where: { basketId: basket.id },
      include: [{ model: Product, attributes: ['id', 'name', 'price'] }],
    });

    res.status(200).json({ basket, items: basketItems });
  } catch (error) {
    console.error("❌ Error fetching basket:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.delete("/basket/item/:id", async (req, res) => {
  const userId = req.body.id;
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
