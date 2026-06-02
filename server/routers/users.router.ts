import { Router } from "express";
import { storage } from "../storage";
import {
  isAuthenticated,
  getUserById,
  verifyPassword,
  hashPassword,
} from "../auth";
import { z } from "zod";
import multer from "multer";

export const usersRouter = Router();

const profileImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Formato immagine non supportato"));
  },
});

// PATCH /api/users/profile — aggiorna profilo utente corrente
usersRouter.patch("/users/profile", isAuthenticated, async (req, res) => {
  try {
    const { id: userId } = req.user!;
    const profileSchema = z.object({
      displayName: z.string().optional(),
      contactEmail: z.string().email("Email non valida").optional().or(z.literal("")),
      phone: z.string().optional(),
    });
    const validated = profileSchema.parse(req.body);
    const updated = await storage.updateUserProfile(userId, {
      displayName: validated.displayName || undefined,
      contactEmail: validated.contactEmail || undefined,
      phone: validated.phone || undefined,
    });
    if (!updated) return res.status(404).json({ message: "Utente non trovato" });
    const { password, profileImageData, ...safe } = updated;
    res.json(safe);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Dati non validi", errors: error.errors });
    }
    console.error("Error updating profile:", error);
    res.status(500).json({ message: "Errore" });
  }
});

// POST /api/users/profile-image — upload immagine
usersRouter.post("/users/profile-image", isAuthenticated, profileImageUpload.single("image"), async (req, res) => {
  try {
    const { id: userId } = req.user!;
    const file = req.file;
    if (!file) return res.status(400).json({ message: "Nessuna immagine caricata" });
    const base64 = file.buffer.toString("base64");
    const dataUri = `data:${file.mimetype};base64,${base64}`;
    const imageUrl = `/api/users/${userId}/profile-image?t=${Date.now()}`;
    const updated = await storage.updateUserProfile(userId, {
      profileImageUrl: imageUrl,
      profileImageData: dataUri,
    });
    if (!updated) return res.status(404).json({ message: "Utente non trovato" });
    const { password, profileImageData, ...safe } = updated;
    res.json(safe);
  } catch (error: any) {
    console.error("Error uploading image:", error);
    res.status(500).json({ message: error.message || "Errore" });
  }
});

// GET /api/users/:id/profile-image — serve immagine
usersRouter.get("/users/:id/profile-image", isAuthenticated, async (req, res) => {
  try {
    const user = await getUserById(req.params.id);
    if (!user || !user.profileImageData) {
      return res.status(404).json({ message: "Immagine non trovata" });
    }
    const match = user.profileImageData.match(/^data:(.+);base64,(.+)$/);
    if (!match) return res.status(500).json({ message: "Formato immagine non valido" });
    const buffer = Buffer.from(match[2], "base64");
    res.set({
      "Content-Type": match[1],
      "Content-Length": String(buffer.length),
      "Cache-Control": "public, max-age=86400",
    });
    res.send(buffer);
  } catch (error) {
    console.error("Error serving image:", error);
    res.status(500).json({ message: "Errore" });
  }
});

// DELETE /api/users/profile-image
usersRouter.delete("/users/profile-image", isAuthenticated, async (req, res) => {
  try {
    const { id: userId } = req.user!;
    const updated = await storage.updateUserProfile(userId, {
      profileImageUrl: "",
      profileImageData: null,
    });
    if (!updated) return res.status(404).json({ message: "Utente non trovato" });
    const { password, profileImageData, ...safe } = updated;
    res.json(safe);
  } catch (error) {
    console.error("Error removing image:", error);
    res.status(500).json({ message: "Errore" });
  }
});

// POST /api/users/change-password
usersRouter.post("/users/change-password", isAuthenticated, async (req, res) => {
  try {
    const { id: userId } = req.user!;
    const schema = z.object({
      currentPassword: z.string().min(1, "Password corrente richiesta"),
      newPassword: z
        .string()
        .min(8, "La password deve avere almeno 8 caratteri")
        .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, "Servono maiuscola, minuscola e numero"),
    });
    const validated = schema.parse(req.body);
    const currentUser = await getUserById(userId);
    if (!currentUser) return res.status(404).json({ message: "Utente non trovato" });
    const ok = await verifyPassword(validated.currentPassword, currentUser.password);
    if (!ok) return res.status(401).json({ message: "La password corrente non è corretta" });
    const hashed = await hashPassword(validated.newPassword);
    await storage.updateUserPassword(userId, hashed);
    res.json({ message: "Password aggiornata" });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Dati non validi", errors: error.errors });
    }
    console.error("Error changing password:", error);
    res.status(500).json({ message: "Errore" });
  }
});
