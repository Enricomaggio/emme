import { z } from "zod";
import type { QuoteItemDraft } from "./types";

export const discountFields = {
  discountPercent: z.string().optional().refine(
    (v) => {
      if (!v) return true;
      const n = parseFloat(v);
      return !isNaN(n) && n >= 0 && n <= 100;
    },
    { message: "Sconto: numero tra 0 e 100" },
  ),
  overrideTotal: z.string().optional().refine(
    (v) => {
      if (!v) return true;
      const n = parseFloat(v);
      return !isNaN(n) && n >= 0;
    },
    { message: "Importo: numero ≥ 0" },
  ),
};

export const LATTONERIA_PRODUCTS = [
  "Grondaia",
  "Scossalina",
  "Colmo",
  "Canale di gronda",
  "Tubo pluviale",
  "Bavetta",
  "Sguscio",
  "Fascia paraghiaia",
  "Converse",
  "Scossalina a muro",
  "Cappello da muro",
  "Listello coprigiunto",
  "Lamiera piana",
  "Zoccolo",
  "Davanzale",
  "Fascia frontale",
  "Bocchettone",
  "Parascintille",
];

export const lattoneriaFormSchema = z.object({
  productName: z.string().min(1, "Seleziona il tipo di prodotto"),
  productNameCustom: z.string().optional(),
  materialId: z.string().min(1, "Seleziona un materiale"),
  materialThicknessId: z.string().min(1, "Seleziona uno spessore"),
  materialFinishId: z.string().optional(),
  developmentCm: z.string().refine((v) => parseFloat(v) > 0, { message: "Sviluppo > 0" }),
  quantity: z.string().refine((v) => parseFloat(v) > 0, { message: "Metri > 0" }),
  marginPercent: z.string().optional(),
  ...discountFields,
}).superRefine((data, ctx) => {
  if (data.productName === "__CUSTOM__" && !data.productNameCustom?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Inserisci il nome del prodotto", path: ["productNameCustom"] });
  }
});

export const articoloFormSchema = z.object({
  catalogArticleId: z.string().min(1, "Seleziona un articolo"),
  quantity: z.string().refine((v) => parseFloat(v) > 0, { message: "Quantità > 0" }),
  description: z.string().optional(),
  marginPercent: z.string().optional(),
  ...discountFields,
});

export const giornateFormSchema = z.object({
  laborRateId: z.string().min(1, "Seleziona una manodopera"),
  quantity: z.string().refine((v) => parseFloat(v) > 0, { message: "Giorni > 0" }),
  description: z.string().optional(),
  marginPercent: z.string().optional(),
  ...discountFields,
});

export const manualeFormSchema = z.object({
  description: z.string().trim().min(1, "Descrizione obbligatoria"),
  unitOfMeasure: z.string().trim().min(1, "Unità di misura obbligatoria"),
  quantity: z.string().refine((v) => parseFloat(v) > 0, { message: "Quantità deve essere > 0" }),
  unitCost: z.string().refine((v) => parseFloat(v) >= 0, { message: "Costo unitario >= 0" }),
  marginPercent: z.string().optional(),
  ...discountFields,
});

export type QuoteItemDraftValues = Omit<QuoteItemDraft, "uid">;
