import {
  load,
} from "cheerio";

import {
  collections,
} from "../config/db.js";

import {
  escapeRegExp,
} from "../utils/helpers.js";

const UGC_DIRECTORY_URL =
  "https://www.ugc.gov.bd/universities";

const FALLBACK_CATEGORY_URLS = [
  "https://www.ugc.gov.bd/universities/public-universities",
  "https://www.ugc.gov.bd/universities/private-universities",
  "https://www.ugc.gov.bd/universities/international-universities",
];

const TYPE_ALIASES =
  new Map([
    [
      "public-universities",
      "public",
    ],

    [
      "private-universities",
      "private",
    ],

    [
      "international-universities",
      "international",
    ],
  ]);

const slugify = (value) =>
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

const cleanName = (value) =>
  String(value || "")
    .replace(
      /নোটিশ/gi,
      ""
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim();

const normalizeWebsite = (
  value
) => {
  const raw =
    String(value || "")
      .trim();

  if (
    !raw ||
    raw === "—" ||
    raw === "-"
  ) {
    return "";
  }

  const first =
    raw
      .split(",")[0]
      .trim();

  if (
    /^https?:\/\//i.test(
      first
    )
  ) {
    return first;
  }

  return `https://${first.replace(
    /^\/+/,
    ""
  )}`;
};

const categoryTypeFromUrl = (
  url
) => {
  const pathname =
    new URL(url)
      .pathname
      .replace(
        /\/+$/,
        ""
      );

  const last =
    pathname
      .split("/")
      .filter(Boolean)
      .at(-1) || "";

  if (
    TYPE_ALIASES.has(
      last
    )
  ) {
    return TYPE_ALIASES.get(
      last
    );
  }

  if (
    /cross|cbhe/i.test(
      last
    )
  ) {
    return "cbhe";
  }

  return "other";
};

const fetchHtml =
  async (url) => {
    const controller =
      new AbortController();

    const timeout =
      setTimeout(
        () =>
          controller.abort(),
        20000
      );

    try {
      const response =
        await fetch(
          url,
          {
            headers: {
              "user-agent":
                "ReSellHub/1.0 institution-sync",

              accept:
                "text/html,application/xhtml+xml",
            },

            signal:
              controller.signal,
          }
        );

      if (
        !response.ok
      ) {
        throw new Error(
          `UGC request failed (${response.status}) for ${url}`
        );
      }

      return await response.text();
    } finally {
      clearTimeout(
        timeout
      );
    }
  };

const discoverCategoryUrls =
  async () => {
    const html =
      await fetchHtml(
        UGC_DIRECTORY_URL
      );

    const $ =
      load(html);

    const urls =
      new Set();

    $(
      "a[href]"
    ).each(
      (
        _,
        element
      ) => {
        const href =
          $(element).attr(
            "href"
          );

        if (!href) {
          return;
        }

        try {
          const url =
            new URL(
              href,
              UGC_DIRECTORY_URL
            );

          if (
            url.hostname !==
              "www.ugc.gov.bd" &&
            url.hostname !==
              "ugc.gov.bd"
          ) {
            return;
          }

          const pathname =
            url.pathname.replace(
              /\/+$/,
              ""
            );

          if (
            !pathname.startsWith(
              "/universities/"
            )
          ) {
            return;
          }

          urls.add(
            `${url.origin}${pathname}`
          );
        } catch {
          // Ignore bad source links
        }
      }
    );

    const result = [
      ...urls,
    ];

    return result.length >= 3
      ? result
      : FALLBACK_CATEGORY_URLS;
  };

const parseInstitutionPage =
  (
    html,
    sourceUrl
  ) => {
    const $ =
      load(html);

    const type =
      categoryTypeFromUrl(
        sourceUrl
      );

    const result = [];

    $("table tr").each(
      (_, row) => {
        const cells =
          $(row).find(
            "td"
          );

        if (
          cells.length < 2
        ) {
          return;
        }

        const name =
          cleanName(
            $(cells[1]).text()
          );

        if (
          !name ||
          !/বিশ্ববিদ্যালয়|university/i.test(
            name
          )
        ) {
          return;
        }

        const websiteCell =
          cells.length >= 3
            ? $(cells[2])
            : null;

        const websiteHref =
          websiteCell
            ?.find(
              "a[href]"
            )
            .first()
            .attr(
              "href"
            ) || "";

        const websiteText =
          websiteCell?.text() ||
          "";

        const slug =
          slugify(name);

        if (!slug) {
          return;
        }

        result.push({
          name,

          slug,

          type,

          website:
            normalizeWebsite(
              websiteHref ||
                websiteText
            ),

          source:
            "ugc",

          sourceUrl,

          status:
            "active",
        });
      }
    );

    return result;
  };

export const syncInstitutionsFromUGC =
  async () => {
    const categoryUrls =
      await discoverCategoryUrls();

    const batches = [];

    for (
      const url of
      categoryUrls
    ) {
      const html =
        await fetchHtml(
          url
        );

      batches.push(
        ...parseInstitutionPage(
          html,
          url
        )
      );
    }

    const deduped = [
      ...new Map(
        batches.map(
          (item) => [
            item.slug,
            item,
          ]
        )
      ).values(),
    ];

    /*
      Safety protection:
      if UGC page structure changes,
      do not destroy old database.
    */

    if (
      deduped.length < 50
    ) {
      throw new Error(
        `UGC sync returned only ${deduped.length} institutions. Existing data was not changed.`
      );
    }

    const now =
      new Date();

    await collections
      .institutions
      .bulkWrite(
        deduped.map(
          (item) => ({
            updateOne: {
              filter: {
                slug:
                  item.slug,
              },

              update: {
                $set: {
                  ...item,

                  syncedAt:
                    now,

                  updatedAt:
                    now,
                },

                $setOnInsert: {
                  createdAt:
                    now,
                },
              },

              upsert: true,
            },
          })
        ),
        {
          ordered: false,
        }
      );

    await collections
      .institutions
      .updateMany(
        {
          source: "ugc",

          slug: {
            $nin:
              deduped.map(
                (item) =>
                  item.slug
              ),
          },
        },

        {
          $set: {
            status:
              "inactive",

            updatedAt:
              now,
          },
        }
      );

    const byType =
      deduped.reduce(
        (
          acc,
          item
        ) => {
          acc[item.type] =
            (
              acc[
                item.type
              ] || 0
            ) + 1;

          return acc;
        },
        {}
      );

    return {
      total:
        deduped.length,

      byType,

      categoryUrls,

      syncedAt:
        now,
    };
  };

export const listInstitutions =
  async ({
    search = "",
    type = "",
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

    const query = {
      status:
        "active",
    };

    if (type) {
      query.type =
        String(type).trim();
    }

    if (search) {
      const safeSearch =
        String(search)
          .trim()
          .slice(
            0,
            100
          );

      if (safeSearch) {
        query.name = {
          $regex:
            escapeRegExp(
              safeSearch
            ),

          $options:
            "i",
        };
      }
    }

    const skip =
      (
        safePage - 1
      ) * safeLimit;

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
          .skip(skip)
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