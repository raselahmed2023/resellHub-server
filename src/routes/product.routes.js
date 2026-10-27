import {
  Router,
} from "express";

import {
  collections,
} from "../config/db.js";

import {
  CATEGORIES,
  CONDITIONS,
} from "../constants/marketplace.js";

import {
  getSessionContext,
  sellerProductQuery,
  verifySeller,
} from "../middleware/auth.middleware.js";

import {
  resolveStudentZoneSelection,
} from "../services/student-zone.service.js";

import {
  asyncHandler,
} from "../utils/asyncHandler.js";

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

const router =
  Router();

/*
========================================
CREATE PRODUCT
========================================
*/

router.post(
  "/",
  ...verifySeller,

  asyncHandler(
    async (
      req,
      res
    ) => {
      const validation =
        validateProductPayload(
          req.body
        );

      if (
        validation.error
      ) {
        return res
          .status(400)
          .send({
            message:
              validation.error,
          });
      }

      const {
        studentZone:
          studentZoneInput,

        ...productValue
      } =
        validation.value;

      /*
       * New products default
       * to normal marketplace.
       */

      const studentZone =
        await resolveStudentZoneSelection(
          studentZoneInput || {
            enabled:
              false,
          }
        );

      const now =
        new Date();

      const product = {
        ...productValue,

        studentZone,

        status:
          "pending",

        sellerInfo: {
          userId:
            req.user.id,

          name:
            req.user.name ||
            "",

          email:
            req.user.email,

          phone:
            req.user.phone ||
            "",

          location:
            req.user.location ||
            "",
        },

        createdAt:
          now,

        updatedAt:
          now,
      };

      const result =
        await collections
          .products
          .insertOne(
            product
          );

      res
        .status(201)
        .send({
          insertedId:
            result.insertedId,

          product: {
            ...product,

            _id:
              result.insertedId,
          },
        });
    }
  )
);

/*
========================================
FEATURED PRODUCTS
========================================
*/

router.get(
  "/featured",

  asyncHandler(
    async (
      req,
      res
    ) => {
      const products =
        await collections
          .products
          .find({
            status:
              "available",

            stock: {
              $gt: 0,
            },
          })
          .sort({
            createdAt:
              -1,
          })
          .limit(8)
          .toArray();

      res.send(
        products
      );
    }
  )
);

/*
========================================
SELLER PRODUCTS
========================================
*/

router.get(
  "/my-products",
  ...verifySeller,

  asyncHandler(
    async (
      req,
      res
    ) => {
      const products =
        await collections
          .products
          .find(
            sellerProductQuery(
              req.user
            )
          )
          .sort({
            createdAt:
              -1,
          })
          .toArray();

      res.send(
        products
      );
    }
  )
);

/*
========================================
PUBLIC PRODUCTS
========================================
*/

router.get(
  "/",

  asyncHandler(
    async (
      req,
      res
    ) => {
      const {
        search,
        category,
        condition,
        sort,
        minPrice,
        maxPrice,
      } =
        req.query;

      const page =
        Math.max(
          1,

          Math.min(
            100000,

            Number.parseInt(
              String(
                req.query
                  .page ||
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
                req.query
                  .limit ||
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

      /*
       * Search
       */

      if (search) {
        const safeSearch =
          cleanString(
            search,
            100
          );

        if (
          safeSearch
        ) {
          const escaped =
            escapeRegExp(
              safeSearch
            );

          query.$or = [
            {
              title: {
                $regex:
                  escaped,

                $options:
                  "i",
              },
            },

            {
              description: {
                $regex:
                  escaped,

                $options:
                  "i",
              },
            },
          ];
        }
      }

      /*
       * Category
       */

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
          return res
            .status(400)
            .send({
              message:
                "Invalid category filter.",
            });
        }

        query.category =
          safeCategory;
      }

      /*
       * Condition
       */

      if (condition) {
        const values =
          String(
            condition
          )
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

        if (
          values.length
        ) {
          query.condition =
            {
              $in:
                values,
            };
        }
      }

      /*
       * Price
       */

      const min =
        minPrice ===
          undefined ||
        minPrice === ""
          ? null
          : Number(
              minPrice
            );

      const max =
        maxPrice ===
          undefined ||
        maxPrice === ""
          ? null
          : Number(
              maxPrice
            );

      if (
        (
          min !== null &&
          (
            !Number.isFinite(
              min
            ) ||
            min < 0
          )
        ) ||
        (
          max !== null &&
          (
            !Number.isFinite(
              max
            ) ||
            max < 0
          )
        )
      ) {
        return res
          .status(400)
          .send({
            message:
              "Invalid price range.",
          });
      }

      if (
        min !== null &&
        max !== null &&
        min > max
      ) {
        return res
          .status(400)
          .send({
            message:
              "Minimum price cannot exceed maximum price.",
          });
      }

      if (
        min !== null ||
        max !== null
      ) {
        query.price = {};

        if (
          min !== null
        ) {
          query.price.$gte =
            min;
        }

        if (
          max !== null
        ) {
          query.price.$lte =
            max;
        }
      }

      /*
       * Sorting
       */

      const sortOption =
        sort ===
        "price_asc"
          ? {
              price: 1,
              createdAt:
                -1,
            }
          : sort ===
              "price_desc"
            ? {
                price:
                  -1,

                createdAt:
                  -1,
              }
            : {
                createdAt:
                  -1,
              };

      const skip =
        (
          page - 1
        ) * limit;

      const [
        total,
        products,
      ] =
        await Promise.all([
          collections
            .products
            .countDocuments(
              query
            ),

          collections
            .products
            .find(query)
            .sort(
              sortOption
            )
            .skip(
              skip
            )
            .limit(
              limit
            )
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
              total /
                limit
            )
          ),
      });
    }
  )
);

/*
========================================
SINGLE PRODUCT
========================================
*/

router.get(
  "/:id",

  asyncHandler(
    async (
      req,
      res
    ) => {
      const objectId =
        toObjectId(
          req.params.id
        );

      if (!objectId) {
        return res
          .status(400)
          .send({
            message:
              "Invalid product ID.",
          });
      }

      /*
       * Public product
       */

      const publicProduct =
        await collections
          .products
          .findOne({
            _id:
              objectId,

            status:
              "available",

            stock: {
              $gt: 0,
            },
          });

      if (
        publicProduct
      ) {
        return res.send(
          publicProduct
        );
      }

      /*
       * Seller/Admin can see
       * pending/private product.
       */

      const context =
        await getSessionContext(
          req
        );

      if (context) {
        const privateProduct =
          await collections
            .products
            .findOne({
              _id:
                objectId,
            });

        const ownsProduct =
          privateProduct &&
          (
            privateProduct
              .sellerInfo
              ?.userId ===
              context.user
                .id ||
            privateProduct
              .sellerInfo
              ?.email ===
              context.user
                .email
          );

        const isAdmin =
          context.user
            .role ===
          "admin";

        if (
          privateProduct &&
          (
            isAdmin ||
            ownsProduct
          )
        ) {
          return res.send(
            privateProduct
          );
        }
      }

      return res
        .status(404)
        .send({
          message:
            "Product not found.",
        });
    }
  )
);

/*
========================================
UPDATE PRODUCT
========================================
*/

router.patch(
  "/:id",
  ...verifySeller,

  asyncHandler(
    async (
      req,
      res
    ) => {
      const objectId =
        toObjectId(
          req.params.id
        );

      if (!objectId) {
        return res
          .status(400)
          .send({
            message:
              "Invalid product ID.",
          });
      }

      const product =
        await collections
          .products
          .findOne({
            _id:
              objectId,

            ...sellerProductQuery(
              req.user
            ),
          });

      if (!product) {
        return res
          .status(404)
          .send({
            message:
              "Product not found.",
          });
      }

      const validation =
        validateProductPayload(
          req.body
        );

      if (
        validation.error
      ) {
        return res
          .status(400)
          .send({
            message:
              validation.error,
          });
      }

      /*
       * Separate Student Zone
       * from normal product data.
       */

      const {
        studentZone:
          studentZoneInput,

        ...productValue
      } =
        validation.value;

      const updateData = {
        ...productValue,

        status:
          "pending",

        updatedAt:
          new Date(),
      };

      /*
       * IMPORTANT:
       *
       * If frontend sends studentZone,
       * validate/update it.
       *
       * If frontend does not send
       * studentZone yet, preserve
       * existing association.
       */

      if (
        Object.prototype.hasOwnProperty.call(
          validation.value,
          "studentZone"
        )
      ) {
        updateData.studentZone =
          await resolveStudentZoneSelection(
            studentZoneInput
          );
      }

      const result =
        await collections
          .products
          .updateOne(
            {
              _id:
                objectId,

              ...sellerProductQuery(
                req.user
              ),
            },

            {
              $set:
                updateData,
            }
          );

      const updatedProduct =
        await collections
          .products
          .findOne({
            _id:
              objectId,
          });

      res.send({
        acknowledged:
          result.acknowledged,

        matchedCount:
          result.matchedCount,

        modifiedCount:
          result.modifiedCount,

        product:
          updatedProduct,
      });
    }
  )
);

/*
========================================
DELETE PRODUCT
========================================
*/

router.delete(
  "/:id",
  ...verifySeller,

  asyncHandler(
    async (
      req,
      res
    ) => {
      const objectId =
        toObjectId(
          req.params.id
        );

      if (!objectId) {
        return res
          .status(400)
          .send({
            message:
              "Invalid product ID.",
          });
      }

      const openOrder =
        await collections
          .orders
          .findOne({
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

      if (
        openOrder
      ) {
        return res
          .status(409)
          .send({
            message:
              "This product has an active order and cannot be deleted.",
          });
      }

      const result =
        await collections
          .products
          .deleteOne({
            _id:
              objectId,

            ...sellerProductQuery(
              req.user
            ),
          });

      if (
        !result.deletedCount
      ) {
        return res
          .status(404)
          .send({
            message:
              "Product not found.",
          });
      }

      res.send({
        acknowledged:
          result.acknowledged,

        deletedCount:
          result.deletedCount,
      });
    }
  )
);

export default router;