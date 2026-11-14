import { useEffect, useMemo, useRef, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ItemCategoriaPorMesResumo, RelatorioMes } from "@/api/relatorios";
import { usePreferences } from "@/contexts/PreferencesContext";
import { useFormatarValor } from "@/hooks/use-formatar-valor";
import { agruparPorGrupo, somarSeries, totalDaSerie, type SerieCategoria } from "@/lib/categoriaPorMes";
import { categoryColor } from "@/lib/categoryColor";
import { OUTROS_COR } from "@/lib/chartPalette";
import { mesAbrev } from "@/lib/periodo";

interface LinhasCategoriaChartProps {
  dados: ItemCategoriaPorMesResumo[];
  meses: RelatorioMes[];
  tipo: "DESPESA" | "RECEITA";
}

const LIMITE_LINHAS = 6;

function formatarCompacta(valor: number) {
  return valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    notation: "compact",
    maximumFractionDigits: 1,
  });
}

export function LinhasCategoriaChart({ dados, meses, tipo }: LinhasCategoriaChartProps) {
  const formatarValor = useFormatarValor();
  const { hideValues } = usePreferences();
  const [categoriasSelecionadas, setCategoriasSelecionadas] = useState<string[]>([]);
  const [filtroAberto, setFiltroAberto] = useState(false);
  const filtroRef = useRef<HTMLDivElement>(null);
  const totalMeses = meses.length;

  useEffect(() => {
    if (!filtroAberto) return;
    function aoClicarFora(e: MouseEvent) {
      if (filtroRef.current && !filtroRef.current.contains(e.target as Node)) setFiltroAberto(false);
    }
    function aoPressionarTecla(e: KeyboardEvent) {
      if (e.key === "Escape") setFiltroAberto(false);
    }
    document.addEventListener("mousedown", aoClicarFora);
    document.addEventListener("keydown", aoPressionarTecla);
    return () => {
      document.removeEventListener("mousedown", aoClicarFora);
      document.removeEventListener("keydown", aoPressionarTecla);
    };
  }, [filtroAberto]);

  const porGrupo = useMemo(() => agruparPorGrupo(dados, totalMeses), [dados, totalMeses]);

  const opcoesCategorias = useMemo(
    () =>
      [...dados]
        .filter((d) => d.porMes.some((v) => v > 0))
        .sort((a, b) => a.categoriaNome.localeCompare(b.categoriaNome)),
    [dados],
  );

  function alternarCategoria(categoriaId: string) {
    setCategoriasSelecionadas((atual) =>
      atual.includes(categoriaId) ? atual.filter((id) => id !== categoriaId) : [...atual, categoriaId],
    );
  }

  const linhas = useMemo((): (SerieCategoria & { cor: string })[] => {
    if (categoriasSelecionadas.length > 0) {
      return categoriasSelecionadas
        .map((categoriaId) => {
          const item = dados.find((d) => (d.categoriaId ?? "sem-categoria") === categoriaId);
          if (!item) return null;
          return {
            chave: categoriaId,
            nome: item.categoriaNome,
            porMes: item.porMes,
            cor: categoryColor(item.categoriaId ?? categoriaId),
          };
        })
        .filter((l): l is SerieCategoria & { cor: string } => l !== null);
    }

    const ordenado = [...porGrupo].sort((a, b) => totalDaSerie(b.porMes) - totalDaSerie(a.porMes));
    const principais = ordenado.slice(0, LIMITE_LINHAS);
    const resto = ordenado.slice(LIMITE_LINHAS);
    const outros =
      resto.length > 0
        ? [{ chave: "outros", nome: "Outros", porMes: somarSeries(resto, totalMeses), cor: OUTROS_COR }]
        : [];

    return [...principais.map((g) => ({ ...g, cor: categoryColor(g.chave) })), ...outros];
  }, [categoriasSelecionadas, dados, porGrupo, totalMeses]);

  const semDados = linhas.every((l) => totalDaSerie(l.porMes) === 0);

  const serie = meses.map((m, i) => {
    const ponto: Record<string, number | string> = {
      label: `${mesAbrev(m.mes)}/${String(m.ano).slice(2)}`,
    };
    for (const linha of linhas) ponto[linha.chave] = linha.porMes[i] ?? 0;
    return ponto;
  });

  const corGrid = "var(--color-border)";
  const corEixo = "var(--color-muted-foreground)";
  const titulo = tipo === "DESPESA" ? "Despesas por categoria, mês a mês" : "Receitas por categoria, mês a mês";
  const rotuloTodas = tipo === "DESPESA" ? "Todas as categorias" : "Todas as origens";

  const rotuloBotao =
    categoriasSelecionadas.length === 0
      ? rotuloTodas
      : categoriasSelecionadas.length === 1
        ? opcoesCategorias.find((c) => (c.categoriaId ?? "sem-categoria") === categoriasSelecionadas[0])
            ?.categoriaNome ?? rotuloTodas
        : `${categoriasSelecionadas.length} categorias selecionadas`;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-sm font-semibold text-foreground">{titulo}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Evolução por categoria pai — escolha uma ou mais categorias para ver só elas
          </p>
        </div>
        <div ref={filtroRef} className="relative shrink-0">
          <button
            type="button"
            onClick={() => setFiltroAberto((v) => !v)}
            className="h-8 rounded-[11px] border border-border bg-muted px-2 text-[12px] text-foreground"
          >
            {rotuloBotao}
          </button>
          {filtroAberto && (
            <div className="card-surface absolute right-0 z-20 mt-1 max-h-64 w-56 overflow-y-auto py-1 text-sm">
              <button
                type="button"
                onClick={() => {
                  setCategoriasSelecionadas([]);
                  setFiltroAberto(false);
                }}
                className="block w-full px-3 py-1.5 text-left text-xs font-semibold text-primary hover:bg-muted"
              >
                {rotuloTodas}
              </button>
              <div className="my-1 border-t border-border" />
              {opcoesCategorias.map((c) => {
                const id = c.categoriaId ?? "sem-categoria";
                const marcado = categoriasSelecionadas.includes(id);
                return (
                  <label
                    key={id}
                    className="flex items-center gap-2 px-3 py-1.5 text-[12px] text-foreground/90 hover:bg-muted"
                  >
                    <input
                      type="checkbox"
                      checked={marcado}
                      onChange={() => alternarCategoria(id)}
                      className="size-3.5 accent-primary"
                    />
                    {c.categoriaNome}
                  </label>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {dados.length === 0 || semDados ? (
        <p className="mt-6 text-sm text-muted-foreground">
          {tipo === "DESPESA" ? "Nenhuma despesa no período." : "Nenhuma receita no período."}
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={serie} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={corGrid} vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: corEixo }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: corEixo }}
              tickLine={false}
              axisLine={false}
              width={hideValues ? 8 : 68}
              tickFormatter={(v) => (hideValues ? "" : formatarCompacta(Number(v)))}
            />
            <Tooltip
              formatter={(valor) =>
                typeof valor === "number" ? formatarValor(valor) : String(valor ?? "")
              }
              contentStyle={{ fontSize: 12 }}
            />
            {linhas.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
            {linhas.map((linha) => (
              <Line
                key={linha.chave}
                type="monotone"
                dataKey={linha.chave}
                name={linha.nome}
                stroke={linha.cor}
                strokeWidth={2}
                dot={{ r: 2.5 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
