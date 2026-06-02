import { Router } from "express";
import { storage } from "../storage";
import {
  isAuthenticated,
  getUserByEmail,
  getUserById,
  verifyPassword,
  generateToken,
  sanitizeUser,
  isAccountLocked,
  recordFailedLogin,
  resetFailedLoginAttempts,
  hashPassword,
} from "../auth";
import { loginUserSchema, passwordResetTokens, users } from "@shared/schema";
import { z } from "zod";
import { db } from "../db";
import { eq } from "drizzle-orm";

export const authRouter = Router();

authRouter.post("/register", async (_req, res) => {
  return res
    .status(403)
    .json({ message: "La registrazione pubblica è disabilitata." });
});

authRouter.post("/login", async (req, res) => {
  try {
    const validatedData = loginUserSchema.parse(req.body);

    const user = await getUserByEmail(validatedData.email);
    if (!user) {
      return res.status(401).json({ message: "Credenziali non valide" });
    }

    if (user.status === "SUSPENDED") {
      return res.status(403).json({ message: "Account sospeso." });
    }

    const lockStatus = isAccountLocked(user);
    if (lockStatus.locked) {
      return res.status(429).json({
        message: `Account bloccato per troppi tentativi. Riprova tra ${lockStatus.minutesRemaining} minut${lockStatus.minutesRemaining === 1 ? "o" : "i"}.`,
      });
    }

    const isValid = await verifyPassword(validatedData.password, user.password);
    if (!isValid) {
      const result = await recordFailedLogin(user.id, user.failedLoginAttempts);
      if (result.locked) {
        return res.status(429).json({
          message: "Account bloccato per troppi tentativi. Riprova tra 15 minuti.",
        });
      }
      return res.status(401).json({
        message: `Credenziali non valide. ${result.attemptsRemaining} tentativ${result.attemptsRemaining === 1 ? "o" : "i"} rimanent${result.attemptsRemaining === 1 ? "e" : "i"}.`,
      });
    }

    if (user.failedLoginAttempts > 0) {
      await resetFailedLoginAttempts(user.id);
    }

    const token = generateToken({ userId: user.id, email: user.email });
    res.json({ user: sanitizeUser(user), token });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Dati non validi", errors: error.errors });
    }
    console.error("Error logging in:", error);
    res.status(500).json({ message: "Errore nel login" });
  }
});

authRouter.get("/me", isAuthenticated, async (req, res) => {
  try {
    const user = await getUserById(req.user!.id);
    if (!user) return res.status(404).json({ message: "Utente non trovato" });
    res.json(sanitizeUser(user));
  } catch (error) {
    console.error("Error fetching user:", error);
    res.status(500).json({ message: "Errore nel recupero dell'utente" });
  }
});

// ============ PASSWORD RESET ============

authRouter.get("/auth/verify-reset/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const [resetToken] = await db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.token, token));

    if (!resetToken) return res.status(404).json({ message: "Link non valido" });
    if (resetToken.usedAt) return res.status(400).json({ message: "Link già utilizzato" });
    if (new Date() > new Date(resetToken.expiresAt))
      return res.status(400).json({ message: "Link scaduto" });

    const user = await getUserById(resetToken.userId);
    if (!user) return res.status(404).json({ message: "Utente non trovato" });

    res.json({ email: user.email });
  } catch (error) {
    console.error("Error verifying reset token:", error);
    res.status(500).json({ message: "Errore nella verifica del token" });
  }
});

authRouter.post("/auth/reset-password", async (req, res) => {
  try {
    const resetSchema = z.object({
      token: z.string().min(1),
      password: z
        .string()
        .min(8, "La password deve avere almeno 8 caratteri")
        .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, "Servono maiuscola, minuscola e numero"),
    });
    const validatedData = resetSchema.parse(req.body);

    const [resetToken] = await db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.token, validatedData.token));

    if (!resetToken) return res.status(404).json({ message: "Link non valido" });
    if (resetToken.usedAt) return res.status(400).json({ message: "Link già utilizzato" });
    if (new Date() > new Date(resetToken.expiresAt))
      return res.status(400).json({ message: "Link scaduto" });

    const hashedPassword = await hashPassword(validatedData.password);
    await db
      .update(users)
      .set({ password: hashedPassword, failedLoginAttempts: 0, lockedUntil: null })
      .where(eq(users.id, resetToken.userId));
    await db
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(eq(passwordResetTokens.id, resetToken.id));

    res.json({ message: "Password aggiornata" });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Dati non validi", errors: error.errors });
    }
    console.error("Error resetting password:", error);
    res.status(500).json({ message: "Errore nel reset della password" });
  }
});
