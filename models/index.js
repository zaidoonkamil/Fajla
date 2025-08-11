const User = require("./user");
const UserDevice = require("./user_device");
const Category = require("./category");
const Product = require("./product");
const Favorite = require("./favorites");
const Basket = require("./Basket");
const BasketItem = require("./BasketItem");
const Order = require("./Order");
const OrderItem = require("./OrderItem");
const ChatMessage = require("./ChatMessage");

User.hasMany(Order, { foreignKey: "userId", onDelete: "CASCADE" });
Order.belongsTo(User, { foreignKey: "userId" });

Order.hasMany(OrderItem, { foreignKey: "orderId", onDelete: "CASCADE" });
OrderItem.belongsTo(Order, { foreignKey: "orderId" });

Product.hasMany(OrderItem, { foreignKey: "productId", onDelete: "CASCADE" });
OrderItem.belongsTo(Product, { foreignKey: "productId" });

User.hasOne(Basket, { foreignKey: "userId", onDelete: "CASCADE" });
Basket.belongsTo(User, { foreignKey: "userId" });

Basket.hasMany(BasketItem, { foreignKey: "basketId", onDelete: "CASCADE" });
BasketItem.belongsTo(Basket, { foreignKey: "basketId" });

Product.hasMany(BasketItem, { foreignKey: "productId", onDelete: "CASCADE" });
BasketItem.belongsTo(Product, { foreignKey: "productId" });

User.hasMany(UserDevice, { foreignKey: 'user_id', as: 'devices', onDelete: 'CASCADE' });
UserDevice.belongsTo(User, { foreignKey: 'user_id', as: 'user', onDelete: 'CASCADE' });

Product.belongsTo(User, { foreignKey: "userId", as: "seller", onDelete: 'CASCADE' });
User.hasMany(Product, { foreignKey: "userId", as: "products" , onDelete: 'CASCADE'});

User.belongsToMany(Product, { through: Favorite, foreignKey: "userId", as: "favoriteProducts" , onDelete: 'CASCADE' });
Product.belongsToMany(User, { through: Favorite, foreignKey: "productId", as: "favoritedByUsers", onDelete: 'CASCADE' });

// علاقات الرسائل
ChatMessage.belongsTo(User, { as: "sender", foreignKey: "senderId" , onDelete: 'CASCADE'});
ChatMessage.belongsTo(User, { as: "receiver", foreignKey: "receiverId" , onDelete: 'CASCADE' });

User.hasMany(ChatMessage, { as: "sentMessages", foreignKey: "senderId" , onDelete: 'CASCADE' });
User.hasMany(ChatMessage, { as: "receivedMessages", foreignKey: "receiverId" , onDelete: 'CASCADE'});

Category.hasMany(Product, { foreignKey: "categoryId", as: "products", onDelete: "CASCADE" });
Product.belongsTo(Category, { foreignKey: "categoryId", as: "category", onDelete: "CASCADE" });

Favorite.belongsTo(Product, { foreignKey: "productId", as: "product", onDelete: "CASCADE" });
Product.hasMany(Favorite, { foreignKey: "productId", as: "favorites", onDelete: "CASCADE" });

module.exports = {
  User,
  UserDevice,
  Category,
  Product,
  Favorite,
  Basket,
  BasketItem,
  Order,
  OrderItem,
  ChatMessage,
};
