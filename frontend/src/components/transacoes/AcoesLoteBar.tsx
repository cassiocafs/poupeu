import { useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  categorizarLote,
  consolidarLote,
  excluirTransacoesLote,
} from "@/api/transacoes";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { CategoriaAutocomplete } from "./CategoriaAutocomplete";

interface AcoesLoteBarProps {
  selectedIds: string[];
  onDone: () => void;
  onExcluida: (quantidade: number) => void;
  onExcluindoChange: (excluindo: boolean) => void;
}

export function AcoesLoteBar({
  selectedIds,
  onDone,
  onExcluida,
  onExcluindoChange,
}: AcoesLoteBarProps) {
  const queryClient = useQueryClient();
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
  const [categoriaEmLote, setCategoriaEmLote] = useState<string | null>(null);

  function invalidarEFinalizar() {
    queryClient.invalidateQueries({ queryKey: ["transacoes"] });
    queryClient.invalidateQueries({ queryKey: ["orcamento"] });
    queryClient.invalidateQueries({ queryKey: ["contas"] });
    onDone();
  }

  const excluirMutation = useMutation({
    mutationFn: () => excluirTransacoesLote(selectedIds),
    onSuccess: () => {
      const quantidade = selectedIds.length;
      invalidarEFinalizar();
      setConfirmandoExclusao(false);
      onExcluida(quantidade);
    },
  });

  const consolidarMutation = useMutation({
    mutationFn: (consolidado: boolean) => consolidarLote(selectedIds, consolidado),
    onSuccess: invalidarEFinalizar,
  });

  const categorizarMutation = useMutation({
    mutationFn: () => categorizarLote(selectedIds, categoriaEmLote),
    onSuccess: invalidarEFinalizar,
  });

  const excluindo = excluirMutation.isPending;

  useEffect(() => {
    onExcluindoChange(excluindo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [excluindo]);

  if (selectedIds.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-3">
      {excluindo ? (
        <span className="flex items-center gap-2 font-medium text-foreground">
          <LoaderCircle className="h-4 w-4 animate-spin text-foreground/60" aria-hidden="true" />
          Excluindo {selectedIds.length} transação(ões)...
        </span>
      ) : (
        <span className="font-medium text-foreground">{selectedIds.length} selecionada(s)</span>
      )}
      <button
        type="button"
        disabled={excluindo}
        onClick={() => consolidarMutation.mutate(true)}
        className="rounded-[11px] border border-border px-3 py-1 text-foreground/80 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
      >
        Consolidar
      </button>
      <button
        type="button"
        disabled={excluindo}
        onClick={() => consolidarMutation.mutate(false)}
        className="rounded-[11px] border border-border px-3 py-1 text-foreground/80 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
      >
        Desmarcar consolidação
      </button>
      <div className="flex items-center gap-2">
        <div className="w-48">
          <CategoriaAutocomplete
            value={categoriaEmLote ?? ""}
            onChange={(v) => setCategoriaEmLote(v || null)}
            disabled={excluindo}
          />
        </div>
        <button
          type="button"
          disabled={categorizarMutation.isPending || excluindo}
          onClick={() => categorizarMutation.mutate()}
          className="rounded-[11px] border border-border px-3 py-1 text-foreground/80 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
        >
          Alterar categoria
        </button>
      </div>
      <button
        type="button"
        disabled={excluindo}
        onClick={() => setConfirmandoExclusao(true)}
        className="rounded-[11px] border border-destructive/40 px-3 py-1 text-destructive hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Excluir
      </button>

      <ConfirmDialog
        open={confirmandoExclusao}
        onClose={() => setConfirmandoExclusao(false)}
        onConfirm={() => excluirMutation.mutate()}
        title="Excluir transações"
        confirmLabel="Excluir"
        confirmando={excluindo}
      >
        Tem certeza que deseja excluir {selectedIds.length} transação(ões)? Essa ação é
        permanente.
      </ConfirmDialog>
    </div>
  );
}
