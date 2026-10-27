import {
  Router,
} from "express";

import {
  asyncHandler,
} from "../utils/asyncHandler.js";

import {
  getInstitutionById,
  listInstitutions,
} from "../services/institution.service.js";

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
        await listInstitutions({
          search:
            req.query.search,

          type:
            req.query.type,

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
      const institution =
        await getInstitutionById(
          req.params.id
        );

      res.send(
        institution
      );
    }
  )
);

export default router;