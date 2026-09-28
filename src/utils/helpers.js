export const cleanString = (value, max = 5000) =>
  typeof value === "string"
    ? value.trim().slice(0, max)
    : "";

export const escapeRegExp = (value) =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const hasOwn = (object, key) =>
  Object.prototype.hasOwnProperty.call(object, key);