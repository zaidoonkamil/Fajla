const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Order = sequelize.define("Order", {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  phone: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  address: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  status: {
    type: DataTypes.ENUM("قيد الانتضار", "قيد التوصيل", "مكتمل", "ملغي"),
    allowNull: false,
    defaultValue: "قيد الانتضار",
  },
  totalPrice: {
    type: DataTypes.FLOAT,
    allowNull: false,
  }
}, {
  timestamps: true,
});

module.exports = Order;
