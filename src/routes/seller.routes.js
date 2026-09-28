import { Router } from "express";

import {
  collections,
} from "../config/db.js";

import {
  SELLER_ORDER_TRANSITIONS,
} from "../constants/marketplace.js";

import {
  verifySeller,
  sellerProductQuery,
  sellerOrderQuery,
} from "../middleware/auth.middleware.js";

import {
  asyncHandler,
} from "../utils/asyncHandler.js";

import {
  cleanString,
} from "../utils/helpers.js";

import {
  toObjectId,
} from "../utils/objectId.js";

import {
  cancelOrderWithRefund,
} from "../services/order.service.js";

const router = Router();

router.get(
  "/seller/overview",
  ...verifySeller,
  asyncHandler(async (req, res) => {
    const sellerQuery =
      sellerOrderQuery(
        req.user
      );

    const [
      totalProducts,
      allOrders,
    ] =
      await Promise.all([
        collections.products.countDocuments(
          sellerProductQuery(
            req.user
          )
        ),

        collections.orders
          .find(
            sellerQuery
          )
          .toArray(),
      ]);

    const totalSales =
      allOrders.filter(
        (order) =>
          order.orderStatus ===
          "delivered"
      ).length;

    const totalRevenue =
      allOrders
        .filter(
          (order) =>
            order.orderStatus ===
              "delivered" &&
            order.paymentStatus ===
              "paid"
        )
        .reduce(
          (
            sum,
            order
          ) =>
            sum +
            Number(
              order.amount || 0
            ),
          0
        );

    const pendingOrders =
      allOrders.filter(
        (order) =>
          order.orderStatus ===
          "pending"
      ).length;

    const recentOrders =
      [...allOrders]
        .sort(
          (a, b) =>
            new Date(
              b.createdAt
            ) -
            new Date(
              a.createdAt
            )
        )
        .slice(
          0,
          5
        );

    res.send({
      totalProducts,
      totalSales,
      totalRevenue,
      pendingOrders,
      recentOrders,
    });
  })
);

router.get(
  "/seller/orders",
  ...verifySeller,
  asyncHandler(async (req, res) => {
    const result =
      await collections.orders
        .find(
          sellerOrderQuery(
            req.user
          )
        )
        .sort({
          createdAt: -1,
        })
        .toArray();

    res.send(result);
  })
);

router.patch(
  "/orders/:id/status",
  ...verifySeller,
  asyncHandler(async (req, res) => {
    const objectId =
      toObjectId(
        req.params.id
      );

    if (!objectId) {
      return res.status(400).send({
        message:
          "Invalid order ID.",
      });
    }

    const orderStatus =
      cleanString(
        req.body.orderStatus,
        30
      );

    const order =
      await collections.orders.findOne({
        _id: objectId,
        ...sellerOrderQuery(
          req.user
        ),
      });

    if (!order) {
      return res.status(404).send({
        message:
          "Order not found.",
      });
    }

    const allowed =
      SELLER_ORDER_TRANSITIONS[
        order.orderStatus
      ] ||
      new Set();

    if (
      !allowed.has(
        orderStatus
      )
    ) {
      return res.status(409).send({
        message:
          `Order cannot move from ${order.orderStatus} to ${orderStatus}.`,
      });
    }

    if (
      orderStatus ===
      "cancelled"
    ) {
      const result =
        await cancelOrderWithRefund({
          order,
          actor: "seller",
          actorId:
            req.user.id,
        });

      if (!result.ok) {
        return res
          .status(
            result.status
          )
          .send({
            message:
              result.message,
          });
      }

      return res.send({
        message:
          "Order cancelled and refund initiated successfully.",
      });
    }

    const result =
      await collections.orders.updateOne(
        {
          _id:
            objectId,

          ...sellerOrderQuery(
            req.user
          ),

          orderStatus:
            order.orderStatus,
        },
        {
          $set: {
            orderStatus,
            updatedAt:
              new Date(),
          },
        }
      );

    if (
      !result.modifiedCount
    ) {
      return res.status(409).send({
        message:
          "Order status changed. Refresh and try again.",
      });
    }

    res.send(result);
  })
);

router.get(
  "/seller/products/:id",
  ...verifySeller,
  asyncHandler(async (req, res) => {
    const objectId =
      toObjectId(
        req.params.id
      );

    if (!objectId) {
      return res.status(400).send({
        message:
          "Invalid product ID.",
      });
    }

    const product =
      await collections.products.findOne({
        _id: objectId,
        ...sellerProductQuery(
          req.user
        ),
      });

    if (!product) {
      return res.status(404).send({
        message:
          "Product not found.",
      });
    }

    res.send(product);
  })
);

export default router;