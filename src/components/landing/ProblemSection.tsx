import { SectionFade } from "./SectionFade";

export function ProblemSection() {
  return (
    <section className="pt-12 sm:pt-16 pb-20 sm:pb-28 bg-[#0c0a1e] relative overflow-hidden">
      {/* Seamless blend from hero (bg-gray-950 #030712) into this section */}
      <div
        aria-hidden="true"
        className="absolute top-0 inset-x-0 h-40 pointer-events-none"
        style={{ background: "linear-gradient(to bottom, #030712 0%, rgba(3,7,18,0.5) 45%, transparent 100%)" }}
      />
      {/* Fade into next section (Co získáte — white) */}
      <SectionFade from="#0c0a1e" to="#ffffff" />

      {/* Ambient lime accent */}
      <div className="absolute top-1/2 -left-20 -translate-y-1/2 w-72 h-72 bg-[#b0f221]/8 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-80 h-80 bg-[#4f11ff]/15 rounded-full blur-[130px] pointer-events-none" />

      <div className="relative max-w-3xl mx-auto px-4 sm:px-6">
        <p className="text-[#b0f221] text-sm font-semibold tracking-wide uppercase mb-3 text-center">V ČEM JE PROBLÉM?</p>
        <h2 className="font-[family-name:var(--font-heading)] text-3xl sm:text-4xl font-bold text-white text-center mb-10 leading-tight">
          Reklamy vám běží. Jen netušíte, proti čemu stojíte.
        </h2>

        <div className="space-y-5 text-white/60 text-base sm:text-lg leading-relaxed">
          <p>
            Každý měsíc dáte do reklam na Metě desítky tisíc korun. Vaše konkurence
            taky - jen ona možná ví, co testujete vy, a vy o jejich reklamách a strategii nevíte skoro nic.
          </p>
          <p>
            To není maličkost. Je to rozdíl mezi tím, jestli své rozpočty řídíte
            podle dat, nebo podle odhadu. Kdo vidí dál, neplatí dvakrát za stejnou
            lekci - odladěné formáty, sdělení i kreativy tak nasazuje dřív.&nbsp;
            A vy zatím testujete to, co někdo vedle vás vyřešil před půl rokem.
          </p>
          <p>
            Zjistit si to můžete i sami. Jen to dá práci: Meta Ads Library je
            nepřehledná a ručně projít desítky reklam dvou konkurentů zabere hodiny.
            {"\n"}
          </p>
          <p className="text-white/80 font-medium">
            Proto jsme postavili tento nástroj. Za tři minuty zvládne to, co vás ručně
            stojí půlku odpoledne nebo vyšší tisíce ve fakturaci agentury za analýzu navíc.
          </p>
        </div>
      </div>
    </section>
  );
}
