const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const express = require('express');
const dotenv = require('dotenv');
dotenv.config();

const cors = require('cors');
const { betterAuth } = require("better-auth");
const { mongodbAdapter } = require("better-auth/adapters/mongodb");
const Stripe = require("stripe");
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const app = express();
app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));
app.use(express.json());

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

const auth = betterAuth({
  database: mongodbAdapter(client.db("resellHub"), { client }),
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: [process.env.CLIENT_URL],

  emailAndPassword: { enabled: true },

  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    },
  },

  advanced: {
    useSecureCookies: true,
    defaultCookieAttributes: {
      secure: true,
      sameSite: "none",
      path: "/",
    },
    crossSubdomainCookies: {
      enabled: false,
    },
  },

  user: {
    additionalFields: {
      role: { type: "string", defaultValue: "buyer" },
      location: { type: "string", required: false },
      phone: { type: "string", required: false },
    },
  },
});

// ✅ Vercel verify-session দিয়ে token verify করো
const verifyToken = async (req) => {
  const token = req.headers.authorization;
  if (!token) return null;

  try {
    const response = await fetch(`${process.env.CLIENT_URL}/api/verify-session`, {
      headers: { "Authorization": token }
    });
    if (!response.ok) return null;
    return response.json();
  } catch (e) {
    return null;
  }
};

app.all("/api/auth/*splat", async (req, res) => {
  const url = new URL(req.url, process.env.BETTER_AUTH_URL);
  const webRequest = new Request(url, {
    method: req.method,
    headers: req.headers,
    body: req.method !== "GET" && req.method !== "HEAD"
      ? JSON.stringify(req.body)
      : undefined,
  });

  const response = await auth.handler(webRequest);

  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });
  res.status(response.status).send(await response.text());
});

async function run() {
  try {
    await client.connect();
    const db = client.db("resellHub");
    const productsCollection = db.collection("products");
    const usersCollection = db.collection("user");
    const wishlistCollection = db.collection("wishlist");
    const ordersCollection = db.collection("orders");

    // POST
    app.post("/api/products", async (req, res) => {
      const session = await verifyToken(req);
      if (!session) return res.status(401).send({ message: "Unauthorized" });

      const product = {
        ...req.body,
        status: "pending",
        sellerInfo: {
          userId: session.user.id,
          name: session.user.name,
          email: session.user.email,
          phone: session.user.phone ?? "",
        },
        createdAt: new Date(),
      };

      const result = await productsCollection.insertOne(product);
      res.send(result);
    });

    app.get("/api/products/featured", async (req, res) => {
      const products = await productsCollection
        .find({ status: "available" })
        .sort({ createdAt: -1 })
        .limit(8)
        .toArray();
      res.send(products);
    });

    app.get("/api/products/my-products", async (req, res) => {
      const session = await verifyToken(req);
      if (!session) return res.status(401).send({ message: "Unauthorized" });
      const result = await productsCollection
        .find({ "sellerInfo.email": session.user.email })
        .toArray();
      res.send(result);
    });

    app.get("/api/categories/stats", async (req, res) => {
      const categories = await productsCollection.aggregate([
        { $match: { status: "available" } },
        { $group: { _id: "$category", count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]).toArray();
      res.send(categories);
    });

    app.get("/api/stats", async (req, res) => {
      const totalProducts = await productsCollection.countDocuments({ status: "available" });
      const totalSellers = await usersCollection.countDocuments({ role: "seller" });
      const totalBuyers = await usersCollection.countDocuments({ role: "buyer" });
      const completedOrders = 0;
      res.send({ totalProducts, totalSellers, totalBuyers, completedOrders });
    });

    app.get("/api/products", async (req, res) => {
      const { search, category, condition, sort, page = 1, limit = 12 } = req.query;

      const query = { status: "available" };
      if (search) query.title = { $regex: search, $options: "i" };
      if (category) query.category = category;
      if (condition) query.condition = condition;

      const sortOption = sort === "price_asc" ? { price: 1 } : sort === "price_desc" ? { price: -1 } : { createdAt: -1 };

      const skip = (Number(page) - 1) * Number(limit);
      const total = await productsCollection.countDocuments(query);
      const products = await productsCollection.find(query).sort(sortOption).skip(skip).limit(Number(limit)).toArray();

      res.send({ products, total, page: Number(page), totalPages: Math.ceil(total / Number(limit)) });
    });

    app.get("/api/products/:id", async (req, res) => {
      const { id } = req.params;
      const result = await productsCollection.findOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    app.patch("/api/users/profile", async (req, res) => {
      const session = await verifyToken(req);
      if (!session) return res.status(401).send({ message: "Unauthorized" });

      const { name, phone, location, photo } = req.body;
      const updateDoc = { $set: {} };

      if (name) updateDoc.$set.name = name;
      if (phone) updateDoc.$set.phone = phone;
      if (location) updateDoc.$set.location = location;
      if (photo) updateDoc.$set.image = photo;

      const result = await usersCollection.updateOne(
        { email: session.user.email },
        updateDoc
      );
      res.send(result);
    });

    app.patch("/api/products/:id", async (req, res) => {
      const session = await verifyToken(req);
      if (!session) return res.status(401).send({ message: "Unauthorized" });
      const { id } = req.params;

      const product = await productsCollection.findOne({ _id: new ObjectId(id) });
      if (!product) return res.status(404).send({ message: "Not found" });
      if (product.sellerInfo.email !== session.user.email) {
        return res.status(403).send({ message: "Forbidden" });
      }

      const { title, category, condition, price, stock, description, status, images } = req.body;
      const result = await productsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { title, category, condition, price, stock, description, status, images, updatedAt: new Date() } }
      );
      res.send(result);
    });

    app.delete("/api/products/:id", async (req, res) => {
      const session = await verifyToken(req);
      if (!session) return res.status(401).send({ message: "Unauthorized" });
      const { id } = req.params;

      const product = await productsCollection.findOne({ _id: new ObjectId(id) });
      if (!product) return res.status(404).send({ message: "Not found" });
      if (product.sellerInfo.email !== session.user.email) {
        return res.status(403).send({ message: "Forbidden" });
      }

      const result = await productsCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    app.get("/api/seller/overview", async (req, res) => {
      const session = await verifyToken(req);
      if (!session) return res.status(401).send({ message: "Unauthorized" });

      const totalProducts = await productsCollection.countDocuments({ "sellerInfo.email": session.user.email });
      const allOrders = await ordersCollection.find({ "sellerInfo.email": session.user.email }).toArray();
      const totalSales = allOrders.filter((o) => o.orderStatus === "delivered").length;
      const totalRevenue = allOrders.filter((o) => o.orderStatus === "delivered").reduce((sum, o) => sum + o.amount, 0);
      const pendingOrders = allOrders.filter((o) => o.orderStatus === "pending").length;
      const recentOrders = allOrders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);

      res.send({ totalProducts, totalSales, totalRevenue, pendingOrders, recentOrders });
    });

    app.get("/api/buyer/overview", async (req, res) => {
      const session = await verifyToken(req);
      if (!session) return res.status(401).send({ message: "Unauthorized" });

      const totalOrders = await ordersCollection.countDocuments({ "buyerInfo.userId": session.user.id });
      const completedOrders = await ordersCollection.countDocuments({ "buyerInfo.userId": session.user.id, orderStatus: "delivered" });
      const pendingOrders = await ordersCollection.countDocuments({ "buyerInfo.userId": session.user.id, orderStatus: "pending" });
      const wishlistCount = await wishlistCollection.countDocuments({ userId: session.user.id });
      const recentPurchases = await ordersCollection.find({ "buyerInfo.userId": session.user.id }).sort({ createdAt: -1 }).limit(5).toArray();

      res.send({ totalOrders, completedOrders, pendingOrders, wishlistCount, recentPurchases });
    });

    app.get("/api/wishlist", async (req, res) => {
      const session = await verifyToken(req);
      if (!session) return res.status(401).send({ message: "Unauthorized" });
      const items = await wishlistCollection.find({ userId: session.user.id }).toArray();
      res.send(items);
    });

    app.post("/api/wishlist", async (req, res) => {
      const session = await verifyToken(req);
      if (!session) return res.status(401).send({ message: "Unauthorized" });

      const { productId } = req.body;
      const exists = await wishlistCollection.findOne({ userId: session.user.id, productId });
      if (exists) return res.send({ message: "Already in wishlist" });

      const result = await wishlistCollection.insertOne({
        userId: session.user.id,
        productId,
        createdAt: new Date(),
      });
      res.send(result);
    });

    app.delete("/api/wishlist/:productId", async (req, res) => {
      const session = await verifyToken(req);
      if (!session) return res.status(401).send({ message: "Unauthorized" });
      const { productId } = req.params;
      const result = await wishlistCollection.deleteOne({ userId: session.user.id, productId });
      res.send(result);
    });

    app.post("/api/create-payment-intent", async (req, res) => {
      const session = await verifyToken(req);
      if (!session) return res.status(401).send({ message: "Unauthorized" });

      const { amount, productId } = req.body;

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount * 100,
        currency: "usd",
        metadata: {
          productId,
          buyerId: session.user.id,
          buyerEmail: session.user.email,
        },
      });

      res.send({ clientSecret: paymentIntent.client_secret });
    });

    app.post("/api/orders", async (req, res) => {
      const session = await verifyToken(req);
      if (!session) return res.status(401).send({ message: "Unauthorized" });

      const { productId, transactionId, amount, deliveryInfo } = req.body;

      const product = await productsCollection.findOne({ _id: new ObjectId(productId) });
      if (!product) return res.status(404).send({ message: "Product not found" });

      if (product.stock <= 0) {
        return res.status(400).send({ message: "Product is out of stock" });
      }

      const order = {
        buyerInfo: {
          userId: session.user.id,
          name: session.user.name,
          email: session.user.email,
        },
        sellerInfo: product.sellerInfo,
        productId,
        productTitle: product.title,
        productImage: product.images?.[0] || "",
        amount,
        deliveryInfo,
        transactionId,
        paymentStatus: "paid",
        orderStatus: "pending",
        createdAt: new Date(),
      };

      const result = await ordersCollection.insertOne(order);

      await productsCollection.updateOne(
        { _id: new ObjectId(productId) },
        { $inc: { stock: -1 } }
      );

      res.send(result);
    });

    app.get("/api/orders/my-orders", async (req, res) => {
      const session = await verifyToken(req);
      if (!session) return res.status(401).send({ message: "Unauthorized" });

      const result = await ordersCollection
        .find({ "buyerInfo.userId": session.user.id })
        .sort({ createdAt: -1 })
        .toArray();

      res.send(result);
    });

    app.patch("/api/orders/:id/cancel", async (req, res) => {
      const session = await verifyToken(req);
      if (!session) return res.status(401).send({ message: "Unauthorized" });

      const { id } = req.params;
      const result = await ordersCollection.updateOne(
        { _id: new ObjectId(id), "buyerInfo.userId": session.user.id, orderStatus: "pending" },
        { $set: { orderStatus: "cancelled" } }
      );
      res.send(result);
    });

    app.get("/api/orders/payments", async (req, res) => {
      const session = await verifyToken(req);
      if (!session) return res.status(401).send({ message: "Unauthorized" });

      const result = await ordersCollection
        .find({ "buyerInfo.userId": session.user.id, paymentStatus: "paid" })
        .sort({ createdAt: -1 })
        .toArray();

      res.send(result);
    });

    app.get("/api/seller/orders", async (req, res) => {
      const session = await verifyToken(req);
      if (!session) return res.status(401).send({ message: "Unauthorized" });
      const result = await ordersCollection
        .find({ "sellerInfo.email": session.user.email })
        .sort({ createdAt: -1 })
        .toArray();
      res.send(result);
    });

    app.patch("/api/orders/:id/status", async (req, res) => {
      const session = await verifyToken(req);
      if (!session) return res.status(401).send({ message: "Unauthorized" });
      const { id } = req.params;
      const { orderStatus } = req.body;
      const result = await ordersCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { orderStatus } }
      );
      res.send(result);
    });

    const verifyAdmin = async (req, res, next) => {
      const session = await verifyToken(req);
      if (!session) return res.status(401).send({ message: "Unauthorized" });
      if (session.user.role !== "admin") return res.status(403).send({ message: "Forbidden" });
      req.user = session.user;
      next();
    };

    app.get("/api/admin/overview", verifyAdmin, async (req, res) => {
      const totalUsers = await usersCollection.countDocuments();
      const totalProducts = await productsCollection.countDocuments();
      const totalOrders = await ordersCollection.countDocuments();
      const totalRevenue = await ordersCollection.aggregate([
        { $match: { paymentStatus: "paid" } },
        { $group: { _id: null, total: { $sum: "$amount" } } }
      ]).toArray();

      res.send({
        totalUsers,
        totalProducts,
        totalOrders,
        totalRevenue: totalRevenue[0]?.total || 0,
      });
    });

    app.get("/api/admin/users", verifyAdmin, async (req, res) => {
      const result = await usersCollection.find().sort({ createdAt: -1 }).toArray();
      res.send(result);
    });

    app.get("/api/admin/products", verifyAdmin, async (req, res) => {
      const result = await productsCollection.find().sort({ createdAt: -1 }).toArray();
      res.send(result);
    });

    app.patch("/api/admin/products/:id", verifyAdmin, async (req, res) => {
      const { id } = req.params;
      const { status } = req.body;
      const result = await productsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status } }
      );
      res.send(result);
    });

    app.delete("/api/admin/products/:id", verifyAdmin, async (req, res) => {
      const { id } = req.params;
      const result = await productsCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    app.get("/api/admin/orders", verifyAdmin, async (req, res) => {
      const result = await ordersCollection.find().sort({ createdAt: -1 }).toArray();
      res.send(result);
    });

    app.patch("/api/admin/users/:id", verifyAdmin, async (req, res) => {
      const { id } = req.params;
      const { role, status } = req.body;
      const updateDoc = { $set: {} };
      if (role) updateDoc.$set.role = role;
      if (status) updateDoc.$set.status = status;
      const result = await usersCollection.updateOne({ _id: new ObjectId(id) }, updateDoc);
      res.send(result);
    });

    app.delete("/api/admin/users/:id", verifyAdmin, async (req, res) => {
      const { id } = req.params;
      const result = await usersCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });

  } finally { }
}
run().catch(console.dir);

const port = process.env.PORT;
app.get('/', (req, res) => res.send('Hello World!'));
app.listen(port, () => console.log(`Server running on port ${port}`));