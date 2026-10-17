# Kit Demo Day : YombalPay

Ce que le jury regarde (curriculum Code & Chain) : **un vrai problème, une démo qui marche, un usage clair de l'API Bitnob, une équipe crédible.** Chaque minute du pitch sert l'un de ces quatre critères.

**Le message à faire retenir, en une phrase :**
> Avec YombalPay, n'importe quel commerçant sénégalais encaisse le monde entier en FCFA et reçoit sur Wave, sans jamais toucher à la crypto.

## Pitch de 5 minutes

Les phrases entre guillemets se disent telles quelles. Le reste, ce sont les gestes.

### 1. Accroche (0:00 à 0:25) : une histoire, pas une question
« 45 000 francs CFA. C'est le prix d'un grand boubou cousu main chez Aïssatou, à Dakar. Fatou vit à Paris. Elle veut l'acheter ce soir, pour la Tabaski. Et elle ne peut pas. »

*Pause. Laissez la phrase tomber.*

### 2. Le problème (0:25 à 1:05)
« Pourquoi ? Fatou n'a pas de compte Wave sénégalais. Sa carte bancaire n'est pas acceptée par la petite boutique. Et les passerelles Bitcoin qui existent ne versent pas un franc CFA. Résultat : la vente ne se fait pas.

Et ce n'est pas un cas isolé. La diaspora sénégalaise a envoyé plus de 2 200 milliards de francs CFA au pays en 2024, près de 12 % du PIB. Cet argent passe par des agences et des transferts. Mais quand un client à l'étranger veut payer directement un commerçant, il n'y a pas de bouton.

Et même si Aïssatou recevait du Bitcoin, elle aurait deux peurs : que sa valeur baisse, et de ne pas savoir le transformer en argent pour payer son tissu. »

### 3. La solution (1:05 à 1:35)
« YombalPay, c'est la caisse des commerçants d'Afrique de l'Ouest pour encaisser le monde entier. Aïssatou affiche son prix en FCFA. Fatou paie depuis Paris, en Bitcoin Lightning ou en dollars numériques, l'USDT. Aïssatou voit des francs CFA, protège sa valeur en dollars stables, et retire sur Wave. Elle n'a jamais besoin de savoir ce qu'est le Bitcoin.

Tout passe par Bitnob : Lightning pour encaisser, Stablecoins pour l'USDT, Trading pour se protéger de la volatilité, Payouts pour retirer sur Wave et Orange Money. »

*En prononçant les quatre produits Bitnob, comptez-les sur vos doigts : c'est le critère « usage de l'API Bitnob ».*

### 4. La démo (1:35 à 3:35) : voir la chorégraphie plus bas

### 5. Pourquoi on peut nous faire confiance (3:35 à 4:20)
« Ce n'est pas une maquette. C'est un vrai système de paiement.

Le statut "payé" ne vient jamais du navigateur : il faut un webhook Bitnob signé, puis une deuxième vérification auprès de l'API Bitnob. Le solde est un vrai registre comptable, qu'on ne modifie jamais, on ajoute seulement des écritures. On a lancé cinq retraits en même temps sur le même solde : aucune double dépense. Un retrait exige le mot de passe, jamais une simple clé API. Et 91 tests automatiques vérifient tout ça à chaque modification. »

### 6. Le modèle et la suite (4:20 à 5:00)
« Notre modèle : 1 % par paiement. Moins cher qu'une carte bancaire ou qu'un transfert classique, et le client voit sur sa page combien de frais il évite.

Déjà prêt : caisse mobile, liens de paiement WhatsApp, adresse Lightning, pages en anglais pour la diaspora, comptes caissiers, épargne en dollars stables pour la Tabaski, reçus vérifiables, et un plugin WooCommerce pour les boutiques en ligne.

Prochaines étapes : un pilote avec des commerçants de Dakar, la vérification d'identité des marchands, puis l'interface en wolof.

Ce soir, Fatou peut acheter son boubou. YombalPay : parce que se faire payer doit être *yombal*, simple pour tout le monde. »

## Chorégraphie de la démo (2 minutes, 5 temps)

**Règle d'or : 5 moments forts, pas 10.** Un jury retient trois images. Les nôtres : la caisse qui sonne, la barre d'épargne qui avance, l'argent qui arrive sur Wave.

**Avant de monter sur scène :** trois onglets ouverts et connectés : l'espace marchand (`/app`) sur l'écran projeté, la caisse (`/app/caisse`) sur le téléphone, une page de paiement prête. Son du téléphone à fond.

Choisissez **la variante A ou B** selon ce que `./run.sh check` affiche le jour J. Ne mélangez pas les deux.

### Variante A : clés Bitnob sandbox fonctionnelles (le meilleur scénario)

1. **La caisse (20 s)** : « Aïssatou est dans sa boutique. » Sur le téléphone, tapez **500**, puis **Encaisser**. Le QR s'affiche.
2. **Le jury paie (30 s)** : tendez le téléphone à un membre du jury avec un portefeuille Lightning sandbox. Si personne n'en a, payez avec le vôtre. La caisse **sonne**, le grand ✓ vert apparaît, et le solde se met à jour sur l'écran projeté. « Ce paiement vient de passer par Bitnob Lightning, confirmé par un webhook signé. » *C'est le moment le plus fort : taisez-vous pendant que ça sonne.*
3. **USDT (20 s)** : sur la page de paiement, onglet **USDT ou USDC**, réseau Tron. « Fatou a des dollars numériques sur Binance ? Bitnob crée une adresse pour ce seul paiement. »
4. **L'épargne Tabaski (25 s)** : ouvrez **Épargne**. « Aïssatou met 10 % de chaque vente de côté pour la Tabaski, en dollars stables. Le Bitcoin peut baisser, son épargne non. » Montrez la barre de progression.
5. **Retrait Wave (25 s)** : **Portefeuille → Retirer vers Wave**, 2 000 FCFA, mot de passe. Le statut passe à « Reçu ». « Payouts Bitnob. La boucle est bouclée : du monde entier jusqu'au téléphone d'Aïssatou. »

### Variante B : pas encore de clés sandbox (mode démo)

Même déroulé, mais **dites-le dès le début de la démo**, une seule fois, calmement :
« Notre organisation Bitnob est en cours de validation : ce que vous allez voir tourne en mode démonstration. Le bouton "Simuler" envoie exactement le même webhook que Bitnob, par le même code. »

Puis :
1. **La caisse** : 500 FCFA, **Encaisser**.
2. **Simuler le paiement** : la caisse **sonne** et le ✓ apparaît. « Côté Aïssatou, c'est exactement ce qu'elle verra. »
3. **USDT** : onglet USDT, réseau Tron, puis **Simuler**.
4. **Épargne** et 5. **Retrait Wave** : comme dans la variante A. Le retrait est marqué « simulé ».

Pour compenser l'absence de vrai paiement, insistez sur le code : « L'intégration Bitnob est complète dans le code : signature HMAC, factures Lightning, adresses USDT, trading, payouts. Il ne manque que la validation de notre compte. » Un jury pardonne un blocage administratif, jamais une démo simulée présentée comme réelle.

### Si le temps manque (version 3 minutes)
Accroche (20 s) → problème (30 s) → solution (25 s) → démo en 3 temps : caisse qui sonne, épargne, Wave (1 min 20) → phrase de fin (25 s). Supprimez la partie « confiance » : gardez-la pour les questions.

## Les chiffres à connaître (et leurs sources)

Ne citez que ces chiffres. Si on vous en demande un autre, dites « je préfère ne pas avancer un chiffre que je n'ai pas vérifié ».

| Chiffre | Source |
|---|---|
| Plus de 2 200 milliards de FCFA envoyés par la diaspora au Sénégal en 2024 (environ 1 600 milliards en 2023), près de 12 % du PIB | BCEAO, repris par [allAfrica](https://fr.allafrica.com/stories/202512170313.html) |
| Envoyer 200 € de France vers le Sénégal coûte environ 3,5 à 5 % | Banque mondiale, Remittance Prices Worldwide ([Western Union France → Sénégal](https://remittanceprices.worldbank.org/node/382753) ; [comparatif Les Afriques](https://lesafriques.com/2026/09/envoyer-argent-senegal-comparatif-frais-taux-2026/)) |
| Vers l'Afrique subsaharienne en moyenne : environ 8,8 % (début 2025), la région la plus chère du monde | Banque mondiale, repris par la [Banque de réserve sud-africaine](https://www.resbank.co.za/content/dam/sarb/what-we-do/payments-and-settlements/cross-border-payments-conference/documents/paper-cost-patterns-remittance.pdf) |
| Commission YombalPay : 1 % | Notre modèle |

Le compteur « frais évités » de l'application compare à **5 %** (réglable avec `SAVINGS_BENCHMARK_BPS`), le haut de la fourchette du couloir France → Sénégal, et non à la moyenne régionale. C'est volontaire : ne gonflez pas ce chiffre à l'oral.

## Réponses prêtes pour le jury

**« Le Sénégal reçoit déjà des transferts à 3-5 %. Pourquoi vous ? »**
« Un transfert envoie de l'argent à une personne. Nous, on permet d'acheter directement chez un commerçant, depuis n'importe quel pays, en quelques secondes, sans agence. Le commerçant reçoit en FCFA, avec un reçu, et peut épargner en dollars stables. Ce n'est pas le même usage. »

**« Pourquoi Bitcoin et pas Wave ? »**
« On ne remplace pas Wave, on le complète : Aïssatou retire sur Wave. Mais un client à Paris ou à New York n'a généralement pas de compte Wave sénégalais. Lightning et l'USDT, si : depuis n'importe quel pays. »

**« Et la volatilité ? »**
« Le prix en FCFA est garanti 15 minutes pendant le paiement. Ensuite, le commerçant protège ce qu'il veut en USDT, à la main ou automatiquement, et il peut épargner en dollars stables. Et un client qui paie en USDT est crédité directement en USDT : aucune volatilité. »

**« Le commerçant doit-il comprendre la crypto ? »**
« Non. Il voit des francs CFA, il tape un montant, il retire sur Wave. Le mot Bitcoin n'apparaît que pour le client qui paie. »

**« C'est en mode démo ? »** (variante B)
« Oui, en attendant la validation de notre organisation Bitnob. Le code d'intégration est complet et le passage en réel, c'est remplacer le secret dans la configuration. Le bouton de simulation passe par exactement le même code que le webhook Bitnob. »

**« Le retrait mobile money est-il réel ? »**
« Il passe par les Payouts Bitnob : cotation, initialisation, finalisation. L'application vérifie si le corridor Sénégal est ouvert sur notre compte. S'il ne l'est pas, le retrait est marqué "simulé" à l'écran, on ne le cache pas. »

**« Qui détient les fonds ? Et la réglementation ? »**
« Les fonds sont sur le compte Bitnob de YombalPay. Chaque commerçant a un solde tenu dans un registre comptable, rapproché par référence. C'est le modèle des agrégateurs comme PayDunya. Avant la production : vérification d'identité des commerçants et plafonds par niveau. »

**« Comment empêchez-vous la fraude ? »**
« Un paiement n'est validé que par un webhook Bitnob signé et revérifié auprès de l'API. Un faux webhook ne peut pas créditer un solde. Les retraits passent par un verrou : cinq retraits simultanés, aucune double dépense. Un retrait exige le mot de passe, jamais une clé API. »

**« Combien de commerçants l'utilisent ? »**
Répondez honnêtement : aucun en production pour l'instant. Idéalement, faites tester l'application par un ou deux vrais commerçants avant le Demo Day : « Nous l'avons montré à [nom], qui vend [produit] au marché [nom]. Sa réaction : … ». Une vraie citation vaut plus que n'importe quelle fonctionnalité.

**« Votre modèle économique ? »**
« 1 % par paiement, prélevé automatiquement et visible dans chaque fiche de paiement. »

**« La concurrence ? »**
« PayDunya et Wave ne servent pas les clients étrangers et ne font pas de Bitcoin. BitPay et OpenNode ne versent ni FCFA ni mobile money. BTCPay demande un serveur et des compétences techniques. Personne ne combine encaissement mondial, prix en FCFA, protection en dollars et retrait Wave. »

## Les pièges à éviter

- **Trop de fonctionnalités.** Le jury ne retiendra pas la liste. Montrez cinq moments, citez le reste en une phrase.
- **Le jargon.** Dites « dollars numériques » avant « USDT », « preuve de paiement » plutôt que « preimage », « signature » plutôt que « HMAC-SHA512 ». Gardez les termes techniques pour les questions.
- **Lire ses notes.** Apprenez l'accroche et la phrase de fin par cœur. Le reste peut être naturel.
- **Parler pendant que la caisse sonne.** Le silence fait le travail.
- **Annoncer un chiffre non vérifié.** Un seul chiffre faux et le jury doute de tout le reste.

## Check-list avant de monter sur scène

- [ ] `./run.sh check` : « Secret sandbox » et que des ✅ (sinon : variante B, et le dire)
- [ ] Adresse IP du réseau de la salle ajoutée dans le tableau de bord Bitnob (sinon `IP address not whitelisted`)
- [ ] `DEMO_MODE=true` retiré du `.env` si vous jouez la variante A
- [ ] `DATABASE_URL` Supabase dans `.env`, `./run.sh` démarre (« Base de données : Supabase »)
- [ ] Application déployée sur Render, ou tunnel HTTPS ouvert, `PUBLIC_URL` à jour, webhook `…/webhooks/bitnob` déclaré chez Bitnob
- [ ] Corridor SN vérifié dans **Portefeuille** (sinon `PAYOUT_MODE=simulated`, et le dire)
- [ ] Compte de retrait du compte de démo remplacé par **votre** numéro Wave
- [ ] Un paiement testé de bout en bout moins d'une heure avant
- [ ] Caisse installée sur l'écran d'accueil du téléphone, son activé, téléphone en mode « ne pas déranger »
- [ ] Objectif d'épargne « Tabaski » préparé avec quelques ventes, pour que la barre ne soit pas vide
- [ ] Vidéo de secours de la démo enregistrée (en cas de panne réseau)
- [ ] Plan B réseau : `DEMO_MODE=true` avec un PostgreSQL local
- [ ] Dépôt GitHub public à jour, badge des tests au vert
- [ ] Trois répétitions chronométrées, dont une devant quelqu'un qui ne connaît pas le projet
