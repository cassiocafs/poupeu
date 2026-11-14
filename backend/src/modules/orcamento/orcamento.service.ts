import { prisma } from "../../lib/prisma.js";
import { HttpError } from "../../middlewares/errorHandler.js";
import { diasNoMes, hojeUTC, primeiroDiaMesUTC, ultimoDiaMesUTC } from "../../lib/datas.js";
import { toNumber } from "../../lib/decimal.js";
import { comTempo } from "../../lib/timing.js";
import type { DefinirPrevistoInput } from "./orcamento.schemas.js";

const MESES_JANELA_MEDIA = 12;

async function buscarOrcamentoOuFalhar(espacoId: string, id: string) {
  const orcamento = await prisma.orcamentoAnual.findFirst({ where: { id, espacoId } });
  if (!orcamento) throw new HttpError(404, "Orçamento não encontrado");
  return orcamento;
}

export async function listarAnos(espacoId: string) {
  return prisma.orcamentoAnual.findMany({
    where: { espacoId },
    orderBy: { ano: "desc" },
    select: { id: true, ano: true },
  });
}

export async function criarOrcamento(espacoId: string, ano: number) {
  const existente = await prisma.orcamentoAnual.findFirst({ where: { espacoId, ano } });
  if (existente) throw new HttpError(409, "Já existe um orçamento para este ano");

  return prisma.orcamentoAnual.create({ data: { espacoId, ano } });
}

export interface MediaCategoria {
  categoriaId: string;
  media: number;
}

/** Média mensal de despesa por categoria nos últimos 12 meses, usada para sugerir valores ao criar um orçamento. */
export async function buscarMediasPorCategoria(espacoId: string): Promise<MediaCategoria[]> {
  const hoje = hojeUTC();
  const inicioJanela = new Date(
    Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - (MESES_JANELA_MEDIA - 1), 1),
  );
  const inicio = primeiroDiaMesUTC(inicioJanela.getUTCFullYear(), inicioJanela.getUTCMonth() + 1);
  const fim = ultimoDiaMesUTC(hoje.getUTCFullYear(), hoje.getUTCMonth() + 1);

  const somaPorCategoria = await prisma.transacao.groupBy({
    by: ["categoriaId"],
    where: {
      espacoId,
      tipo: "DESPESA",
      categoriaId: { not: null },
      data: { gte: inicio, lte: fim },
    },
    _sum: { valor: true },
  });

  return somaPorCategoria
    .filter((s) => s.categoriaId !== null)
    .map((s) => ({
      categoriaId: s.categoriaId as string,
      media: Math.abs(toNumber(s._sum.valor)) / MESES_JANELA_MEDIA,
    }));
}

export async function excluirOrcamento(espacoId: string, id: string): Promise<void> {
  await buscarOrcamentoOuFalhar(espacoId, id);

  await prisma.$transaction([
    prisma.orcamentoCategoriaMes.deleteMany({ where: { orcamentoAnualId: id } }),
    prisma.orcamentoAnual.delete({ where: { id } }),
  ]);
}

interface LinhaCategoria {
  categoriaId: string;
  categoriaNome: string;
  previsto: number;
  realizado: number;
  estourado: boolean;
}

export async function buscarGrade(espacoId: string, orcamentoId: string, mes: number) {
  const orcamento = await buscarOrcamentoOuFalhar(espacoId, orcamentoId);
  return montarGrade(espacoId, orcamento, mes);
}

export async function buscarGradePorAno(espacoId: string, ano: number, mes: number) {
  const orcamento = await prisma.orcamentoAnual.findFirst({ where: { espacoId, ano } });
  if (!orcamento) return null;
  return { orcamentoId: orcamento.id, ...(await montarGrade(espacoId, orcamento, mes)) };
}

async function montarGrade(
  espacoId: string,
  orcamento: { id: string; ano: number },
  mes: number,
) {
  return comTempo("montarGrade", { espacoId, ano: orcamento.ano, mes }, () =>
    montarGradeImpl(espacoId, orcamento, mes),
  );
}

async function montarGradeImpl(
  espacoId: string,
  orcamento: { id: string; ano: number },
  mes: number,
) {
  const orcamentoId = orcamento.id;

  const primeiroDia = primeiroDiaMesUTC(orcamento.ano, mes);
  const ultimoDia = ultimoDiaMesUTC(orcamento.ano, mes);

  // Orçamento lida apenas com saídas: só DESPESA entra no grid e nos totais.
  // Queries independentes rodam em paralelo.
  const [itensMes, transacoesDespesaMes, realizadoPorCategoria] = await Promise.all([
    prisma.orcamentoCategoriaMes.findMany({
      where: { orcamentoAnualId: orcamentoId, mes },
      include: { categoria: { include: { grupo: true, subgrupo: true } } },
    }),
    prisma.transacao.findMany({
      where: { espacoId, tipo: "DESPESA", data: { gte: primeiroDia, lte: ultimoDia } },
      select: { data: true, valor: true },
    }),
    prisma.transacao.groupBy({
      by: ["categoriaId"],
      where: {
        espacoId,
        tipo: "DESPESA",
        categoriaId: { not: null },
        data: { gte: primeiroDia, lte: ultimoDia },
      },
      _sum: { valor: true },
    }),
  ]);

  // Categorias de receita não pertencem ao orçamento de saídas.
  const itensMesDespesa = itensMes.filter((i) => i.categoria.tipo !== "RECEITA");
  const categoriaIdsOrcadas = new Set(itensMesDespesa.map((i) => i.categoriaId));

  const realizadoMap = new Map<string, number>();
  for (const r of realizadoPorCategoria) {
    if (!r.categoriaId) continue;
    const atual = realizadoMap.get(r.categoriaId) ?? 0;
    realizadoMap.set(r.categoriaId, atual + Math.abs(toNumber(r._sum.valor)));
  }

  // Categorias com despesa lançada no mês mas fora do orçamento: derivadas do
  // próprio groupBy acima, sem uma query extra de transações.
  const idsCategoriasExtras = [...realizadoMap.keys()].filter(
    (id) => !categoriaIdsOrcadas.has(id),
  );
  const categoriasExtras =
    idsCategoriasExtras.length > 0
      ? await prisma.categoria.findMany({
          where: { id: { in: idsCategoriasExtras }, tipo: { not: "RECEITA" } },
          include: { grupo: true, subgrupo: true },
        })
      : [];

  interface SubgrupoBucket {
    subgrupoId: string;
    subgrupoNome: string;
    ordem: number;
    categorias: LinhaCategoria[];
    subtotalPrevisto: number;
    subtotalRealizado: number;
  }
  interface GrupoBucket {
    grupoId: string;
    grupoNome: string;
    ordem: number;
    categorias: LinhaCategoria[];
    subgruposMap: Map<string, SubgrupoBucket>;
    subtotalPrevisto: number;
    subtotalRealizado: number;
  }

  const gruposMap = new Map<string, GrupoBucket>();
  const semGrupoCategorias: LinhaCategoria[] = [];
  let totalPrevisto = 0;
  let totalRealizado = 0;

  const itensParaExibir = [
    ...itensMesDespesa.map((i) => ({
      categoriaId: i.categoriaId,
      valorPrevisto: toNumber(i.valorPrevisto),
      categoria: i.categoria,
    })),
    ...categoriasExtras.map((c) => ({ categoriaId: c.id, valorPrevisto: 0, categoria: c })),
  ];

  for (const item of itensParaExibir) {
    const previsto = item.valorPrevisto;
    const realizado = realizadoMap.get(item.categoriaId) ?? 0;
    totalPrevisto += previsto;
    totalRealizado += realizado;

    const linha: LinhaCategoria = {
      categoriaId: item.categoriaId,
      categoriaNome: item.categoria.nome,
      previsto,
      realizado,
      estourado: realizado > previsto,
    };

    const grupo = item.categoria.grupo;
    const subgrupo = item.categoria.subgrupo;
    if (grupo) {
      const bucket = gruposMap.get(grupo.id) ?? {
        grupoId: grupo.id,
        grupoNome: grupo.nome,
        ordem: grupo.ordem,
        categorias: [],
        subgruposMap: new Map<string, SubgrupoBucket>(),
        subtotalPrevisto: 0,
        subtotalRealizado: 0,
      };
      bucket.subtotalPrevisto += previsto;
      bucket.subtotalRealizado += realizado;

      if (subgrupo) {
        const subBucket = bucket.subgruposMap.get(subgrupo.id) ?? {
          subgrupoId: subgrupo.id,
          subgrupoNome: subgrupo.nome,
          ordem: subgrupo.ordem,
          categorias: [],
          subtotalPrevisto: 0,
          subtotalRealizado: 0,
        };
        subBucket.categorias.push(linha);
        subBucket.subtotalPrevisto += previsto;
        subBucket.subtotalRealizado += realizado;
        bucket.subgruposMap.set(subgrupo.id, subBucket);
      } else {
        bucket.categorias.push(linha);
      }

      gruposMap.set(grupo.id, bucket);
    } else {
      semGrupoCategorias.push(linha);
    }
  }

  const totalDias = diasNoMes(orcamento.ano, mes);

  const somaPorDia = new Array<number>(totalDias + 1).fill(0);
  for (const t of transacoesDespesaMes) {
    somaPorDia[t.data.getUTCDate()] += Math.abs(toNumber(t.valor));
  }

  let acumulado = 0;
  const serieDiaria = [];
  for (let dia = 1; dia <= totalDias; dia++) {
    acumulado += somaPorDia[dia];
    serieDiaria.push({
      dia,
      realizadoAcumulado: acumulado,
      previstoAcumulado: totalPrevisto * (dia / totalDias),
    });
  }

  const grupos = [...gruposMap.values()]
    .sort((a, b) => a.ordem - b.ordem)
    .map((g) => ({
      grupoId: g.grupoId,
      grupoNome: g.grupoNome,
      categorias: g.categorias,
      subtotalPrevisto: g.subtotalPrevisto,
      subtotalRealizado: g.subtotalRealizado,
      subgrupos: [...g.subgruposMap.values()]
        .sort((a, b) => a.ordem - b.ordem)
        .map(({ subgrupoId, subgrupoNome, categorias, subtotalPrevisto, subtotalRealizado }) => ({
          subgrupoId,
          subgrupoNome,
          categorias,
          subtotalPrevisto,
          subtotalRealizado,
        })),
    }));
  if (semGrupoCategorias.length > 0) {
    grupos.push({
      grupoId: null as unknown as string,
      grupoNome: "Sem grupo",
      categorias: semGrupoCategorias,
      subtotalPrevisto: semGrupoCategorias.reduce((s, c) => s + c.previsto, 0),
      subtotalRealizado: semGrupoCategorias.reduce((s, c) => s + c.realizado, 0),
      subgrupos: [],
    });
  }

  return { ano: orcamento.ano, mes, grupos, totalPrevisto, totalRealizado, serieDiaria };
}

export async function definirPrevisto(
  espacoId: string,
  orcamentoId: string,
  input: DefinirPrevistoInput,
): Promise<void> {
  await buscarOrcamentoOuFalhar(espacoId, orcamentoId);

  const categoria = await prisma.categoria.findFirst({
    where: { id: input.categoriaId, espacoId },
  });
  if (!categoria) throw new HttpError(404, "Categoria não encontrada");

  const valores =
    input.modo === "mesmoValorTodosMeses"
      ? new Array(12).fill(input.valor)
      : input.valoresPorMes;

  await prisma.$transaction(
    valores.map((valorPrevisto, index) =>
      prisma.orcamentoCategoriaMes.upsert({
        where: {
          orcamentoAnualId_categoriaId_mes: {
            orcamentoAnualId: orcamentoId,
            categoriaId: input.categoriaId,
            mes: index + 1,
          },
        },
        update: { valorPrevisto },
        create: {
          orcamentoAnualId: orcamentoId,
          categoriaId: input.categoriaId,
          mes: index + 1,
          valorPrevisto,
        },
      }),
    ),
  );
}

export async function removerCategoriaDoOrcamento(
  espacoId: string,
  orcamentoId: string,
  categoriaId: string,
): Promise<void> {
  await buscarOrcamentoOuFalhar(espacoId, orcamentoId);

  await prisma.orcamentoCategoriaMes.deleteMany({
    where: { orcamentoAnualId: orcamentoId, categoriaId },
  });
}
