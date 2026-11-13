import { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { PeriodoMes } from "@/api/transacoes";
import { buscarRelatorio } from "@/api/relatorios";
import { useAccountFilter } from "@/contexts/AccountFilterContext";
import { CategoriaDrilldownChart } from "@/components/home/CategoriaDrilldownChart";
import { PeriodoSelector } from "@/components/relatorios/PeriodoSelector";
import { RelatorioTotais } from "@/components/relatorios/RelatorioTotais";
import { ReceitaDespesaChart } from "@/components/relatorios/ReceitaDespesaChart";
import { TabelaHierarquicaCategorias } from "@/components/relatorios/TabelaHierarquicaCategorias";
import { LinhasCategoriaChart } from "@/components/relatorios/LinhasCategoriaChart";
import { TabelaPivotCategorias } from "@/components/relatorios/TabelaPivotCategorias";
import { ExportarCsvButton } from "@/components/relatorios/ExportarCsvButton";
import { EmptyState } from "@/components/shared/EmptyState";
import { Card } from "@/components/ui/Card";
import {
  contarMeses,
  formatarPeriodoLabel,
  hojePeriodo,
  ordinalMes,
  paramParaPeriodo,
  periodoParaParam,
  subtrairMeses,
} from "@/lib/periodo";

function periodoPadrao(): { inicio: PeriodoMes; fim: PeriodoMes } {
  const fim = hojePeriodo();
  return { inicio: subtrairMeses(fim, 5), fim };
}

export function RelatoriosPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const padrao = periodoPadrao();
  const inicio = paramParaPeriodo(searchParams.get("ini")) ?? padrao.inicio;
  const fim = paramParaPeriodo(searchParams.get("fim")) ?? padrao.fim;

  const { contasSelecionadasIds } = useAccountFilter();
  const contaIds = contasSelecionadasIds.length > 0 ? contasSelecionadasIds : undefined;

  const totalMeses = contarMeses(inicio, fim);
  const periodoValido = ordinalMes(inicio) <= ordinalMes(fim) && totalMeses <= 24;
  const periodoLabel = useMemo(() => formatarPeriodoLabel(inicio, fim), [inicio, fim]);

  function mudarPeriodo(novoInicio: PeriodoMes, novoFim: PeriodoMes) {
    const proximos = new URLSearchParams(searchParams);
    proximos.set("ini", periodoParaParam(novoInicio));
    proximos.set("fim", periodoParaParam(novoFim));
    setSearchParams(proximos);
  }

  function abrirTransacoesDaCategoria(categoria: { id: string | null; nome: string }) {
    const params = new URLSearchParams({ ano: String(fim.ano), mes: String(fim.mes) });
    if (categoria.id) params.set("categoriaIds", categoria.id);
    navigate(`/transacoes?${params.toString()}`);
  }

  function focarMes(ano: number, mes: number) {
    mudarPeriodo({ ano, mes }, { ano, mes });
  }

  const focoEmUmMes = totalMeses === 1;

  const { data, isLoading, isError } = useQuery({
    queryKey: [
      "transacoes",
      "relatorio",
      inicio.ano,
      inicio.mes,
      fim.ano,
      fim.mes,
      contaIds,
    ],
    queryFn: () => buscarRelatorio(inicio, fim, { contaIds }),
    enabled: periodoValido,
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
  });

  const temDados =
    !!data &&
    (data.totais.receitas > 0 ||
      data.totais.despesas > 0 ||
      data.despesasPorCategoria.length > 0 ||
      data.receitasPorCategoria.length > 0);

  return (
    <div className="space-y-6 pt-4 pb-2 sm:pt-6 lg:pt-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Relatórios</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Receita e despesa de {periodoLabel}
            {contaIds ? ` · ${contaIds.length} conta${contaIds.length > 1 ? "s" : ""}` : ""}
            {focoEmUmMes && (
              <>
                {" · "}
                <button
                  type="button"
                  onClick={() => mudarPeriodo(periodoPadrao().inicio, periodoPadrao().fim)}
                  className="font-semibold text-primary hover:underline"
                >
                  Limpar foco no mês
                </button>
              </>
            )}
          </p>
        </div>
        {data && temDados && <ExportarCsvButton data={data} inicio={inicio} fim={fim} />}
      </div>

      <PeriodoSelector inicio={inicio} fim={fim} onChange={mudarPeriodo} />

      {!periodoValido ? (
        <EmptyState mood="thinking" title="Período inválido">
          Escolha um intervalo com o mês inicial antes do final e no máximo 24 meses.
        </EmptyState>
      ) : isError ? (
        <EmptyState mood="thinking" title="Não deu para carregar">
          Tente novamente em instantes.
        </EmptyState>
      ) : isLoading || !data ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : !temDados ? (
        <EmptyState mood="welcome" title="Sem movimento no período">
          Nenhuma receita ou despesa registrada nesse intervalo de meses.
        </EmptyState>
      ) : (
        <>
          <RelatorioTotais totais={data.totais} meses={totalMeses} />

          <ReceitaDespesaChart meses={data.meses} onSelecionarMes={focarMes} />

          <section className="space-y-4">
            <h2 className="font-display text-lg font-bold text-foreground">Evolução por categoria</h2>
            <div className="grid items-start gap-6 lg:grid-cols-2">
              <Card className="p-5">
                <LinhasCategoriaChart dados={data.despesasPorCategoriaPorMes} meses={data.meses} tipo="DESPESA" />
              </Card>
              <Card className="p-5">
                <LinhasCategoriaChart dados={data.receitasPorCategoriaPorMes} meses={data.meses} tipo="RECEITA" />
              </Card>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="font-display text-lg font-bold text-foreground">Tabela por categoria e mês</h2>
            <Card className="space-y-6 p-5">
              <div>
                <h3 className="mb-2 font-display text-sm font-semibold text-foreground">Despesas</h3>
                <TabelaPivotCategorias dados={data.despesasPorCategoriaPorMes} meses={data.meses} tipo="DESPESA" />
              </div>
              <div>
                <h3 className="mb-2 font-display text-sm font-semibold text-foreground">Receitas</h3>
                <TabelaPivotCategorias dados={data.receitasPorCategoriaPorMes} meses={data.meses} tipo="RECEITA" />
              </div>
            </Card>
          </section>

          <section className="space-y-4">
            <h2 className="font-display text-lg font-bold text-foreground">Despesas</h2>
            <div className="grid items-start gap-6 lg:grid-cols-[372px_1fr]">
              <Card className="p-5">
                <CategoriaDrilldownChart
                  dados={data.despesasPorCategoria}
                  tipo="DESPESA"
                  ano={fim.ano}
                  mes={fim.mes}
                  periodoLabel={periodoLabel}
                  onSelecionarCategoria={abrirTransacoesDaCategoria}
                />
              </Card>
              <Card className="p-5">
                <TabelaHierarquicaCategorias
                  dados={data.despesasPorCategoria}
                  tipo="DESPESA"
                  onSelecionarCategoria={abrirTransacoesDaCategoria}
                />
              </Card>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="font-display text-lg font-bold text-foreground">Receitas</h2>
            <div className="grid items-start gap-6 lg:grid-cols-[372px_1fr]">
              <Card className="p-5">
                <CategoriaDrilldownChart
                  dados={data.receitasPorCategoria}
                  tipo="RECEITA"
                  ano={fim.ano}
                  mes={fim.mes}
                  periodoLabel={periodoLabel}
                  onSelecionarCategoria={abrirTransacoesDaCategoria}
                />
              </Card>
              <Card className="p-5">
                <TabelaHierarquicaCategorias
                  dados={data.receitasPorCategoria}
                  tipo="RECEITA"
                  onSelecionarCategoria={abrirTransacoesDaCategoria}
                />
              </Card>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
