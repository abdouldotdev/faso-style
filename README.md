# Faso Style

**L'annuaire des couturiers, stylistes et créateurs du Burkina Faso.**
Application web progressive (PWA) mobile — installable, utilisable hors connexion,
sans compte ni serveur.

Le catalogue livré avec l'application sert de jeu de démarrage : il se remplace
intégralement en éditant `assets/js/data.js`, sans toucher au reste du code.

---

## Fonctionnalités

**Catalogue** — 44 ateliers, 11 villes (Ouagadougou, Bobo-Dioulasso, Koudougou,
Ouahigouya, Banfora, Fada N'Gourma, Kaya, Dédougou, Gaoua, Tenkodogo, Dori),
20 spécialités et 49 avis clients.

**Recherche & filtres**
- Recherche plein texte insensible aux accents (nom, ville, quartier, spécialité, service, description) avec score de pertinence
- Suggestions en cours de frappe (ville / spécialité / service)
- Facettes : ville, spécialités (cumulables), services, budget, note minimum, délai maximum, ateliers vérifiés
- 6 tris : pertinence, mieux notés, plus d'avis, délai le plus court, plus anciens, alphabétique

**Fiche atelier** — délai indicatif, niveau de budget, ancienneté, spécialités,
services, distribution des notes, avis clients, publication d'un avis,
contact WhatsApp pré-rempli, appel direct, partage natif.

**Sélection multiple** — les favoris forment un panier : un bouton envoie sur
WhatsApp le récapitulatif complet (nom, ville, quartier, spécialités, délai,
budget, numéro de chaque atelier). Avec un seul atelier retenu, le bouton ouvre
directement sa conversation.

**Le reste** — favoris persistants, historique de consultation, mise en avant
éditoriale, formulaire d'inscription pour les ateliers, thème clair/sombre,
indicateur hors connexion, installation sur l'écran d'accueil.

## Design system

Tout part de `assets/css/design-system.css` : rampes de couleur (indigo, ocre,
sable), jetons sémantiques clair/sombre, échelle d'espacement de base 4 px,
rayons, élévations teintées, échelle typographique et courbes d'animation.
`assets/css/app.css` ne fait que composer l'app par-dessus.

Règle de couleur : fond neutre chaud, **indigo pour toutes les actions**,
**ocre réservé aux accents** (notes, budget, badges). Chaque ville a sa
couleur d'identification, utilisée uniquement sur les pastilles et les avatars.

Typographie : **Poppins** (400/500/600/700), auto-hébergée en woff2 —
sous-ensembles latin et latin-ext, 48 Ko au total, aucun appel à Google Fonts.

## Stack

Aucune dépendance, aucune étape de build. HTML, CSS et JavaScript natif
servis tels quels.

```
index.html                  app shell + sprite d'icônes SVG
manifest.webmanifest        manifeste PWA (+ raccourcis)
sw.js                       service worker (app shell précaché, reste en SWR)
vercel.json                 en-têtes de cache et de sécurité
assets/css/design-system.css  jetons + primitives + composants
assets/css/app.css            layout, navigation, vues
assets/js/data.js             catalogue (ateliers, villes, avis)
assets/js/app.js              état, recherche, rendu, interactions
assets/fonts/                 Poppins woff2
assets/icons/                 icônes PWA + image Open Graph
```

## Ouvrir l'application

Un simple double-clic sur `index.html` suffit : l'application fonctionne en
`file://`. Le service worker et l'installation sur l'écran d'accueil, eux,
nécessitent un vrai serveur (voir ci-dessous).

## Développement

```bash
python3 -m http.server 8000     # ou n'importe quel serveur statique
open http://localhost:8000
```

Un serveur HTTP est nécessaire pour tester le service worker et
l'installation ; le reste de l'application fonctionne aussi en `file://`.

## Déploiement

Site statique. Sur Vercel, aucune configuration de build n'est requise.

```bash
vercel --prod
```

## Données locales

Favoris, avis publiés, historique et demandes d'inscription sont stockés dans le
`localStorage` de l'appareil, sous la clé `fasostyle.v1`. Aucun compte, aucun
serveur, aucun traceur. L'écran **Infos** permet de tout effacer.

## Crédits

Conçu par **Ariane Builiou**.

## Licence

MIT.
