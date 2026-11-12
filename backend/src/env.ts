import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(3001),
  CORS_ORIGIN: z
    .string()
    .default("http://localhost:5173")
    .transform((value) => value.split(",").map((origin) => origin.trim())),
  DATABASE_URL: z.string().min(1, "DATABASE_URL é obrigatório"),
  DIRECT_URL: z.string().min(1, "DIRECT_URL é obrigatório"),
  SUPABASE_URL: z.string().min(1, "SUPABASE_URL é obrigatório"),
  SUPABASE_JWT_SECRET: z.string().optional(),
  // Necessária apenas para excluir o usuário no Supabase Auth (Settings > API > service_role).
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  EMAIL_PROVIDER_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("no-reply@poupeu.app"),
  // URL pública do app web, usada no link dos e-mails de convite. Sem ela, o
  // e-mail apenas orienta a abrir o app.
  APP_URL: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Variáveis de ambiente inválidas ou ausentes:");
  console.error(parsed.error.format());
  process.exit(1);
}

export const env = parsed.data;
