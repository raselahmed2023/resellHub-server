import {
  collections,
} from "../config/db.js";

import {
  CATEGORIES,
  CONDITIONS,
} from "../constants/marketplace.js";

import {
  cleanString,
  escapeRegExp,
} from "../utils/helpers.js";

import {
  toObjectId,
} from "../utils/objectId.js";

export const resolveStudentZoneSelection =
  async (
    selection = {}
  ) => {
    if (
      !selection
        ?.enabled
    ) {
      return {
        enabled:
          false,
      };
    }

    const institutionId =
      toObjectId(
        selection
          .institutionId
      );

    if (
      !institutionId
    ) {
      const error =
        new Error(
          "A valid institution is required for Student Zone."
        );

      error.status =
        400;

      throw error;
    }

    const institution =
      await collections
        .institutions
        .findOne({
          _id:
            institutionId,

          status:
            "active",
        });

    if (
      !institution
    ) {
      const error =
        new Error(
          "Selected institution is not available."
        );

      error.status =
        400;

      throw error;
    }

    let campus =
      null;

    if (
      selection
        .campusId
    ) {
      const campusId =
        toObjectId(
          selection
            .campusId
        );

      if (
        !campusId
      ) {
        const error =
          new Error(
            "Invalid campus ID."
          );

        error.status =
          400;

        throw error;
      }

      campus =
        await collections
          .campuses
          .findOne({
            _id:
              campusId,

            institutionId,

            status:
              "active",
          });

      if (!campus) {
        const error =
          new Error(
            "Selected campus does not belong to the selected institution."
          );

        error.status =
          400;

        throw error;
      }
    }

    return {
      enabled:
        true,

      institutionId,

      institutionName:
        institution.name,

      institutionType:
        institution.type,

      campusId:
        campus?._id ||
        null,

      campusName:
        campus?.name ||
        "",
    };
  };

export const listStudentZoneProducts =
  async (
    params = {}
  ) => {
    const {
      search,
      category,
      condition,
      institutionId,
      campusId,
      sort,
    } = params;

    const page =
      Math.max(
        1,

        Number.parseInt(
          String(
            params.page ||
              "1"
          ),
          10
        ) || 1
      );

    const limit =
      Math.max(
        1,

        Math.min(
          48,

          Number.parseInt(
            String(
              params.limit ||
                "12"
            ),
            10
          ) || 12
        )
      );

    const query = {
      status:
        "available",

      stock: {
        $gt: 0,
      },

      "studentZone.enabled":
        true,
    };

    if (search) {
      const safeSearch =
        cleanString(
          search,
          100
        );

      if (
        safeSearch
      ) {
        const regex =
          escapeRegExp(
            safeSearch
          );

        query.$or = [
          {
            title: {
              $regex:
                regex,

              $options:
                "i",
            },
          },

          {
            description: {
              $regex:
                regex,

              $options:
                "i",
            },
          },

          {
            "studentZone.institutionName":
              {
                $regex:
                  regex,

                $options:
                  "i",
              },
          },

          {
            "studentZone.campusName":
              {
                $regex:
                  regex,

                $options:
                  "i",
              },
          },
        ];
      }
    }

    if (category) {
      const safeCategory =
        cleanString(
          category,
          50
        );

      if (
        !CATEGORIES.has(
          safeCategory
        )
      ) {
        const error =
          new Error(
            "Invalid category filter."
          );

        error.status =
          400;

        throw error;
      }

      query.category =
        safeCategory;
    }

    if (condition) {
      const values =
        String(
          condition
        )
          .split(",")
          .map(
            (value) =>
              value.trim()
          )
          .filter(
            (value) =>
              CONDITIONS.has(
                value
              )
          );

      if (
        values.length
      ) {
        query.condition =
          {
            $in:
              values,
          };
      }
    }

    if (
      institutionId
    ) {
      const objectId =
        toObjectId(
          institutionId
        );

      if (
        !objectId
      ) {
        const error =
          new Error(
            "Invalid institution filter."
          );

        error.status =
          400;

        throw error;
      }

      query[
        "studentZone.institutionId"
      ] =
        objectId;
    }

    if (campusId) {
      const objectId =
        toObjectId(
          campusId
        );

      if (
        !objectId
      ) {
        const error =
          new Error(
            "Invalid campus filter."
          );

        error.status =
          400;

        throw error;
      }

      query[
        "studentZone.campusId"
      ] =
        objectId;
    }

    const sortOption =
      sort ===
      "price_asc"
        ? {
            price: 1,
            createdAt: -1,
          }
        : sort ===
            "price_desc"
          ? {
              price: -1,
              createdAt: -1,
            }
          : {
              createdAt: -1,
            };

    const skip =
      (
        page - 1
      ) * limit;

    const [
      products,
      total,
    ] =
      await Promise.all([
        collections
          .products
          .find(query)
          .sort(
            sortOption
          )
          .skip(skip)
          .limit(limit)
          .toArray(),

        collections
          .products
          .countDocuments(
            query
          ),
      ]);

    return {
      products,

      total,

      page,

      totalPages:
        Math.max(
          1,

          Math.ceil(
            total /
              limit
          )
        ),
    };
  };