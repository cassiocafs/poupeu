import { apiFetch } from "./client";

export interface MembroEspaco {
  id: string;
  nome: string | null;
  email: string;
  voceMesmo: boolean;
}

export interface ConviteEnviado {
  id: string;
  emailConvidado: string;
  criadoEm: string;
  expiraEm: string;
  expirado: boolean;
}

export interface EspacoDetalhe {
  espaco: { id: string; nome: string };
  membros: MembroEspaco[];
  convites: ConviteEnviado[];
}

export interface ConviteRecebido {
  id: string;
  convidadoPor: string;
  criadoEm: string;
  expiraEm: string;
}

/** `emailEnviado` é false quando o convite foi criado mas o provedor de e-mail falhou. */
export interface ResultadoConvite {
  convite: ConviteEnviado;
  emailEnviado: boolean;
}

export function obterEspaco(): Promise<EspacoDetalhe> {
  return apiFetch<EspacoDetalhe>("/api/espaco");
}

export function enviarConvite(email: string): Promise<ResultadoConvite> {
  return apiFetch<ResultadoConvite>("/api/espaco/convites", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function reenviarConvite(id: string): Promise<ResultadoConvite> {
  return apiFetch<ResultadoConvite>(`/api/espaco/convites/${id}/reenviar`, { method: "POST" });
}

export function cancelarConvite(id: string): Promise<void> {
  return apiFetch<void>(`/api/espaco/convites/${id}`, { method: "DELETE" });
}

export function sairDoEspaco(): Promise<void> {
  return apiFetch<void>("/api/espaco/sair", { method: "POST" });
}

export function listarConvitesRecebidos(): Promise<ConviteRecebido[]> {
  return apiFetch<ConviteRecebido[]>("/api/convites/recebidos");
}

export function aceitarConvite(id: string): Promise<{ espaco: { id: string; nome: string } }> {
  return apiFetch(`/api/convites/${id}/aceitar`, { method: "POST" });
}

export function recusarConvite(id: string): Promise<void> {
  return apiFetch<void>(`/api/convites/${id}/recusar`, { method: "POST" });
}
