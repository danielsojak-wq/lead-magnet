// Social proof: pomalu jedoucí nekonečný pruh log klientů.
// Loga jednotně tmavá silueta (CSS filtr, PNG s průhledností nezměněny).
// Čisté CSS + React, bez externí knihovny.

const CLIENT_LOGOS = [
  { src: "/klienti/nejoutdoor.png", alt: "NEJOUTDOOR" },
  { src: "/klienti/obb.png", alt: "OBB stavební materiály" },
  { src: "/klienti/pixfra.png", alt: "PixFra" },
  { src: "/klienti/nedbal-trading.png", alt: "NEDBAL Trading" },
  { src: "/klienti/neo-machines.png", alt: "NEO Machines" },
  { src: "/klienti/terasvet.png", alt: "TERASVĚT" },
  { src: "/klienti/vyzdobeno.png", alt: "VYZDOBENO.cz" },
  { src: "/klienti/molitan-metraz.png", alt: "MOLITAN-METRAZ.cz" },
  { src: "/klienti/forsteel.png", alt: "forsteel.eu" },
  { src: "/klienti/vetys-zoo.png", alt: "Vetys Zoo" },
];

const LOGO_FILTER = "grayscale(1) brightness(0) opacity(0.6)";

export function ClientLogosMarquee() {
  return (
    <section className="pt-4 pb-14 sm:pt-6 sm:pb-16 bg-gradient-to-b from-gray-50 to-gray-100">
      <style>{`
        @keyframes pm-marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        .pm-marquee-track { animation: pm-marquee 38s linear infinite; }
        .pm-marquee-viewport:hover .pm-marquee-track { animation-play-state: paused; }
        .pm-marquee-mask {
          -webkit-mask-image: linear-gradient(to right, transparent 0, #000 8%, #000 92%, transparent 100%);
                  mask-image: linear-gradient(to right, transparent 0, #000 8%, #000 92%, transparent 100%);
        }
        @media (prefers-reduced-motion: reduce) {
          .pm-marquee-track {
            animation: none !important;
            transform: none !important;
            width: 100% !important;
            flex-wrap: wrap;
            justify-content: center;
            gap: 1.75rem 3rem;
          }
          .pm-marquee-item { margin-right: 0 !important; }
          .pm-marquee-dup { display: none !important; }
          .pm-marquee-mask { -webkit-mask-image: none; mask-image: none; }
        }
      `}</style>

      <div className="pm-marquee-viewport pm-marquee-mask relative w-full overflow-hidden">
        <div className="pm-marquee-track flex w-max items-center">
          {CLIENT_LOGOS.map((l) => (
            <img
              key={l.alt}
              src={l.src}
              alt={l.alt}
              width={300}
              height={100}
              loading="lazy"
              draggable={false}
              className="pm-marquee-item h-7 sm:h-8 w-auto object-contain shrink-0 select-none mr-12 sm:mr-16"
              style={{ filter: LOGO_FILTER }}
            />
          ))}
          {/* Duplikát pro plynulou nekonečnou smyčku (translateX -50%) */}
          {CLIENT_LOGOS.map((l) => (
            <img
              key={`${l.alt}-dup`}
              src={l.src}
              alt=""
              aria-hidden="true"
              width={300}
              height={100}
              loading="lazy"
              draggable={false}
              className="pm-marquee-item pm-marquee-dup h-7 sm:h-8 w-auto object-contain shrink-0 select-none mr-12 sm:mr-16"
              style={{ filter: LOGO_FILTER }}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
