import { Router } from "express";

import { stripe } from "../config/stripe.js";
import { collections } from "../config/db.js";

import {
  PAYMENT_CURRENCY,
  DELIVERY_CHARGE,
} from "../config/env.js";

import {
  verifyBuyer,
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
  validateDeliveryInfo,
} from "../utils/validators.js";

import {
  calculateOrderTotal,
  toStripeMinorUnits,
  refundPaymentIntent,
  cancelOrderWithRefund,
} from "../services/order.service.js";

const router = Router();

router.post(
  "/create-payment-intent",
  ...verifyBuyer,
  asyncHandler(async (req, res) => {
    const productId =
      cleanString(
        req.body.productId,
        50
      );

    const objectId =
      toObjectId(productId);

    if (!objectId) {
      return res.status(400).send({
        message:
          "Invalid product ID.",
      });
    }

    const product =
      await collections.products.findOne({
        _id: objectId,
        status: "available",
        stock: {
          $gt: 0,
        },
      });

    if (!product) {
      return res.status(409).send({
        message:
          "This product is unavailable or out of stock.",
      });
    }

    if (
      product.sellerInfo?.userId ===
        req.user.id ||
      product.sellerInfo?.email ===
        req.user.email
    ) {
      return res.status(400).send({
        message:
          "You cannot purchase your own product.",
      });
    }

    const amount =
      calculateOrderTotal(product);

    const paymentIntent =
      await stripe.paymentIntents.create({
        amount:
          toStripeMinorUnits(
            amount
          ),
        currency:
          PAYMENT_CURRENCY,
        automatic_payment_methods: {
          enabled: true,
        },
        metadata: {
          productId,
          buyerId:
            req.user.id,
          buyerEmail:
            req.user.email,
        },
      });

    res.send({
      clientSecret:
        paymentIntent.client_secret,
      amount,
      productPrice:
        Number(product.price),
      deliveryCharge:
        DELIVERY_CHARGE,
      currency:
        PAYMENT_CURRENCY,
    });
  })
);

router.post(
  "/orders",
  ...verifyBuyer,
  asyncHandler(async (req, res) => {
    const productId =
      cleanString(
        req.body.productId,
        50
      );

    const transactionId =
      cleanString(
        req.body.transactionId,
        120
      );

    const productObjectId =
      toObjectId(productId);

    if (!productObjectId) {
      return res.status(400).send({
        message:
          "Invalid product ID.",
      });
    }

    if (
      !transactionId.startsWith(
        "pi_"
      )
    ) {
      return res.status(400).send({
        message:
          "Invalid payment transaction.",
      });
    }

    const deliveryValidation =
      validateDeliveryInfo(
        req.body.deliveryInfo
      );

    if (
      deliveryValidation.error
    ) {
      return res.status(400).send({
        message:
          deliveryValidation.error,
      });
    }

    const existingOrder =
      await collections.orders.findOne({
        transactionId,
      });

    if (existingOrder) {
      if (
        existingOrder.buyerInfo
          ?.userId !==
        req.user.id
      ) {
        return res.status(409).send({
          message:
            "Payment transaction is already linked to another order.",
        });
      }

      return res.send({
        order:
          existingOrder,
        duplicate:
          true,
      });
    }

    const paymentIntent =
      await stripe.paymentIntents.retrieve(
        transactionId
      );

    const paymentIdentityMatches =
      paymentIntent.metadata
        ?.productId ===
        productId &&
      paymentIntent.metadata
        ?.buyerId ===
        req.user.id;

    if (
      !paymentIdentityMatches
    ) {
      return res.status(400).send({
        message:
          "Payment verification failed.",
      });
    }

    if (
      paymentIntent.status !==
      "succeeded"
    ) {
      return res.status(400).send({
        message:
          "Payment has not completed successfully.",
      });
    }

    const product =
      await collections.products.findOne({
        _id:
          productObjectId,
      });

    if (!product) {
      await refundPaymentIntent(
        transactionId,
        `failed-order-${transactionId}`
      );

      return res.status(409).send({
        message:
          "The product is no longer available. Your payment has been refunded.",
      });
    }

    if (
      product.sellerInfo?.userId ===
        req.user.id ||
      product.sellerInfo?.email ===
        req.user.email
    ) {
      await refundPaymentIntent(
        transactionId,
        `failed-order-${transactionId}`
      );

      return res.status(400).send({
        message:
          "You cannot purchase your own product. The payment was refunded.",
      });
    }

    const expectedAmount =
      calculateOrderTotal(
        product
      );

    const amountMatches =
      paymentIntent.currency ===
        PAYMENT_CURRENCY &&
      paymentIntent.amount ===
        toStripeMinorUnits(
          expectedAmount
        );

    if (!amountMatches) {
      await refundPaymentIntent(
        transactionId,
        `failed-order-${transactionId}`
      );

      return res.status(409).send({
        message:
          "The listing price changed before the order was created. Your payment has been refunded.",
      });
    }

    const reservedProduct =
      await collections.products.findOneAndUpdate(
        {
          _id:
            productObjectId,
          status:
            "available",
          stock: {
            $gt: 0,
          },
        },
        {
          $inc: {
            stock: -1,
          },
          $set: {
            updatedAt:
              new Date(),
          },
        },
        {
          returnDocument:
            "before",
        }
      );

    if (!reservedProduct) {
      try {
        await refundPaymentIntent(
          transactionId,
          `failed-order-${transactionId}`
        );

        return res.status(409).send({
          message:
            "The product became unavailable. Your payment has been refunded.",
        });
      } catch (refundError) {
        console.error(
          "Automatic refund failed:",
          refundError
        );

        return res.status(409).send({
          message:
            "The product became unavailable after payment. Please contact support with your transaction ID.",
        });
      }
    }

    const order = {
      buyerInfo: {
        userId:
          req.user.id,
        name:
          req.user.name || "",
        email:
          req.user.email,
      },

      sellerInfo:
        reservedProduct.sellerInfo,

      productId,

      productTitle:
        reservedProduct.title,

      productImage:
        reservedProduct.images?.[0] ||
        "",

      productPrice:
        Number(
          reservedProduct.price
        ),

      deliveryCharge:
        DELIVERY_CHARGE,

      amount:
        expectedAmount,

      currency:
        PAYMENT_CURRENCY,

      deliveryInfo:
        deliveryValidation.value,

      transactionId,

      paymentStatus:
        "paid",

      orderStatus:
        "pending",

      createdAt:
        new Date(),

      updatedAt:
        new Date(),
    };

    try {
      const result =
        await collections.orders.insertOne(
          order
        );

      return res.status(201).send({
        order: {
          ...order,
          _id:
            result.insertedId,
        },
      });
    } catch (error) {
      await collections.products.updateOne(
        {
          _id:
            productObjectId,
        },
        {
          $inc: {
            stock: 1,
          },
          $set: {
            updatedAt:
              new Date(),
          },
        }
      );

      if (
        error?.code === 11000
      ) {
        const duplicate =
          await collections.orders.findOne({
            transactionId,
          });

        if (
          duplicate?.buyerInfo
            ?.userId ===
          req.user.id
        ) {
          return res.send({
            order:
              duplicate,
            duplicate:
              true,
          });
        }
      }

      try {
        await refundPaymentIntent(
          transactionId,
          `failed-order-${transactionId}`
        );
      } catch (refundError) {
        console.error(
          "Refund after order insert failure also failed:",
          refundError
        );
      }

      return res.status(500).send({
        message:
          "Order could not be created. Your payment was refunded or queued for refund review.",
      });
    }
  })
);

router.get(
  "/buyer/overview",
  ...verifyBuyer,
  asyncHandler(async (req, res) => {
    const buyerQuery = {
      "buyerInfo.userId":
        req.user.id,
    };

    const [
      totalOrders,
      completedOrders,
      pendingOrders,
      wishlistCount,
      recentPurchases,
    ] =
      await Promise.all([
        collections.orders.countDocuments(
          buyerQuery
        ),

        collections.orders.countDocuments({
          ...buyerQuery,
          orderStatus:
            "delivered",
        }),

        collections.orders.countDocuments({
          ...buyerQuery,
          orderStatus:
            "pending",
        }),

        collections.wishlist.countDocuments({
          userId:
            req.user.id,
        }),

        collections.orders
          .find(
            buyerQuery
          )
          .sort({
            createdAt: -1,
          })
          .limit(5)
          .toArray(),
      ]);

    res.send({
      totalOrders,
      completedOrders,
      pendingOrders,
      wishlistCount,
      recentPurchases,
    });
  })
);

router.get(
  "/orders/my-orders",
  ...verifyBuyer,
  asyncHandler(async (req, res) => {
    const result =
      await collections.orders
        .find({
          "buyerInfo.userId":
            req.user.id,
        })
        .sort({
          createdAt: -1,
        })
        .toArray();

    res.send(result);
  })
);

router.get(
  "/orders/payments",
  ...verifyBuyer,
  asyncHandler(async (req, res) => {
    const result =
      await collections.orders
        .find({
          "buyerInfo.userId":
            req.user.id,
          paymentStatus: {
            $in: [
              "paid",
              "refunded",
            ],
          },
        })
        .sort({
          createdAt: -1,
        })
        .toArray();

    res.send(result);
  })
);

router.get(
  "/orders/:id",
  ...verifyBuyer,
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

    const order =
      await collections.orders.findOne({
        _id: objectId,
        "buyerInfo.userId":
          req.user.id,
      });

    if (!order) {
      return res.status(404).send({
        message:
          "Order not found.",
      });
    }

    res.send(order);
  })
);

router.patch(
  "/orders/:id/cancel",
  ...verifyBuyer,
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

    const order =
      await collections.orders.findOne({
        _id: objectId,
        "buyerInfo.userId":
          req.user.id,
      });

    if (!order) {
      return res.status(404).send({
        message:
          "Order not found.",
      });
    }

    if (
      order.orderStatus !==
      "pending"
    ) {
      return res.status(409).send({
        message:
          "Only pending orders can be cancelled by the buyer.",
      });
    }

    const result =
      await cancelOrderWithRefund({
        order,
        actor: "buyer",
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

    res.send({
      message:
        "Order cancelled and refund initiated successfully.",
    });
  })
);

export default router;