import { Router } from "express";
import { storage } from "../storage";
import { isAuthenticated } from "../auth";
import { insertReminderSchema } from "@shared/schema";

export const notificationsRouter = Router();

// ============ REMINDERS ============

notificationsRouter.get("/reminders", isAuthenticated, async (req, res) => {
  try {
    if (req.query.dueAfter && req.query.dueBefore) {
      const from = new Date(req.query.dueAfter as string);
      const to = new Date(req.query.dueBefore as string);
      const items = await storage.getUpcomingReminders(from, to);
      return res.json(items);
    }
    const items = await storage.getReminders();
    res.json(items);
  } catch (error: any) {
    console.error("Error fetching reminders:", error);
    res.status(500).json({ message: error.message });
  }
});

notificationsRouter.get("/reminders/lead/:leadId", isAuthenticated, async (req, res) => {
  try {
    const items = await storage.getRemindersByLead(req.params.leadId);
    res.json(items);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

notificationsRouter.get("/reminders/opportunity/:opportunityId", isAuthenticated, async (req, res) => {
  try {
    const items = await storage.getRemindersByOpportunity(req.params.opportunityId);
    res.json(items);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

notificationsRouter.post("/reminders", isAuthenticated, async (req, res) => {
  try {
    const body = { ...req.body };
    if (typeof body.dueDate === "string") {
      const d = new Date(body.dueDate);
      if (isNaN(d.getTime())) return res.status(400).json({ message: "Data non valida" });
      body.dueDate = d;
    }
    const parsed = insertReminderSchema.safeParse(body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Dati non validi", errors: parsed.error.flatten() });
    }
    const reminder = await storage.createReminder(parsed.data);
    res.status(201).json(reminder);
  } catch (error: any) {
    console.error("Error creating reminder:", error);
    res.status(500).json({ message: error.message });
  }
});

notificationsRouter.patch("/reminders/:id", isAuthenticated, async (req, res) => {
  try {
    const updateData: Record<string, unknown> = {};
    if (req.body.title !== undefined) updateData.title = req.body.title;
    if (req.body.description !== undefined) updateData.description = req.body.description;
    if (req.body.dueDate !== undefined) updateData.dueDate = new Date(req.body.dueDate);
    if (req.body.completed !== undefined) {
      const r = await storage.toggleReminderCompleted(req.params.id, req.body.completed);
      if (!r) return res.status(404).json({ message: "Promemoria non trovato" });
      return res.json(r);
    }
    const reminder = await storage.updateReminder(req.params.id, updateData);
    if (!reminder) return res.status(404).json({ message: "Promemoria non trovato" });
    res.json(reminder);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

notificationsRouter.delete("/reminders/:id", isAuthenticated, async (req, res) => {
  try {
    const deleted = await storage.deleteReminder(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Promemoria non trovato" });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// ============ NOTIFICATIONS ============

notificationsRouter.get("/notifications", isAuthenticated, async (_req, res) => {
  try {
    const notifs = await storage.getNotifications();
    res.json(notifs);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

notificationsRouter.get("/notifications/unread-count", isAuthenticated, async (_req, res) => {
  try {
    const count = await storage.getUnreadCount();
    res.json({ count });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

notificationsRouter.put("/notifications/:id/read", isAuthenticated, async (req, res) => {
  try {
    await storage.markRead(req.params.id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

notificationsRouter.put("/notifications/read-all", isAuthenticated, async (_req, res) => {
  try {
    await storage.markAllRead();
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});
