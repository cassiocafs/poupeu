import { Feather } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApiError } from '@/api/client';
import {
  cancelarConvite,
  enviarConvite,
  obterEspaco,
  reenviarConvite,
  sairDoEspaco,
  type ConviteEnviado,
  type ResultadoConvite,
} from '@/api/espaco';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const QUERY_KEY = ['espaco'];

function textoExpiracao(convite: ConviteEnviado): string {
  if (convite.expirado) return 'Expirado';
  const dias = Math.ceil((new Date(convite.expiraEm).getTime() - Date.now()) / 86_400_000);
  return dias <= 1 ? 'Expira hoje ou amanhã' : `Expira em ${dias} dias`;
}

function mensagemErro(e: unknown, padrao: string): string {
  return e instanceof ApiError ? e.message : e instanceof Error ? e.message : padrao;
}

export default function EspacoScreen() {
  const router = useRouter();
  const theme = useTheme();
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery({ queryKey: QUERY_KEY, queryFn: obterEspaco });

  const [email, setEmail] = useState('');
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'atencao'; texto: string } | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  function aposEnvio({ convite, emailEnviado }: ResultadoConvite) {
    setErro(null);
    setAviso(
      emailEnviado
        ? { tipo: 'ok', texto: `Convite enviado para ${convite.emailConvidado}.` }
        : {
            tipo: 'atencao',
            texto: `Convite criado, mas não conseguimos enviar o e-mail. Quando ${convite.emailConvidado} entrar no Poupeu com esse e-mail, o convite aparecerá para aceitar.`,
          },
    );
    queryClient.invalidateQueries({ queryKey: QUERY_KEY });
  }

  function aoFalhar(e: unknown) {
    setAviso(null);
    setErro(mensagemErro(e, 'Não foi possível concluir a ação.'));
  }

  const enviarMutation = useMutation({
    mutationFn: (destino: string) => enviarConvite(destino),
    onSuccess: (resultado) => {
      setEmail('');
      aposEnvio(resultado);
    },
    onError: aoFalhar,
  });

  const reenviarMutation = useMutation({
    mutationFn: (id: string) => reenviarConvite(id),
    onSuccess: aposEnvio,
    onError: aoFalhar,
  });

  const cancelarMutation = useMutation({
    mutationFn: (id: string) => cancelarConvite(id),
    onSuccess: () => {
      setAviso(null);
      setErro(null);
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onError: aoFalhar,
  });

  const sairMutation = useMutation({
    mutationFn: () => sairDoEspaco(),
    // Voltamos ao espaço pessoal: nada em cache pertence a ele.
    onSuccess: () => queryClient.resetQueries(),
    onError: (e) =>
      Alert.alert('Não foi possível sair do espaço', mensagemErro(e, 'Tente novamente.')),
  });

  function confirmarSaida() {
    Alert.alert(
      'Sair do espaço compartilhado',
      'Você deixará de ver as contas e transações deste espaço. Para voltar, será preciso um novo convite.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Sair do espaço', style: 'destructive', onPress: () => sairMutation.mutate() },
      ],
    );
  }

  function confirmarCancelamento(convite: ConviteEnviado) {
    Alert.alert('Cancelar convite', `O convite para ${convite.emailConvidado} deixará de valer.`, [
      { text: 'Voltar', style: 'cancel' },
      { text: 'Cancelar convite', style: 'destructive', onPress: () => cancelarMutation.mutate(convite.id) },
    ]);
  }

  const membros = data?.membros ?? [];
  const convites = data?.convites ?? [];
  const podeEnviar = email.trim().length > 0 && !enviarMutation.isPending;

  return (
    <ThemedView type="background" style={styles.container}>
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <ThemedView style={[styles.header, { borderBottomColor: theme.border }]}>
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/perfil'))}
            hitSlop={12}
            style={styles.voltar}>
            <Feather name="chevron-left" size={22} color={theme.text} />
            <ThemedText type="default">Ajustes</ThemedText>
          </Pressable>
        </ThemedView>

        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <ThemedText type="title">Espaço compartilhado</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Convide familiares pelo e-mail para registrar transações junto com você. Todos os membros
            têm o mesmo acesso: veem e editam as mesmas contas, transações, categorias e orçamentos.
          </ThemedText>

          <View style={styles.field}>
            <ThemedText type="label" themeColor="textSecondary">
              E-mail do familiar
            </ThemedText>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="nome@exemplo.com"
              placeholderTextColor={theme.textTertiary}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!enviarMutation.isPending}
              onSubmitEditing={() => podeEnviar && enviarMutation.mutate(email.trim())}
              returnKeyType="send"
              style={[
                styles.input,
                { color: theme.text, backgroundColor: theme.card, borderColor: theme.border },
              ]}
            />
          </View>
          <Button
            title={enviarMutation.isPending ? 'Enviando...' : 'Enviar convite'}
            icon="send"
            onPress={() => enviarMutation.mutate(email.trim())}
            loading={enviarMutation.isPending}
            disabled={!podeEnviar}
            fullWidth
          />
          {aviso ? (
            <ThemedText type="small" themeColor={aviso.tipo === 'ok' ? 'textSecondary' : 'destructive'}>
              {aviso.texto}
            </ThemedText>
          ) : null}
          {erro ? (
            <ThemedText type="small" themeColor="destructive">
              {erro}
            </ThemedText>
          ) : null}

          {isLoading ? (
            <ThemedText type="small" themeColor="textSecondary">
              Carregando...
            </ThemedText>
          ) : null}
          {isError ? (
            <ThemedText type="small" themeColor="destructive">
              Não foi possível carregar o espaço.
            </ThemedText>
          ) : null}

          {data ? (
            <>
              <ThemedText type="smallBold">Membros ({membros.length})</ThemedText>
              <Card padding="none">
                {membros.map((membro, i) => (
                  <ThemedView
                    key={membro.id}
                    style={[
                      styles.linha,
                      i < membros.length - 1 && {
                        borderBottomColor: theme.divider,
                        borderBottomWidth: StyleSheet.hairlineWidth,
                      },
                    ]}>
                    <ThemedView style={[styles.avatar, { backgroundColor: theme.surface }]}>
                      <ThemedText type="smallBold" themeColor="primary">
                        {(membro.nome ?? membro.email).slice(0, 1).toUpperCase()}
                      </ThemedText>
                    </ThemedView>
                    <ThemedView style={styles.linhaTextos}>
                      <ThemedText type="default" numberOfLines={1}>
                        {membro.nome ?? membro.email}
                        {membro.voceMesmo ? ' (você)' : ''}
                      </ThemedText>
                      {membro.nome ? (
                        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                          {membro.email}
                        </ThemedText>
                      ) : null}
                    </ThemedView>
                  </ThemedView>
                ))}
              </Card>

              {convites.length > 0 ? (
                <>
                  <ThemedText type="smallBold">Convites pendentes</ThemedText>
                  <Card padding="none">
                    {convites.map((convite, i) => (
                      <ThemedView
                        key={convite.id}
                        style={[
                          styles.linhaConvite,
                          i < convites.length - 1 && {
                            borderBottomColor: theme.divider,
                            borderBottomWidth: StyleSheet.hairlineWidth,
                          },
                        ]}>
                        <ThemedView style={styles.linhaTextos}>
                          <ThemedText type="default" numberOfLines={1}>
                            {convite.emailConvidado}
                          </ThemedText>
                          <ThemedText
                            type="small"
                            themeColor={convite.expirado ? 'destructive' : 'textSecondary'}>
                            {textoExpiracao(convite)}
                          </ThemedText>
                        </ThemedView>
                        <ThemedView style={styles.acoesConvite}>
                          <Button
                            title="Reenviar"
                            variant="secondary"
                            size="sm"
                            onPress={() => reenviarMutation.mutate(convite.id)}
                            disabled={reenviarMutation.isPending}
                          />
                          <Button
                            title="Cancelar"
                            variant="destructive"
                            size="sm"
                            onPress={() => confirmarCancelamento(convite)}
                            disabled={cancelarMutation.isPending}
                          />
                        </ThemedView>
                      </ThemedView>
                    ))}
                  </Card>
                </>
              ) : null}

              {membros.length > 1 ? (
                <View style={styles.sair}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Sair do espaço devolve você ao espaço em que estava antes. Os dados compartilhados
                    continuam com os outros membros.
                  </ThemedText>
                  <Button
                    title="Sair do espaço compartilhado"
                    variant="destructive"
                    onPress={confirmarSaida}
                    loading={sairMutation.isPending}
                    fullWidth
                  />
                </View>
              ) : null}
            </>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.page,
    paddingBottom: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  voltar: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  scroll: { padding: Spacing.page, gap: Spacing.three, paddingBottom: Spacing.six * 2 },
  field: { gap: Spacing.one },
  input: {
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
  },
  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  linhaConvite: {
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  linhaTextos: { flex: 1, gap: 2 },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  acoesConvite: { flexDirection: 'row', gap: Spacing.two },
  sair: { gap: Spacing.three, paddingTop: Spacing.three },
});
