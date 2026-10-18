// Épargne en dollars stables : objectif (Tabaski…), part de chaque vente, dépôt ponctuel, déblocage par mot de passe.
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { api } from '../lib/api';
import { useLoad } from '../lib/useLoad';
import { dateTime, fcfa, usdt } from '../lib/format';
import { Button, Card, Empty, ErrorText, Input, Loading, Row, Screen, Sheet, T, success, tap, warn } from '../components/ui';
import { colors, fonts, radius } from '../theme';

const PCTS = [0, 5, 10, 15, 20, 30];
const IDEAS = ['Tabaski', 'Rentrée scolaire', 'Stock de tissu', 'Korité'];

export default function Savings() {
  const { data: s, error, refreshing, refresh, setData } = useLoad(() => api('/v1/savings'), { every: 10000 });
  const [sheet, setSheet] = useState(null);
  if (!s) return error ? <Screen><ErrorText>{error}</ErrorText></Screen> : <Loading />;
  const g = s.goal;

  return (
    <Screen refreshing={refreshing} onRefresh={refresh} style={{ gap: 16, paddingTop: 12 }}>
      <View style={st.hero}>
        <T.Eyebrow style={{ color: colors.green }}>{g.name || 'Mon objectif'}</T.Eyebrow>
        <Text style={st.value} adjustsFontSizeToFit numberOfLines={1}>
          {fcfa(s.balance.xof)}
        </Text>
        <T.Muted>
          {usdt(s.balance.usdt)} en dollars stables{s.added_this_month_xof > 0 ? ` · +${fcfa(s.added_this_month_xof)} ce mois-ci` : ''}
        </T.Muted>
        {g.xof ? (
          <View style={{ gap: 6, marginTop: 10 }}>
            <View style={st.bar}>
              <View style={[st.barFill, { width: `${g.progress}%` }]} />
            </View>
            <T.Muted>
              {g.progress} % de {fcfa(g.xof)}
              {g.progress >= 100 ? ' : objectif atteint 🎉' : `, encore ${fcfa(Math.max(0, g.xof - s.balance.xof))}`}
            </T.Muted>
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
          <Button title="Ajouter" icon="add" onPress={() => setSheet('save')} style={{ flex: 1 }} />
          <Button title="Débloquer" icon="lock-open-outline" variant="ghost" onPress={() => setSheet('unlock')} disabled={!s.balance.micro} style={{ flex: 1 }} />
        </View>
      </View>

      <Settings s={s} onSaved={setData} />

      <Card style={{ paddingVertical: 6 }}>
        <View style={{ paddingTop: 12 }}>
          <T.H2>Mouvements</T.H2>
        </View>
        {s.history.length === 0 ? (
          <Empty icon="lock-closed-outline" title="Rien de côté pour l'instant">
            Choisissez un pourcentage : chaque vente alimentera votre objectif, sans y penser.
          </Empty>
        ) : (
          s.history.map((h, i) => (
            <Row
              key={i}
              last={i === s.history.length - 1}
              icon={h.amount > 0 ? 'arrow-down' : 'arrow-up'}
              iconColor={h.amount > 0 ? colors.green : colors.amber}
              iconBg={h.amount > 0 ? colors.greenSoft : colors.amberSoft}
              title={h.description}
              subtitle={dateTime(h.created_at)}
              right={`${h.amount > 0 ? '+' : '−'}${fcfa(Math.abs(h.xof))}`}
              rightSub={usdt(Math.abs(h.usdt))}
            />
          ))
        )}
      </Card>

      <SaveSheet visible={sheet === 'save'} onClose={() => setSheet(null)} onDone={(d) => (setData(d), setSheet(null))} />
      <UnlockSheet visible={sheet === 'unlock'} max={s.balance.xof} onClose={() => setSheet(null)} onDone={(d) => (setData(d), setSheet(null))} />
    </Screen>
  );
}

function Settings({ s, onSaved }) {
  const [name, setName] = useState(s.goal.name || '');
  const [goal, setGoal] = useState(s.goal.xof ? String(s.goal.xof) : '');
  const [pct, setPct] = useState(s.pct);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [savedKey, setSavedKey] = useState(null);
  const saved = savedKey === `${name}|${goal}|${pct}`;

  async function save() {
    setBusy(true);
    setError('');
    try {
      onSaved(await api('/v1/savings', { method: 'PATCH', body: { goal_name: name, goal_xof: goal ? Number(goal) : null, pct } }));
      success();
      setSavedKey(`${name}|${goal}|${pct}`);
    } catch (e) {
      warn();
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card style={{ gap: 14 }}>
      <T.H2>Mon objectif</T.H2>
      <View style={st.ideas}>
        {IDEAS.map((i) => (
          <Pressable key={i} onPress={() => (tap(), setName(i))} style={[st.idea, name === i && st.ideaOn]}>
            <Text style={[st.ideaText, name === i && { color: colors.green }]}>{i}</Text>
          </Pressable>
        ))}
      </View>
      <Input label="Pour quoi ?" value={name} onChangeText={setName} placeholder="Tabaski" maxLength={40} />
      <Input label="Montant visé" value={goal} onChangeText={setGoal} keyboardType="number-pad" placeholder="300 000" suffix="FCFA" />
      <View style={{ gap: 8 }}>
        <Text style={st.label}>Mettre de côté à chaque vente</Text>
        <View style={st.pcts}>
          {PCTS.map((p) => (
            <Pressable key={p} onPress={() => (tap(), setPct(p))} style={[st.pct, pct === p && st.pctOn]}>
              <Text style={[st.pctText, pct === p && { color: colors.onBtc }]}>{p} %</Text>
            </Pressable>
          ))}
        </View>
        <T.Muted>{pct > 0 ? `Sur une vente de 10 000 FCFA, ${fcfa(100 * pct)} sont mis de côté en USDT, automatiquement.` : 'Épargne automatique désactivée.'}</T.Muted>
      </View>
      <ErrorText>{error}</ErrorText>
      <Button title={saved ? 'Enregistré' : 'Enregistrer'} icon={saved ? 'checkmark' : undefined} onPress={save} loading={busy} variant={saved ? 'ghost' : 'primary'} />
    </Card>
  );
}

function SaveSheet({ visible, onClose, onDone }) {
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit() {
    setBusy(true);
    setError('');
    try {
      onDone(await api('/v1/savings/deposit', { method: 'POST', body: { amount: Number(amount) } }));
      success();
      setAmount('');
    } catch (e) {
      warn();
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet visible={visible} title="Mettre de côté" onClose={onClose}>
      <T.Muted>Pris sur votre solde USDT. S’il ne suffit pas, la différence est d’abord convertie depuis votre Bitcoin.</T.Muted>
      <Input label="Montant" value={amount} onChangeText={setAmount} keyboardType="number-pad" placeholder="5 000" suffix="FCFA" />
      <ErrorText>{error}</ErrorText>
      <Button title="Mettre de côté" icon="lock-closed" size="lg" onPress={submit} loading={busy} disabled={!amount} />
    </Sheet>
  );
}

function UnlockSheet({ visible, max, onClose, onDone }) {
  const [amount, setAmount] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit() {
    setBusy(true);
    setError('');
    try {
      onDone(await api('/v1/savings/unlock', { method: 'POST', body: { amount: amount ? Number(amount) : undefined, password } }));
      success();
      setAmount('');
      setPassword('');
    } catch (e) {
      warn();
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet visible={visible} title="Débloquer l'épargne" onClose={onClose}>
      <T.Muted>L’argent revient dans votre solde disponible, en USDT, prêt à être retiré sur Wave ou Orange Money.</T.Muted>
      <Input label="Montant" value={amount} onChangeText={setAmount} keyboardType="number-pad" placeholder={`Vide = tout (${fcfa(max)})`} suffix="FCFA" />
      <Input label="Mot de passe" value={password} onChangeText={setPassword} secureTextEntry placeholder="Obligatoire" />
      <ErrorText>{error}</ErrorText>
      <Button title="Débloquer" icon="lock-open" size="lg" onPress={submit} loading={busy} disabled={!password} />
    </Sheet>
  );
}

const st = StyleSheet.create({
  hero: { borderRadius: radius.xl, padding: 22, backgroundColor: '#0c1a12', borderWidth: 1, borderColor: 'rgba(34,197,94,0.35)', gap: 4 },
  value: { color: colors.text, fontFamily: fonts.display, fontSize: 40, letterSpacing: -1.2 },
  bar: { height: 12, borderRadius: 99, backgroundColor: colors.bg2, overflow: 'hidden', borderWidth: 1, borderColor: colors.line },
  barFill: { height: '100%', backgroundColor: colors.green, borderRadius: 99 },
  label: { color: colors.text, fontFamily: fonts.bodyBold, fontSize: 14 },
  ideas: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  idea: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 99, borderWidth: 1, borderColor: colors.line2 },
  ideaOn: { borderColor: colors.green, backgroundColor: colors.greenSoft },
  ideaText: { color: colors.text, fontFamily: fonts.bodyMedium, fontSize: 13 },
  pcts: { flexDirection: 'row', gap: 6 },
  pct: { flex: 1, minHeight: 42, borderRadius: radius.sm, backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  pctOn: { backgroundColor: colors.btc, borderColor: colors.btc },
  pctText: { color: colors.text, fontFamily: fonts.bodyBold, fontSize: 13 },
});
