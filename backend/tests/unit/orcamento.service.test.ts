import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockPrisma, resetMockPrisma } from "../helpers/mockPrisma.js";

vi.mock("../../src/lib/prisma.js", () => ({ prisma: mockPrisma }));

const orcamentoService = await import("../../src/modules/orcamento/orcamento.service.js");

const ESPACO_ID = "espaco-1";

beforeEach(() => {
  resetMockPrisma();
});

describe("orcamento.service", () => {
  it("criarOrcamento lança 409 quando já existe orçamento para o ano", async () => {
    mockPrisma.orcamentoAnual.findFirst.mockResolvedValue({ id: "orc-1", ano: 2026 });

    await expect(orcamentoService.criarOrcamento(ESPACO_ID, 2026)).rejects.toMatchObject({
      status: 409,
    });
  });

  it("definirPrevisto com mesmoValorTodosMeses faz upsert dos 12 meses com o mesmo valor", async () => {
    mockPrisma.orcamentoAnual.findFirst.mockResolvedValue({ id: "orc-1", ano: 2026 });
    mockPrisma.categoria.findFirst.mockResolvedValue({ id: "categoria-1" });
    mockPrisma.orcamentoCategoriaMes.upsert.mockResolvedValue({});

    await orcamentoService.definirPrevisto(ESPACO_ID, "orc-1", {
      categoriaId: "categoria-1",
      modo: "mesmoValorTodosMeses",
      valor: 500,
    });

    expect(mockPrisma.orcamentoCategoriaMes.upsert).toHaveBeenCalledTimes(12);
    for (let mes = 1; mes <= 12; mes++) {
      expect(mockPrisma.orcamentoCategoriaMes.upsert).toHaveBeenCalledWith({
        where: {
          orcamentoAnualId_categoriaId_mes: {
            orcamentoAnualId: "orc-1",
            categoriaId: "categoria-1",
            mes,
          },
        },
        update: { valorPrevisto: 500 },
        create: { orcamentoAnualId: "orc-1", categoriaId: "categoria-1", mes, valorPrevisto: 500 },
      });
    }
  });

  it("buscarGrade marca estourado quando o realizado ultrapassa o previsto", async () => {
    mockPrisma.orcamentoAnual.findFirst.mockResolvedValue({ id: "orc-1", ano: 2026 });
    mockPrisma.orcamentoCategoriaMes.findMany.mockResolvedValue([
      {
        categoriaId: "categoria-1",
        valorPrevisto: 100,
        categoria: { id: "categoria-1", nome: "Mercado", grupo: null },
      },
    ]);
    mockPrisma.transacao.groupBy.mockResolvedValue([
      { categoriaId: "categoria-1", _sum: { valor: -150 } },
    ]);
    mockPrisma.transacao.findMany.mockResolvedValue([]);

    const grade = await orcamentoService.buscarGrade(ESPACO_ID, "orc-1", 7);

    const linha = grade.grupos[0].categorias[0];
    expect(linha.previsto).toBe(100);
    expect(linha.realizado).toBe(150);
    expect(linha.estourado).toBe(true);
  });

  it("buscarGrade inclui categoria com transação lançada mas sem previsto definido no mês", async () => {
    mockPrisma.orcamentoAnual.findFirst.mockResolvedValue({ id: "orc-1", ano: 2026 });
    mockPrisma.orcamentoCategoriaMes.findMany.mockResolvedValue([]);
    mockPrisma.transacao.findMany.mockImplementation((args: { distinct?: unknown }) =>
      Promise.resolve(args.distinct ? [{ categoriaId: "categoria-1" }] : []),
    );
    mockPrisma.categoria.findMany.mockResolvedValue([
      { id: "categoria-1", nome: "Mercado", grupo: null, subgrupo: null },
    ]);
    mockPrisma.transacao.groupBy.mockResolvedValue([
      { categoriaId: "categoria-1", tipo: "DESPESA", _sum: { valor: -80 } },
    ]);

    const grade = await orcamentoService.buscarGrade(ESPACO_ID, "orc-1", 7);

    const linha = grade.grupos[0].categorias[0];
    expect(linha.categoriaId).toBe("categoria-1");
    expect(linha.previsto).toBe(0);
    expect(linha.realizado).toBe(80);
  });

  it("buscarMediasPorCategoria divide o total dos últimos 12 meses por 12", async () => {
    mockPrisma.transacao.groupBy.mockResolvedValue([
      { categoriaId: "categoria-1", _sum: { valor: -1200 } },
      { categoriaId: "categoria-2", _sum: { valor: -600 } },
    ]);

    const medias = await orcamentoService.buscarMediasPorCategoria(ESPACO_ID);

    expect(medias).toEqual([
      { categoriaId: "categoria-1", media: 100 },
      { categoriaId: "categoria-2", media: 50 },
    ]);
  });

  it("buscarGrade não deixa receita e despesa na mesma categoria se cancelarem", async () => {
    mockPrisma.orcamentoAnual.findFirst.mockResolvedValue({ id: "orc-1", ano: 2026 });
    mockPrisma.orcamentoCategoriaMes.findMany.mockResolvedValue([
      {
        categoriaId: "categoria-1",
        valorPrevisto: 100,
        categoria: { id: "categoria-1", nome: "Mercado", grupo: null },
      },
    ]);
    mockPrisma.transacao.findMany.mockResolvedValue([]);
    mockPrisma.transacao.groupBy.mockResolvedValue([
      { categoriaId: "categoria-1", tipo: "DESPESA", _sum: { valor: -500 } },
      { categoriaId: "categoria-1", tipo: "RECEITA", _sum: { valor: 500 } },
    ]);

    const grade = await orcamentoService.buscarGrade(ESPACO_ID, "orc-1", 7);

    const linha = grade.grupos[0].categorias[0];
    expect(linha.realizado).toBe(1000);
  });
});
