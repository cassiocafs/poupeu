import { useMemo, useState } from "react";
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
const TODAS = "todas";

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
  const [categoriaId, setCategoriaId] = useState<string>(TODAS);
  const totalMeses = meses.length;

  const porGrupo = useMemo(() => agruparPorGrupo(dados, totalMeses), [dados, totalMeses]);

  const opcoesCategorias = useMemo(
    () =>
      [...dados]
        .filter((d) => d.porMes.some((v) => v > 0))
        .sort((a, b) => a.categoriaNome.localeCompare(b.categoriaNome)),
    [dados],
  );

  const linhas = useMemo((): (SerieCategoria & { cor: string })[] => {
    if (categoriaId !== TODAS) {
      const item = dados.find((d) => (d.categoriaId ?? "sem-categoria") === categoriaId);
      if (!item) return [];
      return [
        {
          chave: categoriaId,
          nome: item.categoriaNome,
          porMes: item.porMes,
          cor: categoryColor(item.categoriaId ?? categoriaId),
        },
      ];
    }

    const ordenado = [...porGrupo].sort((a, b) => totalDaSerie(b.porMes) - totalDaSerie(a.porMes));
    const principais = ordenado.slice(0, LIMITE_LINHAS);
    const resto = ordenado.slice(LIMITE_LINHAS);
    const outros =
      resto.length > 0
        ? [{ chave: "outros", nome: "Outros", porMes: somarSeries(resto, totalMeses), cor: OUTROS_COR }]
        : [];

    return [...principais.map((g) => ({ ...g, cor: categoryColor(g.chave) })), ...outros];
  }, [categoriaId, dados, porGrupo, totalMeses]);

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

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-sm font-semibold text-foreground">{titulo}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Evolução por categoria pai — escolha uma categoria específica para ver só ela
          </p>
        </div>
        <select
          value={categoriaId}
          onChange={(e) => setCategoriaId(e.target.value)}
          className="h-8 shrink-0 rounded-[11px] border border-border bg-muted px-2 text-[12px] text-foreground"
        >
          <option value={TODAS}>{rotuloTodas}</option>
          {opcoesCategorias.map((c) => (
            <option key={c.categoriaId ?? "sem-categoria"} value={c.categoriaId ?? "sem-categoria"}>
              {c.categoriaNome}
            </option>
          ))}
        </select>
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
