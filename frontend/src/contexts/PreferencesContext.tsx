import { createContext, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { OrdenacaoTransacoes } from "@/lib/ordenacaoTransacoes";

interface PreferencesContextValue {
  hideValues: boolean;
  toggleHideValues: () => void;
  ordenacaoTransacoes: OrdenacaoTransacoes;
  setOrdenacaoTransacoes: (valor: OrdenacaoTransacoes) => void;
}

const STORAGE_KEY = "hideValues";
const ORDENACAO_STORAGE_KEY = "ordenacaoTransacoes";

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

function lerHideValuesInicial(): boolean {
  return localStorage.getItem(STORAGE_KEY) === "true";
}

function lerOrdenacaoInicial(): OrdenacaoTransacoes {
  return localStorage.getItem(ORDENACAO_STORAGE_KEY) === "antigas" ? "antigas" : "recentes";
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [hideValues, setHideValues] = useState(lerHideValuesInicial);
  const [ordenacaoTransacoes, setOrdenacaoTransacoesState] = useState(lerOrdenacaoInicial);

  const value = useMemo<PreferencesContextValue>(
    () => ({
      hideValues,
      toggleHideValues: () =>
        setHideValues((atual) => {
          const proximo = !atual;
          localStorage.setItem(STORAGE_KEY, String(proximo));
          return proximo;
        }),
      ordenacaoTransacoes,
      setOrdenacaoTransacoes: (valor: OrdenacaoTransacoes) => {
        localStorage.setItem(ORDENACAO_STORAGE_KEY, valor);
        setOrdenacaoTransacoesState(valor);
      },
    }),
    [hideValues, ordenacaoTransacoes],
  );

  return <PreferencesContext value={value}>{children}</PreferencesContext>;
}

export function usePreferences() {
  const context = useContext(PreferencesContext);
  if (!context) {
    throw new Error("usePreferences deve ser usado dentro de PreferencesProvider");
  }
  return context;
}
