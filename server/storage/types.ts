import type { UserRole, Company } from "@shared/schema";

export interface AccessContext {
  userId: string;
  role: UserRole;
  companyId: string | null;
}

export interface CompanyWithUserCount extends Company {
  userCount: number;
}

export interface BulkUpdateParams {
  target: "ALL" | "MATERIALS" | "ARTICLES" | "MATERIAL" | "ARTICLE_FAMILY";
  targetId?: string;
  operation: "INCREASE_COST_PCT" | "DECREASE_COST_PCT" | "SET_MARGIN_PCT" | "INCREASE_MARGIN_PCT";
  value: number;
  preview?: boolean;
}
