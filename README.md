# Gym Manager

Application web de gestion interne du club : adhérents, abonnements (packs, remises, durées) et **renouvellements**, **paiements avec reçus PDF numérotés**, sports et créneaux, coachs et personnel, **paie du personnel avec reçus de salaire**, activités et inscriptions, alertes de paiement WhatsApp, statistiques et paramètres. Interface entièrement en français, utilisable sur PC et sur tablette (≥ 768 px), thème clair ou sombre.

---

## 1. Choix techniques (et pourquoi)

| Couche | Choix | Raison |
| --- | --- | --- |
| Front | **Angular 21** (composants standalone, signals) + **Angular Material** + **Chart.js** + icônes **Lucide** | Demandé. Material fournit des composants accessibles (modales, sélections, onglets, notifications) ; Chart.js pour les graphiques. Angular 21 est la dernière version compatible avec Node 20. |
| Back | **Java 21 + Spring Boot 4.1** (Web MVC, Security, Data JPA, Validation) | Demandé. Stack standard, robuste, et l'API REST servira telle quelle à la future application mobile. |
| Base SQL | **PostgreSQL 17** | Une seule base, en développement comme en production (`docker compose` fournit l'instance locale). Les tests tournent sur PostgreSQL via Testcontainers (Docker requis). |
| Migrations | **Liquibase** (`gym-manager-backend/src/main/resources/db/changelog`) | Schéma versionné, historique des changesets dans la table `databasechangelog`. Le seed charge les données de la section 11 au premier démarrage. |
| Sécurité | Spring Security, mots de passe hachés **BCrypt**, session HttpOnly `SameSite=Strict` | Rôles vérifiés **côté serveur** sur chaque route de l'API. Changement de mot de passe forcé à la première connexion. |
| Règles de calcul | `com.gymmanager.gym.rules.Rules` : module **pur** (aucune I/O, aucune horloge), couvert par des tests JUnit | Toutes les valeurs calculées (prix, fin, jours, statuts, salaires, CA) viennent de là et ne sont jamais stockées. Les formulaires affichent leur aperçu en direct en appelant le serveur, qui applique les mêmes règles. |
| Fichiers | Photos et logo dans `data/uploads/` (hors base), servis par des routes protégées | Contrôle du type réel (JPG/PNG) et de la taille (2 Mo maximum). |
| Hébergement | **Un seul service** : un `.jar` contient l'API et l'interface Angular | Aucun service payant requis. |

## 2. Prérequis

- **Java 21+** (de préférence un JDK **arm64** sur Mac Apple Silicon : un JDK x86_64 passe par Rosetta, et le démarrage prend alors environ 20 s au lieu de 3 s) ;
- **Docker** : PostgreSQL 17 tourne en conteneur (`docker/docker-compose.yaml`), et les tests utilisent Testcontainers ;
- **Maven 3.9+** (`mvn` dans le PATH) pour lancer l'application hors Docker ; Node n'est pas nécessaire : le build Maven télécharge Node dans `gym-manager-frontend/node` (Node 20.19+ local seulement pour `npm start` en développement du front).

Le projet est un **monolithe Maven multi-module** : le `pom.xml` racine (`gym-manager`) enchaîne `gym-manager-frontend` (build Angular empaqueté en `gym-manager-frontend.jar`, sous `/static`) puis `gym-manager-backend` (jar Spring Boot exécutable qui embarque ce module).

## 3. Installation et lancement

Tout ce qui concerne Docker est dans `docker/` : `docker-compose.yaml` (PostgreSQL + application) et le `Dockerfile` de l'image. Les commandes se lancent depuis la racine du dépôt.

### Toute l'application avec Docker

```bash
docker compose -f docker/docker-compose.yaml up -d --build   # construit l'image (front + API) et lance PostgreSQL + l'application
```

L'application est sur http://localhost:8090. Les données sont dans les volumes `gym-db` (base) et `gym-files` (photos, logo).

Variables facultatives (fichier `docker/.env` ou environnement) : `APP_PORT` (port publié de l'application, 8090 par défaut), `DB_PUBLISHED_PORT` (port publié de PostgreSQL, 5432 par défaut), `DB_PASSWORD`.

Arrêt : `docker compose -f docker/docker-compose.yaml down` (les données sont conservées ; `down -v` les efface).

Derrière un proxy d'entreprise : `docker compose -f docker/docker-compose.yaml build --build-arg HTTPS_PROXY=http://hôte:port`.

### Développement (application lancée par Maven)

```bash
docker compose -f docker/docker-compose.yaml up -d db    # PostgreSQL 17 seul (gym / gym, port 5432)
mvn -q -pl gym-manager-frontend -am install -DskipTests  # construit l'interface (la 1re fois, puis après une modification du front)
mvn -pl gym-manager-backend spring-boot:run              # démarre → http://localhost:8090
```

Variantes :

```bash
PORT=9000 mvn -pl gym-manager-backend spring-boot:run               # autre port (8090 par défaut)
mvn clean package -DskipTests                                       # build de production → gym-manager-backend/target/gym-manager-backend-1.0.0.jar
java -jar gym-manager-backend/target/gym-manager-backend-1.0.0.jar  # ou : DB_HOST=… DB_NAME=… DB_USER=… DB_PASSWORD=… java -jar …
mvn clean verify                                                    # tous les tests (Angular + Java ; Docker requis pour Testcontainers)
```

**Développement du front** avec rechargement à chaud : lancer le backend (`mvn -pl gym-manager-backend spring-boot:run`), puis `cd gym-manager-frontend && npm start`. L'interface est alors sur http://localhost:4200, et `/api` est redirigé vers le port 8090 par `proxy.conf.json`.

**Remettre les données de démonstration à zéro** : arrêter le serveur, vider la base (`docker compose -f docker/docker-compose.yaml down -v`) et `gym-manager-backend/data/` (photos), relancer.

Variables utiles : `PORT`, `DATA_DIR` (dossier des fichiers téléversés), `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`.

## 4. Comptes par défaut

| Identifiant | Mot de passe | Rôle |
| --- | --- | --- |
| `admin` | `admin123` | ADMIN (gérant) : tout, y compris Personnel, Statistiques et Paramètres |
| `accueil` | `accueil123` | ACCUEIL : lecture de tout sauf Personnel, Paie, Statistiques et Paramètres ; écriture sur les adhérents, les **renouvellements**, les **encaissements** et les inscriptions aux activités ; alertes. La **modification et l'annulation d'un paiement** sont réservées à l'ADMIN. |

Un nouveau mot de passe est demandé à la **première connexion** : 8 caractères minimum, avec au moins une lettre et un chiffre. Les comptes se gèrent ensuite dans Paramètres › Utilisateurs.

## 5. Paiements, renouvellements et paie

- **Encaisser** (fiche adhérent) : montant (paiement partiel possible), mode (espèces, carte bancaire, virement), date, note. Chaque paiement reçoit un **reçu numéroté** `REC-AAAA-NNNN`, avec une numérotation qui repart à 1 chaque année et n'est jamais réutilisée. Le reçu est un PDF A5 aux couleurs du club.
- **Statut de paiement** : *Payé* quand tout est réglé, *Partiel* quand une partie est payée, *Impayé* quand rien n'a été payé. Il porte sur l'ensemble des périodes de l'adhérent, arriérés compris. Le **reste à payer** apparaît sur la fiche, dans la liste des adhérents et dans les alertes.
- **Renouveler** : crée une nouvelle période, sans effacer la précédente. Elle commence à la fin de la période en cours, ou aujourd'hui si celle-ci est terminée (RG-RENOUV). Le premier paiement peut être encaissé dans la même fenêtre.
- **Historique** : la fiche liste chaque période avec ses paiements et ses reçus. La page **Paiements** sert de journal de caisse : filtres par période et par mode, totaux par mode, export CSV.
- **Correction** (ADMIN) : un paiement se *modifie* (même numéro, reçu régénéré, traçabilité de qui et quand) ou s'*annule* avec un motif obligatoire. Le numéro reste alors utilisé et le reçu affiche « ANNULÉ ». Un paiement ne se supprime jamais.
- **Paie du personnel** (ADMIN, menu Club › Paie du personnel) : pour chaque mois, le salaire dû (RG-SALAIRE pour ce mois), le montant déjà versé et le reste. Un salaire peut être versé en une ou plusieurs fois (acomptes), avec un **reçu de salaire** `SAL-AAAA-NNNN` en PDF, un historique par personne et un export CSV.
- Les préfixes `REC` et `SAL` et la mention en pied de reçu se règlent dans Paramètres › Reçus.
- **Envoi WhatsApp des reçus** : prévu pour une étape ultérieure. Pour l'instant, le PDF s'ouvre, se télécharge et se joint manuellement.

## 5 bis. Import Excel et réinitialisation (Paramètres › Données, ADMIN)

**Importer un fichier Excel** au format de l'ancien `Gym_Manager.xlsx`. Le classeur est d'abord **analysé sans rien modifier**. Le rapport montre les feuilles reconnues, ce qui sera créé (sports, coachs, packs, adhérents, périodes, paiements et montants), les lignes ignorées et les ajustements. L'import ne se lance qu'après avoir tapé `SUPPRIMER` : il **remplace toutes les données actuelles**, en une seule transaction (tout ou rien). Les comptes utilisateurs, les paramètres et le logo sont conservés.

| Feuille | Colonnes reconnues (par leur titre) | Devient |
| --- | --- | --- |
| Sports | ID Sport, Nom du sport, Coach, Horaires, Capacité, Prix mensuel | sports (codes conservés), coachs (personnel, commission), créneaux, packs Mensuel / Trimestriel / Annuel sans remise |
| Adhérents | ID, Nom, Prénom, Téléphone, Date naissance, Sport(s) inscrit, Date inscription, Date fin abonnement, Prix mensuel | adhérents (codes conservés) avec leur période d'abonnement ; durée = écart entre inscription et fin, arrondi au mois |
| Factures (facultative) | N° facture, ID adhérent, Date facture, Mois concerné, Montant, Statut | paiements avec reçus numérotés dans l'ordre des dates ; le n° de facture figure dans la note |
| Personnel (facultative) | Nom, Prénom, Téléphone, Fonction, Salaire | personnel (fixe si un salaire est indiqué) |

Les feuilles calculées (Accueil, Fiche, Alertes, Statistiques, Guide) et les colonnes E-mail, Statut, Dernier paiement et Photo sont ignorées.

Règles de conversion des factures :
- une facture d'un mois **antérieur** à l'inscription devient une période mensuelle passée, payée, ou due si la facture est impayée ;
- une facture **payée** à partir du mois d'inscription règle l'abonnement en cours ; une fois celui-ci soldé et terminé, chaque facture payée suivante devient un **renouvellement mensuel** ;
- une facture impayée postérieure à la fin de l'abonnement n'est pas reprise (avertissement) ;
- le mode de paiement (absent du fichier) et l'assurance par défaut se choisissent avant l'import.

Les horaires « Lun-Sam 07h-22h » ou « Mar-Jeu 09h-10h30 » sont lus comme des plages de jours (« Mar-Jeu » = mardi, mercredi, jeudi). Ils restent modifiables dans la page Sports.

**Réinitialiser les données** : efface adhérents, paiements, sports, personnel, packs, remises, durées, activités et paie, et remet les numéros à zéro, après avoir tapé `SUPPRIMER`. Les comptes, les paramètres et le logo sont conservés.

**Logo et icône** : le logo du club est intégré à l'application. L'emblème apparaît dans le menu, le logo complet sur la connexion et sur les reçus, et l'icône d'application sert d'onglet et d'icône sur l'écran d'accueil d'un téléphone ou d'une tablette (`manifest.webmanifest`). Un autre logo peut être téléversé dans Paramètres › Club, avec un retour possible au logo par défaut.

## 6. Tests

- `gym-manager-backend/src/test/java/.../rules/RulesTest.java` : **54 tests** des règles RG-PACK, RG-PRIX (avec et sans cumul), RG-FIN (fins de mois, années bissextiles), RG-JOURS, RG-STATUT, RG-ACTIF, RG-SITUATION (seuils paramétrés), RG-SALAIRE (fixe, commission, bornes incluses, lendemain exclu, coachs multiples en part entière ou partagée, adhérent compté une seule fois), RG-MASSE, RG-CA (mois, trimestre, année, par sport), statut Payé / Partiel / Impayé, reste à payer et RG-RENOUV.
- `gym-manager-backend/src/test/java/.../importer/ImportParsingTest.java` : lecture des horaires, des mois en français et des codes.
- `gym-manager-backend/src/test/java/.../AcceptanceTest.java` : **15 tests** (dont l'import du classeur `src/test/resources/import/Gym_Manager.xlsx` et la réinitialisation) de bout en bout de l'API sur les données du seed, avec la date du jour figée au 18/11/2026, sur un PostgreSQL 17 lancé par Testcontainers (Docker requis). Ils couvrent les critères 2 à 7, 9 et 10 de la section 12, les validations et les activités complètes, ainsi que les paiements partiels, les reçus PDF, les modifications et annulations, les renouvellements, la paie et les droits de l'ACCUEIL.
- `gym-manager-frontend/src/**/*.spec.ts` : formats français, recherche sans accents, tri, filtres et pagination des tableaux.

## 7. Organisation du code

```
gym-manager-backend/
  src/main/java/com/gymmanager/gym/
    rules/        Rules.java — module pur des règles RG-*
    domain/       entités JPA
    repository/   dépôts Spring Data
    service/      ClubStateService (vue calculée du club), services métier, statistiques
    settings/     catalogue des paramètres (valeurs par défaut de la section 6) + service
    security/     Spring Security, utilisateurs, contrôle « mot de passe à changer »
    web/          contrôleurs REST (/api/...) + service de l'appli Angular
    seed/         données de démonstration (section 11 + paiements, un renouvellement, paie d'octobre)
  src/main/resources/db/changelog/   changelogs Liquibase
gym-manager-frontend/src/app/
  core/      API, authentification, configuration, formats, intercepteur
  shared/    tableau triable/paginé, sélection multiple avec recherche, modales, badges, graphiques
  layout/    menu latéral + en-tête
  pages/     une page par écran (11 pages + connexion)
```

Principales routes de l'API : `/api/payments` (+ `/{id}/receipt.pdf`), `/api/members/{id}/renew`, `/api/payroll` (+ `/payments/{id}/receipt.pdf`), `/api/members`, `/api/packs`, `/api/discounts`, `/api/durations`, `/api/sports`, `/api/staff`, `/api/activities`, `/api/registrations`, `/api/alerts`, `/api/dashboard`, `/api/stats`, `/api/settings`, `/api/users`, `/api/functions`, `/api/config`, `/api/auth/*`.

## 8. Hypothèses retenues

Pour chaque point que le cahier des charges ne tranche pas, la règle la plus simple compatible avec lui a été appliquée.

1. **Aujourd'hui** = date du jour dans le fuseau `P(fuseau horaire)`.
2. **Alertes** : le tableau liste tous les adhérents **non désactivés**, expirés compris (sinon il n'y aurait rien à relancer), triés par jours restants croissants. Le compteur « en alerte » compte ceux dont le reste de jours est < 0. Le message « bientôt » est proposé pour les situations « Expire bientôt » et « À suivre ». Sur la fiche adhérent, le bouton WhatsApp n'apparaît que pour « Expiré » ou « Expire bientôt ».
3. **Statistiques** : la période choisie s'applique au CA encaissé, à sa répartition par mode de paiement, au CA mensuel, au CA par sport et aux activités (filtrées par leur date). Les indicateurs « Reste à encaisser » (somme des restes à payer des adhérents non désactivés), « Assurances impayées » et « Adhérents actifs » décrivent l'état actuel. Les tableaux trimestriel et annuel couvrent toutes les années, du premier adhérent ou paiement à l'année en cours. Les recettes des activités restent calculées (prix × inscrits) : elles ne passent pas par la caisse.
4. **RG-CA** (avec les paiements) : le chiffre d'affaires est la somme des **paiements encaissés et non annulés**, à leur date de paiement, et non plus le prix des abonnements à leur date d'inscription. C'est le changement voulu : un renouvellement n'efface plus l'historique. Le CA par sport compte un paiement dans chacun des sports de l'adhérent.
4 bis. **Prix d'une période** : il suit les règles et les paramètres (RG-PRIX, cumul, arrondi, tarifs) tant qu'aucun paiement n'est enregistré, puis il est **figé au premier paiement**, pour que les reçus déjà émis restent justes si un tarif change. Le critère 6 reste donc vrai pour un adhérent qui n'a encore rien payé.
4 ter. **Statut de paiement** (RG-STATUT révisé) : *Payé* quand le total payé couvre le total dû de toutes les périodes, *Partiel* quand un montant a été payé, *Impayé* sinon. L'expiration (reste de jours, situation, alertes, RG-ACTIF) reste calculée sur les dates de la dernière période. Un paiement ne peut pas dépasser le reste à payer de la période choisie, ni être daté dans le futur. Par défaut, il s'impute sur la période impayée la plus ancienne.
5. **RG-SALAIRE** :
   - les adhérents désactivés sont exclus ;
   - avec les renouvellements, la commission porte sur les périodes (inscription ou renouvellement) qui **commencent** dans la fenêtre du mois, au prix de la période. Un adhérent compte une seule fois par membre du personnel ;
   - la paie d'un mois passé se recalcule avec les données actuelles. Un versement ne peut pas dépasser le reste à verser du mois (acomptes possibles) ni concerner un mois futur ;
   - si la fenêtre dépasse la fin du mois (jour 31 en février), elle s'arrête au dernier jour ;
   - le jour de début doit être ≤ au jour de fin ;
   - en mode « partage égal », un adhérent qui pratique plusieurs sports du même coach compte une fois, avec la part la plus favorable ;
   - la part se saisit en fraction (`1/3`, exacte, c'est la valeur par défaut) ou en pourcentage (`33,33`, `40 %`).
6. Tout membre du personnel peut être rattaché comme coach à un sport, quelle que soit sa fonction. Le téléphone du personnel est facultatif, mais validé s'il est saisi.
7. **Suppression** : un adhérent sans paiement se supprime (avec ses périodes, ses inscriptions et sa photo). Un adhérent qui a des paiements enregistrés est conservé pour la comptabilité : il faut le désactiver. De même, un membre du personnel avec des versements ne se supprime pas. Un renouvellement créé par erreur (dernière période, sans paiement) peut être supprimé par l'ADMIN. Les autres éléments se suppriment uniquement s'ils ne sont référencés nulle part ; sinon le serveur refuse et invite à les **désactiver**. La remise « Aucune » ne peut être ni supprimée ni désactivée.
8. **Codes** : chaque entité a un compteur qui ne recule jamais. Changer le préfixe ou le nombre de chiffres ne touche que les codes futurs.
9. **Unicité d'un adhérent** (nom, prénom, téléphone) : la comparaison ignore la casse et les accents. Les numéros sont enregistrés sans espaces.
10. L'arrondi `P(arrondi)` s'applique au prix total des packs et au prix adhérent.
11. **Activités** : les activités de démonstration datent de septembre et octobre 2026, elles sont donc passées au 18/11/2026. La page Activités affiche « Toutes » par défaut, et le tableau de bord indique « Aucune activité à venir » tant qu'aucune activité future n'est créée.
12. Les listes sont paginées, triées et filtrées dans le navigateur : quelques centaines d'adhérents se chargent instantanément. L'export CSV porte sur les lignes filtrées (séparateur `;`, UTF-8 avec BOM, compatible Excel).
13. **Sécurité** : les sessions sont en mémoire, donc un redémarrage du serveur demande de se reconnecter. La protection CSRF repose sur le cookie `SameSite=Strict` et `HttpOnly`, et sur une API qui n'accepte que du JSON ou du multipart.
14. Le document remis à l'adhérent est un **reçu de paiement numéroté**, pas une facture avec mentions légales (ICE, IF, TVA). Le « reçu de salaire » est un document interne de suivi des versements : il ne remplace pas un bulletin de paie légal (CNSS, IR).
14 bis. **Base existante** : la migration V2 transforme l'abonnement de chaque adhérent en première période, sans perte de données. Comme aucun paiement n'existait avant, ces adhérents apparaissent *Impayé* jusqu'au premier encaissement. Recréez la base (`docker compose -f docker/docker-compose.yaml down -v`) pour repartir des données de démonstration, qui comprennent des paiements.

**Passage de Flyway à Liquibase** : une base PostgreSQL créée par l'ancienne version (migrations Flyway) n'a pas de table `databasechangelog` ; Liquibase rejouerait V1 et le démarrage échouerait. Recréez-la une fois avec `docker compose -f docker/docker-compose.yaml down -v` (les données de démonstration sont rechargées au démarrage).
15. Le port par défaut est **8090** (le 8080 est souvent déjà occupé). Il se change avec `PORT`.

## 9. Suite possible : application mobile

L'API REST est indépendante de l'interface. Une application mobile (Ionic/Capacitor avec Angular, ou native) pourra la réutiliser telle quelle. Il faudrait seulement ajouter une authentification par jeton (JWT) à côté de la session actuelle.
