import { useMemo } from "react";
import type { UseFormReturn } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { formatEur } from "../utils";

interface WithDiscountFields {
  discountPercent?: string;
  overrideTotal?: string;
}

export function DiscountFields<T extends WithDiscountFields>({
  form,
  baseTotal,
}: {
  form: UseFormReturn<T>;
  baseTotal: number | null;
}) {
  // Cast to a concrete form type to satisfy react-hook-form's strict Path<T> generics
  const f = form as unknown as UseFormReturn<WithDiscountFields>;
  const discountPct = f.watch("discountPercent");
  const overrideTotalVal = f.watch("overrideTotal");

  const discountedTotal = useMemo(() => {
    if (baseTotal == null) return null;
    const pct = parseFloat(discountPct || "0");
    if (!isFinite(pct) || pct <= 0) return null;
    return baseTotal * (1 - pct / 100);
  }, [baseTotal, discountPct]);

  const overrideNum = useMemo(() => {
    const v = parseFloat(overrideTotalVal || "");
    return isFinite(v) && v >= 0 ? v : null;
  }, [overrideTotalVal]);

  const finalTotal = overrideNum != null ? overrideNum : discountedTotal;

  return (
    <div className="border-t pt-3 space-y-3">
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Sconto / Override prezzo</div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-sm font-medium">Sconto %</label>
          <Input
            type="number"
            step="any"
            min="0"
            max="100"
            placeholder="0"
            {...f.register("discountPercent")}
            data-testid="input-discount-percent"
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium">Totale manuale (€)</label>
          <Input
            type="number"
            step="any"
            min="0"
            placeholder="—"
            {...f.register("overrideTotal")}
            data-testid="input-override-total"
          />
        </div>
      </div>
      {(finalTotal != null || overrideNum != null) && baseTotal != null && (
        <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-2 text-sm" data-testid="discount-preview">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-muted-foreground">Prezzo originale:</span>
            <span className="line-through text-muted-foreground">€ {formatEur(baseTotal)}</span>
            <span className="text-muted-foreground">→</span>
            <span className="font-semibold text-amber-800 dark:text-amber-200">
              € {formatEur(overrideNum != null ? overrideNum : (discountedTotal ?? baseTotal))}
            </span>
            {overrideNum == null && discountedTotal != null && (
              <span className="text-xs text-muted-foreground">(-{parseFloat(discountPct || "0").toFixed(1)}%)</span>
            )}
            {overrideNum != null && (
              <span className="text-xs text-muted-foreground">(manuale)</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
