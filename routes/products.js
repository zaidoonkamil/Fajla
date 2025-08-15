const express = require("express");
const router = express.Router();
const {Product, User} = require("../models");
const upload = require("../middlewares/uploads");

router.post("/products", upload.array("images", 5), async (req, res) => {
    const { title, description, price, userId, categoryId} = req.body;

    if (!title || !price) {
      return res.status(400).json({ error: "العنوان والسعر مطلوبان" });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "يجب رفع صورة واحدة على الأقل" });
    }

    try {
      const images = req.files.map((file) => file.filename);

      const product = await Product.create({
        title,
        description,
        price,
        images,
        userId,
        categoryId,
      });

      res.status(201).json(product);
    } catch (error) {
      console.error("❌ Error creating product:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  }
);

router.get("/products/:id", async (req, res) => {
  const userId = req.params.id; 

  try {
    let { page, limit } = req.query;
    page = parseInt(page) || 1;
    limit = parseInt(limit) || 10;
    const offset = (page - 1) * limit;

    const { count, rows: products } = await Product.findAndCountAll({
      include: [
        {
          model: User,
          as: "seller",
          attributes: ["id", "name", "phone", "location", "role", "isVerified", "image"],
        },
        {
          model: User,
          as: "favoritedByUsers",
          where: { id: userId },
          required: false,   
          attributes: ["id"],
          through: { attributes: [] }, 
        },
      ],
      limit,
      offset,
      order: [["createdAt", "DESC"]],
    });

    const productsWithFavorite = products.map(product => {
      const isFavorite = product.favoritedByUsers && product.favoritedByUsers.length > 0;
      const prodJson = product.toJSON();
      prodJson.isFavorite = isFavorite;
      delete prodJson.favoritedByUsers;
      return prodJson;
    });

    const totalPages = Math.ceil(count / limit);

    res.json({
      totalItems: count,
      totalPages,
      currentPage: page,
      products: productsWithFavorite,
    });
  } catch (error) {
    console.error("❌ Error fetching products:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/productItem/:id", async (req, res) => {
  try {
    const product = await Product.findByPk(req.params.id, {
      include: {
        model: User,
        as: "seller",
        attributes: ["id", "name", "phone", "location", "role", "isVerified", "image"],
      },
    });

    if (!product) {
      return res.status(404).json({ error: "المنتج غير موجود" });
    }

    res.json(product);
  } catch (error) {
    console.error("❌ Error fetching product:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.delete("/products/:id", async (req, res) => {
  try {
    const product = await Product.findByPk(req.params.id);
    if (!product) {
      return res.status(404).json({ error: "المنتج غير موجود" });
    }

    await product.destroy();
    res.status(204).send();
  } catch (error) {
    console.error("❌ Error deleting product:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/products/seller/:sellerId", async (req, res) => {
  const sellerId = req.params.sellerId;

  try {
    let { page, limit } = req.query;
    page = parseInt(page) || 1;
    limit = parseInt(limit) || 10;
    const offset = (page - 1) * limit;

    const { count, rows: products } = await Product.findAndCountAll({
      where: { userId: sellerId }, 
      include: [
        {
          model: User,
          as: "seller",
          attributes: [
            "id",
            "name",
            "phone",
            "location",
            "role",
            "isVerified",
            "image",
          ],
        },
      ],
      limit,
      offset,
      order: [["createdAt", "DESC"]],
    });

    const totalPages = Math.ceil(count / limit);

    res.json({
      totalItems: count,
      totalPages,
      currentPage: page,
      products,
    });
  } catch (error) {
    console.error("❌ Error fetching seller products:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

module.exports = router;
