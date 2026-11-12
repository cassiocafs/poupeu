import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockPrisma, resetMockPrisma } from "../helpers/mockPrisma.js";

vi.mock("../../src/lib/prisma.js", () => ({ prisma: mockPrisma }));

const enviarEmail = vi.fn();
vi.mock("../../src/lib/email.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/lib/email.js")>()),
  enviarEmail,
}));

const invalidarCacheEspaco = vi.fn();
vi.mock("../../src/middlewares/resolveEspaco.js", () => ({ invalidarCacheEspaco }));

const {
  aceitarConvite,
  cancelarConvite,
  criarConvite,
  listarConvitesRecebidos,
  recusarConvite,
  reenviarConvite,
  sairDoEspaco,
} = await import("../../src/modules/espaco/espaco.service.js");

const ESPACO = "espaco-1";
const REMETENTE = { userId: "user-1", email: "eu@teste.com" };
const DIA = 24 * 60 * 60 * 1000;

beforeEach(() => {
  resetMockPrisma();
  enviarEmail.mockReset();
  enviarEmail.mockResolvedValue(true);
  invalidarCacheEspaco.mockReset();
  mockPrisma.usuario.findUniqueOrThrow.mockResolvedValue({
    id: "user-1",
    nome: "Cássio",
    email: "eu@teste.com",
  });
});

describe("criarConvite", () => {
  it("cria o convite como EDITOR, válido por 7 dias, e envia o e-mail", async () => {
    mockPrisma.membroEspaco.findFirst.mockResolvedValue(null);
    mockPrisma.convite.findFirst.mockResolvedValue(null);
    mockPrisma.convite.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: "convite-1", criadoEm: new Date(), ...data }),
    );

    const resultado = await criarConvite(ESPACO, REMETENTE, "familiar@teste.com");

    const { data } = mockPrisma.convite.create.mock.calls[0][0];
    expect(data).toMatchObject({
      espacoId: ESPACO,
      emailConvidado: "familiar@teste.com",
      papel: "EDITOR",
      criadoPorId: "user-1",
    });
    expect(data.expiraEm.getTime() - Date.now()).toBeGreaterThan(6.9 * DIA);
    expect(enviarEmail).toHaveBeenCalledWith(
      expect.objectContaining({ para: "familiar@teste.com", assunto: expect.stringContaining("Cássio") }),
    );
    expect(resultado.emailEnviado).toBe(true);
    expect(resultado.convite).toMatchObject({ id: "convite-1", expirado: false });
  });

  it("mantém o convite quando o e-mail falha e avisa com emailEnviado=false", async () => {
    mockPrisma.membroEspaco.findFirst.mockResolvedValue(null);
    mockPrisma.convite.findFirst.mockResolvedValue(null);
    mockPrisma.convite.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: "convite-1", criadoEm: new Date(), ...data }),
    );
    enviarEmail.mockResolvedValue(false);

    const resultado = await criarConvite(ESPACO, REMETENTE, "familiar@teste.com");

    expect(resultado.emailEnviado).toBe(false);
    expect(mockPrisma.convite.create).toHaveBeenCalledTimes(1);
  });

  it("recusa convidar o próprio e-mail", async () => {
    await expect(criarConvite(ESPACO, REMETENTE, "eu@teste.com")).rejects.toMatchObject({ status: 400 });
    expect(mockPrisma.convite.create).not.toHaveBeenCalled();
  });

  it("recusa quem já é membro do espaço", async () => {
    mockPrisma.membroEspaco.findFirst.mockResolvedValue({ id: "membro-2" });

    await expect(criarConvite(ESPACO, REMETENTE, "familiar@teste.com")).rejects.toMatchObject({ status: 409 });
    expect(mockPrisma.convite.create).not.toHaveBeenCalled();
    expect(enviarEmail).not.toHaveBeenCalled();
  });

  it("recusa quando já existe convite pendente e vigente para o e-mail", async () => {
    mockPrisma.membroEspaco.findFirst.mockResolvedValue(null);
    mockPrisma.convite.findFirst.mockResolvedValue({ id: "convite-0" });

    await expect(criarConvite(ESPACO, REMETENTE, "familiar@teste.com")).rejects.toMatchObject({ status: 409 });
    expect(mockPrisma.convite.create).not.toHaveBeenCalled();
  });

  it("marca como expirados os convites vencidos do mesmo e-mail antes de criar o novo", async () => {
    mockPrisma.membroEspaco.findFirst.mockResolvedValue(null);
    mockPrisma.convite.findFirst.mockResolvedValue(null);
    mockPrisma.convite.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: "convite-2", criadoEm: new Date(), ...data }),
    );

    await criarConvite(ESPACO, REMETENTE, "familiar@teste.com");

    expect(mockPrisma.convite.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "EXPIRADO" } }),
    );
  });
});

describe("reenviarConvite / cancelarConvite", () => {
  it("reenviar renova a validade e dispara o e-mail de novo", async () => {
    mockPrisma.convite.findFirst.mockResolvedValue({ id: "convite-1" });
    mockPrisma.convite.update.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: "convite-1", emailConvidado: "familiar@teste.com", criadoEm: new Date(), ...data }),
    );

    const resultado = await reenviarConvite(ESPACO, REMETENTE, "convite-1");

    expect(enviarEmail).toHaveBeenCalledWith(expect.objectContaining({ para: "familiar@teste.com" }));
    expect(resultado.convite.expirado).toBe(false);
  });

  it("reenviar convite de outro espaço (ou inexistente) dá 404", async () => {
    mockPrisma.convite.findFirst.mockResolvedValue(null);

    await expect(reenviarConvite(ESPACO, REMETENTE, "convite-x")).rejects.toMatchObject({ status: 404 });
    expect(mockPrisma.convite.findFirst).toHaveBeenCalledWith({
      where: { id: "convite-x", espacoId: ESPACO, status: "PENDENTE" },
    });
  });

  it("cancelar só age em convite pendente do próprio espaço", async () => {
    mockPrisma.convite.updateMany.mockResolvedValue({ count: 1 });

    await cancelarConvite(ESPACO, "convite-1");

    expect(mockPrisma.convite.updateMany).toHaveBeenCalledWith({
      where: { id: "convite-1", espacoId: ESPACO, status: "PENDENTE" },
      data: expect.objectContaining({ status: "CANCELADO" }),
    });
  });

  it("cancelar convite inexistente dá 404", async () => {
    mockPrisma.convite.updateMany.mockResolvedValue({ count: 0 });

    await expect(cancelarConvite(ESPACO, "convite-x")).rejects.toMatchObject({ status: 404 });
  });
});

describe("convites recebidos", () => {
  const conviteDe = (over: object = {}) => ({
    id: "convite-1",
    espacoId: "espaco-2",
    papel: "EDITOR",
    status: "PENDENTE",
    emailConvidado: "familiar@teste.com",
    expiraEm: new Date(Date.now() + DIA),
    espaco: { id: "espaco-2", nome: "Espaço de outro@teste.com" },
    ...over,
  });

  it("lista só pendentes e vigentes do e-mail do usuário, com o nome de quem convidou", async () => {
    mockPrisma.convite.findMany.mockResolvedValue([
      { id: "convite-1", criadoEm: new Date(), expiraEm: new Date(), criadoPor: { nome: null, email: "outro@teste.com" } },
    ]);

    const lista = await listarConvitesRecebidos("familiar@teste.com");

    expect(mockPrisma.convite.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "PENDENTE", expiraEm: { gt: expect.any(Date) } }),
      }),
    );
    expect(lista).toEqual([expect.objectContaining({ id: "convite-1", convidadoPor: "outro@teste.com" })]);
  });

  it("aceitar cria o vínculo, marca o convite como aceito e invalida o cache do espaço", async () => {
    mockPrisma.convite.findFirst.mockResolvedValue(conviteDe());

    const resultado = await aceitarConvite("user-2", "familiar@teste.com", "convite-1");

    expect(mockPrisma.membroEspaco.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { usuarioId_espacoId: { usuarioId: "user-2", espacoId: "espaco-2" } },
        create: { usuarioId: "user-2", espacoId: "espaco-2", papel: "EDITOR" },
      }),
    );
    expect(mockPrisma.convite.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "ACEITO" }) }),
    );
    expect(invalidarCacheEspaco).toHaveBeenCalledWith("user-2");
    expect(resultado.espaco).toEqual({ id: "espaco-2", nome: "Espaço de outro@teste.com" });
  });

  it("só encontra o convite pelo e-mail do próprio usuário (não aceita convite de terceiros)", async () => {
    mockPrisma.convite.findFirst.mockResolvedValue(null);

    await expect(aceitarConvite("user-3", "intruso@teste.com", "convite-1")).rejects.toMatchObject({
      status: 404,
    });
    expect(mockPrisma.convite.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "convite-1", emailConvidado: { equals: "intruso@teste.com", mode: "insensitive" } },
      }),
    );
    expect(mockPrisma.membroEspaco.upsert).not.toHaveBeenCalled();
  });

  it("não aceita convite já respondido", async () => {
    mockPrisma.convite.findFirst.mockResolvedValue(conviteDe({ status: "CANCELADO" }));

    await expect(aceitarConvite("user-2", "familiar@teste.com", "convite-1")).rejects.toMatchObject({
      status: 409,
    });
    expect(mockPrisma.membroEspaco.upsert).not.toHaveBeenCalled();
  });

  it("não aceita convite vencido e o marca como expirado", async () => {
    mockPrisma.convite.findFirst.mockResolvedValue(conviteDe({ expiraEm: new Date(Date.now() - 1000) }));

    await expect(aceitarConvite("user-2", "familiar@teste.com", "convite-1")).rejects.toMatchObject({
      status: 409,
    });
    expect(mockPrisma.convite.update).toHaveBeenCalledWith({
      where: { id: "convite-1" },
      data: { status: "EXPIRADO" },
    });
    expect(mockPrisma.membroEspaco.upsert).not.toHaveBeenCalled();
  });

  it("recusar marca como cancelado sem criar vínculo", async () => {
    mockPrisma.convite.findFirst.mockResolvedValue(conviteDe());

    await recusarConvite("familiar@teste.com", "convite-1");

    expect(mockPrisma.convite.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "CANCELADO" }) }),
    );
    expect(mockPrisma.membroEspaco.upsert).not.toHaveBeenCalled();
  });
});

describe("sairDoEspaco", () => {
  it("remove só o vínculo do usuário e invalida o cache", async () => {
    mockPrisma.membroEspaco.findFirst.mockResolvedValue({ id: "membro-1", papel: "EDITOR" });
    mockPrisma.membroEspaco.findMany.mockResolvedValue([{ id: "membro-2" }]);

    await sairDoEspaco(ESPACO, "user-1");

    expect(mockPrisma.membroEspaco.delete).toHaveBeenCalledWith({ where: { id: "membro-1" } });
    expect(mockPrisma.membroEspaco.update).not.toHaveBeenCalled();
    expect(invalidarCacheEspaco).toHaveBeenCalledWith("user-1");
  });

  it("transfere a propriedade ao membro mais antigo quando o proprietário sai", async () => {
    mockPrisma.membroEspaco.findFirst.mockResolvedValue({ id: "membro-1", papel: "PROPRIETARIO" });
    mockPrisma.membroEspaco.findMany.mockResolvedValue([{ id: "membro-2" }, { id: "membro-3" }]);

    await sairDoEspaco(ESPACO, "user-1");

    expect(mockPrisma.membroEspaco.update).toHaveBeenCalledWith({
      where: { id: "membro-2" },
      data: { papel: "PROPRIETARIO" },
    });
  });

  it("não deixa sair quem é a única pessoa do espaço", async () => {
    mockPrisma.membroEspaco.findFirst.mockResolvedValue({ id: "membro-1", papel: "PROPRIETARIO" });
    mockPrisma.membroEspaco.findMany.mockResolvedValue([]);

    await expect(sairDoEspaco(ESPACO, "user-1")).rejects.toMatchObject({ status: 409 });
    expect(mockPrisma.membroEspaco.delete).not.toHaveBeenCalled();
    expect(invalidarCacheEspaco).not.toHaveBeenCalled();
  });
});
