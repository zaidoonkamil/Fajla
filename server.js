const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const usersRouter = require("./routes/user");
const adsRouter = require("./routes/ads");
const categoriesRouter = require("./routes/categories");
const favoritedRouter = require("./routes/favorites");
const orderRouter = require("./routes/Order");
const BasketRouter = require("./routes/Basket");
const chat = require("./routes/chatRoutes");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

app.use(express.json());
app.use("/uploads", express.static("./uploads"));

app.use("/", usersRouter);
app.use("/", adsRouter);
app.use("/", categoriesRouter);
app.use("/", favoritedRouter);
app.use("/", orderRouter);
app.use("/", BasketRouter);
app.use("/", chat.router);

chat.initChatSocket(io);

server.listen(1100, () => {
  console.log(`🚀 Server running on http://localhost:1100`);
});
