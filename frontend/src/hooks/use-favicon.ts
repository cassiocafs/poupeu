import { useEffect } from "react";

/**
 * Troca o favicon (ícone da aba do navegador) enquanto o componente estiver
 * montado e restaura o ícone anterior ao desmontar.
 */
export function useFavicon(href: string) {
  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) return;

    const anterior = { href: link.href, type: link.type };
    link.href = href;
    link.type = "image/png";

    return () => {
      link.href = anterior.href;
      link.type = anterior.type;
    };
  }, [href]);
}
