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

const CAMPUS_STATUSES =
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

const resolveInstitution =
  async (
    institutionId
  ) => {
    const objectId =
      toObjectId(
        institutionId
      );

    if (!objectId) {
      throw createHttpError(
        400,
        "Invalid institution ID."
      );
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
      throw createHttpError(
        400,
        "Selected institution is not available."
      );
    }

    return institution;
  };

const normalizeCampusInput =
  async (
    body = {},
    {
      partial = false,
    } = {}
  ) => {
    const value = {};

    if (!partial) {
      const institution =
        await resolveInstitution(
          body.institutionId
        );

      value.institutionId =
        institution._id;

      value.institutionName =
        institution.name;
    }

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
        name.length < 2
      ) {
        throw createHttpError(
          400,
          "Campus name must be at least 2 characters."
        );
      }

      value.name =
        name;

      value.slug =
        slugify(
          name
        );
    }

    const fields = [
      [
        "address",
        300,
      ],

      [
        "city",
        100,
      ],

      [
        "district",
        100,
      ],

      [
        "division",
        100,
      ],
    ];

    for (
      const [
        field,
        max,
      ] of fields
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
            max
          );
      }
    }

    if (
      !partial ||
      hasOwn(
        body,
        "isMain"
      )
    ) {
      value.isMain =
        body.isMain ===
          true ||
        body.isMain ===
          "true";
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
        !CAMPUS_STATUSES.has(
          status
        )
      ) {
        throw createHttpError(
          400,
          "Campus status must be active or inactive."
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

const ensureSingleMainCampus =
  async (
    institutionId,
    exceptId = null
  ) => {
    const query = {
      institutionId,

      isMain:
        true,
    };

    if (exceptId) {
      query._id = {
        $ne:
          exceptId,
      };
    }

    await collections
      .campuses
      .updateMany(
        query,
        {
          $set: {
            isMain:
              false,

            updatedAt:
              new Date(),
          },
        }
      );
  };

export const listCampuses =
  async ({
    institutionId = "",
    search = "",
    status = "active",
    includeInactive = false,
    page = 1,
    limit = 100,
  } = {}) => {
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
        !CAMPUS_STATUSES.has(
          safeStatus
        )
      ) {
        throw createHttpError(
          400,
          "Invalid campus status filter."
        );
      }

      query.status =
        safeStatus;
    }

    if (
      institutionId
    ) {
      const objectId =
        toObjectId(
          institutionId
        );

      if (!objectId) {
        throw createHttpError(
          400,
          "Invalid institution ID."
        );
      }

      query.institutionId =
        objectId;
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
            institutionName: {
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
      ) *
      safeLimit;

    const [
      campuses,
      total,
    ] =
      await Promise.all([
        collections
          .campuses
          .find(query)
          .sort({
            institutionName:
              1,

            isMain:
              -1,

            name:
              1,
          })
          .skip(
            skip
          )
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

export const getCampusById =
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
        "Invalid campus ID."
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

    const campus =
      await collections
        .campuses
        .findOne(
          query
        );

    if (!campus) {
      throw createHttpError(
        404,
        "Campus not found."
      );
    }

    return campus;
  };

export const createCampus =
  async (
    body = {}
  ) => {
    const value =
      await normalizeCampusInput(
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

    if (
      document.isMain
    ) {
      await ensureSingleMainCampus(
        document
          .institutionId
      );
    }

    const result =
      await collections
        .campuses
        .insertOne(
          document
        );

    return {
      ...document,

      _id:
        result.insertedId,
    };
  };

export const updateCampus =
  async (
    id,
    body = {}
  ) => {
    const objectId =
      toObjectId(id);

    if (!objectId) {
      throw createHttpError(
        400,
        "Invalid campus ID."
      );
    }

    const current =
      await collections
        .campuses
        .findOne({
          _id:
            objectId,
        });

    if (!current) {
      throw createHttpError(
        404,
        "Campus not found."
      );
    }

    if (
      hasOwn(
        body,
        "institutionId"
      )
    ) {
      throw createHttpError(
        400,
        "A campus cannot be moved to another institution."
      );
    }

    const update =
      await normalizeCampusInput(
        body,
        {
          partial:
            true,
        }
      );

    if (
      !Object.keys(
        update
      ).length
    ) {
      throw createHttpError(
        400,
        "No valid campus fields were provided."
      );
    }

    update.updatedAt =
      new Date();

    if (
      update.isMain ===
      true
    ) {
      await ensureSingleMainCampus(
        current
          .institutionId,
        objectId
      );
    }

    await collections
      .campuses
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

    if (
      update.name &&
      update.name !==
        current.name
    ) {
      await collections
        .products
        .updateMany(
          {
            "studentZone.campusId":
              objectId,
          },
          {
            $set: {
              "studentZone.campusName":
                update.name,

              updatedAt:
                new Date(),
            },
          }
        );
    }

    return collections
      .campuses
      .findOne({
        _id:
          objectId,
      });
  };

export const archiveCampus =
  async (id) =>
    updateCampus(
      id,
      {
        status:
          "inactive",
      }
    );

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
      throw createHttpError(
        400,
        "campuses must be a non-empty array with at most 1000 items."
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
          await normalizeCampusInput(
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
        "No valid campus records were provided."
      );
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