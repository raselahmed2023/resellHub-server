import {
  Router,
} from "express";

import {
  auth,
} from "../config/auth.js";

import {
  BETTER_AUTH_URL,
} from "../config/env.js";

import {
  asyncHandler,
} from "../utils/asyncHandler.js";

const router =
  Router();

const buildFetchHeaders = (
  nodeHeaders
) => {
  const headers =
    new Headers();

  for (
    const [
      key,
      value,
    ] of Object.entries(
      nodeHeaders
    )
  ) {
    if (
      Array.isArray(value)
    ) {
      value.forEach(
        (item) =>
          headers.append(
            key,
            item
          )
      );
    } else if (
      value !== undefined
    ) {
      headers.set(
        key,
        String(value)
      );
    }
  }

  return headers;
};

router.all(
  "/*splat",

  asyncHandler(
    async (
      req,
      res
    ) => {
      const url =
        new URL(
          req.originalUrl,
          BETTER_AUTH_URL
        );

      const webRequest =
        new Request(
          url,
          {
            method:
              req.method,

            headers:
              buildFetchHeaders(
                req.headers
              ),

            body:
              req.method !==
                "GET" &&
              req.method !==
                "HEAD"
                ? JSON.stringify(
                    req.body ??
                      {}
                  )
                : undefined,
          }
        );

      const response =
        await auth.handler(
          webRequest
        );

      const setCookies =
        typeof response
          .headers
          .getSetCookie ===
        "function"
          ? response.headers
              .getSetCookie()
          : [];

      response.headers.forEach(
        (
          value,
          key
        ) => {
          if (
            key.toLowerCase() !==
            "set-cookie"
          ) {
            res.setHeader(
              key,
              value
            );
          }
        }
      );

      if (
        setCookies.length
      ) {
        res.setHeader(
          "set-cookie",
          setCookies
        );
      } else {
        const setCookie =
          response.headers.get(
            "set-cookie"
          );

        if (setCookie) {
          res.setHeader(
            "set-cookie",
            setCookie
          );
        }
      }

      res
        .status(
          response.status
        )
        .send(
          await response.text()
        );
    }
  )
);

export default router;