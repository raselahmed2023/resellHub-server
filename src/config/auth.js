import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";

import { client } from "./db.js";

import {
  BETTER_AUTH_URL,
  BETTER_AUTH_SECRET,
  CLIENT_URL,
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  IS_PRODUCTION,
} from "./env.js";

export const auth = betterAuth({
  database: mongodbAdapter(
    client.db("resellHub"),
    {
      client,
    }
  ),

  baseURL: BETTER_AUTH_URL,

  secret: BETTER_AUTH_SECRET,

  trustedOrigins: [
    CLIENT_URL,
  ].filter(Boolean),

  emailAndPassword: {
    enabled: true,
  },

  socialProviders: {
    google: {
      clientId: GOOGLE_CLIENT_ID,
      clientSecret: GOOGLE_CLIENT_SECRET,
      disableImplicitSignUp: true,
    },
  },

  advanced: {
    useSecureCookies: IS_PRODUCTION,

    defaultCookieAttributes: {
      secure: IS_PRODUCTION,
      sameSite: IS_PRODUCTION
        ? "none"
        : "lax",
      path: "/",
    },
  },

  user: {
    additionalFields: {
      role: {
        type: "string",
        defaultValue: "buyer",
        input: false,
      },

      status: {
        type: "string",
        defaultValue: "active",
        input: false,
      },

      roleSelected: {
        type: "boolean",
        defaultValue: false,
        input: false,
      },

      location: {
        type: "string",
        required: false,
      },

      phone: {
        type: "string",
        required: false,
      },
    },
  },
});