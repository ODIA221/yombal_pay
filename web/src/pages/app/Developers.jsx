import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { timeAgo } from '../../lib/format.js';
import { useLive } from '../../components/AppLayout.jsx';
import { Code, CopyButton, Empty, Field, Icon, Modal, Pill, useToast } from '../../components/ui.jsx';

export default function Developers() {
  const { merchant, setMerchant } = useAuth();
  const toast = useToast();
  const [keys, setKeys] = useState([]);
  const [newKey, setNewKey] = useState(null);
  const [deliveries, setDeliveries] = useState([]);
  const [secret, setSecret] = useState(null);
  const [url, setUrl] = useState(merchant.webhook_url || '');
  const [urlError, setUrlError] = useState('');
  const [bitnob, setBitnob] = useState(null);

  const load = useCallback(async () => {
    const [k, d] = await Promise.all([api('/v1/api-keys'), api('/v1/deliveries')]);
    setKeys(k.data);
    setDeliveries(d.data);
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  useLive((type) => type === 'delivery' && load());

  return (
    <div className="page">
      <h1 className="page-title">Développeurs</h1>
      <p className="muted lead-sm">Intégrez YombalPay à votre site en quelques lignes. <a href="/docs" target="_blank" rel="noreferrer">Documentation complète →</a></p>

      <div className="grid-2">
        <section className="panel">
          <div className="panel-head">
            <h2>Clés secrètes</h2>
            <button
              className="btn primary sm"
              onClick={async () => {
                const k = await api('/v1/api-keys', { method: 'POST', body: { label: `Clé ${keys.length + 1}` } });
                setNewKey(k);
                load();
              }}
            >
              <Icon name="plus" size={16} /> Nouvelle clé
            </button>
          </div>
          <p className="muted small">Côté serveur uniquement. Stockées hachées : on ne peut pas vous les réafficher.</p>
          <ul className="key-list">
            {keys.map((k) => (
              <li key={k.id}>
                <Icon name="key" size={18} />
                <div className="tx-main">
                  <strong>{k.label}</strong>
                  <span className="mono small muted">
                    {k.prefix} · {k.last_used_at ? `utilisée ${timeAgo(k.last_used_at)}` : 'jamais utilisée'}
                  </span>
                </div>
                <button
                  className="btn link sm danger"
                  onClick={async () => {
                    if (!confirm(`Révoquer « ${k.label} » ? Les intégrations qui l'utilisent cesseront de fonctionner.`)) return;
                    await api(`/v1/api-keys/${k.id}`, { method: 'DELETE' });
                    toast('Clé révoquée');
                    load();
                  }}
                >
                  Révoquer
                </button>
              </li>
            ))}
          </ul>
          <div className="keyline">
            <span className="small muted">Clé publique (bouton navigateur, création de paiement seulement)</span>
            <div className="row">
              <code className="mono small ellipsis">{merchant.publishable_key}</code>
              <CopyButton text={merchant.publishable_key} label="" className="icon-btn" />
            </div>
          </div>
        </section>

        <section className="panel">
          <h2>Webhook</h2>
          <p className="muted small">
            Nous envoyons <code>checkout.paid</code> à cette URL, signé HMAC-SHA256 (<code>X-YombalPay-Signature</code>), avec 5 nouvelles tentatives.
          </p>
          <form
            className="stack"
            onSubmit={async (e) => {
              e.preventDefault();
              setUrlError('');
              try {
                setMerchant(await api('/v1/merchant', { method: 'PATCH', body: { webhook_url: url } }));
                toast('URL de webhook enregistrée');
              } catch (err) {
                setUrlError(err.message);
              }
            }}
          >
            <Field label="URL de notification" error={urlError}>
              <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://maboutique.sn/webhooks/yombalpay" />
            </Field>
            <button className="btn ghost sm">Enregistrer</button>
          </form>
          <div className="keyline">
            <span className="small muted">Secret de signature</span>
            <div className="row">
              <code className="mono small ellipsis">{secret || 'whsec_••••••••••••••••'}</code>
              {secret ? (
                <CopyButton text={secret} label="" className="icon-btn" />
              ) : (
                <button className="btn ghost sm" onClick={async () => setSecret((await api('/v1/webhook-secret')).webhook_secret)}>
                  Afficher
                </button>
              )}
              <button
                className="btn link sm"
                onClick={async () => {
                  if (!confirm('Générer un nouveau secret ? L’ancien cessera immédiatement de fonctionner.')) return;
                  setSecret((await api('/v1/webhook-secret/rotate', { method: 'POST' })).webhook_secret);
                  toast('Nouveau secret généré');
                }}
              >
                Régénérer
              </button>
            </div>
          </div>
        </section>
      </div>

      <section className="panel">
        <h2>Notifications envoyées</h2>
        {deliveries.length === 0 ? (
          <Empty icon="refresh" title="Aucune notification">Configurez une URL de webhook puis encaissez un paiement.</Empty>
        ) : (
          <ul className="deliveries">
            {deliveries.slice(0, 15).map((d) => (
              <li key={d.id}>
                <Pill status={d.status} />
                <span className="mono small">{d.type}</span>
                <span className="muted small ellipsis">
                  {d.attempts} essai{d.attempts > 1 ? 's' : ''}
                  {d.last_status_code ? ` · HTTP ${d.last_status_code}` : d.last_error ? ` · ${d.last_error}` : ''} · {timeAgo(d.created_at)}
                </span>
                {d.status === 'failed' && (
                  <button
                    className="btn link sm"
                    onClick={async () => {
                      await api(`/v1/deliveries/${d.id}/retry`, { method: 'POST' });
                      load();
                    }}
                  >
                    Renvoyer
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Démarrage rapide</h2>
          <button
            className="btn ghost sm"
            onClick={async () => {
              try {
                setBitnob(await api('/v1/bitnob/whoami'));
              } catch (e) {
                setBitnob({ error: e.message });
              }
            }}
          >
            Tester la connexion Bitnob
          </button>
        </div>
        {bitnob && (
          <p className={`callout ${bitnob.error ? 'bad' : 'ok'}`}>
            {bitnob.error ? bitnob.error : bitnob.mode === 'demo' ? 'Mode démo : aucune clé Bitnob configurée.' : 'Connexion Bitnob OK (requête signée HMAC acceptée).'}
          </p>
        )}
        <Code lang="bash">{`curl -X POST ${location.origin}/v1/checkouts \\
  -H "Authorization: Bearer sk_…" \\
  -H "Content-Type: application/json" \\
  -d '{ "amount": 5000, "currency": "XOF", "reference": "CMD-42", "return_url": "https://maboutique.sn/merci" }'`}</Code>
        <Code lang="html">{`<script src="${location.origin}/sdk/yombalpay.js"
        data-key="${merchant.publishable_key}"
        data-amount="5000" data-reference="CMD-42"></script>`}</Code>
      </section>

      {newKey && (
        <Modal title="Nouvelle clé secrète" onClose={() => setNewKey(null)}>
          <div className="callout warn">
            <strong>Copiez-la maintenant : elle ne sera plus jamais affichée.</strong>
            <code className="secret">{newKey.key}</code>
            <CopyButton text={newKey.key} className="btn ghost sm" />
          </div>
          <button className="btn primary wide" onClick={() => setNewKey(null)}>
            J'ai copié ma clé
          </button>
        </Modal>
      )}
    </div>
  );
}
