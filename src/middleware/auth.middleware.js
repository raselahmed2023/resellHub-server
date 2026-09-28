import { auth } from "../config/auth.js";
import { collections } from "../config/db.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const getSessionContext = async (req) => {
  const session =
    await auth.api.getSession({
      headers: req.headers,
    });

  if (!session?.user?.email) {
    return null;
  }

  const dbUser =
    await collections.users.findOne({
      email: session.user.email,
    });

  if (!dbUser) {
    return null;
  }

  return {
    session,
    user: {
      ...session.user,
      ...dbUser,
      id: session.user.id,
      role:
        dbUser.role ||
        session.user.role ||
        "buyer",
      status:
        dbUser.status ||
        session.user.status ||
        "active",
    },
  };
};

export const verifyAuthenticated =
  asyncHandler(
    async (req, res, next) => {
      const context =
        await getSessionContext(req);

      if (!context) {
        return res
          .status(401)
          .send({
            message: "Unauthorized",
          });
      }

      if (
        context.user.status ===
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

export const requireRole =
  (...roles) => [
    verifyAuthenticated,

    (req, res, next) => {
      if (
        !roles.includes(
          req.user.role
        )
      ) {
        return res
          .status(403)
          .send({
            message: "Forbidden",
          });
      }

      next();
    },
  ];

export const verifyBuyer =
  requireRole("buyer");

export const verifySeller =
  requireRole("seller");

export const verifyAdmin =
  requireRole("admin");

export const sellerProductQuery =
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

export const sellerOrderQuery =
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