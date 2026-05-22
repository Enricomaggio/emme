import type { Express } from "express";
import { createServer, type Server } from "http";
import { leadsRouter } from "./routers/leads.router";
import { opportunitiesRouter } from "./routers/opportunities.router";
import { companyRouter } from "./routers/company.router";
import { authRouter } from "./routers/auth.router";
import { usersRouter } from "./routers/users.router";
import { projectsRouter } from "./routers/projects.router";
import { adminRouter } from "./routers/admin.router";
import { catalogRouter } from "./routers/catalog.router";
import { articlesRouter } from "./routers/articles.router";
import { assignmentsRouter } from "./routers/assignments.router";
import { notificationsRouter } from "./routers/notifications.router";
import { quotesRouter } from "./routers/quotes.router";
import { paymentMethodsRouter } from "./routers/payment-methods.router";
import { dashboardRouter } from "./routers/dashboard.router";
import { superbillRouter } from "./routers/superbill.router";
import { workOrdersRouter } from "./routers/work-orders.router";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.use('/api', leadsRouter);
  app.use('/api', opportunitiesRouter);
  app.use('/api', projectsRouter);
  app.use('/api', adminRouter);
  app.use('/api', companyRouter);
  app.use('/api', authRouter);
  app.use('/api', usersRouter);
  app.use('/api', catalogRouter);
  app.use('/api', articlesRouter);
  app.use('/api', assignmentsRouter);
  app.use('/api', notificationsRouter);
  app.use('/api', quotesRouter);
  app.use('/api', paymentMethodsRouter);
  app.use('/api', dashboardRouter);
  app.use('/api', superbillRouter);
  app.use('/api', workOrdersRouter);

  return httpServer;
}
