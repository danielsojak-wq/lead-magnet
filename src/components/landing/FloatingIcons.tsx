import { Play, Heart, MessageCircle, Image, LayoutGrid, TrendingUp, Repeat2 } from "lucide-react";

// Each icon: position (top/bottom + left/right as %), size, opacity, animation timing
const ICONS = [
  // Left column — clear of center text (~max-w-4xl = 56rem, so ~28rem from center)
  { Icon: Play,          top: "12%",  left: "4%",   size: 28, opacity: 0.18, duration: "4.2s", delay: "0s"    },
  { Icon: LayoutGrid,    top: "42%",  left: "3%",   size: 22, opacity: 0.14, duration: "5.8s", delay: "1.1s"  },
  { Icon: Heart,         top: "72%",  left: "7%",   size: 24, opacity: 0.20, duration: "3.9s", delay: "0.5s"  },
  // Right column
  { Icon: MessageCircle, top: "10%",  right: "5%",  size: 26, opacity: 0.16, duration: "5.1s", delay: "1.7s"  },
  { Icon: TrendingUp,    top: "45%",  right: "4%",  size: 24, opacity: 0.18, duration: "4.6s", delay: "0.3s"  },
  { Icon: Image,         top: "70%",  right: "8%",  size: 22, opacity: 0.13, duration: "6.0s", delay: "2.0s"  },
  // Top-center gap (above h1, narrow strip)
  { Icon: Repeat2,       top: "4%",   left: "48%",  size: 20, opacity: 0.12, duration: "4.8s", delay: "0.9s"  },
] as const;

export function FloatingIcons() {
  return (
    // Hidden on mobile — text fills full width, icons would overlap
    <div
      aria-hidden="true"
      className="absolute inset-0 pointer-events-none select-none overflow-hidden hidden sm:block"
      style={{ zIndex: 0 }}
    >
      {ICONS.map(({ Icon, size, opacity, duration, delay, ...pos }, i) => (
        <div
          key={i}
          className="float-icon absolute"
          style={{
            ...pos,
            animation: `float ${duration} ease-in-out ${delay} infinite`,
            // Hide left/right columns on small screens to avoid overlap
            display: undefined,
          }}
        >
          <div
            className="
              w-12 h-12 rounded-2xl
              bg-white/5 border border-white/10
              flex items-center justify-center
              backdrop-blur-[2px]
              sm:flex
            "
            style={{ opacity }}
          >
            <Icon
              style={{ width: size, height: size }}
              className="text-[#b0f221]"
              strokeWidth={1.5}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
