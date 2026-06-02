import { LinkedinIcon, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { trackEvent } from "@/lib/analytics";
import { SectionFade } from "./SectionFade";

export function AuthorBio() {
  const navigate = useNavigate();

  const handleLinkedInClick = () => {
    trackEvent({ event: "cta_clicked", cta_label: "linkedin_author_bio", section: "author_bio" });
  };

  return (
    <section className="py-12 sm:py-16 bg-gray-50 relative overflow-hidden">
      <SectionFade from="#f9fafb" to="#0c0a1e" />
      <div className="relative max-w-4xl mx-auto px-4 sm:px-6">
        <p className="text-[#4f11ff] text-sm font-semibold tracking-wide uppercase mb-10 text-center">Kdo za tím stojí</p>
        <div className="grid md:grid-cols-[auto_1fr] gap-10 items-start">
          {/* Photo */}
          <div className="flex justify-center md:justify-start">
            <img
              src="/daniel-sojak.jpg"
              alt="Daniel Soják, Zakladatel, Performind.cz"
              className="w-24 h-24 rounded-full object-cover shadow-md ring-2 ring-white"
            />
          </div>

          {/* Bio */}
          <div>
            <h3 className="font-[family-name:var(--font-heading)] text-xl font-bold text-gray-900">Daniel Soják</h3>
            <p className="text-[#4f11ff] text-sm font-semibold mb-4">Zakladatel, Performind.cz</p>

            <p className="text-gray-600 leading-relaxed mb-4">
              Vedu Performind, výkonnostní agenturu pro firmy, které chtějí růst. Spravujeme
              reklamní rozpočty v desítkách milionů ročně a konkurenční analýzy děláme na
              denní bázi. Nyní si ji můžete udělat i vy.
            </p>

            <div className="flex items-center gap-5">
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
              <button
                onClick={() => navigate("/analyze")}
                className="group inline-flex items-center gap-1.5 text-sm font-semibold text-[#4f11ff] hover:text-[#3d0dcc] transition-colors"
              >
                Vyzkoušet naši analýzu
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
