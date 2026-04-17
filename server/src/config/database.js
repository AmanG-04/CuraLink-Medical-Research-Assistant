import mongoose from "mongoose";
import { config } from "./env.js";

export async function connectDatabase() {
  if (!config.mongoUri) {
    console.warn("MONGODB_URI is not set. Using in-memory conversation storage.");
    return false;
  }

  mongoose.set("strictQuery", true);
  await mongoose.connect(config.mongoUri);
  console.log("Connected to MongoDB");
  return true;
}

export function isMongoReady() {
  return mongoose.connection.readyState === 1;
}
