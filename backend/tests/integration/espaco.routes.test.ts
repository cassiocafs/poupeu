import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { mockPrisma, resetMockPrisma } from "../helpers/mockPrisma.js";

vi.mock("../../src/lib/prisma.js", () => ({ prisma: mockPrisma }));
vi.mock("../../src/lib/email.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/lib/email.js")>()),
  enviarEmail: vi.fn().mockResolvedValue(true),
}));
vi.mock("../../src/middlewares/authenticate.js", () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.auth = { userId: "user-1", email: "Eu@Teste.com" };
    next();
  },
}));
vi.mock("../../src/middlewares/resolveEspaco.js", () => ({
  resolveEspaco: (req: any, _res: any, next: any) => {
    req.espacoId = "espaco-1";
    next();
  },
  invalidarCacheEspaco: vi.fn(),
}));

const { createApp } = await import("../../src/app.js");

const CONVITE_ID = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  resetMockPrisma();
  mockPrisma.usuario.findUniqueOrThrow.mockResolvedValue({ id: "user-1", nome: "Cássio", email: "eu@teste.com" });
});

describe("GET /api/espaco", () => {
  it("devolve membros (marcando o próprio usuário) e convites pendentes", async () => {
    mockPrisma.espacoFinanceiro.findUniqueOrThrow.mockResolvedValue({ id: "espaco-1", nome: "Casa" });
    mockPrisma.membroEspaco.findMany.mockResolvedValue([
      { usuario: { id: "user-1", nome: "Cássio", email: "eu@teste.com" } },
      { usuario: { id: "user-2", nome: null, email: "esposa@teste.com" } },
    ]);
    mockPrisma.convite.findMany.mockResolvedValue([
      {
        id: CONVITE_ID,
        emailConvidado: "filho@teste.com",
        criadoEm: new Date("2026-09-01T00:00:00Z"),
        expiraEm: new Date(Date.now() + 86_400_000),
      },
    ]);

    const res = await request(createApp()).get("/api/espaco");

    expect(res.status).toBe(200);
    expect(res.body.espaco).toEqual({ id: "espaco-1", nome: "Casa" });
    expect(res.body.membros).toEqual([
      { id: "user-1", nome: "Cássio", email: "eu@teste.com", voceMesmo: true },
      { id: "user-2", nome: null, email: "esposa@teste.com", voceMesmo: false },
    ]);
    expect(res.body.convites).toEqual([
      expect.objectContaining({ id: CONVITE_ID, emailConvidado: "filho@teste.com", expirado: false }),
    ]);
  });
});

describe("POST /api/espaco/convites", () => {
  it("rejeita e-mail inválido com 400", async () => {
    const res = await request(createApp()).post("/api/espaco/convites").send({ email: "nao-e-email" });

    expect(res.status).toBe(400);
    expect(mockPrisma.convite.create).not.toHaveBeenCalled();
  });

  it("normaliza o e-mail (minúsculas, sem espaços) e cria o convite", async () => {
    mockPrisma.membroEspaco.findFirst.mockResolvedValue(null);
    mockPrisma.convite.findFirst.mockResolvedValue(null);
    mockPrisma.convite.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: CONVITE_ID, criadoEm: new Date(), ...data }),
    );

    const res = await request(createApp())
      .post("/api/espaco/convites")
      .send({ email: "  Familiar@Teste.COM " });

    expect(res.status).toBe(201);
    expect(res.body.convite.emailConvidado).toBe("familiar@teste.com");
    expect(res.body.emailEnviado).toBe(true);
  });

  it("não deixa o usuário convidar o próprio e-mail (comparação sem diferenciar maiúsculas)", async () => {
    const res = await request(createApp()).post("/api/espaco/convites").send({ email: "eu@teste.com" });

    expect(res.status).toBe(400);
    expect(mockPrisma.convite.create).not.toHaveBeenCalled();
  });
});

describe("convites recebidos", () => {
  it("POST /api/convites/:id/aceitar aceita com o e-mail da sessão em minúsculas", async () => {
    mockPrisma.convite.findFirst.mockResolvedValue({
      id: CONVITE_ID,
      espacoId: "espaco-2",
      papel: "EDITOR",
      status: "PENDENTE",
      expiraEm: new Date(Date.now() + 86_400_000),
      espaco: { id: "espaco-2", nome: "Casa" },
    });

    const res = await request(createApp()).post(`/api/convites/${CONVITE_ID}/aceitar`);

    expect(res.status).toBe(200);
    expect(res.body.espaco).toEqual({ id: "espaco-2", nome: "Casa" });
    expect(mockPrisma.convite.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: CONVITE_ID, emailConvidado: { equals: "eu@teste.com", mode: "insensitive" } },
      }),
    );
  });

  it("POST /api/convites/:id/aceitar com id malformado dá 400", async () => {
    const res = await request(createApp()).post("/api/convites/xyz/aceitar");

    expect(res.status).toBe(400);
  });

  it("POST /api/convites/:id/recusar responde 204", async () => {
    mockPrisma.convite.findFirst.mockResolvedValue({
      id: CONVITE_ID,
      status: "PENDENTE",
      expiraEm: new Date(Date.now() + 86_400_000),
      espaco: { id: "espaco-2", nome: "Casa" },
    });

    const res = await request(createApp()).post(`/api/convites/${CONVITE_ID}/recusar`);

    expect(res.status).toBe(204);
  });
});

describe("DELETE /api/espaco/convites/:id", () => {
  it("cancela e responde 204", async () => {
    mockPrisma.convite.updateMany.mockResolvedValue({ count: 1 });

    const res = await request(createApp()).delete(`/api/espaco/convites/${CONVITE_ID}`);

    expect(res.status).toBe(204);
  });

  it("responde 404 quando o convite não é deste espaço", async () => {
    mockPrisma.convite.updateMany.mockResolvedValue({ count: 0 });

    const res = await request(createApp()).delete(`/api/espaco/convites/${CONVITE_ID}`);

    expect(res.status).toBe(404);
  });
});
