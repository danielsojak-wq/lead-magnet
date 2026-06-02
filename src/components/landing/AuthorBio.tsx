import { LinkedinIcon } from "lucide-react";
import { trackEvent } from "@/lib/analytics";

export function AuthorBio() {
  const handleLinkedInClick = () => {
    trackEvent({ event: "cta_clicked", cta_label: "linkedin_author_bio", section: "author_bio" });
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
              className="w-24 h-24 rounded-full object-cover shadow-md ring-2 ring-white"
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

            <a
              href="https://www.linkedin.com/in/daniel-sojak/"
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleLinkedInClick}
              aria-label="LinkedIn profil Daniela Sojáka"
              className="inline-flex items-center justify-center w-9 h-9 rounded-lg text-[#4f11ff] hover:bg-[#4f11ff]/8 transition-colors"
            >
              <LinkedinIcon className="h-5 w-5" />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
