import {
  Router,
} from "express";

import {
  asyncHandler,
} from "../utils/asyncHandler.js";

import {
  getCampusById,
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

router.get(
  "/:id",

  asyncHandler(
    async (
      req,
      res
    ) => {
      const campus =
        await getCampusById(
          req.params.id
        );

      res.send(
        campus
      );
    }
  )
);

export default router;