import express from "express";
import cors from "cors";

import {
  CLIENT_URL,
} from "./config/env.js";

import authRoutes from "./routes/auth.routes.js";
import userRoutes from "./routes/user.routes.js";
import productRoutes from "./routes/product.routes.js";
import statsRoutes from "./routes/stats.routes.js";
import wishlistRoutes from "./routes/wishlist.routes.js";
import orderRoutes from "./routes/order.routes.js";
import sellerRoutes from "./routes/seller.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import aiRoutes from "./routes/ai.routes.js";
import contactRoutes from "./routes/contact.routes.js";

const app = express();

app.set(
  "trust proxy",
  1
);

app.use(
  cors({
    origin:
      CLIENT_URL,
    credentials:
      true,
  })
);

app.use(
  express.json({
    limit: "1mb",
  })
);

app.get(
  "/",
  (req, res) => {
    res.send(
      "ReSellHub API is running"
    );
  }
);

app.get(
  "/api/health",
  (req, res) => {
    res.send({
      ok: true,
      service:
        "resellhub-server",
    });
  }
);

app.use(
  "/api/auth",
  authRoutes
);

app.use(
  "/api/users",
  userRoutes
);

app.use(
  "/api/products",
  productRoutes
);

app.use(
  "/api/wishlist",
  wishlistRoutes
);

app.use(
  "/api/admin",
  adminRoutes
);

app.use(
  "/api/ai",
  aiRoutes
);

app.use(
  "/api/contact",
  contactRoutes
);

app.use(
  "/api",
  statsRoutes
);

app.use(
  "/api",
  orderRoutes
);

app.use(
  "/api",
  sellerRoutes
);

app.use(
  (req, res) => {
    res.status(404).send({
      message:
        "API route not found.",
    });
  }
);

app.use(
  (
    error,
    req,
    res,
    next
  ) => {
    console.error(error);

    if (res.headersSent) {
      return next(error);
    }

    if (
      error?.type ===
        "entity.parse.failed" ||
      error instanceof
        SyntaxError
    ) {
      return res.status(400).send({
        message:
          "Invalid JSON request.",
      });
    }

    if (
      error?.code === 11000
    ) {
      return res.status(409).send({
        message:
          "Duplicate record.",
      });
    }

    if (
      error?.type ===
      "StripeInvalidRequestError"
    ) {
      return res.status(400).send({
        message:
          "Payment request could not be processed.",
      });
    }

    const status =
      Number(
        error?.status
      );

    if (
      Number.isInteger(status) &&
      status >= 400 &&
      status <= 599
    ) {
      return res
        .status(status)
        .send({
          message:
            error.message ||
            "Request failed.",
        });
    }

    return res.status(500).send({
      message:
        "Internal server error.",
    });
  }
);

export default app;