"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { loadGoogleMapsScript } from "@/lib/googleMaps";

type Prediction = {
  place_id: string;
  description: string;
  structured_formatting: {
    main_text: string;
    secondary_text?: string;
  };
};

type LocationAutocompleteProps = {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  biasCoords?: { lat: number; lng: number } | null;
};

const DEBOUNCE_MS = 200;
const MIN_CHARS = 2;
const BIAS_RADIUS_M = 50_000;

type WindowWithGoogleMaps = Window & { google?: { maps?: typeof google.maps } };

function getGoogleMaps(): typeof google.maps | undefined {
  return (window as WindowWithGoogleMaps).google?.maps;
}

export default function LocationAutocomplete({
  value,
  onChange,
  onBlur,
  placeholder = "Optional location",
  biasCoords,
}: LocationAutocompleteProps) {
  const [mapsLoaded, setMapsLoaded] = useState(false);
  const [suggestions, setSuggestions] = useState<Prediction[]>([]);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [open, setOpen] = useState(false);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const serviceRef = useRef<any>(null);
  const browserCoordsRef = useRef<{ lat: number; lng: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sessionTokenRef = useRef<any>(null);

  // Load Google Maps script on mount
  useEffect(() => {
    loadGoogleMapsScript()
      .then(() => {
        const maps = getGoogleMaps();
        serviceRef.current = new maps.places.AutocompleteService();
        sessionTokenRef.current = new maps.places.AutocompleteSessionToken();
        setMapsLoaded(true);
      })
      .catch(() => {
        // Gracefully degrade to plain text input
      });
  }, []);

  // Request browser geolocation as fallback (fire-and-forget)
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        browserCoordsRef.current = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
      },
      () => {
        // Silently ignore geolocation errors
      }
    );
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const fetchPredictions = useCallback(
    (input: string) => {
      if (!serviceRef.current || input.trim().length < MIN_CHARS) {
        setSuggestions([]);
        setOpen(false);
        return;
      }

      const maps = getGoogleMaps();
      const coords = biasCoords ?? browserCoordsRef.current;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const request: any = {
        input,
        sessionToken: sessionTokenRef.current,
      };

      if (coords) {
        request.locationBias = {
          center: coords,
          radius: BIAS_RADIUS_M,
        };
      }

      serviceRef.current.getPlacePredictions(
        request,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (results: any[] | null, status: string) => {
          if (
            status === maps.places.PlacesServiceStatus.OK &&
            results &&
            results.length > 0
          ) {
            setSuggestions(results);
            setHighlightIndex(-1);
            setOpen(true);
          } else {
            setSuggestions([]);
            setOpen(false);
          }
        }
      );
    },
    [biasCoords]
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    onChange(val);

    if (!mapsLoaded) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchPredictions(val), DEBOUNCE_MS);
  };

  const selectSuggestion = (prediction: Prediction) => {
    onChange(prediction.description);
    setSuggestions([]);
    setOpen(false);
    // Rotate session token after a selection
    const maps = getGoogleMaps();
    if (maps) {
      sessionTokenRef.current = new maps.places.AutocompleteSessionToken();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || suggestions.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((prev) =>
        prev < suggestions.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((prev) =>
        prev > 0 ? prev - 1 : suggestions.length - 1
      );
    } else if (e.key === "Enter" && highlightIndex >= 0) {
      e.preventDefault();
      selectSuggestion(suggestions[highlightIndex]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const handleBlur = () => {
    // Delay to allow click on suggestion to register
    setTimeout(() => {
      setOpen(false);
      onBlur?.();
    }, 150);
  };

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={value ?? ""}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (suggestions.length > 0) setOpen(true);
        }}
        onBlur={handleBlur}
        placeholder={placeholder}
        className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300/30"
        autoComplete="off"
      />

      {open && suggestions.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-xl border border-white/10 bg-[#15100f] p-1 shadow-xl">
          {suggestions.map((prediction, index) => {
            const mainText = prediction.structured_formatting.main_text;
            const secondaryText = prediction.structured_formatting.secondary_text;

            return (
              <button
                key={prediction.place_id}
                type="button"
                className={`block w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                  index === highlightIndex
                    ? "bg-white/10 text-zinc-100"
                    : "text-zinc-200 hover:bg-white/10"
                }`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectSuggestion(prediction)}
              >
                <span className="font-medium">{mainText}</span>
                {secondaryText && (
                  <span className="ml-1 text-zinc-400">
                    {secondaryText}
                  </span>
                )}
              </button>
            );
          })}
          <div className="px-3 pb-1 pt-2 text-right text-[10px] text-zinc-500">
            Powered by Google
          </div>
        </div>
      )}
    </div>
  );
}
