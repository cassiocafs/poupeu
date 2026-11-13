import type { ItemCategoriaPorMesResumo } from "@/api/relatorios";

export interface SerieCategoria {
  chave: string;
  nome: string;
  porMes: number[];
}

function vetorZero(tamanho: number): number[] {
  return new Array(tamanho).fill(0);
}

function somarVetores(a: number[], b: number[]): number[] {
  return a.map((v, i) => v + (b[i] ?? 0));
}

export function totalDaSerie(porMes: number[]): number {
  return porMes.reduce((soma, v) => soma + v, 0);
}

/** Agrupa os itens (nível folha) por categoria pai (`grupo`), somando mês a mês. */
export function agruparPorGrupo(
  dados: ItemCategoriaPorMesResumo[],
  totalMeses: number,
): SerieCategoria[] {
  const porGrupo = new Map<string, SerieCategoria>();
  const soltos: SerieCategoria[] = [];

  for (const item of dados) {
    if (item.grupoId) {
      const atual = porGrupo.get(item.grupoId) ?? {
        chave: item.grupoId,
        nome: item.grupoNome ?? "",
        porMes: vetorZero(totalMeses),
      };
      atual.porMes = somarVetores(atual.porMes, item.porMes);
      porGrupo.set(item.grupoId, atual);
    } else {
      soltos.push({
        chave: item.categoriaId ?? "sem-categoria",
        nome: item.categoriaNome,
        porMes: item.porMes,
      });
    }
  }

  return [...porGrupo.values(), ...soltos];
}

/** Soma elemento a elemento várias séries mensais (usado para a linha/linha "Outros"). */
export function somarSeries(series: SerieCategoria[], totalMeses: number): number[] {
  return series.reduce((acc, s) => somarVetores(acc, s.porMes), vetorZero(totalMeses));
}
