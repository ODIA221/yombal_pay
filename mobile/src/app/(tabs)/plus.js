// Plus : compte, adresse Lightning à partager, épargne, liens, rapprochement, serveur, déconnexion.
import { Alert, Platform, Share, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { getBaseUrl } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { Button, Card, Row, Screen, T } from '../../components/ui';
import { colors, fonts } from '../../theme';

export default function More() {
  const router = useRouter();
  const { merchant, logout } = useAuth();
  const staff = merchant?.staff;
  const publicPage = `${getBaseUrl()}/@${merchant?.username}`;

  function confirmLogout() {
    if (Platform.OS === 'web') return logout();
    Alert.alert('Se déconnecter ?', 'Vous devrez saisir à nouveau votre mot de passe.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Se déconnecter', style: 'destructive', onPress: logout },
    ]);
  }

  return (
    <Screen style={{ gap: 16 }}>
      <Card style={st.profile}>
        <View style={st.avatar}>
          <Text style={st.avatarText}>{(staff?.name || merchant?.name || '?').slice(0, 1).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <T.H2>{staff ? staff.name : merchant?.name}</T.H2>
          <T.Muted numberOfLines={1}>{staff ? `Caissier · ${merchant?.name}` : merchant?.lightning_address}</T.Muted>
        </View>
      </Card>

      {!staff && (
        <>
          <Card style={{ paddingVertical: 4 }}>
            <Row icon="lock-closed" iconColor={colors.green} iconBg={colors.greenSoft} title="Épargne" subtitle="Objectif, part de chaque vente mise de côté" onPress={() => router.push('/epargne')} />
            <Row icon="link" iconColor={colors.btc} iconBg={colors.btcSoft} title="Liens de paiement" subtitle="À montant fixe, à partager sur WhatsApp" onPress={() => router.push('/liens')} />
            <Row icon="checkmark-done" iconColor={colors.wave} iconBg="rgba(29,196,255,0.12)" title="Rapprochement comptable" subtitle="Registre vérifié opération par opération" onPress={() => router.push('/rapprochement')} last />
          </Card>

          <Card style={{ gap: 10 }}>
            <T.Eyebrow>Recevoir de la diaspora</T.Eyebrow>
            <T.Body>Votre page de paiement à montant libre, à partager avec vos clients à l’étranger.</T.Body>
            <T.Mono style={{ color: colors.btc }} selectable>
              {publicPage}
            </T.Mono>
            <Button title="Partager ma page" icon="share-social-outline" variant="ghost" onPress={() => Share.share({ message: `Payez ${merchant?.name} depuis n'importe quel pays : ${publicPage}` })} />
          </Card>
        </>
      )}

      <Card style={{ gap: 4 }}>
        <T.Eyebrow>Serveur</T.Eyebrow>
        <T.Mono>{getBaseUrl()}</T.Mono>
        <T.Muted>Pour changer d’adresse, déconnectez-vous : l’écran de connexion permet de la modifier.</T.Muted>
      </Card>

      <Button title="Se déconnecter" icon="log-out-outline" variant="danger" onPress={confirmLogout} />
      <Text style={st.version}>YombalPay mobile · Code & Chain Dakar 2026</Text>
    </Screen>
  );
}

const st = StyleSheet.create({
  profile: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { width: 52, height: 52, borderRadius: 18, backgroundColor: colors.btc, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.onBtc, fontFamily: fonts.display, fontSize: 22 },
  version: { color: colors.muted, fontFamily: fonts.body, fontSize: 12, textAlign: 'center' },
});
