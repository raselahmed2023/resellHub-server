import {
  collections,
} from "../config/db.js";

import {
  cleanString,
  escapeRegExp,
  hasOwn,
} from "../utils/helpers.js";

import {
  toObjectId,
} from "../utils/objectId.js";

const INSTITUTION_TYPES =
  new Set([
    "public",
    "private",
    "international",
    "other",
  ]);

const INSTITUTION_STATUSES =
  new Set([
    "active",
    "inactive",
  ]);

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

const normalizeWebsite = (
  value
) => {
  const raw =
    cleanString(
      value,
      300
    );

  if (!raw) {
    return "";
  }

  if (
    /^https?:\/\//i.test(
      raw
    )
  ) {
    return raw;
  }

  return `https://${raw.replace(
    /^\/+/,
    ""
  )}`;
};

const createHttpError = (
  status,
  message
) => {
  const error =
    new Error(
      message
    );

  error.status =
    status;

  return error;
};

const normalizeInstitutionInput =
  (
    body = {},
    {
      partial = false,
    } = {}
  ) => {
    const value = {};

    if (
      !partial ||
      hasOwn(
        body,
        "name"
      )
    ) {
      const name =
        cleanString(
          body.name,
          180
        );

      if (
        name.length < 3
      ) {
        throw createHttpError(
          400,
          "Institution name must be at least 3 characters."
        );
      }

      value.name =
        name;

      value.slug =
        slugify(name);
    }

    if (
      !partial ||
      hasOwn(
        body,
        "shortName"
      )
    ) {
      value.shortName =
        cleanString(
          body.shortName,
          40
        );
    }

    if (
      !partial ||
      hasOwn(
        body,
        "type"
      )
    ) {
      const type =
        cleanString(
          body.type,
          30
        ).toLowerCase();

      if (
        !INSTITUTION_TYPES.has(
          type
        )
      ) {
        throw createHttpError(
          400,
          "Institution type must be public, private, international, or other."
        );
      }

      value.type =
        type;
    }

    if (
      !partial ||
      hasOwn(
        body,
        "website"
      )
    ) {
      value.website =
        normalizeWebsite(
          body.website
        );
    }

    for (
      const field of [
        "city",
        "district",
        "division",
      ]
    ) {
      if (
        !partial ||
        hasOwn(
          body,
          field
        )
      ) {
        value[field] =
          cleanString(
            body[field],
            100
          );
      }
    }

    if (
      hasOwn(
        body,
        "status"
      )
    ) {
      const status =
        cleanString(
          body.status,
          20
        ).toLowerCase();

      if (
        !INSTITUTION_STATUSES.has(
          status
        )
      ) {
        throw createHttpError(
          400,
          "Institution status must be active or inactive."
        );
      }

      value.status =
        status;
    } else if (
      !partial
    ) {
      value.status =
        "active";
    }

    return value;
  };

export const listInstitutions =
  async ({
    search = "",
    type = "",
    status = "active",
    includeInactive = false,
    page = 1,
    limit = 100,
  } = {}) => {
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

    const query = {};

    if (
      !includeInactive
    ) {
      query.status =
        "active";
    } else if (
      status
    ) {
      const safeStatus =
        cleanString(
          status,
          20
        ).toLowerCase();

      if (
        !INSTITUTION_STATUSES.has(
          safeStatus
        )
      ) {
        throw createHttpError(
          400,
          "Invalid institution status filter."
        );
      }

      query.status =
        safeStatus;
    }

    if (type) {
      const safeType =
        cleanString(
          type,
          30
        ).toLowerCase();

      if (
        !INSTITUTION_TYPES.has(
          safeType
        )
      ) {
        throw createHttpError(
          400,
          "Invalid institution type filter."
        );
      }

      query.type =
        safeType;
    }

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
            name: {
              $regex:
                regex,
              $options:
                "i",
            },
          },

          {
            shortName: {
              $regex:
                regex,
              $options:
                "i",
            },
          },

          {
            city: {
              $regex:
                regex,
              $options:
                "i",
            },
          },

          {
            district: {
              $regex:
                regex,
              $options:
                "i",
            },
          },
        ];
      }
    }

    const skip =
      (
        safePage - 1
      ) *
      safeLimit;

    const [
      institutions,
      total,
    ] =
      await Promise.all([
        collections
          .institutions
          .find(query)
          .sort({
            name: 1,
          })
          .skip(
            skip
          )
          .limit(
            safeLimit
          )
          .toArray(),

        collections
          .institutions
          .countDocuments(
            query
          ),
      ]);

    return {
      institutions,
      total,

      page:
        safePage,

      limit:
        safeLimit,

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

export const getInstitutionById =
  async (
    id,
    {
      includeInactive = false,
    } = {}
  ) => {
    const objectId =
      toObjectId(id);

    if (!objectId) {
      throw createHttpError(
        400,
        "Invalid institution ID."
      );
    }

    const query = {
      _id:
        objectId,
    };

    if (
      !includeInactive
    ) {
      query.status =
        "active";
    }

    const institution =
      await collections
        .institutions
        .findOne(
          query
        );

    if (
      !institution
    ) {
      throw createHttpError(
        404,
        "Institution not found."
      );
    }

    return institution;
  };

export const createInstitution =
  async (
    body = {}
  ) => {
    const value =
      normalizeInstitutionInput(
        body
      );

    const now =
      new Date();

    const document = {
      ...value,

      source:
        "resellhub",

      createdAt:
        now,

      updatedAt:
        now,
    };

    const result =
      await collections
        .institutions
        .insertOne(
          document
        );

    return {
      ...document,

      _id:
        result.insertedId,
    };
  };

export const updateInstitution =
  async (
    id,
    body = {}
  ) => {
    const objectId =
      toObjectId(id);

    if (!objectId) {
      throw createHttpError(
        400,
        "Invalid institution ID."
      );
    }

    const current =
      await collections
        .institutions
        .findOne({
          _id:
            objectId,
        });

    if (!current) {
      throw createHttpError(
        404,
        "Institution not found."
      );
    }

    const update =
      normalizeInstitutionInput(
        body,
        {
          partial: true,
        }
      );

    if (
      !Object.keys(
        update
      ).length
    ) {
      throw createHttpError(
        400,
        "No valid institution fields were provided."
      );
    }

    update.updatedAt =
      new Date();

    await collections
      .institutions
      .updateOne(
        {
          _id:
            objectId,
        },
        {
          $set:
            update,
        }
      );

    /*
     * If institution name changes,
     * update snapshots.
     */

    if (
      update.name &&
      update.name !==
        current.name
    ) {
      const now =
        new Date();

      await Promise.all([
        collections
          .campuses
          .updateMany(
            {
              institutionId:
                objectId,
            },
            {
              $set: {
                institutionName:
                  update.name,

                updatedAt:
                  now,
              },
            }
          ),

        collections
          .products
          .updateMany(
            {
              "studentZone.institutionId":
                objectId,
            },
            {
              $set: {
                "studentZone.institutionName":
                  update.name,

                updatedAt:
                  now,
              },
            }
          ),
      ]);
    }

    /*
     * Archiving institution
     * also archives campuses.
     */

    if (
      update.status ===
      "inactive"
    ) {
      await collections
        .campuses
        .updateMany(
          {
            institutionId:
              objectId,
          },
          {
            $set: {
              status:
                "inactive",

              updatedAt:
                new Date(),
            },
          }
        );
    }

    return collections
      .institutions
      .findOne({
        _id:
          objectId,
      });
  };

export const archiveInstitution =
  async (id) =>
    updateInstitution(
      id,
      {
        status:
          "inactive",
      }
    );

export const importInstitutions =
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
      throw createHttpError(
        400,
        "institutions must be a non-empty array with at most 1000 items."
      );
    }

    const normalized = [];
    const rejected = [];

    for (
      let index = 0;
      index <
      items.length;
      index += 1
    ) {
      try {
        normalized.push(
          normalizeInstitutionInput(
            items[index]
          )
        );
      } catch (error) {
        rejected.push({
          index,
          message:
            error.message,
        });
      }
    }

    if (
      !normalized.length
    ) {
      throw createHttpError(
        400,
        "No valid institution records were provided."
      );
    }

    const now =
      new Date();

    const result =
      await collections
        .institutions
        .bulkWrite(
          normalized.map(
            (item) => ({
              updateOne: {
                filter: {
                  slug:
                    item.slug,
                },

                update: {
                  $set: {
                    ...item,

                    source:
                      "resellhub",

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

      rejected,

      upserted:
        result
          .upsertedCount,

      modified:
        result
          .modifiedCount,

      matched:
        result
          .matchedCount,
    };
  };