import {
  Router,
} from "express";

import {
  verifyAdmin,
} from "../middleware/auth.middleware.js";

import {
  asyncHandler,
} from "../utils/asyncHandler.js";

import {
  importCampuses,
  listCampuses,
} from "../services/campus.service.js";

const router =
  Router();

router.get(
  "/",

  asyncHandler(
    async (
      req,
      res
    ) => {
      const result =
        await listCampuses({
          institutionId:
            req.query
              .institutionId,

          search:
            req.query.search,

          page:
            req.query.page,

          limit:
            req.query.limit,
        });

      res.send(
        result
      );
    }
  )
);

router.post(
  "/import",

  ...verifyAdmin,

  asyncHandler(
    async (
      req,
      res
    ) => {
      const result =
        await importCampuses(
          req.body
            ?.campuses
        );

      res
        .status(201)
        .send(
          result
        );
    }
  )
);

export default router;