import React from "react";
import { Linkedin } from "lucide-react";
import { trackEvent } from "@/lib/analytics";

export default function AuthorBio() {
  const handleLinkedInClick = () => {
    trackEvent({ event: "cta_clicked", cta_label: "linkedin_author_bio", section: "author_bio" });
  };
  const handleWebsiteClick = () => {
    trackEvent({ event: "cta_clicked", cta_label: "website_author_bio", section: "author_bio" });
  };

  return (
    <section className="py-16 sm:py-20 bg-white">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-8">
          <p className="text-sm text-gray-500 font-semibold tracking-wide uppercase">KDO TO DĚLÁ</p>
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mt-3">Stojí za tím konkrétní lidé, ne anonymní nástroj.</h2>
        </div>

        <div className="grid md:grid-cols-2 gap-8 items-center">
          <div className="flex justify-center">
            <img src="/images/daniel-sojak.jpg" alt="Daniel Soják, Founder Performind Marketing" className="w-48 h-48 rounded-2xl object-cover shadow-md" />
          </div>

          <div>
            <h3 className="text-lg font-bold text-gray-900">Daniel Soják</h3>
            <p className="text-sm text-gray-500 mb-4">Founder, Performind Marketing</p>

            <p className="text-gray-700 mb-3">
              Vedu výkonnostní agenturu, která pomáhá CZ e-shopům růst. Komplexně, předvídatelně a bez stresu.
              Spravujeme reklamní rozpočty v desítkách milionů ročně — a konkurenční analýzu děláme každý den.
            </p>

            <p className="text-gray-700 mb-3">
              Tuto analýzu jsem zpřístupnil, protože vidím, jak zásadní rozdíl dělá v rozhodování o reklamních kampaních.
              Premium e-shopy si zaslouží vědět, co konkurence dělá lépe — nebo hůř.
            </p>

            <blockquote className="text-gray-600 italic border-l-2 pl-4 py-2 mt-2">„Performance marketing v 2026 už není o cílení. Je o kreativní strategii a hluboké znalosti trhu. Tato analýza vám tu znalost dá za 5 minut."</blockquote>

            <div className="flex gap-3 mt-4">
              <a
                href="https://www.linkedin.com/in/daniel-sojak/"
                target="_blank"
                rel="noopener noreferrer"
                onClick={handleLinkedInClick}
                className="inline-flex items-center gap-2 text-sm text-[#4f11ff] font-semibold"
              >
                <Linkedin className="h-4 w-4" /> LinkedIn profil
              </a>

              <a
                href="https://performind.cz"
                target="_blank"
                rel="noopener noreferrer"
                onClick={handleWebsiteClick}
                className="inline-flex items-center gap-2 text-sm text-gray-700"
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
