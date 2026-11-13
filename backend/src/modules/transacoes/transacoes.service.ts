import { Prisma } from "@prisma/client";
import type { Transacao } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { HttpError } from "../../middlewares/errorHandler.js";
import {
  formatDataISO,
  hojeUTC,
  primeiroDiaMesUTC,
  ultimoDiaMesUTC,
} from "../../lib/datas.js";
import { toNumber } from "../../lib/decimal.js";
import { comTempo } from "../../lib/timing.js";
import { aprenderComTransacao } from "../regras/regras.service.js";
import { listarContas } from "../contas/contas.service.js";
import { buscarGradePorAno } from "../orcamento/orcamento.service.js";
import { listarMetas } from "../metas/metas.service.js";
import type {
  CriarTransacaoInput,
  CriarTransferenciaInput,
  EditarTransacaoInput,
  FluxoCaixaQuery,
  ListarTransacoesQuery,
} from "./transacoes.schemas.js";

const TRANSACAO_INCLUDE = {
  conta: { select: { id: true, nome: true } },
  categoria: { select: { id: true, nome: true } },
} satisfies Prisma.TransacaoInclude;

const NOME_CATEGORIA_TRANSFERENCIA = "Transferência";
const LIMITE_RECENTES = 6;

const CATEGORIA_RESUMO_INCLUDE = {
  conta: { select: { id: true, nome: true } },
  categoria: {
    select: {
      id: true,
      nome: true,
      grupoId: true,
      grupo: { select: { id: true, nome: true } },
      subgrupoId: true,
      subgrupo: { select: { id: true, nome: true } },
    },
  },
} satisfies Prisma.TransacaoInclude;

export interface ItemCategoriaResumo {
  categoriaId: string | null;
  categoriaNome: string;
  grupoId: string | null;
  grupoNome: string | null;
  subgrupoId: string | null;
  subgrupoNome: string | null;
  total: number;
}

function acumularPorCategoria(
  mapa: Map<string, ItemCategoriaResumo>,
  t: {
    categoriaId: string | null;
    categoria: {
      nome: string;
      grupoId: string | null;
      grupo: { nome: string } | null;
      subgrupoId: string | null;
      subgrupo: { nome: string } | null;
    } | null;
  },
  valorAbsoluto: number,
): void {
  const chave = t.categoriaId ?? "sem-categoria";
  const atual = mapa.get(chave) ?? {
    categoriaId: t.categoriaId,
    categoriaNome: t.categoria?.nome ?? "Sem Categoria",
    grupoId: t.categoria?.grupoId ?? null,
    grupoNome: t.categoria?.grupo?.nome ?? null,
    subgrupoId: t.categoria?.subgrupoId ?? null,
    subgrupoNome: t.categoria?.subgrupo?.nome ?? null,
    total: 0,
  };
  atual.total += valorAbsoluto;
  mapa.set(chave, atual);
}

type TransacaoComRelacoes = Prisma.TransacaoGetPayload<{ include: typeof TRANSACAO_INCLUDE }>;

interface TransacaoDTO {
  id: string;
  tipo: string;
  data: string;
  descricao: string;
  contaId: string;
  conta: { id: string; nome: string };
  categoriaId: string | null;
  categoria: { id: string; nome: string } | null;
  valor: number;
  consolidado: boolean;
  nota: string | null;
  transferenciaGrupoId: string | null;
}

function serializarTransacao(t: TransacaoComRelacoes): TransacaoDTO {
  return {
    id: t.id,
    tipo: t.tipo,
    data: formatDataISO(t.data),
    descricao: t.descricao,
    contaId: t.contaId,
    conta: t.conta,
    categoriaId: t.categoriaId,
    categoria: t.categoria,
    valor: toNumber(t.valor),
    consolidado: t.consolidado,
    nota: t.nota,
    transferenciaGrupoId: t.transferenciaGrupoId,
  };
}

function valorComSinal(tipo: "DESPESA" | "RECEITA", valorPositivo: number): number {
  return tipo === "DESPESA" ? -Math.abs(valorPositivo) : Math.abs(valorPositivo);
}

// Fire-and-forget: aprender a regra não deve atrasar a resposta ao usuário
// nem falhar a operação principal caso o upsert dê erro.
function dispararAprendizado(
  espacoId: string,
  descricao: string,
  contaId: string,
  categoriaId: string | null,
): void {
  aprenderComTransacao(espacoId, descricao, contaId, categoriaId).catch((err) => {
    console.error("Falha ao aprender regra a partir da transação", err);
  });
}

async function buscarContaOuFalhar(espacoId: string, id: string) {
  const conta = await prisma.conta.findFirst({ where: { id, espacoId } });
  if (!conta) throw new HttpError(404, "Conta não encontrada");
  return conta;
}

async function buscarCategoriaOuFalhar(espacoId: string, id: string) {
  const categoria = await prisma.categoria.findFirst({ where: { id, espacoId } });
  if (!categoria) throw new HttpError(404, "Categoria não encontrada");
  return categoria;
}

async function buscarTransacaoOuFalhar(espacoId: string, id: string): Promise<Transacao> {
  const transacao = await prisma.transacao.findFirst({ where: { id, espacoId } });
  if (!transacao) throw new HttpError(404, "Transação não encontrada");
  return transacao;
}

export async function buscarTransacao(espacoId: string, id: string): Promise<TransacaoDTO> {
  const transacao = await prisma.transacao.findFirst({
    where: { id, espacoId },
    include: TRANSACAO_INCLUDE,
  });
  if (!transacao) throw new HttpError(404, "Transação não encontrada");
  return serializarTransacao(transacao);
}

export interface TransferenciaDTO {
  transferenciaGrupoId: string;
  contaOrigem: { id: string; nome: string } | null;
  contaDestino: { id: string; nome: string } | null;
  transacoes: TransacaoDTO[];
}

export async function buscarTransferencia(
  espacoId: string,
  grupoId: string,
): Promise<TransferenciaDTO> {
  const transacoes = await prisma.transacao.findMany({
    where: { espacoId, transferenciaGrupoId: grupoId },
    include: TRANSACAO_INCLUDE,
  });
  if (transacoes.length === 0) throw new HttpError(404, "Transferência não encontrada");

  const origem = transacoes.find((t) => toNumber(t.valor) < 0) ?? null;
  const destino = transacoes.find((t) => toNumber(t.valor) > 0) ?? null;

  return {
    transferenciaGrupoId: grupoId,
    contaOrigem: origem?.conta ?? null,
    contaDestino: destino?.conta ?? null,
    transacoes: transacoes.map(serializarTransacao),
  };
}

export async function criarTransacao(
  espacoId: string,
  input: CriarTransacaoInput,
): Promise<TransacaoDTO> {
  if (input.id) {
    const existente = await prisma.transacao.findUnique({
      where: { id: input.id },
      include: TRANSACAO_INCLUDE,
    });
    if (existente) {
      if (existente.espacoId !== espacoId) {
        throw new HttpError(409, "Identificador já utilizado por outra transação");
      }
      return serializarTransacao(existente);
    }
  }

  await Promise.all([
    buscarContaOuFalhar(espacoId, input.contaId),
    input.categoriaId ? buscarCategoriaOuFalhar(espacoId, input.categoriaId) : Promise.resolve(),
  ]);

  let transacao;
  try {
    transacao = await prisma.transacao.create({
      data: {
        ...(input.id ? { id: input.id } : {}),
        espacoId,
        tipo: input.tipo,
        data: input.data,
        descricao: input.descricao,
        contaId: input.contaId,
        categoriaId: input.categoriaId ?? null,
        valor: valorComSinal(input.tipo, input.valor),
        consolidado: input.consolidado,
        nota: input.nota,
      },
      include: TRANSACAO_INCLUDE,
    });
  } catch (err) {
    // Corrida entre duas tentativas do mesmo id (ex.: retry de sincronização
    // offline concorrente): a segunda chamada perde a checagem de replay
    // acima, mas ainda pode devolver o registro que a primeira acabou de criar.
    if (input.id && err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const existente = await prisma.transacao.findUnique({
        where: { id: input.id },
        include: TRANSACAO_INCLUDE,
      });
      if (existente && existente.espacoId === espacoId) {
        return serializarTransacao(existente);
      }
    }
    throw err;
  }

  dispararAprendizado(espacoId, input.descricao, input.contaId, input.categoriaId ?? null);

  return serializarTransacao(transacao);
}

const CAMPOS_PERMITIDOS_EM_TRANSFERENCIA = new Set(["data", "descricao", "nota", "consolidado"]);

export async function editarTransacao(
  espacoId: string,
  id: string,
  input: EditarTransacaoInput,
): Promise<TransacaoDTO> {
  const transacao = await buscarTransacaoOuFalhar(espacoId, id);

  if (transacao.transferenciaGrupoId) {
    const camposNaoPermitidos = Object.keys(input).filter(
      (campo) => !CAMPOS_PERMITIDOS_EM_TRANSFERENCIA.has(campo),
    );
    if (camposNaoPermitidos.length > 0) {
      throw new HttpError(
        400,
        "Use o endpoint de transferências para alterar valor ou contas de uma transferência",
      );
    }

    const dadosComuns: Prisma.TransacaoUpdateInput = {
      ...(input.data !== undefined ? { data: input.data } : {}),
      ...(input.descricao !== undefined ? { descricao: input.descricao } : {}),
      ...(input.nota !== undefined ? { nota: input.nota } : {}),
      ...(input.consolidado !== undefined ? { consolidado: input.consolidado } : {}),
    };

    const [atualizada] = await prisma.$transaction([
      prisma.transacao.update({
        where: { id },
        data: dadosComuns,
        include: TRANSACAO_INCLUDE,
      }),
      prisma.transacao.updateMany({
        where: { espacoId, transferenciaGrupoId: transacao.transferenciaGrupoId, id: { not: id } },
        data: dadosComuns,
      }),
    ]);

    return serializarTransacao(atualizada);
  }

  await Promise.all([
    input.contaId ? buscarContaOuFalhar(espacoId, input.contaId) : Promise.resolve(),
    input.categoriaId ? buscarCategoriaOuFalhar(espacoId, input.categoriaId) : Promise.resolve(),
  ]);

  const tipoFinal = (input.tipo ?? transacao.tipo) as "DESPESA" | "RECEITA";
  const valorPositivo = input.valor ?? Math.abs(toNumber(transacao.valor));

  const atualizada = await prisma.transacao.update({
    where: { id },
    data: {
      tipo: tipoFinal,
      ...(input.data !== undefined ? { data: input.data } : {}),
      ...(input.descricao !== undefined ? { descricao: input.descricao } : {}),
      ...(input.contaId !== undefined ? { contaId: input.contaId } : {}),
      ...(input.categoriaId !== undefined ? { categoriaId: input.categoriaId } : {}),
      valor: valorComSinal(tipoFinal, valorPositivo),
      ...(input.consolidado !== undefined ? { consolidado: input.consolidado } : {}),
      ...(input.nota !== undefined ? { nota: input.nota } : {}),
    },
    include: TRANSACAO_INCLUDE,
  });

  dispararAprendizado(espacoId, atualizada.descricao, atualizada.contaId, atualizada.categoriaId);

  return serializarTransacao(atualizada);
}

export async function excluirTransacao(espacoId: string, id: string): Promise<void> {
  const transacao = await buscarTransacaoOuFalhar(espacoId, id);

  if (transacao.transferenciaGrupoId) {
    await prisma.transacao.deleteMany({
      where: { espacoId, transferenciaGrupoId: transacao.transferenciaGrupoId },
    });
    return;
  }

  await prisma.transacao.delete({ where: { id } });
}

export async function excluirTransacoesLote(
  espacoId: string,
  ids: string[],
): Promise<{ excluidas: number }> {
  const transacoes = await prisma.transacao.findMany({
    where: { espacoId, id: { in: ids } },
    select: { transferenciaGrupoId: true },
  });
  const grupos = transacoes
    .map((t) => t.transferenciaGrupoId)
    .filter((g): g is string => !!g);

  const resultado = await prisma.transacao.deleteMany({
    where: {
      espacoId,
      OR: [{ id: { in: ids } }, { transferenciaGrupoId: { in: grupos } }],
    },
  });

  return { excluidas: resultado.count };
}

export async function consolidarLote(
  espacoId: string,
  ids: string[],
  consolidado: boolean,
): Promise<{ atualizadas: number }> {
  const resultado = await prisma.transacao.updateMany({
    where: { espacoId, id: { in: ids } },
    data: { consolidado },
  });
  return { atualizadas: resultado.count };
}

export async function categorizarLote(
  espacoId: string,
  ids: string[],
  categoriaId: string | null,
): Promise<{ atualizadas: number }> {
  if (categoriaId) await buscarCategoriaOuFalhar(espacoId, categoriaId);

  const resultado = await prisma.transacao.updateMany({
    where: { espacoId, id: { in: ids }, tipo: { not: "TRANSFERENCIA" } },
    data: { categoriaId },
  });
  return { atualizadas: resultado.count };
}

export async function criarTransferencia(
  espacoId: string,
  input: CriarTransferenciaInput,
) {
  if (input.transferenciaGrupoId) {
    const existentes = await prisma.transacao.findMany({
      where: { espacoId, transferenciaGrupoId: input.transferenciaGrupoId },
      include: TRANSACAO_INCLUDE,
    });
    if (existentes.length > 0) {
      return montarResultadoTransferencia(input.transferenciaGrupoId, existentes);
    }
  }

  await Promise.all([
    buscarContaOuFalhar(espacoId, input.contaOrigemId),
    buscarContaOuFalhar(espacoId, input.contaDestinoId),
  ]);

  const grupoId = input.transferenciaGrupoId ?? crypto.randomUUID();
  const descricao = input.descricao?.trim() || "Transferência entre contas";

  try {
    const [saida, entrada] = await prisma.$transaction([
      prisma.transacao.create({
        data: {
          espacoId,
          tipo: "TRANSFERENCIA",
          data: input.data,
          descricao,
          contaId: input.contaOrigemId,
          categoriaId: null,
          valor: -Math.abs(input.valor),
          consolidado: input.consolidado,
          nota: input.nota,
          transferenciaGrupoId: grupoId,
        },
        include: TRANSACAO_INCLUDE,
      }),
      prisma.transacao.create({
        data: {
          espacoId,
          tipo: "TRANSFERENCIA",
          data: input.data,
          descricao,
          contaId: input.contaDestinoId,
          categoriaId: null,
          valor: Math.abs(input.valor),
          consolidado: input.consolidado,
          nota: input.nota,
          transferenciaGrupoId: grupoId,
        },
        include: TRANSACAO_INCLUDE,
      }),
    ]);

    return montarResultadoTransferencia(grupoId, [saida, entrada]);
  } catch (err) {
    // Corrida entre duas tentativas do mesmo transferenciaGrupoId (retry de
    // sincronização offline concorrente).
    if (
      input.transferenciaGrupoId &&
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      const existentes = await prisma.transacao.findMany({
        where: { espacoId, transferenciaGrupoId: input.transferenciaGrupoId },
        include: TRANSACAO_INCLUDE,
      });
      if (existentes.length > 0) {
        return montarResultadoTransferencia(input.transferenciaGrupoId, existentes);
      }
    }
    throw err;
  }
}

function montarResultadoTransferencia(grupoId: string, transacoes: TransacaoComRelacoes[]) {
  return {
    transferenciaGrupoId: grupoId,
    transacoes: transacoes.map(serializarTransacao),
  };
}

async function resolverContasEmEscopo(espacoId: string, contaIds?: string[]) {
  return prisma.conta.findMany({
    where: { espacoId, ...(contaIds ? { id: { in: contaIds } } : {}) },
  });
}

async function calcularSaldoAnterior(
  espacoId: string,
  contaIdsEmEscopo: string[],
  saldoInicialTotal: number,
  primeiroDia: Date,
): Promise<number> {
  const agregado = await prisma.transacao.aggregate({
    where: { espacoId, contaId: { in: contaIdsEmEscopo }, data: { lt: primeiroDia } },
    _sum: { valor: true },
  });
  return saldoInicialTotal + toNumber(agregado._sum.valor);
}

export async function listarTransacoesMes(espacoId: string, filtros: ListarTransacoesQuery) {
  return comTempo(
    "listarTransacoesMes",
    { espacoId, ano: filtros.ano, mes: filtros.mes },
    () => listarTransacoesMesImpl(espacoId, filtros),
  );
}

async function listarTransacoesMesImpl(espacoId: string, filtros: ListarTransacoesQuery) {
  const contas = await resolverContasEmEscopo(espacoId, filtros.contaIds);
  const contaIdsEmEscopo = contas.map((c) => c.id);
  const saldoInicialTotal = contas.reduce((soma, c) => soma + toNumber(c.saldoInicial), 0);

  const primeiroDiaMes = primeiroDiaMesUTC(filtros.ano, filtros.mes);
  const ultimoDiaMes = ultimoDiaMesUTC(filtros.ano, filtros.mes);
  const primeiroDia =
    filtros.dataInicio && filtros.dataInicio > primeiroDiaMes ? filtros.dataInicio : primeiroDiaMes;
  const ultimoDia = filtros.dataFim && filtros.dataFim < ultimoDiaMes ? filtros.dataFim : ultimoDiaMes;
  const buscaGlobal = Boolean(filtros.texto);

  const [saldoAnterior, transacoes] = await Promise.all([
    buscaGlobal
      ? Promise.resolve(saldoInicialTotal)
      : calcularSaldoAnterior(espacoId, contaIdsEmEscopo, saldoInicialTotal, primeiroDia),
    prisma.transacao.findMany({
      where: {
        espacoId,
        contaId: { in: contaIdsEmEscopo },
        ...(buscaGlobal ? {} : { data: { gte: primeiroDia, lte: ultimoDia } }),
        ...(filtros.categoriaIds ? { categoriaId: { in: filtros.categoriaIds } } : {}),
        ...(filtros.status === "consolidadas" ? { consolidado: true } : {}),
        ...(filtros.status === "pendentes" ? { consolidado: false } : {}),
        ...(filtros.texto ? { descricao: { contains: filtros.texto, mode: "insensitive" } } : {}),
      },
      include: TRANSACAO_INCLUDE,
      orderBy: [{ data: "asc" }, { criadoEm: "asc" }],
      ...(buscaGlobal ? { take: 200 } : {}),
    }),
  ]);

  const dias: { data: string; saldoDia: number; transacoes: TransacaoDTO[] }[] = [];
  let running = saldoAnterior;
  let totalEntradas = 0;
  let totalSaidas = 0;

  let diaAtual: { data: string; saldoDia: number; transacoes: TransacaoDTO[] } | null = null;

  for (const t of transacoes) {
    const dataISO = formatDataISO(t.data);
    const valor = toNumber(t.valor);
    running += valor;

    if (t.tipo !== "TRANSFERENCIA") {
      if (valor > 0) totalEntradas += valor;
      else totalSaidas += Math.abs(valor);
    }

    if (!diaAtual || diaAtual.data !== dataISO) {
      diaAtual = { data: dataISO, saldoDia: running, transacoes: [] };
      dias.push(diaAtual);
    } else {
      diaAtual.saldoDia = running;
    }
    diaAtual.transacoes.push(serializarTransacao(t));
  }

  return {
    saldoAnterior,
    dias,
    totalEntradas,
    totalSaidas,
    saldoFinal: running,
  };
}

export async function buscarResumoMensal(
  espacoId: string,
  ano: number,
  mes: number,
  contaIds?: string[],
) {
  return comTempo(
    "buscarResumoMensal",
    { espacoId, ano, mes },
    () => buscarResumoMensalImpl(espacoId, ano, mes, contaIds),
  );
}

type TransacaoResumoPayload = Prisma.TransacaoGetPayload<{
  include: typeof CATEGORIA_RESUMO_INCLUDE;
}>;

interface PendenciasNaoConsolidadas {
  anterioresNaoConsolidadas: TransacaoDTO[];
  proximasNaoConsolidadas: TransacaoDTO[];
}

/**
 * Transações não consolidadas antes/depois de hoje. Não são recortadas pelo mês
 * consultado — o resumo mensal sempre devolve o mesmo panorama de pendências.
 */
async function buscarPendenciasNaoConsolidadas(
  espacoId: string,
  contaIdsEmEscopo: string[],
): Promise<PendenciasNaoConsolidadas> {
  const hoje = hojeUTC();
  const [anteriores, proximas] = await Promise.all([
    prisma.transacao.findMany({
      where: { espacoId, contaId: { in: contaIdsEmEscopo }, consolidado: false, data: { lt: hoje } },
      include: TRANSACAO_INCLUDE,
      orderBy: { data: "asc" },
      take: 10,
    }),
    prisma.transacao.findMany({
      where: { espacoId, contaId: { in: contaIdsEmEscopo }, consolidado: false, data: { gte: hoje } },
      include: TRANSACAO_INCLUDE,
      orderBy: { data: "asc" },
      take: 10,
    }),
  ]);
  return {
    anterioresNaoConsolidadas: anteriores.map(serializarTransacao),
    proximasNaoConsolidadas: proximas.map(serializarTransacao),
  };
}

/** Agrega um conjunto de transações de um mês no formato do resumo mensal. */
function montarResumoMensal(
  transacoesDoMes: TransacaoResumoPayload[],
  saldoAnterior: number,
  pendencias: PendenciasNaoConsolidadas,
) {
  let totalEntradas = 0;
  let totalSaidas = 0;
  let movimentoTotal = 0;
  const despesasPorCategoriaMap = new Map<string, ItemCategoriaResumo>();
  const receitasPorCategoriaMap = new Map<string, ItemCategoriaResumo>();

  for (const t of transacoesDoMes) {
    const valor = toNumber(t.valor);
    movimentoTotal += valor;

    if (t.tipo !== "TRANSFERENCIA") {
      if (valor > 0) totalEntradas += valor;
      else totalSaidas += Math.abs(valor);
    }

    if (t.categoria?.nome !== NOME_CATEGORIA_TRANSFERENCIA) {
      if (t.tipo === "DESPESA") {
        acumularPorCategoria(despesasPorCategoriaMap, t, Math.abs(valor));
      } else if (t.tipo === "RECEITA") {
        acumularPorCategoria(receitasPorCategoriaMap, t, Math.abs(valor));
      }
    }
  }

  const recentes = [...transacoesDoMes]
    .sort(
      (a, b) => b.data.getTime() - a.data.getTime() || b.criadoEm.getTime() - a.criadoEm.getTime(),
    )
    .slice(0, LIMITE_RECENTES)
    .map(serializarTransacao);

  return {
    saldoAnterior,
    totalEntradas,
    totalSaidas,
    saldoFinal: saldoAnterior + movimentoTotal,
    recentes,
    anterioresNaoConsolidadas: pendencias.anterioresNaoConsolidadas,
    proximasNaoConsolidadas: pendencias.proximasNaoConsolidadas,
    despesasPorCategoria: Array.from(despesasPorCategoriaMap.values()),
    receitasPorCategoria: Array.from(receitasPorCategoriaMap.values()),
  };
}

async function buscarResumoMensalImpl(
  espacoId: string,
  ano: number,
  mes: number,
  contaIds?: string[],
) {
  const contas = await resolverContasEmEscopo(espacoId, contaIds);
  const contaIdsEmEscopo = contas.map((c) => c.id);
  const saldoInicialTotal = contas.reduce((soma, c) => soma + toNumber(c.saldoInicial), 0);

  const primeiroDia = primeiroDiaMesUTC(ano, mes);
  const ultimoDia = ultimoDiaMesUTC(ano, mes);

  const [saldoAnterior, transacoesDoMes, pendencias] = await Promise.all([
    calcularSaldoAnterior(espacoId, contaIdsEmEscopo, saldoInicialTotal, primeiroDia),
    prisma.transacao.findMany({
      where: {
        espacoId,
        contaId: { in: contaIdsEmEscopo },
        data: { gte: primeiroDia, lte: ultimoDia },
      },
      include: CATEGORIA_RESUMO_INCLUDE,
    }),
    buscarPendenciasNaoConsolidadas(espacoId, contaIdsEmEscopo),
  ]);

  return montarResumoMensal(transacoesDoMes, saldoAnterior, pendencias);
}

// Quantos meses fechados (além do mês corrente) o endpoint da Home devolve, para
// alimentar o comparativo e os insights sem uma requisição por mês.
const MESES_HISTORICO_HOME = 3;
// Janela dos gráficos de 6 meses (evolução de saldo e fluxo de caixa).
const MESES_JANELA_GRAFICOS = 6;

function periodoParaIndice(ano: number, mes: number): number {
  return ano * 12 + (mes - 1);
}

function indiceParaPeriodo(indice: number): { ano: number; mes: number } {
  return { ano: Math.floor(indice / 12), mes: (indice % 12) + 1 };
}

const PENDENCIAS_VAZIAS: PendenciasNaoConsolidadas = {
  anterioresNaoConsolidadas: [],
  proximasNaoConsolidadas: [],
};

/**
 * Percorre as transações de uma janela (ordenadas por data) e monta o resumo de
 * um mês: acumula o saldo de tudo que veio antes e agrega o que caiu no mês.
 */
function resumoMensalDaJanela(
  transacoesJanela: TransacaoResumoPayload[],
  idxTransacao: number[],
  saldoAberturaJanela: number,
  idxMes: number,
  pendencias: PendenciasNaoConsolidadas,
) {
  let saldoAnterior = saldoAberturaJanela;
  const transacoesDoMes: TransacaoResumoPayload[] = [];
  for (let i = 0; i < transacoesJanela.length; i++) {
    if (idxTransacao[i] < idxMes) saldoAnterior += toNumber(transacoesJanela[i].valor);
    else if (idxTransacao[i] === idxMes) transacoesDoMes.push(transacoesJanela[i]);
  }
  const periodo = indiceParaPeriodo(idxMes);
  return {
    ano: periodo.ano,
    mes: periodo.mes,
    ...montarResumoMensal(transacoesDoMes, saldoAnterior, pendencias),
  };
}

/**
 * Parte ESSENCIAL da tela inicial — o que a página precisa para pintar: contas e
 * o resumo do mês atual + do anterior (cards do topo, comparativo, recentes,
 * pendências, gráfico de categorias). Uma janela de 2 meses, poucas queries.
 * Gráficos de 6 meses, orçamento, metas e histórico de insight vêm no
 * `/home/extras`, carregado depois que a tela já apareceu.
 */
export async function buscarHome(
  espacoId: string,
  ano: number,
  mes: number,
  contaIds?: string[],
) {
  return comTempo("buscarHome", { espacoId, ano, mes }, () =>
    buscarHomeImpl(espacoId, ano, mes, contaIds),
  );
}

async function buscarHomeImpl(
  espacoId: string,
  ano: number,
  mes: number,
  contaIds?: string[],
) {
  const contasEscopo = await resolverContasEmEscopo(espacoId, contaIds);
  const contaIdsEmEscopo = contasEscopo.map((c) => c.id);
  const saldoInicialTotal = contasEscopo.reduce(
    (soma, c) => soma + toNumber(c.saldoInicial),
    0,
  );

  const indiceMesAtual = periodoParaIndice(ano, mes);
  const indiceMesAnterior = indiceMesAtual - 1;
  const anterior = indiceParaPeriodo(indiceMesAnterior);
  const primeiroDiaAnterior = primeiroDiaMesUTC(anterior.ano, anterior.mes);
  const ultimoDiaMesAtual = ultimoDiaMesUTC(ano, mes);

  const [saldoAberturaAnterior, transacoesJanela, pendencias, contas] = await Promise.all([
    calcularSaldoAnterior(espacoId, contaIdsEmEscopo, saldoInicialTotal, primeiroDiaAnterior),
    prisma.transacao.findMany({
      where: {
        espacoId,
        contaId: { in: contaIdsEmEscopo },
        data: { gte: primeiroDiaAnterior, lte: ultimoDiaMesAtual },
      },
      include: CATEGORIA_RESUMO_INCLUDE,
      orderBy: [{ data: "asc" }, { criadoEm: "asc" }],
    }),
    buscarPendenciasNaoConsolidadas(espacoId, contaIdsEmEscopo),
    listarContas(espacoId, false),
  ]);

  const idxTransacao = transacoesJanela.map((t) =>
    periodoParaIndice(t.data.getUTCFullYear(), t.data.getUTCMonth() + 1),
  );

  const meses = [indiceMesAtual, indiceMesAnterior].map((idx) =>
    resumoMensalDaJanela(transacoesJanela, idxTransacao, saldoAberturaAnterior, idx, pendencias),
  );

  return { contas, meses };
}

/**
 * Parte ADIADA da tela inicial: gráficos de 6 meses (evolução e fluxo de caixa),
 * grade de orçamento, metas e os 2 meses de histórico mais antigos que o insight
 * usa. Carregado em paralelo ao `/home`, mas a página não espera por ele.
 */
export async function buscarHomeExtras(
  espacoId: string,
  ano: number,
  mes: number,
  contaIds?: string[],
) {
  return comTempo("buscarHomeExtras", { espacoId, ano, mes }, () =>
    buscarHomeExtrasImpl(espacoId, ano, mes, contaIds),
  );
}

async function buscarHomeExtrasImpl(
  espacoId: string,
  ano: number,
  mes: number,
  contaIds?: string[],
) {
  const contasEscopo = await resolverContasEmEscopo(espacoId, contaIds);
  const contaIdsEmEscopo = contasEscopo.map((c) => c.id);
  const saldoInicialTotal = contasEscopo.reduce(
    (soma, c) => soma + toNumber(c.saldoInicial),
    0,
  );

  const indiceMesAtual = periodoParaIndice(ano, mes);
  const indiceInicioJanela = indiceMesAtual - (MESES_JANELA_GRAFICOS - 1);
  const inicioJanela = indiceParaPeriodo(indiceInicioJanela);
  const primeiroDiaJanela = primeiroDiaMesUTC(inicioJanela.ano, inicioJanela.mes);
  const ultimoDiaMesAtual = ultimoDiaMesUTC(ano, mes);

  const [saldoAberturaJanela, transacoesJanela, orcamentoGrade, metas] = await Promise.all([
    calcularSaldoAnterior(espacoId, contaIdsEmEscopo, saldoInicialTotal, primeiroDiaJanela),
    prisma.transacao.findMany({
      where: {
        espacoId,
        contaId: { in: contaIdsEmEscopo },
        data: { gte: primeiroDiaJanela, lte: ultimoDiaMesAtual },
      },
      include: CATEGORIA_RESUMO_INCLUDE,
      orderBy: [{ data: "asc" }, { criadoEm: "asc" }],
    }),
    buscarGradePorAno(espacoId, ano, mes),
    listarMetas(espacoId, false),
  ]);

  const idxTransacao = transacoesJanela.map((t) =>
    periodoParaIndice(t.data.getUTCFullYear(), t.data.getUTCMonth() + 1),
  );

  // Histórico do insight: meses -2 e -3 (o -1 já vem no payload essencial).
  const historico = [];
  for (let offset = 2; offset <= MESES_HISTORICO_HOME; offset++) {
    historico.push(
      resumoMensalDaJanela(
        transacoesJanela,
        idxTransacao,
        saldoAberturaJanela,
        indiceMesAtual - offset,
        PENDENCIAS_VAZIAS,
      ),
    );
  }

  // Evolução de saldo (MESES_JANELA_GRAFICOS pontos), varrendo a janela uma vez.
  const evolucaoSaldo: { ano: number; mes: number; saldoFinal: number }[] = [];
  let saldoAcumulado = saldoAberturaJanela;
  let cursor = 0;
  for (let idx = indiceInicioJanela; idx <= indiceMesAtual; idx++) {
    while (cursor < transacoesJanela.length && idxTransacao[cursor] <= idx) {
      saldoAcumulado += toNumber(transacoesJanela[cursor].valor);
      cursor++;
    }
    const periodo = indiceParaPeriodo(idx);
    evolucaoSaldo.push({ ano: periodo.ano, mes: periodo.mes, saldoFinal: saldoAcumulado });
  }

  // Fluxo de caixa por mês (só DESPESA e RECEITA, em valor absoluto).
  const fluxoPorIndice = new Map<number, { entradas: number; saidas: number }>();
  for (let idx = indiceInicioJanela; idx <= indiceMesAtual; idx++) {
    fluxoPorIndice.set(idx, { entradas: 0, saidas: 0 });
  }
  for (let i = 0; i < transacoesJanela.length; i++) {
    const t = transacoesJanela[i];
    if (t.tipo !== "DESPESA" && t.tipo !== "RECEITA") continue;
    const balde = fluxoPorIndice.get(idxTransacao[i]);
    if (!balde) continue;
    const valorAbs = Math.abs(toNumber(t.valor));
    if (t.tipo === "RECEITA") balde.entradas += valorAbs;
    else balde.saidas += valorAbs;
  }
  const fluxoCaixa = {
    serie: Array.from({ length: MESES_JANELA_GRAFICOS }, (_, i) => {
      const idx = indiceInicioJanela + i;
      const periodo = indiceParaPeriodo(idx);
      const balde = fluxoPorIndice.get(idx)!;
      return {
        ano: periodo.ano,
        mes: periodo.mes,
        entradas: balde.entradas,
        saidas: balde.saidas,
      };
    }),
  };

  return { historico, evolucaoSaldo, fluxoCaixa, orcamentoGrade, metas };
}

function sequenciaMeses(
  anoInicio: number,
  mesInicio: number,
  anoFim: number,
  mesFim: number,
): { ano: number; mes: number }[] {
  const lista: { ano: number; mes: number }[] = [];
  const totalInicio = anoInicio * 12 + (mesInicio - 1);
  const totalFim = anoFim * 12 + (mesFim - 1);
  for (let t = totalInicio; t <= totalFim; t++) {
    lista.push({ ano: Math.floor(t / 12), mes: (t % 12) + 1 });
  }
  return lista;
}

export async function buscarEvolucaoSaldo(
  espacoId: string,
  inicio: { ano: number; mes: number },
  fim: { ano: number; mes: number },
  contaIds?: string[],
) {
  const contas = await resolverContasEmEscopo(espacoId, contaIds);
  const contaIdsEmEscopo = contas.map((c) => c.id);
  const saldoInicialTotal = contas.reduce((soma, c) => soma + toNumber(c.saldoInicial), 0);

  const sequenciaMesesIntervalo = sequenciaMeses(inicio.ano, inicio.mes, fim.ano, fim.mes);
  const primeiroDia = primeiroDiaMesUTC(sequenciaMesesIntervalo[0].ano, sequenciaMesesIntervalo[0].mes);
  const ultimoMesIntervalo = sequenciaMesesIntervalo[sequenciaMesesIntervalo.length - 1];
  const ultimoDiaIntervalo = ultimoDiaMesUTC(ultimoMesIntervalo.ano, ultimoMesIntervalo.mes);

  const [saldoAnterior, transacoes] = await Promise.all([
    calcularSaldoAnterior(espacoId, contaIdsEmEscopo, saldoInicialTotal, primeiroDia),
    prisma.transacao.findMany({
      where: {
        espacoId,
        contaId: { in: contaIdsEmEscopo },
        data: { gte: primeiroDia, lte: ultimoDiaIntervalo },
      },
      select: { data: true, valor: true },
      orderBy: { data: "asc" },
    }),
  ]);
  let saldo = saldoAnterior;

  let indiceTransacao = 0;
  const evolucao: { ano: number; mes: number; saldoFinal: number }[] = [];

  for (const { ano, mes } of sequenciaMesesIntervalo) {
    const ultimoDia = ultimoDiaMesUTC(ano, mes);
    while (
      indiceTransacao < transacoes.length &&
      transacoes[indiceTransacao].data <= ultimoDia
    ) {
      saldo += toNumber(transacoes[indiceTransacao].valor);
      indiceTransacao++;
    }
    evolucao.push({ ano, mes, saldoFinal: saldo });
  }

  return evolucao;
}

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
  periodo: {
    inicio: { ano: number; mes: number };
    fim: { ano: number; mes: number };
  };
  meses: RelatorioMes[];
  totais: { receitas: number; despesas: number; resultado: number };
  despesasPorCategoria: ItemCategoriaResumo[];
  receitasPorCategoria: ItemCategoriaResumo[];
  despesasPorCategoriaPorMes: ItemCategoriaPorMesResumo[];
  receitasPorCategoriaPorMes: ItemCategoriaPorMesResumo[];
}

export async function buscarRelatorio(
  espacoId: string,
  inicio: { ano: number; mes: number },
  fim: { ano: number; mes: number },
  opts?: { contaIds?: string[]; tipo?: "DESPESA" | "RECEITA" },
): Promise<RelatorioResponse> {
  return comTempo(
    "buscarRelatorio",
    { espacoId, inicio: `${inicio.ano}-${inicio.mes}`, fim: `${fim.ano}-${fim.mes}` },
    () => buscarRelatorioImpl(espacoId, inicio, fim, opts),
  );
}

async function buscarRelatorioImpl(
  espacoId: string,
  inicio: { ano: number; mes: number },
  fim: { ano: number; mes: number },
  opts?: { contaIds?: string[]; tipo?: "DESPESA" | "RECEITA" },
): Promise<RelatorioResponse> {
  const contas = await resolverContasEmEscopo(espacoId, opts?.contaIds);
  const contaIdsEmEscopo = contas.map((c) => c.id);

  const sequencia = sequenciaMeses(inicio.ano, inicio.mes, fim.ano, fim.mes);
  const primeiroDia = primeiroDiaMesUTC(inicio.ano, inicio.mes);
  const ultimoDia = ultimoDiaMesUTC(fim.ano, fim.mes);

  const whereBase = {
    espacoId,
    contaId: { in: contaIdsEmEscopo },
    data: { gte: primeiroDia, lte: ultimoDia },
  };

  // (1) Árvore de categorias — agregado do intervalo inteiro, no Postgres.
  // (2) Série mensal — soma por dia e tipo, bucketizada em meses no JS.
  // (3) Árvore de categorias por dia — mesma ideia de (1), mas bucketizada em meses,
  //     para alimentar o gráfico de linhas e a tabela pivot por categoria/mês.
  const [porCategoria, porDia, porCategoriaPorDia] = await Promise.all([
    prisma.transacao.groupBy({
      by: ["categoriaId", "tipo"],
      where: {
        ...whereBase,
        tipo: opts?.tipo ? opts.tipo : { in: ["DESPESA", "RECEITA"] },
      },
      _sum: { valor: true },
    }),
    prisma.transacao.groupBy({
      by: ["data", "tipo"],
      where: { ...whereBase, tipo: { in: ["DESPESA", "RECEITA"] } },
      _sum: { valor: true },
    }),
    prisma.transacao.groupBy({
      by: ["categoriaId", "tipo", "data"],
      where: {
        ...whereBase,
        tipo: opts?.tipo ? opts.tipo : { in: ["DESPESA", "RECEITA"] },
      },
      _sum: { valor: true },
    }),
  ]);

  const categoriaIds = [
    ...new Set(
      porCategoria
        .map((l) => l.categoriaId)
        .filter((id): id is string => id !== null),
    ),
  ];
  const categorias =
    categoriaIds.length > 0
      ? await prisma.categoria.findMany({
          where: { id: { in: categoriaIds } },
          select: {
            id: true,
            nome: true,
            grupoId: true,
            grupo: { select: { nome: true } },
            subgrupoId: true,
            subgrupo: { select: { nome: true } },
          },
        })
      : [];
  const categoriaPorId = new Map(categorias.map((c) => [c.id, c]));

  const despesasMap = new Map<string, ItemCategoriaResumo>();
  const receitasMap = new Map<string, ItemCategoriaResumo>();

  for (const linha of porCategoria) {
    const valorAbs = Math.abs(toNumber(linha._sum.valor));
    if (valorAbs === 0) continue;

    const cat = linha.categoriaId ? categoriaPorId.get(linha.categoriaId) : undefined;
    // Guard legado: categoria chamada "Transferência" não entra na árvore,
    // exatamente como `buscarResumoMensal` faz.
    if (cat?.nome === NOME_CATEGORIA_TRANSFERENCIA) continue;

    const mapa = linha.tipo === "DESPESA" ? despesasMap : receitasMap;
    const chave = linha.categoriaId ?? "sem-categoria";
    const atual = mapa.get(chave);
    if (atual) {
      atual.total += valorAbs;
    } else {
      mapa.set(chave, {
        categoriaId: linha.categoriaId,
        categoriaNome: cat?.nome ?? "Sem Categoria",
        grupoId: cat?.grupoId ?? null,
        grupoNome: cat?.grupo?.nome ?? null,
        subgrupoId: cat?.subgrupoId ?? null,
        subgrupoNome: cat?.subgrupo?.nome ?? null,
        total: valorAbs,
      });
    }
  }

  const indiceMes = new Map<string, number>();
  sequencia.forEach((s, i) => indiceMes.set(`${s.ano}-${s.mes}`, i));

  const despesasPorMesMap = new Map<string, ItemCategoriaPorMesResumo>();
  const receitasPorMesMap = new Map<string, ItemCategoriaPorMesResumo>();

  for (const linha of porCategoriaPorDia) {
    const valorAbs = Math.abs(toNumber(linha._sum.valor));
    if (valorAbs === 0) continue;

    const cat = linha.categoriaId ? categoriaPorId.get(linha.categoriaId) : undefined;
    if (cat?.nome === NOME_CATEGORIA_TRANSFERENCIA) continue;

    const idx = indiceMes.get(`${linha.data.getUTCFullYear()}-${linha.data.getUTCMonth() + 1}`);
    if (idx === undefined) continue;

    const mapa = linha.tipo === "DESPESA" ? despesasPorMesMap : receitasPorMesMap;
    const chaveCat = linha.categoriaId ?? "sem-categoria";
    let atual = mapa.get(chaveCat);
    if (!atual) {
      atual = {
        categoriaId: linha.categoriaId,
        categoriaNome: cat?.nome ?? "Sem Categoria",
        grupoId: cat?.grupoId ?? null,
        grupoNome: cat?.grupo?.nome ?? null,
        subgrupoId: cat?.subgrupoId ?? null,
        subgrupoNome: cat?.subgrupo?.nome ?? null,
        porMes: new Array(sequencia.length).fill(0),
      };
      mapa.set(chaveCat, atual);
    }
    atual.porMes[idx] += valorAbs;
  }

  const chave = (ano: number, mes: number) => `${ano}-${mes}`;
  const baldes = new Map<string, RelatorioMes>();
  for (const { ano, mes } of sequencia) {
    baldes.set(chave(ano, mes), { ano, mes, receitas: 0, despesas: 0, resultado: 0 });
  }
  for (const linha of porDia) {
    const ano = linha.data.getUTCFullYear();
    const mes = linha.data.getUTCMonth() + 1;
    const balde = baldes.get(chave(ano, mes));
    if (!balde) continue;
    const valorAbs = Math.abs(toNumber(linha._sum.valor));
    if (linha.tipo === "RECEITA") balde.receitas += valorAbs;
    else balde.despesas += valorAbs;
  }

  const meses = sequencia.map(({ ano, mes }) => {
    const balde = baldes.get(chave(ano, mes))!;
    balde.resultado = balde.receitas - balde.despesas;
    return balde;
  });

  const totais = meses.reduce(
    (acc, m) => ({
      receitas: acc.receitas + m.receitas,
      despesas: acc.despesas + m.despesas,
      resultado: 0,
    }),
    { receitas: 0, despesas: 0, resultado: 0 },
  );
  totais.resultado = totais.receitas - totais.despesas;

  return {
    periodo: { inicio, fim },
    meses,
    totais,
    despesasPorCategoria: opts?.tipo === "RECEITA" ? [] : Array.from(despesasMap.values()),
    receitasPorCategoria: opts?.tipo === "DESPESA" ? [] : Array.from(receitasMap.values()),
    despesasPorCategoriaPorMes:
      opts?.tipo === "RECEITA" ? [] : Array.from(despesasPorMesMap.values()),
    receitasPorCategoriaPorMes:
      opts?.tipo === "DESPESA" ? [] : Array.from(receitasPorMesMap.values()),
  };
}

export interface PontoFluxoCaixa {
  ano: number;
  mes: number;
  entradas: number;
  saidas: number;
}

export async function buscarFluxoCaixa(
  espacoId: string,
  fim: { ano: number; mes: number },
  meses: number,
  contaIds?: string[],
): Promise<{ serie: PontoFluxoCaixa[] }> {
  return comTempo(
    "buscarFluxoCaixa",
    { espacoId, ano: fim.ano, mes: fim.mes, meses },
    () => buscarFluxoCaixaImpl(espacoId, fim, meses, contaIds),
  );
}

async function buscarFluxoCaixaImpl(
  espacoId: string,
  fim: { ano: number; mes: number },
  meses: number,
  contaIds?: string[],
): Promise<{ serie: PontoFluxoCaixa[] }> {
  const contas = await resolverContasEmEscopo(espacoId, contaIds);
  const contaIdsEmEscopo = contas.map((c) => c.id);

  const totalFim = fim.ano * 12 + (fim.mes - 1);
  const totalInicio = totalFim - (meses - 1);
  const inicio = { ano: Math.floor(totalInicio / 12), mes: (totalInicio % 12) + 1 };

  const sequencia = sequenciaMeses(inicio.ano, inicio.mes, fim.ano, fim.mes);
  const primeiroDia = primeiroDiaMesUTC(inicio.ano, inicio.mes);
  const ultimoDia = ultimoDiaMesUTC(fim.ano, fim.mes);

  const agrupado = await prisma.transacao.groupBy({
    by: ["data", "tipo"],
    where: {
      espacoId,
      contaId: { in: contaIdsEmEscopo },
      data: { gte: primeiroDia, lte: ultimoDia },
      tipo: { in: ["DESPESA", "RECEITA"] },
    },
    _sum: { valor: true },
  });

  const chave = (ano: number, mes: number) => `${ano}-${mes}`;
  const baldes = new Map<string, PontoFluxoCaixa>();
  for (const { ano, mes } of sequencia) {
    baldes.set(chave(ano, mes), { ano, mes, entradas: 0, saidas: 0 });
  }

  for (const linha of agrupado) {
    const ano = linha.data.getUTCFullYear();
    const mes = linha.data.getUTCMonth() + 1;
    const balde = baldes.get(chave(ano, mes));
    if (!balde) continue;
    const valorAbs = Math.abs(toNumber(linha._sum.valor));
    if (linha.tipo === "RECEITA") balde.entradas += valorAbs;
    else balde.saidas += valorAbs;
  }

  return { serie: sequencia.map(({ ano, mes }) => baldes.get(chave(ano, mes))!) };
}
