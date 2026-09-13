import { Feather } from '@expo/vector-icons';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { excluirContaUsuario } from '@/api/auth';
import { DiagnosticoModal } from '@/components/perfil/DiagnosticoModal';
import { RegrasModal } from '@/components/perfil/RegrasModal';
import { SincronizacaoCard } from '@/components/perfil/SincronizacaoCard';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AppSwitch } from '@/components/ui/AppSwitch';
import { Card } from '@/components/ui/Card';
import { Tabs } from '@/components/ui/Tabs';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { usePreferences, type ColorSchemeOverride } from '@/contexts/PreferencesContext';
import { useTheme } from '@/hooks/use-theme';
import type { OrdenacaoTransacoes } from '@/lib/ordenacaoTransacoes';

const OPCOES_TEMA: { valor: ColorSchemeOverride; label: string }[] = [
  { valor: 'system', label: 'Sistema' },
  { valor: 'light', label: 'Claro' },
  { valor: 'dark', label: 'Escuro' },
];

const OPCOES_ORDENACAO: { valor: OrdenacaoTransacoes; label: string }[] = [
  { valor: 'recentes', label: 'Recentes' },
  { valor: 'antigas', label: 'Antigas' },
];

function nomeDeExibicao(email: string | undefined, nomeCompleto: unknown): string {
  if (typeof nomeCompleto === 'string' && nomeCompleto.trim()) return nomeCompleto.trim();
  return email ?? '';
}

export default function PerfilScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { session, signOut } = useAuth();
  const {
    colorSchemeOverride,
    setColorSchemeOverride,
    hideValues,
    setHideValues,
    ordenacaoTransacoes,
    setOrdenacaoTransacoes,
  } = usePreferences();
  const [diagnosticoAberto, setDiagnosticoAberto] = useState(false);
  const [regrasAberto, setRegrasAberto] = useState(false);
  const podeVerDiagnostico = session?.user?.email === 'esteyceecassio@gmail.com';

  const excluirContaMutation = useMutation({
    mutationFn: excluirContaUsuario,
    onSuccess: () => signOut(),
    onError: (err) => {
      Alert.alert(
        'Não foi possível excluir a conta',
        err instanceof Error ? err.message : 'Tente novamente mais tarde.',
      );
    },
  });

  function confirmarExclusaoConta() {
    Alert.alert(
      'Excluir sua conta',
      'Essa ação não pode ser desfeita. Suas contas, transações, categorias, orçamentos e regras serão excluídos permanentemente e você perderá o acesso a esta conta — inclusive para entrar novamente com este e-mail ou com o Google.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir conta',
          style: 'destructive',
          onPress: () => excluirContaMutation.mutate(),
        },
      ],
    );
  }

  const nome = nomeDeExibicao(session?.user?.email, session?.user?.user_metadata?.nome);
  const inicial = (nome || '?').slice(0, 1).toUpperCase();

  return (
    <ThemedView type="background" style={styles.container}>
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <ThemedText type="title">Ajustes</ThemedText>

          <Card style={styles.perfilCard}>
            <ThemedView style={[styles.avatar, { backgroundColor: theme.surface }]}>
              <ThemedText type="subtitle" themeColor="primary">
                {inicial}
              </ThemedText>
            </ThemedView>
            <ThemedView style={styles.perfilTextos}>
              <ThemedText type="smallBold" numberOfLines={1}>
                {nome}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                {session?.user?.email}
              </ThemedText>
            </ThemedView>
          </Card>

          <Card style={styles.preferenciasCard}>
            <ThemedText type="smallBold">Preferências</ThemedText>

            <ThemedView style={styles.preferenciaTextos}>
              <ThemedText type="label">Tema do app</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Escuro, claro ou o mesmo do sistema
              </ThemedText>
            </ThemedView>
            <Tabs
              items={OPCOES_TEMA.map((o) => ({ value: o.valor, label: o.label }))}
              value={colorSchemeOverride}
              onChange={setColorSchemeOverride}
            />

            <ThemedView style={[styles.preferenciaLinhaComBorda, { borderTopColor: theme.border }]}>
              <ThemedView style={styles.preferenciaTextos}>
                <ThemedText type="label">Ordenar transações</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Defina o que aparece no topo da lista
                </ThemedText>
              </ThemedView>
              <Tabs
                items={OPCOES_ORDENACAO.map((o) => ({ value: o.valor, label: o.label }))}
                value={ordenacaoTransacoes}
                onChange={setOrdenacaoTransacoes}
              />
            </ThemedView>

            <ThemedView style={[styles.preferenciaLinhaComBorda, { borderTopColor: theme.border }]}>
              <AppSwitch
                value={hideValues}
                onValueChange={setHideValues}
                label="Ocultar valores"
                hint="Esconde saldos e valores em locais públicos"
              />
            </ThemedView>
          </Card>

          <Card padded={false} style={styles.acoesCard}>
            <Pressable
              onPress={() => router.push('/contas')}
              style={[styles.acaoLinha, { borderBottomColor: theme.border }]}>
              <ThemedView style={[styles.acaoIcone, { backgroundColor: theme.surface }]}>
                <Feather name="credit-card" size={16} color={theme.primary} />
              </ThemedView>
              <ThemedText type="default" style={styles.acaoTexto}>
                Contas
              </ThemedText>
              <Feather name="chevron-right" size={18} color={theme.textTertiary} />
            </Pressable>

            <Pressable
              onPress={() => router.push('/categorias')}
              style={[styles.acaoLinha, { borderBottomColor: theme.border }]}>
              <ThemedView style={[styles.acaoIcone, { backgroundColor: theme.surface }]}>
                <Feather name="tag" size={16} color={theme.primary} />
              </ThemedView>
              <ThemedText type="default" style={styles.acaoTexto}>
                Categorias e subcategorias
              </ThemedText>
              <Feather name="chevron-right" size={18} color={theme.textTertiary} />
            </Pressable>

            <Pressable
              onPress={() => router.push('/metas')}
              style={[styles.acaoLinha, { borderBottomColor: theme.border }]}>
              <ThemedView style={[styles.acaoIcone, { backgroundColor: theme.surface }]}>
                <Feather name="target" size={16} color={theme.primary} />
              </ThemedView>
              <ThemedText type="default" style={styles.acaoTexto}>
                Metas
              </ThemedText>
              <Feather name="chevron-right" size={18} color={theme.textTertiary} />
            </Pressable>

            <Pressable
              onPress={() => setRegrasAberto(true)}
              style={[styles.acaoLinha, { borderBottomColor: theme.border }]}>
              <ThemedView style={[styles.acaoIcone, { backgroundColor: theme.surface }]}>
                <Feather name="sliders" size={16} color={theme.primary} />
              </ThemedView>
              <ThemedText type="default" style={styles.acaoTexto}>
                Regras de inserção
              </ThemedText>
              <Feather name="chevron-right" size={18} color={theme.textTertiary} />
            </Pressable>

            <Pressable
              onPress={() => router.push('/privacidade')}
              style={[styles.acaoLinha, { borderBottomColor: theme.border }]}>
              <ThemedView style={[styles.acaoIcone, { backgroundColor: theme.surface }]}>
                <Feather name="shield" size={16} color={theme.primary} />
              </ThemedView>
              <ThemedText type="default" style={styles.acaoTexto}>
                Política de privacidade
              </ThemedText>
              <Feather name="chevron-right" size={18} color={theme.textTertiary} />
            </Pressable>

            <Pressable
              onPress={() => router.push('/termos')}
              style={[styles.acaoLinha, { borderBottomColor: theme.border }]}>
              <ThemedView style={[styles.acaoIcone, { backgroundColor: theme.surface }]}>
                <Feather name="file-text" size={16} color={theme.primary} />
              </ThemedView>
              <ThemedText type="default" style={styles.acaoTexto}>
                Termos de uso
              </ThemedText>
              <Feather name="chevron-right" size={18} color={theme.textTertiary} />
            </Pressable>

            {podeVerDiagnostico && (
              <Pressable
                onPress={() => setDiagnosticoAberto(true)}
                style={[styles.acaoLinha, { borderBottomColor: theme.border }]}>
                <ThemedView style={[styles.acaoIcone, { backgroundColor: theme.surface }]}>
                  <Feather name="terminal" size={16} color={theme.primary} />
                </ThemedView>
                <ThemedText type="default" style={styles.acaoTexto}>
                  Logs de diagnóstico
                </ThemedText>
                <Feather name="chevron-right" size={18} color={theme.textTertiary} />
              </Pressable>
            )}

            <Pressable
              onPress={confirmarExclusaoConta}
              disabled={excluirContaMutation.isPending}
              style={[styles.acaoLinha, { borderBottomColor: theme.border }]}>
              <ThemedView style={[styles.acaoIcone, { backgroundColor: theme.destructiveSoft }]}>
                <Feather name="trash-2" size={16} color={theme.destructive} />
              </ThemedView>
              <ThemedText type="default" themeColor="destructive" style={styles.acaoTexto}>
                Excluir conta
              </ThemedText>
              {excluirContaMutation.isPending && (
                <ActivityIndicator size="small" color={theme.destructive} />
              )}
            </Pressable>

            <Pressable onPress={() => signOut()} style={styles.acaoLinha}>
              <ThemedView style={[styles.acaoIcone, { backgroundColor: theme.destructiveSoft }]}>
                <Feather name="log-out" size={16} color={theme.destructive} />
              </ThemedView>
              <ThemedText type="default" themeColor="destructive" style={styles.acaoTexto}>
                Sair
              </ThemedText>
            </Pressable>
          </Card>

          <SincronizacaoCard />
        </ScrollView>
      </SafeAreaView>

      <RegrasModal visible={regrasAberto} onClose={() => setRegrasAberto(false)} />
      {podeVerDiagnostico ? (
        <DiagnosticoModal visible={diagnosticoAberto} onClose={() => setDiagnosticoAberto(false)} />
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  scroll: { padding: Spacing.page, gap: Spacing.three, paddingBottom: Spacing.six * 2 },
  perfilCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  perfilTextos: { flex: 1, gap: 2 },
  preferenciasCard: { gap: Spacing.three },
  preferenciaLinhaComBorda: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.two,
    marginTop: Spacing.one,
    gap: Spacing.three,
  },
  preferenciaTextos: { flex: 1, gap: 2 },
  acoesCard: { overflow: 'hidden' },
  acaoLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  acaoIcone: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  acaoTexto: { flex: 1 },
});
