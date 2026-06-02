import { leadsStorage } from "./leads";
import { pipelineStorage } from "./pipeline";
import { milestonesStorage } from "./milestones";
import { contactReferentsStorage } from "./contactReferents";
import { remindersStorage } from "./reminders";
import { notificationsStorage } from "./notifications";
import { usersStorage } from "./users";

export const storage = {
  ...leadsStorage,
  ...pipelineStorage,
  ...milestonesStorage,
  ...contactReferentsStorage,
  ...remindersStorage,
  ...notificationsStorage,
  ...usersStorage,
};

export type IStorage = typeof storage;
