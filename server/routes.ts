import type { Express } from "express";
import { type Server } from "http";
import { authRouter } from "./routers/auth.router";
import { leadsRouter } from "./routers/leads.router";
import { opportunitiesRouter } from "./routers/opportunities.router";
import { milestonesRouter } from "./routers/milestones.router";
import { usersRouter } from "./routers/users.router";
import { notificationsRouter } from "./routers/notifications.router";
import { dashboardRouter } from "./routers/dashboard.router";

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  app.use("/api", authRouter);
  app.use("/api", leadsRouter);
  app.use("/api", opportunitiesRouter);
  app.use("/api", milestonesRouter);
  app.use("/api", usersRouter);
  app.use("/api", notificationsRouter);
  app.use("/api", dashboardRouter);
  return httpServer;
}
