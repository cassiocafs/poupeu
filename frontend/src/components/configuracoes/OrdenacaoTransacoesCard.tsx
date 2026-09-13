import { ListOrdered } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { usePreferences } from "@/contexts/PreferencesContext";
import type { OrdenacaoTransacoes } from "@/lib/ordenacaoTransacoes";

const opcoes: { valor: OrdenacaoTransacoes; label: string }[] = [
  { valor: "recentes", label: "Mais recentes primeiro" },
  { valor: "antigas", label: "Mais antigas primeiro" },
];

export function OrdenacaoTransacoesCard() {
  const { ordenacaoTransacoes, setOrdenacaoTransacoes } = usePreferences();

  return (
    <Card className="p-6">
      <div className="flex items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-accent text-accent-foreground">
          <ListOrdered className="size-4" />
        </span>
        <h3 className="font-display text-sm font-bold text-foreground">Ordenação das transações</h3>
      </div>
      <p className="mt-3.5 text-xs leading-relaxed text-muted-foreground">
        Escolha o que aparece no topo da lista de transações.
      </p>
      <div className="mt-4 flex w-fit gap-1 rounded-[11px] border border-border bg-muted/50 p-1">
        {opcoes.map(({ valor, label }) => (
          <button
            key={valor}
            type="button"
            onClick={() => setOrdenacaoTransacoes(valor)}
            className={`rounded-[8px] px-3 py-1.5 text-xs font-semibold transition-colors ${
              ordenacaoTransacoes === valor
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </Card>
  );
}
