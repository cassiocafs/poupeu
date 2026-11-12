import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Users } from "lucide-react";
import {
  aceitarConvite,
  listarConvitesRecebidos,
  recusarConvite,
  type ConviteRecebido,
} from "@/api/espaco";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

/**
 * Convites pendentes para o e-mail de quem está logado. Aparece em qualquer
 * página do app: entrar no espaço de outra pessoa sempre exige aceite explícito.
 */
export function ConvitesRecebidosBanner() {
  const queryClient = useQueryClient();
  const [aceitando, setAceitando] = useState<ConviteRecebido | null>(null);

  const { data: convites = [] } = useQuery({
    queryKey: ["convites", "recebidos"],
    queryFn: listarConvitesRecebidos,
  });

  const aceitar = useMutation({
    mutationFn: (id: string) => aceitarConvite(id),
    onSuccess: async () => {
      setAceitando(null);
      // O espaço ativo mudou: nada do que está em cache pertence ao novo espaço.
      await queryClient.resetQueries();
    },
  });

  const recusar = useMutation({
    mutationFn: (id: string) => recusarConvite(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["convites", "recebidos"] }),
  });

  if (convites.length === 0) return null;

  return (
    <div className="space-y-3 pt-4 sm:pt-6 lg:pt-8">
      {convites.map((convite) => (
        <Card key={convite.id} tone="soft" className="flex flex-wrap items-center gap-3 p-4">
          <Users className="size-5 shrink-0" aria-hidden="true" />
          <p className="min-w-0 flex-1 text-sm">
            <strong>{convite.convidadoPor}</strong> convidou você para compartilhar as finanças e
            registrar transações juntos.
          </p>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => recusar.mutate(convite.id)}
              disabled={recusar.isPending}
            >
              Recusar
            </Button>
            <Button size="sm" onClick={() => setAceitando(convite)}>
              Aceitar
            </Button>
          </div>
        </Card>
      ))}
      {recusar.isError && (
        <p className="text-sm text-destructive">
          {recusar.error instanceof Error ? recusar.error.message : "Erro ao recusar o convite"}
        </p>
      )}

      <ConfirmDialog
        open={!!aceitando}
        onClose={() => setAceitando(null)}
        onConfirm={() => aceitando && aceitar.mutate(aceitando.id)}
        title="Entrar no espaço compartilhado"
        confirmLabel="Entrar no espaço"
        confirmando={aceitar.isPending}
        danger={false}
      >
        <div className="space-y-2">
          <p>
            Você passará a ver e editar as contas, transações, categorias e orçamentos de{" "}
            <strong>{aceitando?.convidadoPor}</strong>, e essa pessoa verá o que você registrar.
          </p>
          <p>
            Seus dados atuais ficam guardados no seu espaço pessoal e voltam a aparecer se você sair
            do espaço compartilhado (em Configurações).
          </p>
          {aceitar.isError && (
            <p className="text-sm text-destructive">
              {aceitar.error instanceof Error ? aceitar.error.message : "Erro ao aceitar o convite"}
            </p>
          )}
        </div>
      </ConfirmDialog>
    </div>
  );
}
