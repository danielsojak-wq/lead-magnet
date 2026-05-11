import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import performindLogo from "@/assets/performind-logo-dark.svg";

const TEST_ID = "00000000-0000-0000-0000-000000000001";
const TEST_EMAIL = "test@performind.cz";

const PAGES = [
  { label: "Landing page", path: "/", desc: "Hlavní stránka s email formulářem" },
  { label: "Check email", path: `/check-email?email=${TEST_EMAIL}`, desc: "Po odeslání emailu" },
  { label: "Verify — loading", path: "/verify?token=test-token", desc: "Ověřování emailu (simulace)" },
  { label: "Verify — error", path: "/verify", desc: "Chybný nebo chybějící token" },
  { label: "Analyze", path: `/analyze/${TEST_ID}`, desc: "Formulář s URL e-shopu a konkurentů" },
  { label: "Waiting", path: `/waiting/${TEST_ID}`, desc: "Animace průběhu analýzy" },
  { label: "Results", path: `/results/${TEST_ID}`, desc: "Výsledky analýzy (placeholder)" },
];

export default function DevPage() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-gray-50 font-[family-name:var(--font-body)]">
      <nav className="bg-white border-b border-gray-100 px-6 h-16 flex items-center gap-3">
        <img src={performindLogo} alt="Performind Marketing" className="h-5 object-contain" />
        <span className="text-xs font-semibold bg-[#4f11ff]/10 text-[#4f11ff] px-2 py-0.5 rounded-full">DEV NAV</span>
      </nav>
      <div className="max-w-2xl mx-auto px-4 py-12">
        <h1 className="font-[family-name:var(--font-heading)] text-2xl font-bold text-gray-900 mb-2">Přehled stránek</h1>
        <p className="text-gray-400 text-sm mb-8">Tato stránka slouží pouze pro vývoj a náhled v Lovable.</p>
        <div className="space-y-3">
          {PAGES.map((page) => (
            <button
              key={page.path}
              onClick={() => navigate(page.path)}
              className="w-full flex items-center justify-between bg-white border border-gray-100 rounded-2xl px-6 py-4 hover:border-[#4f11ff]/30 hover:shadow-md hover:shadow-[#4f11ff]/5 transition-all group text-left"
            >
              <div>
                <p className="font-semibold text-gray-900 text-sm font-[family-name:var(--font-heading)]">{page.label}</p>
                <p className="text-gray-400 text-xs mt-0.5">{page.desc}</p>
                <p className="text-gray-300 text-xs mt-0.5 font-mono">{page.path}</p>
              </div>
              <ArrowRight className="h-4 w-4 text-gray-300 group-hover:text-[#4f11ff] transition-colors flex-shrink-0 ml-4" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
