import { stripe } from "../config/stripe.js";
import { collections } from "../config/db.js";
import {
  DELIVERY_CHARGE,
} from "../config/env.js";
import {
  toObjectId,
} from "../utils/objectId.js";

export const calculateOrderTotal = (
  product
) => {
  return Number(
    (
      Number(product.price) +
      DELIVERY_CHARGE
    ).toFixed(2)
  );
};

export const toStripeMinorUnits = (
  amount
) => {
  return Math.round(
    Number(amount) * 100
  );
};

export const refundPaymentIntent = async (
  paymentIntentId,
  idempotencyKey
) => {
  return stripe.refunds.create(
    {
      payment_intent:
        paymentIntentId,
    },
    {
      idempotencyKey,
    }
  );
};

export const cancelOrderWithRefund =
  async ({
    order,
    actor,
    actorId,
  }) => {
    const orderObjectId =
      order._id;

    const previousStatus =
      order.orderStatus;

    const lock =
      await collections.orders.updateOne(
        {
          _id:
            orderObjectId,
          orderStatus:
            previousStatus,
        },
        {
          $set: {
            orderStatus:
              "cancelling",
            updatedAt:
              new Date(),
          },
        }
      );

    if (!lock.modifiedCount) {
      return {
        ok: false,
        status: 409,
        message:
          "Order status changed. Refresh and try again.",
      };
    }

    try {
      if (
        order.paymentStatus ===
          "paid" &&
        order.transactionId
      ) {
        await refundPaymentIntent(
          order.transactionId,
          `cancel-${String(
            order._id
          )}-${actor}`
        );
      }

      const productObjectId =
        toObjectId(
          order.productId
        );

      if (productObjectId) {
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
      }

      await collections.orders.updateOne(
        {
          _id:
            orderObjectId,
          orderStatus:
            "cancelling",
        },
        {
          $set: {
            orderStatus:
              "cancelled",
            paymentStatus:
              order.paymentStatus ===
              "paid"
                ? "refunded"
                : order.paymentStatus,
            cancelledBy:
              actor,
            cancelledById:
              actorId,
            cancelledAt:
              new Date(),
            updatedAt:
              new Date(),
          },
        }
      );

      return {
        ok: true,
      };
    } catch (error) {
      await collections.orders.updateOne(
        {
          _id:
            orderObjectId,
          orderStatus:
            "cancelling",
        },
        {
          $set: {
            orderStatus:
              previousStatus,
            updatedAt:
              new Date(),
          },
        }
      );

      throw error;
    }
  };