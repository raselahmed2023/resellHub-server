import { ObjectId } from "mongodb";

export const isValidObjectId = (value) =>
  ObjectId.isValid(
    String(value || "")
  );

export const toObjectId = (value) =>
  isValidObjectId(value)
    ? new ObjectId(value)
    : null;