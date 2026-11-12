import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  cancelarConvite,
  enviarConvite,
  obterEspaco,
  reenviarConvite,
  sairDoEspaco,
  type ConviteEnviado,
  type ResultadoConvite,
} from "@/api/espaco";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { cardClassName } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

const QUERY_KEY = ["espaco"];

function textoExpiracao(convite: ConviteEnviado): string {
  if (convite.expirado) return "Expirado";
  const dias = Math.ceil((new Date(convite.expiraEm).getTime() - Date.now()) / 86_400_000);
  return dias <= 1 ? "Expira hoje ou amanhã" : `Expira em ${dias} dias`;
}

function mensagemErro(err: unknown, padrao: string): string {
  return err instanceof Error ? err.message : padrao;
}

export function EspacoSection() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery({ queryKey: QUERY_KEY, queryFn: obterEspaco });

  const [email, setEmail] = useState("");
  const [aviso, setAviso] = useState<{ tipo: "ok" | "atencao"; texto: string } | null>(null);
  const [saindo, setSaindo] = useState(false);

  function aposEnvio({ convite, emailEnviado }: ResultadoConvite) {
    setAviso(
      emailEnviado
        ? { tipo: "ok", texto: `Convite enviado para ${convite.emailConvidado}.` }
        : {
            tipo: "atencao",
            texto: `Convite criado, mas não conseguimos enviar o e-mail. Quando ${convite.emailConvidado} entrar no Poupeu com esse e-mail, o convite aparecerá para aceitar.`,
          },
    );
    queryClient.invalidateQueries({ queryKey: QUERY_KEY });
  }

  const enviar = useMutation({
    mutationFn: (email: string) => enviarConvite(email),
    onSuccess: (resultado) => {
      setEmail("");
      aposEnvio(resultado);
    },
    onError: () => setAviso(null),
  });

  const reenviar = useMutation({
    mutationFn: (id: string) => reenviarConvite(id),
    onSuccess: aposEnvio,
    onError: () => setAviso(null),
  });

  const cancelar = useMutation({
    mutationFn: (id: string) => cancelarConvite(id),
    onSuccess: () => {
      setAviso(null);
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });

  const sair = useMutation({
    mutationFn: () => sairDoEspaco(),
    onSuccess: async () => {
      setSaindo(false);
      // Voltamos ao espaço pessoal: nada em cache pertence a ele.
      await queryClient.resetQueries();
    },
  });

  function aoEnviar(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    enviar.mutate(email.trim());
  }

  const membros = data?.membros ?? [];
  const convites = data?.convites ?? [];
  const erroAcao = enviar.error ?? reenviar.error ?? cancelar.error;

  return (
    <section className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Espaço compartilhado</h2>
        <p className="text-sm text-muted-foreground">
          Convide familiares pelo e-mail para registrar transações junto com você. Todos os membros
          têm o mesmo acesso: veem e editam as mesmas contas, transações, categorias e orçamentos.
        </p>
      </div>

      <form onSubmit={aoEnviar} className="space-y-2">
        <label htmlFor="convite-email" className="block text-sm font-medium text-foreground/80">
          E-mail do familiar
        </label>
        <div className="flex flex-wrap gap-2">
          <input
            id="convite-email"
            type="email"
            inputMode="email"
            autoComplete="off"
            placeholder="nome@exemplo.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-12 min-w-0 flex-1 rounded-[11px] border border-border bg-muted px-3 text-[13px] text-foreground"
          />
          <Button type="submit" disabled={enviar.isPending || !email.trim()}>
            {enviar.isPending ? "Enviando..." : "Enviar convite"}
          </Button>
        </div>
        {aviso && (
          <p
            role="status"
            className={`text-sm ${aviso.tipo === "ok" ? "text-foreground/80" : "text-destructive"}`}
          >
            {aviso.texto}
          </p>
        )}
        {erroAcao && (
          <p role="alert" className="text-sm text-destructive">
            {mensagemErro(erroAcao, "Não foi possível concluir a ação")}
          </p>
        )}
      </form>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}
      {isError && <p className="text-sm text-destructive">Não foi possível carregar o espaço.</p>}

      {data && (
        <>
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-foreground">Membros ({membros.length})</h3>
            <ul className={`divide-y divide-border ${cardClassName}`}>
              {membros.map((membro) => (
                <li key={membro.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                  <Avatar name={membro.nome ?? membro.email} size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-foreground">
                      {membro.nome ?? membro.email}
                      {membro.voceMesmo && (
                        <span className="ml-2 rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-accent-foreground">
                          Você
                        </span>
                      )}
                    </p>
                    {membro.nome && (
                      <p className="truncate text-xs text-muted-foreground">{membro.email}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {convites.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground">Convites pendentes</h3>
              <ul className={`divide-y divide-border ${cardClassName}`}>
                {convites.map((convite) => (
                  <li key={convite.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-foreground">{convite.emailConvidado}</p>
                      <p
                        className={`text-xs ${convite.expirado ? "text-destructive" : "text-muted-foreground"}`}
                      >
                        {textoExpiracao(convite)}
                      </p>
                    </div>
                    <div className="flex gap-4">
                      <button
                        type="button"
                        onClick={() => reenviar.mutate(convite.id)}
                        disabled={reenviar.isPending}
                        className="text-muted-foreground underline hover:text-foreground disabled:opacity-50"
                      >
                        Reenviar
                      </button>
                      <button
                        type="button"
                        onClick={() => cancelar.mutate(convite.id)}
                        disabled={cancelar.isPending}
                        className="text-destructive underline hover:text-destructive/80 disabled:opacity-50"
                      >
                        Cancelar
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {membros.length > 1 && (
            <div className="space-y-2 border-t border-border pt-4">
              <p className="text-xs text-muted-foreground">
                Sair do espaço devolve você ao espaço em que estava antes. Os dados compartilhados
                continuam com os outros membros.
              </p>
              <Button variant="destructive" size="sm" onClick={() => setSaindo(true)}>
                Sair do espaço compartilhado
              </Button>
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={saindo}
        onClose={() => setSaindo(false)}
        onConfirm={() => sair.mutate()}
        title="Sair do espaço compartilhado"
        confirmLabel="Sair do espaço"
        confirmando={sair.isPending}
      >
        <div className="space-y-2">
          <p>
            Você deixará de ver as contas e transações deste espaço. Para voltar, será preciso um
            novo convite.
          </p>
          {sair.isError && (
            <p className="text-sm text-destructive">
              {mensagemErro(sair.error, "Erro ao sair do espaço")}
            </p>
          )}
        </div>
      </ConfirmDialog>
    </section>
  );
}
