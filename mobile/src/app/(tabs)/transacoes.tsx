import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { listarContas } from '@/api/contas';
import { listarTransacoesMes, type StatusFiltro } from '@/api/transacoes';
import { AcoesLoteBar } from '@/components/transacoes/AcoesLoteBar';
import { AppHeader } from '@/components/ui/AppHeader';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconButton } from '@/components/ui/IconButton';
import { SearchInput } from '@/components/ui/SearchInput';
import { SummaryStrip } from '@/components/ui/SummaryStrip';
import { FiltrosModal, type FiltrosAplicados } from '@/components/transacoes/FiltrosModal';
import { MesNavigator } from '@/components/transacoes/MesNavigator';
import { TransacaoFormModal } from '@/components/transacoes/TransacaoFormModal';
import { TransacaoItem } from '@/components/transacoes/TransacaoItem';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useFormatarValor } from '@/hooks/use-formatar-valor';
import { formatarDiaGrupo } from '@/lib/format';
import { useTheme } from '@/hooks/use-theme';
import { useTransacoesComPendencias, type TransacaoComPendencia } from '@/hooks/use-transacoes-com-pendencias';
import { usePreferences } from '@/contexts/PreferencesContext';
import { ordenarDias } from '@/lib/ordenacaoTransacoes';

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

function hoje() {
  const agora = new Date();
  return { ano: agora.getFullYear(), mes: agora.getMonth() + 1 };
}

export default function TransacoesScreen() {
  const theme = useTheme();
  const formatarValor = useFormatarValor();
  const { ordenacaoTransacoes } = usePreferences();
  const padrao = hoje();
  const params = useLocalSearchParams<{ contaId?: string; ano?: string; mes?: string; novo?: string; tipo?: string }>();
  const contaIdParam = Array.isArray(params.contaId) ? params.contaId[0] : params.contaId;
  const anoParam = Array.isArray(params.ano) ? params.ano[0] : params.ano;
  const mesParam = Array.isArray(params.mes) ? params.mes[0] : params.mes;
  const novoParam = Array.isArray(params.novo) ? params.novo[0] : params.novo;
  const tipoParam = Array.isArray(params.tipo) ? params.tipo[0] : params.tipo;
  const contaIdParamAplicado = useRef<string | undefined>(undefined);
  const periodoParamAplicado = useRef<string | undefined>(undefined);
  const novoParamAplicado = useRef<string | undefined>(undefined);

  const [ano, setAno] = useState(padrao.ano);
  const [mes, setMes] = useState(padrao.mes);
  const [status, setStatus] = useState<StatusFiltro>('todas');
  const [contaIds, setContaIds] = useState<string[]>([]);
  const [categoriaIds, setCategoriaIds] = useState<string[]>([]);
  const [dataInicio, setDataInicio] = useState<string | null>(null);
  const [dataFim, setDataFim] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [filtrosVisiveis, setFiltrosVisiveis] = useState(false);
  const [criando, setCriando] = useState(false);
  const [tipoNovo, setTipoNovo] = useState<'DESPESA' | 'RECEITA'>('DESPESA');
  const [transacaoEmEdicao, setTransacaoEmEdicao] = useState<TransacaoComPendencia | null>(null);
  const [busca, setBusca] = useState('');

  const { data: contas = [] } = useQuery({
    queryKey: ['contas'],
    queryFn: () => listarContas(true),
  });

  useEffect(() => {
    if (contaIdParam && contaIdParam !== contaIdParamAplicado.current) {
      contaIdParamAplicado.current = contaIdParam;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- aplica filtro vindo da navegação (saldo por conta)
      setContaIds([contaIdParam]);
      setSelectedIds([]);
    }
  }, [contaIdParam]);

  useEffect(() => {
    if (novoParam && novoParam !== novoParamAplicado.current) {
      novoParamAplicado.current = novoParam;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- abre o formulário vindo da navegação (ações rápidas)
      setTipoNovo(tipoParam === 'RECEITA' ? 'RECEITA' : 'DESPESA');
      // eslint-disable-next-line react-hooks/set-state-in-effect -- abre o formulário vindo da navegação (ações rápidas)
      setCriando(true);
    }
  }, [novoParam, tipoParam]);

  useEffect(() => {
    if (!anoParam || !mesParam) return;
    const chave = `${anoParam}-${mesParam}`;
    if (chave !== periodoParamAplicado.current) {
      periodoParamAplicado.current = chave;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- aplica mês vindo da navegação (saldo por conta)
      setAno(Number(anoParam));
      // eslint-disable-next-line react-hooks/set-state-in-effect -- aplica mês vindo da navegação (saldo por conta)
      setMes(Number(mesParam));
    }
  }, [anoParam, mesParam]);

  useEffect(() => {
    if (contas.length > 0 && contaIds.length === 0 && !contaIdParam) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- seleciona todas as contas apenas na primeira carga
      setContaIds(contas.map((c) => c.id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contas]);

  const buscaNormalizada = busca.trim();

  const {
    data: dadosServidor,
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ['transacoes', { ano, mes, contaIds, categoriaIds, status, dataInicio, dataFim, texto: buscaNormalizada }],
    queryFn: () =>
      listarTransacoesMes({
        ano,
        mes,
        contaIds: contaIds.length > 0 ? contaIds : undefined,
        categoriaIds: categoriaIds.length > 0 ? categoriaIds : undefined,
        status,
        texto: buscaNormalizada || undefined,
        dataInicio: dataInicio ?? undefined,
        dataFim: dataFim ?? undefined,
      }),
    enabled: contaIds.length > 0,
  });

  const data = useTransacoesComPendencias(dadosServidor, contas, {
    ano,
    mes,
    contaIds: contaIds.length > 0 ? contaIds : undefined,
    categoriaIds: categoriaIds.length > 0 ? categoriaIds : undefined,
    status,
    dataInicio: dataInicio ?? undefined,
    dataFim: dataFim ?? undefined,
  });

  function mudarMes(novoAno: number, novoMes: number) {
    setAno(novoAno);
    setMes(novoMes);
    setSelectedIds([]);
    setDataInicio(null);
    setDataFim(null);
  }

  function aplicarFiltros(filtros: FiltrosAplicados) {
    setStatus(filtros.status);
    setContaIds(filtros.contaIds);
    setCategoriaIds(filtros.categoriaIds);
    setDataInicio(filtros.dataInicio);
    setDataFim(filtros.dataFim);
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  }

  function aoPressionar(transacao: TransacaoComPendencia) {
    if (selectedIds.length > 0) {
      toggleSelect(transacao.id);
    } else {
      setTransacaoEmEdicao(transacao);
    }
  }

  function aoSegurar(transacao: TransacaoComPendencia) {
    if (!selectedIds.includes(transacao.id)) {
      setSelectedIds((prev) => [...prev, transacao.id]);
    }
  }

  const grupos = ordenarDias(data?.dias ?? [], ordenacaoTransacoes);

  const filtrosAtivos =
    status !== 'todas' ||
    categoriaIds.length > 0 ||
    (contas.length > 0 && contaIds.length < contas.length) ||
    Boolean(dataInicio || dataFim);

  return (
    <ThemedView type="background" style={styles.container}>
      <SafeAreaView edges={['bottom']} style={styles.safeArea}>
        <ThemedView style={styles.topo}>
          <AppHeader variant="title" title="Transações" />

          <ThemedView style={styles.topoLinha}>
            <MesNavigator ano={ano} mes={mes} onChange={mudarMes} />
            <ThemedView style={styles.filtroWrap}>
              <IconButton
                icon="sliders"
                label={filtrosAtivos ? 'Filtros ativos' : 'Filtros'}
                onPress={() => setFiltrosVisiveis(true)}
                color={filtrosAtivos ? theme.primary : theme.text}
              />
              {filtrosAtivos ? <ThemedView style={[styles.pontoFiltro, { backgroundColor: theme.primary }]} /> : null}
            </ThemedView>
          </ThemedView>

          <SearchInput value={busca} onChangeText={setBusca} placeholder="Buscar transação" />

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
            keyboardShouldPersistTaps="handled">
            <Chip label="Todas" selected={status === 'todas'} onPress={() => setStatus('todas')} />
            <Chip label="Pagas" selected={status === 'consolidadas'} onPress={() => setStatus('consolidadas')} />
            <Chip label="Pendentes" selected={status === 'pendentes'} onPress={() => setStatus('pendentes')} />
          </ScrollView>
        </ThemedView>

        {isLoading ? <ActivityIndicator style={styles.centro} color={theme.primary} /> : null}

        {!isLoading && grupos.length === 0 ? (
          <EmptyState mood="thinking" title="Nenhuma transação encontrada">
            Ajuste o período ou os filtros para ver outras transações.
          </EmptyState>
        ) : null}

        {!isLoading && grupos.length > 0 ? (
          <FlatList
            data={grupos}
            keyExtractor={(dia) => dia.data}
            contentContainerStyle={styles.lista}
            refreshControl={
              <RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} tintColor={theme.primary} />
            }
            ListHeaderComponent={
              data ? (
                <SummaryStrip
                  label={buscaNormalizada ? 'Saiu no resultado da busca' : `Saiu em ${MESES[mes - 1]}`}
                  value={-Math.abs(data.totalSaidas)}
                />
              ) : null
            }
            renderItem={({ item: dia }) => (
              <ThemedView style={styles.grupo}>
                <ThemedView style={styles.grupoHeader}>
                  <ThemedText type="caption" themeColor="textSecondary">
                    {formatarDiaGrupo(dia.data)}
                  </ThemedText>
                  <ThemedText
                    type="caption"
                    numeric
                    themeColor={dia.saldoDia < 0 ? 'expense' : 'income'}
                    style={styles.grupoTotal}>
                    {dia.saldoDia >= 0 ? '+ ' : ''}
                    {formatarValor(dia.saldoDia)}
                  </ThemedText>
                </ThemedView>
                <Card padding="compact">
                  {dia.transacoes.map((transacao, i) => (
                    <ThemedView
                      key={transacao.id}
                      style={
                        i < dia.transacoes.length - 1
                          ? [styles.divider, { borderBottomColor: theme.divider }]
                          : undefined
                      }>
                      <TransacaoItem
                        transacao={transacao}
                        pendenteSync={transacao.pendenteSync}
                        selecionado={selectedIds.includes(transacao.id)}
                        modoSelecao={selectedIds.length > 0}
                        onPress={() => aoPressionar(transacao)}
                        onLongPress={() => aoSegurar(transacao)}
                      />
                    </ThemedView>
                  ))}
                </Card>
              </ThemedView>
            )}
          />
        ) : null}

        <AcoesLoteBar selectedIds={selectedIds} onDone={() => setSelectedIds([])} />
      </SafeAreaView>

      <FiltrosModal
        visible={filtrosVisiveis}
        onClose={() => setFiltrosVisiveis(false)}
        ano={ano}
        mes={mes}
        status={status}
        contaIds={contaIds}
        categoriaIds={categoriaIds}
        dataInicio={dataInicio}
        dataFim={dataFim}
        onAplicar={aplicarFiltros}
      />

      <TransacaoFormModal
        visible={criando || !!transacaoEmEdicao}
        transacao={transacaoEmEdicao}
        tipoInicial={tipoNovo}
        onClose={() => {
          setCriando(false);
          setTransacaoEmEdicao(null);
        }}
        onSaved={() => {
          setCriando(false);
          setTransacaoEmEdicao(null);
        }}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  topo: { paddingHorizontal: Spacing.page, paddingTop: Spacing.two, gap: Spacing.two },
  topoLinha: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  filtroWrap: {},
  pontoFiltro: { position: 'absolute', top: 4, right: 4, width: 6, height: 6, borderRadius: 3 },
  chips: { flexDirection: 'row', gap: Spacing.two, paddingVertical: Spacing.half },
  centro: { marginTop: Spacing.five },
  lista: { padding: Spacing.page, gap: Spacing.three, flexGrow: 1 },
  grupo: { gap: Spacing.two },
  grupoHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  grupoTotal: { letterSpacing: 0 },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth },
});
