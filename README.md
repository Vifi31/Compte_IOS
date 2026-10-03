# Comptes

Application locale de gestion des dépenses, alimentée par les relevés PDF *La Banque Postale*.

## Utilisation

1. Déposer les relevés PDF dans `Documents/Releves/`.
2. Lancer `Comptes.bat` (ou `npm start`), puis ouvrir <http://localhost:3210>.
3. Nouveaux relevés : bouton **📥 Ajouter un relevé** (ou glisser-déposer des PDF dans la fenêtre) ; ils sont copiés dans `Documents/Releves`, contrôlés et importés. Les doublons et fichiers non reconnus sont refusés.

## Fonctionnalités

- **Tableau de bord** : dépenses/revenus, répartition par catégorie, évolution des soldes, budgets.
- **Opérations** : recherche, filtres, changement de catégorie (unitaire ou en lot), création de règles.
- **Statistiques** : dépenses mensuelles par catégorie, tableau croisé, dépenses récurrentes.
- **Catégories** : création/modification/suppression (nom, icône, couleur, budget), règles automatiques.
- **Prévisions** : budget de l'année n+1 à partir de l'année n (moyenne mensuelle ou saisonnalité, ajustement en %), montants modifiables par catégorie ou par mois, export CSV, reprise comme budgets.
- **Comparer** : deux périodes côte à côte (écarts, graphiques, hausses/baisses).
- **Rapports PDF** : synthèse, opérations détaillées, comparaison, prévision, tableau mensuel (dossier `Rapports/`).
- **Sauvegardes** : archives ZIP Données / Programme / Complète, statistiques, vérification, restauration, import, sauvegarde programmée (jour de la semaine + heure) (dossier `Sauvegardes/`).
- **Relevés** : affichage par année, frise de couverture des mois, ouverture/téléchargement/suppression des PDF.
- **Versions** (avec le prompt utilisé pour chaque version) : numéro de version, publication (mineur +0.0.1 / intermédiaire +0.1.0 / majeur +1.0.0), changement d’importance avec renumérotation, journal `CHANGELOG.md`, instantanés dans `Versions/`, comparaison et retour arrière.
- **Menus** : groupes « Gestion Données » (Catégories, Comptes, Relevés) et « Administration » (Sauvegardes, Versions, Affichage des menus) ; libellés, icônes, déplacement des entrées d'un menu à l'autre, création de menus, affichage et ordre personnalisables.
- **Analyse IA** : analyse des dépenses et revenus sur une période (Anthropic, compatible OpenAI, offres gratuites — Gemini, Groq, OpenRouter, Mistral, Cerebras, GitHub Models, Hugging Face, Ollama, LM Studio — ou analyse locale sans IA), aperçu et consentement avant envoi, historique, export PDF.
- **Prompt** : journal de tous les prompts (demandes et envois IA), modifiable ; modèles de prompt d'analyse.
- **Licence** : copyright, licence de diffusion, licence d'utilisation à accepter, composants tiers.
- **Manifeste** : identité du programme, empreintes SHA-256 des fichiers, vérification d'intégrité (`MANIFEST.json`).
- **Modèle** : export/import d'un paramétrage réutilisable sans données personnelles.
- **Exports PDF** (boutons rouge/orange) des pages Prompt, Versions, Documentation (avec table des matières cliquable et pagination), Licence et Manifeste.
- **Documentation** : mode d'emploi intégré, structuré comme la barre latérale (chapitres = menus, sections = entrées, ordre et libellés actuels), PDF avec table des matières à deux niveaux.
- **Comptes** : ajout de comptes manuels (autre banque, espèces, carte) avec saisie d’opérations ; soldes et courbe d'évolution de chaque compte (courants et épargne).

Les virements entre vos propres comptes sont classés « Virements internes » et exclus des statistiques.
Catégories, règles et corrections manuelles sont enregistrées dans `data/store.json`.
Chaque relevé est vérifié (totaux débit/crédit et soldes) à l'import.

## Installation Windows (MSI)

```
powershell -ExecutionPolicy Bypass -File installer\build-msi.ps1
```

Produit `dist\Comptes-<version>.msi` : installation par utilisateur (sans droits administrateur), Node.js embarqué,
raccourcis Démarrer/Bureau, mise à jour par-dessus l'ancienne version. Les données de l'utilisateur sont dans
`Documents\Comptes` (variable `COMPTES_HOME`), le port peut être changé avec `COMPTES_PORT`.
Le MSI n'est pas signé : SmartScreen peut demander une confirmation.
