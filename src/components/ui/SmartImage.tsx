import { useEffect, useState } from "react";
import { optimizeImageUrl, type ImageSizePreset } from "@/lib/image-url";

type SmartImageProps = Omit<
  React.ImgHTMLAttributes<HTMLImageElement>,
  "src"
> & {
  src?: string | null;
  preset?: ImageSizePreset;
  fallbackSrc?: string;
};

function resolveSrc(src: string | null | undefined, preset: ImageSizePreset, fallbackSrc: string) {
  const original = src || fallbackSrc;
  if (!original || original === fallbackSrc || original.startsWith("/") || original.startsWith("data:")) {
    return { original, optimized: original };
  }
  return { original, optimized: optimizeImageUrl(original, preset) };
}

/**
 * Serves a size-optimized URL when possible; falls back to the original
 * (then placeholder) if the CDN transform is unavailable.
 */
export function SmartImage({
  src,
  preset = "card",
  fallbackSrc = "/placeholder.png",
  onError,
  ...rest
}: SmartImageProps) {
  const { original, optimized } = resolveSrc(src, preset, fallbackSrc);
  const [current, setCurrent] = useState(optimized);

  useEffect(() => {
    setCurrent(resolveSrc(src, preset, fallbackSrc).optimized);
  }, [src, preset, fallbackSrc]);

  return (
    <img
      {...rest}
      src={current}
      onError={(e) => {
        if (current !== original && original !== fallbackSrc) {
          setCurrent(original);
          return;
        }
        if (current !== fallbackSrc) {
          setCurrent(fallbackSrc);
        }
        onError?.(e);
      }}
    />
  );
}
