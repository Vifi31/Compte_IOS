# Comptes sur Android

L'appli Android contient l'interface (`public/`) et un **moteur local** (`mobile/engine.mjs`). Ce moteur exécute
le même cœur que le serveur du PC (`lib/app.mjs`), directement sur le téléphone : il n'y a pas de serveur,
aucune connexion n'est nécessaire et les données restent sur le téléphone.

| PC (Node) | Téléphone (adaptateur dans `mobile/shims/`) |
|---|---|
| `fs` (disque) | fichiers en mémoire, recopiés dans le stockage privé de l'appli (IndexedDB) |
| `node:sqlite` | sql.js (SQLite en WebAssembly) |
| `zlib`, `crypto` | fflate, SHA-256 en JavaScript |
| HTTP (`server.mjs`) | `public/api.js` → `apiUseLocal()` : mêmes routes `/api/…` |

## Installer l'appli sur le téléphone

1. Sur le téléphone, ouvrir **github.com/Vifi31/Comptes/releases** dans Chrome, en étant connecté au compte GitHub (le dépôt est privé).
2. Télécharger `Comptes-x.y.z.apk` depuis la dernière version « Comptes x.y.z (Android) ».
3. Ouvrir le fichier. Android demande d'autoriser *Installer des applis inconnues* pour Chrome.
4. Pour une mise à jour, faire de même avec le nouvel APK : il remplace l'ancien sans toucher aux données.

## Reprendre les données du PC

1. Sur le PC : *Gestion Données › Sauvegardes*, créer une sauvegarde **Données** ou **Complète**, puis la télécharger (⬇️).
2. Mettre le fichier `.zip` sur le téléphone (Drive, e-mail, câble…).
3. Dans l'appli : *Sauvegardes › Importer*, choisir le fichier, puis **Restaurer** cette sauvegarde.

## Fabrication de l'APK (GitHub Actions)

Le fichier `.github/workflows/android.yml` construit l'APK à chaque envoi sur la branche `android` et le publie dans les Releases.
Il a besoin de deux secrets (*Settings › Secrets and variables › Actions › New repository secret*) :

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
npx cap sync android                                          # copie mobile/www dans le projet android/
```

Dans un navigateur sur le PC, `http://localhost:3210/?moteur=local` fait tourner l'interface avec le moteur local
(données du navigateur, distinctes de celles du PC) ; `?moteur=serveur` revient au serveur.
