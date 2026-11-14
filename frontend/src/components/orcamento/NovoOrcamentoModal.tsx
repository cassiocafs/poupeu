import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listarGrupos } from "@/api/categorias";
import { buscarMediasPorCategoria, criarOrcamento, definirPrevisto } from "@/api/orcamento";
import { Modal } from "@/components/ui/Modal";
import { CurrencyInput } from "@/components/ui/CurrencyInput";
import { Button } from "@/components/ui/Button";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { formatarMoeda } from "@/lib/format";

const CHAVE_SEM_GRUPO = "sem-grupo";

interface NovoOrcamentoModalProps {
  open: boolean;
  ano: number;
  onClose: () => void;
  onCriado: (orcamentoId: string) => void;
}

export function NovoOrcamentoModal({ open, ano, onClose, onCriado }: NovoOrcamentoModalProps) {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["categorias", "grupos"],
    queryFn: listarGrupos,
    enabled: open,
  });
  const { data: medias } = useQuery({
    queryKey: ["orcamento", "medias"],
    queryFn: buscarMediasPorCategoria,
    enabled: open,
  });
  const [gruposExpandidos, setGruposExpandidos] = useState<Record<string, boolean>>({});
  const [valores, setValores] = useState<Record<string, number>>({});

  useEffect(() => {
    if (open) {
      setGruposExpandidos({});
      setValores({});
    }
  }, [open]);

  useEffect(() => {
    if (!open || !medias || !data) return;

    const categoriasComMedia = new Set(medias.filter((m) => m.media > 0).map((m) => m.categoriaId));

    setGruposExpandidos((atual) => {
      const proximo = { ...atual };
      for (const grupo of data.grupos) {
        const temMedia =
          grupo.categorias.some((c) => categoriasComMedia.has(c.id)) ||
          grupo.subgrupos.some((s) => s.categorias.some((c) => categoriasComMedia.has(c.id)));
        if (temMedia) proximo[grupo.id] = true;
      }
      if (data.semGrupo.some((c) => categoriasComMedia.has(c.id))) proximo[CHAVE_SEM_GRUPO] = true;
      return proximo;
    });

    setValores((atual) => {
      const proximo = { ...atual };
      for (const m of medias) {
        if (!(m.categoriaId in proximo) && m.media > 0) {
          proximo[m.categoriaId] = Math.round(m.media * 100) / 100;
        }
      }
      return proximo;
    });
  }, [open, medias, data]);

  function alternarGrupo(chave: string) {
    setGruposExpandidos((prev) => ({ ...prev, [chave]: !prev[chave] }));
  }

  function setValor(categoriaId: string, valor: number) {
    setValores((prev) => ({ ...prev, [categoriaId]: valor }));
  }

  const totalMensal = useMemo(
    () => Object.values(valores).reduce((soma, v) => soma + v, 0),
    [valores],
  );

  const mutation = useMutation({
    mutationFn: async () => {
      const orcamento = await criarOrcamento(ano);
      const itens = Object.entries(valores).filter(([, valor]) => valor > 0);
      for (const [categoriaId, valor] of itens) {
        await definirPrevisto(orcamento.id, { categoriaId, modo: "mesmoValorTodosMeses", valor });
      }
      return orcamento;
    },
    onSuccess: async (orcamento) => {
      await queryClient.invalidateQueries({ queryKey: ["orcamento", "anos"] });
      onCriado(orcamento.id);
    },
  });

  function renderCategoria(categoriaId: string, nome: string) {
    return (
      <div key={categoriaId} className="flex items-center gap-3 py-1">
        <span className="min-w-0 flex-1 truncate text-sm text-foreground/80">{nome}</span>
        <div className="w-32 shrink-0">
          <CurrencyInput value={valores[categoriaId] ?? 0} onChange={(v) => setValor(categoriaId, v)} />
        </div>
      </div>
    );
  }

  const grupos = data?.grupos ?? [];
  const semGrupo = data?.semGrupo ?? [];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Novo orçamento — ${ano}`}
      closable={!mutation.isPending}
    >
      <fieldset disabled={mutation.isPending} className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Defina o valor previsto de cada categoria. Já pré-preenchemos com a média mensal dos
          últimos 12 meses — ajuste como preferir. Esse valor será aplicado a todos os meses de{" "}
          {ano} e poderá ser ajustado mês a mês depois.
        </p>

        {!data ? (
          <ProgressBar label="Carregando categorias..." />
        ) : (
          <div className="max-h-[50vh] space-y-1 overflow-y-auto pr-1">
            {grupos.map((grupo) => {
              const expandido = gruposExpandidos[grupo.id] ?? false;
              return (
                <div key={grupo.id} className="border-b border-border pb-1">
                  <button
                    type="button"
                    onClick={() => alternarGrupo(grupo.id)}
                    className="flex w-full items-center gap-1.5 rounded px-1 py-1.5 text-left text-xs font-bold text-foreground/70 uppercase hover:bg-muted"
                  >
                    <span className="inline-block w-4 text-lg leading-none">
                      {expandido ? "▾" : "▸"}
                    </span>
                    {grupo.nome}
                  </button>
                  {expandido && (
                    <div className="space-y-0.5 pl-5">
                      {grupo.categorias.map((c) => renderCategoria(c.id, c.nome))}
                      {grupo.subgrupos.map((sub) => (
                        <div key={sub.id} className="pt-1">
                          <span className="block px-1 text-[11px] font-semibold text-foreground/50 uppercase">
                            {sub.nome}
                          </span>
                          {sub.categorias.map((c) => renderCategoria(c.id, c.nome))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {semGrupo.length > 0 && (
              <div className="pb-1">
                <button
                  type="button"
                  onClick={() => alternarGrupo(CHAVE_SEM_GRUPO)}
                  className="flex w-full items-center gap-1.5 rounded px-1 py-1.5 text-left text-xs font-bold text-foreground/70 uppercase hover:bg-muted"
                >
                  <span className="inline-block w-4 text-lg leading-none">
                    {gruposExpandidos[CHAVE_SEM_GRUPO] ? "▾" : "▸"}
                  </span>
                  Sem grupo
                </button>
                {gruposExpandidos[CHAVE_SEM_GRUPO] && (
                  <div className="space-y-0.5 pl-5">
                    {semGrupo.map((c) => renderCategoria(c.id, c.nome))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between border-t border-border pt-2 text-sm">
          <span className="text-muted-foreground">Total previsto por mês</span>
          <span className="num font-medium text-foreground">{formatarMoeda(totalMensal)}</span>
        </div>

        {mutation.isError && (
          <p className="text-sm text-destructive">
            {mutation.error instanceof Error ? mutation.error.message : "Erro ao criar orçamento"}
          </p>
        )}

        {mutation.isPending && <ProgressBar label="Criando orçamento..." />}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            Cancelar
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !data}>
            {mutation.isPending ? "Salvando..." : "Criar orçamento"}
          </Button>
        </div>
      </fieldset>
    </Modal>
  );
}
