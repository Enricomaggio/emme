export const APP_CONFIG = {
  appName: (import.meta.env.VITE_APP_NAME as string) || "CRM",
  companyName: (import.meta.env.VITE_COMPANY_NAME as string) || "",
  moduleAmministrazione: import.meta.env.VITE_MODULE_AMMINISTRAZIONE !== "false",
  moduleCantieri: import.meta.env.VITE_MODULE_CANTIERI !== "false",
};
