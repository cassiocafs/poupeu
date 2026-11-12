import { env } from "../env.js";

interface Email {
  para: string;
  assunto: string;
  html: string;
  texto: string;
}

export function escaparHtml(valor: string): string {
  return valor
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Envia um e-mail transacional pela API do Resend. Retorna `true` só quando o
 * provedor aceitou o envio; sem chave configurada (desenvolvimento) ou em caso
 * de falha, registra no console e retorna `false` — quem chama decide se a
 * falha é fatal (nos convites, não é: o convite continua visível no app).
 */
export async function enviarEmail({ para, assunto, html, texto }: Email): Promise<boolean> {
  if (!env.EMAIL_PROVIDER_API_KEY) {
    console.info(`[email] EMAIL_PROVIDER_API_KEY ausente — e-mail não enviado.\nPara: ${para}\nAssunto: ${assunto}\n${texto}`);
    return false;
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.EMAIL_PROVIDER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: env.EMAIL_FROM, to: [para], subject: assunto, html, text: texto }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const corpo = await res.text().catch(() => "");
      console.error(`[email] Resend respondeu ${res.status}: ${corpo}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[email] falha ao enviar e-mail", err);
    return false;
  }
}
