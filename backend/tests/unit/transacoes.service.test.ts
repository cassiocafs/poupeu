import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockPrisma, resetMockPrisma } from "../helpers/mockPrisma.js";

vi.mock("../../src/lib/prisma.js", () => ({ prisma: mockPrisma }));

const transacoesService = await import("../../src/modules/transacoes/transacoes.service.js");

const ESPACO_ID = "espaco-1";
const INCLUDE_PADRAO = {
  conta: { id: "conta-x", nome: "Conta X" },
  categoria: null,
};

beforeEach(() => {
  resetMockPrisma();
});

describe("transacoes.service — transferências", () => {
  it("criarTransferencia cria duas transações espelhadas com valores opostos e o mesmo grupo", async () => {
    mockPrisma.conta.findFirst
      .mockResolvedValueOnce({ id: "conta-origem" })
      .mockResolvedValueOnce({ id: "conta-destino" });

    mockPrisma.transacao.create
      .mockImplementationOnce(async ({ data }) => ({
        id: "t-saida",
        ...data,
        data: new Date("2026-07-10T00:00:00.000Z"),
        ...INCLUDE_PADRAO,
      }))
      .mockImplementationOnce(async ({ data }) => ({
        id: "t-entrada",
        ...data,
        data: new Date("2026-07-10T00:00:00.000Z"),
        ...INCLUDE_PADRAO,
      }));

    const resultado = await transacoesService.criarTransferencia(ESPACO_ID, {
      data: new Date("2026-07-10T00:00:00.000Z"),
      contaOrigemId: "conta-origem",
      contaDestinoId: "conta-destino",
      valor: 150,
      consolidado: false,
    });

    expect(resultado.transacoes).toHaveLength(2);
    expect(resultado.transacoes[0].valor).toBe(-150);
    expect(resultado.transacoes[1].valor).toBe(150);
    expect(resultado.transacoes[0].transferenciaGrupoId).toBe(resultado.transferenciaGrupoId);
    expect(resultado.transacoes[1].transferenciaGrupoId).toBe(resultado.transferenciaGrupoId);
  });

  it("excluirTransacao remove as duas pernas quando a transação faz parte de uma transferência", async () => {
    mockPrisma.transacao.findFirst.mockResolvedValue({
      id: "t-saida",
      transferenciaGrupoId: "grupo-1",
    });
    mockPrisma.transacao.deleteMany.mockResolvedValue({ count: 2 });

    await transacoesService.excluirTransacao(ESPACO_ID, "t-saida");

    expect(mockPrisma.transacao.deleteMany).toHaveBeenCalledWith({
      where: { espacoId: ESPACO_ID, transferenciaGrupoId: "grupo-1" },
    });
    expect(mockPrisma.transacao.delete).not.toHaveBeenCalled();
  });

  it("editarTransacao rejeita alterar valor/conta de uma perna de transferência", async () => {
    mockPrisma.transacao.findFirst.mockResolvedValue({
      id: "t-saida",
      transferenciaGrupoId: "grupo-1",
      valor: -150,
      tipo: "TRANSFERENCIA",
    });

    await expect(
      transacoesService.editarTransacao(ESPACO_ID, "t-saida", { valor: 200 }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("editarTransacao propaga campos permitidos (nota) para a perna espelhada", async () => {
    mockPrisma.transacao.findFirst.mockResolvedValue({
      id: "t-saida",
      transferenciaGrupoId: "grupo-1",
      valor: -150,
      tipo: "TRANSFERENCIA",
    });
    mockPrisma.transacao.update.mockResolvedValue({
      id: "t-saida",
      tipo: "TRANSFERENCIA",
      data: new Date("2026-07-10T00:00:00.000Z"),
      descricao: "Transferência",
      valor: -150,
      consolidado: false,
      nota: "pago",
      transferenciaGrupoId: "grupo-1",
      ...INCLUDE_PADRAO,
    });
    mockPrisma.transacao.updateMany.mockResolvedValue({ count: 1 });

    await transacoesService.editarTransacao(ESPACO_ID, "t-saida", { nota: "pago" });

    expect(mockPrisma.transacao.updateMany).toHaveBeenCalledWith({
      where: { espacoId: ESPACO_ID, transferenciaGrupoId: "grupo-1", id: { not: "t-saida" } },
      data: { nota: "pago" },
    });
  });
});

describe("transacoes.service — idempotência (sincronização offline)", () => {
  it("criarTransacao usa o id enviado pelo cliente quando não existe ainda", async () => {
    mockPrisma.conta.findFirst.mockResolvedValue({ id: "conta-1" });
    mockPrisma.transacao.findUnique.mockResolvedValue(null);
    mockPrisma.transacao.create.mockImplementation(async ({ data }) => ({
      ...data,
      ...INCLUDE_PADRAO,
    }));

    const resultado = await transacoesService.criarTransacao(ESPACO_ID, {
      id: "id-cliente-1",
      tipo: "DESPESA",
      data: new Date("2026-07-10T00:00:00.000Z"),
      descricao: "Mercado",
      contaId: "conta-1",
      valor: 50,
      consolidado: false,
    });

    expect(mockPrisma.transacao.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ id: "id-cliente-1" }) }),
    );
    expect(resultado.id).toBe("id-cliente-1");
  });

  it("criarTransacao reenviada com o mesmo id não duplica: devolve o registro já existente", async () => {
    mockPrisma.transacao.findUnique.mockResolvedValue({
      id: "id-cliente-1",
      espacoId: ESPACO_ID,
      tipo: "DESPESA",
      data: new Date("2026-07-10T00:00:00.000Z"),
      descricao: "Mercado",
      contaId: "conta-1",
      categoriaId: null,
      valor: -50,
      consolidado: false,
      nota: null,
      transferenciaGrupoId: null,
      ...INCLUDE_PADRAO,
    });

    const resultado = await transacoesService.criarTransacao(ESPACO_ID, {
      id: "id-cliente-1",
      tipo: "DESPESA",
      data: new Date("2026-07-10T00:00:00.000Z"),
      descricao: "Mercado",
      contaId: "conta-1",
      valor: 50,
      consolidado: false,
    });

    expect(mockPrisma.transacao.create).not.toHaveBeenCalled();
    expect(mockPrisma.conta.findFirst).not.toHaveBeenCalled();
    expect(resultado.id).toBe("id-cliente-1");
  });

  it("criarTransacao rejeita reaproveitar um id que pertence a outro espaço", async () => {
    mockPrisma.transacao.findUnique.mockResolvedValue({
      id: "id-cliente-1",
      espacoId: "outro-espaco",
      ...INCLUDE_PADRAO,
    });

    await expect(
      transacoesService.criarTransacao(ESPACO_ID, {
        id: "id-cliente-1",
        tipo: "DESPESA",
        data: new Date("2026-07-10T00:00:00.000Z"),
        descricao: "Mercado",
        contaId: "conta-1",
        valor: 50,
        consolidado: false,
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("criarTransferencia reenviada com o mesmo transferenciaGrupoId devolve as duas pernas existentes", async () => {
    mockPrisma.transacao.findMany.mockResolvedValue([
      {
        id: "t-saida",
        transferenciaGrupoId: "grupo-1",
        data: new Date("2026-07-10T00:00:00.000Z"),
        valor: -150,
        ...INCLUDE_PADRAO,
      },
      {
        id: "t-entrada",
        transferenciaGrupoId: "grupo-1",
        data: new Date("2026-07-10T00:00:00.000Z"),
        valor: 150,
        ...INCLUDE_PADRAO,
      },
    ]);

    const resultado = await transacoesService.criarTransferencia(ESPACO_ID, {
      transferenciaGrupoId: "grupo-1",
      data: new Date("2026-07-10T00:00:00.000Z"),
      contaOrigemId: "conta-origem",
      contaDestinoId: "conta-destino",
      valor: 150,
      consolidado: false,
    });

    expect(mockPrisma.transacao.create).not.toHaveBeenCalled();
    expect(mockPrisma.conta.findFirst).not.toHaveBeenCalled();
    expect(resultado.transferenciaGrupoId).toBe("grupo-1");
    expect(resultado.transacoes).toHaveLength(2);
  });
});

describe("transacoes.service — aprendizado automático de regras", () => {
  it("criarTransacao grava/atualiza a regra da descrição com a conta e categoria usadas", async () => {
    mockPrisma.conta.findFirst.mockResolvedValue({ id: "conta-1" });
    mockPrisma.categoria.findFirst.mockResolvedValue({ id: "categoria-1" });
    mockPrisma.transacao.create.mockResolvedValue({
      id: "t-1",
      tipo: "DESPESA",
      data: new Date("2026-07-10T00:00:00.000Z"),
      descricao: "Uber",
      contaId: "conta-1",
      categoriaId: "categoria-1",
      valor: -50,
      consolidado: false,
      nota: null,
      transferenciaGrupoId: null,
      ...INCLUDE_PADRAO,
    });

    await transacoesService.criarTransacao(ESPACO_ID, {
      tipo: "DESPESA",
      data: new Date("2026-07-10T00:00:00.000Z"),
      descricao: "Uber",
      contaId: "conta-1",
      categoriaId: "categoria-1",
      valor: 50,
      consolidado: false,
    });

    expect(mockPrisma.regraTransacao.upsert).toHaveBeenCalledWith({
      where: { espacoId_descricaoNormalizada: { espacoId: ESPACO_ID, descricaoNormalizada: "uber" } },
      update: { descricao: "Uber", contaId: "conta-1", categoriaId: "categoria-1" },
      create: {
        espacoId: ESPACO_ID,
        descricao: "Uber",
        descricaoNormalizada: "uber",
        contaId: "conta-1",
        categoriaId: "categoria-1",
      },
    });
  });
});

describe("transacoes.service — lote", () => {
  it("categorizarLote nunca recategoriza transações do tipo TRANSFERENCIA", async () => {
    mockPrisma.categoria.findFirst.mockResolvedValue({ id: "categoria-1" });
    mockPrisma.transacao.updateMany.mockResolvedValue({ count: 2 });

    await transacoesService.categorizarLote(ESPACO_ID, ["t1", "t2"], "categoria-1");

    expect(mockPrisma.transacao.updateMany).toHaveBeenCalledWith({
      where: { espacoId: ESPACO_ID, id: { in: ["t1", "t2"] }, tipo: { not: "TRANSFERENCIA" } },
      data: { categoriaId: "categoria-1" },
    });
  });

  it("excluirTransacoesLote também remove pernas espelhadas de transferências selecionadas", async () => {
    mockPrisma.transacao.findMany.mockResolvedValue([
      { transferenciaGrupoId: "grupo-1" },
      { transferenciaGrupoId: null },
    ]);
    mockPrisma.transacao.deleteMany.mockResolvedValue({ count: 3 });

    const resultado = await transacoesService.excluirTransacoesLote(ESPACO_ID, ["t1", "t2"]);

    expect(mockPrisma.transacao.deleteMany).toHaveBeenCalledWith({
      where: {
        espacoId: ESPACO_ID,
        OR: [{ id: { in: ["t1", "t2"] } }, { transferenciaGrupoId: { in: ["grupo-1"] } }],
      },
    });
    expect(resultado).toEqual({ excluidas: 3 });
  });
});

describe("transacoes.service — buscarRelatorio", () => {
  it("agrega a árvore por categoria e a série mensal, aplicando o guard de transferência", async () => {
    mockPrisma.conta.findMany.mockResolvedValue([{ id: "conta-1", saldoInicial: 0 }]);

    // (1) groupBy por ["categoriaId", "tipo"]  (2) groupBy por ["data", "tipo"]
    // (3) groupBy por ["categoriaId", "tipo", "data"]
    mockPrisma.transacao.groupBy
      .mockResolvedValueOnce([
        { categoriaId: "cat-mercado", tipo: "DESPESA", _sum: { valor: -300 } },
        { categoriaId: "cat-transf", tipo: "DESPESA", _sum: { valor: -999 } },
        { categoriaId: null, tipo: "DESPESA", _sum: { valor: -50 } },
        { categoriaId: "cat-salario", tipo: "RECEITA", _sum: { valor: 5000 } },
      ])
      .mockResolvedValueOnce([
        { data: new Date("2026-05-10T00:00:00.000Z"), tipo: "DESPESA", _sum: { valor: -200 } },
        { data: new Date("2026-05-15T00:00:00.000Z"), tipo: "RECEITA", _sum: { valor: 5000 } },
        { data: new Date("2026-06-02T00:00:00.000Z"), tipo: "DESPESA", _sum: { valor: -150 } },
      ])
      .mockResolvedValueOnce([
        {
          categoriaId: "cat-mercado",
          tipo: "DESPESA",
          data: new Date("2026-05-10T00:00:00.000Z"),
          _sum: { valor: -200 },
        },
        {
          categoriaId: "cat-mercado",
          tipo: "DESPESA",
          data: new Date("2026-06-02T00:00:00.000Z"),
          _sum: { valor: -100 },
        },
        {
          categoriaId: null,
          tipo: "DESPESA",
          data: new Date("2026-05-20T00:00:00.000Z"),
          _sum: { valor: -50 },
        },
        {
          categoriaId: "cat-salario",
          tipo: "RECEITA",
          data: new Date("2026-05-15T00:00:00.000Z"),
          _sum: { valor: 5000 },
        },
        {
          categoriaId: "cat-transf",
          tipo: "DESPESA",
          data: new Date("2026-06-02T00:00:00.000Z"),
          _sum: { valor: -50 },
        },
      ]);

    mockPrisma.categoria.findMany.mockResolvedValue([
      {
        id: "cat-mercado",
        nome: "Mercado",
        grupoId: "g-casa",
        grupo: { nome: "Casa" },
        subgrupoId: null,
        subgrupo: null,
      },
      {
        id: "cat-transf",
        nome: "Transferência",
        grupoId: null,
        grupo: null,
        subgrupoId: null,
        subgrupo: null,
      },
      {
        id: "cat-salario",
        nome: "Salário",
        grupoId: "g-renda",
        grupo: { nome: "Renda" },
        subgrupoId: null,
        subgrupo: null,
      },
    ]);

    const resultado = await transacoesService.buscarRelatorio(
      ESPACO_ID,
      { ano: 2026, mes: 5 },
      { ano: 2026, mes: 6 },
    );

    expect(resultado.meses).toEqual([
      { ano: 2026, mes: 5, receitas: 5000, despesas: 200, resultado: 4800 },
      { ano: 2026, mes: 6, receitas: 0, despesas: 150, resultado: -150 },
    ]);
    expect(resultado.totais).toEqual({ receitas: 5000, despesas: 350, resultado: 4650 });

    // "Transferência" legada não entra; "Sem Categoria" entra.
    expect(resultado.despesasPorCategoria).toEqual([
      expect.objectContaining({ categoriaId: "cat-mercado", categoriaNome: "Mercado", total: 300 }),
      expect.objectContaining({ categoriaId: null, categoriaNome: "Sem Categoria", total: 50 }),
    ]);
    expect(resultado.receitasPorCategoria).toEqual([
      expect.objectContaining({ categoriaId: "cat-salario", total: 5000 }),
    ]);

    // Mesma árvore, mas bucketizada por mês (mai/jun) — "Transferência" continua de fora.
    expect(resultado.despesasPorCategoriaPorMes).toEqual([
      expect.objectContaining({ categoriaId: "cat-mercado", porMes: [200, 100] }),
      expect.objectContaining({ categoriaId: null, porMes: [50, 0] }),
    ]);
    expect(resultado.receitasPorCategoriaPorMes).toEqual([
      expect.objectContaining({ categoriaId: "cat-salario", porMes: [5000, 0] }),
    ]);
  });
});

describe("transacoes.service — buscarEvolucaoSaldo", () => {
  it("acumula o saldo base com as transações de cada mês, mês a mês", async () => {
    mockPrisma.conta.findMany.mockResolvedValue([{ id: "conta-1", saldoInicial: 1000 }]);
    mockPrisma.transacao.aggregate.mockResolvedValue({ _sum: { valor: 200 } });
    mockPrisma.transacao.findMany.mockResolvedValue([
      { data: new Date("2026-05-10T00:00:00.000Z"), valor: -100 },
      { data: new Date("2026-06-05T00:00:00.000Z"), valor: 300 },
      { data: new Date("2026-07-01T00:00:00.000Z"), valor: -50 },
      { data: new Date("2026-07-20T00:00:00.000Z"), valor: 20 },
    ]);

    const resultado = await transacoesService.buscarEvolucaoSaldo(
      ESPACO_ID,
      { ano: 2026, mes: 5 },
      { ano: 2026, mes: 7 },
    );

    expect(mockPrisma.transacao.aggregate).toHaveBeenCalledWith({
      where: {
        espacoId: ESPACO_ID,
        contaId: { in: ["conta-1"] },
        data: { lt: new Date("2026-05-01T00:00:00.000Z") },
      },
      _sum: { valor: true },
    });
    expect(resultado).toEqual([
      { ano: 2026, mes: 5, saldoFinal: 1100 },
      { ano: 2026, mes: 6, saldoFinal: 1400 },
      { ano: 2026, mes: 7, saldoFinal: 1370 },
    ]);
  });
});

describe("transacoes.service — buscarHome", () => {
  function txn(over: Record<string, unknown>) {
    return {
      id: "t",
      tipo: "DESPESA",
      data: new Date("2026-07-10T00:00:00.000Z"),
      descricao: "x",
      contaId: "conta-1",
      conta: { id: "conta-1", nome: "Conta 1" },
      categoriaId: null,
      categoria: null,
      valor: 0,
      consolidado: true,
      nota: null,
      transferenciaGrupoId: null,
      criadoEm: new Date("2026-07-10T00:00:00.000Z"),
      ...over,
    };
  }

  const jul = txn({
    id: "jul",
    data: new Date("2026-07-10T00:00:00.000Z"),
    tipo: "DESPESA",
    valor: -200,
    categoriaId: "cat-mercado",
    categoria: { id: "cat-mercado", nome: "Mercado", grupoId: null, grupo: null, subgrupoId: null, subgrupo: null },
  });
  const ago = txn({
    id: "ago",
    data: new Date("2026-08-05T00:00:00.000Z"),
    tipo: "RECEITA",
    valor: 5000,
    categoriaId: "cat-salario",
    categoria: { id: "cat-salario", nome: "Salário", grupoId: null, grupo: null, subgrupoId: null, subgrupo: null },
  });
  const set = txn({
    id: "set",
    data: new Date("2026-09-12T00:00:00.000Z"),
    tipo: "DESPESA",
    valor: -300,
  });

  it("essencial: contas + resumo do mês atual e do anterior (janela de 2 meses)", async () => {
    mockPrisma.conta.findMany
      .mockResolvedValueOnce([{ id: "conta-1", saldoInicial: 0 }]) // resolverContasEmEscopo
      .mockResolvedValueOnce([{ id: "conta-1", nome: "Conta 1", saldoInicial: 0, ativa: true }]); // listarContas
    // saldo antes de agosto (começo da janela de 2 meses)
    mockPrisma.transacao.aggregate.mockResolvedValue({ _sum: { valor: 100 } });
    mockPrisma.transacao.groupBy.mockResolvedValue([]); // listarContas → calcularSaldos
    mockPrisma.transacao.findMany.mockImplementation(async (args: { where?: { consolidado?: boolean } }) => {
      if (args.where?.consolidado === false) return []; // pendências
      return [ago, set]; // janela ago+set (jul fica fora)
    });

    const home = await transacoesService.buscarHome(ESPACO_ID, 2026, 9);

    expect(mockPrisma.transacao.aggregate).toHaveBeenCalledWith({
      where: {
        espacoId: ESPACO_ID,
        contaId: { in: ["conta-1"] },
        data: { lt: new Date("2026-08-01T00:00:00.000Z") },
      },
      _sum: { valor: true },
    });
    // janela + 2 de pendências. Sem fetch dos 6 meses.
    expect(mockPrisma.transacao.findMany).toHaveBeenCalledTimes(3);

    expect(home.meses.map((m) => [m.ano, m.mes])).toEqual([
      [2026, 9],
      [2026, 8],
    ]);
    expect(home.meses[0]).toMatchObject({
      saldoAnterior: 5100,
      totalEntradas: 0,
      totalSaidas: 300,
      saldoFinal: 4800,
    });
    expect(home.meses[1]).toMatchObject({
      saldoAnterior: 100,
      totalEntradas: 5000,
      totalSaidas: 0,
      saldoFinal: 5100,
    });
    expect(home.contas).toEqual([
      { id: "conta-1", nome: "Conta 1", saldoInicial: 0, ativa: true, saldoAtual: 0 },
    ]);
    expect(home).not.toHaveProperty("evolucaoSaldo");
  });

  it("extras: histórico do insight, evolução, fluxo, orçamento e metas (janela de 6 meses)", async () => {
    mockPrisma.conta.findMany.mockResolvedValueOnce([{ id: "conta-1", saldoInicial: 0 }]); // só resolverContasEmEscopo
    mockPrisma.transacao.aggregate.mockResolvedValue({ _sum: { valor: 100 } });
    mockPrisma.transacao.findMany.mockResolvedValue([jul, ago, set]); // janela de 6 meses
    mockPrisma.orcamentoAnual.findFirst.mockResolvedValue(null);
    mockPrisma.meta.findMany.mockResolvedValue([]);

    const extras = await transacoesService.buscarHomeExtras(ESPACO_ID, 2026, 9);

    expect(mockPrisma.transacao.aggregate).toHaveBeenCalledWith({
      where: {
        espacoId: ESPACO_ID,
        contaId: { in: ["conta-1"] },
        data: { lt: new Date("2026-04-01T00:00:00.000Z") },
      },
      _sum: { valor: true },
    });
    // um SELECT da janela; nada de pendências aqui
    expect(mockPrisma.transacao.findMany).toHaveBeenCalledTimes(1);

    // histórico = meses -2 e -3 (julho e junho)
    expect(extras.historico.map((m) => [m.ano, m.mes])).toEqual([
      [2026, 7],
      [2026, 6],
    ]);
    expect(extras.historico[0]).toMatchObject({ totalSaidas: 200, saldoFinal: -100 });

    expect(extras.evolucaoSaldo).toEqual([
      { ano: 2026, mes: 4, saldoFinal: 100 },
      { ano: 2026, mes: 5, saldoFinal: 100 },
      { ano: 2026, mes: 6, saldoFinal: 100 },
      { ano: 2026, mes: 7, saldoFinal: -100 },
      { ano: 2026, mes: 8, saldoFinal: 4900 },
      { ano: 2026, mes: 9, saldoFinal: 4600 },
    ]);
    expect(extras.fluxoCaixa.serie).toEqual([
      { ano: 2026, mes: 4, entradas: 0, saidas: 0 },
      { ano: 2026, mes: 5, entradas: 0, saidas: 0 },
      { ano: 2026, mes: 6, entradas: 0, saidas: 0 },
      { ano: 2026, mes: 7, entradas: 0, saidas: 200 },
      { ano: 2026, mes: 8, entradas: 5000, saidas: 0 },
      { ano: 2026, mes: 9, entradas: 0, saidas: 300 },
    ]);
    expect(extras.orcamentoGrade).toBeNull();
    expect(extras.metas).toEqual([]);
  });
});
