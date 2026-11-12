import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, StyleSheet } from 'react-native';

import { ApiError } from '@/api/client';
import {
  aceitarConvite,
  listarConvitesRecebidos,
  recusarConvite,
  type ConviteRecebido,
} from '@/api/espaco';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Spacing } from '@/constants/theme';

/**
 * Convites pendentes para o e-mail de quem está logado. Entrar no espaço de
 * outra pessoa sempre exige aceite explícito.
 */
export function ConvitesRecebidosCard() {
  const queryClient = useQueryClient();

  const { data: convites = [] } = useQuery({
    queryKey: ['convites', 'recebidos'],
    queryFn: listarConvitesRecebidos,
  });

  const aceitarMutation = useMutation({
    mutationFn: (id: string) => aceitarConvite(id),
    // O espaço ativo mudou: nada do que está em cache pertence ao novo espaço.
    onSuccess: () => queryClient.resetQueries(),
    onError: (e) =>
      Alert.alert(
        'Não foi possível entrar no espaço',
        e instanceof ApiError ? e.message : 'Tente novamente.',
      ),
  });

  const recusarMutation = useMutation({
    mutationFn: (id: string) => recusarConvite(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['convites', 'recebidos'] }),
    onError: (e) =>
      Alert.alert(
        'Não foi possível recusar o convite',
        e instanceof ApiError ? e.message : 'Tente novamente.',
      ),
  });

  function confirmarAceite(convite: ConviteRecebido) {
    Alert.alert(
      'Entrar no espaço compartilhado',
      `Você passará a ver e editar as contas, transações, categorias e orçamentos de ${convite.convidadoPor}, e essa pessoa verá o que você registrar.\n\nSeus dados atuais ficam guardados no seu espaço pessoal e voltam a aparecer se você sair do espaço compartilhado (em Ajustes).`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Entrar no espaço', onPress: () => aceitarMutation.mutate(convite.id) },
      ],
    );
  }

  if (convites.length === 0) return null;

  const ocupado = aceitarMutation.isPending || recusarMutation.isPending;

  return (
    <>
      {convites.map((convite) => (
        <Card key={convite.id} variant="flat" style={styles.card}>
          <ThemedText type="default">
            <ThemedText type="smallBold">{convite.convidadoPor}</ThemedText> convidou você para
            compartilhar as finanças e registrar transações juntos.
          </ThemedText>
          <ThemedView style={styles.acoes}>
            <Button
              title="Recusar"
              variant="secondary"
              size="sm"
              onPress={() => recusarMutation.mutate(convite.id)}
              disabled={ocupado}
            />
            <Button
              title="Aceitar"
              size="sm"
              onPress={() => confirmarAceite(convite)}
              disabled={ocupado}
            />
          </ThemedView>
        </Card>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.three },
  acoes: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.two },
});
