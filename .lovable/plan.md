Souhlasím — problém není v UI, ale ve vstupu pro AI. Aktuálně AI smí vybírat pouze z palety, kterou vrátí Firecrawl branding. U nejoutdoor tato paleta obsahuje jen `#005493`, `#239edf`, `#c42727`, atd., ale vůbec v ní není výrazná zelená z loga/navigace/košíku/hero prvků. Proto ji model nemůže vybrat, i kdyby ji na screenshotu viděl.

Plán opravy:

1. Rozšířit zdroje barev před AI výběrem
   - Vedle `branding.colors` začnu sbírat barvy také z HTML a inline stylů.
   - Přidám podporu pro:
     - `#RGB`, `#RRGGBB`
     - `rgb(...)`, `rgba(...)`
     - CSS proměnné a inline styly v HTML
   - Zelená z nejoutdoor (`rgb(29, 177, 48)` / přibližně `#1db130`) se tak dostane do kandidátní palety.

2. Změnit Firecrawl scrape tak, aby vracel i HTML
   - K současným formátům `markdown`, `branding`, `screenshot` přidám `html`.
   - Z HTML se vytáhne širší reálná CSS paleta, ne jen interpretace Firecrawl brandingu.

3. Zpřísnit AI prompt pro vizuálně dominantní zelenou
   - AI nebude jen vybírat „3 hlavní barvy“, ale dostane pravidlo:
     - zelená použitá v logu, navigaci, košíku, CTA nebo výrazných slevových/hero prvcích musí být `primary` nebo `accent`.
     - tmavě modrá navigace má být spíš `secondary`, pokud zelená působí jako akcent/brand driver.
   - Zachovám ruční úpravu v UI.

4. Přidat post-processing pojistku po AI odpovědi
   - Pokud rozšířená paleta obsahuje výraznou zelenou a AI ji přesto nevybere, funkce ji automaticky dosadí jako `accent_color` nebo `primary_color` podle dominance signálů.
   - U nejoutdoor by výsledek měl být zhruba:
     - primary: modrá z loga/navigace nebo zelená podle AI vyhodnocení
     - secondary: tmavá/modrá navigační barva
     - accent: výrazná zelená `#1db130` / podobná hodnota
   - Důležité: zelená už v návrhu nebude chybět.

5. Uložit diagnostiku pro kontrolu
   - Do `scraped_data` uložím:
     - původní Firecrawl paletu
     - HTML-extrahovanou paletu
     - finální paletu poslanou AI
     - důvod případné automatické korekce zelené
   - V UI pak bude vidět jasnější reasoning, proč byla zelená zařazena.

6. Otestovat na `https://nejoutdoor.cz`
   - Po implementaci nasadím backend funkci `analyze-brand-dna`.
   - Spustím analýzu pro `nejoutdoor` a ověřím v uloženém profilu, že zelená je v `primary_color` nebo `accent_color` a v reasoning textu je zmíněna.

Technicky se bude měnit hlavně:
- `supabase/functions/analyze-brand-dna/index.ts`

Případně drobně:
- `src/components/creative/BrandDnaPage.tsx`, pokud bude potřeba zobrazit jasnější poznámku o automatické korekci barev.