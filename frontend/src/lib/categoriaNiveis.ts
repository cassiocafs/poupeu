import { type ItemCategoriaResumo } from "@/api/transacoes";

/**
 * Lógica pura de navegação hierárquica sobre `ItemCategoriaResumo[]`
 * (grupo → subgrupo → categoria folha). Extraída de `CategoriaDrilldownChart`
 * para ser reusada também pela tabela hierárquica de Relatórios.
 * Sem dependência de React — não mude o comportamento sem atualizar ambos os consumidores.
 */

export type Nivel =
  | { tipo: "raiz" }
  | { tipo: "grupo"; id: string; nome: string }
  | { tipo: "subgrupo"; grupoId: string; id: string; nome: string }
  | { tipo: "outros"; nome: string; itens: ItemGrafico[] };

export interface ItemGrafico {
  chave: string;
  nome: string;
  total: number;
  folha: boolean;
  categoriaId?: string | null;
  proximoNivel?: Nivel;
}

export function itensDoNivel(dados: ItemCategoriaResumo[], nivel: Nivel): ItemGrafico[] {
  if (nivel.tipo === "outros") {
    return nivel.itens;
  }

  if (nivel.tipo === "raiz") {
    const porGrupo = new Map<string, { nome: string; total: number }>();
    const soltos: ItemGrafico[] = [];
    for (const item of dados) {
      if (item.grupoId) {
        const atual = porGrupo.get(item.grupoId) ?? { nome: item.grupoNome ?? "", total: 0 };
        atual.total += item.total;
        porGrupo.set(item.grupoId, atual);
      } else {
        soltos.push({
          chave: item.categoriaId ?? "sem-categoria",
          nome: item.categoriaNome,
          total: item.total,
          folha: true,
          categoriaId: item.categoriaId,
        });
      }
    }
    const grupos: ItemGrafico[] = Array.from(porGrupo.entries()).map(([id, v]) => ({
      chave: id,
      nome: v.nome,
      total: v.total,
      folha: false,
      proximoNivel: { tipo: "grupo", id, nome: v.nome },
    }));
    return [...grupos, ...soltos];
  }

  if (nivel.tipo === "grupo") {
    const doGrupo = dados.filter((d) => d.grupoId === nivel.id);
    const porSubgrupo = new Map<string, { nome: string; total: number }>();
    const soltos: ItemGrafico[] = [];
    for (const item of doGrupo) {
      if (item.subgrupoId) {
        const atual = porSubgrupo.get(item.subgrupoId) ?? {
          nome: item.subgrupoNome ?? "",
          total: 0,
        };
        atual.total += item.total;
        porSubgrupo.set(item.subgrupoId, atual);
      } else {
        soltos.push({
          chave: item.categoriaId ?? "sem-categoria",
          nome: item.categoriaNome,
          total: item.total,
          folha: true,
          categoriaId: item.categoriaId,
        });
      }
    }
    const subgrupos: ItemGrafico[] = Array.from(porSubgrupo.entries()).map(([id, v]) => ({
      chave: id,
      nome: v.nome,
      total: v.total,
      folha: false,
      proximoNivel: { tipo: "subgrupo", grupoId: nivel.id, id, nome: v.nome },
    }));
    return [...subgrupos, ...soltos];
  }

  return dados
    .filter((d) => d.subgrupoId === nivel.id)
    .map((item) => ({
      chave: item.categoriaId ?? "sem-categoria",
      nome: item.categoriaNome,
      total: item.total,
      folha: true,
      categoriaId: item.categoriaId,
    }));
}

/** Ids das categorias-folha dentro de um grupo/subgrupo, para abrir as transações de todas elas juntas. */
export function categoriaIdsDoNivel(dados: ItemCategoriaResumo[], nivel: Nivel): string[] {
  const filtro =
    nivel.tipo === "grupo"
      ? (d: ItemCategoriaResumo) => d.grupoId === nivel.id
      : nivel.tipo === "subgrupo"
        ? (d: ItemCategoriaResumo) => d.subgrupoId === nivel.id
        : null;
  if (!filtro) return [];
  return [...new Set(dados.filter(filtro).map((d) => d.categoriaId).filter((id): id is string => !!id))];
}
