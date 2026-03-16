let loadPromise: Promise<void> | null = null;

export function loadGoogleMapsScript(): Promise<void> {
  if (loadPromise) return loadPromise;

  if (typeof window === "undefined") {
    return Promise.reject(new Error("Cannot load Google Maps on the server"));
  }

  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!key) {
    loadPromise = Promise.reject(new Error("No Google Maps API key configured"));
    return loadPromise;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const win = window as any;
  if (win.google?.maps?.places) {
    loadPromise = Promise.resolve();
    return loadPromise;
  }

  loadPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Maps script"));
    document.head.appendChild(script);
  });

  return loadPromise;
}
