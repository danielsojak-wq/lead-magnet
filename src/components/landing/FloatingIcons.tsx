import { ThumbsUp, Heart, MessageCircle, Share2, Bookmark, Send, Repeat2 } from "lucide-react";

const ICONS = [
  // Left side
  { Icon: ThumbsUp,      top: "10%", left: "3%",   size: 32, opacity: 0.45, duration: "4.2s", delay: "0s"   },
  { Icon: MessageCircle, top: "38%", left: "2%",   size: 28, opacity: 0.38, duration: "5.8s", delay: "1.1s" },
  { Icon: Heart,         top: "66%", left: "6%",   size: 30, opacity: 0.50, duration: "3.9s", delay: "0.5s" },
  // Right side
  { Icon: Share2,        top: "8%",  right: "4%",  size: 28, opacity: 0.40, duration: "5.1s", delay: "1.7s" },
  { Icon: Bookmark,      top: "42%", right: "3%",  size: 26, opacity: 0.35, duration: "4.6s", delay: "0.3s" },
  { Icon: Send,          top: "68%", right: "7%",  size: 28, opacity: 0.42, duration: "6.0s", delay: "2.0s" },
  // Top gap
  { Icon: Repeat2,       top: "3%",  left: "47%",  size: 22, opacity: 0.30, duration: "4.8s", delay: "0.9s" },
] as const;

export function FloatingIcons() {
  return (
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
          }}
        >
          <div
            className="w-14 h-14 rounded-2xl bg-white/8 border border-white/15 flex items-center justify-center backdrop-blur-[2px]"
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
