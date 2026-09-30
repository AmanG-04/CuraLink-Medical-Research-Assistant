import { Router } from "express";
import { z } from "zod";
import {
  createSession,
  login,
  register,
  resolveUser,
  revokeSession,
} from "../services/auth.js";

export const authRouter = Router();
const credentials = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_]{3,30}$/, "Use 3–30 letters, numbers or underscores."),
  password: z.string().min(8).max(128),
  acceptedTerms: z.boolean().optional(),
});
const cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
  maxAge: 7 * 86400000,
});
const attempts = new Map();
authRouter.use((req, res, next) => {
  if (req.method !== "POST" || req.path === "/logout") return next();
  const now = Date.now();
  for (const [key, entry] of attempts)
    if (entry.until < now) attempts.delete(key);
  const key = req.ip;
  const entry = attempts.get(key) || { count: 0, until: now + 600000 };
  entry.count += 1;
  attempts.set(key, entry);
  if (entry.count > 20)
    return res
      .status(429)
      .json({ error: "Too many sign-in attempts. Try again in ten minutes." });
  next();
});
for (const action of ["register", "login"]) {
  authRouter.post(`/${action}`, async (req, res, next) => {
    try {
      const input = credentials.parse(req.body);
      if (action === "register" && !input.acceptedTerms)
        return res
          .status(400)
          .json({
            error:
              "Please accept the Terms and acknowledge the Privacy Notice.",
          });
      const user = await (action === "register" ? register : login)(
        input.username,
        input.password,
      );
      res.cookie("curalink_auth", await createSession(user), cookieOptions());
      res.status(action === "register" ? 201 : 200).json({ user });
    } catch (error) {
      next(error);
    }
  });
}
authRouter.get("/me", async (req, res, next) => {
  try {
    res.json({ user: await resolveUser(req) });
  } catch (error) {
    next(error);
  }
});
authRouter.post("/logout", async (req, res, next) => {
  try {
    await revokeSession(req);
    const options = cookieOptions();
    delete options.maxAge;
    res.clearCookie("curalink_auth", options);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});
