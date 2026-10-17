# Comptes sur Android et iPhone

L'appli mobile (Android et iPhone) contient l'interface (`public/`) et un **moteur local** (`mobile/engine.mjs`). Ce moteur exécute
le même cœur que le serveur du PC (`lib/app.mjs`), directement sur le téléphone : il n'y a pas de serveur,
aucune connexion n'est nécessaire et les données restent sur le téléphone.

| PC (Node) | Téléphone (adaptateur dans `mobile/shims/`) |
|---|---|
| `fs` (disque) | fichiers en mémoire, recopiés dans le stockage privé de l'appli (IndexedDB) |
| `node:sqlite` | sql.js (SQLite en WebAssembly) |
| `zlib`, `crypto` | fflate, SHA-256 en JavaScript |
| HTTP (`server.mjs`) | `public/api.js` → `apiUseLocal()` : mêmes routes `/api/…` |

## Installer l'appli sur un téléphone Android

1. Sur le téléphone, ouvrir **github.com/Vifi31/Comptes/releases** dans Chrome, en étant connecté au compte GitHub (le dépôt est privé).
2. Télécharger `Comptes-x.y.z.apk` depuis la dernière version « Comptes x.y.z (Android) ».
3. Ouvrir le fichier. Android demande d'autoriser *Installer des applis inconnues* pour Chrome.
4. Pour une mise à jour, faire de même avec le nouvel APK : il remplace l'ancien sans toucher aux données.

## Installer l'appli sur un iPhone

Apple n'autorise pas l'installation d'un fichier téléchargé comme sur Android : l'appli doit être signée
par un identifiant Apple au moment de l'installation. On le fait depuis le PC avec **Sideloadly** (gratuit) :

1. Sur le PC, installer [Sideloadly](https://sideloadly.io), ainsi qu'iTunes et iCloud dans leur version téléchargée sur le site d'Apple (pas celle du Microsoft Store).
2. Télécharger `Comptes-x.y.z.ipa` depuis **github.com/Vifi31/Comptes/releases** (version « Comptes x.y.z (iPhone) »).
3. Brancher l'iPhone en USB et accepter « Faire confiance à cet ordinateur ».
4. Dans Sideloadly, glisser le fichier `.ipa`, saisir votre identifiant Apple, puis cliquer sur **Start**.
5. Sur l'iPhone :
   - *Réglages › Général › VPN et gestion de l'appareil* : faire confiance à votre identifiant Apple ;
   - iOS 16 ou plus récent : *Réglages › Confidentialité et sécurité › Mode développeur* : activer, puis redémarrer.

Durée de validité de la signature :

| Compte Apple | Validité | Renouvellement |
|---|---|---|
| Identifiant Apple gratuit | 7 jours | refaire l'étape 4 (ou activer le rafraîchissement automatique de Sideloadly, PC et iPhone sur le même Wi-Fi) ; les données sont conservées |
| Apple Developer Program (99 €/an) | 1 an | même procédure ; distribution possible par TestFlight |

Pour une mise à jour, installer le nouvel IPA de la même façon : il remplace l'ancien et garde les données.

## Reprendre les données du PC

1. Sur le PC : *Gestion Données › Sauvegardes*, créer une sauvegarde **Données** ou **Complète**, puis la télécharger (⬇️).
2. Mettre le fichier `.zip` sur le téléphone (Drive, e-mail, câble… ; sur iPhone, dans l'appli *Fichiers*).
3. Dans l'appli : *Sauvegardes › Importer*, choisir le fichier, puis **Restaurer** cette sauvegarde.

## Fabrication sur GitHub (GitHub Actions)

- `.github/workflows/android.yml` construit l'APK à chaque envoi sur la branche `android` et le publie dans les Releases (`android-vx.y.z`).
- `.github/workflows/ios.yml` construit l'IPA (non signé) sur un Mac de GitHub quand la version change dans `package.json`, ou à la demande (*Actions › Appli iPhone › Run workflow*) ; publication `ios-vx.y.z`.
  Pour un dépôt privé, une minute de Mac compte pour 10 minutes du quota gratuit de GitHub Actions.

La fabrication Android a besoin de deux secrets (*Settings › Secrets and variables › Actions › New repository secret*) :

| Secret | Contenu |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | contenu de `ANDROID_KEYSTORE_BASE64.txt` |
| `ANDROID_KEYSTORE_PASSWORD` | contenu de `ANDROID_KEYSTORE_PASSWORD.txt` |

Ces deux fichiers et la clé `comptes.jks` sont rangés hors du dépôt, dans `Documents\Comptes-signature-android`.
**Il faut conserver ce dossier.** Sans la même clé, Android refuse d'installer une mise à jour par-dessus l'appli existante.

## Développement sur le PC

```bash
npm run mobile:build                                          # moteur → public/mobile/, appli web → mobile/www/
node mobile/test-engine.mjs mobile/.essai relevé.pdf sauvegarde.zip   # essai du moteur sous Node, sans navigateur
npx cap sync                                                  # copie mobile/www dans les projets android/ et ios/
```

Dans un navigateur sur le PC, `http://localhost:3210/?moteur=local` fait tourner l'interface avec le moteur local
(données du navigateur, distinctes de celles du PC) ; `?moteur=serveur` revient au serveur.
