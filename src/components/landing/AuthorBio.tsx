import { LinkedinIcon } from "lucide-react";
import { trackEvent } from "@/lib/analytics";

export function AuthorBio() {
  const handleLinkedInClick = () => {
    trackEvent({ event: "cta_clicked", cta_label: "linkedin_author_bio", section: "author_bio" });
  };

  return (
    <section className="py-12 sm:py-16 bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        <p className="text-[#4f11ff] text-sm font-semibold tracking-wide uppercase mb-10 text-center">O Performind</p>
        <div className="grid md:grid-cols-[auto_1fr] gap-10 items-start">
          {/* Photo */}
          <div className="flex justify-center md:justify-start">
            <img
              src="/daniel-sojak.jpg"
              alt="Daniel Soják, zakladatel Performind"
              className="w-24 h-24 rounded-full object-cover shadow-md ring-2 ring-white"
            />
          </div>

          {/* Bio */}
          <div>
            <h3 className="font-[family-name:var(--font-heading)] text-xl font-bold text-gray-900">Daniel Soják</h3>
            <p className="text-[#4f11ff] text-sm font-semibold mb-4">zakladatel</p>

            <p className="text-gray-600 leading-relaxed mb-4">
              Performind je výkonnostní agentura pro e-shopy, které chtějí růst. S týmem
              specialistů spravujeme reklamní rozpočty v desítkách milionů ročně pro více než
              30 klientů. Konkurenční analýzy děláme na denní bázi. Díky tomuto nástroji si ji
              nyní můžete během pár minut udělat i vy.
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
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
