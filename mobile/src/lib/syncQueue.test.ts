// Convenção de testes deste projeto: arquivos `*.test.ts(x)` ao lado do código-fonte.

import { Alert } from 'react-native';

import { ApiError, NetworkError } from '@/api/client';
import * as transacoesApi from '@/api/transacoes';

jest.mock('@/lib/supabaseClient', () => ({
  supabase: { auth: { getSession: jest.fn().mockResolvedValue({ data: { session: null } }) } },
}));

jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItem: jest.fn((chave: string) => Promise.resolve(store.get(chave) ?? null)),
      setItem: jest.fn((chave: string, valor: string) => {
        store.set(chave, valor);
        return Promise.resolve();
      }),
    },
  };
});

jest.mock('@/api/transacoes', () => ({
  criarTransacao: jest.fn(),
  editarTransacao: jest.fn(),
  excluirTransacao: jest.fn(),
  criarTransferencia: jest.fn(),
}));

jest.mock('@/lib/queryClient', () => ({
  queryClient: { invalidateQueries: jest.fn() },
}));

import {
  _resetParaTeste,
  atualizarTransferenciaPendente,
  definirUsuarioAtual,
  enqueueCriarTransacao,
  enqueueCriarTransferencia,
  enqueueEditarTransacao,
  enqueueExcluirTransacao,
  filaHidratada,
  getEstado,
  processarFila,
  removerTransferenciaPendente,
} from './syncQueue';

const criarTransacaoMock = transacoesApi.criarTransacao as jest.Mock;
const editarTransacaoMock = transacoesApi.editarTransacao as jest.Mock;
const excluirTransacaoMock = transacoesApi.excluirTransacao as jest.Mock;
const criarTransferenciaMock = transacoesApi.criarTransferencia as jest.Mock;

const PAYLOAD_TRANSACAO = {
  tipo: 'DESPESA' as const,
  data: '2026-08-10',
  descricao: 'Mercado',
  contaId: 'conta-1',
  valor: 50,
  consolidado: true,
};

const PAYLOAD_TRANSFERENCIA = {
  data: '2026-08-10',
  contaOrigemId: 'conta-1',
  contaDestinoId: 'conta-2',
  valor: 100,
  consolidado: true,
};

beforeAll(async () => {
  await filaHidratada;
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  _resetParaTeste();
});

describe('syncQueue — enqueue e coalescência', () => {
  it('enqueueCriarTransacao adiciona uma operação pendente e devolve o id gerado', () => {
    const id = enqueueCriarTransacao(PAYLOAD_TRANSACAO);

    expect(getEstado().fila).toHaveLength(1);
    expect(getEstado().fila[0]).toMatchObject({ tipo: 'criarTransacao', id, payload: PAYLOAD_TRANSACAO });
  });

  it('editar uma transação com criação ainda pendente mescla no mesmo item em vez de gerar um PATCH', () => {
    const id = enqueueCriarTransacao(PAYLOAD_TRANSACAO);
    enqueueEditarTransacao(id, { descricao: 'Mercado (editado)' });

    expect(getEstado().fila).toHaveLength(1);
    expect(getEstado().fila[0]).toMatchObject({
      tipo: 'criarTransacao',
      payload: { ...PAYLOAD_TRANSACAO, descricao: 'Mercado (editado)' },
    });
  });

  it('duas edições da mesma transação já sincronizada colapsam num único item', () => {
    enqueueEditarTransacao('id-servidor', { descricao: 'Primeira edição' });
    enqueueEditarTransacao('id-servidor', { valor: 99 });

    expect(getEstado().fila).toHaveLength(1);
    expect(getEstado().fila[0]).toMatchObject({
      tipo: 'editarTransacao',
      payload: { descricao: 'Primeira edição', valor: 99 },
    });
  });

  it('excluir uma transação com criação ainda pendente remove a criação da fila, sem gerar exclusão remota', () => {
    const id = enqueueCriarTransacao(PAYLOAD_TRANSACAO);
    enqueueExcluirTransacao(id);

    expect(getEstado().fila).toHaveLength(0);
  });

  it('excluir uma transação com edição pendente substitui a edição pela exclusão', () => {
    enqueueEditarTransacao('id-servidor', { descricao: 'Editada' });
    enqueueExcluirTransacao('id-servidor');

    expect(getEstado().fila).toHaveLength(1);
    expect(getEstado().fila[0]).toMatchObject({ tipo: 'excluirTransacao', id: 'id-servidor' });
  });

  it('excluir a mesma transação duas vezes não duplica a operação', () => {
    enqueueExcluirTransacao('id-servidor');
    enqueueExcluirTransacao('id-servidor');

    expect(getEstado().fila).toHaveLength(1);
  });

  it('atualizarTransferenciaPendente reaproveita o mesmo grupoId em vez de criar uma nova operação', () => {
    const grupoId = enqueueCriarTransferencia(PAYLOAD_TRANSFERENCIA);
    atualizarTransferenciaPendente(grupoId, { ...PAYLOAD_TRANSFERENCIA, valor: 200 });

    expect(getEstado().fila).toHaveLength(1);
    expect(getEstado().fila[0]).toMatchObject({ tipo: 'criarTransferencia', grupoId, payload: { valor: 200 } });
  });

  it('removerTransferenciaPendente descarta uma transferência ainda não sincronizada', () => {
    const grupoId = enqueueCriarTransferencia(PAYLOAD_TRANSFERENCIA);
    removerTransferenciaPendente(grupoId);

    expect(getEstado().fila).toHaveLength(0);
  });
});

describe('syncQueue — processarFila', () => {
  it('em caso de sucesso, envia o id gerado no cliente e remove o item da fila', async () => {
    criarTransacaoMock.mockResolvedValue({ id: 'x' });

    const id = enqueueCriarTransacao(PAYLOAD_TRANSACAO);
    await processarFila();

    expect(criarTransacaoMock).toHaveBeenCalledWith({ ...PAYLOAD_TRANSACAO, id });
    expect(getEstado().fila).toHaveLength(0);
    expect(getEstado().ultimaSincronizacao).not.toBeNull();
  });

  it('envia transferências com o transferenciaGrupoId gerado no cliente', async () => {
    criarTransferenciaMock.mockResolvedValue({ transferenciaGrupoId: 'g', transacoes: [] });

    const grupoId = enqueueCriarTransferencia(PAYLOAD_TRANSFERENCIA);
    await processarFila();

    expect(criarTransferenciaMock).toHaveBeenCalledWith({ ...PAYLOAD_TRANSFERENCIA, transferenciaGrupoId: grupoId });
  });

  it('uma falha de rede interrompe o drain, mantendo os itens restantes intactos', async () => {
    criarTransacaoMock.mockRejectedValue(new NetworkError());

    enqueueCriarTransacao(PAYLOAD_TRANSACAO);
    enqueueCriarTransacao({ ...PAYLOAD_TRANSACAO, descricao: 'Segundo item' });
    await processarFila();

    expect(getEstado().fila).toHaveLength(2);
    expect(getEstado().fila.every((op) => op.tentativas === 0)).toBe(true);
    expect(getEstado().sincronizando).toBe(false);
  });

  it('um 404 descarta o item da fila e avisa o usuário', async () => {
    editarTransacaoMock.mockRejectedValue(new ApiError(404, 'Não encontrada'));

    enqueueEditarTransacao('id-servidor', { descricao: 'Editada' });
    await processarFila();

    expect(getEstado().fila).toHaveLength(0);
    expect(Alert.alert).toHaveBeenCalled();
  });

  it('outros erros mantêm o item na fila com tentativas/ultimoErro atualizados e seguem para o próximo', async () => {
    editarTransacaoMock.mockRejectedValue(new ApiError(400, 'Conta inválida'));
    criarTransacaoMock.mockResolvedValue({ id: 'x' });

    enqueueEditarTransacao('id-servidor', { descricao: 'Editada' });
    enqueueCriarTransacao(PAYLOAD_TRANSACAO);
    await processarFila();

    expect(criarTransacaoMock).toHaveBeenCalled();
    expect(getEstado().fila).toHaveLength(1);
    expect(getEstado().fila[0]).toMatchObject({ tipo: 'editarTransacao', tentativas: 1, ultimoErro: 'Conta inválida' });
  });

  it('não faz nada se a fila estiver vazia', async () => {
    await processarFila();

    expect(criarTransacaoMock).not.toHaveBeenCalled();
    expect(excluirTransacaoMock).not.toHaveBeenCalled();
  });
});

describe('syncQueue — isolamento entre contas no mesmo aparelho', () => {
  it('itens enfileirados por um usuário não aparecem para outro que logue em seguida', () => {
    definirUsuarioAtual('usuario-a');
    enqueueCriarTransacao(PAYLOAD_TRANSACAO);
    expect(getEstado().fila).toHaveLength(1);

    definirUsuarioAtual('usuario-b');
    expect(getEstado().fila).toHaveLength(0);

    definirUsuarioAtual('usuario-a');
    expect(getEstado().fila).toHaveLength(1);
  });

  it('processarFila só sincroniza as operações do usuário logado, deixando as de outra conta paradas', async () => {
    criarTransacaoMock.mockResolvedValue({ id: 'x' });

    definirUsuarioAtual('usuario-a');
    enqueueCriarTransacao(PAYLOAD_TRANSACAO);

    definirUsuarioAtual('usuario-b');
    enqueueCriarTransacao({ ...PAYLOAD_TRANSACAO, descricao: 'Do usuário B' });

    await processarFila();

    expect(criarTransacaoMock).toHaveBeenCalledTimes(1);
    expect(criarTransacaoMock).toHaveBeenCalledWith(expect.objectContaining({ descricao: 'Do usuário B' }));
    expect(getEstado().fila).toHaveLength(0);

    definirUsuarioAtual('usuario-a');
    expect(getEstado().fila).toHaveLength(1);
  });

  it('itens gravados antes desta versão (sem usuarioId) são adotados pelo primeiro usuário que logar', () => {
    enqueueCriarTransacao(PAYLOAD_TRANSACAO);
    const [itemLegado] = getEstado().fila;
    // Simula uma instalação anterior à mudança: o campo usuarioId nunca existiu.
    delete (itemLegado as { usuarioId?: string | null }).usuarioId;

    definirUsuarioAtual('usuario-a');
    expect(getEstado().fila).toHaveLength(1);

    definirUsuarioAtual('usuario-b');
    expect(getEstado().fila).toHaveLength(0);
  });
});
