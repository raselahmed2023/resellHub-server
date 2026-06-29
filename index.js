import { MongoClient, ServerApiVersion, ObjectId } from 'mongodb';
import express from 'express';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import cors from 'cors';
import { betterAuth } from 'better-auth';
import { mongodbAdapter } from 'better-auth/adapters/mongodb';
import Stripe from 'stripe';

dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const app = express();

const allowedOrigins = [
  process.env.CLIENT_URL || 'https://resell-hub-rho.vercel.app',
  'http://localhost:3000',
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.options('*', cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());
app.use(cookieParser());

const uri = process.env.MONGODB_URI;

let cachedClient = null;
let cachedDb = null;

async function connectDB() {
  if (cachedClient && cachedDb) {
    return cachedDb;
  }
  try {
    const client = new MongoClient(uri, {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
      },
      connectTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      serverSelectionTimeoutMS: 10000,
      maxPoolSize: 10,
      minPoolSize: 0,
    });
    await client.connect();
    console.log("✅ MongoDB Connected");
    cachedClient = client;
    cachedDb = client.db("resellHub");
    return cachedDb;
  } catch (error) {
    console.error("❌ MongoDB Connection Error:", error);
    throw error;
  }
}

const isProduction = process.env.NODE_ENV === 'production';

// ✅ FIXED: Pass database getter function directly to mongodbAdapter
const auth = betterAuth({
  database: mongodbAdapter(
    // This should be a function that returns the database instance
    async () => {
      try {
        const db = await connectDB();
        if (!db) {
          throw new Error("Database instance is null");
        }
        return db;
      } catch (error) {
        console.error("❌ Database adapter error:", error);
        throw error;
      }
    }
  ),
  baseURL: process.env.BETTER_AUTH_URL || 'http://localhost:5000',
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: allowedOrigins,
  emailAndPassword: { enabled: true },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    },
  },
  advanced: {
    useSecureCookies: isProduction,
    defaultCookieAttributes: {
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      path: "/",
    },
    crossSubdomainCookies: { enabled: false },
  },
  user: {
    additionalFields: {
      role: { type: "string", defaultValue: "buyer" },
      location: { type: "string", required: false },
      phone: { type: "string", required: false },
    },
  },
});

const getSession = async (req) => {
  try {
    const session = await auth.api.getSession({
      headers: req.headers,
    });
    return session;
  } catch (error) {
    console.error("Session error:", error);
    return null;
  }
};

// ==================== AUTH ROUTES ====================

app.all("/api/auth/*", async (req, res) => {
  try {
    const url = new URL(req.url, process.env.BETTER_AUTH_URL || 'http://localhost:5000');
    const webRequest = new Request(url, {
      method: req.method,
      headers: new Headers(req.headers),
      body: req.method !== "GET" && req.method !== "HEAD"
        ? JSON.stringify(req.body || {})
        : undefined,
    });
    const response = await auth.handler(webRequest);
    response.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });
    res.status(response.status).send(await response.text());
  } catch (error) {
    console.error("Auth handler error:", error);
    res.status(500).json({ message: "Auth error", error: error.message });
  }
});

app.get("/api/test", (req, res) => {
  res.send("API Test Working");
});

app.get('/', (req, res) => res.send('ResellHub API Running ✅'));

// ==================== PRODUCT ROUTES ====================

app.post("/api/products", async (req, res) => {
  try {
    const session = await getSession(req);
    if (!session) return res.status(401).send({ message: "Unauthorized" });

    const db = await connectDB();
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
    const result = await db.collection("products").insertOne(product);
    res.send(result);
  } catch (error) {
    console.error("POST /api/products error:", error);
    res.status(500).send({ message: "Server error" });
  }
});

app.get("/api/products/featured", async (req, res) => {
  try {
    const db = await connectDB();
    const products = await db.collection("products")
      .find({ status: "available" })
      .sort({ createdAt: -1 })
      .limit(8)
      .toArray();
    res.send(products);
  } catch (error) {
    console.error("GET /api/products/featured error:", error);
    res.status(500).send({ message: "Server error" });
  }
});

app.get("/api/products/my-products", async (req, res) => {
  try {
    const session = await getSession(req);
    if (!session) return res.status(401).send({ message: "Unauthorized" });
    const db = await connectDB();
    const result = await db.collection("products")
      .find({ "sellerInfo.email": session.user.email })
      .toArray();
    res.send(result);
  } catch (error) {
    console.error("GET /api/products/my-products error:", error);
    res.status(500).send({ message: "Server error" });
  }
});

app.get("/api/categories/stats", async (req, res) => {
  try {
    const db = await connectDB();
    const categories = await db.collection("products").aggregate([
      { $match: { status: "available" } },
      { $group: { _id: "$category", count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]).toArray();
    res.send(categories);
  } catch (error) {
    console.error("GET /api/categories/stats error:", error);
    res.status(500).send({ message: "Server error" });
  }
});

app.get("/api/stats", async (req, res) => {
  try {
    const db = await connectDB();
    const [totalProducts, totalSellers, totalBuyers, completedOrders] = await Promise.all([
      db.collection("products").countDocuments({ status: "available" }),
      db.collection("user").countDocuments({ role: "seller" }),
      db.collection("user").countDocuments({ role: "buyer" }),
      db.collection("orders").countDocuments({ orderStatus: "delivered" })
    ]);
    res.send({ totalProducts, totalSellers, totalBuyers, completedOrders });
  } catch (error) {
    console.error("GET /api/stats error:", error);
    res.status(500).send({ message: "Server error" });
  }
});

app.get("/api/products", async (req, res) => {
  try {
    const db = await connectDB();
    const { search, category, condition, sort, page = 1, limit = 12 } = req.query;
    const query = { status: "available" };
    if (search) query.title = { $regex: search, $options: "i" };
    if (category) query.category = category;
    if (condition) query.condition = condition;

    const sortOption = sort === "price_asc" ? { price: 1 }
      : sort === "price_desc" ? { price: -1 }
        : { createdAt: -1 };

    const skip = (Number(page) - 1) * Number(limit);
    const total = await db.collection("products").countDocuments(query);
    const products = await db.collection("products")
      .find(query)
      .sort(sortOption)
      .skip(skip)
      .limit(Number(limit))
      .toArray();

    res.send({ products, total, page: Number(page), totalPages: Math.ceil(total / Number(limit)) });
  } catch (error) {
    console.error("GET /api/products error:", error);
    res.status(500).send({ message: "Server error" });
  }
});

app.get("/api/products/:id", async (req, res) => {
  try {
    const db = await connectDB();
    const result = await db.collection("products").findOne({ _id: new ObjectId(req.params.id) });
    if (!result) return res.status(404).send({ message: "Not found" });
    res.send(result);
  } catch (error) {
    console.error("GET /api/products/:id error:", error);
    res.status(500).send({ message: "Server error" });
  }
});

app.patch("/api/products/:id", async (req, res) => {
  try {
    const session = await getSession(req);
    if (!session) return res.status(401).send({ message: "Unauthorized" });
    const db = await connectDB();
    const product = await db.collection("products").findOne({ _id: new ObjectId(req.params.id) });
    if (!product) return res.status(404).send({ message: "Not found" });
    if (product.sellerInfo.email !== session.user.email) return res.status(403).send({ message: "Forbidden" });

    const { title, category, condition, price, stock, description, status, images } = req.body;
    const result = await db.collection("products").updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { title, category, condition, price, stock, description, status, images, updatedAt: new Date() } }
    );
    res.send(result);
  } catch (error) {
    console.error("PATCH /api/products/:id error:", error);
    res.status(500).send({ message: "Server error" });
  }
});

app.delete("/api/products/:id", async (req, res) => {
  try {
    const session = await getSession(req);
    if (!session) return res.status(401).send({ message: "Unauthorized" });
    const db = await connectDB();
    const product = await db.collection("products").findOne({ _id: new ObjectId(req.params.id) });
    if (!product) return res.status(404).send({ message: "Not found" });
    if (product.sellerInfo.email !== session.user.email) return res.status(403).send({ message: "Forbidden" });
    const result = await db.collection("products").deleteOne({ _id: new ObjectId(req.params.id) });
    res.send(result);
  } catch (error) {
    console.error("DELETE /api/products/:id error:", error);
    res.status(500).send({ message: "Server error" });
  }
});

// ==================== USER ROUTES ====================

app.patch("/api/users/profile", async (req, res) => {
  try {
    const session = await getSession(req);
    if (!session) return res.status(401).send({ message: "Unauthorized" });
    const db = await connectDB();
    const { name, phone, location, photo } = req.body;
    const updateDoc = { $set: {} };
    if (name) updateDoc.$set.name = name;
    if (phone) updateDoc.$set.phone = phone;
    if (location) updateDoc.$set.location = location;
    if (photo) updateDoc.$set.image = photo;
    const result = await db.collection("user").updateOne({ email: session.user.email }, updateDoc);
    res.send(result);
  } catch (error) {
    console.error("PATCH /api/users/profile error:", error);
    res.status(500).send({ message: "Server error" });
  }
});

// ==================== SELLER ROUTES ====================

app.get("/api/seller/overview", async (req, res) => {
  try {
    const session = await getSession(req);
    if (!session) return res.status(401).send({ message: "Unauthorized" });
    const db = await connectDB();
    const email = session.user.email;
    const [totalProducts, allOrders] = await Promise.all([
      db.collection("products").countDocuments({ "sellerInfo.email": email }),
      db.collection("orders").find({ "sellerInfo.email": email }).toArray()
    ]);
    const deliveredOrders = allOrders.filter(o => o.orderStatus === "delivered");
    const totalRevenue = deliveredOrders.reduce((sum, o) => sum + o.amount, 0);
    const pendingOrders = allOrders.filter(o => o.orderStatus === "pending").length;
    const recentOrders = allOrders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);
    res.send({ totalProducts, totalSales: deliveredOrders.length, totalRevenue, pendingOrders, recentOrders });
  } catch (error) {
    console.error("GET /api/seller/overview error:", error);
    res.status(500).send({ message: "Server error" });
  }
});

app.get("/api/seller/orders", async (req, res) => {
  try {
    const session = await getSession(req);
    if (!session) return res.status(401).send({ message: "Unauthorized" });
    const db = await connectDB();
    const result = await db.collection("orders")
      .find({ "sellerInfo.email": session.user.email })
      .sort({ createdAt: -1 })
      .toArray();
    res.send(result);
  } catch (error) {
    console.error("GET /api/seller/orders error:", error);
    res.status(500).send({ message: "Server error" });
  }
});

app.patch("/api/orders/:id/status", async (req, res) => {
  try {
    const session = await getSession(req);
    if (!session) return res.status(401).send({ message: "Unauthorized" });
    const db = await connectDB();
    const result = await db.collection("orders").updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { orderStatus: req.body.orderStatus } }
    );
    res.send(result);
  } catch (error) {
    console.error("PATCH /api/orders/:id/status error:", error);
    res.status(500).send({ message: "Server error" });
  }
});

// ==================== BUYER ROUTES ====================

app.get("/api/buyer/overview", async (req, res) => {
  try {
    const session = await getSession(req);
    if (!session) return res.status(401).send({ message: "Unauthorized" });
    const db = await connectDB();
    const userId = session.user.id;
    const [totalOrders, completedOrders, pendingOrders, wishlistCount, recentPurchases] = await Promise.all([
      db.collection("orders").countDocuments({ "buyerInfo.userId": userId }),
      db.collection("orders").countDocuments({ "buyerInfo.userId": userId, orderStatus: "delivered" }),
      db.collection("orders").countDocuments({ "buyerInfo.userId": userId, orderStatus: "pending" }),
      db.collection("wishlist").countDocuments({ userId }),
      db.collection("orders").find({ "buyerInfo.userId": userId }).sort({ createdAt: -1 }).limit(5).toArray()
    ]);
    res.send({ totalOrders, completedOrders, pendingOrders, wishlistCount, recentPurchases });
  } catch (error) {
    console.error("GET /api/buyer/overview error:", error);
    res.status(500).send({ message: "Server error" });
  }
});

// ==================== WISHLIST ROUTES ====================

app.get("/api/wishlist", async (req, res) => {
  try {
    const session = await getSession(req);
    if (!session) return res.status(401).send({ message: "Unauthorized" });
    const db = await connectDB();
    const items = await db.collection("wishlist").find({ userId: session.user.id }).toArray();
    res.send(items);
  } catch (error) {
    console.error("GET /api/wishlist error:", error);
    res.status(500).send({ message: "Server error" });
  }
});

app.post("/api/wishlist", async (req, res) => {
  try {
    const session = await getSession(req);
    if (!session) return res.status(401).send({ message: "Unauthorized" });
    const db = await connectDB();
    const { productId } = req.body;
    const exists = await db.collection("wishlist").findOne({ userId: session.user.id, productId });
    if (exists) return res.send({ message: "Already in wishlist" });
    const result = await db.collection("wishlist").insertOne({
      userId: session.user.id,
      productId,
      createdAt: new Date(),
    });
    res.send(result);
  } catch (error) {
    console.error("POST /api/wishlist error:", error);
    res.status(500).send({ message: "Server error" });
  }
});

app.delete("/api/wishlist/:productId", async (req, res) => {
  try {
    const session = await getSession(req);
    if (!session) return res.status(401).send({ message: "Unauthorized" });
    const db = await connectDB();
    const result = await db.collection("wishlist").deleteOne({ userId: session.user.id, productId: req.params.productId });
    res.send(result);
  } catch (error) {
    console.error("DELETE /api/wishlist/:productId error:", error);
    res.status(500).send({ message: "Server error" });
  }
});

// ==================== PAYMENT & ORDER ROUTES ====================

app.post("/api/create-payment-intent", async (req, res) => {
  try {
    const session = await getSession(req);
    if (!session) return res.status(401).send({ message: "Unauthorized" });
    const { amount, productId } = req.body;
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount * 100,
      currency: "usd",
      metadata: { productId, buyerId: session.user.id, buyerEmail: session.user.email },
    });
    res.send({ clientSecret: paymentIntent.client_secret });
  } catch (error) {
    console.error("POST /api/create-payment-intent error:", error);
    res.status(500).send({ message: "Payment error" });
  }
});

app.post("/api/orders", async (req, res) => {
  try {
    const session = await getSession(req);
    if (!session) return res.status(401).send({ message: "Unauthorized" });
    const db = await connectDB();
    const { productId, transactionId, amount, deliveryInfo } = req.body;
    const product = await db.collection("products").findOne({ _id: new ObjectId(productId) });
    if (!product) return res.status(404).send({ message: "Product not found" });
    if (product.stock <= 0) return res.status(400).send({ message: "Product is out of stock" });

    const order = {
      buyerInfo: { userId: session.user.id, name: session.user.name, email: session.user.email },
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
    const result = await db.collection("orders").insertOne(order);
    await db.collection("products").updateOne({ _id: new ObjectId(productId) }, { $inc: { stock: -1 } });
    res.send(result);
  } catch (error) {
    console.error("POST /api/orders error:", error);
    res.status(500).send({ message: "Server error" });
  }
});

app.get("/api/orders/my-orders", async (req, res) => {
  try {
    const session = await getSession(req);
    if (!session) return res.status(401).send({ message: "Unauthorized" });
    const db = await connectDB();
    const result = await db.collection("orders")
      .find({ "buyerInfo.userId": session.user.id })
      .sort({ createdAt: -1 })
      .toArray();
    res.send(result);
  } catch (error) {
    console.error("GET /api/orders/my-orders error:", error);
    res.status(500).send({ message: "Server error" });
  }
});

app.patch("/api/orders/:id/cancel", async (req, res) => {
  try {
    const session = await getSession(req);
    if (!session) return res.status(401).send({ message: "Unauthorized" });
    const db = await connectDB();
    const result = await db.collection("orders").updateOne(
      { _id: new ObjectId(req.params.id), "buyerInfo.userId": session.user.id, orderStatus: "pending" },
      { $set: { orderStatus: "cancelled" } }
    );
    res.send(result);
  } catch (error) {
    console.error("PATCH /api/orders/:id/cancel error:", error);
    res.status(500).send({ message: "Server error" });
  }
});

app.get("/api/orders/payments", async (req, res) => {
  try {
    const session = await getSession(req);
    if (!session) return res.status(401).send({ message: "Unauthorized" });
    const db = await connectDB();
    const result = await db.collection("orders")
      .find({ "buyerInfo.userId": session.user.id, paymentStatus: "paid" })
      .sort({ createdAt: -1 })
      .toArray();
    res.send(result);
  } catch (error) {
    console.error("GET /api/orders/payments error:", error);
    res.status(500).send({ message: "Server error" });
  }
});

// ==================== ADMIN ROUTES ====================

const verifyAdmin = async (req, res, next) => {
  try {
    const session = await getSession(req);
    if (!session) return res.status(401).send({ message: "Unauthorized" });
    if (session.user.role !== "admin") return res.status(403).send({ message: "Forbidden" });
    req.user = session.user;
    next();
  } catch (error) {
    res.status(500).send({ message: "Server error" });
  }
};

app.get("/api/admin/overview", verifyAdmin, async (req, res) => {
  try {
    const db = await connectDB();
    const [totalUsers, totalProducts, totalOrders, totalRevenue] = await Promise.all([
      db.collection("user").countDocuments(),
      db.collection("products").countDocuments(),
      db.collection("orders").countDocuments(),
      db.collection("orders").aggregate([
        { $match: { paymentStatus: "paid" } },
        { $group: { _id: null, total: { $sum: "$amount" } } }
      ]).toArray()
    ]);
    res.send({ totalUsers, totalProducts, totalOrders, totalRevenue: totalRevenue[0]?.total || 0 });
  } catch (error) {
    console.error("GET /api/admin/overview error:", error);
    res.status(500).send({ message: "Server error" });
  }
});

app.get("/api/admin/users", verifyAdmin, async (req, res) => {
  try {
    const db = await connectDB();
    const result = await db.collection("user").find().sort({ createdAt: -1 }).toArray();
    res.send(result);
  } catch (error) {
    console.error("GET /api/admin/users error:", error);
    res.status(500).send({ message: "Server error" });
  }
});

app.get("/api/admin/products", verifyAdmin, async (req, res) => {
  try {
    const db = await connectDB();
    const result = await db.collection("products").find().sort({ createdAt: -1 }).toArray();
    res.send(result);
  } catch (error) {
    console.error("GET /api/admin/products error:", error);
    res.status(500).send({ message: "Server error" });
  }
});

app.patch("/api/admin/products/:id", verifyAdmin, async (req, res) => {
  try {
    const db = await connectDB();
    const result = await db.collection("products").updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { status: req.body.status } }
    );
    res.send(result);
  } catch (error) {
    console.error("PATCH /api/admin/products/:id error:", error);
    res.status(500).send({ message: "Server error" });
  }
});

app.delete("/api/admin/products/:id", verifyAdmin, async (req, res) => {
  try {
    const db = await connectDB();
    const result = await db.collection("products").deleteOne({ _id: new ObjectId(req.params.id) });
    res.send(result);
  } catch (error) {
    console.error("DELETE /api/admin/products/:id error:", error);
    res.status(500).send({ message: "Server error" });
  }
});

app.get("/api/admin/orders", verifyAdmin, async (req, res) => {
  try {
    const db = await connectDB();
    const result = await db.collection("orders").find().sort({ createdAt: -1 }).toArray();
    res.send(result);
  } catch (error) {
    console.error("GET /api/admin/orders error:", error);
    res.status(500).send({ message: "Server error" });
  }
});

app.patch("/api/admin/users/:id", verifyAdmin, async (req, res) => {
  try {
    const db = await connectDB();
    const { role, status } = req.body;
    const updateDoc = { $set: {} };
    if (role) updateDoc.$set.role = role;
    if (status) updateDoc.$set.status = status;
    const result = await db.collection("user").updateOne({ _id: new ObjectId(req.params.id) }, updateDoc);
    res.send(result);
  } catch (error) {
    console.error("PATCH /api/admin/users/:id error:", error);
    res.status(500).send({ message: "Server error" });
  }
});

app.delete("/api/admin/users/:id", verifyAdmin, async (req, res) => {
  try {
    const db = await connectDB();
    const result = await db.collection("user").deleteOne({ _id: new ObjectId(req.params.id) });
    res.send(result);
  } catch (error) {
    console.error("DELETE /api/admin/users/:id error:", error);
    res.status(500).send({ message: "Server error" });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

export default app;
