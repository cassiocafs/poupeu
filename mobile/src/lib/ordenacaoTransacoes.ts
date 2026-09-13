export type OrdenacaoTransacoes = 'recentes' | 'antigas';

/**
 * O backend sempre devolve os dias/transações em ordem cronológica crescente
 * (necessário para o cálculo do saldo acumulado). Aqui só invertemos a ordem
 * de exibição quando o usuário prefere ver as mais recentes no topo.
 */
export function ordenarDias<T extends { transacoes: unknown[] }>(
  dias: T[],
  ordenacao: OrdenacaoTransacoes,
): T[] {
  if (ordenacao === 'antigas') return dias;
  return [...dias].reverse().map((dia) => ({ ...dia, transacoes: [...dia.transacoes].reverse() }));
}
