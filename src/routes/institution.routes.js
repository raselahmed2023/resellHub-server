import {
  Router,
} from "express";

import {
  collections,
} from "../config/db.js";

import {
  asyncHandler,
} from "../utils/asyncHandler.js";

import {
  toObjectId,
} from "../utils/objectId.js";

import {
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
        await listInstitutions(
          {
            search:
              req.query
                .search,

            type:
              req.query.type,

            page:
              req.query.page,

            limit:
              req.query.limit,
          }
        );

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
      const objectId =
        toObjectId(
          req.params.id
        );

      if (!objectId) {
        return res
          .status(400)
          .send({
            message:
              "Invalid institution ID.",
          });
      }

      const institution =
        await collections
          .institutions
          .findOne({
            _id:
              objectId,

            status:
              "active",
          });

      if (
        !institution
      ) {
        return res
          .status(404)
          .send({
            message:
              "Institution not found.",
          });
      }

      res.send(
        institution
      );
    }
  )
);

export default router;