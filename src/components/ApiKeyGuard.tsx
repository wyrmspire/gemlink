import { useState, useEffect, ReactNode, createContext, useContext } from "react";
import { Key } from "lucide-react";

// Add type definitions for the global window.aistudio object
declare global {
  interface Window {
    aistudio?: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

interface ApiKeyContextType {
  resetKey: () => void;
}

const ApiKeyContext = createContext<ApiKeyContextType | undefined>(undefined);

export function useApiKey() {
  const context = useContext(ApiKeyContext);
  if (!context) {
    throw new Error("useApiKey must be used within an ApiKeyGuard");
  }
  return context;
}

export default function ApiKeyGuard({ children }: { children: ReactNode }) {
  const [hasKey, setHasKey] = useState<boolean | null>(null);

  useEffect(() => {
    const checkKey = async () => {
      if (window.aistudio?.hasSelectedApiKey) {
        const selected = await window.aistudio.hasSelectedApiKey();
        setHasKey(selected);
      } else {
        // If the API isn't available, assume we have a key (e.g., local dev)
        setHasKey(true);
      }
    };
    checkKey();
  }, []);

  const handleSelectKey = async () => {
    if (window.aistudio?.openSelectKey) {
      await window.aistudio.openSelectKey();
      // Assume success to mitigate race conditions as per guidelines
      setHasKey(true);
    }
  };

  const resetKey = () => {
    setHasKey(false);
  };

  if (hasKey === null) {
    return (
      <div className="flex items-center justify-center h-screen bg-zinc-950 text-zinc-400">
        Checking API key status...
      </div>
    );
  }

  if (!hasKey) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-zinc-950 text-white p-6">
        <div className="bg-zinc-900 border border-zinc-800 p-8 rounded-2xl max-w-md w-full text-center">
          <div className="w-16 h-16 bg-indigo-500/10 rounded-full flex items-center justify-center mx-auto mb-6 text-indigo-400">
            <Key className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold mb-4">API Key Required</h1>
          <p className="text-zinc-400 mb-8">
            This application uses advanced models like Veo and Nano Banana Pro which require a paid Google Cloud project API key.
            <br /><br />
            For more information, see the <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline">billing documentation</a>.
          </p>
          <button
            onClick={handleSelectKey}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 px-4 rounded-xl transition-colors"
          >
            Select API Key
          </button>
        </div>
      </div>
    );
  }

  return (
    <ApiKeyContext.Provider value={{ resetKey }}>
      {children}
    </ApiKeyContext.Provider>
  );
}
