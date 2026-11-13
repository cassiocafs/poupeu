import { apiFetch } from "./client";
import type { ItemCategoriaResumo, PeriodoMes } from "./transacoes";

export interface RelatorioMes {
  ano: number;
  mes: number;
  receitas: number;
  despesas: number;
  resultado: number;
}

export interface ItemCategoriaPorMesResumo {
  categoriaId: string | null;
  categoriaNome: string;
  grupoId: string | null;
  grupoNome: string | null;
  subgrupoId: string | null;
  subgrupoNome: string | null;
  porMes: number[];
}

export interface RelatorioResponse {
  periodo: { inicio: PeriodoMes; fim: PeriodoMes };
  meses: RelatorioMes[];
  totais: { receitas: number; despesas: number; resultado: number };
  despesasPorCategoria: ItemCategoriaResumo[];
  receitasPorCategoria: ItemCategoriaResumo[];
  despesasPorCategoriaPorMes: ItemCategoriaPorMesResumo[];
  receitasPorCategoriaPorMes: ItemCategoriaPorMesResumo[];
}

export function buscarRelatorio(
  inicio: PeriodoMes,
  fim: PeriodoMes,
  opts?: { contaIds?: string[]; tipo?: "DESPESA" | "RECEITA" },
): Promise<RelatorioResponse> {
  const params = new URLSearchParams({
    anoInicio: String(inicio.ano),
    mesInicio: String(inicio.mes),
    anoFim: String(fim.ano),
    mesFim: String(fim.mes),
  });
  if (opts?.contaIds?.length) params.set("contaIds", opts.contaIds.join(","));
  if (opts?.tipo) params.set("tipo", opts.tipo);
  return apiFetch<RelatorioResponse>(`/api/transacoes/relatorio?${params.toString()}`);
}
