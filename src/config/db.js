import {
  MongoClient,
  ServerApiVersion,
} from "mongodb";

import {
  MONGODB_URI,
} from "./env.js";

const client = new MongoClient(
  MONGODB_URI,
  {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    },
  }
);

export const connectDB = async () => {
  await client.connect();
  return client.db("resellHub");
};

export const db =
  client.db("resellHub");

export const collections = {
  users: db.collection("user"),
  products: db.collection("products"),
  wishlist: db.collection("wishlist"),
  orders: db.collection("orders"),
  contactMessages:
    db.collection("contactMessages"),
};

export { client };