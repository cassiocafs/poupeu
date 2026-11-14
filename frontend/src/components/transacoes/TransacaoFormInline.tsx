import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listarContas } from "@/api/contas";
import { listarGrupos, sugerirCategoria } from "@/api/categorias";
import { sugerirTransacao } from "@/api/regras";
import {
  buscarTransferencia,
  criarTransacao,
  criarTransferencia,
  editarTransacao,
  excluirTransacao,
  type Transacao,
  type TipoTransacao,
} from "@/api/transacoes";
import { CurrencyInput } from "@/components/ui/CurrencyInput";
import { Button } from "@/components/ui/Button";
import { CategoriaAutocomplete } from "./CategoriaAutocomplete";
import { ContaAutocomplete } from "./ContaAutocomplete";

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

const CHAVE_ULTIMA_DATA = "poupeu:ultima-data-transacao";
const CHAVE_ULTIMA_CONTA = "poupeu:ultima-conta-transacao";

function obterUltimaDataUsada(): string {
  try {
    return localStorage.getItem(CHAVE_ULTIMA_DATA) ?? hojeISO();
  } catch {
    return hojeISO();
  }
}

function salvarUltimaDataUsada(data: string) {
  try {
    localStorage.setItem(CHAVE_ULTIMA_DATA, data);
  } catch {
    // localStorage indisponível, ignora
  }
}

function obterUltimaContaUsada(): string {
  try {
    return localStorage.getItem(CHAVE_ULTIMA_CONTA) ?? "";
  } catch {
    return "";
  }
}

function salvarUltimaContaUsada(contaId: string) {
  try {
    localStorage.setItem(CHAVE_ULTIMA_CONTA, contaId);
  } catch {
    // localStorage indisponível, ignora
  }
}

const REGEX_DIACRITICOS = /[̀-ͯ]/g;

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(REGEX_DIACRITICOS, "");
}

function escaparRegex(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function encontrarCategoriaPorNome(
  descricao: string,
  categorias: { id: string; nome: string }[],
): string | null {
  const descricaoNormalizada = normalizar(descricao);
  const candidatas = [...categorias]
    .filter((c) => c.nome.trim().length > 0)
    .sort((a, b) => b.nome.length - a.nome.length);
  for (const categoria of candidatas) {
    const nomeNormalizado = normalizar(categoria.nome);
    const regex = new RegExp(`(^|[^a-z0-9])${escaparRegex(nomeNormalizado)}([^a-z0-9]|$)`, "i");
    if (regex.test(descricaoNormalizada)) return categoria.id;
  }
  return null;
}

interface TransacaoFormInlineProps {
  transacao?: Transacao | null;
  contaIdPadrao?: string;
  onSaved: () => void;
  onCancel: () => void;
}

export function TransacaoFormInline({
  transacao,
  contaIdPadrao,
  onSaved,
  onCancel,
}: TransacaoFormInlineProps) {
  const queryClient = useQueryClient();
  const isEdicaoTransferencia = !!transacao?.transferenciaGrupoId;
  const editando = !!transacao;

  const { data: contasData = [] } = useQuery({
    queryKey: ["contas"],
    queryFn: () => listarContas(false),
  });
  const contas = useMemo(
    () => [...contasData].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    [contasData],
  );

  const { data: categoriasData } = useQuery({
    queryKey: ["categorias", "grupos"],
    queryFn: listarGrupos,
  });

  const { data: transferencia } = useQuery({
    queryKey: ["transferencia", transacao?.transferenciaGrupoId],
    queryFn: () => buscarTransferencia(transacao!.transferenciaGrupoId!),
    enabled: isEdicaoTransferencia,
  });
  const categoriasFlat = useMemo(() => {
    if (!categoriasData) return [];
    const lista: { id: string; nome: string }[] = [];
    for (const grupo of categoriasData.grupos) {
      for (const subgrupo of grupo.subgrupos) {
        for (const c of subgrupo.categorias) lista.push({ id: c.id, nome: c.nome });
      }
      for (const c of grupo.categorias) lista.push({ id: c.id, nome: c.nome });
    }
    for (const c of categoriasData.semGrupo) lista.push({ id: c.id, nome: c.nome });
    return lista;
  }, [categoriasData]);

  const [tipo, setTipo] = useState<TipoTransacao>(transacao?.tipo ?? "DESPESA");
  const [data, setData] = useState(transacao?.data ?? obterUltimaDataUsada());
  const [descricao, setDescricao] = useState(transacao?.descricao ?? "");
  const [contaId, setContaId] = useState(
    transacao?.contaId ?? contaIdPadrao ?? obterUltimaContaUsada(),
  );
  const [categoriaId, setCategoriaId] = useState(transacao?.categoriaId ?? "");
  const [categoriaTocada, setCategoriaTocada] = useState(editando);
  const [contaTocada, setContaTocada] = useState(
    editando || !!contaIdPadrao || !!obterUltimaContaUsada(),
  );
  const [valor, setValor] = useState(transacao ? Math.abs(transacao.valor) : 0);
  const [consolidado, setConsolidado] = useState(transacao ? transacao.consolidado : true);
  const [nota, setNota] = useState(transacao?.nota ?? "");
  const [contaOrigemId, setContaOrigemId] = useState("");
  const [contaDestinoId, setContaDestinoId] = useState("");

  useEffect(() => {
    if (!transferencia || contaOrigemId || contaDestinoId) return;
    setContaOrigemId(transferencia.contaOrigem?.id ?? "");
    setContaDestinoId(transferencia.contaDestino?.id ?? "");
  }, [transferencia, contaOrigemId, contaDestinoId]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isEdicaoTransferencia || tipo === "TRANSFERENCIA") return;
    if (categoriaTocada && contaTocada) return;
    if (!descricao.trim()) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const regra = await sugerirTransacao(descricao.trim());
        if (regra.contaId && !contaTocada) {
          setContaId(regra.contaId);
        }
        if (regra.categoriaId && !categoriaTocada) {
          setCategoriaId(regra.categoriaId);
        } else if (!regra.categoriaId && !categoriaTocada) {
          const sugestao = await sugerirCategoria(descricao.trim());
          if (sugestao.categoriaId && !categoriaTocada) {
            setCategoriaId(sugestao.categoriaId);
          } else if (!categoriaTocada) {
            const categoriaPorNome = encontrarCategoriaPorNome(descricao.trim(), categoriasFlat);
            if (categoriaPorNome && !categoriaTocada) {
              setCategoriaId(categoriaPorNome);
            }
          }
        }
      } catch {
        // sugestão é best-effort, ignora falha
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [descricao]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (tipo === "TRANSFERENCIA") {
        if (editando) await excluirTransacao(transacao!.id);
        return criarTransferencia({
          data,
          descricao,
          contaOrigemId,
          contaDestinoId,
          valor,
          consolidado,
          nota,
        });
      }
      const payload = {
        tipo,
        data,
        descricao,
        contaId,
        categoriaId: categoriaId || null,
        valor,
        consolidado,
        nota,
      };
      if (isEdicaoTransferencia) {
        await excluirTransacao(transacao!.id);
        return criarTransacao(payload);
      }
      return editando ? editarTransacao(transacao!.id, payload) : criarTransacao(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transacoes"] });
      queryClient.invalidateQueries({ queryKey: ["orcamento"] });
      queryClient.invalidateQueries({ queryKey: ["contas"] });
      onSaved();
    },
  });

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !mutation.isPending) onCancel();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel, mutation.isPending]);

  const campoClasse =
    "rounded-[11px] border border-border bg-muted px-3 py-2 text-[13px] text-foreground";

  const TIPOS = [
    { valor: "DESPESA", label: "Despesa", tone: "text-expense", soft: "bg-expense-soft" },
    { valor: "RECEITA", label: "Receita", tone: "text-income", soft: "bg-income-soft" },
    {
      valor: "TRANSFERENCIA",
      label: "Transferência",
      tone: "text-transfer",
      soft: "bg-transfer-soft",
    },
  ] as const;

  return (
    <div
      className="card-surface"
      onBlur={(e) => {
        if (
          editando &&
          !mutation.isPending &&
          !e.currentTarget.contains(e.relatedTarget as Node | null)
        ) {
          onCancel();
        }
      }}
    >
      <div className="flex items-center justify-between gap-3 rounded-t-2xl border-b border-border bg-muted px-3 py-2">
        <div className="flex items-center gap-[3px] rounded-[10px] bg-muted p-[3px]">
          {TIPOS.map(({ valor: t, label, tone, soft }) => (
            <button
              key={t}
              type="button"
              onClick={() => setTipo(t)}
              disabled={mutation.isPending}
              className={`rounded-[8px] px-3 py-1.5 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                tipo === t ? `${soft} ${tone}` : "font-semibold text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {!editando && (
          <button
            type="button"
            onClick={onCancel}
            aria-label="Fechar"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-[9px] bg-muted text-muted-foreground hover:text-foreground"
          >
            ✕
          </button>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
        }}
        className="flex flex-wrap items-center gap-2 px-3 py-2"
      >
        <input
          type="date"
          value={data}
          onChange={(e) => {
            setData(e.target.value);
            if (!editando) salvarUltimaDataUsada(e.target.value);
          }}
          disabled={mutation.isPending}
          className={`w-[145px] shrink-0 ${campoClasse}`}
        />

        <input
          autoFocus
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          placeholder="Descrição"
          disabled={mutation.isPending}
          className={`min-w-[140px] flex-1 ${campoClasse}`}
        />

        {tipo === "TRANSFERENCIA" ? (
          <>
            <select
              value={contaOrigemId}
              onChange={(e) => setContaOrigemId(e.target.value)}
              disabled={mutation.isPending}
              className={`w-[150px] shrink-0 ${campoClasse}`}
            >
              <option value="">Conta origem</option>
              {contas
                .filter((c) => c.id !== contaDestinoId)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
            </select>
            <select
              value={contaDestinoId}
              onChange={(e) => setContaDestinoId(e.target.value)}
              disabled={mutation.isPending}
              className={`w-[150px] shrink-0 ${campoClasse}`}
            >
              <option value="">Conta destino</option>
              {contas
                .filter((c) => c.id !== contaOrigemId)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
            </select>
          </>
        ) : (
          <>
            <div className="w-[170px] shrink-0">
              <CategoriaAutocomplete
                value={categoriaId}
                onChange={(v) => {
                  setCategoriaId(v);
                  setCategoriaTocada(true);
                }}
                disabled={mutation.isPending}
              />
            </div>
            <div className="w-[150px] shrink-0">
              <ContaAutocomplete
                value={contaId}
                onChange={(v) => {
                  setContaId(v);
                  setContaTocada(true);
                  if (!editando) salvarUltimaContaUsada(v);
                }}
                contas={contas}
                disabled={mutation.isPending}
              />
            </div>
          </>
        )}

        <div className="w-[130px] shrink-0">
          <CurrencyInput value={valor} onChange={setValor} disabled={mutation.isPending} />
        </div>

        <label
          className="flex shrink-0 items-center gap-1 text-foreground/70"
          title="Consolidado"
        >
          <input
            type="checkbox"
            checked={consolidado}
            onChange={(e) => setConsolidado(e.target.checked)}
            disabled={mutation.isPending}
            className="accent-primary"
          />
        </label>

        {editando && (
          <input
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Nota (opcional)"
            disabled={mutation.isPending}
            className={`min-w-[160px] flex-1 basis-full ${campoClasse}`}
          />
        )}

        {mutation.isError && (
          <span className="text-xs text-destructive">
            {mutation.error instanceof Error ? mutation.error.message : "Erro ao salvar"}
          </span>
        )}

        {editando && (
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            disabled={mutation.isPending}
            className="shrink-0"
          >
            Cancelar
          </Button>
        )}
        <Button type="submit" disabled={mutation.isPending} className="shrink-0">
          {mutation.isPending ? "Salvando..." : "Salvar"}
        </Button>
      </form>
    </div>
  );
}
