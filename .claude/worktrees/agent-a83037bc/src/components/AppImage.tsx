import type { ComponentPropsWithoutRef } from "react";

type AppImageProps = Omit<ComponentPropsWithoutRef<"img">, "src" | "alt"> & {
  src: string;
  alt: string;
};

export default function AppImage({
  src,
  alt,
  decoding = "async",
  ...props
}: AppImageProps) {
  // These images are served from signed storage URLs and arbitrary remote origins,
  // so we intentionally centralize raw img usage instead of scattering lint disables.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} decoding={decoding} {...props} />;
}
