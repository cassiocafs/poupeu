import { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import type { ItemCategoriaPorMesResumo, RelatorioMes } from "@/api/relatorios";
import { itensPivotDoNivel, type ItemPivot } from "@/lib/categoriaNiveisPorMes";
import { totalDaSerie } from "@/lib/categoriaPorMes";
import { categoryColor } from "@/lib/categoryColor";
import { useFormatarValor } from "@/hooks/use-formatar-valor";
import { mesAbrev } from "@/lib/periodo";

interface TabelaPivotCategoriasProps {
  dados: ItemCategoriaPorMesResumo[];
  meses: RelatorioMes[];
  tipo: "DESPESA" | "RECEITA";
}

function chaveLinha(profundidade: number, chave: string): string {
  return `${profundidade}:${chave}`;
}

interface LinhaProps {
  dados: ItemCategoriaPorMesResumo[];
  item: ItemPivot;
  profundidade: number;
  totalMeses: number;
  expandidos: Set<string>;
  alternar: (chave: string) => void;
  formatarValor: (valor: number) => string;
}

function Linha({
  dados,
  item,
  profundidade,
  totalMeses,
  expandidos,
  alternar,
  formatarValor,
}: LinhaProps) {
  const id = chaveLinha(profundidade, item.chave);
  const aberto = expandidos.has(id);
  const podeExpandir = !item.folha && !!item.proximoNivel;
  const total = totalDaSerie(item.porMes);
  const media = totalMeses > 0 ? total / totalMeses : 0;

  const filhos =
    podeExpandir && aberto ? itensPivotDoNivel(dados, item.proximoNivel!, totalMeses) : [];
  const filhosOrdenados = [...filhos].sort(
    (a, b) => totalDaSerie(b.porMes) - totalDaSerie(a.porMes),
  );

  return (
    <>
      <tr
        role={podeExpandir ? "button" : undefined}
        tabIndex={podeExpandir ? 0 : undefined}
        onClick={() => podeExpandir && alternar(id)}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && podeExpandir) {
            e.preventDefault();
            alternar(id);
          }
        }}
        className={`border-b border-border text-sm ${podeExpandir ? "cursor-pointer hover:bg-muted" : ""} ${
          profundidade === 0 ? "font-semibold text-foreground" : "text-foreground/90"
        }`}
      >
        <td
          className="sticky left-0 bg-background py-2 pr-3"
          style={{ paddingLeft: `${profundidade * 18 + 4}px` }}
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className="flex w-4 shrink-0 justify-center text-muted-foreground">
              {podeExpandir ? (
                <ChevronRight className={`size-3.5 transition-transform ${aberto ? "rotate-90" : ""}`} />
              ) : (
                <span
                  className="inline-block size-[9px] rounded-full"
                  style={{ backgroundColor: categoryColor(item.categoriaId ?? item.chave) }}
                />
              )}
            </span>
            <span className="min-w-0 truncate">{item.nome}</span>
          </span>
        </td>
        <td className="num px-3 py-2 text-right tabular-nums">{formatarValor(total)}</td>
        <td className="num px-3 py-2 text-right tabular-nums text-muted-foreground">
          {formatarValor(media)}
        </td>
        {item.porMes.map((v, i) => (
          <td key={i} className="num px-3 py-2 text-right tabular-nums">
            {formatarValor(v)}
          </td>
        ))}
      </tr>
      {filhosOrdenados.map((filho) => (
        <Linha
          key={filho.chave}
          dados={dados}
          item={filho}
          profundidade={profundidade + 1}
          totalMeses={totalMeses}
          expandidos={expandidos}
          alternar={alternar}
          formatarValor={formatarValor}
        />
      ))}
    </>
  );
}

export function TabelaPivotCategorias({ dados, meses, tipo }: TabelaPivotCategoriasProps) {
  const formatarValor = useFormatarValor();
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const totalMeses = meses.length;

  const linhas = useMemo(
    () =>
      [...itensPivotDoNivel(dados, { tipo: "raiz" }, totalMeses)].sort(
        (a, b) => totalDaSerie(b.porMes) - totalDaSerie(a.porMes),
      ),
    [dados, totalMeses],
  );

  const totalGeralPorMes = useMemo(() => {
    const acc = new Array(totalMeses).fill(0);
    for (const d of dados) d.porMes.forEach((v, i) => (acc[i] += v));
    return acc;
  }, [dados, totalMeses]);
  const totalGeral = totalDaSerie(totalGeralPorMes);
  const mediaGeral = totalMeses > 0 ? totalGeral / totalMeses : 0;

  function alternar(chave: string) {
    setExpandidos((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(chave)) proximo.delete(chave);
      else proximo.add(chave);
      return proximo;
    });
  }

  if (linhas.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        {tipo === "DESPESA" ? "Nenhuma despesa no período." : "Nenhuma receita no período."}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-[10.5px] font-bold uppercase tracking-widest text-muted-foreground">
            <th className="sticky left-0 bg-background py-1.5 pr-3 text-left">
              {tipo === "DESPESA" ? "Categoria" : "Origem"}
            </th>
            <th className="px-3 py-1.5 text-right">Total</th>
            <th className="px-3 py-1.5 text-right">Média</th>
            {meses.map((m) => (
              <th key={`${m.ano}-${m.mes}`} className="px-3 py-1.5 text-right whitespace-nowrap">
                {mesAbrev(m.mes)}/{String(m.ano).slice(2)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((item) => (
            <Linha
              key={item.chave}
              dados={dados}
              item={item}
              profundidade={0}
              totalMeses={totalMeses}
              expandidos={expandidos}
              alternar={alternar}
              formatarValor={formatarValor}
            />
          ))}
          <tr className="text-sm font-bold text-foreground">
            <td className="sticky left-0 bg-background py-2 pr-3">Total</td>
            <td className="num px-3 py-2 text-right tabular-nums">{formatarValor(totalGeral)}</td>
            <td className="num px-3 py-2 text-right tabular-nums text-muted-foreground">
              {formatarValor(mediaGeral)}
            </td>
            {totalGeralPorMes.map((v, i) => (
              <td key={i} className="num px-3 py-2 text-right tabular-nums">
                {formatarValor(v)}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
