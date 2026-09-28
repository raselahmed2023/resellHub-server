import {
  collections,
} from "./db.js";

export const createIndexes =
  async () => {
    await Promise.all([
      collections.products.createIndex(
        {
          status: 1,
          createdAt: -1,
        }
      ),

      collections.products.createIndex(
        {
          "sellerInfo.userId": 1,
          createdAt: -1,
        }
      ),

      collections.orders.createIndex(
        {
          "buyerInfo.userId": 1,
          createdAt: -1,
        }
      ),

      collections.orders.createIndex(
        {
          "sellerInfo.userId": 1,
          createdAt: -1,
        }
      ),
    ]);

    try {
      await collections.wishlist.createIndex(
        {
          userId: 1,
          productId: 1,
        },
        {
          unique: true,
        }
      );
    } catch (error) {
      console.warn(
        "Wishlist unique index could not be created. Remove duplicate wishlist entries first.",
        error?.message || error
      );
    }

    try {
      await collections.orders.createIndex(
        {
          transactionId: 1,
        },
        {
          unique: true,
          sparse: true,
        }
      );
    } catch (error) {
      console.warn(
        "Order transaction unique index could not be created. Remove duplicate transaction IDs first.",
        error?.message || error
      );
    }
  };