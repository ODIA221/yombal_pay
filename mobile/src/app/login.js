// Connexion du marchand ou du caissier, avec l'adresse du serveur modifiable (l'IP de l'ordinateur change souvent).
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api, getBaseUrl, rediscover, saveServerUrl } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Banner, Button, ErrorText, Input, Screen, T, tap, warn } from '../components/ui';
import { colors, fonts, radius } from '../theme';

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [server, setServer] = useState(getBaseUrl());
  const [editServer, setEditServer] = useState(false);
  const [health, setHealth] = useState(null);

  // url fournie = choix manuel (enregistré) ; sinon détection automatique de la passerelle
  const check = useCallback(async (url) => {
    setHealth({ state: 'checking' });
    try {
      setServer(url === undefined ? await rediscover() : await saveServerUrl(url));
      const h = await api('/v1/health', { auth: false, timeoutMs: 6000 });
      setHealth({ state: 'ok', mode: h.mode });
    } catch (e) {
      setHealth({ state: 'error', message: e.message });
    }
  }, []);
  useEffect(() => {
    const t = setTimeout(() => check(), 0);
    return () => clearTimeout(t);
  }, [check]);

  async function submit() {
    setBusy(true);
    setError('');
    try {
      await login(email.trim(), password);
    } catch (e) {
      warn();
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen style={{ flexGrow: 1, justifyContent: 'center', gap: 22 }}>
      <View style={{ gap: 14 }}>
        <View style={s.logo}>
          <Ionicons name="flash" size={30} color={colors.onBtc} />
        </View>
        <T.Title style={{ fontSize: 34 }}>
          Yombal<Text style={{ color: colors.btc }}>Pay</Text>
        </T.Title>
        <T.Body style={{ color: colors.muted, fontSize: 17 }}>Encaissez le monde entier en FCFA. Recevez sur Wave.</T.Body>
      </View>

      <View style={{ gap: 14 }}>
        <Input label="E-mail" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" placeholder="vous@boutique.sn" textContentType="username" />
        <Input label="Mot de passe" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" placeholder="••••••••" textContentType="password" onSubmitEditing={submit} returnKeyType="go" />
        <ErrorText>{error}</ErrorText>
        <Button title="Se connecter" size="lg" onPress={submit} loading={busy} disabled={!email || !password} />
        <T.Muted style={{ textAlign: 'center' }}>Caissier ? Connectez-vous avec l’e-mail créé par le propriétaire.</T.Muted>
      </View>

      <View style={s.server}>
        <Pressable onPress={() => (tap(), setEditServer(!editServer))} style={s.serverHead} accessibilityRole="button">
          <View style={[s.dot, { backgroundColor: health?.state === 'ok' ? colors.green : health?.state === 'error' ? colors.red : colors.amber }]} />
          <View style={{ flex: 1 }}>
            <Text style={s.serverLabel}>Serveur</Text>
            <Text style={s.serverUrl} numberOfLines={1}>
              {getBaseUrl()}
              {health?.state === 'ok' ? `  ·  ${health.mode === 'demo' ? 'mode démo' : 'mode réel'}` : ''}
            </Text>
          </View>
          <Ionicons name={editServer ? 'chevron-up' : 'create-outline'} size={18} color={colors.muted} />
        </Pressable>
        {health?.state === 'error' && <Banner tone="bad" icon="wifi-outline">{health.message}</Banner>}
        {editServer && (
          <View style={{ gap: 10 }}>
            <Input value={server} onChangeText={setServer} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="http://192.168.1.5:3000" hint="Détectée automatiquement. À saisir seulement si besoin (laisser vide = détection automatique)." />
            <Button title="Tester et enregistrer" variant="ghost" icon="pulse" onPress={() => check(server)} loading={health?.state === 'checking'} />
          </View>
        )}
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  logo: { width: 60, height: 60, borderRadius: 18, backgroundColor: colors.btc, alignItems: 'center', justifyContent: 'center' },
  server: { gap: 12, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: 14 },
  serverHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  serverLabel: { color: colors.muted, fontFamily: fonts.bodyBold, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 },
  serverUrl: { color: colors.text, fontFamily: fonts.bodyMedium, fontSize: 14, marginTop: 2 },
});
