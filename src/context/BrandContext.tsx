import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";

const STORAGE_KEY = "gemlink-brand-context";

interface BrandData {
  brandName: string;
  brandDescription: string;
  targetAudience: string;
  brandVoice: string;
}

interface BrandContextType extends BrandData {
  setBrandName: (name: string) => void;
  setBrandDescription: (desc: string) => void;
  setTargetAudience: (audience: string) => void;
  setBrandVoice: (voice: string) => void;
}

const DEFAULTS: BrandData = {
  brandName: "FutureTech AI",
  brandDescription: "A forward-thinking AI automation agency.",
  targetAudience: "Small to medium businesses looking to scale with AI.",
  brandVoice: "Professional, innovative, and approachable.",
};

function loadPersistedBrand(): BrandData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw);
    // Validate shape — fall back per-field if anything is wrong
    return {
      brandName: typeof parsed.brandName === "string" ? parsed.brandName : DEFAULTS.brandName,
      brandDescription: typeof parsed.brandDescription === "string" ? parsed.brandDescription : DEFAULTS.brandDescription,
      targetAudience: typeof parsed.targetAudience === "string" ? parsed.targetAudience : DEFAULTS.targetAudience,
      brandVoice: typeof parsed.brandVoice === "string" ? parsed.brandVoice : DEFAULTS.brandVoice,
    };
  } catch {
    // localStorage unavailable or corrupt — use defaults silently
    return DEFAULTS;
  }
}

function persistBrand(data: BrandData) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Silently ignore write failures (e.g. private browsing quota)
  }
}

const BrandContext = createContext<BrandContextType | undefined>(undefined);

export function BrandProvider({ children }: { children: ReactNode }) {
  const [brand, setBrand] = useState<BrandData>(loadPersistedBrand);

  // Persist whenever brand data changes (skip initial mount)
  useEffect(() => {
    persistBrand(brand);
  }, [brand]);

  const setBrandName = useCallback((name: string) => {
    setBrand((prev) => ({ ...prev, brandName: name }));
  }, []);

  const setBrandDescription = useCallback((desc: string) => {
    setBrand((prev) => ({ ...prev, brandDescription: desc }));
  }, []);

  const setTargetAudience = useCallback((audience: string) => {
    setBrand((prev) => ({ ...prev, targetAudience: audience }));
  }, []);

  const setBrandVoice = useCallback((voice: string) => {
    setBrand((prev) => ({ ...prev, brandVoice: voice }));
  }, []);

  return (
    <BrandContext.Provider
      value={{
        ...brand,
        setBrandName,
        setBrandDescription,
        setTargetAudience,
        setBrandVoice,
      }}
    >
      {children}
    </BrandContext.Provider>
  );
}

export function useBrand() {
  const context = useContext(BrandContext);
  if (!context) {
    throw new Error("useBrand must be used within a BrandProvider");
  }
  return context;
}
