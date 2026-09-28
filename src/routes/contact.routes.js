import { Router } from "express";

import {
  collections,
} from "../config/db.js";

import {
  asyncHandler,
} from "../utils/asyncHandler.js";

import {
  cleanString,
} from "../utils/helpers.js";

const router = Router();

router.post(
  "/",
  asyncHandler(async (req, res) => {
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
      return res.status(400).send({
        message:
          "Name is required.",
      });
    }

    if (
      !/^\S+@\S+\.\S+$/.test(
        email
      )
    ) {
      return res.status(400).send({
        message:
          "A valid email address is required.",
      });
    }

    if (
      message.length < 10
    ) {
      return res.status(400).send({
        message:
          "Message must be at least 10 characters.",
      });
    }

    const result =
      await collections.contactMessages.insertOne(
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

    res.status(201).send({
      message:
        "Message received successfully.",
      insertedId:
        result.insertedId,
    });
  })
);

export default router;