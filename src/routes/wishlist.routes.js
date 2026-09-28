import { Router } from "express";

import { collections } from "../config/db.js";
import {
  verifyBuyer,
} from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  cleanString,
} from "../utils/helpers.js";
import {
  isValidObjectId,
  toObjectId,
} from "../utils/objectId.js";

const router = Router();

router.get(
  "/",
  ...verifyBuyer,
  asyncHandler(async (req, res) => {
    const items =
      await collections.wishlist
        .find({
          userId:
            req.user.id,
        })
        .sort({
          createdAt: -1,
        })
        .toArray();

    const productIds =
      items
        .map(
          (item) =>
            toObjectId(
              item.productId
            )
        )
        .filter(Boolean);

    const products =
      productIds.length
        ? await collections.products
            .find({
              _id: {
                $in:
                  productIds,
              },
              status:
                "available",
              stock: {
                $gt: 0,
              },
            })
            .toArray()
        : [];

    const productMap =
      new Map(
        products.map(
          (product) => [
            String(
              product._id
            ),
            product,
          ]
        )
      );

    res.send(
      items
        .map(
          (item) => ({
            ...item,
            product:
              productMap.get(
                String(
                  item.productId
                )
              ) || null,
          })
        )
        .filter(
          (item) =>
            item.product
        )
    );
  })
);

router.post(
  "/",
  ...verifyBuyer,
  asyncHandler(async (req, res) => {
    const productId =
      cleanString(
        req.body.productId,
        50
      );

    const objectId =
      toObjectId(
        productId
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
          _id:
            objectId,
          status:
            "available",
          stock: {
            $gt: 0,
          },
        }
      );

    if (!product) {
      return res.status(404).send({
        message:
          "Product not found.",
      });
    }

    try {
      const result =
        await collections.wishlist.insertOne(
          {
            userId:
              req.user.id,
            productId,
            createdAt:
              new Date(),
          }
        );

      res
        .status(201)
        .send(result);
    } catch (error) {
      if (
        error?.code === 11000
      ) {
        return res.send({
          message:
            "Already in wishlist",
        });
      }

      throw error;
    }
  })
);

router.delete(
  "/:productId",
  ...verifyBuyer,
  asyncHandler(async (req, res) => {
    const productId =
      cleanString(
        req.params.productId,
        50
      );

    if (
      !isValidObjectId(
        productId
      )
    ) {
      return res.status(400).send({
        message:
          "Invalid product ID.",
      });
    }

    const result =
      await collections.wishlist.deleteOne(
        {
          userId:
            req.user.id,
          productId,
        }
      );

    res.send(result);
  })
);

export default router;