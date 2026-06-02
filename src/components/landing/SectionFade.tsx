// Shared smooth transition between adjacent light/dark sections.
// Renders a decorative gradient strip at the bottom edge of the UPPER
// section, fading from transparent into the NEXT section's background color.
// Place as the first child of a `relative` section; in-flow content paints on top.
export function SectionFade({ to }: { to: string }) {
  return (
    <div
      aria-hidden="true"
      className="absolute bottom-0 inset-x-0 h-24 pointer-events-none"
      style={{ background: `linear-gradient(to bottom, transparent 0%, ${to} 100%)` }}
    />
  );
}
