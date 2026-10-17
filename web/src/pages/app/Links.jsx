import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { fcfa, timeAgo } from '../../lib/format.js';
import { Bolt, CopyButton, Empty, Field, Icon, Logo, Modal, QR, Spinner, useToast } from '../../components/ui.jsx';

const waText = (desc, amount, url) =>
  `Bonjour ! Voici le lien pour régler « ${desc} »${amount ? ` (${fcfa(amount)})` : ''} en Bitcoin, depuis n'importe quel pays : ${url}`;

export default function Links() {
  const { merchant } = useAuth();
  const [links, setLinks] = useState(null);
  const [poster, setPoster] = useState(false);
  const [qrFor, setQrFor] = useState(null);
  const toast = useToast();
  const publicUrl = `${location.origin}/@${merchant.username}`;

  const load = useCallback(async () => setLinks((await api('/v1/payment-links')).data), []);
  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="page">
      <h1 className="page-title">Liens & QR</h1>

      <div className="grid-2">
        <section className="panel">
          <h2>Ma page de paiement</h2>
          <p className="muted small">Le client choisit le montant en FCFA et paie. Idéal en bio Instagram, sur WhatsApp ou imprimé au comptoir.</p>
          <div className="link-box">
            <span className="mono ellipsis">{publicUrl.replace(/^https?:\/\//, '')}</span>
            <CopyButton text={publicUrl} className="btn ghost sm" />
          </div>
          <div className="link-box">
            <span className="mono ellipsis">
              <Bolt size={14} /> {merchant.lightning_address}
            </span>
            <CopyButton text={merchant.lightning_address} className="btn ghost sm" />
          </div>
          <div className="row wrap">
            <a className="btn whatsapp sm" target="_blank" rel="noreferrer" href={`https://wa.me/?text=${encodeURIComponent(`Payez ${merchant.name} en Bitcoin depuis n'importe quel pays : ${publicUrl}`)}`}>
              WhatsApp
            </a>
            <a className="btn ghost sm" href={publicUrl} target="_blank" rel="noreferrer">
              <Icon name="external" size={16} /> Ouvrir
            </a>
            <button className="btn primary sm" onClick={() => setPoster(true)}>
              Affiche QR à imprimer
            </button>
          </div>
        </section>

        <NewLink
          onCreated={(l) => {
            toast('Lien créé');
            setLinks((x) => [l, ...(x || [])]);
          }}
        />
      </div>

      <section className="panel flush">
        <div className="panel-head padded">
          <h2>Liens de paiement</h2>
        </div>
        {!links ? (
          <Spinner />
        ) : links.length === 0 ? (
          <Empty icon="link" title="Aucun lien">Créez un lien à montant fixe pour un article ou une facture.</Empty>
        ) : (
          <ul className="tx-list padded">
            {links.map((l) => (
              <li key={l.id} className={l.active ? '' : 'inactive'}>
                <span className="tx-icon">
                  <Icon name="link" size={18} />
                </span>
                <div className="tx-main">
                  <strong>{l.description}</strong>
                  <span className="muted small">
                    {fcfa(l.amount)} · {l.uses} ouverture{l.uses > 1 ? 's' : ''} · {timeAgo(l.created_at)}
                    {!l.active && ' · désactivé'}
                  </span>
                </div>
                <div className="row">
                  <button className="icon-btn" title="QR code" aria-label="QR code" onClick={() => setQrFor(l)}>
                    <Icon name="pos" size={18} />
                  </button>
                  <CopyButton text={l.url} label="" className="icon-btn" />
                  <a className="btn whatsapp sm" target="_blank" rel="noreferrer" href={`https://wa.me/?text=${encodeURIComponent(waText(l.description, l.amount, l.url))}`}>
                    WhatsApp
                  </a>
                  <button
                    className="btn link sm"
                    onClick={async () => {
                      const u = await api(`/v1/payment-links/${l.id}`, { method: 'PATCH', body: { active: !l.active } });
                      setLinks((x) => x.map((y) => (y.id === u.id ? u : y)));
                    }}
                  >
                    {l.active ? 'Désactiver' : 'Réactiver'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {poster && (
        <Modal title="Affiche pour le comptoir" onClose={() => setPoster(false)}>
          <div className="poster" id="poster">
            <Logo />
            <h2>{merchant.name}</h2>
            <p>Payez en Bitcoin, d'où que vous soyez</p>
            <div className="poster-qr">
              <QR value={publicUrl} size={260} className="qr" />
            </div>
            <strong className="mono">{merchant.lightning_address}</strong>
            <span>Scannez le code, entrez le montant en FCFA et validez.</span>
          </div>
          <button className="btn primary wide" onClick={() => window.print()}>
            Imprimer
          </button>
        </Modal>
      )}
      {qrFor && (
        <Modal title={qrFor.description} onClose={() => setQrFor(null)}>
          <div className="center stack">
            <div className="qr-wrap">
              <QR value={qrFor.url} size={240} />
            </div>
            <strong>{fcfa(qrFor.amount)}</strong>
            <span className="mono small muted">{qrFor.url}</span>
          </div>
        </Modal>
      )}
    </div>
  );
}

function NewLink({ onCreated }) {
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <section className="panel">
      <h2>Nouveau lien à montant fixe</h2>
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          try {
            onCreated(await api('/v1/payment-links', { method: 'POST', body: { amount: Number(amount), description } }));
            setAmount('');
            setDescription('');
          } catch (err) {
            setError(err.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Article ou motif">
          <input required maxLength={120} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Grand boubou brodé sur mesure" />
        </Field>
        <Field label="Montant">
          <div className="input-suffix">
            <input type="number" inputMode="numeric" min="100" required value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="15 000" />
            <span>FCFA</span>
          </div>
        </Field>
        {error && <p className="form-error">{error}</p>}
        <button className="btn primary" disabled={busy}>
          <Icon name="plus" size={18} /> Créer le lien
        </button>
      </form>
    </section>
  );
}
