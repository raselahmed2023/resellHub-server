import { MongoClient, ServerApiVersion, ObjectId } from "mongodb";
import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import Stripe from "stripe";

dotenv.config();


const REQUIRED_ENV = [
  "MONGODB_URI",
  "CLIENT_URL",
  "BETTER_AUTH_URL",
  "BETTER_AUTH_SECRET",
  "STRIPE_SECRET_KEY",
];

const missingEnv = REQUIRED_ENV.filter((key) => !process.env[key]);

if (missingEnv.length) {
  throw new Error(
    `Missing required environment variables: ${missingEnv.join(", ")}`
  );
}

const PORT = Number(process.env.PORT || 5000);

const IS_PRODUCTION =
  process.env.NODE_ENV === "production";

const PAYMENT_CURRENCY = "bdt";

const DELIVERY_CHARGE =
  Number(
    process.env.DELIVERY_CHARGE_BDT ||
      100
  );

if (
  !Number.isFinite(
    DELIVERY_CHARGE
  ) ||
  DELIVERY_CHARGE < 0
) {
  throw new Error(
    "DELIVERY_CHARGE_BDT must be a non-negative number."
  );
}



const stripe =
  new Stripe(
    process.env.STRIPE_SECRET_KEY
  );

const app =
  express();

app.set(
  "trust proxy",
  1
);

app.use(
  cors({
    origin:
      process.env.CLIENT_URL,

    credentials:
      true,
  })
);

app.use(
  express.json({
    limit: "1mb",
  })
);



const client =
  new MongoClient(
    process.env.MONGODB_URI,

    {
      serverApi: {
        version:
          ServerApiVersion.v1,

        strict:
          true,

        deprecationErrors:
          true,
      },
    }
  );



const auth =
  betterAuth({
    database:
      mongodbAdapter(
        client.db(
          "resellHub"
        ),

        {
          client,
        }
      ),

    baseURL:
      process.env
        .BETTER_AUTH_URL,

    secret:
      process.env
        .BETTER_AUTH_SECRET,

    trustedOrigins: [
      process.env.CLIENT_URL,
    ].filter(Boolean),

    emailAndPassword: {
      enabled:
        true,
    },

    socialProviders: {
      google: {
        clientId:
          process.env
            .GOOGLE_CLIENT_ID,

        clientSecret:
          process.env
            .GOOGLE_CLIENT_SECRET,
      },
    },

    advanced: {
      useSecureCookies:
        IS_PRODUCTION,

      defaultCookieAttributes:
        {
          secure:
            IS_PRODUCTION,

          sameSite:
            IS_PRODUCTION
              ? "none"
              : "lax",

          path: "/",
        },
    },

    user: {
      additionalFields: {
        role: {
          type: "string",

          defaultValue:
            "buyer",

          // IMPORTANT:
          // Users cannot send role:
          // "admin" while signing up.
          input: false,
        },

        status: {
          type: "string",

          defaultValue:
            "active",

          input: false,
        },

        roleSelected: {
          type: "boolean",

          defaultValue:
            false,

          input: false,
        },

        location: {
          type: "string",

          required:
            false,
        },

        phone: {
          type: "string",

          required:
            false,
        },
      },
    },
  });



const asyncHandler =
  (fn) =>
  (
    req,
    res,
    next
  ) => {
    Promise.resolve(
      fn(
        req,
        res,
        next
      )
    ).catch(next);
  };

const isValidObjectId =
  (value) =>
    ObjectId.isValid(
      String(
        value || ""
      )
    );

const toObjectId =
  (value) =>
    isValidObjectId(
      value
    )
      ? new ObjectId(
          value
        )
      : null;

const cleanString =
  (
    value,
    max = 5000
  ) =>
    typeof value ===
    "string"
      ? value
          .trim()
          .slice(
            0,
            max
          )
      : "";

const escapeRegExp =
  (value) =>
    value.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );

const hasOwn =
  (
    object,
    key
  ) =>
    Object.prototype.hasOwnProperty.call(
      object,
      key
    );



const CATEGORIES =
  new Set([
    "Electronics",
    "Furniture",
    "Vehicles",
    "Fashion",
    "Mobile Phones",
    "Books",
    "Sports",
    "Other",
  ]);

const CONDITIONS =
  new Set([
    "New",
    "Like New",
    "Good",
    "Fair",
    "Used",
    "Refurbished",
  ]);

const PRODUCT_ADMIN_STATUSES =
  new Set([
    "pending",
    "available",
    "rejected",
    "reserved",
  ]);

const USER_ROLES =
  new Set([
    "buyer",
    "seller",
    "admin",
  ]);

const USER_STATUSES =
  new Set([
    "active",
    "blocked",
  ]);

const SELLER_ORDER_TRANSITIONS =
  {
    pending:
      new Set([
        "accepted",
        "cancelled",
      ]),

    accepted:
      new Set([
        "processing",
        "cancelled",
      ]),

    processing:
      new Set([
        "shipped",
      ]),

    shipped:
      new Set([
        "delivered",
      ]),

    delivered:
      new Set(),

    cancelled:
      new Set(),

    cancelling:
      new Set(),
  };



function validateProductPayload(
  body = {}
) {
  const title =
    cleanString(
      body.title,
      120
    );

  const category =
    cleanString(
      body.category,
      50
    );

  const condition =
    cleanString(
      body.condition,
      30
    );

  const description =
    cleanString(
      body.description,
      4000
    );

  const price =
    Number(
      body.price
    );

  const stock =
    Number(
      body.stock
    );

  const images =
    Array.isArray(
      body.images
    )
      ? body.images
          .filter(
            (url) =>
              typeof url ===
                "string" &&
              /^https?:\/\//i.test(
                url.trim()
              )
          )
          .map(
            (url) =>
              url.trim()
          )
          .slice(
            0,
            10
          )
      : [];

  if (
    title.length < 3
  ) {
    return {
      error:
        "Product title must be at least 3 characters.",
    };
  }

  if (
    !CATEGORIES.has(
      category
    )
  ) {
    return {
      error:
        "Invalid product category.",
    };
  }

  if (
    !CONDITIONS.has(
      condition
    )
  ) {
    return {
      error:
        "Invalid product condition.",
    };
  }

  if (
    !Number.isFinite(
      price
    ) ||
    price <= 0 ||
    price >
      99_999_999
  ) {
    return {
      error:
        "Price must be a valid positive number.",
    };
  }

  if (
    !Number.isInteger(
      stock
    ) ||
    stock < 0 ||
    stock >
      100_000
  ) {
    return {
      error:
        "Stock must be a non-negative whole number.",
    };
  }

  if (
    description.length <
    10
  ) {
    return {
      error:
        "Description must be at least 10 characters.",
    };
  }

  if (
    images.length === 0
  ) {
    return {
      error:
        "At least one valid product image is required.",
    };
  }

  return {
    value: {
      title,
      category,
      condition,
      description,
      price,
      stock,
      images,
    },
  };
}



function validateDeliveryInfo(
  info = {}
) {
  const name =
    cleanString(
      info.name,
      100
    );

  const phone =
    cleanString(
      info.phone,
      40
    );

  const address =
    cleanString(
      info.address,
      300
    );

  if (
    name.length < 2
  ) {
    return {
      error:
        "Delivery name is required.",
    };
  }

  if (
    phone.length < 6
  ) {
    return {
      error:
        "A valid delivery phone number is required.",
    };
  }

  if (
    address.length < 8
  ) {
    return {
      error:
        "A complete delivery address is required.",
    };
  }

  return {
    value: {
      name,
      phone,
      address,
    },
  };
}



function calculateOrderTotal(
  product
) {
  return Number(
    (
      Number(
        product.price
      ) +
      DELIVERY_CHARGE
    ).toFixed(2)
  );
}

function toStripeMinorUnits(
  amount
) {
  return Math.round(
    Number(
      amount
    ) * 100
  );
}

async function refundPaymentIntent(
  paymentIntentId,
  idempotencyKey
) {
  return stripe.refunds.create(
    {
      payment_intent:
        paymentIntentId,
    },

    {
      idempotencyKey,
    }
  );
}



function buildFetchHeaders(
  nodeHeaders
) {
  const headers =
    new Headers();

  for (
    const [
      key,
      value,
    ] of Object.entries(
      nodeHeaders
    )
  ) {
    if (
      Array.isArray(
        value
      )
    ) {
      value.forEach(
        (item) =>
          headers.append(
            key,
            item
          )
      );
    } else if (
      value !==
      undefined
    ) {
      headers.set(
        key,
        String(
          value
        )
      );
    }
  }

  return headers;
}



app.all(
  "/api/auth/*splat",

  asyncHandler(
    async (
      req,
      res
    ) => {
      const url =
        new URL(
          req.url,

          process.env
            .BETTER_AUTH_URL
        );

      const webRequest =
        new Request(
          url,

          {
            method:
              req.method,

            headers:
              buildFetchHeaders(
                req.headers
              ),

            body:
              req.method !==
                "GET" &&
              req.method !==
                "HEAD"
                ? JSON.stringify(
                    req.body ??
                      {}
                  )
                : undefined,
          }
        );

      const response =
        await auth.handler(
          webRequest
        );

      const setCookies =
        typeof response
          .headers
          .getSetCookie ===
        "function"
          ? response.headers.getSetCookie()
          : [];

      response.headers.forEach(
        (
          value,
          key
        ) => {
          if (
            key.toLowerCase() !==
            "set-cookie"
          ) {
            res.setHeader(
              key,
              value
            );
          }
        }
      );

      if (
        setCookies.length
      ) {
        res.setHeader(
          "set-cookie",
          setCookies
        );
      } else {
        const setCookie =
          response.headers.get(
            "set-cookie"
          );

        if (
          setCookie
        ) {
          res.setHeader(
            "set-cookie",
            setCookie
          );
        }
      }

      res
        .status(
          response.status
        )
        .send(
          await response.text()
        );
    }
  )
);



async function run() {
  await client.connect();

  const db =
    client.db(
      "resellHub"
    );

  const productsCollection =
    db.collection(
      "products"
    );

  const usersCollection =
    db.collection(
      "user"
    );

  const wishlistCollection =
    db.collection(
      "wishlist"
    );

  const ordersCollection =
    db.collection(
      "orders"
    );

  const contactMessagesCollection =
    db.collection(
      "contactMessages"
    );



  await Promise.all([
    productsCollection.createIndex(
      {
        status: 1,
        createdAt: -1,
      }
    ),

    productsCollection.createIndex(
      {
        "sellerInfo.userId":
          1,

        createdAt:
          -1,
      }
    ),

    ordersCollection.createIndex(
      {
        "buyerInfo.userId":
          1,

        createdAt:
          -1,
      }
    ),

    ordersCollection.createIndex(
      {
        "sellerInfo.userId":
          1,

        createdAt:
          -1,
      }
    ),
  ]);

  try {
    await wishlistCollection.createIndex(
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

  try {
    await ordersCollection.createIndex(
      {
        transactionId:
          1,
      },

      {
        unique: true,
        sparse: true,
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



  const getSessionContext =
    async (
      req
    ) => {
      const session =
        await auth.api.getSession(
          {
            headers:
              req.headers,
          }
        );

      if (
        !session?.user
          ?.email
      ) {
        return null;
      }

      const dbUser =
        await usersCollection.findOne(
          {
            email:
              session.user
                .email,
          }
        );

      if (
        !dbUser
      ) {
        return null;
      }

      return {
        session,

        user: {
          ...session.user,

          ...dbUser,

          id:
            session.user.id,

          role:
            dbUser.role ||
            session.user
              .role ||
            "buyer",

          status:
            dbUser.status ||
            session.user
              .status ||
            "active",
        },
      };
    };

  const verifyAuthenticated =
    asyncHandler(
      async (
        req,
        res,
        next
      ) => {
        const context =
          await getSessionContext(
            req
          );

        if (
          !context
        ) {
          return res
            .status(401)
            .send({
              message:
                "Unauthorized",
            });
        }

        if (
          context.user
            .status ===
          "blocked"
        ) {
          return res
            .status(403)
            .send({
              message:
                "Your account has been blocked.",
            });
        }

        req.authContext =
          context;

        req.user =
          context.user;

        next();
      }
    );

  const requireRole =
    (...roles) => [
      verifyAuthenticated,

      (
        req,
        res,
        next
      ) => {
        if (
          !roles.includes(
            req.user.role
          )
        ) {
          return res
            .status(403)
            .send({
              message:
                "Forbidden",
            });
        }

        next();
      },
    ];

  const verifyBuyer =
    requireRole(
      "buyer"
    );

  const verifySeller =
    requireRole(
      "seller"
    );

  const verifyAdmin =
    requireRole(
      "admin"
    );

  const sellerProductQuery =
    (user) => ({
      $or: [
        {
          "sellerInfo.userId":
            user.id,
        },

        {
          "sellerInfo.email":
            user.email,
        },
      ],
    });

  const sellerOrderQuery =
    (user) => ({
      $or: [
        {
          "sellerInfo.userId":
            user.id,
        },

        {
          "sellerInfo.email":
            user.email,
        },
      ],
    });



  const cancelOrderWithRefund =
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
        await ordersCollection.updateOne(
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

      if (
        !lock.modifiedCount
      ) {
        return {
          ok: false,

          status:
            409,

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

        if (
          productObjectId
        ) {
          await productsCollection.updateOne(
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

        await ordersCollection.updateOne(
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
      } catch (
        error
      ) {
        await ordersCollection.updateOne(
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



  app.get(
    "/",

    (
      req,
      res
    ) => {
      res.send(
        "ReSellHub API is running"
      );
    }
  );

  app.get(
    "/api/health",

    (
      req,
      res
    ) => {
      res.send({
        ok: true,

        service:
          "resellhub-server",
      });
    }
  );

  /* =======================================================
     USER ROLE SELECTION
  ======================================================= */

  app.post(
    "/api/users/select-role",

    verifyAuthenticated,

    asyncHandler(
      async (
        req,
        res
      ) => {
        const role =
          cleanString(
            req.body.role,
            20
          );

        if (
          role !==
            "buyer" &&
          role !==
            "seller"
        ) {
          return res
            .status(400)
            .send({
              message:
                "Role must be buyer or seller.",
            });
        }

        if (
          req.user.role ===
          "admin"
        ) {
          return res
            .status(403)
            .send({
              message:
                "Admin role cannot be changed here.",
            });
        }

        if (
          req.user
            .roleSelected ===
          true
        ) {
          return res
            .status(409)
            .send({
              message:
                "Account role has already been selected.",
            });
        }

        await usersCollection.updateOne(
          {
            email:
              req.user.email,
          },

          {
            $set: {
              role,

              roleSelected:
                true,

              status:
                req.user
                  .status ||
                "active",

              updatedAt:
                new Date(),
            },
          }
        );

        res.send({
          message:
            "Role selected.",

          role,
        });
      }
    )
  );

  /* =======================================================
     PROFILE UPDATE
  ======================================================= */

  app.patch(
    "/api/users/profile",

    verifyAuthenticated,

    asyncHandler(
      async (
        req,
        res
      ) => {
        const updateDoc = {
          $set: {
            updatedAt:
              new Date(),
          },
        };

        if (
          hasOwn(
            req.body,
            "name"
          )
        ) {
          const name =
            cleanString(
              req.body.name,
              100
            );

          if (
            name.length < 2
          ) {
            return res
              .status(400)
              .send({
                message:
                  "Name must be at least 2 characters.",
              });
          }

          updateDoc.$set.name =
            name;
        }

        if (
          hasOwn(
            req.body,
            "phone"
          )
        ) {
          updateDoc.$set.phone =
            cleanString(
              req.body.phone,
              40
            );
        }

        if (
          hasOwn(
            req.body,
            "location"
          )
        ) {
          updateDoc.$set.location =
            cleanString(
              req.body.location,
              120
            );
        }

        if (
          hasOwn(
            req.body,
            "photo"
          )
        ) {
          const photo =
            cleanString(
              req.body.photo,
              1000
            );

          if (
            photo &&
            !/^https?:\/\//i.test(
              photo
            )
          ) {
            return res
              .status(400)
              .send({
                message:
                  "Profile photo must be a valid URL.",
              });
          }

          updateDoc.$set.image =
            photo;
        }

        if (
          Object.keys(
            updateDoc.$set
          ).length === 1
        ) {
          return res
            .status(400)
            .send({
              message:
                "No profile fields were provided.",
            });
        }

        const result =
          await usersCollection.updateOne(
            {
              email:
                req.user
                  .email,
            },

            updateDoc
          );

        const sellerInfoUpdates =
          {};

        if (
          hasOwn(
            updateDoc.$set,
            "name"
          )
        ) {
          sellerInfoUpdates[
            "sellerInfo.name"
          ] =
            updateDoc.$set.name;
        }

        if (
          hasOwn(
            updateDoc.$set,
            "phone"
          )
        ) {
          sellerInfoUpdates[
            "sellerInfo.phone"
          ] =
            updateDoc.$set.phone;
        }

        if (
          hasOwn(
            updateDoc.$set,
            "location"
          )
        ) {
          sellerInfoUpdates[
            "sellerInfo.location"
          ] =
            updateDoc.$set.location;
        }

        if (
          Object.keys(
            sellerInfoUpdates
          ).length
        ) {
          await productsCollection.updateMany(
            {
              "sellerInfo.email":
                req.user
                  .email,
            },

            {
              $set:
                sellerInfoUpdates,
            }
          );
        }

        res.send(
          result
        );
      }
    )
  );

  /* =======================================================
     CREATE PRODUCT
  ======================================================= */

  app.post(
    "/api/products",

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

        const product = {
          ...validation.value,

          status:
            "pending",

          sellerInfo: {
            userId:
              req.user.id,

            name:
              req.user
                .name ||
              "",

            email:
              req.user.email,

            phone:
              req.user
                .phone ||
              "",

            location:
              req.user
                .location ||
              "",
          },

          createdAt:
            new Date(),

          updatedAt:
            new Date(),
        };

        const result =
          await productsCollection.insertOne(
            product
          );

        res
          .status(201)
          .send({
            insertedId:
              result.insertedId,

            product,
          });
      }
    )
  );


  app.get(
    "/api/products/featured",

    asyncHandler(
      async (
        req,
        res
      ) => {
        const products =
          await productsCollection
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



  app.get(
    "/api/products/my-products",

    ...verifySeller,

    asyncHandler(
      async (
        req,
        res
      ) => {
        const result =
          await productsCollection
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
          result
        );
      }
    )
  );

  app.get(
    "/api/seller/products/:id",

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

        if (
          !objectId
        ) {
          return res
            .status(400)
            .send({
              message:
                "Invalid product ID.",
            });
        }

        const product =
          await productsCollection.findOne(
            {
              _id:
                objectId,

              ...sellerProductQuery(
                req.user
              ),
            }
          );

        if (
          !product
        ) {
          return res
            .status(404)
            .send({
              message:
                "Product not found.",
            });
        }

        res.send(
          product
        );
      }
    )
  );



  app.get(
    "/api/categories/stats",

    asyncHandler(
      async (
        req,
        res
      ) => {
        const categories =
          await productsCollection
            .aggregate([
              {
                $match: {
                  status:
                    "available",

                  stock: {
                    $gt:
                      0,
                  },
                },
              },

              {
                $group: {
                  _id:
                    "$category",

                  count: {
                    $sum:
                      1,
                  },
                },
              },

              {
                $sort: {
                  count:
                    -1,
                },
              },
            ])
            .toArray();

        res.send(
          categories
        );
      }
    )
  );



  app.get(
    "/api/stats",

    asyncHandler(
      async (
        req,
        res
      ) => {
        const [
          totalProducts,
          totalSellers,
          totalBuyers,
          completedOrders,
        ] =
          await Promise.all([
            productsCollection.countDocuments(
              {
                status:
                  "available",

                stock: {
                  $gt:
                    0,
                },
              }
            ),

            usersCollection.countDocuments(
              {
                role:
                  "seller",

                status: {
                  $ne:
                    "blocked",
                },
              }
            ),

            usersCollection.countDocuments(
              {
                role:
                  "buyer",

                status: {
                  $ne:
                    "blocked",
                },
              }
            ),

            ordersCollection.countDocuments(
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
      }
    )
  );



  app.get(
    "/api/products",

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

        if (
          search
        ) {
          const safeSearch =
            cleanString(
              search,
              100
            );

          if (
            safeSearch
          ) {
            query.$or = [
              {
                title: {
                  $regex:
                    escapeRegExp(
                      safeSearch
                    ),

                  $options:
                    "i",
                },
              },

              {
                description:
                  {
                    $regex:
                      escapeRegExp(
                        safeSearch
                      ),

                    $options:
                      "i",
                  },
              },
            ];
          }
        }

        if (
          category
        ) {
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

        if (
          condition
        ) {
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
          query.price =
            {};

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

        const sortOption =
          sort ===
          "price_asc"
            ? {
                price:
                  1,

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
          (page - 1) *
          limit;

        const [
          total,
          products,
        ] =
          await Promise.all([
            productsCollection.countDocuments(
              query
            ),

            productsCollection
              .find(query)
              .sort(
                sortOption
              )
              .skip(skip)
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



  app.get(
    "/api/products/:id",

    asyncHandler(
      async (
        req,
        res
      ) => {
        const objectId =
          toObjectId(
            req.params.id
          );

        if (
          !objectId
        ) {
          return res
            .status(400)
            .send({
              message:
                "Invalid product ID.",
            });
        }

        const publicProduct =
          await productsCollection.findOne(
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

        if (
          publicProduct
        ) {
          return res.send(
            publicProduct
          );
        }

        /*
          Owner/admin can still fetch
          their pending/rejected listing.
        */

        const context =
          await getSessionContext(
            req
          );

        if (
          context
        ) {
          const privateProduct =
            await productsCollection.findOne(
              {
                _id:
                  objectId,
              }
            );

          if (
            privateProduct &&
            (
              context.user
                .role ===
                "admin" ||
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

 

  app.patch(
    "/api/products/:id",

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

        if (
          !objectId
        ) {
          return res
            .status(400)
            .send({
              message:
                "Invalid product ID.",
            });
        }

        const product =
          await productsCollection.findOne(
            {
              _id:
                objectId,

              ...sellerProductQuery(
                req.user
              ),
            }
          );

        if (
          !product
        ) {
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

        const result =
          await productsCollection.updateOne(
            {
              _id:
                objectId,

              ...sellerProductQuery(
                req.user
              ),
            },

            {
              $set: {
                ...validation.value,

                // Seller edit requires
                // admin approval again.
                status:
                  "pending",

                updatedAt:
                  new Date(),
              },
            }
          );

        res.send({
          ...result,

          status:
            "pending",
        });
      }
    )
  );



  app.delete(
    "/api/products/:id",

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

        if (
          !objectId
        ) {
          return res
            .status(400)
            .send({
              message:
                "Invalid product ID.",
            });
        }

        const openOrder =
          await ordersCollection.findOne(
            {
              productId:
                String(
                  objectId
                ),

              orderStatus:
                {
                  $nin: [
                    "delivered",
                    "cancelled",
                  ],
                },
            }
          );

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
          await productsCollection.deleteOne(
            {
              _id:
                objectId,

              ...sellerProductQuery(
                req.user
              ),
            }
          );

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

        res.send(
          result
        );
      }
    )
  );



  app.get(
    "/api/seller/overview",

    ...verifySeller,

    asyncHandler(
      async (
        req,
        res
      ) => {
        const sellerQuery =
          sellerOrderQuery(
            req.user
          );

        const [
          totalProducts,
          allOrders,
        ] =
          await Promise.all([
            productsCollection.countDocuments(
              sellerProductQuery(
                req.user
              )
            ),

            ordersCollection
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
                  order.amount ||
                    0
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
          [
            ...allOrders,
          ]
            .sort(
              (
                a,
                b
              ) =>
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
      }
    )
  );



  app.get(
    "/api/buyer/overview",

    ...verifyBuyer,

    asyncHandler(
      async (
        req,
        res
      ) => {
        const buyerQuery =
          {
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
            ordersCollection.countDocuments(
              buyerQuery
            ),

            ordersCollection.countDocuments(
              {
                ...buyerQuery,

                orderStatus:
                  "delivered",
              }
            ),

            ordersCollection.countDocuments(
              {
                ...buyerQuery,

                orderStatus:
                  "pending",
              }
            ),

            wishlistCollection.countDocuments(
              {
                userId:
                  req.user
                    .id,
              }
            ),

            ordersCollection
              .find(
                buyerQuery
              )
              .sort({
                createdAt:
                  -1,
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
      }
    )
  );

 

  app.get(
    "/api/wishlist",

    ...verifyBuyer,

    asyncHandler(
      async (
        req,
        res
      ) => {
        const items =
          await wishlistCollection
            .find({
              userId:
                req.user
                  .id,
            })
            .sort({
              createdAt:
                -1,
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
            .filter(
              Boolean
            );

        const products =
          productIds.length
            ? await productsCollection
                .find({
                  _id: {
                    $in:
                      productIds,
                  },

                  status:
                    "available",

                  stock: {
                    $gt:
                      0,
                  },
                })
                .toArray()
            : [];

        const productMap =
          new Map(
            products.map(
              (
                product
              ) => [
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
                  ) ||
                  null,
              })
            )
            .filter(
              (item) =>
                item.product
            )
        );
      }
    )
  );

  app.post(
    "/api/wishlist",

    ...verifyBuyer,

    asyncHandler(
      async (
        req,
        res
      ) => {
        const productId =
          cleanString(
            req.body
              .productId,
            50
          );

        const objectId =
          toObjectId(
            productId
          );

        if (
          !objectId
        ) {
          return res
            .status(400)
            .send({
              message:
                "Invalid product ID.",
            });
        }

        const product =
          await productsCollection.findOne(
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

        if (
          !product
        ) {
          return res
            .status(404)
            .send({
              message:
                "Product not found.",
            });
        }

        try {
          const result =
            await wishlistCollection.insertOne(
              {
                userId:
                  req.user
                    .id,

                productId,

                createdAt:
                  new Date(),
              }
            );

          res
            .status(201)
            .send(
              result
            );
        } catch (
          error
        ) {
          if (
            error?.code ===
            11000
          ) {
            return res.send({
              message:
                "Already in wishlist",
            });
          }

          throw error;
        }
      }
    )
  );

  app.delete(
    "/api/wishlist/:productId",

    ...verifyBuyer,

    asyncHandler(
      async (
        req,
        res
      ) => {
        const productId =
          cleanString(
            req.params
              .productId,
            50
          );

        if (
          !isValidObjectId(
            productId
          )
        ) {
          return res
            .status(400)
            .send({
              message:
                "Invalid product ID.",
            });
        }

        const result =
          await wishlistCollection.deleteOne(
            {
              userId:
                req.user
                  .id,

              productId,
            }
          );

        res.send(
          result
        );
      }
    )
  );



  app.post(
    "/api/create-payment-intent",

    ...verifyBuyer,

    asyncHandler(
      async (
        req,
        res
      ) => {

        const productId =
          cleanString(
            req.body
              .productId,
            50
          );

        const objectId =
          toObjectId(
            productId
          );

        if (
          !objectId
        ) {
          return res
            .status(400)
            .send({
              message:
                "Invalid product ID.",
            });
        }

        const product =
          await productsCollection.findOne(
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

        if (
          !product
        ) {
          return res
            .status(409)
            .send({
              message:
                "This product is unavailable or out of stock.",
            });
        }

        if (
          product
            .sellerInfo
            ?.userId ===
            req.user.id ||
          product
            .sellerInfo
            ?.email ===
            req.user.email
        ) {
          return res
            .status(400)
            .send({
              message:
                "You cannot purchase your own product.",
            });
        }

        const amount =
          calculateOrderTotal(
            product
          );

        const paymentIntent =
          await stripe.paymentIntents.create(
            {
              amount:
                toStripeMinorUnits(
                  amount
                ),

              currency:
                PAYMENT_CURRENCY,

              automatic_payment_methods:
                {
                  enabled:
                    true,
                },

              metadata: {
                productId,

                buyerId:
                  req.user.id,

                buyerEmail:
                  req.user
                    .email,
              },
            }
          );

        res.send({
          clientSecret:
            paymentIntent.client_secret,

          amount,

          productPrice:
            Number(
              product.price
            ),

          deliveryCharge:
            DELIVERY_CHARGE,

          currency:
            PAYMENT_CURRENCY,
        });
      }
    )
  );


  

  app.post(
    "/api/orders",

    ...verifyBuyer,

    asyncHandler(
      async (
        req,
        res
      ) => {
        const productId =
          cleanString(
            req.body
              .productId,
            50
          );

        const transactionId =
          cleanString(
            req.body
              .transactionId,
            120
          );

        const productObjectId =
          toObjectId(
            productId
          );

        if (
          !productObjectId
        ) {
          return res
            .status(400)
            .send({
              message:
                "Invalid product ID.",
            });
        }

        if (
          !transactionId.startsWith(
            "pi_"
          )
        ) {
          return res
            .status(400)
            .send({
              message:
                "Invalid payment transaction.",
            });
        }

        const deliveryValidation =
          validateDeliveryInfo(
            req.body
              .deliveryInfo
          );

        if (
          deliveryValidation.error
        ) {
          return res
            .status(400)
            .send({
              message:
                deliveryValidation.error,
            });
        }



        const existingOrder =
          await ordersCollection.findOne(
            {
              transactionId,
            }
          );

        if (
          existingOrder
        ) {
          if (
            existingOrder
              .buyerInfo
              ?.userId !==
            req.user.id
          ) {
            return res
              .status(409)
              .send({
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
          paymentIntent
            .metadata
            ?.productId ===
            productId &&
          paymentIntent
            .metadata
            ?.buyerId ===
            req.user.id;

        if (
          !paymentIdentityMatches
        ) {
          return res
            .status(400)
            .send({
              message:
                "Payment verification failed.",
            });
        }

        if (
          paymentIntent.status !==
          "succeeded"
        ) {
          return res
            .status(400)
            .send({
              message:
                "Payment has not completed successfully.",
            });
        }

        const product =
          await productsCollection.findOne(
            {
              _id:
                productObjectId,
            }
          );

        if (
          !product
        ) {
          await refundPaymentIntent(
            transactionId,

            `failed-order-${transactionId}`
          );

          return res
            .status(409)
            .send({
              message:
                "The product is no longer available. Your payment has been refunded.",
            });
        }

        if (
          product
            .sellerInfo
            ?.userId ===
            req.user.id ||
          product
            .sellerInfo
            ?.email ===
            req.user.email
        ) {
          await refundPaymentIntent(
            transactionId,

            `failed-order-${transactionId}`
          );

          return res
            .status(400)
            .send({
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

        if (
          !amountMatches
        ) {
          await refundPaymentIntent(
            transactionId,

            `failed-order-${transactionId}`
          );

          return res
            .status(409)
            .send({
              message:
                "The listing price changed before the order was created. Your payment has been refunded.",
            });
        }

       

        const reservedProduct =
          await productsCollection.findOneAndUpdate(
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

        if (
          !reservedProduct
        ) {
          try {
            await refundPaymentIntent(
              transactionId,

              `failed-order-${transactionId}`
            );

            return res
              .status(409)
              .send({
                message:
                  "The product became unavailable. Your payment has been refunded.",
              });
          } catch (
            refundError
          ) {
            console.error(
              "Automatic refund failed:",

              refundError
            );

            return res
              .status(409)
              .send({
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
              req.user
                .name ||
              "",

            email:
              req.user.email,
          },

          sellerInfo:
            reservedProduct.sellerInfo,

          productId,

          productTitle:
            reservedProduct.title,

          productImage:
            reservedProduct
              .images?.[0] ||
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
            await ordersCollection.insertOne(
              order
            );

          return res
            .status(201)
            .send({
              order: {
                ...order,

                _id:
                  result.insertedId,
              },
            });
        } catch (
          error
        ) {
          

          await productsCollection.updateOne(
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
            error?.code ===
            11000
          ) {
            const duplicate =
              await ordersCollection.findOne(
                {
                  transactionId,
                }
              );

            if (
              duplicate
                ?.buyerInfo
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
          } catch (
            refundError
          ) {
            console.error(
              "Refund after order insert failure also failed:",

              refundError
            );
          }

          return res
            .status(500)
            .send({
              message:
                "Order could not be created. Your payment was refunded or queued for refund review.",
            });
        }
      }
    )
  );



  app.get(
    "/api/orders/my-orders",

    ...verifyBuyer,

    asyncHandler(
      async (
        req,
        res
      ) => {
        const result =
          await ordersCollection
            .find({
              "buyerInfo.userId":
                req.user
                  .id,
            })
            .sort({
              createdAt:
                -1,
            })
            .toArray();

        res.send(
          result
        );
      }
    )
  );



  app.get(
    "/api/orders/payments",

    ...verifyBuyer,

    asyncHandler(
      async (
        req,
        res
      ) => {
        const result =
          await ordersCollection
            .find({
              "buyerInfo.userId":
                req.user
                  .id,

              paymentStatus:
                {
                  $in: [
                    "paid",
                    "refunded",
                  ],
                },
            })
            .sort({
              createdAt:
                -1,
            })
            .toArray();

        res.send(
          result
        );
      }
    )
  );



  app.get(
    "/api/orders/:id",

    ...verifyBuyer,

    asyncHandler(
      async (
        req,
        res
      ) => {
        const objectId =
          toObjectId(
            req.params.id
          );

        if (
          !objectId
        ) {
          return res
            .status(400)
            .send({
              message:
                "Invalid order ID.",
            });
        }

        const order =
          await ordersCollection.findOne(
            {
              _id:
                objectId,

              "buyerInfo.userId":
                req.user
                  .id,
            }
          );

        if (
          !order
        ) {
          return res
            .status(404)
            .send({
              message:
                "Order not found.",
            });
        }

        res.send(
          order
        );
      }
    )
  );



  app.patch(
    "/api/orders/:id/cancel",

    ...verifyBuyer,

    asyncHandler(
      async (
        req,
        res
      ) => {
        const objectId =
          toObjectId(
            req.params.id
          );

        if (
          !objectId
        ) {
          return res
            .status(400)
            .send({
              message:
                "Invalid order ID.",
            });
        }

        const order =
          await ordersCollection.findOne(
            {
              _id:
                objectId,

              "buyerInfo.userId":
                req.user
                  .id,
            }
          );

        if (
          !order
        ) {
          return res
            .status(404)
            .send({
              message:
                "Order not found.",
            });
        }

        if (
          order.orderStatus !==
          "pending"
        ) {
          return res
            .status(409)
            .send({
              message:
                "Only pending orders can be cancelled by the buyer.",
            });
        }

        const result =
          await cancelOrderWithRefund(
            {
              order,

              actor:
                "buyer",

              actorId:
                req.user
                  .id,
            }
          );

        if (
          !result.ok
        ) {
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
      }
    )
  );



  app.get(
    "/api/seller/orders",

    ...verifySeller,

    asyncHandler(
      async (
        req,
        res
      ) => {
        const result =
          await ordersCollection
            .find(
              sellerOrderQuery(
                req.user
              )
            )
            .sort({
              createdAt:
                -1,
            })
            .toArray();

        res.send(
          result
        );
      }
    )
  );



  app.patch(
    "/api/orders/:id/status",

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

        if (
          !objectId
        ) {
          return res
            .status(400)
            .send({
              message:
                "Invalid order ID.",
            });
        }

        const orderStatus =
          cleanString(
            req.body
              .orderStatus,
            30
          );

        const order =
          await ordersCollection.findOne(
            {
              _id:
                objectId,

              ...sellerOrderQuery(
                req.user
              ),
            }
          );

        if (
          !order
        ) {
          return res
            .status(404)
            .send({
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
          return res
            .status(409)
            .send({
              message:
                `Order cannot move from ${order.orderStatus} to ${orderStatus}.`,
            });
        }

        /*
          Seller cancellation
          also performs refund.
        */

        if (
          orderStatus ===
          "cancelled"
        ) {
          const cancelResult =
            await cancelOrderWithRefund(
              {
                order,

                actor:
                  "seller",

                actorId:
                  req.user
                    .id,
              }
            );

          if (
            !cancelResult.ok
          ) {
            return res
              .status(
                cancelResult.status
              )
              .send({
                message:
                  cancelResult.message,
              });
          }

          return res.send({
            message:
              "Order cancelled and refund initiated successfully.",
          });
        }

        const result =
          await ordersCollection.updateOne(
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
          return res
            .status(409)
            .send({
              message:
                "Order status changed. Refresh and try again.",
            });
        }

        res.send(
          result
        );
      }
    )
  );



  app.get(
    "/api/admin/overview",

    ...verifyAdmin,

    asyncHandler(
      async (
        req,
        res
      ) => {
        const [
          totalUsers,
          totalProducts,
          totalOrders,
          revenueResult,
        ] =
          await Promise.all([
            usersCollection.countDocuments(),

            productsCollection.countDocuments(),

            ordersCollection.countDocuments(),

            ordersCollection
              .aggregate([
                {
                  $match: {
                    paymentStatus:
                      "paid",

                    orderStatus:
                      {
                        $ne:
                          "cancelled",
                      },
                  },
                },

                {
                  $group: {
                    _id:
                      null,

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
            revenueResult[
              0
            ]?.total ||
            0,
        });
      }
    )
  );


  app.get(
    "/api/admin/users",

    ...verifyAdmin,

    asyncHandler(
      async (
        req,
        res
      ) => {
        const result =
          await usersCollection
            .find(
              {},

              {
                projection:
                  {
                    password:
                      0,
                  },
              }
            )
            .sort({
              createdAt:
                -1,
            })
            .toArray();

        res.send(
          result
        );
      }
    )
  );


  app.get(
    "/api/admin/products",

    ...verifyAdmin,

    asyncHandler(
      async (
        req,
        res
      ) => {
        const result =
          await productsCollection
            .find()
            .sort({
              createdAt:
                -1,
            })
            .toArray();

        res.send(
          result
        );
      }
    )
  );

  app.patch(
    "/api/admin/products/:id",

    ...verifyAdmin,

    asyncHandler(
      async (
        req,
        res
      ) => {
        const objectId =
          toObjectId(
            req.params.id
          );

        if (
          !objectId
        ) {
          return res
            .status(400)
            .send({
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
          return res
            .status(400)
            .send({
              message:
                "Invalid product status.",
            });
        }

        const result =
          await productsCollection.updateOne(
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
          return res
            .status(404)
            .send({
              message:
                "Product not found.",
            });
        }

        res.send(
          result
        );
      }
    )
  );

  app.delete(
    "/api/admin/products/:id",

    ...verifyAdmin,

    asyncHandler(
      async (
        req,
        res
      ) => {
        const objectId =
          toObjectId(
            req.params.id
          );

        if (
          !objectId
        ) {
          return res
            .status(400)
            .send({
              message:
                "Invalid product ID.",
            });
        }

        const openOrder =
          await ordersCollection.findOne(
            {
              productId:
                String(
                  objectId
                ),

              orderStatus:
                {
                  $nin: [
                    "delivered",
                    "cancelled",
                  ],
                },
            }
          );

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
          await productsCollection.deleteOne(
            {
              _id:
                objectId,
            }
          );

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

        res.send(
          result
        );
      }
    )
  );



  app.get(
    "/api/admin/orders",

    ...verifyAdmin,

    asyncHandler(
      async (
        req,
        res
      ) => {
        const result =
          await ordersCollection
            .find()
            .sort({
              createdAt:
                -1,
            })
            .toArray();

        res.send(
          result
        );
      }
    )
  );



  app.patch(
    "/api/admin/users/:id",

    ...verifyAdmin,

    asyncHandler(
      async (
        req,
        res
      ) => {
        const objectId =
          toObjectId(
            req.params.id
          );

        if (
          !objectId
        ) {
          return res
            .status(400)
            .send({
              message:
                "Invalid user ID.",
            });
        }

        const targetUser =
          await usersCollection.findOne(
            {
              _id:
                objectId,
            }
          );

        if (
          !targetUser
        ) {
          return res
            .status(404)
            .send({
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
            return res
              .status(400)
              .send({
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
              req.body
                .status,
              20
            );

          if (
            !USER_STATUSES.has(
              status
            )
          ) {
            return res
              .status(400)
              .send({
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
            return res
              .status(400)
              .send({
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
          return res
            .status(400)
            .send({
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
          return res
            .status(400)
            .send({
              message:
                "You cannot remove your own admin role.",
            });
        }

        const result =
          await usersCollection.updateOne(
            {
              _id:
                objectId,
            },

            updateDoc
          );

        res.send(
          result
        );
      }
    )
  );


  app.delete(
    "/api/admin/users/:id",

    ...verifyAdmin,

    asyncHandler(
      async (
        req,
        res
      ) => {
        const objectId =
          toObjectId(
            req.params.id
          );

        if (
          !objectId
        ) {
          return res
            .status(400)
            .send({
              message:
                "Invalid user ID.",
            });
        }

        const targetUser =
          await usersCollection.findOne(
            {
              _id:
                objectId,
            }
          );

        if (
          !targetUser
        ) {
          return res
            .status(404)
            .send({
              message:
                "User not found.",
            });
        }

        if (
          targetUser.email ===
          req.user.email
        ) {
          return res
            .status(400)
            .send({
              message:
                "You cannot delete your own admin account.",
            });
        }

        const [
          hasProducts,
          hasOrders,
        ] =
          await Promise.all([
            productsCollection.findOne(
              {
                "sellerInfo.email":
                  targetUser.email,
              }
            ),

            ordersCollection.findOne(
              {
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
              }
            ),
          ]);

        if (
          hasProducts ||
          hasOrders
        ) {
          return res
            .status(409)
            .send({
              message:
                "This account has marketplace history. Block the user instead of deleting the account.",
            });
        }

        const result =
          await usersCollection.deleteOne(
            {
              _id:
                objectId,
            }
          );

        res.send(
          result
        );
      }
    )
  );


app.post(
  "/api/ai/chat",

  asyncHandler(
    async (req, res) => {
      if (!process.env.GEMINI_API_KEY) {
        return res
          .status(503)
          .send({
            message:
              "ReSell Guide is temporarily unavailable.",
          });
      }

      const message =
        cleanString(
          req.body.message,
          600
        );

      if (!message) {
        return res
          .status(400)
          .send({
            message:
              "Please enter a message.",
          });
      }

      const history =
        Array.isArray(
          req.body.history
        )
          ? req.body.history
              .slice(-6)
              .map((item) => ({
                role:
                  item?.role ===
                  "assistant"
                    ? "assistant"
                    : "user",

                content:
                  cleanString(
                    item?.content,
                    400
                  ),
              }))
              .filter(
                (item) =>
                  item.content
              )
          : [];

      const historyText =
        history
          .map(
            (item) =>
              `${item.role}: ${item.content}`
          )
          .join("\n");

      const prompt = `
You are ReSell Guide, the AI assistant for ReSellHub, a pre-owned marketplace.

You help users:
- find products available on ReSellHub
- understand product conditions
- understand how to buy
- understand how to sell
- understand checkout, wishlist and orders
- navigate the marketplace

ReSellHub facts:
- Accounts can be Buyer or Seller.
- Buyers can browse products, use wishlist, purchase products and manage orders.
- Sellers can add and manage their own product listings and manage seller orders.
- Seller product listings go through marketplace status handling before becoming publicly available.
- Only available products with stock should be recommended.
- Payments are handled securely through Stripe.
- Product information must come from the ReSellHub database.
- Never invent a product, price, stock quantity or seller.
- If the user asks something unrelated to ReSellHub, politely guide them back to marketplace help.

Understand both English and Bangla/Banglish.

Examples:
"5k" means 5000.
"5 হাজার" means 5000.
"20k" means 20000.
"২০ হাজার" means 20000.

Allowed categories:
Electronics
Furniture
Vehicles
Fashion
Mobile Phones
Books
Sports
Other

Allowed conditions:
New
Like New
Good
Fair
Used
Refurbished

Return ONLY valid JSON with this exact structure:

{
  "type": "product_search" | "platform_help",
  "search": "",
  "category": "",
  "condition": "",
  "minPrice": null,
  "maxPrice": null,
  "sort": "newest" | "price_asc" | "price_desc",
  "answer": ""
}

For product_search:
- Extract the user's requested product keyword into search.
- Use an allowed category only when clearly applicable.
- Use an allowed condition only when requested.
- Extract price limits when provided.
- Use price_asc if they ask for cheapest or low price.
- Use price_desc if they ask for expensive/highest price.
- answer should be a short natural response in the same language style as the user.
- Do not mention any specific product because database results will be added later.

For platform_help:
- search, category and condition should be empty.
- minPrice and maxPrice should be null.
- Answer the question briefly using only the ReSellHub facts above.
- Use the same language style as the user.

Conversation history:
${historyText || "No previous messages"}

Current user message:
${message}
`;

      const aiResponse =
        await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,

          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",

              "x-goog-api-key":
                process.env
                  .GEMINI_API_KEY,
            },

            body:
              JSON.stringify({
                contents: [
                  {
                    role: "user",

                    parts: [
                      {
                        text:
                          prompt,
                      },
                    ],
                  },
                ],

                generationConfig:
                  {
                    temperature:
                      0.1,

                    responseMimeType:
                      "application/json",
                  },
              }),
          }
        );

      if (!aiResponse.ok) {
        const providerError =
          await aiResponse.text();

        console.error(
          "Gemini API error:",
          providerError
        );

        return res
          .status(502)
          .send({
            message:
              "ReSell Guide could not respond right now.",
          });
      }

      const aiData =
        await aiResponse.json();

      const rawText =
        aiData?.candidates?.[0]
          ?.content?.parts
          ?.map(
            (part) =>
              part?.text || ""
          )
          .join("")
          .trim();

      if (!rawText) {
        return res
          .status(502)
          .send({
            message:
              "ReSell Guide returned an empty response.",
          });
      }

      let intent;

      try {
        intent =
          JSON.parse(
            rawText
              .replace(
                /^```json/i,
                ""
              )
              .replace(
                /```$/i,
                ""
              )
              .trim()
          );
      } catch {
        console.error(
          "Invalid AI JSON:",
          rawText
        );

        return res
          .status(502)
          .send({
            message:
              "ReSell Guide could not understand the request.",
          });
      }

      if (
        intent.type !==
        "product_search"
      ) {
        return res.send({
          reply:
            cleanString(
              intent.answer,
              1000
            ) ||
            "How can I help you with ReSellHub?",

          products: [],
        });
      }

      const query = {
        status:
          "available",

        stock: {
          $gt: 0,
        },
      };

      const category =
        cleanString(
          intent.category,
          50
        );

      if (
        category &&
        CATEGORIES.has(
          category
        )
      ) {
        query.category =
          category;
      }

      const condition =
        cleanString(
          intent.condition,
          30
        );

      if (
        condition &&
        CONDITIONS.has(
          condition
        )
      ) {
        query.condition =
          condition;
      }

      const minPrice =
        Number(
          intent.minPrice
        );

      const maxPrice =
        Number(
          intent.maxPrice
        );

      const hasMinPrice =
        intent.minPrice !==
          null &&
        intent.minPrice !==
          "" &&
        Number.isFinite(
          minPrice
        ) &&
        minPrice >= 0;

      const hasMaxPrice =
        intent.maxPrice !==
          null &&
        intent.maxPrice !==
          "" &&
        Number.isFinite(
          maxPrice
        ) &&
        maxPrice >= 0;

      if (
        hasMinPrice ||
        hasMaxPrice
      ) {
        query.price = {};

        if (hasMinPrice) {
          query.price.$gte =
            minPrice;
        }

        if (hasMaxPrice) {
          query.price.$lte =
            maxPrice;
        }
      }

      const search =
        cleanString(
          intent.search,
          100
        );

      if (search) {
        const escaped =
          escapeRegExp(
            search
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

      let sortOption = {
        createdAt: -1,
      };

      if (
        intent.sort ===
        "price_asc"
      ) {
        sortOption = {
          price: 1,
        };
      }

      if (
        intent.sort ===
        "price_desc"
      ) {
        sortOption = {
          price: -1,
        };
      }

      const products =
        await productsCollection
          .find(
            query,

            {
              projection: {
                title: 1,
                category: 1,
                condition: 1,
                price: 1,
                stock: 1,
                images: 1,
                sellerInfo: 1,
                createdAt: 1,
              },
            }
          )
          .sort(
            sortOption
          )
          .limit(6)
          .toArray();

      if (
        products.length === 0
      ) {
        return res.send({
          reply:
            "I couldn't find a matching available product right now. Try changing the product name, condition, or price range.",

          products: [],
        });
      }

      const aiReply =
        cleanString(
          intent.answer,
          600
        );

      res.send({
        reply:
          aiReply ||
          `I found ${products.length} matching product${
            products.length ===
            1
              ? ""
              : "s"
          } for you.`,

        products:
          products.map(
            (product) => ({
              _id:
                product._id,

              title:
                product.title,

              category:
                product.category,

              condition:
                product.condition,

              price:
                product.price,

              stock:
                product.stock,

              image:
                product
                  .images?.[0] ||
                "",

              seller:
                product
                  .sellerInfo
                  ?.name ||
                "Seller",

              href:
                `/products/${product._id}`,
            })
          ),
      });
    }
  )
);


  app.post(
    "/api/contact",

    asyncHandler(
      async (
        req,
        res
      ) => {
        const name =
          cleanString(
            req.body.name,
            100
          );

        const email =
          cleanString(
            req.body.email,
            160
          ).toLowerCase();

        const subject =
          cleanString(
            req.body.subject,
            160
          );

        const message =
          cleanString(
            req.body.message,
            3000
          );

        if (
          name.length < 2
        ) {
          return res
            .status(400)
            .send({
              message:
                "Name is required.",
            });
        }

        if (
          !/^\S+@\S+\.\S+$/.test(
            email
          )
        ) {
          return res
            .status(400)
            .send({
              message:
                "A valid email address is required.",
            });
        }

        if (
          message.length <
          10
        ) {
          return res
            .status(400)
            .send({
              message:
                "Message must be at least 10 characters.",
            });
        }

        const result =
          await contactMessagesCollection.insertOne(
            {
              name,
              email,
              subject,
              message,

              status:
                "new",

              createdAt:
                new Date(),
            }
          );

        res
          .status(201)
          .send({
            message:
              "Message received successfully.",

            insertedId:
              result.insertedId,
          });
      }
    )
  );



  app.use(
    (
      req,
      res
    ) => {
      res
        .status(404)
        .send({
          message:
            "API route not found.",
        });
    }
  );



  app.use(
    (
      error,
      req,
      res,
      next
    ) => {
      console.error(
        error
      );

      if (
        res.headersSent
      ) {
        return next(
          error
        );
      }

      if (
        error?.type ===
          "entity.parse.failed" ||
        error instanceof
          SyntaxError
      ) {
        return res
          .status(400)
          .send({
            message:
              "Invalid JSON request.",
          });
      }

      if (
        error?.code ===
        11000
      ) {
        return res
          .status(409)
          .send({
            message:
              "Duplicate record.",
          });
      }

      if (
        error?.type ===
        "StripeInvalidRequestError"
      ) {
        return res
          .status(400)
          .send({
            message:
              "Payment request could not be processed.",
          });
      }

      return res
        .status(500)
        .send({
          message:
            "Internal server error.",
        });
    }
  );



  app.listen(
    PORT,

    () => {
      console.log(
        `ReSellHub server running on port ${PORT}`
      );
    }
  );
}



run().catch(
  (
    error
  ) => {
    console.error(
      "Server startup failed:",

      error
    );

    process.exitCode =
      1;
  }
);