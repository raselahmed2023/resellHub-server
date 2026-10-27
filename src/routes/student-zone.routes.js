import {
  Router,
} from "express";

import {
  asyncHandler,
} from "../utils/asyncHandler.js";

import {
  listStudentZoneProducts,
} from "../services/student-zone.service.js";

const router =
  Router();

router.get(
  "/products",

  asyncHandler(
    async (
      req,
      res
    ) => {
      const result =
        await listStudentZoneProducts(
          req.query
        );

      res.send(
        result
      );
    }
  )
);

export default router;