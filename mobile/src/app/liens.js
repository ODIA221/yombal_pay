// Liens de paiement à montant fixe : créés en 2 secondes, partagés sur WhatsApp, activables à volonté.
import { useState } from 'react';
import { Share, Switch, View } from 'react-native';
import { api, getBaseUrl } from '../lib/api';
import { useLoad } from '../lib/useLoad';
import { fcfa } from '../lib/format';
import { Button, Card, Empty, ErrorText, Input, Loading, Row, Screen, T, success, warn } from '../components/ui';
import { colors } from '../theme';

export default function Links() {
  const { data, error, refreshing, refresh, reload } = useLoad(() => api('/v1/payment-links'));
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  // L'URL renvoyée par le serveur utilise PUBLIC_URL : on la reconstruit avec l'adresse vue par le téléphone
  const linkUrl = (l) => `${getBaseUrl()}/l/${l.slug}`;

  async function create() {
    setBusy(true);
    setFormError('');
    try {
      const l = await api('/v1/payment-links', { method: 'POST', body: { amount: Number(amount), description } });
      success();
      setAmount('');
      setDescription('');
      await reload();
      Share.share({ message: `${l.description} : ${fcfa(l.amount)}\nPayez ici : ${linkUrl(l)}` });
    } catch (e) {
      warn();
      setFormError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function toggle(l) {
    try {
      await api(`/v1/payment-links/${l.id}`, { method: 'PATCH', body: { active: !l.active } });
      reload();
    } catch (e) {
      setFormError(e.message);
    }
  }

  return (
    <Screen refreshing={refreshing} onRefresh={refresh} style={{ gap: 16, paddingTop: 12 }}>
      <Card style={{ gap: 12 }}>
        <T.H2>Nouveau lien</T.H2>
        <Input label="Montant" value={amount} onChangeText={setAmount} keyboardType="number-pad" placeholder="15 000" suffix="FCFA" />
        <Input label="Pour quoi ?" value={description} onChangeText={setDescription} placeholder="Grand boubou bazin, taille L" maxLength={120} />
        <ErrorText>{formError}</ErrorText>
        <Button title="Créer et partager" icon="logo-whatsapp" onPress={create} loading={busy} disabled={!amount} />
      </Card>

      <ErrorText>{error}</ErrorText>
      {!data ? (
        <Loading />
      ) : data.data.length === 0 ? (
        <Empty icon="link-outline" title="Aucun lien">
          Un lien à montant fixe se partage sur WhatsApp : votre client paie en un clic.
        </Empty>
      ) : (
        <Card style={{ paddingVertical: 4 }}>
          {data.data.map((l, i) => (
            <View key={l.id}>
              <Row
                last={i === data.data.length - 1}
                icon="link"
                iconColor={l.active ? colors.btc : colors.muted}
                iconBg={l.active ? colors.btcSoft : colors.card2}
                title={`${l.description} · ${fcfa(l.amount)}`}
                subtitle={`${l.uses} utilisation${l.uses > 1 ? 's' : ''} · ${l.active ? 'actif' : 'désactivé'}`}
                right={<Switch value={l.active} onValueChange={() => toggle(l)} trackColor={{ true: colors.btc, false: colors.line2 }} thumbColor="#fff" />}
                rightSub={
                  l.active ? (
                    <Button title="Partager" variant="link" size="sm" onPress={() => Share.share({ message: `${l.description} : ${fcfa(l.amount)}\nPayez ici : ${linkUrl(l)}` })} />
                  ) : undefined
                }
              />
            </View>
          ))}
        </Card>
      )}
    </Screen>
  );
}
