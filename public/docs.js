'use strict';
// ============ Documentation / mode d'emploi ============
function pageDocs(v) {
  const li = (...k) => h('li', {}, ...k), ul = (...items) => h('ul', {}, items.map(i => Array.isArray(i) ? li(...i) : li(i)));
  const ol = (...items) => h('ol', {}, items.map(i => Array.isArray(i) ? li(...i) : li(i)));
  const b = t => h('b', {}, t), kbd = t => h('span', { class: 'kbd' }, t);
  const tip = (...k) => h('div', { class: 'tip' }, '💡 ', ...k), warn = (...k) => h('div', { class: 'tip warn' }, '⚠️ ', ...k);
  const link = (label, hash) => h('a', { href: '#/' + hash, class: 'doclink' }, label);

  const SECTIONS = [
    ['start', '🚀', 'Premiers pas', [
      h('p', {}, 'Comptes analyse vos relevés PDF ', b('La Banque Postale'), ' et en fait un tableau de bord : dépenses par catégorie, évolution des soldes, comparaisons et prévisions. Tout reste sur votre ordinateur.'),
      h('h4', {}, 'Lancer l’application'),
      ol(['Double-cliquez sur ', b('Comptes.bat'), ' (ou lancez ', kbd('npm start'), ' dans le dossier du projet).'], 'Ouvrez http://localhost:3210 dans votre navigateur.'),
      h('h4', {}, 'Organisation de l’écran'),
      ul(['Le ', b('menu de gauche'), ' donne accès aux pages ; le bouton ', b('📥 Ajouter un relevé'), ' et le choix du ', b('thème clair/sombre'), ' sont en bas.'],
        ['Les deux ', b('filtres en haut à droite'), ' (comptes et période : mois précis, 3, 6 ou 12 derniers mois, année en cours, toute la période) s’appliquent aux pages tableau de bord, opérations, statistiques, catégories, comptes et rapports.']),
      tip('Par défaut, seuls les ', b('comptes courants'), ' sont analysés : les livrets et plans d’épargne sont exclus des totaux. Choisissez « Tous les comptes » ou un compte précis dans le premier filtre pour changer cela.'),
    ]],
    ['import', '📥', 'Ajouter des relevés', [
      ul(['Cliquez sur ', b('📥 Ajouter un relevé'), ' dans le menu, ou sur la zone en pointillés de la page ', link('Comptes', 'accounts'), '.'],
        ['Vous pouvez aussi ', b('glisser-déposer'), ' un ou plusieurs PDF n’importe où dans la fenêtre.'],
        'Les fichiers sont copiés dans Documents/Releves, vérifiés puis importés. Une fenêtre indique le résultat de chaque fichier.'),
      h('h4', {}, 'Ce qui est refusé'),
      ul('Un fichier qui n’est pas un PDF ou n’est pas un relevé La Banque Postale.', 'Un relevé déjà présent (même sous un autre nom de fichier) : il est signalé comme doublon et ignoré.'),
      h('h4', {}, 'Contrôle automatique'),
      p2('À chaque import, les totaux débit/crédit et les soldes de chaque compte sont recalculés et comparés à ceux du relevé. Un ✅ signale que tout concorde ; un 🟠 ou ⚠️ signale un écart à vérifier.'),
      tip('Vous pouvez aussi copier vous-même les PDF dans le dossier Documents/Releves, puis cliquer sur ', b('↻ Réimporter les PDF'), ' (page Comptes). Vos catégories et corrections sont conservées.'),
    ]],
    ['dashboard', '📊', 'Tableau de bord', [
      ul([b('Indicateurs'), ' : dépenses, revenus, épargne nette (et son taux) et patrimoine total sur la période choisie.'],
        [b('Dépenses par catégorie'), ' : le graphique en anneau et la liste détaillée. Cliquez sur une catégorie pour voir ses opérations.'],
        [b('Revenus vs dépenses'), ' : barres par mois et courbe du solde mensuel.'],
        [b('Évolution des soldes'), ' : courbe jour par jour des comptes sélectionnés (avec le total).'],
        [b('Budgets mensuels'), ' : barres de progression pour les catégories où vous avez défini un budget (voir ', link('Catégories', 'categories'), ').'],
        [b('Plus grosses dépenses'), ' par commerçant ou prélèvement.']),
      p2('Les virements entre vos propres comptes ne comptent ni comme dépense ni comme revenu.'),
    ]],
    ['operations', '🧾', 'Opérations', [
      h('p', {}, 'Toutes les opérations de la période, avec leur catégorie.'),
      ul([b('Recherche'), ' : libellé, commerçant ou montant exact (ex. 49,90).'],
        [b('Filtres'), ' : catégorie, débits / crédits, virements internes (masqués par défaut), opérations « non classées ».'],
        [b('Tri'), ' : cliquez sur les en-têtes Date, Libellé ou Montant.']),
      h('h4', {}, 'Changer la catégorie'),
      ol('Cliquez sur une ligne pour ouvrir son détail (libellé complet, relevé d’origine, mode de classement).', ['Choisissez la catégorie puis ', b('Enregistrer'), ' : seule cette opération change (badge « manuel »).'],
        ['Ou cliquez sur ', b('⚡ Créer la règle'), ' : toutes les opérations contenant le texte indiqué prendront cette catégorie, y compris les futures.']),
      h('h4', {}, 'Modification en lot'),
      p2('Cochez plusieurs lignes : une barre apparaît en bas pour appliquer une catégorie à toute la sélection, ou revenir au classement automatique.'),
      tip('Le bouton ', b('❓ n non classées'), ' liste les opérations qu’aucune règle n’a reconnues : c’est le moyen le plus rapide d’améliorer le classement.'),
    ]],
    ['categories', '🏷️', 'Catégories et règles', [
      h('h4', {}, 'Gérer les catégories'),
      ul([b('＋ Nouvelle catégorie'), ' : nom, icône (plus de 300 icônes classées par thème, avec effet loupe au survol, ou emoji saisi au clavier), couleur, type et budget mensuel facultatif.'],
        [b('✏️'), ' modifie, ', b('🗑️'), ' supprime (vous choisissez où déplacer les opérations classées à la main ; les règles associées sont supprimées).'],
        ['Trois types : ', b('dépense'), ', ', b('revenu'), ', ', b('virement interne'), ' (exclu des statistiques).'],
        'Les catégories « Autres dépenses », « Autres revenus » et « Virements internes » sont fixes : elles servent de repli.'),
      h('h4', {}, 'Comment une opération est classée'),
      ol('Un choix manuel sur l’opération l’emporte toujours.', 'Les virements entre vos comptes sont reconnus automatiquement (virements internes).', 'Sinon, la première règle dont le texte figure dans le libellé s’applique. Vos règles passent avant les règles fournies.', 'À défaut : « Autres dépenses » ou « Autres revenus ».'),
      h('h4', {}, 'Règles automatiques'),
      p2('En bas de la page Catégories : ajoutez un texte à repérer (ex. LIDL), le sens (débit/crédit) et la catégorie. Vous pouvez filtrer, modifier la catégorie d’une règle ou la supprimer ; le classement est recalculé immédiatement.'),
      tip('Le budget mensuel d’une catégorie alimente les barres du tableau de bord. La page ', link('Prévisions', 'forecast'), ' peut les remplir en un clic.'),
    ]],
    ['stats', '📈', 'Statistiques', [
      ul([b('Dépenses mensuelles par catégorie'), ' : barres empilées.'],
        [b('Évolution par catégorie'), ' : choisissez les catégories à comparer en cliquant sur les pastilles.'],
        [b('Tableau croisé catégories × mois'), ' : intensité de couleur proportionnelle au montant, total, moyenne et variation du dernier mois.'],
        [b('Dépenses récurrentes'), ' : postes présents sur plusieurs mois (abonnements, prêts, assurances…) et leur total mensuel.'],
        [b('Jour de la semaine'), ' : répartition des dépenses.']),
    ]],
    ['compare', '⚖️', 'Comparer deux périodes', [
      ol(['Choisissez les mois de début et de fin de la ', b('période A'), ' et de la ', b('période B'), ' (référence).'], ['Ou utilisez un raccourci : mois contre mois précédent, trimestre contre précédent, même période l’an dernier, première moitié contre seconde.'], ['Basculez entre ', b('Totaux'), ' et ', b('Moyenne / mois'), ' si les périodes n’ont pas la même durée.']),
      p2('Vous obtenez les écarts en euros et en pourcentage (vert = favorable, rouge = défavorable), un graphique par catégorie, les dépenses cumulées jour par jour, un tableau détaillé et les plus fortes hausses/baisses par poste de dépense.'),
    ]],
    ['forecast', '🔮', 'Prévisions budgétaires', [
      h('p', {}, 'Construit le budget de l’année ', b('n+1'), ' à partir de l’année ', b('n'), ' que vous choisissez.'),
      h('h4', {}, 'Principe de calcul'),
      ul('Seuls les mois complets de l’année de référence servent de base (les mois entamés ou manquants sont ignorés).', [b('Moyenne mensuelle'), ' : chaque mois reçoit la moyenne de la catégorie.'], [b('Saisonnalité'), ' : chaque mois reprend le réalisé du même mois ; les mois sans donnée reçoivent la moyenne.'], ['Les champs ', b('Dépenses %'), ' / ', b('Revenus %'), ' appliquent une hausse ou une baisse globale (inflation, augmentation de salaire…).']),
      h('h4', {}, 'Modifier les valeurs'),
      ul([b('Par mois'), ' : modifiez directement n’importe quelle case du tableau (le curseur reste dans la case après validation, et Tab passe à la suivante) ; les cases modifiées sont entourées en violet, et le survol affiche le réalisé du même mois.'],
        [b('Par année'), ' : changez le montant annuel d’une catégorie (réparti proportionnellement sur les mois) ou son ', b('montant mensuel'), ' (appliqué à chacun des 12 mois) ; la flèche ▸ déplie le détail mensuel.'],
        [b('↺'), ' à droite d’une ligne la remet au calcul automatique ; ', b('↺ Réinitialiser'), ' efface toutes vos saisies.']),
      h('h4', {}, 'Exploiter la prévision'),
      ul([b('⬇ CSV'), ' : export lisible dans Excel.'], [b('🎯 Utiliser comme budgets'), ' : définit le budget mensuel de chaque catégorie sur la moyenne prévue.']),
      warn('Corrigez les montants exceptionnels de l’année de référence (remboursement d’impôts, gros achat, versement unique…) : ils faussent la moyenne.'),
      p2('Vos saisies sont enregistrées automatiquement, séparément pour chaque année cible et chaque choix de comptes.'),
    ]],
    ['reports', '📄', 'Rapports PDF', [
      h('p', {}, 'La page ', link('Rapports PDF', 'reports'), ' produit des documents PDF prêts à imprimer ou à partager. Ils reprennent les filtres choisis en haut de page (comptes et période).'),
      ul([b('Synthèse financière'), ' : indicateurs, dépenses par catégorie, évolution mensuelle, postes principaux, soldes.'], [b('Opérations détaillées'), ' : liste complète, triée par date ou groupée par catégorie avec sous-totaux.'], [b('Comparaison de deux périodes'), ' : reprend les périodes A et B de la page Comparer.'], [b('Prévision budgétaire'), ' : l’année suivante mois par mois, avec vos saisies (format paysage).'], [b('Dépenses mensuelles'), ' : tableau croisé catégories × mois (format paysage).']),
      p2('Chaque rapport s’ouvre dans un nouvel onglet et reste disponible dans la liste « Rapports générés » (ouvrir, télécharger, supprimer). Les fichiers sont dans le dossier Rapports.'),
    ]],
    ['backups', '💾', 'Sauvegardes', [
      h('p', {}, 'La page ', link('Sauvegardes', 'backups'), ' protège vos données et le programme dans des archives ZIP (dossier Sauvegardes).'),
      h('h4', {}, 'Trois types'),
      ul([b('Données'), ' : paramétrage (catégories, règles, corrections, prévisions, noms de comptes) + relevés PDF.'], [b('Programme'), ' : le code de l’application, sans vos données personnelles.'], [b('Complète'), ' : données + programme + rapports PDF.']),
      h('h4', {}, 'Gestion'),
      ul([b('Statistiques'), ' : nombre et volume des sauvegardes, répartition par type, historique des tailles, volumes des éléments protégés, date de la prochaine sauvegarde automatique.'],
        [b('⬇️ Télécharger'), ' une archive, ', b('🔍 vérifier'), ' son intégrité, ', b('🗑️ supprimer'), ' ou ', b('⬆️ importer'), ' un .zip provenant d’ailleurs.'],
        [b('♻️ Restaurer'), ' (données et complètes) : remplace le paramétrage et remet les relevés. Une sauvegarde de sécurité de l’état actuel est créée avant.'],
        [b('Sauvegarde programmée'), ' (juste après la création) : quotidienne ou hebdomadaire, avec le jour de la semaine et l’heure de votre choix, le type de sauvegarde et le nombre à conserver. La prochaine échéance s’affiche avant d’enregistrer ; une échéance manquée (application éteinte) est rattrapée au démarrage.']),
      warn('Une sauvegarde « Programme » ne se restaure pas depuis l’application : téléchargez-la et décompressez-la dans le dossier du projet. Pensez à copier de temps en temps le dossier Sauvegardes sur un autre disque.'),
    ]],
    ['statements', '🗃️', 'Relevés par année', [
      h('p', {}, 'La page ', link('Relevés', 'statements'), ' affiche tous vos relevés regroupés ', b('par année'), ' (la plus récente en premier, cliquez sur une année pour la déplier).'),
      ul('Chaque année affiche son nombre de relevés, ses dépenses et revenus et une frise des 12 mois : un mois en vert contient des opérations, un mois grisé n’en a pas (relevé manquant ?).', 'Pour chaque relevé : date d’édition, période des opérations, nombre d’opérations, débits, crédits, contrôle des totaux et taille.',
        [b('👁️'), ' ouvre le PDF, ', b('⬇️'), ' le télécharge, ', b('🗑️'), ' le supprime (les opérations correspondantes disparaissent de l’application).'], 'Le bouton « Ajouter des relevés PDF » (ou le glisser-déposer) importe de nouveaux fichiers.'),
    ]],
    ['versions', '🏷️', 'Gestion des versions', [
      h('p', {}, 'La page ', link('Versions', 'versions'), ' gère les versions du programme (numéro affiché en bas du menu).'),
      ul([b('Publier une version'), ' : choisissez l’importance — ', b('Mineur'), ' (+0.0.1, ex. 1.4.0 → 1.4.1), ', b('Intermédiaire'), ' (+0.1.0, → 1.5.0) ou ', b('Majeur'), ' (+1.0.0, → 2.0.0) — décrivez les changements et indiquez le prompt utilisé (case à cocher parmi les demandes du journal non encore rattachées, ou texte libre) : le numéro est incrémenté, le journal CHANGELOG.md est mis à jour et un instantané du programme est enregistré (dossier Versions).'],
        [b('💬 Prompt'), ' : chaque version affiche le prompt qui l’a motivée ; ce bouton permet de le modifier ou d’en ajouter un depuis le journal. Les demandes rattachées prennent le numéro de la version, et suivent ses renumérotations. Le prompt figure aussi dans l’export PDF des versions.'],
        [b('⚖️ Importance'), ' : modifiez le niveau d’une version déjà publiée ; sa numérotation et celle de toutes les versions suivantes sont recalculées (aperçu avant validation), ainsi que le journal et le numéro installé.'],
        [b('🔍 Changements'), ' : liste les fichiers modifiés, ajoutés ou supprimés depuis une version.'], [b('⏪ Revenir à cette version'), ' : restaure le code de cette version après une sauvegarde de sécurité, puis propose de redémarrer l’application.'], [b('⬇️'), ' télécharge l’instantané ; ', b('🗑️'), ' le supprime.']),
      tip('Les versions ne contiennent que le programme. Vos données (relevés, catégories, règles) se protègent avec les ', link('Sauvegardes', 'backups'), '.'),
    ]],
    ['menus', '🎛️', 'Organisation et affichage des menus', [
      h('p', {}, 'Le menu de gauche est organisé en groupes dépliables :'),
      ul([b('Gestion Données'), ' : Catégories, Comptes, Relevés.'], [b('Administration'), ' : Sauvegardes, Versions, Affichage des menus.'], 'Les autres entrées (tableau de bord, opérations, statistiques, comparaison, prévisions, rapports, documentation) restent en accès direct.'),
      h('p', {}, 'La page ', link('Affichage des menus', 'menus'), ' (Administration) permet de :'),
      ul([b('renommer'), ' une entrée ou un menu et changer son icône (champ vide = valeur d’origine) ;'], [b('déplacer'), ' une entrée d’un menu à l’autre avec le sélecteur « → » ;'], [b('créer un nouveau menu'), ' (bouton « ＋ Nouveau menu » : nom et icône), le renommer ou le supprimer — ses entrées retournent alors dans leur menu d’origine ;'], 'masquer ou réafficher chaque entrée et chaque menu grâce aux interrupteurs ;', 'changer l’ordre des entrées et des menus avec les flèches ▲ ▼ ;', 'rétablir l’affichage par défaut, déplier ou replier tous les menus.'),
      tip('Cette page et le groupe Administration ne peuvent pas être masqués, pour que vous puissiez toujours retrouver ce réglage. Un menu masqué reste accessible par les liens de la documentation.'),
    ]],
    ['accounts', '🏦', 'Comptes', [
      ul([b('＋ Ajouter un compte'), ' : créez un compte saisi à la main (autre banque, espèces, carte de crédit, épargne) avec son solde initial. Sur sa carte, ➕ ajoute une opération, ✏️ modifie le compte et 🗑️ le supprime. Les opérations manuelles sont classées, comptées et exportées comme les autres ; pour un transfert vers un compte, utilisez la catégorie « Virements internes ».'], 'Une carte par compte (courants, Livret A, LDDS, CEL, PEL) avec son solde, les entrées et sorties de la période.', 'Cliquez sur une carte pour afficher la courbe d’évolution de son solde.', [b('✏️'), ' permet de donner un nom personnalisé à un compte.'], 'La liste des relevés importés indique ceux dont les totaux ont été vérifiés.'),
    ]],
    ['internal', '🔁', 'Virements internes', [
      p2('Un virement entre deux de vos comptes n’est ni une dépense ni un revenu. Ils sont reconnus par le numéro de compte indiqué sur le relevé ou par votre nom comme donneur/bénéficiaire, puis classés « Virements internes » et exclus des statistiques.'),
      tip('Un virement reçu de vous-même depuis une autre banque est aussi classé « interne ». S’il s’agit en réalité d’un revenu, changez sa catégorie ou créez une règle.'),
    ]],
    ['install', '🪟', 'Installation Windows (MSI)', [
      h('p', {}, 'Le fichier ', b('Comptes-<version>.msi'), ' (dossier dist) installe l’application sans droits administrateur et sans rien d’autre à installer : Node.js est embarqué.'),
      ul('Installation par utilisateur dans %LOCALAPPDATA%\\Programs\\Comptes ; raccourcis « Comptes » (menu Démarrer et bureau) et « Arrêter Comptes ».',
        'Au lancement, une petite fenêtre « Démarrage… » s’affiche le temps de charger les relevés, puis l’application s’ouvre dans votre navigateur.',
        [b('Vos données'), ' (relevés, paramétrage, sauvegardes, rapports, versions) sont dans ', b('Documents\\Comptes'), ', séparées du programme : une mise à jour ou une désinstallation ne les supprime pas.'],
        'Mise à jour : lancez simplement le nouveau MSI ; la version précédente est remplacée.',
        'Désinstallation : Paramètres Windows › Applications (ou msiexec /x). Le serveur est arrêté automatiquement.'),
      h('h4', {}, 'Fabriquer le MSI'),
      p2('Depuis le dossier du projet : powershell -ExecutionPolicy Bypass -File installer\\build-msi.ps1. Aucun outil externe n’est nécessaire (API Windows Installer, makecab). Le port (3210) et le dossier de données peuvent être changés avec les variables d’environnement COMPTES_PORT et COMPTES_HOME.'),
      warn('Le MSI n’est pas signé numériquement : Windows peut afficher un avertissement SmartScreen à la première ouverture (« Informations complémentaires » › « Exécuter quand même »).'),
    ]],
    ['analyse', '🧠', 'Analyse IA des dépenses et revenus', [
      h('p', {}, 'Le menu ', b('Analyse'), ' produit une analyse rédigée de vos dépenses et revenus sur la période de votre choix.'),
      ol(['Ouvrez ', link('Analyse IA', 'analyse'), ', choisissez les comptes, le mois de début et de fin, l’axe (dépenses, revenus, épargne) et, si vous le souhaitez, la comparaison avec la période précédente.'],
        ['Cliquez sur ', b('👁️ Aperçu de ce qui sera envoyé'), ' pour voir exactement les données et le prompt.'],
        [b('🧠 Lancer l’analyse IA'), ' envoie les données au fournisseur configuré (après votre consentement) ; ', b('📊 Analyse locale rapide'), ' produit une analyse par règles statistiques, sans rien envoyer.'],
        'Le résultat s’affiche, se copie, s’exporte en PDF et reste dans l’historique des analyses.'),
      h('h4', {}, 'Configurer l’IA'),
      p2('Dans Analyse › Paramètres IA, choisissez un fournisseur : Anthropic (Claude), un service compatible OpenAI, ou Ollama (modèle local, rien ne quitte votre PC). Renseignez la clé API et le modèle, puis testez la connexion. Sans configuration, seule l’analyse locale est disponible.'),
      tip('Seules des données agrégées sont transmises (totaux par catégorie et par mois, principaux postes, anomalies) : jamais d’IBAN, de libellé bancaire détaillé ni de nom de personne. La clé API est stockée dans data/secrets.json, hors des sauvegardes. Les analyses sont fournies à titre indicatif et ne constituent pas un conseil financier.'),
    ]],
    ['prompts', '📜', 'Journal des prompts', [
      h('p', {}, 'La page ', link('Prompt', 'prompts'), ' (Administration) comporte deux onglets :'),
      ul([b('Journal des prompts'), ' : l’historique de toutes les demandes adressées pour construire l’application, et chaque prompt envoyé à l’IA (ajouté automatiquement, avec le fournisseur, le modèle et le résultat : envoyé ou erreur). Vous pouvez rechercher, filtrer, ajouter, ',
        b('modifier'), ' (texte, statut, version, date, notes), copier, supprimer et exporter le journal en Markdown.'],
        [b('Modèles d’analyse IA'), ' : la consigne système et le message utilisés par l’analyse, modifiables avec les variables {{periode}}, {{comptes}}, {{focus}} et {{donnees}}, et rétablissables par défaut.']),
    ]],
    ['license', '©️', 'Copyright et licence d’utilisation', [
      h('p', {}, 'La page ', link('Licence', 'license'), ' (Administration) gère :'),
      ul([b('Le copyright'), ' (titulaire, année, produit), affiché dans le menu et en pied des rapports PDF.'],
        [b('La licence de diffusion'), ' du logiciel (propriétaire, MIT, Apache 2.0, GPL v3, CC BY-NC) et la génération des fichiers LICENSE et NOTICE.'],
        [b('La licence d’utilisation'), ' (contrat utilisateur) : texte modifiable, acceptation demandée à l’ouverture avec le nom de l’utilisateur et la date. Modifier le texte demande une nouvelle acceptation.'],
        [b('Les composants tiers'), ' embarqués et leurs licences.']),
    ]],
    ['exports', '📄', 'Exports PDF des pages d’administration', [
      p2('Les pages suivantes proposent un bouton « Exporter en PDF » : ' + 'Prompt (journal complet ou filtré), Versions (historique et journal des modifications), Documentation (ce mode d’emploi), Licence (copyright, licences, composants tiers) et Manifeste. Les boutons d’export sont en rouge/orange pour être repérés facilement. Les PDF s’ouvrent dans un nouvel onglet et sont conservés dans Rapports PDF. Le PDF de la documentation comporte une table des matières cliquable avec numéros de page, des chapitres numérotés et une pagination « Page x / n ».'),
    ]],
    ['manifest', '📋', 'Manifeste du programme', [
      h('p', {}, 'La page ', link('Manifeste', 'manifest'), ' (Administration) décrit le programme : identité, version, titulaire et licence, environnement, fonctionnalités, composants tiers et l’empreinte SHA-256 de chacun de ses fichiers.'),
      ul([b('Générer / mettre à jour MANIFEST.json'), ' enregistre le manifeste à la racine du programme.'], [b('Vérifier l’intégrité'), ' compare les fichiers actuels au manifeste enregistré et liste les fichiers modifiés, ajoutés ou supprimés.'], 'Le manifeste se télécharge en JSON et s’exporte en PDF. Le MSI embarque le manifeste de la version installée.'),
    ]],
    ['model', '🧬', 'Modèles de paramétrage', [
      h('p', {}, 'La page ', link('Modèle', 'model'), ' (Administration) exporte et applique des modèles : des fichiers .json de paramétrage ', b('sans aucune donnée personnelle'), ' (ni opérations, ni relevés, ni comptes, ni clé API).'),
      ul([b('Créer un modèle'), ' : nom, description et éléments à inclure — catégories (avec budgets), règles, menus, modèles de prompt, fournisseur d’IA (sans clé), planification des sauvegardes, copyright et licence.'],
        [b('Appliquer un modèle'), ' : un fichier ou le modèle d’origine ; aperçu des changements, choix des éléments et du mode (fusionner ou remplacer les catégories et règles). Une sauvegarde « Données » est créée avant l’application.']),
    ]],
    ['data', '💾', 'Vos données', [
      ul([b('Relevés PDF'), ' : dossier Documents/Releves.'], [b('Catégories, règles, corrections, prévisions, noms de comptes'), ' : fichier data/store.json. Copiez-le pour sauvegarder votre paramétrage.'],
        'Aucune donnée ne quitte votre ordinateur.'),
    ]],
    ['faq', '❓', 'Questions fréquentes', [
      faq('Une dépense est dans la mauvaise catégorie.', 'Ouvrez l’opération (page Opérations), choisissez la bonne catégorie, et cliquez sur « Créer la règle » pour que les opérations similaires suivent.'),
      faq('Les chiffres semblent trop élevés ou trop bas.', 'Vérifiez les deux filtres en haut à droite (comptes et période). Les prêts, assurances et impôts sont inclus dans les dépenses.'),
      faq('Le dernier mois paraît faible.', 'Un relevé s’arrête vers le 10 du mois : le mois en cours est partiel. Les prévisions et la comparaison par défaut l’ignorent.'),
      faq('Un relevé est refusé.', 'Seuls les relevés La Banque Postale au format PDF d’origine sont lus. Un doublon (période déjà importée) est aussi refusé.'),
      faq('La page ne se met pas à jour.', 'Actualisez avec F5. Si le site ne répond plus, relancez Comptes.bat.'),
      faq('Comment changer de port ?', 'Lancez le serveur avec la variable PORT (ex. PORT=4000 node server.mjs).'),
    ]],
    ['ai', '🔌', 'Paramètres IA', [
      h('p', {}, 'Cette page choisit le fournisseur d’intelligence artificielle utilisé par ', link('Analyse IA', 'analyse'), ' : Anthropic (Claude), un service compatible OpenAI, l’analyse locale sans IA — ou l’une des offres gratuites : en local (Ollama, LM Studio) ou en ligne avec une clé gratuite (Google Gemini, Groq, OpenRouter, Mistral, Cerebras, GitHub Models, Hugging Face). Chaque fournisseur indique ses modèles conseillés (un clic les sélectionne) et le lien pour obtenir la clé.'),
      ul('Renseignez la clé API, le modèle et, si besoin, l’adresse du service ; le bouton « Tester la connexion » vérifie le paramétrage.', 'La clé est stockée sur votre ordinateur (data/secrets.json), hors des sauvegardes ; elle peut aussi venir de la variable COMPTES_AI_KEY du fichier .env.'),
      p2('Avec Ollama ou LM Studio, la page détecte le service local, liste les modèles installés (un clic en choisit un) et, pour Ollama, propose de télécharger un modèle avec une barre de progression. Une erreur 404 signifie en général que le modèle choisi n’est pas installé : l’application l’indique désormais clairement et propose de télécharger ou d’utiliser un modèle déjà présent.'),
      tip('Avec Ollama ou LM Studio, aucune donnée ne quitte votre ordinateur. Les offres gratuites en ligne ont des quotas et des conditions qui peuvent évoluer, et le fournisseur peut réutiliser les données reçues. Avec les autres fournisseurs, seules des données agrégées sont envoyées, après votre consentement.'),
    ]],
    ['docs', '📘', 'Documentation', [
      h('p', {}, 'Ce mode d’emploi suit l’organisation de la barre latérale : les chapitres correspondent aux menus (dans leur ordre actuel et avec leurs libellés personnalisés), les sections aux entrées de chaque menu. Les chapitres « Généralités » et « Annexes » regroupent les sujets transversaux.'),
      ul('Le sommaire à gauche est hiérarchique : chapitres et sections numérotés (1, 1.1, 1.2…).', [b('Exporter en PDF'), ' produit le même plan avec une table des matières à deux niveaux, cliquable, avec numéros de page.']),
      tip('Si vous réorganisez les menus (page Affichage des menus), la documentation et son PDF suivent automatiquement le nouvel ordre.'),
    ]],
  ];
  function p2(t) { return h('p', {}, t); }
  function faq(q, a) { return h('details', { class: 'faq' }, h('summary', {}, q), h('p', {}, a)); }

  // ---- plan : chapitres = menus (ordre actuel), sections = entrées de chaque menu
  const byId = new Map(SECTIONS.map(s => [s[0], s])), used = new Set();
  const entry = (id, icon, title) => { used.add(id); return { id, icon, title }; };
  const own = id => { const s = byId.get(id); return entry(id, s[1], s[2]); };
  const chapters = [{ icon: '🧭', title: 'Généralités', items: ['start', 'import', 'internal'].map(own) }];
  for (const g of navModel()) {
    const items = g.items.filter(it => byId.has(it.id)).map(it => entry(it.id, it.icon, it.label));
    if (items.length) chapters.push({ icon: g.icon || (g.id === 'main' ? '📌' : '📘'), title: g.label || (g.id === 'main' ? 'Menus principaux' : 'Aide'), items });
  }
  const annex = SECTIONS.filter(s => !used.has(s[0])).map(s => own(s[0]));
  if (annex.length) chapters.push({ icon: '📎', title: 'Annexes', items: annex });

  const go = id => e => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  const toc = h('nav', { class: 'doctoc card' }, h('b', { style: { display: 'block', marginBottom: '8px' } }, 'Sommaire'),
    chapters.map((ch, i) => h('div', { class: 'tocch' }, h('a', { class: 'toc1', href: '#/docs', onclick: go('docch-' + i) }, `${i + 1}. ${ch.icon} ${ch.title}`),
      ch.items.map((it, j) => h('a', { class: 'toc2', href: '#/docs', onclick: go('doc-' + it.id) }, `${i + 1}.${j + 1} ${it.icon} ${it.title}`)))));
  const body = h('div', { class: 'docbody' },
    h('div', { class: 'card dochero' }, h('div', { style: { fontSize: '40px' } }, '📘'), h('div', {}, h('h2', { style: { fontSize: '22px', margin: '0 0 4px' } }, 'Mode d’emploi'), h('div', { class: 'muted' }, 'Tout ce qu’il faut savoir pour suivre vos comptes, classer vos dépenses et préparer votre budget.')), h('div', { style: { marginLeft: 'auto' } }, pdfBtn('📄 Exporter en PDF', exportDocsPdf))),
    chapters.map((ch, i) => h('section', { class: 'docchapter', id: 'docch-' + i, 'data-num': String(i + 1), 'data-title': ch.title },
      h('h2', { class: 'chtitle' }, h('span', { class: 'num' }, i + 1), `${ch.icon} ${ch.title}`),
      ch.items.map((it, j) => h('section', { class: 'card doc', id: 'doc-' + it.id, 'data-num': `${i + 1}.${j + 1}`, 'data-title': it.title }, h('h3', {}, h('span', { class: 'num' }, `${i + 1}.${j + 1}`), `${it.icon} ${it.title}`), byId.get(it.id)[3])))));
  v.append(h('div', { class: 'doclayout' }, toc, body));
}
