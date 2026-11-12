import type { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { asyncHandler } from "./asyncHandler.js";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "./errorHandler.js";
import { criarCategoriasDefault } from "../modules/categorias/categoriasDefault.js";
import { criarContasDefault } from "../modules/contas/contasDefault.js";

declare global {
  namespace Express {
    interface Request {
      espacoId?: string;
    }
  }
}

// Resolver o espaço do usuário custa um round trip ao banco, que nesta
// aplicação roda em host separado do backend (rede real, não localhost).
// Como o vínculo usuário->espaço praticamente nunca muda após criado, cacheamos
// por um TTL curto em vez de consultar em toda requisição autenticada.
const TTL_CACHE_MS = 60_000;
const cacheEspacoPorUsuario = new Map<string, { espacoId: string; expiraEm: number }>();

/** Descarta o espaço em cache do usuário (ex.: ao aceitar convite ou sair de um espaço). */
export function invalidarCacheEspaco(userId: string) {
  cacheEspacoPorUsuario.delete(userId);
}

export const resolveEspaco = asyncHandler(async function resolveEspaco(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  if (!req.auth) {
    next(new HttpError(401, "Não autenticado"));
    return;
  }

  const { userId, email } = req.auth;

  const emCache = cacheEspacoPorUsuario.get(userId);
  if (emCache && emCache.expiraEm > Date.now()) {
    req.espacoId = emCache.espacoId;
    next();
    return;
  }

  // Caminho comum: o usuário já tem espaço, então evitamos abrir transação
  // e tirar lock a cada requisição.
  const existente = await prisma.membroEspaco.findFirst({
    where: { usuarioId: userId },
    orderBy: { criadoEm: "desc" },
  });

  if (existente) {
    cacheEspacoPorUsuario.set(userId, {
      espacoId: existente.espacoId,
      expiraEm: Date.now() + TTL_CACHE_MS,
    });
    req.espacoId = existente.espacoId;
    next();
    return;
  }

  // Caminho raro: primeiro acesso do usuário. Usa transação + lock para
  // evitar que duas requisições concorrentes criem espaços duplicados.
  const membro = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId})::bigint)`;

    const existenteAposLock = await tx.membroEspaco.findFirst({
      where: { usuarioId: userId },
      orderBy: { criadoEm: "desc" },
    });
    if (existenteAposLock) {
      return existenteAposLock;
    }

    let usuario;
    try {
      usuario = await tx.usuario.upsert({
        where: { id: userId },
        update: email ? { email } : {},
        create: { id: userId, email: email ?? `${userId}@desconhecido.local` },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002" &&
        (err.meta?.target as string[] | undefined)?.includes("email")
      ) {
        throw new HttpError(
          409,
          "Já existe uma conta com esse e-mail. Entre com e-mail e senha.",
        );
      }
      throw err;
    }
    const espaco = await tx.espacoFinanceiro.create({
      data: { nome: `Espaço de ${usuario.email}` },
    });
    await criarCategoriasDefault(tx, espaco.id);
    await criarContasDefault(tx, espaco.id);
    return tx.membroEspaco.create({
      data: { usuarioId: usuario.id, espacoId: espaco.id, papel: "PROPRIETARIO" },
    });
  }, { timeout: 15_000 });

  cacheEspacoPorUsuario.set(userId, {
    espacoId: membro.espacoId,
    expiraEm: Date.now() + TTL_CACHE_MS,
  });
  req.espacoId = membro.espacoId;
  next();
});
