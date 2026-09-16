import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';

import { ApiError, NetworkError } from '@/api/client';
import {
  criarTransacao,
  criarTransferencia,
  editarTransacao,
  excluirTransacao,
  type CriarTransacaoInput,
  type CriarTransferenciaInput,
  type EditarTransacaoInput,
} from '@/api/transacoes';
import { addLog } from '@/lib/logStore';
import { queryClient } from '@/lib/queryClient';
import { gerarUuid } from '@/lib/uuid';

const CHAVE_FILA = '@poupeu/fila-sincronizacao';
const CHAVE_ULTIMA_SYNC = '@poupeu/ultima-sincronizacao';

interface OperacaoBase {
  /**
   * Id (Supabase) do usuário logado quando a operação foi enfileirada.
   * Evita que a troca de conta no aparelho sincronize, sob a sessão de um
   * usuário, alterações offline que na verdade pertencem a outro — a
   * operação só é processada quando esse usuário estiver logado de novo.
   */
  usuarioId: string | null;
  criadoEm: string;
  tentativas: number;
  ultimoErro?: string;
}

export interface OperacaoCriarTransacao extends OperacaoBase {
  tipo: 'criarTransacao';
  id: string;
  payload: CriarTransacaoInput;
}

export interface OperacaoEditarTransacao extends OperacaoBase {
  tipo: 'editarTransacao';
  id: string;
  payload: EditarTransacaoInput;
}

export interface OperacaoExcluirTransacao extends OperacaoBase {
  tipo: 'excluirTransacao';
  id: string;
}

export interface OperacaoCriarTransferencia extends OperacaoBase {
  tipo: 'criarTransferencia';
  grupoId: string;
  payload: CriarTransferenciaInput;
}

export type OperacaoPendente =
  | OperacaoCriarTransacao
  | OperacaoEditarTransacao
  | OperacaoExcluirTransacao
  | OperacaoCriarTransferencia;

interface EstadoFila {
  fila: OperacaoPendente[];
  sincronizando: boolean;
  ultimaSincronizacao: string | null;
}

let estado: EstadoFila = { fila: [], sincronizando: false, ultimaSincronizacao: null };
/** Id do usuário logado no momento — usado para isolar a fila entre contas no mesmo aparelho. */
let usuarioAtual: string | null = null;
/** Snapshot cacheado de `estado` filtrado para `usuarioAtual`, exposto por `getEstado()`. Mantido
 * estável entre notificações para satisfazer o contrato de `useSyncExternalStore`. */
let estadoFiltrado: EstadoFila = estado;
const listeners = new Set<() => void>();

function pertenceAoUsuarioAtual(op: OperacaoPendente): boolean {
  return op.usuarioId === usuarioAtual;
}

/** Fila do usuário atualmente logado — usada por toda leitura/mutação que não deve enxergar
 * operações pendentes de outra conta usada anteriormente neste aparelho. */
function filaAtual(): OperacaoPendente[] {
  return estado.fila.filter(pertenceAoUsuarioAtual);
}

/**
 * Migra itens gravados antes desta versão (sem `usuarioId`) para o usuário logado agora — o
 * aparelho só tinha uma conta ativa até então, então é seguro assumir que pertencem a ela. Roda
 * dentro de `notify()` (não apenas em `definirUsuarioAtual`) porque a hidratação da fila salva no
 * `AsyncStorage` e a resolução da sessão do Supabase acontecem em paralelo, em ordem não garantida.
 */
function migrarItensLegados() {
  if (usuarioAtual === null) return;
  if (!estado.fila.some((op) => op.usuarioId === undefined)) return;
  estado = {
    ...estado,
    fila: estado.fila.map((op) => (op.usuarioId === undefined ? { ...op, usuarioId: usuarioAtual } : op)),
  };
  void persistir();
}

function notify() {
  migrarItensLegados();
  estadoFiltrado = { ...estado, fila: filaAtual() };
  for (const listener of listeners) listener();
}

/**
 * Define o usuário logado no aparelho. Operações continuam na fila persistida mesmo quando
 * pertencem a outra conta — elas só voltam a ser processadas quando esse usuário logar de novo.
 */
export function definirUsuarioAtual(id: string | null): void {
  if (id === usuarioAtual) return;
  usuarioAtual = id;
  notify();
}

async function persistir() {
  try {
    await AsyncStorage.setItem(CHAVE_FILA, JSON.stringify(estado.fila));
    if (estado.ultimaSincronizacao) {
      await AsyncStorage.setItem(CHAVE_ULTIMA_SYNC, estado.ultimaSincronizacao);
    }
  } catch (err) {
    addLog('error', 'Falha ao salvar fila de sincronização', err);
  }
}

function setEstado(parcial: Partial<EstadoFila>) {
  estado = { ...estado, ...parcial };
  notify();
  void persistir();
}

/** Promessa resolvida assim que a fila salva anteriormente for recarregada do dispositivo. */
export const filaHidratada: Promise<void> = (async () => {
  try {
    const [filaSalva, ultimaSalva] = await Promise.all([
      AsyncStorage.getItem(CHAVE_FILA),
      AsyncStorage.getItem(CHAVE_ULTIMA_SYNC),
    ]);
    estado = {
      ...estado,
      fila: filaSalva ? (JSON.parse(filaSalva) as OperacaoPendente[]) : [],
      ultimaSincronizacao: ultimaSalva,
    };
  } catch (err) {
    addLog('error', 'Falha ao carregar fila de sincronização', err);
  } finally {
    notify();
  }
})();

export function getEstado(): EstadoFila {
  return estadoFiltrado;
}

/** Uso exclusivo em testes: restaura a fila para o estado inicial (vazio, não sincronizando). */
export function _resetParaTeste(): void {
  estado = { fila: [], sincronizando: false, ultimaSincronizacao: null };
  usuarioAtual = null;
  notify();
}

export function subscribeFila(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Operação pendente (criar/editar/excluir) para uma transação já identificada, se houver. */
export function operacaoPendenteParaId(
  id: string,
): OperacaoCriarTransacao | OperacaoEditarTransacao | OperacaoExcluirTransacao | undefined {
  return filaAtual().find(
    (op): op is OperacaoCriarTransacao | OperacaoEditarTransacao | OperacaoExcluirTransacao =>
      op.tipo !== 'criarTransferencia' && op.id === id,
  );
}

export function transferenciaPendente(grupoId: string): OperacaoCriarTransferencia | undefined {
  return filaAtual().find(
    (op): op is OperacaoCriarTransferencia => op.tipo === 'criarTransferencia' && op.grupoId === grupoId,
  );
}

export function enqueueCriarTransacao(payload: CriarTransacaoInput): string {
  const id = gerarUuid();
  setEstado({
    fila: [
      ...estado.fila,
      { tipo: 'criarTransacao', id, payload, usuarioId: usuarioAtual, criadoEm: new Date().toISOString(), tentativas: 0 },
    ],
  });
  return id;
}

/**
 * Enfileira uma edição. Se a transação em questão ainda não foi sincronizada
 * (existe uma operação `criarTransacao` pendente com o mesmo id), o payload é
 * mesclado nela em vez de gerar uma chamada de PATCH para um id que o
 * servidor não conhece. Edições repetidas de uma transação já sincronizada
 * colapsam num único item.
 */
export function enqueueEditarTransacao(id: string, payload: EditarTransacaoInput): void {
  const pendenteCriacao = filaAtual().find(
    (op): op is OperacaoCriarTransacao => op.tipo === 'criarTransacao' && op.id === id,
  );
  if (pendenteCriacao) {
    pendenteCriacao.payload = { ...pendenteCriacao.payload, ...payload };
    setEstado({ fila: [...estado.fila] });
    return;
  }

  const pendenteEdicao = filaAtual().find(
    (op): op is OperacaoEditarTransacao => op.tipo === 'editarTransacao' && op.id === id,
  );
  if (pendenteEdicao) {
    pendenteEdicao.payload = { ...pendenteEdicao.payload, ...payload };
    setEstado({ fila: [...estado.fila] });
    return;
  }

  setEstado({
    fila: [
      ...estado.fila,
      { tipo: 'editarTransacao', id, payload, usuarioId: usuarioAtual, criadoEm: new Date().toISOString(), tentativas: 0 },
    ],
  });
}

/**
 * Enfileira uma exclusão. Se a transação nunca chegou ao servidor (criação
 * ainda pendente), apenas remove a criação da fila — não há nada para
 * excluir remotamente. Se havia uma edição pendente, ela é descartada em
 * favor da exclusão.
 */
export function enqueueExcluirTransacao(id: string): void {
  const criacaoPendente = filaAtual().some((op) => op.tipo === 'criarTransacao' && op.id === id);
  // Só remove/mescla itens da conta atual — não mexe em operações de outro usuário que
  // por acaso tenham o mesmo id (colisão praticamente impossível, já que os ids são UUIDs).
  const filaSemEsseId = estado.fila.filter(
    (op) =>
      !(
        pertenceAoUsuarioAtual(op) &&
        (op.tipo === 'criarTransacao' || op.tipo === 'editarTransacao') &&
        op.id === id
      ),
  );

  if (criacaoPendente) {
    setEstado({ fila: filaSemEsseId });
    return;
  }

  const jaTemExclusao = filaSemEsseId.some((op) => pertenceAoUsuarioAtual(op) && op.tipo === 'excluirTransacao' && op.id === id);
  if (jaTemExclusao) {
    setEstado({ fila: filaSemEsseId });
    return;
  }

  setEstado({
    fila: [
      ...filaSemEsseId,
      { tipo: 'excluirTransacao', id, usuarioId: usuarioAtual, criadoEm: new Date().toISOString(), tentativas: 0 },
    ],
  });
}

export function enqueueCriarTransferencia(payload: CriarTransferenciaInput): string {
  const grupoId = gerarUuid();
  setEstado({
    fila: [
      ...estado.fila,
      { tipo: 'criarTransferencia', grupoId, payload, usuarioId: usuarioAtual, criadoEm: new Date().toISOString(), tentativas: 0 },
    ],
  });
  return grupoId;
}

/** Atualiza o payload de uma transferência ainda não sincronizada (edição antes do primeiro envio). */
export function atualizarTransferenciaPendente(grupoId: string, payload: CriarTransferenciaInput): void {
  const op = transferenciaPendente(grupoId);
  if (!op) return;
  op.payload = payload;
  setEstado({ fila: [...estado.fila] });
}

/** Remove uma transferência ainda não sincronizada (exclusão antes do primeiro envio). */
export function removerTransferenciaPendente(grupoId: string): void {
  setEstado({
    fila: estado.fila.filter(
      (op) => !(pertenceAoUsuarioAtual(op) && op.tipo === 'criarTransferencia' && op.grupoId === grupoId),
    ),
  });
}

/** Remove um item da fila sem tentar sincronizá-lo (usado na tela de Perfil para descartar falhas). */
export function descartarItem(alvo: OperacaoPendente): void {
  setEstado({ fila: estado.fila.filter((op) => op !== alvo) });
}

async function executarOperacao(operacao: OperacaoPendente): Promise<void> {
  switch (operacao.tipo) {
    case 'criarTransacao':
      await criarTransacao({ ...operacao.payload, id: operacao.id });
      return;
    case 'editarTransacao':
      await editarTransacao(operacao.id, operacao.payload);
      return;
    case 'excluirTransacao':
      await excluirTransacao(operacao.id);
      return;
    case 'criarTransferencia':
      await criarTransferencia({ ...operacao.payload, transferenciaGrupoId: operacao.grupoId });
      return;
  }
}

/**
 * Percorre a fila em ordem, enviando cada operação ao backend. Uma falha de
 * rede interrompe o processamento inteiro (ainda estamos offline); um 404
 * (alvo já não existe — outro colaborador excluiu) descarta o item; qualquer
 * outro erro mantém o item na fila com `tentativas`/`ultimoErro` atualizados
 * e segue para o próximo, para que um item com problema não trave os demais.
 */
export async function processarFila(): Promise<void> {
  // Só processa operações do usuário logado agora — pendências de uma conta
  // anterior usada neste aparelho ficam paradas até esse usuário logar de novo.
  if (estado.sincronizando || filaAtual().length === 0) return;

  setEstado({ sincronizando: true });

  const filaNoInicio = filaAtual();
  let descartados = 0;
  let interrompidoPorRede = false;

  for (const operacao of filaNoInicio) {
    try {
      await executarOperacao(operacao);
      setEstado({ fila: estado.fila.filter((op) => op !== operacao) });
    } catch (err) {
      if (err instanceof NetworkError) {
        interrompidoPorRede = true;
        break;
      }
      if (err instanceof ApiError && err.status === 404) {
        descartados += 1;
        addLog('warn', 'Operação pendente descartada (alvo não existe mais no servidor)', operacao);
        setEstado({ fila: estado.fila.filter((op) => op !== operacao) });
        continue;
      }
      addLog('error', 'Falha ao sincronizar operação pendente', {
        operacao,
        erro: err instanceof Error ? err.message : String(err),
      });
      setEstado({
        fila: estado.fila.map((op) =>
          op === operacao
            ? {
                ...op,
                tentativas: op.tentativas + 1,
                ultimoErro: err instanceof ApiError ? err.message : 'Falha ao sincronizar',
              }
            : op,
        ),
      });
    }
  }

  if (!interrompidoPorRede) {
    setEstado({ sincronizando: false, ultimaSincronizacao: new Date().toISOString() });
    // Todas as queries relacionadas (listagem, resumo, evolução de saldo,
    // drilldown por categoria) usam 'transacoes' como primeiro segmento da
    // chave, então esta invalidação cobre todas de uma vez — mesmo padrão já
    // usado em app/(tabs)/index.tsx após criar/editar transações.
    void queryClient.invalidateQueries({ queryKey: ['transacoes'] });
    void queryClient.invalidateQueries({ queryKey: ['contas'] });
  } else {
    setEstado({ sincronizando: false });
  }

  if (descartados > 0) {
    Alert.alert(
      'Sincronização',
      descartados === 1
        ? 'Uma alteração pendente foi descartada porque o item já não existe mais no servidor.'
        : `${descartados} alterações pendentes foram descartadas porque os itens já não existem mais no servidor.`,
    );
  }

  // Itens adicionados por outra ação enquanto este drain rodava não fizeram
  // parte de `filaNoInicio` — se ainda estamos online, tenta mais uma vez.
  // Identifica "os mesmos itens" por tipo+id (não por referência): um item
  // que só teve `tentativas`/`ultimoErro` atualizados vira um objeto novo,
  // mas continua sendo a mesma operação — não deve, sozinho, disparar outra
  // rodada (o que causaria uma recursão sem fim).
  if (!interrompidoPorRede) {
    const chavesTentadas = new Set(filaNoInicio.map(chaveOperacao));
    const surgiramNovos = filaAtual().some((op) => !chavesTentadas.has(chaveOperacao(op)));
    if (surgiramNovos) {
      await processarFila();
    }
  }
}

function chaveOperacao(op: OperacaoPendente): string {
  return op.tipo === 'criarTransferencia' ? `criarTransferencia:${op.grupoId}` : `${op.tipo}:${op.id}`;
}
