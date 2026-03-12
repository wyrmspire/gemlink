import { createContext, useContext, useState, ReactNode } from "react";

interface BrandContextType {
  brandName: string;
  setBrandName: (name: string) => void;
  brandDescription: string;
  setBrandDescription: (desc: string) => void;
  targetAudience: string;
  setTargetAudience: (audience: string) => void;
  brandVoice: string;
  setBrandVoice: (voice: string) => void;
}

const BrandContext = createContext<BrandContextType | undefined>(undefined);

export function BrandProvider({ children }: { children: ReactNode }) {
  const [brandName, setBrandName] = useState("FutureTech AI");
  const [brandDescription, setBrandDescription] = useState("A forward-thinking AI automation agency.");
  const [targetAudience, setTargetAudience] = useState("Small to medium businesses looking to scale with AI.");
  const [brandVoice, setBrandVoice] = useState("Professional, innovative, and approachable.");

  return (
    <BrandContext.Provider
      value={{
        brandName,
        setBrandName,
        brandDescription,
        setBrandDescription,
        targetAudience,
        setTargetAudience,
        brandVoice,
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
