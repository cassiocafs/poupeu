import { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import type { ItemCategoriaResumo } from "@/api/transacoes";
import { categoriaIdsDoNivel, itensDoNivel, type ItemGrafico } from "@/lib/categoriaNiveis";
import { categoryColor } from "@/lib/categoryColor";
import { useFormatarValor } from "@/hooks/use-formatar-valor";

interface TabelaHierarquicaCategoriasProps {
  dados: ItemCategoriaResumo[];
  tipo: "DESPESA" | "RECEITA";
  onSelecionarCategoria?: (categoria: { id: string | null; nome: string }) => void;
}

interface LinhaProps {
  dados: ItemCategoriaResumo[];
  item: ItemGrafico;
  profundidade: number;
  totalGeral: number;
  expandidos: Set<string>;
  alternar: (chave: string) => void;
  formatarValor: (valor: number) => string;
  onSelecionarCategoria?: (categoria: { id: string | null; nome: string }) => void;
}

function chaveLinha(profundidade: number, chave: string): string {
  return `${profundidade}:${chave}`;
}

function Linha({
  dados,
  item,
  profundidade,
  totalGeral,
  expandidos,
  alternar,
  formatarValor,
  onSelecionarCategoria,
}: LinhaProps) {
  const id = chaveLinha(profundidade, item.chave);
  const aberto = expandidos.has(id);
  const pct = totalGeral > 0 ? (item.total / totalGeral) * 100 : 0;
  const podeExpandir = !item.folha && !!item.proximoNivel;
  const grupoClicavel = podeExpandir && !!onSelecionarCategoria;
  const folhaClicavel = item.folha && !!onSelecionarCategoria;
  const linhaClicavel = grupoClicavel || folhaClicavel;

  function aoClicarLinha() {
    if (grupoClicavel) {
      const ids = categoriaIdsDoNivel(dados, item.proximoNivel!);
      if (ids.length > 0) onSelecionarCategoria!({ id: ids.join(","), nome: item.nome });
    } else if (folhaClicavel) {
      onSelecionarCategoria!({ id: item.categoriaId ?? null, nome: item.nome });
    }
  }

  const filhos =
    podeExpandir && aberto ? itensDoNivel(dados, item.proximoNivel!) : [];
  const filhosOrdenados = [...filhos].sort((a, b) => b.total - a.total);

  return (
    <>
      <div
        role={linhaClicavel ? "button" : undefined}
        tabIndex={linhaClicavel ? 0 : undefined}
        onClick={aoClicarLinha}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && linhaClicavel) {
            e.preventDefault();
            aoClicarLinha();
          }
        }}
        className={`flex items-center gap-2 border-b border-border py-2 pr-2 text-sm ${
          linhaClicavel ? "cursor-pointer hover:bg-muted" : ""
        } ${profundidade === 0 ? "font-semibold text-foreground" : "text-foreground/90"}`}
        style={{ paddingLeft: `${profundidade * 18 + 4}px` }}
      >
        <span className="flex w-4 shrink-0 justify-center text-muted-foreground">
          {podeExpandir ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                alternar(id);
              }}
              aria-label={aberto ? "Recolher" : "Expandir"}
              className="flex items-center justify-center rounded hover:text-foreground"
            >
              <ChevronRight className={`size-3.5 transition-transform ${aberto ? "rotate-90" : ""}`} />
            </button>
          ) : (
            <span
              className="inline-block size-[9px] rounded-full"
              style={{ backgroundColor: categoryColor(item.categoriaId ?? item.chave) }}
            />
          )}
        </span>
        <span className="min-w-0 flex-1 truncate">{item.nome}</span>
        <span className="num shrink-0 tabular-nums text-foreground">{formatarValor(item.total)}</span>
        <span className="w-12 shrink-0 text-right text-xs text-muted-foreground">
          {pct.toFixed(0)}%
        </span>
      </div>
      {filhosOrdenados.map((filho) => (
        <Linha
          key={filho.chave}
          dados={dados}
          item={filho}
          profundidade={profundidade + 1}
          totalGeral={totalGeral}
          expandidos={expandidos}
          alternar={alternar}
          formatarValor={formatarValor}
          onSelecionarCategoria={onSelecionarCategoria}
        />
      ))}
    </>
  );
}

export function TabelaHierarquicaCategorias({
  dados,
  tipo,
  onSelecionarCategoria,
}: TabelaHierarquicaCategoriasProps) {
  const formatarValor = useFormatarValor();
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());

  const linhas = useMemo(
    () => [...itensDoNivel(dados, { tipo: "raiz" })].sort((a, b) => b.total - a.total),
    [dados],
  );
  const totalGeral = useMemo(() => dados.reduce((soma, d) => soma + d.total, 0), [dados]);

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
      <div className="min-w-[320px]">
        <div className="flex items-center gap-2 border-b border-border pb-1.5 text-[10.5px] font-bold uppercase tracking-widest text-muted-foreground">
          <span className="w-4 shrink-0" />
          <span className="min-w-0 flex-1">
            {tipo === "DESPESA" ? "Categoria" : "Origem"}
          </span>
          <span className="shrink-0">Valor</span>
          <span className="w-12 shrink-0 text-right">%</span>
        </div>
        {linhas.map((item) => (
          <Linha
            key={item.chave}
            dados={dados}
            item={item}
            profundidade={0}
            totalGeral={totalGeral}
            expandidos={expandidos}
            alternar={alternar}
            formatarValor={formatarValor}
            onSelecionarCategoria={onSelecionarCategoria}
          />
        ))}
        <div className="flex items-center gap-2 py-2 pr-2 text-sm font-bold text-foreground">
          <span className="w-4 shrink-0" />
          <span className="min-w-0 flex-1">Total</span>
          <span className="num shrink-0 tabular-nums">{formatarValor(totalGeral)}</span>
          <span className="w-12 shrink-0 text-right text-xs text-muted-foreground">100%</span>
        </div>
      </div>
    </div>
  );
}
