import { Router } from "express";

import {
  asyncHandler,
} from "../utils/asyncHandler.js";

import {
  getReSellGuideResponse,
} from "../services/ai.service.js";

const router = Router();

router.post(
  "/chat",
  asyncHandler(async (req, res) => {
    const result =
      await getReSellGuideResponse({
        message:
          req.body.message,
        history:
          req.body.history,
      });

    res.send(result);
  })
);

export default router;