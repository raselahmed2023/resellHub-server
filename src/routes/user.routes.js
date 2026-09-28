import { Router } from "express";

import { collections } from "../config/db.js";
import {
  verifyAuthenticated,
} from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  cleanString,
  hasOwn,
} from "../utils/helpers.js";

const router = Router();

router.post(
  "/select-role",
  verifyAuthenticated,
  asyncHandler(async (req, res) => {
    const role = cleanString(
      req.body.role,
      20
    );

    if (
      role !== "buyer" &&
      role !== "seller"
    ) {
      return res.status(400).send({
        message:
          "Role must be buyer or seller.",
      });
    }

    if (req.user.role === "admin") {
      return res.status(403).send({
        message:
          "Admin role cannot be changed here.",
      });
    }

    if (
      req.user.roleSelected === true
    ) {
      return res.status(409).send({
        message:
          "Account role has already been selected.",
      });
    }

    await collections.users.updateOne(
      {
        email: req.user.email,
      },
      {
        $set: {
          role,
          roleSelected: true,
          status:
            req.user.status ||
            "active",
          updatedAt:
            new Date(),
        },
      }
    );

    res.send({
      message: "Role selected.",
      role,
    });
  })
);

router.patch(
  "/profile",
  verifyAuthenticated,
  asyncHandler(async (req, res) => {
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

      if (name.length < 2) {
        return res.status(400).send({
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
        return res.status(400).send({
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
      return res.status(400).send({
        message:
          "No profile fields were provided.",
      });
    }

    const result =
      await collections.users.updateOne(
        {
          email:
            req.user.email,
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
      await collections.products.updateMany(
        {
          "sellerInfo.email":
            req.user.email,
        },
        {
          $set:
            sellerInfoUpdates,
        }
      );
    }

    res.send(result);
  })
);

export default router;