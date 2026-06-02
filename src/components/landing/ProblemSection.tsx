export function ProblemSection() {
  return (
    <section className="py-20 sm:py-28 bg-[#0c0a1e] relative overflow-hidden">
      {/* Ambient lime accent */}
      <div className="absolute top-1/2 -left-20 -translate-y-1/2 w-72 h-72 bg-[#b0f221]/8 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-80 h-80 bg-[#4f11ff]/15 rounded-full blur-[130px] pointer-events-none" />

      <div className="relative max-w-3xl mx-auto px-4 sm:px-6">
        <p className="text-[#b0f221] text-sm font-semibold tracking-wide uppercase mb-3 text-center">V čem je problém</p>
        <h2 className="font-[family-name:var(--font-heading)] text-3xl sm:text-4xl font-bold text-white text-center mb-10 leading-tight">
          Reklamy vám běží. Jen netušíte, proti čemu stojíte.
        </h2>

        <div className="space-y-5 text-white/60 text-base sm:text-lg leading-relaxed">
          <p>
            Každý měsíc dáte do reklam na Metě desítky tisíc korun. Vaše konkurence
            taky — jen ona ví, co testujete vy, a vy o ní nevíte skoro nic.
          </p>
          <p>
            To není maličkost. Je to rozdíl mezi tím, jestli své rozpočty řídíte
            podle dat, nebo podle odhadu. Kdo vidí dál, neplatí dvakrát za stejnou
            lekci — odladěné formáty, sdělení i kreativy nasazuje dřív. A vy zatím
            testujete to, co někdo vedle vás vyřešil před půl rokem.
          </p>
          <p>
            Zjistit si to můžete i sami. Jen to dá práci: Meta Ads Library je
            nepřehledná, ručně projít desítky reklam dvou konkurentů zabere hodiny —
            a i pak z toho spíš vyčtete jednotlivé reklamy než celou strategii.
          </p>
          <p className="text-white/80 font-medium">
            Proto jsme tu analýzu postavili. Za tři minuty zvládne to, co vás ručně
            stojí celé odpoledne.
          </p>
        </div>
      </div>
    </section>
  );
}
