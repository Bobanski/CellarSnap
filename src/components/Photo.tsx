"use client";

import { useState } from "react";

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

  return (
    <div
      className={`relative overflow-hidden ${containerClassName ?? ""}`}
      aria-busy={!loaded}
    >
      <div
        className={`absolute inset-0 bg-white/5 transition-opacity ${
          loaded ? "opacity-0" : "opacity-100 animate-pulse"
        }`}
        aria-hidden="true"
      />
      <img
        src={src}
        alt={alt}
        loading={loading}
        decoding="async"
        onLoad={() => setLoaded(true)}
        className={`${className ?? ""} transition-opacity duration-300 ${
          loaded ? "opacity-100" : "opacity-0"
        }`}
      />
    </div>
  );
}
