import { PapelMembro, StatusConvite } from "@prisma/client";
import { env } from "../../env.js";
import { escaparHtml, enviarEmail } from "../../lib/email.js";
import { prisma } from "../../lib/prisma.js";
import { HttpError } from "../../middlewares/errorHandler.js";
import { invalidarCacheEspaco } from "../../middlewares/resolveEspaco.js";

const VALIDADE_CONVITE_MS = 7 * 24 * 60 * 60 * 1000;

interface Remetente {
  userId: string;
  email?: string;
}

interface ConviteEnviado {
  id: string;
  emailConvidado: string;
  criadoEm: Date;
  expiraEm: Date;
  expirado: boolean;
}

function emailInsensivel(email: string) {
  return { equals: email, mode: "insensitive" as const };
}

function nomeDe(usuario: { nome: string | null; email: string }): string {
  return usuario.nome?.trim() || usuario.email;
}

function paraConviteEnviado(c: {
  id: string;
  emailConvidado: string;
  criadoEm: Date;
  expiraEm: Date;
}): ConviteEnviado {
  return {
    id: c.id,
    emailConvidado: c.emailConvidado,
    criadoEm: c.criadoEm,
    expiraEm: c.expiraEm,
    expirado: c.expiraEm.getTime() <= Date.now(),
  };
}

async function enviarEmailDeConvite(para: string, convidadoPor: string): Promise<boolean> {
  const link = env.APP_URL?.trim();
  const nome = escaparHtml(convidadoPor);
  const instrucao = link
    ? `Acesse ${link} e entre (ou crie sua conta) com este e-mail para aceitar o convite.`
    : "Abra o app do Poupeu e entre (ou crie sua conta) com este e-mail para aceitar o convite.";

  return enviarEmail({
    para,
    assunto: `${convidadoPor} convidou você para o Poupeu`,
    texto: `${convidadoPor} convidou você para compartilhar um espaço financeiro no Poupeu e registrar transações juntos.\n\n${instrucao}\n\nO convite vale por 7 dias. Se você não conhece essa pessoa, ignore este e-mail.`,
    html: `<p><strong>${nome}</strong> convidou você para compartilhar um espaço financeiro no Poupeu e registrar transações juntos.</p>
<p>${
      link
        ? `<a href="${escaparHtml(link)}">Abra o Poupeu</a> e entre (ou crie sua conta) com este e-mail para aceitar o convite.`
        : escaparHtml(instrucao)
    }</p>
<p style="color:#666;font-size:13px">O convite vale por 7 dias. Se você não conhece essa pessoa, ignore este e-mail.</p>`,
  });
}

export async function obterEspaco(espacoId: string, userId: string) {
  const [espaco, membros, convites] = await Promise.all([
    prisma.espacoFinanceiro.findUniqueOrThrow({ where: { id: espacoId } }),
    prisma.membroEspaco.findMany({
      where: { espacoId },
      include: { usuario: { select: { id: true, nome: true, email: true } } },
      orderBy: { criadoEm: "asc" },
    }),
    prisma.convite.findMany({
      where: { espacoId, status: StatusConvite.PENDENTE },
      orderBy: { criadoEm: "desc" },
    }),
  ]);

  return {
    espaco: { id: espaco.id, nome: espaco.nome },
    membros: membros.map((m) => ({
      id: m.usuario.id,
      nome: m.usuario.nome,
      email: m.usuario.email,
      voceMesmo: m.usuario.id === userId,
    })),
    convites: convites.map(paraConviteEnviado),
  };
}

export async function criarConvite(espacoId: string, remetente: Remetente, email: string) {
  if (remetente.email && remetente.email.toLowerCase() === email) {
    throw new HttpError(400, "Esse é o seu próprio e-mail. Convide outra pessoa.");
  }

  const jaMembro = await prisma.membroEspaco.findFirst({
    where: { espacoId, usuario: { email: emailInsensivel(email) } },
  });
  if (jaMembro) {
    throw new HttpError(409, "Essa pessoa já faz parte do espaço.");
  }

  const agora = new Date();
  const doMesmoEmail = { espacoId, emailConvidado: emailInsensivel(email), status: StatusConvite.PENDENTE };

  const vigente = await prisma.convite.findFirst({
    where: { ...doMesmoEmail, expiraEm: { gt: agora } },
  });
  if (vigente) {
    throw new HttpError(409, "Já existe um convite pendente para esse e-mail.");
  }
  // Convites vencidos do mesmo e-mail não bloqueiam um novo; só saem da fila.
  await prisma.convite.updateMany({
    where: { ...doMesmoEmail, expiraEm: { lte: agora } },
    data: { status: StatusConvite.EXPIRADO },
  });

  const [convite, remetenteDb] = await Promise.all([
    prisma.convite.create({
      data: {
        espacoId,
        emailConvidado: email,
        papel: PapelMembro.EDITOR,
        criadoPorId: remetente.userId,
        expiraEm: new Date(agora.getTime() + VALIDADE_CONVITE_MS),
      },
    }),
    prisma.usuario.findUniqueOrThrow({ where: { id: remetente.userId } }),
  ]);

  const emailEnviado = await enviarEmailDeConvite(email, nomeDe(remetenteDb));
  return { convite: paraConviteEnviado(convite), emailEnviado };
}

export async function reenviarConvite(espacoId: string, remetente: Remetente, conviteId: string) {
  const existente = await prisma.convite.findFirst({
    where: { id: conviteId, espacoId, status: StatusConvite.PENDENTE },
  });
  if (!existente) {
    throw new HttpError(404, "Convite não encontrado");
  }

  const [convite, remetenteDb] = await Promise.all([
    prisma.convite.update({
      where: { id: conviteId },
      data: { expiraEm: new Date(Date.now() + VALIDADE_CONVITE_MS) },
    }),
    prisma.usuario.findUniqueOrThrow({ where: { id: remetente.userId } }),
  ]);

  const emailEnviado = await enviarEmailDeConvite(convite.emailConvidado, nomeDe(remetenteDb));
  return { convite: paraConviteEnviado(convite), emailEnviado };
}

export async function cancelarConvite(espacoId: string, conviteId: string) {
  const { count } = await prisma.convite.updateMany({
    where: { id: conviteId, espacoId, status: StatusConvite.PENDENTE },
    data: { status: StatusConvite.CANCELADO, respondidoEm: new Date() },
  });
  if (count === 0) {
    throw new HttpError(404, "Convite não encontrado");
  }
}

export async function listarConvitesRecebidos(email: string) {
  const convites = await prisma.convite.findMany({
    where: {
      emailConvidado: emailInsensivel(email),
      status: StatusConvite.PENDENTE,
      expiraEm: { gt: new Date() },
    },
    include: { criadoPor: { select: { nome: true, email: true } } },
    orderBy: { criadoEm: "desc" },
  });

  return convites.map((c) => ({
    id: c.id,
    convidadoPor: nomeDe(c.criadoPor),
    criadoEm: c.criadoEm,
    expiraEm: c.expiraEm,
  }));
}

async function buscarConviteRecebido(email: string, conviteId: string) {
  const convite = await prisma.convite.findFirst({
    where: { id: conviteId, emailConvidado: emailInsensivel(email) },
    include: { espaco: true },
  });
  if (!convite) {
    throw new HttpError(404, "Convite não encontrado");
  }
  if (convite.status !== StatusConvite.PENDENTE) {
    throw new HttpError(409, "Este convite não está mais disponível.");
  }
  if (convite.expiraEm.getTime() <= Date.now()) {
    await prisma.convite.update({
      where: { id: convite.id },
      data: { status: StatusConvite.EXPIRADO },
    });
    throw new HttpError(409, "Este convite expirou. Peça um novo convite.");
  }
  return convite;
}

export async function aceitarConvite(userId: string, email: string, conviteId: string) {
  const convite = await buscarConviteRecebido(email, conviteId);

  await prisma.$transaction(async (tx) => {
    // O espaço ativo do usuário é sempre o vínculo mais recente (ver
    // resolveEspaco); por isso, se ele já era membro, renovamos `criadoEm`.
    await tx.membroEspaco.upsert({
      where: { usuarioId_espacoId: { usuarioId: userId, espacoId: convite.espacoId } },
      update: { criadoEm: new Date() },
      create: { usuarioId: userId, espacoId: convite.espacoId, papel: convite.papel },
    });
    await tx.convite.update({
      where: { id: convite.id },
      data: { status: StatusConvite.ACEITO, respondidoEm: new Date() },
    });
  });

  invalidarCacheEspaco(userId);
  return { espaco: { id: convite.espaco.id, nome: convite.espaco.nome } };
}

export async function recusarConvite(email: string, conviteId: string) {
  const convite = await buscarConviteRecebido(email, conviteId);
  await prisma.convite.update({
    where: { id: convite.id },
    data: { status: StatusConvite.CANCELADO, respondidoEm: new Date() },
  });
}

/**
 * Remove o vínculo do usuário com o espaço. O espaço ativo passa a ser o
 * vínculo mais recente que sobrar (normalmente o pessoal, criado antes do
 * convite ser aceito) — é o caminho de volta depois de aceitar um convite.
 */
export async function sairDoEspaco(espacoId: string, userId: string) {
  await prisma.$transaction(async (tx) => {
    const membro = await tx.membroEspaco.findFirst({ where: { espacoId, usuarioId: userId } });
    if (!membro) {
      throw new HttpError(404, "Você não faz parte deste espaço.");
    }

    const outros = await tx.membroEspaco.findMany({
      where: { espacoId, usuarioId: { not: userId } },
      orderBy: { criadoEm: "asc" },
    });
    if (outros.length === 0) {
      throw new HttpError(
        409,
        "Você é a única pessoa neste espaço. Para encerrá-lo, exclua sua conta.",
      );
    }

    if (membro.papel === PapelMembro.PROPRIETARIO) {
      await tx.membroEspaco.update({
        where: { id: outros[0].id },
        data: { papel: PapelMembro.PROPRIETARIO },
      });
    }
    await tx.membroEspaco.delete({ where: { id: membro.id } });
  });

  invalidarCacheEspaco(userId);
}
