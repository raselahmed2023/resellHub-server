import {
  CATEGORIES,
  CONDITIONS,
} from "../constants/marketplace.js";

import {
  cleanString,
} from "./helpers.js";

export function validateProductPayload(
  body = {}
) {
  const title =
    cleanString(
      body.title,
      120
    );

  const category =
    cleanString(
      body.category,
      50
    );

  const condition =
    cleanString(
      body.condition,
      30
    );

  const description =
    cleanString(
      body.description,
      4000
    );

  const price =
    Number(
      body.price
    );

  const stock =
    Number(
      body.stock
    );

  const images =
    Array.isArray(
      body.images
    )
      ? body.images
          .filter(
            (url) =>
              typeof url ===
                "string" &&
              /^https?:\/\//i.test(
                url.trim()
              )
          )
          .map(
            (url) =>
              url.trim()
          )
          .slice(
            0,
            10
          )
      : [];

  if (
    title.length < 3
  ) {
    return {
      error:
        "Product title must be at least 3 characters.",
    };
  }

  if (
    !CATEGORIES.has(
      category
    )
  ) {
    return {
      error:
        "Invalid product category.",
    };
  }

  if (
    !CONDITIONS.has(
      condition
    )
  ) {
    return {
      error:
        "Invalid product condition.",
    };
  }

  if (
    !Number.isFinite(
      price
    ) ||
    price <= 0 ||
    price >
      99_999_999
  ) {
    return {
      error:
        "Price must be a valid positive number.",
    };
  }

  if (
    !Number.isInteger(
      stock
    ) ||
    stock < 0 ||
    stock >
      100_000
  ) {
    return {
      error:
        "Stock must be a non-negative whole number.",
    };
  }

  if (
    description.length <
    10
  ) {
    return {
      error:
        "Description must be at least 10 characters.",
    };
  }

  if (
    images.length === 0
  ) {
    return {
      error:
        "At least one valid product image is required.",
    };
  }

  return {
    value: {
      title,
      category,
      condition,
      description,
      price,
      stock,
      images,
    },
  };
}

export function validateDeliveryInfo(
  info = {}
) {
  const name =
    cleanString(
      info.name,
      100
    );

  const phone =
    cleanString(
      info.phone,
      40
    );

  const address =
    cleanString(
      info.address,
      300
    );

  if (
    name.length < 2
  ) {
    return {
      error:
        "Delivery name is required.",
    };
  }

  if (
    phone.length < 6
  ) {
    return {
      error:
        "A valid delivery phone number is required.",
    };
  }

  if (
    address.length < 8
  ) {
    return {
      error:
        "A complete delivery address is required.",
    };
  }

  return {
    value: {
      name,
      phone,
      address,
    },
  };
}