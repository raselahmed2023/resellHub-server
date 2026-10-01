import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { getReSellGuideResponse } from "../services/ai.service.js";

const router = Router();

const windowMs = 10 * 60 * 1000;
const maxRequests = 12;
const requests = new Map();

router.post(
  "/chat",
  (req, res, next) => {
    const now = Date.now();
    const key = req.ip;
    const record = requests.get(key);

    const current =
      record && record.resetAt > now
        ? record
        : {
            count: 0,
            resetAt: now + windowMs,
          };

    if (current.count >= maxRequests) {
      res.set(
        "Retry-After",
        String(Math.ceil((current.resetAt - now) / 1000))
      );

      return res.status(429).send({
        message:
          "Too many messages. Please try again in a few minutes.",
      });
    }

    current.count += 1;
    requests.set(key, current);

    if (requests.size > 5000) {
      for (const [address, entry] of requests) {
        if (entry.resetAt <= now) {
          requests.delete(address);
        }
      }
    }

    next();
  },
  asyncHandler(async (req, res) => {
    const result = await getReSellGuideResponse({
      message: req.body?.message,
      history: req.body?.history,
    });

    res.send(result);
  })
);

export default router;