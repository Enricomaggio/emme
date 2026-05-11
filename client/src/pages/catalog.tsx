import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Plus,
  Pencil,
  Trash2,
  Package,
  ChevronDown,
  ChevronRight,
  TrendingUp,
} from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/formatCurrency";
import {
  insertMaterialSchema,
  insertMaterialThicknessSchema,
  insertArticleFamilySchema,
  insertCatalogArticleSchema,
  insertLaborRateSchema,
  type Material,
  type MaterialThickness,
  type MaterialWithThicknesses,
  type ArticleFamily,
  type ArticleFamilyWithVariants,
  type CatalogArticle,
  type LaborRate,
  type InsertMaterial,
  type InsertMaterialThickness,
  type InsertArticleFamily,
  type InsertCatalogArticle,
  type InsertLaborRate,
} from "@shared/schema";

function num(value: string | number | null | undefined, fallback = 0): number {
  if (value === null || value === undefined || value === "") return fallback;
  const n = typeof value === "number" ? value : parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

// ============ MATERIALI + SPESSORI ============

function MaterialForm({
  defaultValues,
  onSubmit,
  isPending,
  submitLabel,
}: {
  defaultValues: InsertMaterial;
  onSubmit: (values: InsertMaterial) => void;
  isPending: boolean;
  submitLabel: string;
}) {
  const form = useForm<InsertMaterial>({
    resolver: zodResolver(insertMaterialSchema),
    defaultValues,
  });

  const priceMode = form.watch("priceMode");

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nome materiale</FormLabel>
              <FormControl>
                <Input
                  placeholder="Es. Rame, Alluminio, Zinco"
                  {...field}
                  data-testid="input-materiale-nome"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="density"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Peso specifico (kg/m³)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  step="0.0001"
                  min="0"
                  inputMode="decimal"
                  placeholder="Es. 8960 per il rame"
                  {...field}
                  value={field.value ?? ""}
                  data-testid="input-materiale-densita"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="priceMode"
          render={({ field }) => (
            <FormItem className="flex items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <FormLabel className="text-sm font-medium">Prezzo unico per tutti gli spessori</FormLabel>
                <p className="text-xs text-muted-foreground">
                  {field.value === "SINGLE"
                    ? "Un solo €/kg vale per tutti gli spessori"
                    : "Ogni spessore/variante ha il proprio €/kg"}
                </p>
              </div>
              <FormControl>
                <Switch
                  checked={field.value === "SINGLE"}
                  onCheckedChange={(checked) => field.onChange(checked ? "SINGLE" : "PER_VARIANT")}
                  data-testid="switch-price-mode"
                />
              </FormControl>
            </FormItem>
          )}
        />

        {priceMode === "SINGLE" && (
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="singleCostPerKg"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Costo €/kg</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.0001"
                      min="0"
                      inputMode="decimal"
                      placeholder="0.00"
                      {...field}
                      value={field.value ?? ""}
                      data-testid="input-materiale-costo-kg"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="singleMarginPercent"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Margine %</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      inputMode="decimal"
                      placeholder="0"
                      {...field}
                      value={field.value ?? ""}
                      data-testid="input-materiale-margine"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        )}

        <DialogFooter>
          <Button
            type="submit"
            disabled={isPending}
            data-testid="button-conferma-materiale"
          >
            {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {submitLabel}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

function ThicknessForm({
  defaultValues,
  isPERVariant,
  onSubmit,
  isPending,
  submitLabel,
}: {
  defaultValues: InsertMaterialThickness;
  isPERVariant: boolean;
  onSubmit: (values: InsertMaterialThickness) => void;
  isPending: boolean;
  submitLabel: string;
}) {
  const form = useForm<InsertMaterialThickness>({
    resolver: zodResolver(insertMaterialThicknessSchema),
    defaultValues,
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="thicknessMm"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Spessore (mm)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="0.001"
                    min="0"
                    inputMode="decimal"
                    placeholder="Es. 0.6"
                    {...field}
                    value={field.value ?? ""}
                    data-testid="input-spessore-mm"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="finish"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Finitura (opzionale)</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Es. Grezzo, Preverniciato"
                    {...field}
                    value={field.value ?? ""}
                    data-testid="input-spessore-finitura"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {isPERVariant && (
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="costPerKg"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Costo al kg (€)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.0001"
                      min="0"
                      inputMode="decimal"
                      placeholder="0.00"
                      {...field}
                      value={field.value ?? ""}
                      data-testid="input-spessore-costo-kg"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="marginPercent"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Margine %</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      inputMode="decimal"
                      placeholder="0"
                      {...field}
                      value={field.value ?? ""}
                      data-testid="input-spessore-margine"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        )}

        <DialogFooter>
          <Button
            type="submit"
            disabled={isPending}
            data-testid="button-conferma-spessore"
          >
            {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {submitLabel}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

function MaterialiTab() {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [createMaterialOpen, setCreateMaterialOpen] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
  const [deletingMaterial, setDeletingMaterial] = useState<Material | null>(null);

  const [createThicknessFor, setCreateThicknessFor] = useState<MaterialWithThicknesses | null>(null);
  const [editingThickness, setEditingThickness] = useState<{ thickness: MaterialThickness; priceMode: string } | null>(null);
  const [deletingThickness, setDeletingThickness] = useState<MaterialThickness | null>(null);

  const { data: materials = [], isLoading } = useQuery<MaterialWithThicknesses[]>({
    queryKey: ["/api/materials"],
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["/api/materials"] });
  }

  const onMutationError = (err: Error) => {
    toast({ title: "Errore", description: err.message, variant: "destructive" });
  };

  const createMaterialMut = useMutation({
    mutationFn: async (data: InsertMaterial) => {
      const res = await apiRequest("POST", "/api/materials", data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Materiale creato" });
      setCreateMaterialOpen(false);
      invalidate();
    },
    onError: onMutationError,
  });

  const updateMaterialMut = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: InsertMaterial }) => {
      const res = await apiRequest("PUT", `/api/materials/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Materiale aggiornato" });
      setEditingMaterial(null);
      invalidate();
    },
    onError: onMutationError,
  });

  const deleteMaterialMut = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/materials/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Materiale eliminato" });
      setDeletingMaterial(null);
      invalidate();
    },
    onError: (err: Error) => {
      onMutationError(err);
      setDeletingMaterial(null);
    },
  });

  const createThicknessMut = useMutation({
    mutationFn: async (data: InsertMaterialThickness) => {
      const res = await apiRequest("POST", "/api/material-thicknesses", data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Spessore/variante aggiunto" });
      setCreateThicknessFor(null);
      invalidate();
    },
    onError: onMutationError,
  });

  const updateThicknessMut = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<InsertMaterialThickness> }) => {
      const res = await apiRequest("PUT", `/api/material-thicknesses/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Spessore/variante aggiornato" });
      setEditingThickness(null);
      invalidate();
    },
    onError: onMutationError,
  });

  const deleteThicknessMut = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/material-thicknesses/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Spessore/variante eliminato" });
      setDeletingThickness(null);
      invalidate();
    },
    onError: (err: Error) => {
      onMutationError(err);
      setDeletingThickness(null);
    },
  });

  function toggleExpanded(id: string) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Materiali</h2>
          <p className="text-sm text-muted-foreground">
            Materiali di lattoneria con peso specifico (kg/m³). Ogni materiale ha più spessori/varianti.
          </p>
        </div>
        <Button
          onClick={() => setCreateMaterialOpen(true)}
          data-testid="button-nuovo-materiale"
        >
          <Plus className="w-4 h-4 mr-2" />
          Nuovo Materiale
        </Button>
      </div>

      <div className="border rounded-lg">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : materials.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground"
            data-testid="empty-materiali"
          >
            <Package className="w-10 h-10 mb-2" />
            <p>Nessun materiale inserito.</p>
          </div>
        ) : (
          <div className="divide-y">
            {materials.map((mat) => {
              const isOpen = !!expanded[mat.id];
              const isSingle = mat.priceMode === "SINGLE";
              return (
                <div key={mat.id} data-testid={`row-materiale-${mat.id}`}>
                  <div className="flex items-center gap-2 p-3 hover-elevate">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => toggleExpanded(mat.id)}
                      data-testid={`button-toggle-materiale-${mat.id}`}
                    >
                      {isOpen ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                    </Button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className="font-medium truncate"
                          data-testid={`text-materiale-nome-${mat.id}`}
                        >
                          {mat.name}
                        </span>
                        <Badge variant="secondary" className="text-xs shrink-0">
                          {isSingle ? "prezzo unico" : "prezzo per variante"}
                        </Badge>
                      </div>
                      <div
                        className="text-xs text-muted-foreground"
                        data-testid={`text-materiale-densita-${mat.id}`}
                      >
                        {num(mat.density).toLocaleString()} kg/m³
                        {isSingle && mat.singleCostPerKg
                          ? ` · € ${formatCurrency(num(mat.singleCostPerKg))}/kg · ${num(mat.singleMarginPercent)}% margine`
                          : ""}
                        {" "}· {mat.thicknesses.length} {isSingle ? "spessori" : "varianti"}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setCreateThicknessFor(mat)}
                      data-testid={`button-aggiungi-spessore-${mat.id}`}
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      {isSingle ? "Spessore" : "Variante"}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setEditingMaterial(mat)}
                      data-testid={`button-modifica-materiale-${mat.id}`}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setDeletingMaterial(mat)}
                      data-testid={`button-elimina-materiale-${mat.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>

                  {isOpen && (
                    <div className="bg-muted/30 px-4 pb-4">
                      {mat.thicknesses.length === 0 ? (
                        <div
                          className="text-sm text-muted-foreground py-3"
                          data-testid={`empty-spessori-${mat.id}`}
                        >
                          Nessuno spessore inserito per questo materiale.
                        </div>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Spessore (mm)</TableHead>
                              <TableHead>Finitura</TableHead>
                              {!isSingle && (
                                <>
                                  <TableHead className="text-right">Costo €/kg</TableHead>
                                  <TableHead className="text-right">Margine %</TableHead>
                                </>
                              )}
                              <TableHead className="w-[110px] text-right">Azioni</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {mat.thicknesses.map((th) => (
                              <TableRow
                                key={th.id}
                                data-testid={`row-spessore-${th.id}`}
                              >
                                <TableCell
                                  className="font-medium"
                                  data-testid={`text-spessore-mm-${th.id}`}
                                >
                                  {num(th.thicknessMm)} mm
                                </TableCell>
                                <TableCell
                                  className="text-muted-foreground"
                                  data-testid={`text-spessore-finitura-${th.id}`}
                                >
                                  {th.finish || "—"}
                                </TableCell>
                                {!isSingle && (
                                  <>
                                    <TableCell
                                      className="text-right"
                                      data-testid={`text-spessore-costo-${th.id}`}
                                    >
                                      € {formatCurrency(num(th.costPerKg))}
                                    </TableCell>
                                    <TableCell
                                      className="text-right"
                                      data-testid={`text-spessore-margine-${th.id}`}
                                    >
                                      {num(th.marginPercent)}%
                                    </TableCell>
                                  </>
                                )}
                                <TableCell className="text-right">
                                  <div className="flex justify-end gap-1">
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      onClick={() => setEditingThickness({ thickness: th, priceMode: mat.priceMode })}
                                      data-testid={`button-modifica-spessore-${th.id}`}
                                    >
                                      <Pencil className="w-4 h-4" />
                                    </Button>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      onClick={() => setDeletingThickness(th)}
                                      data-testid={`button-elimina-spessore-${th.id}`}
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Crea materiale */}
      <Dialog open={createMaterialOpen} onOpenChange={setCreateMaterialOpen}>
        <DialogContent data-testid="dialog-nuovo-materiale">
          <DialogHeader>
            <DialogTitle>Nuovo Materiale</DialogTitle>
            <DialogDescription>
              Inserisci nome, peso specifico e modalità di prezzo.
            </DialogDescription>
          </DialogHeader>
          <MaterialForm
            defaultValues={{ name: "", density: "0", priceMode: "SINGLE", singleCostPerKg: "0", singleMarginPercent: "0" }}
            onSubmit={(values) => createMaterialMut.mutate(values)}
            isPending={createMaterialMut.isPending}
            submitLabel="Crea"
          />
        </DialogContent>
      </Dialog>

      {/* Modifica materiale */}
      <Dialog
        open={!!editingMaterial}
        onOpenChange={(open) => !open && setEditingMaterial(null)}
      >
        <DialogContent data-testid="dialog-modifica-materiale">
          <DialogHeader>
            <DialogTitle>Modifica Materiale</DialogTitle>
            <DialogDescription>Aggiorna i dati del materiale.</DialogDescription>
          </DialogHeader>
          {editingMaterial && (
            <MaterialForm
              defaultValues={{
                name: editingMaterial.name,
                density: String(editingMaterial.density),
                priceMode: (editingMaterial.priceMode as "SINGLE" | "PER_VARIANT") ?? "PER_VARIANT",
                singleCostPerKg: String(editingMaterial.singleCostPerKg ?? "0"),
                singleMarginPercent: String(editingMaterial.singleMarginPercent ?? "0"),
              }}
              onSubmit={(values) =>
                updateMaterialMut.mutate({ id: editingMaterial.id, data: values })
              }
              isPending={updateMaterialMut.isPending}
              submitLabel="Salva"
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Elimina materiale */}
      <AlertDialog
        open={!!deletingMaterial}
        onOpenChange={(open) => !open && setDeletingMaterial(null)}
      >
        <AlertDialogContent data-testid="dialog-elimina-materiale">
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare il materiale?</AlertDialogTitle>
            <AlertDialogDescription>
              {deletingMaterial
                ? `Stai per eliminare "${deletingMaterial.name}" e tutti i suoi spessori. L'operazione non è reversibile.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-annulla-elimina-materiale">
              Annulla
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                deletingMaterial && deleteMaterialMut.mutate(deletingMaterial.id)
              }
              data-testid="button-conferma-elimina-materiale"
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Crea spessore/variante per materiale */}
      <Dialog
        open={!!createThicknessFor}
        onOpenChange={(open) => !open && setCreateThicknessFor(null)}
      >
        <DialogContent data-testid="dialog-nuovo-spessore">
          <DialogHeader>
            <DialogTitle>
              {createThicknessFor?.priceMode === "SINGLE" ? "Nuovo Spessore" : "Nuova Variante"}
              {createThicknessFor ? ` — ${createThicknessFor.name}` : ""}
            </DialogTitle>
            <DialogDescription>
              {createThicknessFor?.priceMode === "SINGLE"
                ? "Inserisci spessore e finitura opzionale. Il prezzo è già definito sul materiale."
                : "Inserisci spessore, finitura, costo al kg e margine %."}
            </DialogDescription>
          </DialogHeader>
          {createThicknessFor && (
            <ThicknessForm
              isPERVariant={createThicknessFor.priceMode === "PER_VARIANT"}
              defaultValues={{
                materialId: createThicknessFor.id,
                thicknessMm: "0",
                finish: "",
                costPerKg: "0",
                marginPercent: "0",
              }}
              onSubmit={(values) => createThicknessMut.mutate(values)}
              isPending={createThicknessMut.isPending}
              submitLabel="Crea"
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Modifica spessore */}
      <Dialog
        open={!!editingThickness}
        onOpenChange={(open) => !open && setEditingThickness(null)}
      >
        <DialogContent data-testid="dialog-modifica-spessore">
          <DialogHeader>
            <DialogTitle>Modifica Spessore/Variante</DialogTitle>
            <DialogDescription>Aggiorna i dati dello spessore.</DialogDescription>
          </DialogHeader>
          {editingThickness && (
            <ThicknessForm
              isPERVariant={editingThickness.priceMode === "PER_VARIANT"}
              defaultValues={{
                materialId: editingThickness.thickness.materialId,
                thicknessMm: String(editingThickness.thickness.thicknessMm),
                finish: editingThickness.thickness.finish ?? "",
                costPerKg: String(editingThickness.thickness.costPerKg ?? "0"),
                marginPercent: String(editingThickness.thickness.marginPercent ?? "0"),
              }}
              onSubmit={(values) =>
                updateThicknessMut.mutate({ id: editingThickness.thickness.id, data: values })
              }
              isPending={updateThicknessMut.isPending}
              submitLabel="Salva"
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Elimina spessore */}
      <AlertDialog
        open={!!deletingThickness}
        onOpenChange={(open) => !open && setDeletingThickness(null)}
      >
        <AlertDialogContent data-testid="dialog-elimina-spessore">
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare lo spessore?</AlertDialogTitle>
            <AlertDialogDescription>
              {deletingThickness
                ? `Stai per eliminare lo spessore di ${num(deletingThickness.thicknessMm)} mm. L'operazione non è reversibile.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-annulla-elimina-spessore">
              Annulla
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                deletingThickness && deleteThicknessMut.mutate(deletingThickness.id)
              }
              data-testid="button-conferma-elimina-spessore"
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ============ ARTICOLI (Famiglie + Varianti) ============

function FamilyForm({
  defaultValues,
  onSubmit,
  isPending,
  submitLabel,
}: {
  defaultValues: InsertArticleFamily;
  onSubmit: (values: InsertArticleFamily) => void;
  isPending: boolean;
  submitLabel: string;
}) {
  const form = useForm<InsertArticleFamily>({
    resolver: zodResolver(insertArticleFamilySchema),
    defaultValues,
  });

  const uomOptions = ["mt", "pz", "kg", "m²", "ml", "cm", "l"];

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nome famiglia</FormLabel>
              <FormControl>
                <Input
                  placeholder="Es. Tubo Alluminio Preverniciato"
                  {...field}
                  data-testid="input-famiglia-nome"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="unitOfMeasure"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Unità di misura</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger data-testid="select-famiglia-uom">
                    <SelectValue placeholder="Seleziona unità" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {uomOptions.map((u) => (
                    <SelectItem key={u} value={u} data-testid={`option-uom-${u}`}>{u}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <DialogFooter>
          <Button
            type="submit"
            disabled={isPending}
            data-testid="button-conferma-famiglia"
          >
            {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {submitLabel}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

function VariantForm({
  defaultValues,
  onSubmit,
  isPending,
  submitLabel,
}: {
  defaultValues: InsertCatalogArticle;
  onSubmit: (values: InsertCatalogArticle) => void;
  isPending: boolean;
  submitLabel: string;
}) {
  const form = useForm<InsertCatalogArticle>({
    resolver: zodResolver(insertCatalogArticleSchema),
    defaultValues,
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Descrizione variante</FormLabel>
              <FormControl>
                <Input
                  placeholder="Es. Diam. 60, Diam. 80"
                  {...field}
                  data-testid="input-variante-nome"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Note (opzionale)</FormLabel>
              <FormControl>
                <Input
                  placeholder="Es. spessore 0.8mm"
                  {...field}
                  value={field.value ?? ""}
                  data-testid="input-variante-note"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="unitCost"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Costo unitario (€)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="0.0001"
                    min="0"
                    inputMode="decimal"
                    placeholder="0.00"
                    {...field}
                    value={field.value ?? ""}
                    data-testid="input-variante-costo"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="marginPercent"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Margine %</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    inputMode="decimal"
                    placeholder="0"
                    {...field}
                    value={field.value ?? ""}
                    data-testid="input-variante-margine"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <DialogFooter>
          <Button
            type="submit"
            disabled={isPending}
            data-testid="button-conferma-variante"
          >
            {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {submitLabel}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

function ArticoliTab() {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [createFamilyOpen, setCreateFamilyOpen] = useState(false);
  const [editingFamily, setEditingFamily] = useState<ArticleFamily | null>(null);
  const [deletingFamily, setDeletingFamily] = useState<ArticleFamily | null>(null);

  const [createVariantFor, setCreateVariantFor] = useState<ArticleFamilyWithVariants | null>(null);
  const [editingVariant, setEditingVariant] = useState<CatalogArticle | null>(null);
  const [deletingVariant, setDeletingVariant] = useState<CatalogArticle | null>(null);

  const { data: families = [], isLoading } = useQuery<ArticleFamilyWithVariants[]>({
    queryKey: ["/api/article-families"],
  });

  function invalidateFamilies() {
    queryClient.invalidateQueries({ queryKey: ["/api/article-families"] });
    queryClient.invalidateQueries({ queryKey: ["/api/catalog-articles"] });
  }

  const onMutationError = (err: Error) => {
    toast({ title: "Errore", description: err.message, variant: "destructive" });
  };

  const createFamilyMut = useMutation({
    mutationFn: async (data: InsertArticleFamily) => {
      const res = await apiRequest("POST", "/api/article-families", data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Famiglia creata" });
      setCreateFamilyOpen(false);
      invalidateFamilies();
    },
    onError: onMutationError,
  });

  const updateFamilyMut = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: InsertArticleFamily }) => {
      const res = await apiRequest("PUT", `/api/article-families/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Famiglia aggiornata" });
      setEditingFamily(null);
      invalidateFamilies();
    },
    onError: onMutationError,
  });

  const deleteFamilyMut = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/article-families/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Famiglia eliminata" });
      setDeletingFamily(null);
      invalidateFamilies();
    },
    onError: (err: Error) => {
      onMutationError(err);
      setDeletingFamily(null);
    },
  });

  const createVariantMut = useMutation({
    mutationFn: async ({ familyId, data }: { familyId: string; data: InsertCatalogArticle }) => {
      const res = await apiRequest("POST", `/api/article-families/${familyId}/variants`, data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Variante aggiunta" });
      setCreateVariantFor(null);
      invalidateFamilies();
    },
    onError: onMutationError,
  });

  const updateVariantMut = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<InsertCatalogArticle> }) => {
      const res = await apiRequest("PUT", `/api/catalog-articles/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Variante aggiornata" });
      setEditingVariant(null);
      invalidateFamilies();
    },
    onError: onMutationError,
  });

  const deleteVariantMut = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/catalog-articles/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Variante eliminata" });
      setDeletingVariant(null);
      invalidateFamilies();
    },
    onError: (err: Error) => {
      onMutationError(err);
      setDeletingVariant(null);
    },
  });

  function toggleExpanded(id: string) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Articoli</h2>
          <p className="text-sm text-muted-foreground">
            Articoli pre-acquistati organizzati per famiglia (es. Tubo Alluminio) e varianti (es. Diam. 60, 80…).
          </p>
        </div>
        <Button
          onClick={() => setCreateFamilyOpen(true)}
          data-testid="button-nuovo-articolo"
        >
          <Plus className="w-4 h-4 mr-2" />
          Nuova Famiglia
        </Button>
      </div>

      <div className="border rounded-lg">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : families.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground"
            data-testid="empty-articoli"
          >
            <Package className="w-10 h-10 mb-2" />
            <p>Nessuna famiglia articoli inserita.</p>
          </div>
        ) : (
          <div className="divide-y">
            {families.map((fam) => {
              const isOpen = !!expanded[fam.id];
              return (
                <div key={fam.id} data-testid={`row-famiglia-${fam.id}`}>
                  <div className="flex items-center gap-2 p-3 hover-elevate">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => toggleExpanded(fam.id)}
                      data-testid={`button-toggle-famiglia-${fam.id}`}
                    >
                      {isOpen ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                    </Button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className="font-medium truncate"
                          data-testid={`text-famiglia-nome-${fam.id}`}
                        >
                          {fam.name}
                        </span>
                        <Badge variant="outline" className="text-xs shrink-0">
                          {fam.unitOfMeasure}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {fam.variants.length} varianti
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setCreateVariantFor(fam)}
                      data-testid={`button-aggiungi-variante-${fam.id}`}
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      Variante
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setEditingFamily(fam)}
                      data-testid={`button-modifica-famiglia-${fam.id}`}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setDeletingFamily(fam)}
                      data-testid={`button-elimina-famiglia-${fam.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>

                  {isOpen && (
                    <div className="bg-muted/30 px-4 pb-4">
                      {fam.variants.length === 0 ? (
                        <div
                          className="text-sm text-muted-foreground py-3"
                          data-testid={`empty-varianti-${fam.id}`}
                        >
                          Nessuna variante inserita per questa famiglia.
                        </div>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Descrizione</TableHead>
                              <TableHead>Note</TableHead>
                              <TableHead className="text-right">Costo / {fam.unitOfMeasure}</TableHead>
                              <TableHead className="text-right">Margine %</TableHead>
                              <TableHead className="w-[110px] text-right">Azioni</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {fam.variants.map((v) => (
                              <TableRow
                                key={v.id}
                                data-testid={`row-variante-${v.id}`}
                              >
                                <TableCell
                                  className="font-medium"
                                  data-testid={`text-variante-nome-${v.id}`}
                                >
                                  {v.name}
                                </TableCell>
                                <TableCell
                                  className="text-muted-foreground text-sm"
                                  data-testid={`text-variante-note-${v.id}`}
                                >
                                  {v.notes || "—"}
                                </TableCell>
                                <TableCell
                                  className="text-right"
                                  data-testid={`text-variante-costo-${v.id}`}
                                >
                                  € {formatCurrency(num(v.unitCost))}
                                </TableCell>
                                <TableCell
                                  className="text-right"
                                  data-testid={`text-variante-margine-${v.id}`}
                                >
                                  {num(v.marginPercent)}%
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="flex justify-end gap-1">
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      onClick={() => setEditingVariant(v)}
                                      data-testid={`button-modifica-variante-${v.id}`}
                                    >
                                      <Pencil className="w-4 h-4" />
                                    </Button>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      onClick={() => setDeletingVariant(v)}
                                      data-testid={`button-elimina-variante-${v.id}`}
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Crea famiglia */}
      <Dialog open={createFamilyOpen} onOpenChange={setCreateFamilyOpen}>
        <DialogContent data-testid="dialog-nuovo-articolo">
          <DialogHeader>
            <DialogTitle>Nuova Famiglia Articoli</DialogTitle>
            <DialogDescription>
              Crea una categoria di articoli (es. Tubo Alluminio). Le varianti si aggiungono dopo.
            </DialogDescription>
          </DialogHeader>
          <FamilyForm
            defaultValues={{ name: "", unitOfMeasure: "mt" }}
            onSubmit={(values) => createFamilyMut.mutate(values)}
            isPending={createFamilyMut.isPending}
            submitLabel="Crea"
          />
        </DialogContent>
      </Dialog>

      {/* Modifica famiglia */}
      <Dialog
        open={!!editingFamily}
        onOpenChange={(open) => !open && setEditingFamily(null)}
      >
        <DialogContent data-testid="dialog-modifica-famiglia">
          <DialogHeader>
            <DialogTitle>Modifica Famiglia</DialogTitle>
            <DialogDescription>Aggiorna nome e unità di misura.</DialogDescription>
          </DialogHeader>
          {editingFamily && (
            <FamilyForm
              defaultValues={{
                name: editingFamily.name,
                unitOfMeasure: editingFamily.unitOfMeasure,
              }}
              onSubmit={(values) =>
                updateFamilyMut.mutate({ id: editingFamily.id, data: values })
              }
              isPending={updateFamilyMut.isPending}
              submitLabel="Salva"
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Elimina famiglia */}
      <AlertDialog
        open={!!deletingFamily}
        onOpenChange={(open) => !open && setDeletingFamily(null)}
      >
        <AlertDialogContent data-testid="dialog-elimina-famiglia">
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare la famiglia?</AlertDialogTitle>
            <AlertDialogDescription>
              {deletingFamily
                ? `Stai per eliminare "${deletingFamily.name}" e tutte le sue varianti. L'operazione non è reversibile.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-annulla-elimina-famiglia">Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingFamily && deleteFamilyMut.mutate(deletingFamily.id)}
              data-testid="button-conferma-elimina-famiglia"
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Crea variante */}
      <Dialog
        open={!!createVariantFor}
        onOpenChange={(open) => !open && setCreateVariantFor(null)}
      >
        <DialogContent data-testid="dialog-nuova-variante">
          <DialogHeader>
            <DialogTitle>
              Nuova Variante{createVariantFor ? ` — ${createVariantFor.name}` : ""}
            </DialogTitle>
            <DialogDescription>
              Inserisci descrizione (es. "Diam. 60"), note, costo e margine.
            </DialogDescription>
          </DialogHeader>
          {createVariantFor && (
            <VariantForm
              defaultValues={{
                name: "",
                familyId: createVariantFor.id,
                unitOfMeasure: createVariantFor.unitOfMeasure,
                unitCost: "0",
                marginPercent: "0",
                notes: "",
              }}
              onSubmit={(values) =>
                createVariantMut.mutate({ familyId: createVariantFor.id, data: values })
              }
              isPending={createVariantMut.isPending}
              submitLabel="Aggiungi"
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Modifica variante */}
      <Dialog
        open={!!editingVariant}
        onOpenChange={(open) => !open && setEditingVariant(null)}
      >
        <DialogContent data-testid="dialog-modifica-variante">
          <DialogHeader>
            <DialogTitle>Modifica Variante</DialogTitle>
            <DialogDescription>Aggiorna i dati della variante.</DialogDescription>
          </DialogHeader>
          {editingVariant && (
            <VariantForm
              defaultValues={{
                name: editingVariant.name,
                familyId: editingVariant.familyId ?? "",
                unitOfMeasure: editingVariant.unitOfMeasure,
                unitCost: String(editingVariant.unitCost),
                marginPercent: String(editingVariant.marginPercent),
                notes: editingVariant.notes ?? "",
              }}
              onSubmit={(values) =>
                updateVariantMut.mutate({ id: editingVariant.id, data: values })
              }
              isPending={updateVariantMut.isPending}
              submitLabel="Salva"
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Elimina variante */}
      <AlertDialog
        open={!!deletingVariant}
        onOpenChange={(open) => !open && setDeletingVariant(null)}
      >
        <AlertDialogContent data-testid="dialog-elimina-variante">
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare la variante?</AlertDialogTitle>
            <AlertDialogDescription>
              {deletingVariant
                ? `Stai per eliminare "${deletingVariant.name}". L'operazione non è reversibile.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-annulla-elimina-variante">Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingVariant && deleteVariantMut.mutate(deletingVariant.id)}
              data-testid="button-conferma-elimina-variante"
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ============ AGGIORNAMENTO PREZZI MASSIVO ============

type BulkTarget = "ALL" | "MATERIALS" | "ARTICLES" | "MATERIAL" | "ARTICLE_FAMILY";
type BulkOperation = "INCREASE_COST_PCT" | "DECREASE_COST_PCT" | "SET_MARGIN_PCT" | "INCREASE_MARGIN_PCT";

function AggiornaPrezziTab() {
  const { toast } = useToast();
  const [target, setTarget] = useState<BulkTarget>("ALL");
  const [targetId, setTargetId] = useState<string>("");
  const [operation, setOperation] = useState<BulkOperation>("INCREASE_COST_PCT");
  const [value, setValue] = useState<string>("5");
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isApplying, setIsApplying] = useState(false);

  const { data: materials = [] } = useQuery<MaterialWithThicknesses[]>({
    queryKey: ["/api/materials"],
  });
  const { data: families = [] } = useQuery<ArticleFamilyWithVariants[]>({
    queryKey: ["/api/article-families"],
  });

  async function doRequest(preview: boolean) {
    const v = parseFloat(value);
    if (!isFinite(v) || v < 0) {
      toast({ title: "Errore", description: "Inserisci un valore valido", variant: "destructive" });
      return;
    }
    try {
      const body = {
        target,
        targetId: (target === "MATERIAL" || target === "ARTICLE_FAMILY") ? targetId : undefined,
        operation,
        value: v,
        preview,
      };
      const res = await apiRequest("POST", "/api/catalog/bulk-update", body);
      const data = await res.json();
      if (preview) {
        setPreviewCount(data.updated);
      } else {
        toast({ title: "Prezzi aggiornati", description: `${data.updated} record aggiornati` });
        setPreviewCount(null);
        queryClient.invalidateQueries({ queryKey: ["/api/materials"] });
        queryClient.invalidateQueries({ queryKey: ["/api/article-families"] });
        queryClient.invalidateQueries({ queryKey: ["/api/catalog-articles"] });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Errore sconosciuto";
      toast({ title: "Errore", description: msg, variant: "destructive" });
    }
  }

  async function handlePreview() {
    setIsPreviewing(true);
    await doRequest(true);
    setIsPreviewing(false);
  }

  async function handleApply() {
    setIsApplying(true);
    await doRequest(false);
    setIsApplying(false);
  }

  const operationLabel: Record<BulkOperation, string> = {
    INCREASE_COST_PCT: "Aumenta il costo di",
    DECREASE_COST_PCT: "Diminuisci il costo di",
    SET_MARGIN_PCT: "Imposta il margine a",
    INCREASE_MARGIN_PCT: "Aumenta il margine di",
  };

  const valueSuffix = "%";

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-lg font-semibold">Aggiornamento Prezzi Massivo</h2>
        <p className="text-sm text-muted-foreground">
          Applica aumenti, riduzioni o modifiche ai margini su tutto il catalogo o su parti di esso.
        </p>
      </div>

      <div className="border rounded-lg p-5 space-y-5">
        {/* Cosa aggiornare */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Cosa vuoi aggiornare?</Label>
          <RadioGroup
            value={target}
            onValueChange={(v) => { setTarget(v as BulkTarget); setTargetId(""); setPreviewCount(null); }}
            data-testid="radio-bulk-target"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="ALL" id="target-all" data-testid="radio-target-all" />
              <Label htmlFor="target-all">Tutto il catalogo</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="MATERIALS" id="target-materials" data-testid="radio-target-materials" />
              <Label htmlFor="target-materials">Solo materiali</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="ARTICLES" id="target-articles" data-testid="radio-target-articles" />
              <Label htmlFor="target-articles">Solo articoli</Label>
            </div>
            <div className="flex items-center gap-3">
              <RadioGroupItem value="MATERIAL" id="target-material" data-testid="radio-target-material" />
              <Label htmlFor="target-material">Materiale specifico</Label>
              {target === "MATERIAL" && (
                <Select value={targetId} onValueChange={setTargetId}>
                  <SelectTrigger className="w-48" data-testid="select-target-material">
                    <SelectValue placeholder="Seleziona..." />
                  </SelectTrigger>
                  <SelectContent>
                    {materials.map((m) => (
                      <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="flex items-center gap-3">
              <RadioGroupItem value="ARTICLE_FAMILY" id="target-family" data-testid="radio-target-family" />
              <Label htmlFor="target-family">Famiglia articoli</Label>
              {target === "ARTICLE_FAMILY" && (
                <Select value={targetId} onValueChange={setTargetId}>
                  <SelectTrigger className="w-48" data-testid="select-target-family">
                    <SelectValue placeholder="Seleziona..." />
                  </SelectTrigger>
                  <SelectContent>
                    {families.map((f) => (
                      <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </RadioGroup>
        </div>

        {/* Operazione */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Operazione</Label>
          <RadioGroup
            value={operation}
            onValueChange={(v) => { setOperation(v as BulkOperation); setPreviewCount(null); }}
            data-testid="radio-bulk-operation"
          >
            {(Object.entries(operationLabel) as [BulkOperation, string][]).map(([op, label]) => (
              <div key={op} className="flex items-center gap-3">
                <RadioGroupItem value={op} id={`op-${op}`} data-testid={`radio-op-${op}`} />
                <Label htmlFor={`op-${op}`}>{label}</Label>
                {operation === op && (
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      step="0.1"
                      min="0"
                      className="w-20"
                      value={value}
                      onChange={(e) => { setValue(e.target.value); setPreviewCount(null); }}
                      data-testid="input-bulk-value"
                    />
                    <span className="text-sm">{valueSuffix}</span>
                  </div>
                )}
              </div>
            ))}
          </RadioGroup>
        </div>

        {/* Anteprima */}
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={handlePreview}
            disabled={isPreviewing || isApplying || ((target === "MATERIAL" || target === "ARTICLE_FAMILY") && !targetId)}
            data-testid="button-bulk-preview"
          >
            {isPreviewing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Mostra anteprima
          </Button>
        </div>

        {previewCount !== null && (
          <div className="rounded-md border bg-muted/40 p-4 space-y-1" data-testid="bulk-preview-result">
            <p className="text-sm font-medium">
              {previewCount} {previewCount === 1 ? "record verrà aggiornato" : "record verranno aggiornati"}
            </p>
            <p className="text-xs text-muted-foreground">
              Operazione: {operationLabel[operation]} {value}{valueSuffix}
            </p>
          </div>
        )}

        <div className="flex justify-between pt-2 border-t">
          <Button
            variant="ghost"
            onClick={() => { setPreviewCount(null); }}
            disabled={isPreviewing || isApplying}
            data-testid="button-bulk-reset"
          >
            Annulla
          </Button>
          <Button
            onClick={handleApply}
            disabled={isApplying || isPreviewing || ((target === "MATERIAL" || target === "ARTICLE_FAMILY") && !targetId)}
            data-testid="button-bulk-apply"
          >
            {isApplying && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            <TrendingUp className="w-4 h-4 mr-2" />
            Conferma e applica
          </Button>
        </div>
      </div>
    </div>
  );
}

// ============ MANODOPERA / GIORNATE ============

function LaborForm({
  defaultValues,
  onSubmit,
  isPending,
  submitLabel,
}: {
  defaultValues: InsertLaborRate;
  onSubmit: (values: InsertLaborRate) => void;
  isPending: boolean;
  submitLabel: string;
}) {
  const form = useForm<InsertLaborRate>({
    resolver: zodResolver(insertLaborRateSchema),
    defaultValues,
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nome voce</FormLabel>
              <FormControl>
                <Input
                  placeholder="Es. Installatore, Aiuto installatore"
                  {...field}
                  data-testid="input-manodopera-nome"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="costPerDay"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Costo al giorno (€)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    inputMode="decimal"
                    placeholder="0.00"
                    {...field}
                    value={field.value ?? ""}
                    data-testid="input-manodopera-costo-giorno"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="marginPercent"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Margine % di default</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    inputMode="decimal"
                    placeholder="0"
                    {...field}
                    value={field.value ?? ""}
                    data-testid="input-manodopera-margine"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <DialogFooter>
          <Button
            type="submit"
            disabled={isPending}
            data-testid="button-conferma-manodopera"
          >
            {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {submitLabel}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

function ManodoperaTab() {
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<LaborRate | null>(null);
  const [deleting, setDeleting] = useState<LaborRate | null>(null);

  const { data: rates = [], isLoading } = useQuery<LaborRate[]>({
    queryKey: ["/api/labor-rates"],
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["/api/labor-rates"] });
  }

  const onMutationError = (err: Error) => {
    toast({ title: "Errore", description: err.message, variant: "destructive" });
  };

  const createMut = useMutation({
    mutationFn: async (data: InsertLaborRate) => {
      const res = await apiRequest("POST", "/api/labor-rates", data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Voce manodopera creata" });
      setCreateOpen(false);
      invalidate();
    },
    onError: onMutationError,
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: InsertLaborRate }) => {
      const res = await apiRequest("PUT", `/api/labor-rates/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Voce manodopera aggiornata" });
      setEditing(null);
      invalidate();
    },
    onError: onMutationError,
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/labor-rates/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Voce manodopera eliminata" });
      setDeleting(null);
      invalidate();
    },
    onError: (err: Error) => {
      onMutationError(err);
      setDeleting(null);
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Manodopera / Giornate</h2>
          <p className="text-sm text-muted-foreground">
            Voci di manodopera giornaliera utilizzate nel preventivatore.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} data-testid="button-nuova-manodopera">
          <Plus className="w-4 h-4 mr-2" />
          Nuova Voce
        </Button>
      </div>

      <div className="border rounded-lg">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : rates.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground"
            data-testid="empty-manodopera"
          >
            <Package className="w-10 h-10 mb-2" />
            <p>Nessuna voce di manodopera inserita.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead className="text-right">Costo / giorno</TableHead>
                <TableHead className="text-right">Margine %</TableHead>
                <TableHead className="w-[110px] text-right">Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rates.map((r) => (
                <TableRow key={r.id} data-testid={`row-manodopera-${r.id}`}>
                  <TableCell
                    className="font-medium"
                    data-testid={`text-manodopera-nome-${r.id}`}
                  >
                    {r.name}
                  </TableCell>
                  <TableCell
                    className="text-right"
                    data-testid={`text-manodopera-costo-${r.id}`}
                  >
                    € {formatCurrency(num(r.costPerDay))}
                  </TableCell>
                  <TableCell
                    className="text-right"
                    data-testid={`text-manodopera-margine-${r.id}`}
                  >
                    {num(r.marginPercent)}%
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setEditing(r)}
                        data-testid={`button-modifica-manodopera-${r.id}`}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setDeleting(r)}
                        data-testid={`button-elimina-manodopera-${r.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent data-testid="dialog-nuova-manodopera">
          <DialogHeader>
            <DialogTitle>Nuova Voce di Manodopera</DialogTitle>
            <DialogDescription>
              Definisci nome, costo al giorno e margine %.
            </DialogDescription>
          </DialogHeader>
          <LaborForm
            defaultValues={{ name: "", costPerDay: "0", marginPercent: "0" }}
            onSubmit={(values) => createMut.mutate(values)}
            isPending={createMut.isPending}
            submitLabel="Crea"
          />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent data-testid="dialog-modifica-manodopera">
          <DialogHeader>
            <DialogTitle>Modifica Voce di Manodopera</DialogTitle>
            <DialogDescription>Aggiorna i dati della voce.</DialogDescription>
          </DialogHeader>
          {editing && (
            <LaborForm
              defaultValues={{
                name: editing.name,
                costPerDay: String(editing.costPerDay),
                marginPercent: String(editing.marginPercent),
              }}
              onSubmit={(values) => updateMut.mutate({ id: editing.id, data: values })}
              isPending={updateMut.isPending}
              submitLabel="Salva"
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
      >
        <AlertDialogContent data-testid="dialog-elimina-manodopera">
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare la voce?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting
                ? `Stai per eliminare "${deleting.name}". L'operazione non è reversibile.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-annulla-elimina-manodopera">
              Annulla
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleting && deleteMut.mutate(deleting.id)}
              data-testid="button-conferma-elimina-manodopera"
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ============ PAGINA CATALOGO LATTONERIA ============

export default function CatalogPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState("materiali");

  return (
    <DashboardLayout user={user ?? undefined} fullWidth>
      <div className="container mx-auto px-4 py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Catalogo Lattoneria</h1>
          <p className="text-sm text-muted-foreground">
            Gestione di materiali, articoli e voci di manodopera per il preventivatore.
          </p>
        </div>
        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList data-testid="tabs-catalogo">
            <TabsTrigger value="materiali" data-testid="tab-materiali">
              Materiali
            </TabsTrigger>
            <TabsTrigger value="articoli" data-testid="tab-articoli">
              Articoli
            </TabsTrigger>
            <TabsTrigger value="manodopera" data-testid="tab-manodopera">
              Manodopera
            </TabsTrigger>
            <TabsTrigger value="aggiorna-prezzi" data-testid="tab-aggiorna-prezzi">
              Aggiorna Prezzi
            </TabsTrigger>
          </TabsList>
          <TabsContent value="materiali" className="mt-6">
            <MaterialiTab />
          </TabsContent>
          <TabsContent value="articoli" className="mt-6">
            <ArticoliTab />
          </TabsContent>
          <TabsContent value="manodopera" className="mt-6">
            <ManodoperaTab />
          </TabsContent>
          <TabsContent value="aggiorna-prezzi" className="mt-6">
            <AggiornaPrezziTab />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
