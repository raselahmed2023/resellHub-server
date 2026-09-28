import { Router } from "express";

import {
  collections,
} from "../config/db.js";

import {
  PRODUCT_ADMIN_STATUSES,
  USER_ROLES,
  USER_STATUSES,
} from "../constants/marketplace.js";

import {
  verifyAdmin,
} from "../middleware/auth.middleware.js";

import {
  asyncHandler,
} from "../utils/asyncHandler.js";

import {
  cleanString,
  hasOwn,
} from "../utils/helpers.js";

import {
  toObjectId,
} from "../utils/objectId.js";

const router = Router();

router.get(
  "/overview",
  ...verifyAdmin,
  asyncHandler(async (req, res) => {
    const [
      totalUsers,
      totalProducts,
      totalOrders,
      revenueResult,
    ] =
      await Promise.all([
        collections.users.countDocuments(),

        collections.products.countDocuments(),

        collections.orders.countDocuments(),

        collections.orders
          .aggregate([
            {
              $match: {
                paymentStatus:
                  "paid",
                orderStatus: {
                  $ne:
                    "cancelled",
                },
              },
            },
            {
              $group: {
                _id: null,
                total: {
                  $sum:
                    "$amount",
                },
              },
            },
          ])
          .toArray(),
      ]);

    res.send({
      totalUsers,
      totalProducts,
      totalOrders,
      totalRevenue:
        revenueResult[0]
          ?.total || 0,
    });
  })
);

router.get(
  "/users",
  ...verifyAdmin,
  asyncHandler(async (req, res) => {
    const result =
      await collections.users
        .find(
          {},
          {
            projection: {
              password: 0,
            },
          }
        )
        .sort({
          createdAt: -1,
        })
        .toArray();

    res.send(result);
  })
);

router.get(
  "/products",
  ...verifyAdmin,
  asyncHandler(async (req, res) => {
    const result =
      await collections.products
        .find()
        .sort({
          createdAt: -1,
        })
        .toArray();

    res.send(result);
  })
);

router.patch(
  "/products/:id",
  ...verifyAdmin,
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

    const status =
      cleanString(
        req.body.status,
        30
      );

    if (
      !PRODUCT_ADMIN_STATUSES.has(
        status
      )
    ) {
      return res.status(400).send({
        message:
          "Invalid product status.",
      });
    }

    const result =
      await collections.products.updateOne(
        {
          _id:
            objectId,
        },
        {
          $set: {
            status,
            updatedAt:
              new Date(),
          },
        }
      );

    if (
      !result.matchedCount
    ) {
      return res.status(404).send({
        message:
          "Product not found.",
      });
    }

    res.send(result);
  })
);

router.delete(
  "/products/:id",
  ...verifyAdmin,
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

    const openOrder =
      await collections.orders.findOne({
        productId:
          String(
            objectId
          ),
        orderStatus: {
          $nin: [
            "delivered",
            "cancelled",
          ],
        },
      });

    if (openOrder) {
      return res.status(409).send({
        message:
          "This product has an active order and cannot be deleted.",
      });
    }

    const result =
      await collections.products.deleteOne({
        _id:
          objectId,
      });

    if (
      !result.deletedCount
    ) {
      return res.status(404).send({
        message:
          "Product not found.",
      });
    }

    res.send(result);
  })
);

router.get(
  "/orders",
  ...verifyAdmin,
  asyncHandler(async (req, res) => {
    const result =
      await collections.orders
        .find()
        .sort({
          createdAt: -1,
        })
        .toArray();

    res.send(result);
  })
);

router.patch(
  "/users/:id",
  ...verifyAdmin,
  asyncHandler(async (req, res) => {
    const objectId =
      toObjectId(
        req.params.id
      );

    if (!objectId) {
      return res.status(400).send({
        message:
          "Invalid user ID.",
      });
    }

    const targetUser =
      await collections.users.findOne({
        _id:
          objectId,
      });

    if (!targetUser) {
      return res.status(404).send({
        message:
          "User not found.",
      });
    }

    const updateDoc = {
      $set: {
        updatedAt:
          new Date(),
      },
    };

    if (
      hasOwn(
        req.body,
        "role"
      )
    ) {
      const role =
        cleanString(
          req.body.role,
          20
        );

      if (
        !USER_ROLES.has(
          role
        )
      ) {
        return res.status(400).send({
          message:
            "Invalid user role.",
        });
      }

      updateDoc.$set.role =
        role;

      updateDoc.$set.roleSelected =
        true;
    }

    if (
      hasOwn(
        req.body,
        "status"
      )
    ) {
      const status =
        cleanString(
          req.body.status,
          20
        );

      if (
        !USER_STATUSES.has(
          status
        )
      ) {
        return res.status(400).send({
          message:
            "Invalid user status.",
        });
      }

      if (
        targetUser.email ===
          req.user.email &&
        status ===
          "blocked"
      ) {
        return res.status(400).send({
          message:
            "You cannot block your own admin account.",
        });
      }

      updateDoc.$set.status =
        status;
    }

    if (
      Object.keys(
        updateDoc.$set
      ).length === 1
    ) {
      return res.status(400).send({
        message:
          "No valid user changes were provided.",
      });
    }

    if (
      targetUser.email ===
        req.user.email &&
      hasOwn(
        updateDoc.$set,
        "role"
      ) &&
      updateDoc.$set.role !==
        "admin"
    ) {
      return res.status(400).send({
        message:
          "You cannot remove your own admin role.",
      });
    }

    const result =
      await collections.users.updateOne(
        {
          _id:
            objectId,
        },
        updateDoc
      );

    res.send(result);
  })
);

router.delete(
  "/users/:id",
  ...verifyAdmin,
  asyncHandler(async (req, res) => {
    const objectId =
      toObjectId(
        req.params.id
      );

    if (!objectId) {
      return res.status(400).send({
        message:
          "Invalid user ID.",
      });
    }

    const targetUser =
      await collections.users.findOne({
        _id:
          objectId,
      });

    if (!targetUser) {
      return res.status(404).send({
        message:
          "User not found.",
      });
    }

    if (
      targetUser.email ===
      req.user.email
    ) {
      return res.status(400).send({
        message:
          "You cannot delete your own admin account.",
      });
    }

    const [
      hasProducts,
      hasOrders,
    ] =
      await Promise.all([
        collections.products.findOne({
          "sellerInfo.email":
            targetUser.email,
        }),

        collections.orders.findOne({
          $or: [
            {
              "buyerInfo.email":
                targetUser.email,
            },
            {
              "sellerInfo.email":
                targetUser.email,
            },
          ],
        }),
      ]);

    if (
      hasProducts ||
      hasOrders
    ) {
      return res.status(409).send({
        message:
          "This account has marketplace history. Block the user instead of deleting the account.",
      });
    }

    const result =
      await collections.users.deleteOne({
        _id:
          objectId,
      });

    res.send(result);
  })
);

export default router;