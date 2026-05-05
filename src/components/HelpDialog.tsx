import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  HelpCircle, CalendarDays, BarChart3,
  TableIcon, LineChart, KanbanSquare, Settings2,
  LayoutDashboard, LogOut, ShoppingCart, Bell,
  Filter, TrendingUp, Target
} from "lucide-react";

type UserRole = "client" | "account_manager" | "admin";

interface HelpDialogProps {
  role: UserRole;
  darkBar?: boolean;
  children?: React.ReactNode;
}

interface HelpSection {
  icon: React.ReactNode;
  title: string;
  description: string;
  tips?: string[];
}

function getSections(role: UserRole): HelpSection[] {
  const sections: HelpSection[] = [];

  sections.push({
    icon: <CalendarDays className="h-5 w-5" />,
    title: "Volba období",
    description: "V hlavičce dashboardu najdete volič období. Můžete přepínat mezi přednastavenými rozsahy (tento měsíc, minulý měsíc, tento rok…) nebo si zvolit vlastní rozsah dat pomocí kalendáře.",
    tips: [
      "Všechny statistiky, grafy i tabulky se automaticky přepočítají podle zvoleného období.",
      "U každé metriky vidíte procentuální srovnání s předchozím obdobím stejné délky.",
    ],
  });

  sections.push({
    icon: <BarChart3 className="h-5 w-5" />,
    title: "Statistiky – přehledové karty",
    description: "Šest karet zobrazuje klíčové metriky: počet poptávek, kvalifikované poptávky, investice do marketingu, cenu za poptávku (CPL), cenu za kvalifikovanou poptávku a relevanci poptávek v procentech.",
    tips: [
      "Zelená šipka = zlepšení oproti předchozímu období, červená = zhoršení.",
      "U investic je změna neutrální (ani dobrá, ani špatná).",
      "U cen za poptávku je nižší hodnota lepší – proto je logika šipek obrácená.",
      "Pokud pro předchozí období nejsou data, zobrazí se informace místo srovnání.",
    ],
  });

  sections.push({
    icon: <LineChart className="h-5 w-5" />,
    title: "Graf vývoje",
    description: "Graf má dvě záložky – Poptávky a Investice. V záložce Poptávky vidíte skládaný sloupcový graf s kvalifikovanými (zelené) a nekvalifikovanými (fialové) poptávkami. Nad každým sloupcem je zobrazeno procento relevance. V záložce Investice vidíte dvě křivky – investice (černá) a cenu za poptávku (fialová).",
    tips: [
      "Najetím myši na sloupec nebo bod uvidíte detailní hodnoty včetně celkových součtů za dané období.",
      "Pro období kratší než 2 měsíce se zobrazují celkové denní hodnoty. Pro delší období graf ukazuje průměrný denní počet poptávek v daném měsíci – proto mohou být čísla na ose Y jednociferná, i když celkový měsíční počet je vyšší.",
      "Celkové součty za měsíc najdete v tooltipu (najetím myši) nebo v tabulce pod grafem.",
    ],
  });

  sections.push({
    icon: <TableIcon className="h-5 w-5" />,
    title: "Tabulka dat",
    description: "Pod grafem je podrobná tabulka se všemi hodnotami rozdělenými po dnech nebo měsících podle zvoleného období. Obsahuje počty poptávek, kvalifikovaných poptávek, investice, CPL a relevanci.",
  });

  sections.push({
    icon: <KanbanSquare className="h-5 w-5" />,
    title: "Poptávky – posuzování",
    description: "V záložce Poptávky najdete seznam poptávek rozdělený na Nové (neposouzené) a Posouzené. Každou poptávku můžete otevřít kliknutím a zobrazit její detail v bočním panelu.",
    tips: [
      "U každé poptávky vidíte datum, jméno a telefon.",
      "Poptávku můžete označit jako Kvalifikovanou nebo Nekvalifikovanou přímo v seznamu, nebo v detailu.",
      "U posouzených poptávek lze rozhodnutí kdykoli změnit tlačítkem.",
      "V detailu poptávky můžete přidávat poznámky do časové osy – vlastní text, nebo rychlou volbu Nedovoláno.",
      "Poznámky lze mazat najetím na poznámku a kliknutím na ikonu koše.",
    ],
  });

  if (role === "account_manager") {
    sections.unshift({
      icon: <LayoutDashboard className="h-5 w-5" />,
      title: "Přehled klientů",
      description: "Po přihlášení vidíte přehled všech klientů rozdělený na Moji klienti (nahoře) a Ostatní klienti (v rozbalovací sekci). U každého klienta vidíte stav reklam a kdy přišla poslední poptávka.",
      tips: [
        "Kliknutím na řádek klienta se dostanete do jeho detailního dashboardu.",
        "V horní liště přepínejte mezi přehledem a jednotlivými klienty v rozbalovací nabídce.",
        "V horní liště najdete přepínač mezi sekcemi Leadgen a Ecommerce.",
      ],
    });

    sections.splice(1, 0, {
      icon: <Settings2 className="h-5 w-5" />,
      title: "Nastavení klientů",
      description: "Tlačítko Nastavit klienty vpravo nahoře vám umožní zvolit, kteří klienti jsou vaši. Zaškrtněte checkboxy u klientů, které spravujete – projeví se to v přehledu i v nabídce v horní liště.",
      tips: [
        "Přiřazení se ukládá okamžitě – nemusíte nic potvrzovat.",
        "Pod čárou v rozbalovací nabídce najdete i ostatní klienty pro případ zástupu.",
      ],
    });

    // Ecommerce section for AM
    sections.push({
      icon: <ShoppingCart className="h-5 w-5" />,
      title: "E-shop Budget Pacing",
      description: "Sekce Ecommerce zobrazuje přehled e-shopových klientů s monitorováním měsíčních rozpočtů. U každého klienta vidíte cílový rozpočet, aktuální útratu, predikci a stav (semafor).",
      tips: [
        "Kliknutím na klienta se dostanete do detailu s grafem burn-rate a rozpisem po kanálech.",
        "Predikce se počítá pomocí klouzavého průměru za posledních 7 dní (SMA-7).",
        "Tlačítkem Zpět v detailu se vrátíte do přehledu.",
      ],
    });

    sections.push({
      icon: <Target className="h-5 w-5" />,
      title: "Semafor – pacing",
      description: "Barevný indikátor ukazuje, jak se aktuální predikce odchyluje od cílového rozpočtu.",
      tips: [
        "🟢 Zelená: odchylka 0 % až -10 % – ideální stav, kampaň běží podle plánu.",
        "🟡 Žlutá (přečerpání): odchylka >0 % do +3 % – lehce nad plánem, hlídejte.",
        "🟡 Žlutá (nedočerpání): odchylka -10 % až -20 % – kampaně ztrácí dech.",
        "🔴 Červená (přečerpání): odchylka >+3 % – kritické, utrácí se víc než schváleno.",
        "🔴 Červená (nedočerpání): odchylka <-20 % – zásadní problém, kampaně neběží.",
      ],
    });

    sections.push({
      icon: <Filter className="h-5 w-5" />,
      title: "Filtr kampaní (E-shop)",
      description: "V nastavení e-shop klienta (ikona ⚙️) najdete filtr kampaní. Všechny kampaně jsou defaultně zahrnuty. Odškrtněte ty, které chcete vyloučit z výpočtu (např. Lead Gen kampaně).",
      tips: [
        "Kampaně se automaticky načítají z Google Sheetu.",
        "Vyloučené kampaně se nezapočítávají do útraty ani predikce.",
        "Můžete také nastavit Web filtr pro sdílené sheety s více weby.",
      ],
    });

    sections.push({
      icon: <Bell className="h-5 w-5" />,
      title: "Slack notifikace",
      description: "U každého klienta (ikona 🔔) můžete nastavit automatická upozornění do Slacku. Dostupné podmínky: 'Žádná poptávka X dní' a 'Neaktivní reklamy'.",
      tips: [
        "Notifikace se vyhodnocují každých 6 hodin.",
        "Lze nastavit frekvenci: jednorázově, denně, za 3/5 dní nebo týdně.",
        "Zprávy mohou jít do kanálu (#channel) nebo jako přímá zpráva (DM).",
        "V šabloně zprávy můžete použít proměnné {klient} a {dny}.",
      ],
    });
  }

  if (role === "admin") {
    sections.unshift({
      icon: <LayoutDashboard className="h-5 w-5" />,
      title: "Přehled klientů",
      description: "Administrátorský přehled zobrazuje tabulku všech klientů se stavem reklam (aktivní/neaktivní) a počtem dní od poslední poptávky.",
      tips: [
        "Kliknutím na řádek klienta se dostanete do jeho detailního dashboardu.",
        "Stav reklam se posuzuje podle toho, zda se v posledních 24 hodinách investoval nějaký rozpočet.",
        "V horní liště můžete rychle přepínat mezi klienty nebo se vrátit do přehledu pomocí rozbalovací nabídky.",
        "Přepínač Leadgen / Ecommerce v horní liště přepíná mezi sekcemi.",
      ],
    });

    sections.push({
      icon: <ShoppingCart className="h-5 w-5" />,
      title: "E-shop Budget Pacing",
      description: "Sekce Ecommerce zobrazuje přehled e-shopových klientů s monitorováním měsíčních rozpočtů. Vidíte cíl, útratu, predikci, stav reklam a pacing semafor.",
      tips: [
        "Tlačítkem 'Přidat klienta' přidáte existujícího klienta do ecommerce sledování.",
        "Tlačítkem 'Nový klient' vytvoříte zcela nového klienta.",
        "Kliknutím na klienta otevřete detail s grafem burn-rate a rozpisem kanálů.",
        "V detailu je tlačítko Zpět pro návrat do přehledu.",
      ],
    });

    sections.push({
      icon: <Target className="h-5 w-5" />,
      title: "Semafor – pacing",
      description: "Barevný indikátor ukazuje odchylku predikce od cíle.",
      tips: [
        "🟢 Zelená: 0 % až -10 % – ideální stav.",
        "🟡 Žlutá: >0 % do +3 % (přečerpání) nebo -10 % až -20 % (nedočerpání).",
        "🔴 Červená: >+3 % (kritické přečerpání) nebo <-20 % (kritické nedočerpání).",
      ],
    });

    sections.push({
      icon: <Filter className="h-5 w-5" />,
      title: "Filtr kampaní (E-shop)",
      description: "V nastavení e-shop klienta (⚙️) najdete checkboxový filtr kampaní. Všechny jsou defaultně zahrnuty – odškrtněte nerelevantní (např. Lead Gen).",
      tips: [
        "Kampaně se načítají automaticky z Google Sheetu.",
        "Můžete nastavit Web filtr pro sdílené sheety a režim rozpočtu (celkový / per kanál).",
      ],
    });

    sections.push({
      icon: <Bell className="h-5 w-5" />,
      title: "Slack notifikace",
      description: "U každého klienta (🔔) lze nastavit automatická Slack upozornění. Podmínky: 'Žádná poptávka X dní' a 'Neaktivní reklamy'. Pravidla se vyhodnocují každých 6 hodin.",
      tips: [
        "Frekvence: jednorázově, denně, za 3/5 dní nebo týdně.",
        "Zasílání do kanálu nebo jako DM.",
        "Proměnné v šabloně: {klient} a {dny}.",
        "Jako admin vidíte i pravidla nastavená ostatními uživateli.",
      ],
    });
  }

  if (role === "client") {
    sections.push({
      icon: <LogOut className="h-5 w-5" />,
      title: "Odhlášení",
      description: "Pro odhlášení klikněte na ikonu odhlášení vedle voliče období v hlavičce dashboardu.",
    });
  }

  return sections;
}

export function HelpDialog({ role, darkBar, children }: HelpDialogProps) {
  const sections = getSections(role);

  const roleLabel = role === "admin"
    ? "administrátora"
    : role === "account_manager"
      ? "account managera"
      : "klienta";

  return (
    <Dialog>
      <DialogTrigger asChild>
        {children || (
          <Button
            variant="ghost"
            size="sm"
            className={`h-7 px-2 text-xs gap-1 ${darkBar ? "text-background hover:text-background hover:bg-background/10" : ""}`}
          >
            <HelpCircle className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Nápověda</span>
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] p-0">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle className="text-lg">Nápověda pro {roleLabel}</DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Přehled všech funkcí a možností vašeho dashboardu
          </p>
        </DialogHeader>

        <ScrollArea className="h-[65vh] px-6 pb-6">
          <div className="space-y-1 pt-4">
            {sections.map((section, i) => (
              <div key={i}>
                <div className="flex gap-4 py-4">
                  <div className="flex-shrink-0 mt-0.5 h-10 w-10 rounded-lg bg-muted flex items-center justify-center text-foreground/70">
                    {section.icon}
                  </div>
                  <div className="flex-1 space-y-2">
                    <h3 className="font-semibold text-sm">{section.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {section.description}
                    </p>
                    {section.tips && section.tips.length > 0 && (
                      <ul className="space-y-1 mt-2">
                        {section.tips.map((tip, j) => (
                          <li key={j} className="text-xs text-muted-foreground/80 flex gap-2">
                            <span className="text-primary mt-0.5">•</span>
                            <span>{tip}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
                {i < sections.length - 1 && <Separator />}
              </div>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
