import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { MaterialWithThicknesses, ArticleFamilyWithVariants, LaborRate } from "@shared/schema";
import { LattoneriaForm } from "../forms/LattoneriaForm";
import { ArticoloForm } from "../forms/ArticoloForm";
import { GiornateForm } from "../forms/GiornateForm";
import { ManualeForm } from "../forms/ManualeForm";
import type { QuoteItemDraft } from "../types";
import type { QuoteItemDraftValues } from "../schemas";

interface EditRowDialogProps {
  item: QuoteItemDraft | null;
  onClose: () => void;
  onUpdate: (uid: string, draft: QuoteItemDraftValues) => void;
  materials: MaterialWithThicknesses[];
  articleFamilies: ArticleFamilyWithVariants[];
  laborRates: LaborRate[];
}

export function EditRowDialog({ item, onClose, onUpdate, materials, articleFamilies, laborRates }: EditRowDialogProps) {
  const open = item !== null;

  const handleSubmit = (d: QuoteItemDraftValues) => {
    if (!item) return;
    onUpdate(item.uid, d);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg flex flex-col max-h-[90vh]" data-testid="dialog-edit-row">
        <DialogHeader className="shrink-0">
          <DialogTitle>Modifica riga del preventivo</DialogTitle>
          <DialogDescription>Aggiorna i campi e salva per ricalcolare il prezzo</DialogDescription>
        </DialogHeader>

        {item?.type === "LATTONERIA" && (
          <LattoneriaForm
            key={item.uid}
            materials={materials}
            initial={item}
            submitLabel="Salva modifiche"
            submitTestId="button-save-lattoneria-row"
            onSubmit={handleSubmit}
          />
        )}
        {item?.type === "ARTICOLO" && (
          <ArticoloForm
            key={item.uid}
            articleFamilies={articleFamilies}
            initial={item}
            submitLabel="Salva modifiche"
            submitTestId="button-save-articolo-row"
            onSubmit={handleSubmit}
          />
        )}
        {item?.type === "GIORNATE" && (
          <GiornateForm
            key={item.uid}
            laborRates={laborRates}
            initial={item}
            submitLabel="Salva modifiche"
            submitTestId="button-save-giornate-row"
            onSubmit={handleSubmit}
          />
        )}
        {item?.type === "MANUALE" && (
          <ManualeForm
            key={item.uid}
            initial={item}
            submitLabel="Salva modifiche"
            submitTestId="button-save-manuale-row"
            onSubmit={handleSubmit}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
