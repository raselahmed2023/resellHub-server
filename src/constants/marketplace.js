export const CATEGORIES = new Set([
  "Electronics",
  "Furniture",
  "Vehicles",
  "Fashion",
  "Mobile Phones",
  "Books",
  "Sports",
  "Other",
]);

export const CONDITIONS = new Set([
  "New",
  "Like New",
  "Good",
  "Fair",
  "Used",
  "Refurbished",
]);

export const PRODUCT_ADMIN_STATUSES = new Set([
  "pending",
  "available",
  "rejected",
  "reserved",
]);

export const USER_ROLES = new Set([
  "buyer",
  "seller",
  "admin",
]);

export const USER_STATUSES = new Set([
  "active",
  "blocked",
]);

export const SELLER_ORDER_TRANSITIONS = {
  pending: new Set([
    "accepted",
    "cancelled",
  ]),

  accepted: new Set([
    "processing",
    "cancelled",
  ]),

  processing: new Set([
    "shipped",
  ]),

  shipped: new Set([
    "delivered",
  ]),

  delivered: new Set(),

  cancelled: new Set(),

  cancelling: new Set(),
};