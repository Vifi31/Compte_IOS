# Journal des modifications

## 2.7.2 — 2026-10-17
- Préparation de l’appli mobile : tous les appels et liens vers l’API passent par un point d’accès unique (public/api.js)

## 2.7.1 — 2026-10-14
- Base de données : graphiques de volume et prévision à 12 mois

## 2.7.0 — 2026-10-14
- Base de données SQLite pour le stockage des informations (migration automatique de store.json), page d’administration

## 2.6.6 — 2026-10-13
- Plan d’actions : pièces jointes sur chaque action

## 2.6.5 — 2026-10-13
- Plan d’actions : « À traiter en priorité » en haut, pleine largeur

## 2.6.4 — 2026-10-13
- Plan d’actions : tâches regroupées en enchaînements selon les dépendances, dates et recalage par enchaînement

## 2.6.3 — 2026-10-13
- Plan d’actions : dépendances tracées en rails colorés dans chaque phase, mises à jour automatiquement

## 2.6.2 — 2026-10-13
- Plan d’actions : phases en haut de l’écran, navigation par phase, retour sur la phase modifiée

## 2.6.1 — 2026-10-13
- Plan d’actions : ajout d’une tâche directement dans chaque phase

## 2.6.0 — 2026-10-13
- Plan d’actions : phases gérables, catalogue et modèles de tâches, conditions d’application, édition complète

## 2.5.0 — 2026-10-10
- Fiche du bien : 14 critères d’affinage de l’estimation (quartier, bruit, vue, copropriété, prestations…)

## 2.4.18 — 2026-10-10
- Documents : sélection sans réaffichage de la page, case d’en-tête, sélection limitée aux lignes filtrées

## 2.4.17 — 2026-10-10
- Gestion documentaire : parties de l’écran pliables, état mémorisé

## 2.4.16 — 2026-10-10
- Gestion documentaire : bloc visible de gestion des catégories (renommer, icône, ajouter, supprimer)

## 2.4.15 — 2026-10-10
- Fiche du bien : revenus intégrés aux opérations rattachées ; coût net, rendement brut/net et cash-flow

## 2.4.14 — 2026-10-10
- Estimation : année en cours interrogée (DVF 2026 pas encore publié), nouvelle tentative automatique

## 2.4.13 — 2026-10-10
- Estimation : rayon de surface 0 %, 5 %, 10 %, 15 %

## 2.4.12 — 2026-10-10
- Statistiques des biens : revenus locatifs, résultat net et cumul par période, par bien et dans les PDF

## 2.4.11 — 2026-10-10
- Investissement locatif : catégories de revenus rattachées au bien, revenus, rendement réel et résultat net

## 2.4.10 — 2026-10-10
- Estimation : localisation du bien, estimations par rayon (300 m à 5 km) et affinage au quartier

## 2.4.9 — 2026-10-10
- Gestion documentaire : bibliothèque, documents non affectés, affectation à un bien, qualification, sélection et actions groupées, catégories

## 2.4.8 — 2026-10-10
- Biens : corpus documentaire (index plein texte des PDF) ; tri, filtre et nombre de lignes sur tous les tableaux des biens et des dépenses

## 2.4.7 — 2026-10-10
- Tableaux : tri et filtre par colonne, nombre de lignes affichées

## 2.4.6 — 2026-10-10
- Documents du bien : correction du changement de nature ; libellés de nature modifiables

## 2.4.5 — 2026-10-10
- Fiche du bien : correction de la carte des opérations rattachées (variable manquante)

## 2.4.4 — 2026-10-10
- Gestion de bien : catégories des opérations mémorisées, lignes de dépenses sélectionnables, exclues ou supprimées

## 2.4.3 — 2026-10-09
- Biens : correction du rattachement manuel des opérations bancaires (identifiants de 44 caractères rejetés)

## 2.4.2 — 2026-10-09
- Import PDF : mode apprentissage (montant, fonds travaux, libellé) avec règles mémorisées et gérées

## 2.4.1 — 2026-10-09
- Nouveau menu « Gestion de bien Immobiliers » : multi-biens, charges, appels de fonds, travaux, PDF avec analyse IA, registre et statistiques des dépenses, estimation mini/maxi DVF

## 2.4.0 — 2026-10-09
- Suppression du menu et du module Bien Immobiliers (pages, API, documentation). Les données ne sont pas effacées.

## 2.3.1 — 2026-10-09
- Fiche du bien : suppression multiple de documents ; import PDF : quote-part prioritaire

## 2.3.0 — 2026-10-09
- Biens immobiliers : nouveau registre des dépenses (charges, appels de fonds, travaux) avec cumuls par période, import PDF/IA et analyse

## 2.2.5 — 2026-10-09
- Import PDF : ligne proposée même sans détection ; Dépenses et analyses : dépenses importées + analyse locale/IA

## 2.2.4 — 2026-10-09
- Estimation : rayon de surface 0 % par défaut ; import PDF : IA cochée par défaut

## 2.2.3 — 2026-10-09
- Import PDF : seul « Le montant de votre appel » est repris quand il est présent

## 2.2.2 — 2026-10-09
- Import PDF : quote-part des charges ; Estimation du bien : page de nouveau opérationnelle (recherche des ventes DVF)

## 2.2.1 — 2026-10-09
- Import PDF : prix TTC du devis ou de la facture repéré en priorité (HT + TVA en secours)

## 2.2.0 — 2026-10-09
- Biens immobiliers : import de PDF (charges, appels de fonds, travaux) avec analyse automatique et validation avant ajout

## 2.1.6 — 2026-10-07
- Filtre de période : choix d'une année entière existante (Année 2025, Année 2024…) en plus des mois, des 3/6/12 derniers mois et de l'année en cours ; valable pour Catégories, tableau de bord, opérations, statistiques, rapports

## 2.1.5 — 2026-10-06
- Barre latérale : le défilement est conservé d'un clic à l'autre et l'entrée active reste visible (les entrées du menu Administration, dont Sauvegardes, ne disparaissent plus hors de l'écran)

## 2.1.4 — 2026-10-05
- PDF : le tableau « Planning : fonds disponibles et financement » tient sur une page ; plus aucun titre orphelin (le contenu qui suit un titre reste sur la même page) ; en-têtes de colonnes sur deux lignes ; suppression d'une page blanche en fin de dossier

## 2.1.3 — 2026-10-05
- Export PDF de la documentation : plus de saut de page juste après un titre de chapitre ou de section (le titre accompagne son contenu, image comprise)

## 2.1.2 — 2026-10-05
- Dossier PDF « Planning et simulation » : ajout des graphiques « Épargne, prêts et relais dans le temps » et « Calendrier du projet » (avec « Financement de chaque échéance »)

## 2.1.1 — 2026-10-05
- PDF du plan d'actions : chaque phase (titre + tableau) et le tableau des contraintes ne sont plus coupés entre deux pages quand ils tiennent sur une page

## 2.1.0 — 2026-10-05
- Documentation : mode d'emploi illustré (28 copies d'écran, parcours en 5 étapes, images dans l'export PDF) ; nouveau sous-menu Administration › Documentation technique (schémas d'architecture, flux, import, données, moteur immobilier, sauvegardes, PDF, IA, déploiement ; chiffres calculés ; export PDF) ; correctif : texte « null » dans la liste des rapports

## 2.0.6 — 2026-10-04
- Plan d'actions : dépendances entre tâches avec délais avant/après et durées, contraintes affichées (puces, alertes, recalage automatique des dates), diagramme de Gantt avec flèches de dépendance, intégrés au PDF (Gantt + tableau des contraintes)

## 2.0.5 — 2026-10-04
- PDF du plan d'actions : indicateurs, points de vigilance, graphiques (répartition, avancement par phase, échéances par mois), plan détaillé par phase coloré ; tableaux PDF : texte long sur plusieurs lignes sans chevauchement ; barres empilées

## 2.0.4 — 2026-10-04
- Immobilier : Analyse IA, Plan d'actions et Suivi redessinés avec couleurs et graphiques (jauge de santé, anneaux, barres, courbes, tuiles, pastilles d'échéance) ; correction des couleurs personnalisées des cartes

## 2.0.3 — 2026-10-04
- Immobilier : intérêts de l'épargne calculés par quinzaine échue et crédités le 31 décembre ; Paramètres : Le projet/Frais annexes et Appels de fonds/Épargne dédiée côte à côte, cartes colorées et compactes ; Planning : colonnes colorées et compactes, graphiques 2 par 2 ; Plan d'actions : ajout rapide de tâches intégrées au plan et au suivi

## 2.0.2 — 2026-10-04
- Rapports PDF : liste triable par colonne, recherche, sélection multiple (téléchargement ZIP, suppression), renommage
- PDF : mise en page soignée (bandeau dégradé, KPI colorés, tableaux, pieds de page) et encadrés « Points de vigilance » dans les rapports, analyses et dossier VEFA

## 2.0.1 — 2026-10-04
- Tous les PDF : fenêtre d'options (portrait/paysage, A4/A3, avec ou sans graphiques), choix mémorisés

## 2.0.0 — 2026-10-04
- Mise en place du projet Immobilier en VEFA
- Validation des données et du suivi VEFA
- Analyse IA est en français
- Validation de la 2.0.0

## 1.7.2 — 2026-10-04
- Analyse IA VEFA en français : Ollama utilise une fenêtre de contexte adaptée à la taille du prompt (les consignes n'étaient plus tronquées), délai d'attente porté à 30 min sans coupure à 5 min, données plus compactes, rappel de la langue après les données

## 1.7.1 — 2026-10-03
- Analyse IA du projet VEFA : réponse exigée intégralement en français (consigne renforcée)

## 1.7.0 — 2026-10-03
- Immobilier : nouveau sous-menu Analyse IA (faisabilité, prêt relais, risques, plan d'actions), aperçu de l'envoi, analyse locale sans IA, export PDF, historique

## 1.6.3 — 2026-10-03
- Immobilier : opérations des Paramètres triées par date décroissante
- Planning : épargne mensuelle dédiée ajoutée à l'épargne disponible, détail par ligne (reprise + épargne mensuelle ± intérêts = épargne avant), option d'affichage de chaque versement, date de fin d'épargne mensuelle, PDF mis à jour

## 1.6.2 — 2026-10-03
- Immobilier : la page Projet VEFA ne garde que le bandeau récapitulatif (indicateurs, verdict relais, synthèse en lecture seule, points d’attention)
- Nouveau sous-menu Immobilier › Paramètres : toutes les zones de saisie du projet (projet, frais, appels de fonds, épargne, financements, prêt relais, fonds supplémentaires, réinitialisation)

## 1.6.1 — 2026-10-03
- Immobilier : dans les tableaux, plus de recalcul à chaque champ — la modification est enregistrée aussitôt et le calcul attend que la ligne soit complète (sortie de la ligne), ligne en cours surlignée

## 1.6.0 — 2026-10-03
- Nouveau menu Immobilier : gestion d’une acquisition en VEFA (projet, frais, appels de fonds, épargne, financements externes, prêt relais de 24 mois, fonds supplémentaires)
- Planning : fonds disponibles à chaque appel, décision et montants de déblocage du prêt relais, alertes ; simulation « et si » ; 4 graphiques de simulation et de suivi
- Suivi réel/prévu des appels et de l’épargne, plan d’actions généré sur la durée du projet, dossier PDF

## 1.5.0 — 2026-10-03
- Analyse › mode Pluriannuelle : grandes lignes de toutes les années présentes (synthèse par année, évolution des postes, patrimoine, saisonnalité)
- Années partielles comparées sur les moyennes mensuelles des mois complets ; modèle de prompt pluriannuel modifiable ; analyse IA ou locale ; export PDF

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

