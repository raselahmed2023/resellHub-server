import { getAIIntent } from "./ai.provider.js";
import { collections } from "../config/db.js";
import { CATEGORIES, CONDITIONS } from "../constants/marketplace.js";
import { cleanString, escapeRegExp } from "../utils/helpers.js";

const httpError = (message, status) =>
  Object.assign(new Error(message), { status });

const parseIntent = (raw) => {
  const text = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");

  const intent = JSON.parse(text);

  if (
    !intent ||
    !["product_search", "platform_help"].includes(intent.type) ||
    typeof intent.answer !== "string"
  ) {
    throw new Error("Invalid AI response format");
  }

  return intent;
};

const buildPrompt = (message, history) => `
You are ReSell Guide, the ReSellHub marketplace assistant.
Answer in the user's language (Bangla, Banglish or English).

ReSellHub supports buyers and sellers.
Buyers can purchase and save products.
Sellers can list products and manage orders.
Seller listings are subject to status handling.
Stripe handles payments.

Only the ReSellHub database can establish product titles, prices or availability.
Never invent listings, stock, prices, site statistics or promises.

If asked for product recommendations, return product_search.
If asked how the platform works, return platform_help.

Valid categories: ${[...CATEGORIES].join(", ")}.
Valid conditions: ${[...CONDITIONS].join(", ")}.

"5k", "5 হাজার" and "৫ হাজার" mean 5000.
"20k" means 20000.

Return only one JSON object with keys:
{"type":"product_search or platform_help","search":"","category":"","condition":"","minPrice":null,"maxPrice":null,"sort":"newest","answer":""}

For product_search, extract keyword, valid category/condition, numeric price limits and sort (newest, price_asc or price_desc).
Set unused fields to empty strings/null.
Do not name individual products in answer because database results are fetched separately.

For platform_help, answer using the facts above, with empty search, category and condition and null prices.

Conversation history: ${JSON.stringify(history)}
Current message: ${JSON.stringify(message)}
`;

const searchProducts = async (intent) => {
  const query = {
    status: "available",
    stock: { $gt: 0 },
  };

  const category = cleanString(intent.category, 50);
  const condition = cleanString(intent.condition, 30);
  const search = cleanString(intent.search, 100);

  if (CATEGORIES.has(category)) {
    query.category = category;
  }

  if (CONDITIONS.has(condition)) {
    query.condition = condition;
  }

  const min =
    intent.minPrice === null ||
    intent.minPrice === "" ||
    intent.minPrice === undefined
      ? null
      : Number(intent.minPrice);

  const max =
    intent.maxPrice === null ||
    intent.maxPrice === "" ||
    intent.maxPrice === undefined
      ? null
      : Number(intent.maxPrice);

  if (min !== null && Number.isFinite(min) && min >= 0) {
    query.price = { ...query.price, $gte: min };
  }

  if (max !== null && Number.isFinite(max) && max >= 0) {
    query.price = { ...query.price, $lte: max };
  }

  if (search) {
    const regex = {
      $regex: escapeRegExp(search),
      $options: "i",
    };

    query.$or = [
      { title: regex },
      { description: regex },
    ];
  }

  const sort =
    intent.sort === "price_asc"
      ? { price: 1 }
      : intent.sort === "price_desc"
        ? { price: -1 }
        : { createdAt: -1 };

  return collections.products
    .find(query, {
      projection: {
        title: 1,
        category: 1,
        condition: 1,
        price: 1,
        stock: 1,
        images: 1,
        "sellerInfo.name": 1,
      },
    })
    .sort(sort)
    .limit(6)
    .toArray();
};

export const getReSellGuideResponse = async ({
  message,
  history = [],
}) => {
  const text = cleanString(message, 600);

  if (!text) {
    throw httpError("Please enter a message.", 400);
  }

  const safeHistory = Array.isArray(history)
    ? history
        .slice(-6)
        .map((item) => ({
          role:
            item?.role === "assistant"
              ? "assistant"
              : "user",
          content: cleanString(item?.content, 400),
        }))
        .filter((item) => item.content)
    : [];

  const intent = await getAIIntent(
    buildPrompt(text, safeHistory),
    parseIntent
  );

  if (intent.type === "platform_help") {
    return {
      reply:
        cleanString(intent.answer, 1000) ||
        "How can I help?",
      products: [],
    };
  }

  const products = await searchProducts(intent);

  if (!products.length) {
    return {
      reply:
        "No matching available products right now. Try a different category or price range.",
      products: [],
    };
  }

  return {
    reply:
      cleanString(intent.answer, 600) ||
      `I found ${products.length} matching products.`,
    products: products.map((product) => ({
      _id: product._id,
      title: product.title,
      category: product.category,
      condition: product.condition,
      price: product.price,
      stock: product.stock,
      image: product.images?.[0] || "",
      seller: product.sellerInfo?.name || "Seller",
      href: `/products/${product._id}`,
    })),
  };
};