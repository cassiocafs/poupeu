import compression from "compression";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { env } from "./env.js";
import { errorHandler } from "./middlewares/errorHandler.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { contasRouter } from "./modules/contas/contas.routes.js";
import { categoriasRouter } from "./modules/categorias/categorias.routes.js";
import { transacoesRouter } from "./modules/transacoes/transacoes.routes.js";
import { orcamentoRouter } from "./modules/orcamento/orcamento.routes.js";
import { importacaoRouter } from "./modules/importacao/importacao.routes.js";
import { regrasRouter } from "./modules/regras/regras.routes.js";
import { metasRouter } from "./modules/metas/metas.routes.js";
import { convitesRouter, espacoRouter } from "./modules/espaco/espaco.routes.js";

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

const importacaoLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

export function createApp() {
  const app = express();

  // Em produção o app roda atrás do proxy da Hostinger (LiteSpeed), que envia
  // o IP real em X-Forwarded-For. Sem isto o express-rate-limit não consegue
  // distinguir os clientes (agrupa todo mundo no IP do proxy) e ainda dispara
  // um ValidationError a cada requisição.
  app.set("trust proxy", 1);

  app.use(
    helmet({
      // API pura (sem HTML), consumida por frontend web e app mobile em
      // origens diferentes do backend — CSP não se aplica e o CORP padrão
      // ("same-origin") bloquearia o navegador de ler as respostas.
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: "cross-origin" },
    }),
  );
  app.use(compression());
  app.use(cors({ origin: env.CORS_ORIGIN }));
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/api", apiLimiter);

  app.use("/api/auth", authRouter);
  app.use("/api/contas", contasRouter);
  app.use("/api/categorias", categoriasRouter);
  app.use("/api/transacoes", transacoesRouter);
  app.use("/api/orcamento", orcamentoRouter);
  app.use("/api/importacoes", importacaoLimiter, importacaoRouter);
  app.use("/api/regras", regrasRouter);
  app.use("/api/metas", metasRouter);
  app.use("/api/espaco", espacoRouter);
  app.use("/api/convites", convitesRouter);

  app.use(errorHandler);

  return app;
}
