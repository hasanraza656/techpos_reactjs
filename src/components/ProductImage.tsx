import { useState } from "react";
import { ImageOff, Package } from "lucide-react";
export type MediaImage = {
  public_id: string;
  url: string;
  width: number;
  height: number;
};
export function ProductImage({
  image,
  name,
  className = "",
}: {
  image?: MediaImage | null;
  name: string;
  className?: string;
}) {
  const [failedUrl, setFailedUrl] = useState("");
  return (
    <span className={`product-photo ${className}`}>
      {image && failedUrl !== image.url ? (
        <img
          src={image.url}
          alt={name}
          loading="lazy"
          decoding="async"
          onError={() => setFailedUrl(image.url)}
        />
      ) : (
        <span
          className="photo-fallback"
          aria-label={
            image ? `Photo unavailable for ${name}` : `No photo for ${name}`
          }
        >
          {image ? <ImageOff size={24} /> : <Package size={24} />}
        </span>
      )}
    </span>
  );
}
