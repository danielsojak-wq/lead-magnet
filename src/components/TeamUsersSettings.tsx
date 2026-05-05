import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  UserPlus,
  Trash2,
  ArrowRight,
  ArrowLeft,
  Check,
  Shield,
  Briefcase,
  Star,
  Megaphone,
  BarChart3,
  ShoppingCart,
  Sparkles,
  Users,
  Settings,
  Pencil,
  RefreshCw,
  Mail,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { PageSpinner } from "@/components/ui/spinner";

// ─── Types ──────────────────────────────────────────────────────────────────

interface TeamUser {
  id: string;
  email: string;
  role: string;
  display_name: string | null;
  linked_am_id: string | null;
  permissions?: string[];
}

interface AccountManager {
  id: string;
  display_name: string | null;
  username: string;
}

// ─── Config ─────────────────────────────────────────────────────────────────

type RoleId = "admin" | "account_manager" | "specialist" | "marketing";

interface RoleConfig {
  label: string;
  description: string;
  badgeClass: string;
  avatarClass: string;
  icon: React.ComponentType<{ className?: string }>;
  defaultPermissions: string[];
}

const ROLE_CONFIG: Record<RoleId, RoleConfig> = {
  admin: {
    label: "Admin",
    description: "Plný přístup ke všem sekcím a nastavením",
    badgeClass: "border-red-200 text-red-700 bg-red-50",
    avatarClass: "bg-red-100 text-red-700",
    icon: Shield,
    defaultPermissions: ["leadgen", "ecommerce", "creative", "clients", "settings"],
  },
  account_manager: {
    label: "Account Manager",
    description: "Správa klientů, přístup ke všem výkonnostním sekcím",
    badgeClass: "border-blue-200 text-blue-700 bg-blue-50",
    avatarClass: "bg-blue-100 text-blue-700",
    icon: Briefcase,
    defaultPermissions: ["leadgen", "ecommerce", "creative", "clients"],
  },
  specialist: {
    label: "Specialista",
    description: "Přístup k vybraným sekcím dle individuálního nastavení",
    badgeClass: "border-emerald-200 text-emerald-700 bg-emerald-50",
    avatarClass: "bg-emerald-100 text-emerald-700",
    icon: Star,
    defaultPermissions: ["leadgen"],
  },
  marketing: {
    label: "Marketér",
    description: "Přístup k Leadgenu a Creative Labu",
    badgeClass: "border-purple-200 text-purple-700 bg-purple-50",
    avatarClass: "bg-purple-100 text-purple-700",
    icon: Megaphone,
    defaultPermissions: ["leadgen", "creative"],
  },
};

const SECTIONS = [
  { id: "leadgen", label: "Leadgen", icon: BarChart3 },
  { id: "ecommerce", label: "Ecommerce", icon: ShoppingCart },
  { id: "creative", label: "Creative Lab", icon: Sparkles },
  { id: "clients", label: "Klienti", icon: Users },
  { id: "settings", label: "Nastavení klientů", icon: Settings },
] as const;

const WIZARD_STEPS = [
  { id: "role", label: "Role" },
  { id: "details", label: "Údaje" },
  { id: "permissions", label: "Práva" },
  { id: "summary", label: "Shrnutí" },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getInitials(name: string | null, email: string): string {
  if (name?.trim()) {
    const parts = name.trim().split(" ");
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.substring(0, 2).toUpperCase();
  }
  return email.substring(0, 2).toUpperCase();
}

function getEffectivePermissions(user: TeamUser): string[] {
  if (user.permissions && user.permissions.length > 0) return user.permissions;
  return ROLE_CONFIG[user.role as RoleId]?.defaultPermissions ?? [];
}

function getRoleConfig(role: string): RoleConfig {
  return ROLE_CONFIG[role as RoleId] ?? ROLE_CONFIG.marketing;
}

// ─── Add User Wizard ─────────────────────────────────────────────────────────

interface AddUserWizardProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  ams: AccountManager[];
  onSuccess: () => void;
}

function AddUserWizard({ open, onOpenChange, ams, onSuccess }: AddUserWizardProps) {
  const [step, setStep] = useState(0);
  const [role, setRole] = useState<RoleId>("account_manager");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [linkedAmId, setLinkedAmId] = useState("");
  const [permissions, setPermissions] = useState<string[]>(
    ROLE_CONFIG.account_manager.defaultPermissions
  );
  const [isPending, setIsPending] = useState(false);

  const reset = () => {
    setStep(0);
    setRole("account_manager");
    setEmail("");
    setDisplayName("");
    setLinkedAmId("");
    setPermissions(ROLE_CONFIG.account_manager.defaultPermissions);
  };

  const handleRoleChange = (r: RoleId) => {
    setRole(r);
    setPermissions(ROLE_CONFIG[r].defaultPermissions);
  };

  const togglePermission = (id: string) => {
    setPermissions((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const canProceed = () => {
    if (WIZARD_STEPS[step].id === "details") return email.trim().length > 0;
    return true;
  };

  const handleSubmit = async () => {
    setIsPending(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-team-users", {
        body: {
          action: "add",
          email,
          role,
          display_name: displayName || undefined,
          linked_am_id: linkedAmId && linkedAmId !== "__none__" ? linkedAmId : undefined,
          permissions,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: "Člen přidán", description: "Nyní se může přihlásit přes Google." });
      onSuccess();
      onOpenChange(false);
      reset();
    } catch (err: unknown) {
      toast({
        title: "Chyba",
        description: err instanceof Error ? err.message : "Nepodařilo se přidat uživatele",
        variant: "destructive",
      });
    } finally {
      setIsPending(false);
    }
  };

  const roleConfig = ROLE_CONFIG[role];

  const renderStep = () => {
    const stepId = WIZARD_STEPS[step].id;

    if (stepId === "role") {
      return (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Vyberte roli nového člena týmu.</p>
          <div className="grid grid-cols-2 gap-3">
            {(Object.entries(ROLE_CONFIG) as [RoleId, RoleConfig][]).map(([id, cfg]) => {
              const Icon = cfg.icon;
              const active = role === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => handleRoleChange(id)}
                  className={`flex flex-col items-start gap-2.5 rounded-xl border-2 p-4 text-left transition-all hover:shadow-sm ${
                    active
                      ? "border-[#4f11ff] bg-[#4f11ff]/5 shadow-sm"
                      : "border-border bg-card hover:border-muted-foreground/30"
                  }`}
                >
                  <div
                    className={`rounded-lg p-2 ${
                      active ? "bg-[#4f11ff]/10 text-[#4f11ff]" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="font-semibold text-sm">{cfg.label}</div>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                      {cfg.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      );
    }

    if (stepId === "details") {
      return (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Zobrazované jméno</Label>
            <Input
              placeholder="Jan Novák"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>
              Email <span className="text-muted-foreground font-normal">(@performind.cz)</span>{" "}
              <span className="text-destructive">*</span>
            </Label>
            <Input
              type="email"
              placeholder="jan.novak@performind.cz"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Uživatel se přihlásí přes Google účet s touto adresou.
            </p>
          </div>
          {role === "account_manager" && ams.length > 0 && (
            <div className="space-y-2">
              <Label>Propojit s AM účtem</Label>
              <Select value={linkedAmId} onValueChange={setLinkedAmId}>
                <SelectTrigger>
                  <SelectValue placeholder="Vyberte AM účet…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Žádný</SelectItem>
                  {ams.map((am) => (
                    <SelectItem key={am.id} value={am.id}>
                      {am.display_name || am.username}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Propojí Google login s existujícím AM účtem (klienti, nastavení).
              </p>
            </div>
          )}
        </div>
      );
    }

    if (stepId === "permissions") {
      return (
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
            <p className="text-xs text-muted-foreground">
              Výchozí práva pro roli{" "}
              <span className="font-semibold text-foreground">{roleConfig.label}</span>. Sekce
              lze zapínat a vypínat dle potřeby.
            </p>
          </div>
          <div className="space-y-2">
            {SECTIONS.map(({ id, label, icon: Icon }) => {
              const enabled = permissions.includes(id);
              return (
                <div
                  key={id}
                  className={`flex items-center justify-between rounded-xl border px-4 py-3 transition-colors ${
                    enabled
                      ? "border-[#4f11ff]/30 bg-[#4f11ff]/5"
                      : "border-border bg-card"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`rounded-lg p-1.5 ${
                        enabled
                          ? "bg-[#4f11ff]/10 text-[#4f11ff]"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <span className="text-sm font-medium">{label}</span>
                  </div>
                  <Switch checked={enabled} onCheckedChange={() => togglePermission(id)} />
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    if (stepId === "summary") {
      const linkedAm = ams.find((a) => a.id === linkedAmId && linkedAmId !== "__none__");
      return (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Role</span>
              <Badge variant="outline" className={`text-xs ${roleConfig.badgeClass}`}>
                {roleConfig.label}
              </Badge>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Jméno</span>
              <span className="font-medium">{displayName || "—"}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Email</span>
              <span className="font-mono text-xs">{email}</span>
            </div>
            {linkedAm && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">AM účet</span>
                <span className="text-xs">{linkedAm.display_name || linkedAm.username}</span>
              </div>
            )}
            <div className="h-px bg-border" />
            <div className="space-y-2">
              <span className="text-sm text-muted-foreground">Přístup k sekcím</span>
              <div className="flex flex-wrap gap-1.5">
                {permissions.length > 0 ? (
                  SECTIONS.filter((s) => permissions.includes(s.id)).map((s) => (
                    <Badge
                      key={s.id}
                      variant="outline"
                      className="text-xs border-[#4f11ff]/30 text-[#4f11ff] bg-[#4f11ff]/5"
                    >
                      {s.label}
                    </Badge>
                  ))
                ) : (
                  <span className="text-xs text-muted-foreground italic">Bez přístupu</span>
                )}
              </div>
            </div>
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-[500px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Přidat člena týmu</DialogTitle>
          <DialogDescription>
            {WIZARD_STEPS[step].label} — krok {step + 1} z {WIZARD_STEPS.length}
          </DialogDescription>
        </DialogHeader>

        {/* Progress bar */}
        <div className="flex gap-1">
          {WIZARD_STEPS.map((s, i) => (
            <div
              key={s.id}
              className={`h-1 flex-1 rounded-full transition-colors ${
                i <= step ? "bg-[#4f11ff]" : "bg-muted"
              }`}
            />
          ))}
        </div>

        <div className="py-1">{renderStep()}</div>

        <div className="flex justify-between pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setStep((s) => s - 1)}
            disabled={step === 0}
            className="gap-1.5"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Zpět
          </Button>
          {step < WIZARD_STEPS.length - 1 ? (
            <Button
              size="sm"
              onClick={() => setStep((s) => s + 1)}
              disabled={!canProceed()}
              className="gap-1.5 bg-[#4f11ff] hover:bg-[#4f11ff]/90 text-white"
            >
              Další <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={isPending}
              className="gap-1.5 bg-[#4f11ff] hover:bg-[#4f11ff]/90 text-white"
            >
              {isPending ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Přidávám…
                </>
              ) : (
                <>
                  <Check className="h-3.5 w-3.5" /> Přidat člena
                </>
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Edit Permissions Dialog ──────────────────────────────────────────────────

interface EditPermissionsDialogProps {
  user: TeamUser | null;
  onClose: () => void;
  onSave: (id: string, permissions: string[], role: string) => Promise<void>;
  isPending: boolean;
}

function EditPermissionsDialog({ user, onClose, onSave, isPending }: EditPermissionsDialogProps) {
  const [permissions, setPermissions] = useState<string[]>([]);
  const [role, setRole] = useState<RoleId>("account_manager");

  useEffect(() => {
    if (user) {
      setPermissions(getEffectivePermissions(user));
      setRole((user.role as RoleId) ?? "account_manager");
    }
  }, [user]);

  const togglePermission = (id: string) => {
    setPermissions((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  if (!user) return null;

  return (
    <Dialog open={!!user} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-[440px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Upravit oprávnění</DialogTitle>
          <DialogDescription>{user.display_name || user.email}</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-1">
          {/* Role */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Role</Label>
            <div className="grid grid-cols-2 gap-2">
              {(Object.entries(ROLE_CONFIG) as [RoleId, RoleConfig][]).map(([id, cfg]) => {
                const Icon = cfg.icon;
                const active = role === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setRole(id)}
                    className={`flex items-center gap-2.5 rounded-xl border-2 p-3 text-left transition-all ${
                      active
                        ? "border-[#4f11ff] bg-[#4f11ff]/5"
                        : "border-border bg-card hover:border-muted-foreground/20"
                    }`}
                  >
                    <Icon
                      className={`h-4 w-4 shrink-0 ${
                        active ? "text-[#4f11ff]" : "text-muted-foreground"
                      }`}
                    />
                    <span className="text-xs font-medium">{cfg.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Permissions */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Přístup k sekcím</Label>
            <div className="space-y-1.5">
              {SECTIONS.map(({ id, label, icon: Icon }) => {
                const enabled = permissions.includes(id);
                return (
                  <div
                    key={id}
                    className={`flex items-center justify-between rounded-xl border px-3 py-2.5 transition-colors ${
                      enabled
                        ? "border-[#4f11ff]/30 bg-[#4f11ff]/5"
                        : "border-border bg-card"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon
                        className={`h-4 w-4 ${
                          enabled ? "text-[#4f11ff]" : "text-muted-foreground"
                        }`}
                      />
                      <span className="text-sm">{label}</span>
                    </div>
                    <Switch checked={enabled} onCheckedChange={() => togglePermission(id)} />
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            Zrušit
          </Button>
          <Button
            size="sm"
            onClick={() => onSave(user.id, permissions, role)}
            disabled={isPending}
            className="gap-1.5 bg-[#4f11ff] hover:bg-[#4f11ff]/90 text-white"
          >
            {isPending ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Check className="h-3.5 w-3.5" />
            )}
            Uložit
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function TeamUsersSettings() {
  const queryClient = useQueryClient();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<TeamUser | null>(null);

  const { data, isLoading } = useQuery<{
    users: TeamUser[];
    accountManagers: AccountManager[];
  }>({
    queryKey: ["team-users"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("manage-team-users", {
        body: { action: "list" },
      });
      if (error) throw error;
      return data;
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.functions.invoke("manage-team-users", {
        body: { action: "remove", id },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-users"] });
      toast({ title: "Člen odebrán" });
    },
    onError: (err: Error) => {
      toast({ title: "Chyba", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      permissions,
      role,
    }: {
      id: string;
      permissions: string[];
      role: string;
    }) => {
      const { data, error } = await supabase.functions.invoke("manage-team-users", {
        body: { action: "update", id, permissions, role },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-users"] });
      setEditingUser(null);
      toast({ title: "Oprávnění uložena" });
    },
    onError: (err: Error) => {
      toast({ title: "Chyba", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) return <PageSpinner label="Načítám uživatele…" />;

  const users = data?.users ?? [];
  const ams = data?.accountManagers ?? [];

  const roleCounts = users.reduce<Record<string, number>>((acc, u) => {
    acc[u.role] = (acc[u.role] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-background">
      {/* ── Header ── */}
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-lg border-b border-border/50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:h-[56px] flex items-center justify-between">
          <h1 className="text-sm font-semibold tracking-tight text-foreground">Správa týmu</h1>
          <Button
            size="sm"
            className="gap-1.5 bg-[#4f11ff] hover:bg-[#4f11ff]/90 text-white"
            onClick={() => setWizardOpen(true)}
          >
            <UserPlus className="h-3.5 w-3.5" />
            Přidat člena
          </Button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* ── Stats ── */}
        {users.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="text-2xl font-bold font-[family-name:var(--font-heading)] text-foreground">
                {users.length}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">Celkem členů</div>
            </div>
            {(Object.entries(ROLE_CONFIG) as [RoleId, RoleConfig][]).map(([id, cfg]) => {
              const count = roleCounts[id] ?? 0;
              if (count === 0) return null;
              const Icon = cfg.icon;
              return (
                <div key={id} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-center gap-1.5">
                    <div className="text-2xl font-bold font-[family-name:var(--font-heading)] text-foreground">
                      {count}
                    </div>
                    <Icon className="h-4 w-4 text-muted-foreground mb-0.5" />
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">{cfg.label}</div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Team list ── */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 bg-muted/40 border-b border-border flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Členové týmu</h2>
            <span className="text-xs text-muted-foreground">{users.length} členů</span>
          </div>

          {users.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="rounded-full bg-[#4f11ff]/10 p-4">
                <Users className="h-8 w-8 text-[#4f11ff]" />
              </div>
              <p className="text-sm font-medium text-foreground">Zatím žádní členové</p>
              <p className="text-xs text-muted-foreground">
                Přidejte prvního člena tlačítkem Přidat člena
              </p>
              <Button
                size="sm"
                variant="outline"
                className="mt-1 gap-1.5 border-[#4f11ff]/30 text-[#4f11ff] hover:bg-[#4f11ff]/5"
                onClick={() => setWizardOpen(true)}
              >
                <UserPlus className="h-3.5 w-3.5" /> Přidat prvního člena
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {users.map((user) => {
                const cfg = getRoleConfig(user.role);
                const Icon = cfg.icon;
                const initials = getInitials(user.display_name, user.email);
                const effectivePerms = getEffectivePermissions(user);
                const linkedAm = ams.find((am) => am.id === user.linked_am_id);

                return (
                  <div
                    key={user.id}
                    className="px-4 py-4 hover:bg-muted/20 transition-colors"
                  >
                    <div className="flex items-start gap-4">
                      {/* Avatar */}
                      <div
                        className={`h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${cfg.avatarClass}`}
                      >
                        {initials}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-foreground">
                            {user.display_name || user.email.split("@")[0]}
                          </span>
                          <Badge
                            variant="outline"
                            className={`text-xs gap-1 ${cfg.badgeClass}`}
                          >
                            <Icon className="h-3 w-3" />
                            {cfg.label}
                          </Badge>
                          {linkedAm && (
                            <span className="text-xs text-muted-foreground">
                              → {linkedAm.display_name || linkedAm.username}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <Mail className="h-3 w-3 text-muted-foreground shrink-0" />
                          <span className="text-xs text-muted-foreground font-mono truncate">
                            {user.email}
                          </span>
                        </div>

                        {/* Permission chips */}
                        <div className="flex flex-wrap gap-1 mt-2">
                          {SECTIONS.filter((s) => effectivePerms.includes(s.id)).length > 0 ? (
                            SECTIONS.filter((s) => effectivePerms.includes(s.id)).map((s) => {
                              const SIcon = s.icon;
                              return (
                                <span
                                  key={s.id}
                                  className="inline-flex items-center gap-1 rounded-md bg-[#4f11ff]/8 border border-[#4f11ff]/15 px-2 py-0.5 text-xs text-[#4f11ff]/80"
                                >
                                  <SIcon className="h-3 w-3" />
                                  {s.label}
                                </span>
                              );
                            })
                          ) : (
                            <span className="text-xs text-muted-foreground/60 italic">
                              Bez přístupu k sekcím
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-[#4f11ff] hover:bg-[#4f11ff]/5"
                          onClick={() => setEditingUser(user)}
                          title="Upravit oprávnění"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/5"
                          onClick={() => removeMutation.mutate(user.id)}
                          disabled={removeMutation.isPending}
                          title="Odebrat člena"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          Přidaní uživatelé se přihlašují přes Google účet na doméně @performind.cz.
        </p>
      </main>

      <AddUserWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        ams={ams}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ["team-users"] })}
      />

      <EditPermissionsDialog
        user={editingUser}
        onClose={() => setEditingUser(null)}
        onSave={(id, perms, role) => updateMutation.mutateAsync({ id, permissions: perms, role })}
        isPending={updateMutation.isPending}
      />
    </div>
  );
}
