import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth, getAuthToken } from "@/lib/auth";
import { APP_CONFIG } from "@/lib/config";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { User, Mail, Calendar, LogOut, Building2, Phone, MapPin, CreditCard, Save, Loader2, FileText, KeyRound, Receipt, Plus, Pencil, Trash2, Check, X, Bell, FileEdit, RotateCcw, ChevronDown } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { useState, useEffect, useRef } from "react";
import type { Company, User as UserType, Article } from "@shared/schema";
import { applyTemplate } from "@/pdf/quote-pdf-utils";

function NotificationPreferencesSection({ userRole }: { userRole: string }) {
  const { toast } = useToast();
  const { data: prefs = [], isLoading } = useQuery<{ id: string; userId: string; notificationType: string; enabled: boolean }[]>({
    queryKey: ["/api/notification-preferences"],
  });

  const updatePref = useMutation({
    mutationFn: async ({ type, enabled }: { type: string; enabled: boolean }) => {
      await apiRequest("PUT", `/api/notification-preferences/${type}`, { enabled });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notification-preferences"] });
    },
    onError: () => {
      toast({ title: "Errore", description: "Impossibile aggiornare la preferenza", variant: "destructive" });
    },
  });

  type SimpleToggle = { key: string; label: string; description: string; roles: string[]; types: string[] };
  const toggles: SimpleToggle[] = [
    { key: "NEW_PROJECT", label: "Nuovi cantieri", description: "Notifica quando un'opportunità viene vinta e si crea un nuovo progetto", roles: ["TECHNICIAN"], types: ["NEW_PROJECT"] },
    { key: "SITE_PHOTO_VIDEO", label: "Cantieri da foto e/o video", description: "Notifica quando un cantiere vinto richiede foto e/o video", roles: ["COMPANY_ADMIN", "SUPER_ADMIN"], types: ["SITE_PHOTO", "SITE_PHOTO_VIDEO"] },
    { key: "STALE_OPPORTUNITY", label: "Opportunità in attesa", description: "Mostra le opportunità ferme nella prima colonna da più di 4 ore nella dashboard", roles: ["COMPANY_ADMIN", "SUPER_ADMIN", "SALES_AGENT"], types: ["STALE_OPPORTUNITY"] },
    { key: "LEAD_CALL_REQUEST", label: "Contatto da chiamare", description: "Notifica quando la segreteria segnala un nuovo contatto da richiamare", roles: ["SALES_AGENT", "COMPANY_ADMIN"], types: ["LEAD_CALL_REQUEST"] },
  ];

  const visibleToggles = toggles.filter(t => t.roles.includes(userRole));
  if (visibleToggles.length === 0) return null;

  const isEnabled = (types: string[]) => {
    const relevantPrefs = prefs.filter(p => types.includes(p.notificationType));
    if (relevantPrefs.length === 0) return true;
    return relevantPrefs.some(p => p.enabled);
  };

  const handleToggle = (toggle: SimpleToggle, checked: boolean) => {
    toggle.types.forEach(type => {
      updatePref.mutate({ type, enabled: checked });
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Bell className="w-5 h-5" />
          Preferenze Notifiche
        </CardTitle>
        <CardDescription>
          Scegli quali notifiche ricevere
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            {visibleToggles.map(t => (
              <div key={t.key} className="flex items-center justify-between gap-4 py-2" data-testid={`notif-pref-${t.key}`}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{t.label}</p>
                  <p className="text-xs text-muted-foreground">{t.description}</p>
                </div>
                <Switch
                  checked={isEnabled(t.types)}
                  onCheckedChange={(checked) => handleToggle(t, checked)}
                  data-testid={`switch-notif-${t.key}`}
                />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function SettingsPage() {
  const { user, logout, updateUser } = useAuth();
  const { toast } = useToast();
  const isAdmin = user?.role === "COMPANY_ADMIN" || user?.role === "SUPER_ADMIN";
  const isCompanyAdmin = user?.role === "COMPANY_ADMIN";

  const userInitials = user?.firstName && user?.lastName 
    ? `${user.firstName[0]}${user.lastName[0]}`.toUpperCase()
    : user?.email?.[0]?.toUpperCase() || "U";

  const userName = user?.firstName && user?.lastName
    ? `${user.firstName} ${user.lastName}`
    : user?.email || "Utente";

  const roleLabel = {
    SUPER_ADMIN: "Super Admin",
    COMPANY_ADMIN: "Amministratore",
    SALES_AGENT: "Agente",
    TECHNICIAN: "Tecnico",
  }[user?.role || "SALES_AGENT"];

  function handleLogout() {
    logout();
    window.location.href = "/login";
  }

  const { data: company, isLoading: companyLoading } = useQuery<Company>({
    queryKey: ["/api/company"],
  });

  const [companyForm, setCompanyForm] = useState({
    name: "",
    address: "",
    phone: "",
    email: "",
    vatNumber: "",
    fiscalCode: "",
    shareCapital: "",
    iban: "",
    logoUrl: "",
    pecEmail: "",
    website: "",
    rea: "",
    bankName: "",
    bankHolder: "",
    bankSwift: "",
    quoteValidityDays: "30",
    quoteFooterNotes: "",
    emailSubjectTemplate: "",
    emailBodyTemplate: "",
  });

  useEffect(() => {
    if (company) {
      setCompanyForm({
        name: company.name || "",
        address: company.address || "",
        phone: company.phone || "",
        email: company.email || "",
        vatNumber: company.vatNumber || "",
        fiscalCode: company.fiscalCode || "",
        shareCapital: company.shareCapital || "",
        iban: company.iban || "",
        logoUrl: company.logoUrl || "",
        pecEmail: company.pecEmail || "",
        website: company.website || "",
        rea: company.rea || "",
        bankName: company.bankName || "",
        bankHolder: company.bankHolder || "",
        bankSwift: company.bankSwift || "",
        quoteValidityDays: String(company.quoteValidityDays ?? 30),
        quoteFooterNotes: company.quoteFooterNotes || "",
        emailSubjectTemplate: company.emailSubjectTemplate || "",
        emailBodyTemplate: company.emailBodyTemplate || "",
      });
    }
  }, [company]);

  const updateCompanyMutation = useMutation({
    mutationFn: async (data: typeof companyForm) => {
      const response = await apiRequest("PUT", "/api/company", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/company"] });
      toast({
        title: "Salvato",
        description: "I dati aziendali sono stati aggiornati con successo.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Errore",
        description: error.message || "Impossibile salvare i dati aziendali.",
        variant: "destructive",
      });
    },
  });

  function handleCompanySubmit(e: React.FormEvent) {
    e.preventDefault();
    updateCompanyMutation.mutate(companyForm);
  }

  function handleCompanyChange(field: keyof typeof companyForm, value: string) {
    setCompanyForm((prev) => ({ ...prev, [field]: value }));
  }

  const [emailPreviewVars, setEmailPreviewVars] = useState({
    numero: "PRV-2026-0001",
    cliente: "Mario Rossi",
    oggetto: "Rifacimento copertura villetta",
    totale: "€ 12.450,00",
  });

  function handlePreviewVarChange(field: keyof typeof emailPreviewVars, value: string) {
    setEmailPreviewVars((prev) => ({ ...prev, [field]: value }));
  }

  // Profile image upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  const uploadImageMutation = useMutation({
    mutationFn: async (file: File) => {
      setUploadingImage(true);
      const formData = new FormData();
      formData.append("image", file);
      const token = getAuthToken();
      const response = await fetch("/api/users/profile-image", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || "Errore nel caricamento");
      }
      return response.json();
    },
    onSuccess: (data: any) => {
      updateUser({ profileImageUrl: data.profileImageUrl });
      toast({ title: "Immagine profilo aggiornata" });
      setUploadingImage(false);
    },
    onError: (error: Error) => {
      toast({ title: "Errore", description: error.message, variant: "destructive" });
      setUploadingImage(false);
    },
  });

  const removeImageMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("DELETE", "/api/users/profile-image");
      return response.json();
    },
    onSuccess: () => {
      updateUser({ profileImageUrl: null });
      toast({ title: "Immagine profilo rimossa" });
    },
    onError: (error: Error) => {
      toast({ title: "Errore", description: error.message, variant: "destructive" });
    },
  });

  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast({ title: "Errore", description: "L'immagine non deve superare i 5MB", variant: "destructive" });
        return;
      }
      uploadImageMutation.mutate(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // Profilo utente form
  const [profileForm, setProfileForm] = useState({
    displayName: "",
    contactEmail: "",
    phone: "",
  });

  useEffect(() => {
    if (user) {
      setProfileForm({
        displayName: (user as any).displayName || "",
        contactEmail: (user as any).contactEmail || "",
        phone: (user as any).phone || "",
      });
    }
  }, [user]);

  const updateProfileMutation = useMutation({
    mutationFn: async (data: typeof profileForm) => {
      const response = await apiRequest("PATCH", "/api/users/profile", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({
        title: "Salvato",
        description: "I dati del profilo sono stati aggiornati con successo.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Errore",
        description: error.message || "Impossibile salvare i dati del profilo.",
        variant: "destructive",
      });
    },
  });

  function handleProfileSubmit(e: React.FormEvent) {
    e.preventDefault();
    updateProfileMutation.mutate(profileForm);
  }

  function handleProfileChange(field: keyof typeof profileForm, value: string) {
    setProfileForm((prev) => ({ ...prev, [field]: value }));
  }

  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmNewPassword: "",
  });
  const [passwordError, setPasswordError] = useState("");

  const changePasswordMutation = useMutation({
    mutationFn: async (data: { currentPassword: string; newPassword: string }) => {
      const response = await apiRequest("POST", "/api/users/change-password", data);
      return response.json();
    },
    onSuccess: () => {
      setPasswordForm({ currentPassword: "", newPassword: "", confirmNewPassword: "" });
      setPasswordError("");
      toast({
        title: "Password aggiornata",
        description: "La tua password è stata cambiata con successo.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Errore",
        description: error.message || "Impossibile cambiare la password.",
        variant: "destructive",
      });
    },
  });

  function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError("");
    
    if (passwordForm.newPassword.length < 8) {
      setPasswordError("La password deve avere almeno 8 caratteri");
      return;
    }
    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(passwordForm.newPassword)) {
      setPasswordError("La password deve contenere almeno una maiuscola, una minuscola e un numero");
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmNewPassword) {
      setPasswordError("Le password non corrispondono");
      return;
    }
    changePasswordMutation.mutate({
      currentPassword: passwordForm.currentPassword,
      newPassword: passwordForm.newPassword,
    });
  }

  return (
    <DashboardLayout user={user!} fullWidth>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Impostazioni</h1>
          <p className="text-muted-foreground mt-1">
            Gestisci il tuo profilo e le preferenze
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <User className="w-5 h-5" />
              Profilo Utente
            </CardTitle>
            <CardDescription>
              Le informazioni del tuo account
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center gap-4">
              <div className="relative group">
                <Avatar className="w-16 h-16 cursor-pointer" onClick={() => fileInputRef.current?.click()} data-testid="button-avatar-upload">
                  <AvatarImage src={user?.profileImageUrl || undefined} alt={userName} />
                  <AvatarFallback className="text-lg">{userInitials}</AvatarFallback>
                </Avatar>
                <div
                  className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => fileInputRef.current?.click()}
                  style={{ visibility: uploadingImage ? "visible" : undefined }}
                >
                  {uploadingImage ? (
                    <Loader2 className="w-5 h-5 text-white animate-spin" />
                  ) : (
                    <Pencil className="w-5 h-5 text-white" />
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  onChange={handleImageSelect}
                  data-testid="input-profile-image"
                />
              </div>
              <div>
                <h3 className="text-lg font-medium" data-testid="text-user-name">{userName}</h3>
                <Badge variant="secondary" className="mt-1">{roleLabel}</Badge>
                <div className="flex items-center gap-2 mt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingImage}
                    data-testid="button-change-photo"
                  >
                    {uploadingImage ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Pencil className="w-3 h-3 mr-1" />}
                    {user?.profileImageUrl ? "Cambia foto" : "Carica foto"}
                  </Button>
                  {user?.profileImageUrl && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => removeImageMutation.mutate()}
                      disabled={removeImageMutation.isPending}
                      data-testid="button-remove-photo"
                    >
                      {removeImageMutation.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Trash2 className="w-3 h-3 mr-1" />}
                      Rimuovi
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Mail className="w-4 h-4" />
                  Email (Login)
                </div>
                <p className="text-sm font-medium" data-testid="text-user-email">
                  {user?.email || "Non disponibile"}
                </p>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="w-4 h-4" />
                  Membro dal
                </div>
                <p className="text-sm font-medium">
                  {user?.createdAt
                    ? format(new Date(user.createdAt), "d MMMM yyyy", { locale: it })
                    : "Non disponibile"}
                </p>
              </div>
            </div>

            <form onSubmit={handleProfileSubmit} className="space-y-4 pt-4 border-t">
              <p className="text-sm text-muted-foreground">
                Questi dati appariranno nei documenti e preventivi che crei
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="profile-display-name">
                    <FileText className="w-4 h-4 inline mr-1" />
                    Nome nei Documenti
                  </Label>
                  <Input
                    id="profile-display-name"
                    data-testid="input-profile-display-name"
                    value={profileForm.displayName}
                    onChange={(e) => handleProfileChange("displayName", e.target.value)}
                    placeholder={userName}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="profile-contact-email">
                    <Mail className="w-4 h-4 inline mr-1" />
                    Email di Contatto
                  </Label>
                  <Input
                    id="profile-contact-email"
                    data-testid="input-profile-contact-email"
                    type="email"
                    value={profileForm.contactEmail}
                    onChange={(e) => handleProfileChange("contactEmail", e.target.value)}
                    placeholder={user?.email || "email@esempio.it"}
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="profile-phone">
                    <Phone className="w-4 h-4 inline mr-1" />
                    Telefono
                  </Label>
                  <Input
                    id="profile-phone"
                    data-testid="input-profile-phone"
                    type="tel"
                    value={profileForm.phone}
                    onChange={(e) => handleProfileChange("phone", e.target.value)}
                    placeholder="+39 000 0000000"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <Button 
                  type="submit" 
                  disabled={updateProfileMutation.isPending}
                  data-testid="button-save-profile"
                >
                  {updateProfileMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4 mr-2" />
                  )}
                  Salva Profilo
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {isCompanyAdmin && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Building2 className="w-5 h-5" />
                Dati Aziendali
              </CardTitle>
              <CardDescription>
                Configura le informazioni aziendali che appariranno nei preventivi PDF
              </CardDescription>
            </CardHeader>
            <CardContent>
              {companyLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <form onSubmit={handleCompanySubmit} className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="company-name">Nome Azienda</Label>
                    <Input
                      id="company-name"
                      data-testid="input-company-name"
                      value={companyForm.name}
                      onChange={(e) => handleCompanyChange("name", e.target.value)}
                      placeholder="Nome Azienda S.R.L."
                      
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="company-address">
                      <MapPin className="w-4 h-4 inline mr-1" />
                      Indirizzo
                    </Label>
                    <Input
                      id="company-address"
                      data-testid="input-company-address"
                      value={companyForm.address}
                      onChange={(e) => handleCompanyChange("address", e.target.value)}
                      placeholder="Via Roma, 1 - 00100 Roma (RM)"
                      
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="company-phone">
                      <Phone className="w-4 h-4 inline mr-1" />
                      Telefono
                    </Label>
                    <Input
                      id="company-phone"
                      data-testid="input-company-phone"
                      value={companyForm.phone}
                      onChange={(e) => handleCompanyChange("phone", e.target.value)}
                      placeholder="+39 000 000 0000"
                      
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="company-email">
                      <Mail className="w-4 h-4 inline mr-1" />
                      Email
                    </Label>
                    <Input
                      id="company-email"
                      data-testid="input-company-email"
                      type="email"
                      value={companyForm.email}
                      onChange={(e) => handleCompanyChange("email", e.target.value)}
                      placeholder="info@azienda.it"
                      
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="company-vat">Partita IVA</Label>
                    <Input
                      id="company-vat"
                      data-testid="input-company-vat"
                      value={companyForm.vatNumber}
                      onChange={(e) => handleCompanyChange("vatNumber", e.target.value)}
                      placeholder="IT00000000000"
                      
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="company-fiscal">Codice Fiscale</Label>
                    <Input
                      id="company-fiscal"
                      data-testid="input-company-fiscal"
                      value={companyForm.fiscalCode}
                      onChange={(e) => handleCompanyChange("fiscalCode", e.target.value)}
                      placeholder="00000000000"
                      
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="company-capital">Capitale Sociale</Label>
                    <Input
                      id="company-capital"
                      data-testid="input-company-capital"
                      value={companyForm.shareCapital}
                      onChange={(e) => handleCompanyChange("shareCapital", e.target.value)}
                      placeholder="Euro 10.000,00 i.v."
                      
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="company-iban">
                      <CreditCard className="w-4 h-4 inline mr-1" />
                      IBAN
                    </Label>
                    <Input
                      id="company-iban"
                      data-testid="input-company-iban"
                      value={companyForm.iban}
                      onChange={(e) => handleCompanyChange("iban", e.target.value)}
                      placeholder="IT00A0000000000000000000000"
                      
                    />
                  </div>
                </div>

                <div className="pt-4 border-t space-y-2">
                  <Label htmlFor="company-logo-url">URL Logo (per PDF preventivo)</Label>
                  <Input
                    id="company-logo-url"
                    data-testid="input-company-logo-url"
                    value={companyForm.logoUrl}
                    onChange={(e) => handleCompanyChange("logoUrl", e.target.value)}
                    placeholder="https://.../logo.png"
                  />
                  <p className="text-xs text-muted-foreground">
                    Inserisci l'URL del logo aziendale. Apparirà nell'intestazione del preventivo PDF.
                  </p>
                  {companyForm.logoUrl && (
                    <img
                      src={companyForm.logoUrl}
                      alt="Anteprima logo"
                      className="h-16 w-auto mt-2 border rounded bg-white p-1"
                      data-testid="img-company-logo-preview"
                    />
                  )}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="company-pec">PEC</Label>
                    <Input
                      id="company-pec"
                      type="email"
                      data-testid="input-company-pec"
                      value={companyForm.pecEmail}
                      onChange={(e) => handleCompanyChange("pecEmail", e.target.value)}
                      placeholder="azienda@pec.it"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="company-website">Sito Web</Label>
                    <Input
                      id="company-website"
                      data-testid="input-company-website"
                      value={companyForm.website}
                      onChange={(e) => handleCompanyChange("website", e.target.value)}
                      placeholder="www.azienda.it"
                    />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="company-rea">REA</Label>
                    <Input
                      id="company-rea"
                      data-testid="input-company-rea"
                      value={companyForm.rea}
                      onChange={(e) => handleCompanyChange("rea", e.target.value)}
                      placeholder="VE-123456"
                    />
                  </div>
                </div>

                <div className="pt-4 border-t space-y-4">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    Dati Bancari
                  </h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="company-bank-name">Banca</Label>
                      <Input
                        id="company-bank-name"
                        data-testid="input-company-bank-name"
                        value={companyForm.bankName}
                        onChange={(e) => handleCompanyChange("bankName", e.target.value)}
                        placeholder="Es. Intesa Sanpaolo"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="company-bank-holder">Intestatario</Label>
                      <Input
                        id="company-bank-holder"
                        data-testid="input-company-bank-holder"
                        value={companyForm.bankHolder}
                        onChange={(e) => handleCompanyChange("bankHolder", e.target.value)}
                        placeholder="Es. GDM Lattonerie s.r.l."
                      />
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="company-bank-swift">SWIFT / BIC</Label>
                      <Input
                        id="company-bank-swift"
                        data-testid="input-company-bank-swift"
                        value={companyForm.bankSwift}
                        onChange={(e) => handleCompanyChange("bankSwift", e.target.value)}
                        placeholder="BCITITMM"
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t space-y-4">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    Preferenze Preventivo
                  </h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="company-validity">Validità preventivo (giorni)</Label>
                      <Input
                        id="company-validity"
                        type="number"
                        min={1}
                        max={365}
                        data-testid="input-company-validity-days"
                        value={companyForm.quoteValidityDays}
                        onChange={(e) =>
                          handleCompanyChange("quoteValidityDays", e.target.value)
                        }
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="company-footer-notes">Note in fondo al PDF</Label>
                    <Textarea
                      id="company-footer-notes"
                      data-testid="input-company-footer-notes"
                      value={companyForm.quoteFooterNotes}
                      onChange={(e) =>
                        handleCompanyChange("quoteFooterNotes", e.target.value)
                      }
                      rows={2}
                      placeholder="Testo libero che appare in fondo a ogni pagina del PDF preventivo"
                    />
                  </div>
                </div>

                <div className="pt-4 border-t space-y-4">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    Template Email
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Placeholder disponibili: <code>{`{numero}`}</code>, <code>{`{cliente}`}</code>,{" "}
                    <code>{`{oggetto}`}</code>, <code>{`{totale}`}</code>
                  </p>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="company-email-subject">Oggetto email</Label>
                        <Input
                          id="company-email-subject"
                          data-testid="input-company-email-subject"
                          value={companyForm.emailSubjectTemplate}
                          onChange={(e) =>
                            handleCompanyChange("emailSubjectTemplate", e.target.value)
                          }
                          placeholder="Preventivo {numero} — GDM Lattonerie"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="company-email-body">Corpo email</Label>
                        <Textarea
                          id="company-email-body"
                          data-testid="input-company-email-body"
                          value={companyForm.emailBodyTemplate}
                          onChange={(e) =>
                            handleCompanyChange("emailBodyTemplate", e.target.value)
                          }
                          rows={10}
                          placeholder={"Buongiorno,\n\nin allegato trovate il preventivo {numero}..."}
                        />
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                          Valori di esempio
                        </Label>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <div className="space-y-1">
                            <Label htmlFor="preview-var-numero" className="text-xs">{`{numero}`}</Label>
                            <Input
                              id="preview-var-numero"
                              data-testid="input-preview-var-numero"
                              value={emailPreviewVars.numero}
                              onChange={(e) => handlePreviewVarChange("numero", e.target.value)}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor="preview-var-cliente" className="text-xs">{`{cliente}`}</Label>
                            <Input
                              id="preview-var-cliente"
                              data-testid="input-preview-var-cliente"
                              value={emailPreviewVars.cliente}
                              onChange={(e) => handlePreviewVarChange("cliente", e.target.value)}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor="preview-var-oggetto" className="text-xs">{`{oggetto}`}</Label>
                            <Input
                              id="preview-var-oggetto"
                              data-testid="input-preview-var-oggetto"
                              value={emailPreviewVars.oggetto}
                              onChange={(e) => handlePreviewVarChange("oggetto", e.target.value)}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor="preview-var-totale" className="text-xs">{`{totale}`}</Label>
                            <Input
                              id="preview-var-totale"
                              data-testid="input-preview-var-totale"
                              value={emailPreviewVars.totale}
                              onChange={(e) => handlePreviewVarChange("totale", e.target.value)}
                            />
                          </div>
                        </div>
                      </div>
                      <div className="rounded-md border bg-muted/30 p-3 space-y-2">
                        <div>
                          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                            Anteprima oggetto
                          </Label>
                          <p
                            className="text-sm font-medium mt-1 break-words"
                            data-testid="text-email-preview-subject"
                          >
                            {applyTemplate(companyForm.emailSubjectTemplate, emailPreviewVars) || (
                              <span className="text-muted-foreground italic">(vuoto)</span>
                            )}
                          </p>
                        </div>
                        <div>
                          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                            Anteprima corpo
                          </Label>
                          <pre
                            className="text-sm mt-1 whitespace-pre-wrap break-words font-sans"
                            data-testid="text-email-preview-body"
                          >
                            {applyTemplate(companyForm.emailBodyTemplate, emailPreviewVars) || (
                              <span className="text-muted-foreground italic">(vuoto)</span>
                            )}
                          </pre>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end">
                    <Button 
                      type="submit" 
                      disabled={updateCompanyMutation.isPending}
                      data-testid="button-save-company"
                    >
                      {updateCompanyMutation.isPending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4 mr-2" />
                      )}
                      Salva Dati Aziendali
                    </Button>
                  </div>
              </form>
            )}
          </CardContent>
          </Card>
        )}

        <NotificationPreferencesSection userRole={user?.role || ""} />

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <KeyRound className="w-5 h-5" />
              Cambio Password
            </CardTitle>
            <CardDescription>
              Modifica la password del tuo account
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="current-password">Password Corrente</Label>
                <Input
                  id="current-password"
                  type="password"
                  data-testid="input-current-password"
                  value={passwordForm.currentPassword}
                  onChange={(e) => setPasswordForm(prev => ({ ...prev, currentPassword: e.target.value }))}
                  placeholder="Inserisci la password corrente"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="new-password">Nuova Password</Label>
                  <Input
                    id="new-password"
                    type="password"
                    data-testid="input-new-password"
                    value={passwordForm.newPassword}
                    onChange={(e) => setPasswordForm(prev => ({ ...prev, newPassword: e.target.value }))}
                    placeholder="Min. 8 caratteri, 1 maiusc., 1 num."
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-new-password">Conferma Nuova Password</Label>
                  <Input
                    id="confirm-new-password"
                    type="password"
                    data-testid="input-confirm-new-password"
                    value={passwordForm.confirmNewPassword}
                    onChange={(e) => setPasswordForm(prev => ({ ...prev, confirmNewPassword: e.target.value }))}
                    placeholder="Ripeti la nuova password"
                  />
                </div>
              </div>
              {passwordError && (
                <p className="text-sm text-destructive" data-testid="text-password-error">{passwordError}</p>
              )}
              <div className="flex justify-end">
                <Button
                  type="submit"
                  disabled={changePasswordMutation.isPending || !passwordForm.currentPassword || !passwordForm.newPassword}
                  data-testid="button-change-password"
                >
                  {changePasswordMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <KeyRound className="w-4 h-4 mr-2" />
                  )}
                  Cambia Password
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Account</CardTitle>
            <CardDescription>
              Gestisci la tua sessione
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              variant="destructive" 
              onClick={handleLogout}
              data-testid="button-logout-settings"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Esci dall'account
            </Button>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
