import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { buscarResumoMensal } from '@/api/transacoes';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ConvitesRecebidosCard } from '@/components/espaco/ConvitesRecebidosCard';
import { FinancialCard } from '@/components/home/FinancialCard';
import { MetasResumoCard } from '@/components/home/MetasResumoCard';
import { SaldoPorContasCard } from '@/components/home/SaldoPorContasCard';
import { TransacoesRecentesCard } from '@/components/home/TransacoesRecentesCard';
import { AppHeader } from '@/components/ui/AppHeader';
import { InsightCard } from '@/components/ui/InsightCard';
import { StatCard } from '@/components/ui/StatCard';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useFormatarValor } from '@/hooks/use-formatar-valor';
import { useInsightMensal } from '@/hooks/use-insight-mensal';
import { useSyncQueue } from '@/hooks/use-sync-queue';
import { useTheme } from '@/hooks/use-theme';
import { subtrairMeses } from '@/lib/date';
import { aplicarPendenciasEmResumo } from '@/lib/saldosPendentes';
import { captionSobrou, variacaoTopoCaption } from '@/lib/variacao';

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

function hoje() {
  const agora = new Date();
  return { ano: agora.getFullYear(), mes: agora.getMonth() + 1 };
}

function nomeDeExibicao(email: string | undefined, nomeCompleto: unknown): string {
  if (typeof nomeCompleto === 'string' && nomeCompleto.trim()) return nomeCompleto.trim().split(' ')[0];
  return email?.split('@')[0] ?? '';
}

export default function InicioScreen() {
  const theme = useTheme();
  const router = useRouter();
  const formatarValor = useFormatarValor();
  const { session } = useAuth();
  const { ano, mes } = hoje();
  const anterior = useMemo(() => subtrairMeses({ ano, mes }, 1), [ano, mes]);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['transacoes', 'resumo', ano, mes],
    queryFn: () => buscarResumoMensal(ano, mes),
  });

  const { data: resumoAnterior } = useQuery({
    queryKey: ['transacoes', 'resumo', anterior.ano, anterior.mes],
    queryFn: () => buscarResumoMensal(anterior.ano, anterior.mes),
  });

  const insight = useInsightMensal(ano, mes);
  const { fila } = useSyncQueue();
  const resumo = useMemo(() => aplicarPendenciasEmResumo(data, fila, ano, mes), [data, fila, ano, mes]);

  const nome = nomeDeExibicao(session?.user?.email, session?.user?.user_metadata?.nome);
  const economia = resumo ? resumo.totalEntradas - resumo.totalSaidas : 0;
  const mesNome = MESES[mes - 1];

  return (
    <ThemedView type="background" style={styles.container}>
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={theme.primary} />}>
          <AppHeader
            greeting={nome ? `Oi, ${nome} 👋` : 'Oi 👋'}
            subtitle={`Vamos olhar ${mesNome}?`}
          />

          <ConvitesRecebidosCard />

          {isLoading || !resumo ? (
            <ThemedText type="small" themeColor="textSecondary">
              Carregando...
            </ThemedText>
          ) : (
            <>
              <FinancialCard
                footer={{
                  label: `Saldo anterior (${MESES[anterior.mes - 1]} ${anterior.ano}) ·`,
                  value: resumo.saldoAnterior,
                }}
              />

              <View style={styles.statRow}>
                <StatCard
                  label={`Entrou em ${mesNome}`}
                  value={resumo.totalEntradas}
                  tone="in"
                  caption={
                    resumoAnterior
                      ? variacaoTopoCaption(resumo.totalEntradas, resumoAnterior.totalEntradas, formatarValor)
                      : '…'
                  }
                  onPress={() => router.push(`/relatorios?ano=${ano}&mes=${mes}&foco=receitas`)}
                />
                <StatCard
                  label={`Saiu em ${mesNome}`}
                  value={-Math.abs(resumo.totalSaidas)}
                  tone="out"
                  caption={
                    resumoAnterior
                      ? variacaoTopoCaption(resumo.totalSaidas, resumoAnterior.totalSaidas, formatarValor)
                      : '…'
                  }
                  onPress={() => router.push(`/relatorios?ano=${ano}&mes=${mes}&foco=despesas`)}
                />
                <StatCard
                  label="Sobrou"
                  value={economia}
                  tone="saved"
                  caption={captionSobrou(economia, resumo.totalEntradas)}
                  onPress={() => router.push(`/relatorios?ano=${ano}&mes=${mes}&foco=comparativo`)}
                />
              </View>

              {insight ? <InsightCard>{insight.texto}</InsightCard> : null}

              <TransacoesRecentesCard ano={ano} mes={mes} recentes={resumo.recentes} />

              <MetasResumoCard />

              <SaldoPorContasCard ano={ano} mes={mes} />
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  scroll: { padding: Spacing.page, gap: Spacing.gap, paddingBottom: Spacing.six * 2 },
  statRow: { flexDirection: 'column', gap: Spacing.two },
});
