"use client";

import { useState } from "react";
import AppImage from "@/components/AppImage";

type PhotoProps = {
  src: string;
  alt: string;
  className?: string;
  containerClassName?: string;
  loading?: "lazy" | "eager";
};

export default function Photo({
  src,
  alt,
  className,
  containerClassName,
  loading = "lazy",
}: PhotoProps) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  return (
    <div
      className={`relative overflow-hidden ${containerClassName ?? ""}`}
      aria-busy={!loaded && !errored}
    >
      {!errored ? (
        <>
          <div
            className={`absolute inset-0 bg-[var(--color-surface-primary)]/10 transition-opacity ${
              loaded ? "opacity-0" : "opacity-100 animate-pulse"
            }`}
            aria-hidden="true"
          />
          <AppImage
            src={src}
            alt={alt}
            loading={loading}
            onLoad={() => setLoaded(true)}
            onError={() => setErrored(true)}
            className={`${className ?? ""} transition-opacity duration-300 ${
              loaded ? "opacity-100" : "opacity-0"
            }`}
          />
        </>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-[var(--color-surface-primary)]/10 text-zinc-700">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="m21 15-5-5L5 21" />
          </svg>
        </div>
      )}
    </div>
  );
}
