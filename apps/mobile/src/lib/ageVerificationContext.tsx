import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getAgeVerified, setAgeVerified } from "@/src/lib/ageVerification";

type AgeVerificationContextValue = {
  ageChecked: boolean;
  ageVerified: boolean;
  confirmAgeVerification: () => Promise<void>;
};

const AgeVerificationContext = createContext<AgeVerificationContextValue | null>(null);

export function AgeVerificationProvider({ children }: { children: ReactNode }) {
  const [ageChecked, setAgeChecked] = useState(false);
  const [ageVerified, setAgeVerifiedState] = useState(false);

  useEffect(() => {
    let isMounted = true;

    void (async () => {
      const verified = await getAgeVerified();
      if (!isMounted) {
        return;
      }
      setAgeVerifiedState(verified);
      setAgeChecked(true);
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  const value = useMemo<AgeVerificationContextValue>(
    () => ({
      ageChecked,
      ageVerified,
      confirmAgeVerification: async () => {
        await setAgeVerified();
        setAgeVerifiedState(true);
      },
    }),
    [ageChecked, ageVerified]
  );

  return (
    <AgeVerificationContext.Provider value={value}>
      {children}
    </AgeVerificationContext.Provider>
  );
}

export function useAgeVerification() {
  const context = useContext(AgeVerificationContext);
  if (!context) {
    throw new Error("useAgeVerification must be used within AgeVerificationProvider.");
  }
  return context;
}
