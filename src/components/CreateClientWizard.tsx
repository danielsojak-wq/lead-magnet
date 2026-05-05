import { useState, useCallback, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, ArrowRight, ArrowLeft, Check, RefreshCw, Upload, Eye, EyeOff, Copy, BarChart3, ShoppingCart, CheckCircle2, XCircle, Loader2, ExternalLink } from "lucide-react";

type Section = "leadgen" | "ecommerce";

interface StepDef {
  id: string;
  label: string;
  sections: Section[];
}

const ALL_STEPS: StepDef[] = [
  { id: "type", label: "Typ klienta", sections: ["leadgen", "ecommerce"] },
  { id: "basic", label: "Základní info", sections: ["leadgen", "ecommerce"] },
  { id: "sources", label: "Zdroje dat", sections: ["leadgen"] },
  { id: "eshop-sources", label: "Zdroje dat", sections: ["ecommerce"] },
  { id: "lead-mapping", label: "Mapování leadů", sections: ["leadgen"] },
  { id: "crm", label: "CRM nastavení", sections: ["leadgen"] },
  { id: "logo", label: "Logo", sections: ["leadgen", "ecommerce"] },
  { id: "summary", label: "Shrnutí", sections: ["leadgen", "ecommerce"] },
];

function colLetterToIndex(letter: string): number {
  const l = letter.toUpperCase().trim();
  if (!l || !/^[A-Z]+$/.test(l)) return -1;
  let idx = 0;
  for (let i = 0; i < l.length; i++) {
    idx = idx * 26 + (l.charCodeAt(i) - 64);
  }
  return idx - 1;
}

interface CustomColumn {
  id: string;
  name: string;
  column: string;
}

interface QualificationValue {
  value: string;
  isQualified: boolean;
}

interface UrlVerification {
  status: "idle" | "verifying" | "ok" | "error";
  message?: string;
  rowCount?: number;
  headers?: string[];
}

function generatePassword(length = 12): string {
  const chars = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(crypto.getRandomValues(new Uint8Array(length)))
    .map((b) => chars[b % chars.length])
    .join("");
}

function VerifiedUrlInput({
  url,
  onChange,
  onRemove,
  canRemove,
  verification,
  onVerify,
  placeholder,
}: {
  url: string;
  onChange: (value: string) => void;
  onRemove?: () => void;
  canRemove: boolean;
  verification: UrlVerification;
  onVerify: () => void;
  placeholder?: string;
}) {
  const hasUrl = url.trim().length > 0;
  const needsVerification = hasUrl && (verification.status === "idle" || verification.status === "error");

  return (
    <div className="space-y-1.5">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            value={url}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder || "https://docs.google.com/spreadsheets/d/..."}
            className={`text-xs pr-8 ${
              verification.status === "ok" ? "border-green-500/50 bg-green-50/50" :
              verification.status === "error" ? "border-destructive/50 bg-destructive/5" : ""
            }`}
          />
          {verification.status === "ok" && (
            <CheckCircle2 className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-green-600" />
          )}
          {verification.status === "error" && (
            <XCircle className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-destructive" />
          )}
        </div>
        {hasUrl && (
          <Button
            type="button"
            variant={verification.status === "ok" ? "outline" : "default"}
            size="sm"
            onClick={onVerify}
            disabled={verification.status === "verifying"}
            className="gap-1.5 shrink-0"
          >
            {verification.status === "verifying" ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Ověřuji…</>
            ) : verification.status === "ok" ? (
              <><CheckCircle2 className="h-3.5 w-3.5" /> OK</>
            ) : (
              <><ExternalLink className="h-3.5 w-3.5" /> Ověřit</>
            )}
          </Button>
        )}
        {canRemove && (
          <Button variant="ghost" size="icon" onClick={onRemove}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        )}
      </div>
      {verification.status === "ok" && verification.rowCount !== undefined && (
        <div className="flex items-center gap-2 text-xs text-green-700">
          <CheckCircle2 className="h-3 w-3" />
          <span>Načteno {verification.rowCount} řádků, {verification.headers?.length || 0} sloupců</span>
          {verification.headers && verification.headers.length > 0 && (
            <span className="text-muted-foreground truncate">({verification.headers.slice(0, 5).join(", ")}{verification.headers.length > 5 ? "…" : ""})</span>
          )}
        </div>
      )}
      {verification.status === "error" && verification.message && (
        <div className="flex items-start gap-2 text-xs text-destructive">
          <XCircle className="h-3 w-3 mt-0.5 shrink-0" />
          <span>{verification.message}</span>
        </div>
      )}
    </div>
  );
}

interface CreateClientWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultSection?: Section;
}

export function CreateClientWizard({ open, onOpenChange, defaultSection }: CreateClientWizardProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [section, setSection] = useState<Section>(defaultSection || "leadgen");

  // Basic info
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState(() => generatePassword());
  const [showPassword, setShowPassword] = useState(true);

  // Leadgen data sources
  const [leadUrls, setLeadUrls] = useState<string[]>([""]);
  const [costUrls, setCostUrls] = useState<string[]>([""]);
  const [webFilter, setWebFilter] = useState("");

  // Ecommerce data sources
  const [eshopCostUrls, setEshopCostUrls] = useState<string[]>([""]);
  const [eshopCurrency, setEshopCurrency] = useState<"CZK" | "EUR">("CZK");

  // URL verifications: keyed by "type-index" e.g. "lead-0", "cost-1", "eshop-0"
  const [urlVerifications, setUrlVerifications] = useState<Record<string, UrlVerification>>({});

  const getVerification = (key: string): UrlVerification => urlVerifications[key] || { status: "idle" };

  const verifyUrl = async (key: string, url: string) => {
    if (!url.trim()) return;
    setUrlVerifications((prev) => ({ ...prev, [key]: { status: "verifying" } }));
    try {
      const { data, error } = await supabase.functions.invoke("validate-sheet-url", {
        body: { url },
      });
      if (error) throw error;
      if (data.ok) {
        setUrlVerifications((prev) => ({
          ...prev,
          [key]: { status: "ok", rowCount: data.rowCount, headers: data.headers },
        }));
      } else {
        setUrlVerifications((prev) => ({
          ...prev,
          [key]: { status: "error", message: data.message || "Neznámá chyba" },
        }));
      }
    } catch (err: any) {
      setUrlVerifications((prev) => ({
        ...prev,
        [key]: { status: "error", message: err.message || "Nepodařilo se ověřit URL" },
      }));
    }
  };

  const handleUrlChange = (list: string[], setter: (v: string[]) => void, index: number, value: string, prefix: string) => {
    const copy = [...list];
    copy[index] = value;
    setter(copy);
    // Reset verification when URL changes
    const key = `${prefix}-${index}`;
    setUrlVerifications((prev) => ({ ...prev, [key]: { status: "idle" } }));
  };
  // Lead column mapping
  const [colSubmissionId, setColSubmissionId] = useState("A");
  const [colDate, setColDate] = useState("B");
  const [nameSplit, setNameSplit] = useState(false);
  const [colFirstName, setColFirstName] = useState("C");
  const [colLastName, setColLastName] = useState("");
  const [colPhone, setColPhone] = useState("D");
  const [colQualified, setColQualified] = useState("E");
  const [qualificationValues, setQualificationValues] = useState<QualificationValue[]>([
    { value: "ano", isQualified: true },
    { value: "ne", isQualified: false },
  ]);
  const [defaultQualified, setDefaultQualified] = useState("ne");
  const [customColumns, setCustomColumns] = useState<CustomColumn[]>([]);

  // CRM
  const [crmWritebackUrl, setCrmWritebackUrl] = useState("");

  // Logo
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  const steps = useMemo(() => ALL_STEPS.filter((s) => s.sections.includes(section)), [section]);

  const resetForm = useCallback(() => {
    setStep(0);
    setSection(defaultSection || "leadgen");
    setName("");
    setDisplayName("");
    setPassword(generatePassword());
    setShowPassword(true);
    setLeadUrls([""]);
    setCostUrls([""]);
    setEshopCostUrls([""]);
    setEshopCurrency("CZK");
    setWebFilter("");
    setColSubmissionId("A");
    setColDate("B");
    setNameSplit(false);
    setColFirstName("C");
    setColLastName("");
    setColPhone("D");
    setColQualified("E");
    setQualificationValues([
      { value: "ano", isQualified: true },
      { value: "ne", isQualified: false },
    ]);
    setDefaultQualified("ne");
    setCustomColumns([]);
    setCrmWritebackUrl("");
    setLogoFile(null);
    setLogoPreview(null);
    setUrlVerifications({});
  }, [defaultSection]);

  const buildLeadColumns = () => {
    const cols: Record<string, number> = {
      submissionId: colLetterToIndex(colSubmissionId),
      date: colLetterToIndex(colDate),
      firstName: colLetterToIndex(colFirstName),
      phone: colLetterToIndex(colPhone),
      qualified: colLetterToIndex(colQualified),
    };
    if (nameSplit && colLastName) {
      cols.lastName = colLetterToIndex(colLastName);
    }
    return cols;
  };

  const buildQualificationConfig = () => {
    const qualifiedValues = qualificationValues.filter((q) => q.isQualified).map((q) => q.value);
    const notQualifiedValues = qualificationValues.filter((q) => !q.isQualified).map((q) => q.value);
    return { qualified_values: qualifiedValues, not_qualified_values: notQualifiedValues };
  };

  const buildCustomColumnsConfig = () => {
    return customColumns
      .filter((c) => c.name.trim() && c.column.trim())
      .map((c) => ({ name: c.name, column: colLetterToIndex(c.column) }));
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const isEcommerce = section === "ecommerce";
      const clientPassword = isEcommerce ? generatePassword(20) : password;

      const bodyBase: Record<string, unknown> = {
        name,
        displayName: displayName || undefined,
        password: clientPassword,
        section,
      };

      if (!isEcommerce) {
        const leadColumns = buildLeadColumns();
        const qualConfig = buildQualificationConfig();
        const customCols = buildCustomColumnsConfig();
        Object.assign(bodyBase, {
          leadUrls: leadUrls.filter((u) => u.trim()),
          leadColumns,
          costUrls: costUrls.filter((u) => u.trim()),
          webFilter: webFilter || undefined,
          defaultQualified,
          qualificationConfig: qualConfig,
          nameSplit,
          customColumns: customCols.length > 0 ? customCols : undefined,
          crmWritebackUrl: crmWritebackUrl || undefined,
        });
      } else {
        Object.assign(bodyBase, {
          costUrls: eshopCostUrls.filter((u) => u.trim()),
          eshopCurrency,
        });
      }

      const { data, error } = await supabase.functions.invoke("create-client", {
        body: bodyBase,
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (logoFile && data?.slug) {
        const ext = logoFile.name.split(".").pop() || "png";
        const path = `${data.slug}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("client-logos")
          .upload(path, logoFile, { upsert: true });
        if (uploadError) console.warn("Logo upload failed:", uploadError.message);
      }

      return data;
    },
    onSuccess: () => {
      toast({ description: `Klient „${displayName || name}" byl vytvořen` });
      queryClient.invalidateQueries({ queryKey: ["admin-overview"] });
      queryClient.invalidateQueries({ queryKey: ["eshop-clients"] });
      queryClient.invalidateQueries({ queryKey: ["clients-hub"] });
      onOpenChange(false);
      resetForm();
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message });
    },
  });

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setLogoFile(file);
      const reader = new FileReader();
      reader.onload = (ev) => setLogoPreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  const addUrl = (list: string[], setter: (v: string[]) => void) => {
    setter([...list, ""]);
  };


  const removeUrl = (list: string[], setter: (v: string[]) => void, index: number, prefix: string) => {
    setter(list.filter((_, i) => i !== index));
    // Clean up verifications and re-index
    setUrlVerifications((prev) => {
      const next = { ...prev };
      delete next[`${prefix}-${index}`];
      return next;
    });
  };

  const allUrlsVerified = (urls: string[], prefix: string): boolean => {
    const nonEmpty = urls.filter((u) => u.trim());
    if (nonEmpty.length === 0) return true; // no URLs = nothing to verify
    return nonEmpty.every((_, i) => {
      const realIndex = urls.indexOf(nonEmpty[i]);
      return getVerification(`${prefix}-${realIndex}`).status === "ok";
    });
  };

  const canProceed = () => {
    const currentStepId = steps[step]?.id;
    switch (currentStepId) {
      case "basic":
        if (section === "ecommerce") return name.trim().length > 0;
        return name.trim().length > 0 && password.length >= 6;
      case "sources": {
        const hasLeadUrl = leadUrls.some((u) => u.trim());
        if (!hasLeadUrl) return true; // optional
        return allUrlsVerified(leadUrls, "lead") && allUrlsVerified(costUrls, "cost");
      }
      case "eshop-sources": {
        const hasEshopUrl = eshopCostUrls.some((u) => u.trim());
        if (!hasEshopUrl) return true;
        return allUrlsVerified(eshopCostUrls, "eshop");
      }
      default:
        return true;
    }
  };

  const addQualificationValue = () => {
    setQualificationValues([...qualificationValues, { value: "", isQualified: false }]);
  };

  const addCustomColumn = () => {
    setCustomColumns([...customColumns, { id: crypto.randomUUID(), name: "", column: "" }]);
  };

  const renderStep = () => {
    const currentStepId = steps[step]?.id;

    switch (currentStepId) {
      case "type":
        return (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Vyberte typ klienta, který chcete vytvořit.</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setSection("leadgen")}
                className={`flex flex-col items-center gap-3 rounded-xl border-2 p-6 transition-all hover:shadow-md ${
                  section === "leadgen"
                    ? "border-primary bg-primary/5 shadow-sm"
                    : "border-border bg-card hover:border-muted-foreground/30"
                }`}
              >
                <div className={`rounded-lg p-3 ${section === "leadgen" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                  <BarChart3 className="h-6 w-6" />
                </div>
                <div className="text-center">
                  <div className="font-semibold text-sm">Lead Generation</div>
                  <p className="text-xs text-muted-foreground mt-1">Sběr a správa poptávek, CRM, přístup klienta do dashboardu</p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setSection("ecommerce")}
                className={`flex flex-col items-center gap-3 rounded-xl border-2 p-6 transition-all hover:shadow-md ${
                  section === "ecommerce"
                    ? "border-primary bg-primary/5 shadow-sm"
                    : "border-border bg-card hover:border-muted-foreground/30"
                }`}
              >
                <div className={`rounded-lg p-3 ${section === "ecommerce" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                  <ShoppingCart className="h-6 w-6" />
                </div>
                <div className="text-center">
                  <div className="font-semibold text-sm">E-commerce</div>
                  <p className="text-xs text-muted-foreground mt-1">Sledování rozpočtů reklamních kampaní, bez přístupu klienta</p>
                </div>
              </button>
            </div>
          </div>
        );

      case "basic":
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Název klienta {section === "leadgen" && "(login)"} *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="např. neoflam" />
              <p className="text-xs text-muted-foreground">
                {section === "leadgen" ? "Používá se pro přihlášení klienta" : "Interní identifikátor klienta"}
              </p>
            </div>
            <div className="space-y-2">
              <Label>Zobrazovaný název</Label>
              <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="např. Neoflam CZ" />
              <p className="text-xs text-muted-foreground">Volitelné – zobrazí se v dashboardu</p>
            </div>
            {section === "leadgen" && (
              <div className="space-y-2">
                <Label>Heslo *</Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <Button type="button" variant="outline" size="icon" onClick={() => setPassword(generatePassword())} title="Generovat nové">
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                  <Button type="button" variant="outline" size="icon" onClick={() => { navigator.clipboard.writeText(password); toast({ description: "Heslo zkopírováno" }); }} title="Kopírovat">
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Min. 6 znaků. Automaticky vygenerované, můžete přepsat.</p>
              </div>
            )}
            {section === "ecommerce" && (
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">
                  💡 E-commerce klienti nemají vlastní přístup do dashboardu. Data jsou viditelná pouze pro account managery a adminy.
                </p>
              </div>
            )}
          </div>
        );

      case "sources":
        return (
          <div className="space-y-6">
            <div className="space-y-3">
              <Label className="text-sm font-semibold">Google Sheets – Leady (poptávky)</Label>
              <p className="text-xs text-muted-foreground">Vložte odkaz na Google Sheet a ověřte jeho dostupnost.</p>
              {leadUrls.map((url, i) => (
                <VerifiedUrlInput
                  key={i}
                  url={url}
                  onChange={(v) => handleUrlChange(leadUrls, setLeadUrls, i, v, "lead")}
                  onRemove={() => removeUrl(leadUrls, setLeadUrls, i, "lead")}
                  canRemove={leadUrls.length > 1}
                  verification={getVerification(`lead-${i}`)}
                  onVerify={() => verifyUrl(`lead-${i}`, url)}
                />
              ))}
              <Button variant="outline" size="sm" onClick={() => addUrl(leadUrls, setLeadUrls)} className="gap-1.5">
                <Plus className="h-3.5 w-3.5" /> Přidat zdroj leadů
              </Button>
            </div>

            <div className="space-y-3">
              <Label className="text-sm font-semibold">Google Sheets – Marketingové náklady</Label>
              {costUrls.map((url, i) => (
                <VerifiedUrlInput
                  key={i}
                  url={url}
                  onChange={(v) => handleUrlChange(costUrls, setCostUrls, i, v, "cost")}
                  onRemove={() => removeUrl(costUrls, setCostUrls, i, "cost")}
                  canRemove={costUrls.length > 1}
                  verification={getVerification(`cost-${i}`)}
                  onVerify={() => verifyUrl(`cost-${i}`, url)}
                />
              ))}
              <Button variant="outline" size="sm" onClick={() => addUrl(costUrls, setCostUrls)} className="gap-1.5">
                <Plus className="h-3.5 w-3.5" /> Přidat zdroj nákladů
              </Button>
            </div>

            <div className="space-y-2">
              <Label>Web filtr (volitelné)</Label>
              <Input value={webFilter} onChange={(e) => setWebFilter(e.target.value)} placeholder="např. neoflam.cz" />
              <p className="text-xs text-muted-foreground">Pokud sdílíte jeden sheet s více klienty, filtruje podle sloupce „web"</p>
            </div>
          </div>
        );

      case "eshop-sources":
        return (
          <div className="space-y-6">
            <div className="space-y-3">
              <Label className="text-sm font-semibold">Google Sheets – Reklamní náklady</Label>
              <p className="text-xs text-muted-foreground">
                Vložte odkaz na Google Sheet s denními náklady na reklamu a ověřte jeho dostupnost.
              </p>
              {eshopCostUrls.map((url, i) => (
                <VerifiedUrlInput
                  key={i}
                  url={url}
                  onChange={(v) => handleUrlChange(eshopCostUrls, setEshopCostUrls, i, v, "eshop")}
                  onRemove={() => removeUrl(eshopCostUrls, setEshopCostUrls, i, "eshop")}
                  canRemove={eshopCostUrls.length > 1}
                  verification={getVerification(`eshop-${i}`)}
                  onVerify={() => verifyUrl(`eshop-${i}`, url)}
                />
              ))}
              <Button variant="outline" size="sm" onClick={() => addUrl(eshopCostUrls, setEshopCostUrls)} className="gap-1.5">
                <Plus className="h-3.5 w-3.5" /> Přidat zdroj
              </Button>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-semibold">Měna nákladů</Label>
              <p className="text-xs text-muted-foreground">
                Vyberte měnu, ve které jsou náklady v tabulce uvedeny.
              </p>
              <Select value={eshopCurrency} onValueChange={(v) => setEshopCurrency(v as "CZK" | "EUR")}>
                <SelectTrigger className="h-9 w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CZK">CZK (Kč)</SelectItem>
                  <SelectItem value="EUR">EUR (€)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        );

      case "lead-mapping":
        return (
          <div className="space-y-5">
            <p className="text-sm text-muted-foreground">
              Zadejte písmeno sloupce v Google Sheetu (A, B, C…) kde se nachází daný údaj.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">ID záznamu</Label>
                <Input
                  value={colSubmissionId}
                  onChange={(e) => setColSubmissionId(e.target.value.toUpperCase())}
                  placeholder="A"
                  className="h-9 uppercase font-mono"
                  maxLength={2}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Datum</Label>
                <Input
                  value={colDate}
                  onChange={(e) => setColDate(e.target.value.toUpperCase())}
                  placeholder="B"
                  className="h-9 uppercase font-mono"
                  maxLength={2}
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Switch checked={nameSplit} onCheckedChange={setNameSplit} />
                <Label className="text-xs">Jméno a příjmení v oddělených sloupcích</Label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">{nameSplit ? "Jméno" : "Jméno (celé)"}</Label>
                  <Input
                    value={colFirstName}
                    onChange={(e) => setColFirstName(e.target.value.toUpperCase())}
                    placeholder="C"
                    className="h-9 uppercase font-mono"
                    maxLength={2}
                  />
                </div>
                {nameSplit && (
                  <div className="space-y-1">
                    <Label className="text-xs">Příjmení</Label>
                    <Input
                      value={colLastName}
                      onChange={(e) => setColLastName(e.target.value.toUpperCase())}
                      placeholder="D"
                      className="h-9 uppercase font-mono"
                      maxLength={2}
                    />
                  </div>
                )}
                <div className="space-y-1">
                  <Label className="text-xs">Telefon</Label>
                  <Input
                    value={colPhone}
                    onChange={(e) => setColPhone(e.target.value.toUpperCase())}
                    placeholder={nameSplit ? "E" : "D"}
                    className="h-9 uppercase font-mono"
                    maxLength={2}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-3 border-t border-border pt-4">
              <Label className="text-xs font-semibold">Kvalifikace</Label>
              <div className="space-y-1">
                <Label className="text-xs">Sloupec kvalifikace</Label>
                <Input
                  value={colQualified}
                  onChange={(e) => setColQualified(e.target.value.toUpperCase())}
                  placeholder="E"
                  className="h-9 uppercase font-mono w-24"
                  maxLength={2}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Hodnoty a jejich význam</Label>
                <div className="space-y-2">
                  {qualificationValues.map((qv, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        value={qv.value}
                        onChange={(e) => {
                          const copy = [...qualificationValues];
                          copy[i] = { ...copy[i], value: e.target.value };
                          setQualificationValues(copy);
                        }}
                        placeholder="hodnota v sheetu"
                        className="h-8 flex-1 text-sm"
                      />
                      <Select
                        value={qv.isQualified ? "qualified" : "not_qualified"}
                        onValueChange={(v) => {
                          const copy = [...qualificationValues];
                          copy[i] = { ...copy[i], isQualified: v === "qualified" };
                          setQualificationValues(copy);
                        }}
                      >
                        <SelectTrigger className="h-8 w-40 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="qualified"><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-green-500" />Kvalifikovaný</span></SelectItem>
                          <SelectItem value="not_qualified"><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-destructive" />Nekvalifikovaný</span></SelectItem>
                        </SelectContent>
                      </Select>
                      {qualificationValues.length > 1 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0"
                          onClick={() => setQualificationValues(qualificationValues.filter((_, j) => j !== i))}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
                <Button variant="outline" size="sm" onClick={addQualificationValue} className="gap-1.5 text-xs">
                  <Plus className="h-3 w-3" /> Přidat hodnotu
                </Button>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Výchozí (pokud je pole prázdné)</Label>
                <Select value={defaultQualified} onValueChange={setDefaultQualified}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="qualified">Kvalifikovaný</SelectItem>
                    <SelectItem value="not_qualified">Nekvalifikovaný</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-3 border-t border-border pt-4">
              <Label className="text-xs font-semibold">Další sloupce (volitelné)</Label>
              <p className="text-xs text-muted-foreground">
                Přidejte vlastní sloupce – propíšou se i do CRM.
              </p>
              {customColumns.map((col) => (
                <div key={col.id} className="flex items-center gap-2">
                  <Input
                    value={col.name}
                    onChange={(e) =>
                      setCustomColumns(customColumns.map((c) => c.id === col.id ? { ...c, name: e.target.value } : c))
                    }
                    placeholder="Název pole (např. Firma)"
                    className="h-8 flex-1 text-sm"
                  />
                  <Input
                    value={col.column}
                    onChange={(e) =>
                      setCustomColumns(customColumns.map((c) => c.id === col.id ? { ...c, column: e.target.value.toUpperCase() } : c))
                    }
                    placeholder="Sloupec"
                    className="h-8 w-20 uppercase font-mono text-sm"
                    maxLength={2}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={() => setCustomColumns(customColumns.filter((c) => c.id !== col.id))}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addCustomColumn} className="gap-1.5 text-xs">
                <Plus className="h-3 w-3" /> Přidat sloupec
              </Button>
            </div>
          </div>
        );

      case "crm":
        return (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Nastavte URL pro automatický zápis hodnocení leadů zpět do Google Sheets.
            </p>

            <div className="space-y-2">
              <Label className="text-xs font-semibold">Pole propsaná do CRM</Label>
              <div className="flex gap-1.5 flex-wrap">
                <Badge variant="secondary" className="text-xs">Jméno (sl. {colFirstName})</Badge>
                {nameSplit && colLastName && <Badge variant="secondary" className="text-xs">Příjmení (sl. {colLastName})</Badge>}
                <Badge variant="secondary" className="text-xs">Telefon (sl. {colPhone})</Badge>
                <Badge variant="secondary" className="text-xs">Datum (sl. {colDate})</Badge>
                {customColumns.filter((c) => c.name && c.column).map((c) => (
                  <Badge key={c.id} variant="secondary" className="text-xs">{c.name} (sl. {c.column})</Badge>
                ))}
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <Label className="text-xs">Apps Script URL pro zápis (volitelné)</Label>
              <Input
                value={crmWritebackUrl}
                onChange={(e) => setCrmWritebackUrl(e.target.value)}
                placeholder="https://script.google.com/macros/s/.../exec"
                className="text-xs"
              />
              <p className="text-xs text-muted-foreground">URL pro automatický zápis hodnocení leadů zpět do Google Sheets</p>
            </div>
          </div>
        );

      case "logo":
        return (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Nahrajte logo klienta ve formátu PNG bez pozadí. Logo se zobrazí v přehledu a dashboardu.</p>
            <div className="flex flex-col items-center gap-4">
              {logoPreview ? (
                <div className="relative group">
                  <div className="w-32 h-32 rounded-xl border-2 border-dashed border-border bg-muted/30 flex items-center justify-center p-4">
                    <img src={logoPreview} alt="Logo preview" className="max-w-full max-h-full object-contain" />
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute -top-2 -right-2 h-7 w-7 rounded-full bg-destructive text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => { setLogoFile(null); setLogoPreview(null); }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <label className="w-32 h-32 rounded-xl border-2 border-dashed border-border bg-muted/30 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-primary/50 hover:bg-muted/50 transition-colors">
                  <Upload className="h-6 w-6 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Nahrát logo</span>
                  <input type="file" accept="image/png,image/webp" className="hidden" onChange={handleLogoChange} />
                </label>
              )}
              <p className="text-xs text-muted-foreground">Doporučení: PNG, průhledné pozadí, min. 200×200px</p>
            </div>
          </div>
        );

      case "summary": {
        const isEcommerce = section === "ecommerce";
        const qualifiedLabels = qualificationValues.filter((q) => q.isQualified).map((q) => q.value).join(", ") || "—";
        const notQualifiedLabels = qualificationValues.filter((q) => !q.isQualified).map((q) => q.value).join(", ") || "—";
        return (
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Typ</span>
                <Badge variant="outline" className="text-xs">
                  {isEcommerce ? "E-commerce" : "Lead Generation"}
                </Badge>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Název</span>
                <span className="font-medium">{displayName || name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Login</span>
                <span className="font-mono text-xs">{name}</span>
              </div>
              {!isEcommerce && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Heslo</span>
                  <span className="font-mono text-xs">{password}</span>
                </div>
              )}
              {isEcommerce && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Přístup klienta</span>
                  <span className="text-xs text-muted-foreground">Bez přístupu</span>
                </div>
              )}
              <div className="h-px bg-border" />

              {!isEcommerce && (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Zdroje leadů</span>
                    <span>{leadUrls.filter((u) => u.trim()).length} URL</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Zdroje nákladů</span>
                    <span>{costUrls.filter((u) => u.trim()).length} URL</span>
                  </div>
                  {webFilter && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Web filtr</span>
                      <span>{webFilter}</span>
                    </div>
                  )}
                  <div className="h-px bg-border" />
                  <div className="text-sm space-y-1">
                    <span className="text-muted-foreground">Mapování sloupců</span>
                    <div className="flex gap-1.5 flex-wrap mt-1">
                      <Badge variant="outline" className="text-xs font-mono">ID: {colSubmissionId}</Badge>
                      <Badge variant="outline" className="text-xs font-mono">Datum: {colDate}</Badge>
                      <Badge variant="outline" className="text-xs font-mono">
                        {nameSplit ? `Jméno: ${colFirstName}, Příjmení: ${colLastName}` : `Jméno: ${colFirstName}`}
                      </Badge>
                      <Badge variant="outline" className="text-xs font-mono">Tel: {colPhone}</Badge>
                      <Badge variant="outline" className="text-xs font-mono">Kval: {colQualified}</Badge>
                      {customColumns.filter((c) => c.name && c.column).map((c) => (
                        <Badge key={c.id} variant="outline" className="text-xs font-mono">{c.name}: {c.column}</Badge>
                      ))}
                    </div>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Kvalifikovaný =</span>
                    <span className="text-xs">{qualifiedLabels}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Nekvalifikovaný =</span>
                    <span className="text-xs">{notQualifiedLabels}</span>
                  </div>
                </>
              )}

              {isEcommerce && (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Zdroje nákladů</span>
                    <span>{eshopCostUrls.filter((u) => u.trim()).length} URL</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Měna</span>
                    <span>{eshopCurrency === "EUR" ? "EUR (€)" : "CZK (Kč)"}</span>
                  </div>
                </>
              )}

              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Logo</span>
                <span className="flex items-center gap-1">{logoFile ? <><span className="h-2 w-2 rounded-full bg-green-500" />Nahráno</> : "—"}</span>
              </div>
            </div>
          </div>
        );
      }
    }
  };

  // When section changes on the type step, reset to step 0 to recalculate steps
  const handleSectionChange = (newSection: Section) => {
    setSection(newSection);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-[540px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nový klient</DialogTitle>
          <DialogDescription>
            {steps[step]?.label} — krok {step + 1} z {steps.length}
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-1 mb-2">
          {steps.map((s, i) => (
            <div
              key={s.id}
              className={`h-1 flex-1 rounded-full transition-colors ${
                i <= step ? "bg-primary" : "bg-muted"
              }`}
            />
          ))}
        </div>

        {renderStep()}

        <div className="flex justify-between pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setStep(step - 1)}
            disabled={step === 0}
            className="gap-1.5"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Zpět
          </Button>

          {step < steps.length - 1 ? (
            <Button
              size="sm"
              onClick={() => setStep(step + 1)}
              disabled={!canProceed()}
              className="gap-1.5"
            >
              Další <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending}
              className="gap-1.5"
            >
              {createMutation.isPending ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Vytvářím…
                </>
              ) : (
                <>
                  <Check className="h-3.5 w-3.5" /> Vytvořit klienta
                </>
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
