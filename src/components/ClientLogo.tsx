import { useState } from "react";

const STORAGE_URL = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/client-logos/`;

interface ClientLogoProps {
  slug: string;
  name: string;
  className?: string;
  /** If true, renders the name as text when all image sources fail */
  fallbackText?: boolean;
}

/**
 * Shared client logo with fallback chain:
 * storage .png → storage .webp → local /logos/.webp → hide (or text)
 */
export function ClientLogo({ slug, name, className = "h-6 w-6 object-contain", fallbackText = false }: ClientLogoProps) {
  const [src, setSrc] = useState(`${STORAGE_URL}${slug}.png`);
  const [failed, setFailed] = useState(false);

  if (failed) {
    return fallbackText ? <span>{name}</span> : <span className={className} />;
  }

  return (
    <img
      key={slug}
      src={src}
      alt={name}
      className={className}
      onError={() => {
        if (src.endsWith(".png")) {
          setSrc(`${STORAGE_URL}${slug}.webp`);
        } else if (src.includes(STORAGE_URL)) {
          setSrc(`/logos/${slug}.webp`);
        } else {
          setFailed(true);
        }
      }}
    />
  );
}
