import dotenv from "dotenv";

dotenv.config();

const REQUIRED_ENV = [
  "MONGODB_URI",
  "CLIENT_URL",
  "BETTER_AUTH_URL",
  "BETTER_AUTH_SECRET",
  "STRIPE_SECRET_KEY",
];

const missingEnv = REQUIRED_ENV.filter(
  (key) => !process.env[key]
);

if (missingEnv.length) {
  throw new Error(
    `Missing required environment variables: ${missingEnv.join(", ")}`
  );
}

export const PORT = Number(
  process.env.PORT || 5000
);

export const MONGODB_URI =
  process.env.MONGODB_URI;

export const CLIENT_URL =
  process.env.CLIENT_URL;

export const BETTER_AUTH_URL =
  process.env.BETTER_AUTH_URL;

export const BETTER_AUTH_SECRET =
  process.env.BETTER_AUTH_SECRET;

export const GOOGLE_CLIENT_ID =
  process.env.GOOGLE_CLIENT_ID || "";

export const GOOGLE_CLIENT_SECRET =
  process.env.GOOGLE_CLIENT_SECRET || "";

export const STRIPE_SECRET_KEY =
  process.env.STRIPE_SECRET_KEY;

export const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY || "";

export const GEMINI_MODEL =
  process.env.GEMINI_MODEL ||
  "gemini-3.8-flash";

export const IS_PRODUCTION =
  process.env.NODE_ENV === "production";

export const PAYMENT_CURRENCY =
  "bdt";

export const DELIVERY_CHARGE =
  Number(
    process.env.DELIVERY_CHARGE_BDT ||
      100
  );

if (
  !Number.isFinite(DELIVERY_CHARGE) ||
  DELIVERY_CHARGE < 0
) {
  throw new Error(
    "DELIVERY_CHARGE_BDT must be a non-negative number."
  );
}