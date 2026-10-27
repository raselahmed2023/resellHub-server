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

      /*
       * Student Zone filters
       */

      collections.products.createIndex(
        {
          "studentZone.enabled": 1,

          "studentZone.institutionId":
            1,

          "studentZone.campusId":
            1,

          status:
            1,

          createdAt:
            -1,
        }
      ),

      collections.orders.createIndex(
        {
          "buyerInfo.userId":
            1,

          createdAt:
            -1,
        }
      ),

      collections.orders.createIndex(
        {
          "sellerInfo.userId":
            1,

          createdAt:
            -1,
        }
      ),

      /*
       * Institution lookup
       */

      collections.institutions.createIndex(
        {
          status: 1,
          type: 1,
          name: 1,
        }
      ),

      /*
       * Campus lookup
       */

      collections.campuses.createIndex(
        {
          institutionId:
            1,

          status:
            1,

          name:
            1,
        }
      ),
    ]);

    /*
     * Wishlist uniqueness
     */

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
    } catch (
      error
    ) {
      console.warn(
        "Wishlist unique index could not be created. Remove duplicate wishlist entries first.",
        error?.message ||
          error
      );
    }

    /*
     * Transaction uniqueness
     */

    try {
      await collections.orders.createIndex(
        {
          transactionId:
            1,
        },

        {
          unique:
            true,

          sparse:
            true,
        }
      );
    } catch (
      error
    ) {
      console.warn(
        "Order transaction unique index could not be created. Remove duplicate transaction IDs first.",
        error?.message ||
          error
      );
    }

    /*
     * Institution slug
     */

    try {
      await collections.institutions.createIndex(
        {
          slug: 1,
        },

        {
          unique: true,
        }
      );
    } catch (
      error
    ) {
      console.warn(
        "Institution unique index could not be created.",
        error?.message ||
          error
      );
    }

    /*
     * Campus uniqueness
     */

    try {
      await collections.campuses.createIndex(
        {
          institutionId:
            1,

          slug:
            1,
        },

        {
          unique:
            true,
        }
      );
    } catch (
      error
    ) {
      console.warn(
        "Campus unique index could not be created.",
        error?.message ||
          error
      );
    }
  };