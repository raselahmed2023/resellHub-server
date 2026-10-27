import {
  collections,
} from "../config/db.js";

import {
  escapeRegExp,
} from "../utils/helpers.js";

import {
  toObjectId,
} from "../utils/objectId.js";

const slugify = (
  value
) =>
  String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(
      /[^\p{L}\p{N}]+/gu,
      "-"
    )
    .replace(
      /^-+|-+$/g,
      ""
    )
    .slice(0, 180);

const clean = (
  value,
  max = 200
) =>
  typeof value ===
  "string"
    ? value
        .trim()
        .slice(
          0,
          max
        )
    : "";

export const listCampuses =
  async ({
    institutionId = "",
    search = "",
    page = 1,
    limit = 100,
  } = {}) => {
    const query = {
      status:
        "active",
    };

    if (
      institutionId
    ) {
      const objectId =
        toObjectId(
          institutionId
        );

      if (!objectId) {
        const error =
          new Error(
            "Invalid institution ID."
          );

        error.status =
          400;

        throw error;
      }

      query.institutionId =
        objectId;
    }

    if (search) {
      const safeSearch =
        clean(
          search,
          100
        );

      if (safeSearch) {
        query.$or = [
          {
            name: {
              $regex:
                escapeRegExp(
                  safeSearch
                ),

              $options:
                "i",
            },
          },

          {
            city: {
              $regex:
                escapeRegExp(
                  safeSearch
                ),

              $options:
                "i",
            },
          },

          {
            district: {
              $regex:
                escapeRegExp(
                  safeSearch
                ),

              $options:
                "i",
            },
          },
        ];
      }
    }

    const safePage =
      Math.max(
        1,
        Number.parseInt(
          String(page),
          10
        ) || 1
      );

    const safeLimit =
      Math.max(
        1,
        Math.min(
          300,

          Number.parseInt(
            String(limit),
            10
          ) || 100
        )
      );

    const skip =
      (
        safePage - 1
      ) * safeLimit;

    const [
      campuses,
      total,
    ] =
      await Promise.all([
        collections
          .campuses
          .find(query)
          .sort({
            isMain: -1,
            name: 1,
          })
          .skip(skip)
          .limit(
            safeLimit
          )
          .toArray(),

        collections
          .campuses
          .countDocuments(
            query
          ),
      ]);

    return {
      campuses,
      total,

      page:
        safePage,

      totalPages:
        Math.max(
          1,

          Math.ceil(
            total /
              safeLimit
          )
        ),
    };
  };

export const importCampuses =
  async (
    items = []
  ) => {
    if (
      !Array.isArray(
        items
      ) ||
      items.length === 0 ||
      items.length > 1000
    ) {
      const error =
        new Error(
          "campuses must be a non-empty array with at most 1000 items."
        );

      error.status =
        400;

      throw error;
    }

    const normalized =
      [];

    for (
      const item of
      items
    ) {
      const institutionId =
        toObjectId(
          item
            ?.institutionId
        );

      const name =
        clean(
          item?.name,
          180
        );

      if (
        !institutionId ||
        name.length < 2
      ) {
        continue;
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
        continue;
      }

      normalized.push({
        institutionId,

        institutionName:
          institution.name,

        name,

        slug:
          slugify(name),

        address:
          clean(
            item?.address,
            300
          ),

        city:
          clean(
            item?.city,
            100
          ),

        district:
          clean(
            item?.district,
            100
          ),

        division:
          clean(
            item?.division,
            100
          ),

        isMain:
          item?.isMain ===
          true,

        status:
          "active",

        source:
          clean(
            item?.source,
            40
          ) ||
          "admin",
      });
    }

    if (
      !normalized.length
    ) {
      const error =
        new Error(
          "No valid campus records were provided."
        );

      error.status =
        400;

      throw error;
    }

    const now =
      new Date();

    const result =
      await collections
        .campuses
        .bulkWrite(
          normalized.map(
            (item) => ({
              updateOne: {
                filter: {
                  institutionId:
                    item.institutionId,

                  slug:
                    item.slug,
                },

                update: {
                  $set: {
                    ...item,

                    updatedAt:
                      now,
                  },

                  $setOnInsert:
                    {
                      createdAt:
                        now,
                    },
                },

                upsert:
                  true,
              },
            })
          ),

          {
            ordered:
              false,
          }
        );

    return {
      received:
        items.length,

      accepted:
        normalized.length,

      upserted:
        result
          .upsertedCount,

      modified:
        result
          .modifiedCount,
    };
  };