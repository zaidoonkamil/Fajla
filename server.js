const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const sequelize = require("./config/db");

const usersRouter = require("./routes/user");
const adsRouter = require("./routes/ads");
const categoriesRouter = require("./routes/categories");
const favoritedRouter = require("./routes/favorites");
const orderRouter = require("./routes/Order");
const BasketRouter = require("./routes/Basket");
const chatRouter = require("./routes/chatRoutes");

const { initChatSocket } = require("./routes/chatRoutes");

const app = express();

const server = http.createServer(app); 
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(express.json());
app.use("/uploads", express.static("./" + "uploads"));

sequelize.sync({
    alter: true
 }).then(() => console.log("✅ Database & User table synced!"))
  .catch(err => console.error("❌ Error syncing database:", err));


app.use("/", usersRouter);
app.use("/", adsRouter);
app.use("/", categoriesRouter);
app.use("/", favoritedRouter);
app.use("/", orderRouter);
app.use("/", BasketRouter);
app.use("/", chatRouter);

initChatSocket(io);

app.listen( 1100 , () => {
    console.log(`🚀 Server running on http://localhost:1100`);
});
