import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { authenticate } from "../../middlewares/authenticate.js";
import { asyncHandler } from "../../middlewares/asyncHandler.js";
import { HttpError } from "../../middlewares/errorHandler.js";
import { resolveEspaco } from "../../middlewares/resolveEspaco.js";
import { idSchema } from "../../lib/schemas.js";
import { criarConviteSchema } from "./espaco.schemas.js";
import * as espacoService from "./espaco.service.js";

// Convites disparam e-mail para terceiros; o limite por usuário evita que a
// tela vire um canal de spam.
const envioConviteLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.auth!.userId,
  message: { error: "Muitos convites enviados. Tente novamente mais tarde." },
});

function emailDoUsuario(email: string | undefined): string {
  if (!email) {
    throw new HttpError(403, "Sua conta não tem e-mail associado.");
  }
  return email.toLowerCase();
}

export const espacoRouter = Router();

espacoRouter.use(authenticate, resolveEspaco);

espacoRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    res.json(await espacoService.obterEspaco(req.espacoId!, req.auth!.userId));
  }),
);

espacoRouter.post(
  "/convites",
  envioConviteLimiter,
  asyncHandler(async (req, res) => {
    const { email } = criarConviteSchema.parse(req.body);
    const resultado = await espacoService.criarConvite(req.espacoId!, req.auth!, email);
    res.status(201).json(resultado);
  }),
);

espacoRouter.post(
  "/convites/:id/reenviar",
  envioConviteLimiter,
  asyncHandler(async (req, res) => {
    const id = idSchema.parse(req.params.id);
    res.json(await espacoService.reenviarConvite(req.espacoId!, req.auth!, id));
  }),
);

espacoRouter.delete(
  "/convites/:id",
  asyncHandler(async (req, res) => {
    const id = idSchema.parse(req.params.id);
    await espacoService.cancelarConvite(req.espacoId!, id);
    res.status(204).send();
  }),
);

espacoRouter.post(
  "/sair",
  asyncHandler(async (req, res) => {
    await espacoService.sairDoEspaco(req.espacoId!, req.auth!.userId);
    res.status(204).send();
  }),
);

export const convitesRouter = Router();

convitesRouter.use(authenticate, resolveEspaco);

convitesRouter.get(
  "/recebidos",
  asyncHandler(async (req, res) => {
    const email = emailDoUsuario(req.auth!.email);
    res.json(await espacoService.listarConvitesRecebidos(email));
  }),
);

convitesRouter.post(
  "/:id/aceitar",
  asyncHandler(async (req, res) => {
    const id = idSchema.parse(req.params.id);
    const email = emailDoUsuario(req.auth!.email);
    res.json(await espacoService.aceitarConvite(req.auth!.userId, email, id));
  }),
);

convitesRouter.post(
  "/:id/recusar",
  asyncHandler(async (req, res) => {
    const id = idSchema.parse(req.params.id);
    const email = emailDoUsuario(req.auth!.email);
    await espacoService.recusarConvite(email, id);
    res.status(204).send();
  }),
);
