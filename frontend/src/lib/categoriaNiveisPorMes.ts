import type { ItemCategoriaPorMesResumo } from "@/api/relatorios";

/**
 * Mesma lógica de navegação hierárquica de `categoriaNiveis.ts` (grupo → subgrupo →
 * categoria), mas agregando um vetor de valores por mês em vez de um total único —
 * usado pela tabela pivot de Relatórios. Duplicada de propósito para não acoplar
 * o componente de valor único (`TabelaHierarquicaCategorias`) a este formato.
 */
export type NivelMes =
  | { tipo: "raiz" }
  | { tipo: "grupo"; id: string; nome: string }
  | { tipo: "subgrupo"; grupoId: string; id: string; nome: string };

export interface ItemPivot {
  chave: string;
  nome: string;
  folha: boolean;
  categoriaId?: string | null;
  proximoNivel?: NivelMes;
  porMes: number[];
}

function vetorZero(tamanho: number): number[] {
  return new Array(tamanho).fill(0);
}

function somarVetores(a: number[], b: number[]): number[] {
  return a.map((v, i) => v + (b[i] ?? 0));
}

export function itensPivotDoNivel(
  dados: ItemCategoriaPorMesResumo[],
  nivel: NivelMes,
  totalMeses: number,
): ItemPivot[] {
  if (nivel.tipo === "raiz") {
    const porGrupo = new Map<string, { nome: string; porMes: number[] }>();
    const soltos: ItemPivot[] = [];
    for (const item of dados) {
      if (item.grupoId) {
        const atual = porGrupo.get(item.grupoId) ?? { nome: item.grupoNome ?? "", porMes: vetorZero(totalMeses) };
        atual.porMes = somarVetores(atual.porMes, item.porMes);
        porGrupo.set(item.grupoId, atual);
      } else {
        soltos.push({
          chave: item.categoriaId ?? "sem-categoria",
          nome: item.categoriaNome,
          folha: true,
          categoriaId: item.categoriaId,
          porMes: item.porMes,
        });
      }
    }
    const grupos: ItemPivot[] = Array.from(porGrupo.entries()).map(([id, v]) => ({
      chave: id,
      nome: v.nome,
      folha: false,
      proximoNivel: { tipo: "grupo", id, nome: v.nome },
      porMes: v.porMes,
    }));
    return [...grupos, ...soltos];
  }

  if (nivel.tipo === "grupo") {
    const doGrupo = dados.filter((d) => d.grupoId === nivel.id);
    const porSubgrupo = new Map<string, { nome: string; porMes: number[] }>();
    const soltos: ItemPivot[] = [];
    for (const item of doGrupo) {
      if (item.subgrupoId) {
        const atual = porSubgrupo.get(item.subgrupoId) ?? {
          nome: item.subgrupoNome ?? "",
          porMes: vetorZero(totalMeses),
        };
        atual.porMes = somarVetores(atual.porMes, item.porMes);
        porSubgrupo.set(item.subgrupoId, atual);
      } else {
        soltos.push({
          chave: item.categoriaId ?? "sem-categoria",
          nome: item.categoriaNome,
          folha: true,
          categoriaId: item.categoriaId,
          porMes: item.porMes,
        });
      }
    }
    const subgrupos: ItemPivot[] = Array.from(porSubgrupo.entries()).map(([id, v]) => ({
      chave: id,
      nome: v.nome,
      folha: false,
      proximoNivel: { tipo: "subgrupo", grupoId: nivel.id, id, nome: v.nome },
      porMes: v.porMes,
    }));
    return [...subgrupos, ...soltos];
  }

  return dados
    .filter((d) => d.subgrupoId === nivel.id)
    .map((item) => ({
      chave: item.categoriaId ?? "sem-categoria",
      nome: item.categoriaNome,
      folha: true,
      categoriaId: item.categoriaId,
      porMes: item.porMes,
    }));
}
