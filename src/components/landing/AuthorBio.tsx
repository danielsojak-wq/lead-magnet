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
    <section className="py-12 sm:py-16 bg-gray-50 border-y border-gray-100">
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        <div className="grid md:grid-cols-[auto_1fr] gap-10 items-start">
          {/* Photo */}
          <div className="flex justify-center md:justify-start">
            <img
              src="/daniel-sojak.jpg"
              alt="Daniel Soják, Zakladatel a konzultant, Performind Marketing s.r.o."
              className="w-36 h-36 rounded-full object-cover shadow-md ring-2 ring-white"
            />
          </div>

          {/* Bio */}
          <div>
            <h3 className="font-[family-name:var(--font-heading)] text-xl font-bold text-gray-900">Daniel Soják</h3>
            <p className="text-[#4f11ff] text-sm font-semibold mb-4">Zakladatel a konzultant, Performind Marketing s.r.o.</p>

            <p className="text-gray-600 leading-relaxed mb-4">
              Vedu Performind, výkonnostní agenturu pro e-shopy. Spravujeme reklamní rozpočty
              v desítkách milionů ročně a konkurenční analýzy děláme na denní bázi —
              proto vím, co z nich má smysl.
            </p>

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
