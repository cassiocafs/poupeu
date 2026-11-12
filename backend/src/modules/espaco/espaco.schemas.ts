import { z } from "zod";

export const criarConviteSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254, "E-mail inválido")
    .pipe(z.email("E-mail inválido")),
});
export type CriarConviteInput = z.infer<typeof criarConviteSchema>;
