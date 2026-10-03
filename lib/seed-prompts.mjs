// Historique initial des demandes (prompts) adressées pour construire l'application.
// Heures locales de l'ordinateur (stockées en ISO/UTC, affichées en heure locale).
const D = (h, m) => new Date(2026, 9, 2, h, m).toISOString();
export const SEED_JOURNAL = [
  ['Créer un nouveau projet nommé Comptes dans le répertoire C:\\DVP\\Comptes', D(6, 30), '1.0.0', 'Dossier, dépôt git et README.'],
  ['Analyse les fichiers qui sont dans C:\\DVP\\Comptes\\Documents\\Releves et fait une application de gestion des dépenses et opérations sur les différents comptes, fait des statistiques par catégories de dépenses, des schémas d\u2019évolutions, fait une gestion des catégories de dépenses avec des interfaces agréables, ergonomiques et avec des couleurs', D(6, 45), '1.0.0', 'Extraction des PDF La Banque Postale, tableau de bord, opérations, statistiques, catégories et règles.'],
  ['Ajoute la possibilité de rajouter un fichier dans le répertoire des relevés', D(8, 10), '1.1.0', 'Bouton « Ajouter un relevé » et glisser-déposer.'],
  ['À partir des données d\u2019une année n, fais une prévision budgétaire pour l\u2019année n+1 avec la possibilité de changer les valeurs', D(8, 10), '1.1.0', 'Page Prévisions.'],
  ['Dans le prévisionnel, pouvoir changer la valeur par mois', D(8, 40), '1.1.0', 'Vue « Par mois ».'],
  ['Ajouter la possibilité de faire des comparaisons sur 2 périodes', D(9, 5), '1.1.0', 'Page Comparer.'],
  ['Dans un menu Documentation, génère un mode d\u2019emploi', D(9, 30), '1.1.0', 'Page Documentation.'],
  ['Dans les prévisions, pouvoir changer le montant prévu par mois. Dans les périodes ajouter les 12 derniers mois. Prévoir un système de sauvegarde, pour données, le programme, complète, avec des statistiques, des volumes, le nombre, avec toutes les fonctionnalités de gestion. L\u2019interface doit être lisible, agréable. Prévoir des rapports en PDF', D(10, 20), '1.1.0', 'Sauvegardes (3 types, statistiques, restauration, import) et rapports PDF.'],
  ['Faire une gestion des versions. Dans la gestion et l\u2019affichage des relevés, mets en place un affichage par année. Pour les sauvegardes programmées, la mettre juste après « Créer une sauvegarde », pouvoir choisir le jour de la semaine et l\u2019heure', D(12, 0), '1.1.0', 'Page Versions, page Relevés, sauvegarde programmée.'],
  ['Pouvoir ajouter un compte. Dans Prévision, rester sur le champ après une nouvelle saisie', D(13, 30), '1.1.0', 'Comptes manuels et conservation du focus.'],
  ['Faire un menu Administration et mettre dedans Sauvegardes et Versions. Mettre une gestion de l\u2019affichage des menus. Faire un menu « Gestion Données », y mettre dedans Catégories, Comptes, Relevés', D(14, 30), '1.1.0', 'Groupes de menus et page Affichage des menus.'],
  ['Pour la gestion des versions, en plus de mineur et majeur, ajouter intermédiaire. Pour mineur, incrémenter de 0.0.1, pour intermédiaire incrémenter de 0.1.0 et pour majeur incrémenter de 1.0.0. Permettre de changer l\u2019importance du correctif et recalculer la version des versions impactées', D(15, 30), '1.1.0', 'Trois niveaux et renumérotation.'],
  ['Peux-tu faire un fichier MSI pour faire une installation sous Windows ?', D(16, 30), '1.2.0', 'Installeur MSI par utilisateur, Node.js embarqué.'],
  ['Dans administration, créer un sous menu Prompt, et fais un journal de l\u2019ensemble des prompts demandés avec la possibilité de faire des modifications. Faire une gestion de copyright et de licence d\u2019utilisation. Créer un menu Analyse dans lequel tu feras une analyse, avec une IA, des dépenses et des revenus sur une période donnée', D(19, 40), '', 'Cette évolution : Prompt, Licence, Analyse IA.'],
].map(([text, date, version, notes], i) => ({ id: i + 1, source: 'demande', date, text, status: 'réalisé', version, notes }));

export const DEFAULT_TEMPLATES = {
  system: `Tu es un analyste financier personnel bienveillant et rigoureux. Tu analyses des données budgétaires agrégées d'un particulier (dépenses et revenus) et tu réponds en français, dans un style clair, concret et sans jargon. Tu t'appuies uniquement sur les chiffres fournis : ne fais aucune supposition sur des données absentes et signale les limites. Tu ne donnes pas de conseil d'investissement personnalisé ; tes recommandations portent sur la gestion du budget. Mets en forme en Markdown (titres ##, listes à puces, **gras** pour les chiffres clés).`,
  user: `Analyse mes dépenses et mes revenus sur la période {{periode}} ({{comptes}}).
Axe demandé : {{focus}}.

Données agrégées (JSON, montants en euros) :
{{donnees}}

Fournis :
1. **Synthèse** (3 à 5 lignes) : revenus, dépenses, épargne et taux d'épargne.
2. **Analyse des dépenses** : postes dominants, évolutions notables, dépenses récurrentes vs variables.
3. **Analyse des revenus** : sources, régularité, variations.
4. **Points d'attention** : anomalies, dépenses inhabituelles, dérives.
5. **Recommandations** : 3 à 5 actions concrètes et chiffrées pour améliorer l'équilibre budgétaire.
6. **Questions** : ce qu'il faudrait vérifier ou préciser.`,
};
