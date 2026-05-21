import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { MaterialWithThicknesses, ArticleFamilyWithVariants, LaborRate, QuoteItemType } from "@shared/schema";
import { LattoneriaForm } from "../forms/LattoneriaForm";
import { ArticoloForm } from "../forms/ArticoloForm";
import { GiornateForm } from "../forms/GiornateForm";
import { ManualeForm } from "../forms/ManualeForm";
import type { QuoteItemDraft } from "../types";
import type { QuoteItemDraftValues } from "../schemas";
import { genUid } from "../utils";

interface AddRowDialogProps {
  open: boolean;
  onClose: () => void;
  onAdd: (draft: QuoteItemDraft) => void;
  materials: MaterialWithThicknesses[];
  articleFamilies: ArticleFamilyWithVariants[];
  laborRates: LaborRate[];
}

export function AddRowDialog({ open, onClose, onAdd, materials, articleFamilies, laborRates }: AddRowDialogProps) {
  const [type, setType] = useState<QuoteItemType>("LATTONERIA");

  useEffect(() => {
    if (open) setType("LATTONERIA");
  }, [open]);

  const handleSubmit = (d: QuoteItemDraftValues) => {
    onAdd({ uid: genUid(), ...d });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg flex flex-col max-h-[90vh]" data-testid="dialog-add-row">
        <DialogHeader className="shrink-0">
          <DialogTitle>Aggiungi riga al preventivo</DialogTitle>
          <DialogDescription>Scegli il tipo di voce da inserire</DialogDescription>
        </DialogHeader>

        <div className="space-y-2 shrink-0">
          <Label>Tipo riga</Label>
          <Select value={type} onValueChange={(v) => setType(v as QuoteItemType)}>
            <SelectTrigger data-testid="select-row-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="LATTONERIA" data-testid="option-lattoneria">Lattoneria (sviluppo × metri)</SelectItem>
              <SelectItem value="ARTICOLO" data-testid="option-articolo">Articolo (catalogo)</SelectItem>
              <SelectItem value="GIORNATE" data-testid="option-giornate">Manodopera (giornate)</SelectItem>
              <SelectItem value="MANUALE" data-testid="option-manuale">Voce manuale (one-off)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {type === "LATTONERIA" && (
          <LattoneriaForm materials={materials} onSubmit={handleSubmit} />
        )}
        {type === "ARTICOLO" && (
          <ArticoloForm articleFamilies={articleFamilies} onSubmit={handleSubmit} />
        )}
        {type === "GIORNATE" && (
          <GiornateForm laborRates={laborRates} onSubmit={handleSubmit} />
        )}
        {type === "MANUALE" && (
          <ManualeForm onSubmit={handleSubmit} />
        )}
      </DialogContent>
    </Dialog>
  );
}
