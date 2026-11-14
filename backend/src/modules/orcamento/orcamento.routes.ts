import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { asyncHandler } from "../../middlewares/asyncHandler.js";
import { resolveEspaco } from "../../middlewares/resolveEspaco.js";
import { idSchema } from "../../lib/schemas.js";
import {
  criarOrcamentoSchema,
  definirPrevistoSchema,
  gradePorAnoQuerySchema,
  itensQuerySchema,
} from "./orcamento.schemas.js";
import * as orcamentoService from "./orcamento.service.js";

export const orcamentoRouter = Router();

orcamentoRouter.use(authenticate, resolveEspaco);

orcamentoRouter.get(
  "/grade",
  asyncHandler(async (req, res) => {
    const { ano, mes } = gradePorAnoQuerySchema.parse(req.query);
    const grade = await orcamentoService.buscarGradePorAno(req.espacoId!, ano, mes);
    res.json(grade);
  }),
);

orcamentoRouter.get(
  "/anos",
  asyncHandler(async (req, res) => {
    const anos = await orcamentoService.listarAnos(req.espacoId!);
    res.json(anos);
  }),
);

orcamentoRouter.get(
  "/medias",
  asyncHandler(async (req, res) => {
    const medias = await orcamentoService.buscarMediasPorCategoria(req.espacoId!);
    res.json(medias);
  }),
);

orcamentoRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const { ano } = criarOrcamentoSchema.parse(req.body);
    const orcamento = await orcamentoService.criarOrcamento(req.espacoId!, ano);
    res.status(201).json(orcamento);
  }),
);

orcamentoRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = idSchema.parse(req.params.id);
    await orcamentoService.excluirOrcamento(req.espacoId!, id);
    res.status(204).send();
  }),
);

orcamentoRouter.get(
  "/:id/itens",
  asyncHandler(async (req, res) => {
    const id = idSchema.parse(req.params.id);
    const { mes } = itensQuerySchema.parse(req.query);
    const grade = await orcamentoService.buscarGrade(req.espacoId!, id, mes);
    res.json(grade);
  }),
);

orcamentoRouter.post(
  "/:id/itens",
  asyncHandler(async (req, res) => {
    const id = idSchema.parse(req.params.id);
    const input = definirPrevistoSchema.parse(req.body);
    await orcamentoService.definirPrevisto(req.espacoId!, id, input);
    res.status(201).json({ ok: true });
  }),
);

orcamentoRouter.delete(
  "/:id/itens/:categoriaId",
  asyncHandler(async (req, res) => {
    const id = idSchema.parse(req.params.id);
    const categoriaId = idSchema.parse(req.params.categoriaId);
    await orcamentoService.removerCategoriaDoOrcamento(req.espacoId!, id, categoriaId);
    res.status(204).send();
  }),
);
