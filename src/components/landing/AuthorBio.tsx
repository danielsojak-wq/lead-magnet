import { LinkedinIcon } from "lucide-react";
import { trackEvent } from "@/lib/analytics";

export function AuthorBio() {
  const handleLinkedInClick = () => {
    trackEvent({ event: "cta_clicked", cta_label: "linkedin_author_bio", section: "author_bio" });
  };

  const handleWebsiteClick = () => {
    trackEvent({ event: "cta_clicked", cta_label: "website_author_bio", section: "author_bio" });
  };

  return (
    <section className="py-20 sm:py-28 bg-gray-50 border-y border-gray-100">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-12">
          <p className="text-[#4f11ff] text-sm font-semibold tracking-wide uppercase mb-3">KDO TO DĚLÁ</p>
          <h2 className="font-[family-name:var(--font-heading)] text-3xl sm:text-4xl font-bold text-gray-900">
            Stojí za tím konkrétní lidé,
            <br />
            ne anonymní nástroj.
          </h2>
        </div>

        <div className="grid md:grid-cols-2 gap-12 items-center">
          {/* Photo */}
          <div className="flex justify-center">
            <img
              src="/daniel-sojak.jpg"
              alt="Daniel Soják, Zakladatel a konzultant, Performind Marketing s.r.o."
              className="w-full max-w-sm rounded-2xl object-cover aspect-square shadow-md"
            />
          </div>

          {/* Bio */}
          <div>
            <h3 className="font-[family-name:var(--font-heading)] text-2xl font-bold text-gray-900">Daniel Soják</h3>
            <p className="text-[#4f11ff] text-sm font-semibold mb-6">Zakladatel a konzultant, Performind Marketing s.r.o.</p>

            <p className="text-gray-600 leading-relaxed mb-4">
              Vedu výkonnostní agenturu Performind, kde pomáháme e-shopům růst. Komplexně, předvídatelně
              a bez stresu. Spravujeme reklamní rozpočty v desítkách milionů ročně — a konkurenční
              analýzy děláme na denní bázi.
            </p>

            <p className="text-gray-600 leading-relaxed mb-6">
              Tuto analýzu jsem zpřístupnil, protože vidím, jak zásadní rozdíl dělá v rozhodování
              o reklamních kampaních. Eshopaři si zaslouží vědět, co konkurence dělá lépe —
              nebo hůř.
            </p>

            <blockquote className="border-l-2 border-[#4f11ff]/30 pl-4 py-1 mb-6">
              <p className="text-gray-500 italic text-sm leading-relaxed">
                „Performance marketing v 2026 už není o cílení. Je o kreativní strategii
                a hluboké znalosti trhu. Tato analýza vám tu znalost dá za 5 minut."
              </p>
            </blockquote>

            <div className="flex flex-wrap gap-4">
              <a
                href="https://www.linkedin.com/in/daniel-sojak/"
                target="_blank"
                rel="noopener noreferrer"
                onClick={handleLinkedInClick}
                className="inline-flex items-center gap-2 text-sm font-semibold text-[#4f11ff] hover:text-[#3d0dcc] transition-colors"
              >
                <LinkedinIcon className="h-4 w-4" /> LinkedIn profil
              </a>
              <a
                href="https://performind.cz"
                target="_blank"
                rel="noopener noreferrer"
                onClick={handleWebsiteClick}
                className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 transition-colors"
              >
                performind.cz
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
