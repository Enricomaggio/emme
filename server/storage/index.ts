// ============ Shared types (re-exported for consumers) ============
export type { AccessContext, CompanyWithUserCount, BulkUpdateParams } from "./types";

// ============ Domain storage modules ============

import { companiesStorage } from "./companies";
import { leadsStorage } from "./leads";
import { pipelineStorage } from "./pipeline";
import { usersStorage } from "./users";
import { catalogStorage } from "./catalog";
import { quotesStorage } from "./quotes";
import { projectsStorage } from "./projects";
import { workforceStorage } from "./workforce";
import { settingsStorage } from "./settings";
import { notificationsStorage } from "./notifications";
import { analyticsStorage } from "./analytics";
import { workOrdersStorage } from "./workOrders";

// ============ Aggregated storage object ============
// Spread order: later domains override earlier ones for any accidental name collision.
// All consumers import { storage } from "../storage" — TypeScript resolves that path
// to this index.ts automatically, so zero changes needed in routers.

export const storage = {
  ...companiesStorage,
  ...leadsStorage,
  ...pipelineStorage,
  ...usersStorage,
  ...catalogStorage,
  ...quotesStorage,
  ...projectsStorage,
  ...workforceStorage,
  ...settingsStorage,
  ...notificationsStorage,
  ...analyticsStorage,
  ...workOrdersStorage,
};

export type IStorage = typeof storage;
