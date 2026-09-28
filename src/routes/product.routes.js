import { Router } from "express";

import { collections } from "../config/db.js";
import {
  CATEGORIES,
  CONDITIONS,
} from "../constants/marketplace.js";
import {
  getSessionContext,
  sellerProductQuery,
  verifySeller,
} from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  cleanString,
  escapeRegExp,
} from "../utils/helpers.js";
import {
  toObjectId,
} from "../utils/objectId.js";
import {
  validateProductPayload,
} from "../utils/validators.js";

const router = Router();

router.post(
  "/",
  ...verifySeller,
  asyncHandler(async (req, res) => {
    const validation =
      validateProductPayload(
        req.body
      );

    if (validation.error) {
      return res.status(400).send({
        message:
          validation.error,
      });
    }

    const product = {
      ...validation.value,
      status: "pending",

      sellerInfo: {
        userId:
          req.user.id,
        name:
          req.user.name || "",
        email:
          req.user.email,
        phone:
          req.user.phone || "",
        location:
          req.user.location || "",
      },

      createdAt:
        new Date(),
      updatedAt:
        new Date(),
    };

    const result =
      await collections.products.insertOne(
        product
      );

    res.status(201).send({
      insertedId:
        result.insertedId,
      product,
    });
  })
);

router.get(
  "/featured",
  asyncHandler(async (req, res) => {
    const products =
      await collections.products
        .find({
          status:
            "available",
          stock: {
            $gt: 0,
          },
        })
        .sort({
          createdAt: -1,
        })
        .limit(8)
        .toArray();

    res.send(products);
  })
);

router.get(
  "/my-products",
  ...verifySeller,
  asyncHandler(async (req, res) => {
    const result =
      await collections.products
        .find(
          sellerProductQuery(
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

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const {
      search,
      category,
      condition,
      sort,
      minPrice,
      maxPrice,
    } = req.query;

    const page =
      Math.max(
        1,
        Math.min(
          100000,
          Number.parseInt(
            String(
              req.query.page ||
                "1"
            ),
            10
          ) || 1
        )
      );

    const limit =
      Math.max(
        1,
        Math.min(
          48,
          Number.parseInt(
            String(
              req.query.limit ||
                "12"
            ),
            10
          ) || 12
        )
      );

    const query = {
      status:
        "available",
      stock: {
        $gt: 0,
      },
    };

    if (search) {
      const safeSearch =
        cleanString(
          search,
          100
        );

      if (safeSearch) {
        query.$or = [
          {
            title: {
              $regex:
                escapeRegExp(
                  safeSearch
                ),
              $options: "i",
            },
          },
          {
            description: {
              $regex:
                escapeRegExp(
                  safeSearch
                ),
              $options: "i",
            },
          },
        ];
      }
    }

    if (category) {
      const safeCategory =
        cleanString(
          category,
          50
        );

      if (
        !CATEGORIES.has(
          safeCategory
        )
      ) {
        return res.status(400).send({
          message:
            "Invalid category filter.",
        });
      }

      query.category =
        safeCategory;
    }

    if (condition) {
      const values =
        String(condition)
          .split(",")
          .map(
            (value) =>
              value.trim()
          )
          .filter(
            (value) =>
              CONDITIONS.has(
                value
              )
          );

      if (values.length) {
        query.condition = {
          $in: values,
        };
      }
    }

    const min =
      minPrice === undefined ||
      minPrice === ""
        ? null
        : Number(minPrice);

    const max =
      maxPrice === undefined ||
      maxPrice === ""
        ? null
        : Number(maxPrice);

    if (
      (
        min !== null &&
        (
          !Number.isFinite(min) ||
          min < 0
        )
      ) ||
      (
        max !== null &&
        (
          !Number.isFinite(max) ||
          max < 0
        )
      )
    ) {
      return res.status(400).send({
        message:
          "Invalid price range.",
      });
    }

    if (
      min !== null &&
      max !== null &&
      min > max
    ) {
      return res.status(400).send({
        message:
          "Minimum price cannot exceed maximum price.",
      });
    }

    if (
      min !== null ||
      max !== null
    ) {
      query.price = {};

      if (min !== null) {
        query.price.$gte =
          min;
      }

      if (max !== null) {
        query.price.$lte =
          max;
      }
    }

    const sortOption =
      sort === "price_asc"
        ? {
            price: 1,
            createdAt: -1,
          }
        : sort ===
            "price_desc"
          ? {
              price: -1,
              createdAt: -1,
            }
          : {
              createdAt: -1,
            };

    const skip =
      (page - 1) * limit;

    const [
      total,
      products,
    ] =
      await Promise.all([
        collections.products.countDocuments(
          query
        ),

        collections.products
          .find(query)
          .sort(sortOption)
          .skip(skip)
          .limit(limit)
          .toArray(),
      ]);

    res.send({
      products,
      total,
      page,
      totalPages:
        Math.max(
          1,
          Math.ceil(
            total / limit
          )
        ),
    });
  })
);

router.get(
  "/:id",
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

    const publicProduct =
      await collections.products.findOne(
        {
          _id: objectId,
          status:
            "available",
          stock: {
            $gt: 0,
          },
        }
      );

    if (publicProduct) {
      return res.send(
        publicProduct
      );
    }

    const context =
      await getSessionContext(
        req
      );

    if (context) {
      const privateProduct =
        await collections.products.findOne(
          {
            _id: objectId,
          }
        );

      if (
        privateProduct &&
        (
          context.user.role ===
            "admin" ||
          privateProduct.sellerInfo
            ?.userId ===
            context.user.id ||
          privateProduct.sellerInfo
            ?.email ===
            context.user.email
        )
      ) {
        return res.send(
          privateProduct
        );
      }
    }

    return res.status(404).send({
      message:
        "Product not found.",
    });
  })
);

router.patch(
  "/:id",
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
      await collections.products.findOne(
        {
          _id: objectId,
          ...sellerProductQuery(
            req.user
          ),
        }
      );

    if (!product) {
      return res.status(404).send({
        message:
          "Product not found.",
      });
    }

    const validation =
      validateProductPayload(
        req.body
      );

    if (validation.error) {
      return res.status(400).send({
        message:
          validation.error,
      });
    }

    const result =
      await collections.products.updateOne(
        {
          _id: objectId,
          ...sellerProductQuery(
            req.user
          ),
        },
        {
          $set: {
            ...validation.value,
            status:
              "pending",
            updatedAt:
              new Date(),
          },
        }
      );

    res.send({
      ...result,
      status: "pending",
    });
  })
);

router.delete(
  "/:id",
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

    const openOrder =
      await collections.orders.findOne(
        {
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
        }
      );

    if (openOrder) {
      return res.status(409).send({
        message:
          "This product has an active order and cannot be deleted.",
      });
    }

    const result =
      await collections.products.deleteOne(
        {
          _id: objectId,
          ...sellerProductQuery(
            req.user
          ),
        }
      );

    if (!result.deletedCount) {
      return res.status(404).send({
        message:
          "Product not found.",
      });
    }

    res.send(result);
  })
);

export default router;