import { apiFetch } from "./client";

export interface AnoOrcamento {
  id: string;
  ano: number;
}

export interface CategoriaGrade {
  categoriaId: string;
  categoriaNome: string;
  previsto: number;
  realizado: number;
  estourado: boolean;
}

export interface SubgrupoGrade {
  subgrupoId: string;
  subgrupoNome: string;
  categorias: CategoriaGrade[];
  subtotalPrevisto: number;
  subtotalRealizado: number;
}

export interface GrupoGrade {
  grupoId: string | null;
  grupoNome: string;
  categorias: CategoriaGrade[];
  subgrupos: SubgrupoGrade[];
  subtotalPrevisto: number;
  subtotalRealizado: number;
}

export interface PontoSerie {
  dia: number;
  realizadoAcumulado: number;
  previstoAcumulado: number;
}

export interface GradeOrcamento {
  ano: number;
  mes: number;
  grupos: GrupoGrade[];
  totalPrevisto: number;
  totalRealizado: number;
  serieDiaria: PontoSerie[];
}

export type DefinirPrevistoInput =
  | { categoriaId: string; modo: "mesmoValorTodosMeses"; valor: number }
  | { categoriaId: string; modo: "porMes"; valoresPorMes: number[] };

export interface MediaCategoria {
  categoriaId: string;
  media: number;
}

export function listarAnosOrcamento(): Promise<AnoOrcamento[]> {
  return apiFetch<AnoOrcamento[]>("/api/orcamento/anos");
}

export function buscarMediasPorCategoria(): Promise<MediaCategoria[]> {
  return apiFetch<MediaCategoria[]>("/api/orcamento/medias");
}

export function criarOrcamento(ano: number): Promise<AnoOrcamento> {
  return apiFetch<AnoOrcamento>("/api/orcamento", {
    method: "POST",
    body: JSON.stringify({ ano }),
  });
}

export function excluirOrcamento(id: string): Promise<void> {
  return apiFetch<void>(`/api/orcamento/${id}`, { method: "DELETE" });
}

export function buscarGradeOrcamento(id: string, mes: number): Promise<GradeOrcamento> {
  return apiFetch<GradeOrcamento>(`/api/orcamento/${id}/itens?mes=${mes}`);
}

export function buscarGradeOrcamentoPorAno(
  ano: number,
  mes: number,
): Promise<(GradeOrcamento & { orcamentoId: string }) | null> {
  return apiFetch<(GradeOrcamento & { orcamentoId: string }) | null>(
    `/api/orcamento/grade?ano=${ano}&mes=${mes}`,
  );
}

export function definirPrevisto(id: string, input: DefinirPrevistoInput): Promise<void> {
  return apiFetch<void>(`/api/orcamento/${id}/itens`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function removerCategoriaDoOrcamento(id: string, categoriaId: string): Promise<void> {
  return apiFetch<void>(`/api/orcamento/${id}/itens/${categoriaId}`, { method: "DELETE" });
}
