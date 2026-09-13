import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { OrdenacaoTransacoes } from '@/lib/ordenacaoTransacoes';

export type ColorSchemeOverride = 'system' | 'light' | 'dark';

interface PreferencesContextValue {
  colorSchemeOverride: ColorSchemeOverride;
  setColorSchemeOverride: (value: ColorSchemeOverride) => void;
  hideValues: boolean;
  setHideValues: (value: boolean) => void;
  toggleHideValues: () => void;
  ordenacaoTransacoes: OrdenacaoTransacoes;
  setOrdenacaoTransacoes: (value: OrdenacaoTransacoes) => void;
}

const STORAGE_KEY = '@poupeu/preferencias';

const defaultValue: PreferencesContextValue = {
  colorSchemeOverride: 'system',
  setColorSchemeOverride: () => {},
  hideValues: false,
  setHideValues: () => {},
  toggleHideValues: () => {},
  ordenacaoTransacoes: 'recentes',
  setOrdenacaoTransacoes: () => {},
};

const PreferencesContext = createContext<PreferencesContextValue>(defaultValue);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [colorSchemeOverride, setColorSchemeOverrideState] = useState<ColorSchemeOverride>('system');
  const [hideValues, setHideValuesState] = useState(false);
  const [ordenacaoTransacoes, setOrdenacaoTransacoesState] = useState<OrdenacaoTransacoes>('recentes');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!raw) return;
        const salvo = JSON.parse(raw) as Partial<{
          colorSchemeOverride: ColorSchemeOverride;
          hideValues: boolean;
          ordenacaoTransacoes: OrdenacaoTransacoes;
        }>;
        if (salvo.colorSchemeOverride) setColorSchemeOverrideState(salvo.colorSchemeOverride);
        if (typeof salvo.hideValues === 'boolean') setHideValuesState(salvo.hideValues);
        if (salvo.ordenacaoTransacoes) setOrdenacaoTransacoesState(salvo.ordenacaoTransacoes);
      })
      .catch(() => {});
  }, []);

  function persistir(next: {
    colorSchemeOverride: ColorSchemeOverride;
    hideValues: boolean;
    ordenacaoTransacoes: OrdenacaoTransacoes;
  }) {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  }

  function setColorSchemeOverride(value: ColorSchemeOverride) {
    setColorSchemeOverrideState(value);
    persistir({ colorSchemeOverride: value, hideValues, ordenacaoTransacoes });
  }

  function setHideValues(value: boolean) {
    setHideValuesState(value);
    persistir({ colorSchemeOverride, hideValues: value, ordenacaoTransacoes });
  }

  function toggleHideValues() {
    setHideValues(!hideValues);
  }

  function setOrdenacaoTransacoes(value: OrdenacaoTransacoes) {
    setOrdenacaoTransacoesState(value);
    persistir({ colorSchemeOverride, hideValues, ordenacaoTransacoes: value });
  }

  return (
    <PreferencesContext.Provider
      value={{
        colorSchemeOverride,
        setColorSchemeOverride,
        hideValues,
        setHideValues,
        toggleHideValues,
        ordenacaoTransacoes,
        setOrdenacaoTransacoes,
      }}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences() {
  return useContext(PreferencesContext);
}
