import { useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { Link, useRouter } from 'expo-router';
import { Alert, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { GoogleButton } from '@/components/ui/GoogleButton';
import { Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/hooks/use-theme';
import { traduzirErroAuth } from '@/lib/authErrors';

export default function CadastroScreen() {
  const { signUp, signInWithGoogle } = useAuth();
  const theme = useTheme();
  const router = useRouter();

  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [mostrarConfirmarSenha, setMostrarConfirmarSenha] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingGoogle, setLoadingGoogle] = useState(false);

  async function handleSubmit() {
    setErro(null);

    if (senha.length < 6) {
      setErro('A senha deve ter pelo menos 6 caracteres');
      return;
    }

    if (senha !== confirmarSenha) {
      setErro('As senhas não coincidem');
      return;
    }

    setLoading(true);
    try {
      await signUp(nome.trim(), email.trim(), senha);
      Alert.alert('Confirme seu e-mail', 'Enviamos um link de confirmação para o seu e-mail. Confirme para poder entrar.', [
        { text: 'OK', onPress: () => router.replace('/login') },
      ]);
    } catch (err) {
      setErro(traduzirErroAuth(err, 'Falha ao criar conta'));
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setErro(null);
    setLoadingGoogle(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      setErro(traduzirErroAuth(err, 'Falha ao entrar com Google'));
    } finally {
      setLoadingGoogle(false);
    }
  }

  return (
    <ThemedView type="background" style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          style={styles.keyboardAvoiding}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <ThemedView style={styles.header}>
              <Image
                source={require('../../../assets/images/logo-horizontal.png')}
                style={styles.logo}
                resizeMode="contain"
              />
              <ThemedText type="default" themeColor="textSecondary">
                Criar conta
              </ThemedText>
            </ThemedView>

            <Card style={styles.card}>
              <ThemedView style={styles.field}>
                <ThemedText type="label">Nome</ThemedText>
                <TextInput
                  value={nome}
                  onChangeText={setNome}
                  style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.surface }]}
                  placeholderTextColor={theme.textTertiary}
                />
              </ThemedView>

              <ThemedView style={styles.field}>
                <ThemedText type="label">E-mail</ThemedText>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.surface }]}
                  placeholderTextColor={theme.textTertiary}
                />
              </ThemedView>

              <ThemedView style={styles.field}>
                <ThemedText type="label">Senha</ThemedText>
                <ThemedView style={styles.passwordRow}>
                  <TextInput
                    value={senha}
                    onChangeText={setSenha}
                    secureTextEntry={!mostrarSenha}
                    style={[
                      styles.input,
                      styles.inputPassword,
                      { borderColor: theme.border, color: theme.text, backgroundColor: theme.surface },
                    ]}
                    placeholderTextColor={theme.textTertiary}
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
                    onPress={() => setMostrarSenha((v) => !v)}
                    hitSlop={8}
                    style={styles.togglePassword}
                  >
                    <Feather name={mostrarSenha ? 'eye-off' : 'eye'} size={18} color={theme.textTertiary} />
                  </Pressable>
                </ThemedView>
              </ThemedView>

              <ThemedView style={styles.field}>
                <ThemedText type="label">Confirmar senha</ThemedText>
                <ThemedView style={styles.passwordRow}>
                  <TextInput
                    value={confirmarSenha}
                    onChangeText={setConfirmarSenha}
                    secureTextEntry={!mostrarConfirmarSenha}
                    style={[
                      styles.input,
                      styles.inputPassword,
                      { borderColor: theme.border, color: theme.text, backgroundColor: theme.surface },
                    ]}
                    placeholderTextColor={theme.textTertiary}
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={mostrarConfirmarSenha ? 'Ocultar senha' : 'Mostrar senha'}
                    onPress={() => setMostrarConfirmarSenha((v) => !v)}
                    hitSlop={8}
                    style={styles.togglePassword}
                  >
                    <Feather name={mostrarConfirmarSenha ? 'eye-off' : 'eye'} size={18} color={theme.textTertiary} />
                  </Pressable>
                </ThemedView>
              </ThemedView>

              {erro && (
                <ThemedText type="small" themeColor="destructive" style={styles.erro}>
                  {erro}
                </ThemedText>
              )}

              <Button
                title={loading ? 'Criando...' : 'Criar conta'}
                onPress={handleSubmit}
                disabled={!nome || !email || !senha || !confirmarSenha}
                loading={loading}
                style={styles.button}
              />

              <ThemedText type="small" themeColor="textSecondary" style={styles.termos}>
                Ao criar uma conta, você concorda com nossos{' '}
                <ThemedText
                  type="small"
                  themeColor="text"
                  style={styles.termosLink}
                  onPress={() => router.push('/termos')}>
                  Termos de Uso
                </ThemedText>{' '}
                e nossa{' '}
                <ThemedText
                  type="small"
                  themeColor="text"
                  style={styles.termosLink}
                  onPress={() => router.push('/privacidade')}>
                  Política de Privacidade
                </ThemedText>
                .
              </ThemedText>
            </Card>

            <ThemedView style={styles.divider}>
              <ThemedView style={[styles.dividerLine, { backgroundColor: theme.border }]} />
              <ThemedText type="small" themeColor="textTertiary">
                ou
              </ThemedText>
              <ThemedView style={[styles.dividerLine, { backgroundColor: theme.border }]} />
            </ThemedView>

            <GoogleButton
              title={loadingGoogle ? 'Redirecionando...' : 'Continuar com Google'}
              onPress={handleGoogle}
              loading={loadingGoogle}
            />

            <Link href="/login" style={styles.link}>
              <ThemedText type="link" themeColor="textSecondary">
                Já tem conta? <ThemedText type="linkPrimary">Entrar</ThemedText>
              </ThemedText>
            </Link>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  keyboardAvoiding: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
  },
  header: {
    gap: Spacing.half,
    marginBottom: Spacing.five,
  },
  logo: { height: 32, width: 128 },
  card: {
    gap: Spacing.three,
  },
  field: {
    gap: Spacing.one,
  },
  input: {
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
  passwordRow: {
    justifyContent: 'center',
  },
  inputPassword: {
    paddingRight: Spacing.five,
  },
  togglePassword: {
    position: 'absolute',
    right: Spacing.three,
    padding: Spacing.one,
  },
  erro: {
    marginTop: -Spacing.one,
  },
  termos: {
    marginTop: Spacing.one,
  },
  termosLink: {
    textDecorationLine: 'underline',
  },
  button: {
    marginTop: Spacing.one,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    marginTop: Spacing.four,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  link: {
    alignSelf: 'center',
    marginTop: Spacing.four,
  },
});
