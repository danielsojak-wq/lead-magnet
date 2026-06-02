// Shared smooth transition between adjacent sections.
// Renders a decorative gradient strip at the bottom edge of the UPPER section,
// blending the upper section's exact bg color into the lower section's exact
// bg color. Place as the first child of a `relative` section; in-flow content
// (wrapped in a `relative` element) paints on top.
//
// `from` = current (upper) section bg, `to` = next (lower) section bg.
// Always pass exact colors — never #ffffff unless the section is truly white.
export function SectionFade({ from, to }: { from: string; to: string }) {
  return (
    <div
      aria-hidden="true"
      className="absolute bottom-0 inset-x-0 pointer-events-none"
      style={{ height: 88, background: `linear-gradient(to bottom, ${from} 0%, ${to} 100%)` }}
    />
  );
}
