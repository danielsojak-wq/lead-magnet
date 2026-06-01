import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { extractFbSlugs } from "./_helpers.ts";

Deno.test("sameAs slug má prioritu — vrátí se do sameAsSlugs, ne do otherSlugs", () => {
  const html = `
    <meta property="og:site_name" content="Rostlinná akvária">
    <script type="application/ld+json">
      {"@type":"Organization","sameAs":["https://www.facebook.com/rostlinnaakvaria/"]}
    </script>
  `;
  const { sameAsSlugs, otherSlugs } = extractFbSlugs(html);
  assertEquals(sameAsSlugs[0], "rostlinnaakvaria");
  assertEquals(otherSlugs.includes("rostlinnaakvaria"), false);
});

Deno.test("HTML odkaz bez sameAs jde do otherSlugs", () => {
  const html = `<a href="https://www.facebook.com/somepage">FB</a>`;
  const { sameAsSlugs, otherSlugs } = extractFbSlugs(html);
  assertEquals(sameAsSlugs.length, 0);
  assertEquals(otherSlugs[0], "somepage");
});

Deno.test("sameAs slug se nepropaguje do otherSlugs přes HTML regex", () => {
  const html = `
    <script type="application/ld+json">
      {"sameAs":"https://www.facebook.com/invitalpage"}
    </script>
    <a href="https://www.facebook.com/invitalpage">Sleduj nás</a>
  `;
  const { sameAsSlugs, otherSlugs } = extractFbSlugs(html);
  assertEquals(sameAsSlugs[0], "invitalpage");
  assertEquals(otherSlugs.includes("invitalpage"), false);
});
