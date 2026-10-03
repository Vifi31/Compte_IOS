# Journal des modifications

## 1.4.8 — 2026-10-03
- Publication GitHub : noms de personnes et organismes personnels retirés des règles par défaut (le paramétrage existant est conservé)
- Virements internes : le nom du titulaire est lu dans l’en-tête des relevés au lieu d’être codé en dur
- Build MSI : les fichiers temporaires de makecab ne polluent plus la racine du projet

## 1.4.7 — 2026-10-03
- Ollama : l’erreur 404 venait d’un modèle non installé — message explicite (modèles installés, commande de téléchargement) à la place du code 404
- Paramètres IA : détection d’Ollama / LM Studio, liste des modèles installés, téléchargement d’un modèle avec progression, alerte si le modèle configuré est absent
- Ollama : modèle par défaut llama3.2:3b, résolution des noms sans étiquette (llama3.1 → llama3.1:8b), premier modèle installé utilisé si aucun choix, adresse normalisée, erreurs de connexion lisibles

## 1.4.6 — 2026-10-03
- Création de catégorie : 302 icônes classées par thème (onglets) et effet loupe au survol, aussi pour les menus
- Paramétrage IA : 9 fournisseurs gratuits (Gemini, Groq, OpenRouter, Mistral, Cerebras, GitHub Models, Hugging Face, Ollama, LM Studio) avec modèles conseillés et liens vers les clés

## 1.4.5 — 2026-10-02
- Listes déroulantes de catégories triées par ordre alphabétique (par groupe : dépenses, revenus, virements)
- Documentation : ascenseur dans le sommaire (hauteur limitée à la fenêtre)

## 1.4.4 — 2026-10-02
- Versions : chaque version mémorise et affiche le prompt utilisé (lié au journal des prompts, modifiable, présent dans l’export PDF)
- Documentation : plan calqué sur la barre latérale (ordre, libellés, menus créés et déplacements) avec numérotation hiérarchique
- PDF de la documentation : table des matières à deux niveaux (chapitres et sections) avec liens et numéros de page

## 1.4.3 — 2026-10-02
- Boutons d’export PDF plus visibles (rouge/orange)
- PDF de la documentation : table des matières cliquable avec numéros de page, chapitres numérotés, pagination
- Affichage des menus : renommer libellés et icônes, déplacer une entrée d’un menu à l’autre, créer/supprimer des menus

## 1.4.2 — 2026-10-02
- Exports PDF : suppression des pages blanches en fin de document (le pied de page créait des pages supplémentaires) ; numérotation des pages corrigée

## 1.4.1 — 2026-10-02
- Pouvoir exporter en PDF, les prompts, les versions et la documentation
- Faire de même avec licence

## 1.4.0 — 2026-10-02
- Exports PDF : journal des prompts, versions, documentation, licence et manifeste
- Administration › Manifeste : identité, empreintes SHA-256, vérification d’intégrité (MANIFEST.json)
- Administration › Modèle : export/import d’un paramétrage réutilisable sans données personnelles

## 1.3.0 — 2026-10-02
- Administration › Prompt : journal modifiable de tous les prompts (demandes et envois IA) et modèles d’analyse
- Administration › Licence : copyright, licence de diffusion, licence d’utilisation avec acceptation, composants tiers
- Nouveau menu Analyse : analyse IA (Anthropic, compatible OpenAI, Ollama) ou locale des dépenses et revenus sur une période, export PDF

## 1.2.0 — 2026-10-02
- Installeur Windows MSI (installation par utilisateur, Node.js embarqué, raccourcis, mise à jour et désinstallation propres)
- Données séparées du programme (variable COMPTES_HOME) ; ports configurables (COMPTES_PORT) ; routes /api/ping et /api/shutdown

## 1.1.4 — 2026-10-02
- Niveaux d’importance des versions : mineur (+0.0.1), intermédiaire (+0.1.0), majeur (+1.0.0)
- Modification de l’importance d’une version publiée avec recalcul de la numérotation des versions suivantes

## 1.1.3 — 2026-10-02
- Menus regroupés : Gestion Données (Catégories, Comptes, Relevés) et Administration (Sauvegardes, Versions)
- Nouvelle page Affichage des menus : afficher/masquer et réordonner entrées et groupes

## 1.1.2 — 2026-10-02
- Ajout de comptes manuels (autre banque, espèces, carte de crédit, épargne) et saisie d’opérations
- Prévisions : le curseur reste dans le champ après une saisie (Entrée ou Tab)

## 1.1.1 — 2026-10-02
- Gestion des versions : publication, journal des modifications, comparaison, retour arrière
- Relevés affichés et gérés par année, avec frise de couverture des mois
- Sauvegarde programmée : jour de la semaine et heure au choix, placée juste après la création
- Rapports PDF, sauvegardes, comparaison de deux périodes, 12 derniers mois, prévision modifiable par mois

