import type { Conta } from '@/api/contas';
import type { ResumoMensal } from '@/api/transacoes';
import { aplicarPendenciasEmContas, aplicarPendenciasEmResumo } from './saldosPendentes';

const contas: Conta[] = [
  { id: 'a', nome: 'Banco A', saldoInicial: 0, saldoAtual: 100, ativa: true },
  { id: 'b', nome: 'Banco B', saldoInicial: 0, saldoAtual: 200, ativa: true },
];

const resumo: ResumoMensal = {
  saldoAnterior: 0,
  totalEntradas: 100,
  totalSaidas: 20,
  saldoFinal: 80,
  recentes: [],
  anterioresNaoConsolidadas: [],
  proximasNaoConsolidadas: [],
  despesasPorCategoria: [],
  receitasPorCategoria: [],
};

describe('saldosPendentes', () => {
  it('reflete uma criação offline no saldo da conta e no total da Home', () => {
    const fila = [
      {
        tipo: 'criarTransacao' as const,
        id: 't1',
        usuarioId: 'usuario-teste',
        criadoEm: '2026-09-04T12:00:00.000Z',
        tentativas: 0,
        payload: { tipo: 'DESPESA' as const, data: '2026-09-04', descricao: 'Mercado', contaId: 'a', valor: 30, consolidado: true },
      },
    ];

    expect(aplicarPendenciasEmContas(contas, fila, '2026-09-04')?.map((c) => c.saldoAtual)).toEqual([70, 200]);
    expect(aplicarPendenciasEmResumo(resumo, fila, 2026, 9)).toMatchObject({ totalEntradas: 100, totalSaidas: 50, saldoFinal: 50 });
  });

  it('move saldo entre contas sem alterar o total em uma transferência offline', () => {
    const fila = [
      {
        tipo: 'criarTransferencia' as const,
        grupoId: 'g1',
        usuarioId: 'usuario-teste',
        criadoEm: '2026-09-04T12:00:00.000Z',
        tentativas: 0,
        payload: { data: '2026-09-04', contaOrigemId: 'a', contaDestinoId: 'b', valor: 40, consolidado: true },
      },
    ];

    expect(aplicarPendenciasEmContas(contas, fila, '2026-09-04')?.map((c) => c.saldoAtual)).toEqual([60, 240]);
    expect(aplicarPendenciasEmResumo(resumo, fila, 2026, 9)).toEqual(resumo);
  });
});
