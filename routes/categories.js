const express = require("express");
const router = express.Router();
const { Category, Product, User } = require('../models');
const upload = require("../middlewares/uploads");

router.post("/categories", upload.array("images", 5), async (req, res) => {
  const { name } = req.body;

  if (!name) {
    return res.status(400).json({ error: "اسم القسم مطلوب" });
  }

  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: "يجب رفع صورة واحدة على الأقل" });
  }

  try {
    const images = req.files.map(file => file.filename);

    if (!images || images.length === 0) {
      return res.status(400).json({ error: "يجب رفع صورة واحدة على الأقل" });
    }

    const category = await Category.create({ name, images });

    res.status(201).json(category);
  } catch (error) {
    console.error("❌ Error creating category:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/categories", upload.none(), async (req, res) => {
    try {
        const categories = await Category.findAll();
        res.json(categories);
    } catch (error) {
        console.error("❌ Error fetching categories:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

router.get("/categories/:id", upload.none(), async (req, res) => {
    const categoryId = req.params.id;

    try {
        const category = await Category.findByPk(categoryId);
        if (!category) {
            return res.status(404).json({ error: "القسم غير موجود" });
        }
        res.json(category);
    } catch (error) {
        console.error("❌ Error fetching category:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});


router.get("/categories/:id/products", async (req, res) => {
  const categoryId = req.params.id;
  const userId = parseInt(req.query.userId) || null; 
  let page = parseInt(req.query.page) || 1;
  let pageSize = parseInt(req.query.pageSize) || 10;

  const offset = (page - 1) * pageSize;
  const limit = pageSize;

  try {
    const category = await Category.findByPk(categoryId);

    if (!category) {
      return res.status(404).json({ error: "القسم غير موجود" });
    }

    const include = [
      {
        model: User,
        as: "seller",
        attributes: ["id", "name", "phone", "location", "role", "isVerified", "image"],
      },
    ];

    if (userId) {
      include.push({
        model: User,
        as: "favoritedByUsers",
        where: { id: userId },
        required: false,
        attributes: ["id"],
        through: { attributes: [] },
      });
    }

    const { rows: products, count } = await Product.findAndCountAll({
      where: { categoryId },
      include,
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

    res.json({
      page,
      pageSize,
      totalItems: count,
      totalPages: Math.ceil(count / pageSize),
      products: productsWithFavorite,
    });
  } catch (error) {
    console.error("❌ Error fetching products for category:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.delete("/categories/:id", async (req, res) => {
    const categoryId = req.params.id;

    try {
        const category = await Category.findByPk(categoryId);
        if (!category) {
            return res.status(404).json({ error: "القسم غير موجود" });
        }

        await category.destroy();
        res.json({ message: "تم حذف القسم بنجاح" });
    } catch (error) {
        console.error("❌ Error deleting category:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

module.exports = router;
