import { Router } from "express";

import { collections } from "../config/db.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

router.get(
  "/categories/stats",
  asyncHandler(async (req, res) => {
    const categories =
      await collections.products
        .aggregate([
          {
            $match: {
              status:
                "available",
              stock: {
                $gt: 0,
              },
            },
          },
          {
            $group: {
              _id:
                "$category",
              count: {
                $sum: 1,
              },
            },
          },
          {
            $sort: {
              count: -1,
            },
          },
        ])
        .toArray();

    res.send(categories);
  })
);

router.get(
  "/stats",
  asyncHandler(async (req, res) => {
    const [
      totalProducts,
      totalSellers,
      totalBuyers,
      completedOrders,
    ] =
      await Promise.all([
        collections.products.countDocuments(
          {
            status:
              "available",
            stock: {
              $gt: 0,
            },
          }
        ),

        collections.users.countDocuments(
          {
            role: "seller",
            status: {
              $ne: "blocked",
            },
          }
        ),

        collections.users.countDocuments(
          {
            role: "buyer",
            status: {
              $ne: "blocked",
            },
          }
        ),

        collections.orders.countDocuments(
          {
            orderStatus:
              "delivered",
          }
        ),
      ]);

    res.send({
      totalProducts,
      totalSellers,
      totalBuyers,
      completedOrders,
    });
  })
);

export default router;