import {
  randomBytes,
  scrypt as derive,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { promisify } from "node:util";
import mongoose from "mongoose";
import { isMongoReady } from "../config/database.js";

const scrypt = promisify(derive);
const users = new Map();
const sessions = new Map();
const User = mongoose.model(
  "User",
  new mongoose.Schema(
    {
      username: { type: String, unique: true, required: true },
      passwordHash: String,
      salt: String,
    },
    { timestamps: true },
  ),
);
const Session = mongoose.model(
  "Session",
  new mongoose.Schema({
    tokenHash: { type: String, unique: true },
    userId: String,
    expiresAt: { type: Date, expires: 0 },
  }),
);
const digest = (token) => createHash("sha256").update(token).digest("hex");

export async function register(username, password) {
  const existing = isMongoReady()
    ? await User.findOne({ username }).lean()
    : users.get(username);
  if (existing)
    throw Object.assign(new Error("That username is already taken."), {
      status: 409,
    });
  const salt = randomBytes(16).toString("hex");
  const passwordHash = (await scrypt(password, salt, 64)).toString("hex");
  const user = isMongoReady()
    ? await User.create({ username, salt, passwordHash })
    : { _id: randomBytes(16).toString("hex"), username, salt, passwordHash };
  if (!isMongoReady()) users.set(username, user);
  return { id: String(user._id), username };
}

export async function login(username, password) {
  const user = isMongoReady()
    ? await User.findOne({ username }).lean()
    : users.get(username);
  const key = await scrypt(password, user?.salt || "unknown-account-salt", 64);
  if (!user || !timingSafeEqual(key, Buffer.from(user.passwordHash, "hex")))
    throw Object.assign(new Error("Incorrect username or password."), {
      status: 401,
    });
  return { id: String(user._id), username: user.username };
}

export async function createSession(user) {
  const token = randomBytes(32).toString("hex");
  const session = {
    tokenHash: digest(token),
    userId: user.id,
    expiresAt: new Date(Date.now() + 7 * 86400000),
  };
  if (isMongoReady()) await Session.create(session);
  else {
    for (const [key, value] of sessions)
      if (value.expiresAt < new Date()) sessions.delete(key);
    sessions.set(session.tokenHash, session);
  }
  return token;
}

function readToken(req) {
  return (
    req.headers.cookie
      ?.split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith("curalink_auth="))
      ?.slice(14) || ""
  );
}

export async function resolveUser(req) {
  const token = readToken(req);
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const session = isMongoReady()
    ? await Session.findOne({
        tokenHash: digest(token),
        expiresAt: { $gt: new Date() },
      }).lean()
    : sessions.get(digest(token));
  if (!session || session.expiresAt < new Date()) return null;
  const user = isMongoReady()
    ? await User.findById(session.userId).lean()
    : [...users.values()].find((entry) => String(entry._id) === session.userId);
  return user ? { id: String(user._id), username: user.username } : null;
}

export async function revokeSession(req) {
  const token = readToken(req);
  if (!token) return;
  if (isMongoReady()) await Session.deleteOne({ tokenHash: digest(token) });
  else sessions.delete(digest(token));
}

export async function requireUser(req, res, next) {
  try {
    req.user = await resolveUser(req);
    if (!req.user)
      return res
        .status(401)
        .json({ error: "Please sign in to use your research workspaces." });
    next();
  } catch (error) {
    next(error);
  }
}
