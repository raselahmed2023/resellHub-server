import {
  GEMINI_API_KEY,
  GEMINI_MODEL,
} from "../config/env.js";

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

const createError = (
  message,
  status = 500
) => {
  const error =
    new Error(message);

  error.status =
    status;

  return error;
};

const buildPrompt = (
  message,
  history
) => {
  const historyText =
    history
      .map(
        (item) =>
          `${item.role}: ${item.content}`
      )
      .join("\n");

  return `
You are ReSell Guide, the AI assistant for ReSellHub, a pre-owned marketplace.

You help users:
- find products available on ReSellHub
- understand product conditions
- understand how to buy
- understand how to sell
- understand checkout, wishlist and orders
- navigate the marketplace

ReSellHub facts:
- Accounts can be Buyer or Seller.
- Buyers can browse products, use wishlist, purchase products and manage orders.
- Sellers can add and manage their own product listings and manage seller orders.
- Seller product listings go through marketplace status handling before becoming publicly available.
- Only available products with stock should be recommended.
- Payments are handled securely through Stripe.
- Product information must come from the ReSellHub database.
- Never invent a product, price, stock quantity or seller.
- If the user asks something unrelated to ReSellHub, politely guide them back to marketplace help.

Understand English, Bangla and Banglish.

Examples:
"5k" means 5000.
"5 হাজার" means 5000.
"20k" means 20000.
"২০ হাজার" means 20000.

Allowed categories:
Electronics
Furniture
Vehicles
Fashion
Mobile Phones
Books
Sports
Other

Allowed conditions:
New
Like New
Good
Fair
Used
Refurbished

Return ONLY valid JSON:

{
  "type": "product_search" | "platform_help",
  "search": "",
  "category": "",
  "condition": "",
  "minPrice": null,
  "maxPrice": null,
  "sort": "newest" | "price_asc" | "price_desc",
  "answer": ""
}

For product_search:
- Extract the product keyword into search.
- Use an allowed category only when clearly applicable.
- Use an allowed condition only when requested.
- Extract price limits when provided.
- Use price_asc for cheapest or lowest price.
- Use price_desc for highest or most expensive.
- Keep answer short.
- Match the user's language style.
- Never invent specific products.

For platform_help:
- search, category and condition must be empty.
- minPrice and maxPrice must be null.
- Answer using only the ReSellHub facts above.
- Match the user's language style.

Conversation history:
${historyText || "No previous messages"}

Current user message:
${message}
`;
};

const parseIntent = (
  rawText
) => {
  try {
    return JSON.parse(
      rawText
        .replace(
          /^```json/i,
          ""
        )
        .replace(
          /```$/i,
          ""
        )
        .trim()
    );
  } catch {
    throw createError(
      "ReSell Guide could not understand the request.",
      502
    );
  }
};

const searchProducts = async (
  intent
) => {
  const query = {
    status:
      "available",
    stock: {
      $gt: 0,
    },
  };

  const category =
    cleanString(
      intent.category,
      50
    );

  if (
    category &&
    CATEGORIES.has(category)
  ) {
    query.category =
      category;
  }

  const condition =
    cleanString(
      intent.condition,
      30
    );

  if (
    condition &&
    CONDITIONS.has(condition)
  ) {
    query.condition =
      condition;
  }

  const minPrice =
    Number(
      intent.minPrice
    );

  const maxPrice =
    Number(
      intent.maxPrice
    );

  const hasMinPrice =
    intent.minPrice !== null &&
    intent.minPrice !== "" &&
    Number.isFinite(
      minPrice
    ) &&
    minPrice >= 0;

  const hasMaxPrice =
    intent.maxPrice !== null &&
    intent.maxPrice !== "" &&
    Number.isFinite(
      maxPrice
    ) &&
    maxPrice >= 0;

  if (
    hasMinPrice ||
    hasMaxPrice
  ) {
    query.price = {};

    if (hasMinPrice) {
      query.price.$gte =
        minPrice;
    }

    if (hasMaxPrice) {
      query.price.$lte =
        maxPrice;
    }
  }

  const search =
    cleanString(
      intent.search,
      100
    );

  if (search) {
    const escaped =
      escapeRegExp(
        search
      );

    query.$or = [
      {
        title: {
          $regex:
            escaped,
          $options:
            "i",
        },
      },
      {
        description: {
          $regex:
            escaped,
          $options:
            "i",
        },
      },
    ];
  }

  let sortOption = {
    createdAt: -1,
  };

  if (
    intent.sort ===
    "price_asc"
  ) {
    sortOption = {
      price: 1,
    };
  }

  if (
    intent.sort ===
    "price_desc"
  ) {
    sortOption = {
      price: -1,
    };
  }

  return collections.products
    .find(
      query,
      {
        projection: {
          title: 1,
          category: 1,
          condition: 1,
          price: 1,
          stock: 1,
          images: 1,
          sellerInfo: 1,
          createdAt: 1,
        },
      }
    )
    .sort(sortOption)
    .limit(6)
    .toArray();
};

export const getReSellGuideResponse =
  async ({
    message,
    history = [],
  }) => {
    if (!GEMINI_API_KEY) {
      throw createError(
        "ReSell Guide is temporarily unavailable.",
        503
      );
    }

    const safeMessage =
      cleanString(
        message,
        600
      );

    if (!safeMessage) {
      throw createError(
        "Please enter a message.",
        400
      );
    }

    const safeHistory =
      Array.isArray(history)
        ? history
            .slice(-6)
            .map(
              (item) => ({
                role:
                  item?.role ===
                  "assistant"
                    ? "assistant"
                    : "user",
                content:
                  cleanString(
                    item?.content,
                    400
                  ),
              })
            )
            .filter(
              (item) =>
                item.content
            )
        : [];

    const prompt =
      buildPrompt(
        safeMessage,
        safeHistory
      );

    const response =
      await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
            "x-goog-api-key":
              GEMINI_API_KEY,
          },
          body:
            JSON.stringify({
              contents: [
                {
                  role:
                    "user",
                  parts: [
                    {
                      text:
                        prompt,
                    },
                  ],
                },
              ],
              generationConfig:
                {
                  temperature:
                    0.1,
                  responseMimeType:
                    "application/json",
                },
            }),
        }
      );

    if (!response.ok) {
      const providerError =
        await response.text();

      console.error(
        "Gemini API error:",
        providerError
      );

      throw createError(
        "ReSell Guide could not respond right now.",
        502
      );
    }

    const data =
      await response.json();

    const rawText =
      data?.candidates?.[0]
        ?.content?.parts
        ?.map(
          (part) =>
            part?.text || ""
        )
        .join("")
        .trim();

    if (!rawText) {
      throw createError(
        "ReSell Guide returned an empty response.",
        502
      );
    }

    const intent =
      parseIntent(
        rawText
      );

    if (
      intent.type !==
      "product_search"
    ) {
      return {
        reply:
          cleanString(
            intent.answer,
            1000
          ) ||
          "How can I help you with ReSellHub?",
        products: [],
      };
    }

    const products =
      await searchProducts(
        intent
      );

    if (
      products.length === 0
    ) {
      return {
        reply:
          "I couldn't find a matching available product right now. Try changing the product name, condition, or price range.",
        products: [],
      };
    }

    return {
      reply:
        cleanString(
          intent.answer,
          600
        ) ||
        `I found ${products.length} matching product${
          products.length === 1
            ? ""
            : "s"
        } for you.`,

      products:
        products.map(
          (product) => ({
            _id:
              product._id,
            title:
              product.title,
            category:
              product.category,
            condition:
              product.condition,
            price:
              product.price,
            stock:
              product.stock,
            image:
              product.images?.[0] ||
              "",
            seller:
              product.sellerInfo
                ?.name ||
              "Seller",
            href:
              `/products/${product._id}`,
          })
        ),
    };
  };