import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { listarTransacoesMes, type StatusFiltro } from "@/api/transacoes";
import { listarContas } from "@/api/contas";
import { useAccountFilter } from "@/contexts/AccountFilterContext";
import { useCategoryFilter } from "@/contexts/CategoryFilterContext";
import { usePreferences } from "@/contexts/PreferencesContext";
import { ordenarDias } from "@/lib/ordenacaoTransacoes";
import { MesNavigator } from "@/components/shared/MesNavigator";
import { BuscaEStatusBar } from "@/components/transacoes/BuscaEStatusBar";
import { TransacoesLista } from "@/components/transacoes/TransacoesLista";
import { TransacaoFormInline } from "@/components/transacoes/TransacaoFormInline";
import { AcoesLoteBar } from "@/components/transacoes/AcoesLoteBar";
import { Button } from "@/components/ui/Button";

function hoje() {
  const agora = new Date();
  return { ano: agora.getFullYear(), mes: agora.getMonth() + 1 };
}

export function TransacoesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const padrao = hoje();
  const ano = Number(searchParams.get("ano")) || padrao.ano;
  const mes = Number(searchParams.get("mes")) || padrao.mes;

  const [status, setStatus] = useState<StatusFiltro>("todas");
  const [contaIds, setContaIds] = useState<string[]>([]);
  const [texto, setTexto] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [criando, setCriando] = useState(false);
  const [formCriacaoKey, setFormCriacaoKey] = useState(0);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [mensagemSucesso, setMensagemSucesso] = useState<string | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const mensagemTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const topBarRef = useRef<HTMLDivElement>(null);
  const [topBarHeight, setTopBarHeight] = useState(0);

  const { data: contas = [] } = useQuery({ queryKey: ["contas"], queryFn: () => listarContas(true) });
  const { contasSelecionadasIds } = useAccountFilter();
  const { categoriasSelecionadasIds, alternarCategoriaSelecionada } = useCategoryFilter();
  const { ordenacaoTransacoes } = usePreferences();
  const categoriaIds =
    categoriasSelecionadasIds.length > 0 ? categoriasSelecionadasIds : undefined;

  useEffect(() => {
    if (searchParams.get("novo") === "1") {
      setCriando(true);
      const proximos = new URLSearchParams(searchParams);
      proximos.delete("novo");
      setSearchParams(proximos, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Semeia o filtro de categoria a partir de `?categoriaIds=` (ex.: CTA de um insight
  // na Home). Consome o param e limpa da URL, no mesmo padrão do `?novo=1`.
  useEffect(() => {
    const param = searchParams.get("categoriaIds");
    if (!param) return;
    const ids = param.split(",").filter(Boolean);
    for (const id of ids) {
      if (!categoriasSelecionadasIds.includes(id)) alternarCategoriaSelecionada(id);
    }
    const proximos = new URLSearchParams(searchParams);
    proximos.delete("categoriaIds");
    setSearchParams(proximos, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (contas.length > 0 && contaIds.length === 0) {
      setContaIds(contasSelecionadasIds.length > 0 ? contasSelecionadasIds : contas.map((c) => c.id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contas]);

  useEffect(() => {
    if (contasSelecionadasIds.length > 0) {
      setContaIds(contasSelecionadasIds);
    } else if (contas.length > 0) {
      setContaIds(contas.map((c) => c.id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contasSelecionadasIds]);

  const { data, isLoading } = useQuery({
    queryKey: ["transacoes", { ano, mes, contaIds, status, texto, categoriaIds }],
    queryFn: () =>
      listarTransacoesMes({
        ano,
        mes,
        contaIds: contaIds.length > 0 ? contaIds : undefined,
        categoriaIds,
        status,
        texto: texto || undefined,
      }),
    enabled: contaIds.length > 0,
  });

  function mudarMes(novoAno: number, novoMes: number) {
    setSearchParams({ ano: String(novoAno), mes: String(novoMes) });
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  }

  function mostrarMensagemSucesso(mensagem: string) {
    if (mensagemTimeoutRef.current) clearTimeout(mensagemTimeoutRef.current);
    setMensagemSucesso(mensagem);
    mensagemTimeoutRef.current = setTimeout(() => setMensagemSucesso(null), 6000);
  }

  function fecharMensagemSucesso() {
    if (mensagemTimeoutRef.current) clearTimeout(mensagemTimeoutRef.current);
    setMensagemSucesso(null);
  }

  useEffect(() => {
    return () => {
      if (mensagemTimeoutRef.current) clearTimeout(mensagemTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    const el = topBarRef.current;
    if (!el) return;
    const atualizarAltura = () => setTopBarHeight(el.getBoundingClientRect().height);
    atualizarAltura();
    const observer = new ResizeObserver(atualizarAltura);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="space-y-4">
      <div
        ref={topBarRef}
        className="sticky top-0 z-20 -mx-4 space-y-3 bg-background px-4 pb-2 pt-1 will-change-transform sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8"
      >
        <BuscaEStatusBar
          texto={texto}
          onTextoChange={setTexto}
          status={status}
          onStatusChange={setStatus}
          className="!shadow-none"
          acoesInicio={
            <>
              <Button size="sm" onClick={() => setCriando(true)} disabled={excluindo}>
                Adicionar transação
              </Button>
              <MesNavigator ano={ano} mes={mes} onChange={mudarMes} />
              <button
                type="button"
                onClick={() => mudarMes(padrao.ano, padrao.mes)}
                className="flex h-9 items-center rounded-[11px] border border-border px-3 text-[13px] text-foreground/70 hover:bg-muted"
              >
                Hoje
              </button>
            </>
          }
          acoesLote={
            selectedIds.length > 0 ? (
              <AcoesLoteBar
                selectedIds={selectedIds}
                onDone={() => setSelectedIds([])}
                onExcluindoChange={setExcluindo}
                onExcluida={(quantidade) =>
                  mostrarMensagemSucesso(
                    quantidade === 1
                      ? "Transação excluída com sucesso"
                      : `${quantidade} transações excluídas com sucesso`,
                  )
                }
              />
            ) : undefined
          }
        />
      </div>

      {mensagemSucesso && (
        <div className="relative flex items-center justify-center rounded-[11px] border border-income/20 bg-income-soft px-10 py-2.5 text-sm font-bold text-income shadow-soft">
          <span className="flex items-center gap-2">
            <svg
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-4 w-4 shrink-0"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z"
                clipRule="evenodd"
              />
            </svg>
            {mensagemSucesso}
          </span>
          <button
            type="button"
            onClick={fecharMensagemSucesso}
            aria-label="Fechar mensagem"
            className="absolute right-3 rounded p-1 text-income/60 hover:text-income"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        </div>
      )}

      <div className="space-y-4">
        {criando && (
          <TransacaoFormInline
            key={formCriacaoKey}
            contaIdPadrao={contaIds.length === 1 ? contaIds[0] : undefined}
            onSaved={() => {
              setFormCriacaoKey((k) => k + 1);
              mostrarMensagemSucesso("Transação criada com sucesso");
            }}
            onCancel={() => setCriando(false)}
          />
        )}

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : (
          <TransacoesLista
            dias={ordenarDias(data?.dias ?? [], ordenacaoTransacoes)}
            saldoAnterior={data?.saldoAnterior}
            headerOffset={topBarHeight}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            editandoId={editandoId}
            onEdit={setEditandoId}
            onSaved={() => {
              setEditandoId(null);
              mostrarMensagemSucesso("Transação atualizada com sucesso");
            }}
            desabilitada={excluindo}
          />
        )}
      </div>
    </div>
  );
}
