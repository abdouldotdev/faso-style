/* ==========================================================================
   FASO STYLE — APPLICATION
   PWA mobile, JavaScript natif, aucune dépendance ni étape de build.
   ========================================================================== */

/* Le catalogue est fourni par data.js, chargé juste avant ce fichier :
   ATELIERS, CITIES, CITY_COLORS, CITY_REGIONS, SEED_REVIEWS,
   SPECIALTIES, SERVICES, SORTS, PRICE_LABELS. */

/* ---------------------------------------------------------------- helpers */
const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const norm = (s) =>
  (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;

const formatPhone = (p) =>
  "+" + p.replace(/^(\d{3})(\d{2})(\d{2})(\d{2})(\d{2})$/, "$1 $2 $3 $4 $5");

const delayLabel = (d) =>
  d <= 1 ? "24 h" : d <= 3 ? `${d} jours` : d < 14 ? `${d} jours` : `${Math.round(d / 7)} semaines`;

/** Budget en pastilles : Poppins n'a pas le glyphe du franc CFA. */
const priceMark = (n) =>
  `<span class="price-dots" aria-hidden="true">${
    [1, 2, 3].map((i) => `<i class="${i <= n ? "on" : ""}"></i>`).join("")
  }</span>`;

const icon = (id, size = 16, cls = "") =>
  `<svg class="${cls}" width="${size}" height="${size}" aria-hidden="true"><use href="#${id}"/></svg>`;

const initials = (name) =>
  name.replace(/^(Atelier|Maison)\s+/i, "")
      .split(/\s+/).filter(Boolean).slice(0, 2)
      .map((w) => w[0]).join("").toUpperCase();

const haptic = (ms = 8) => navigator.vibrate?.(ms);

/** Toutes les prises de contact aboutissent à ce numéro. */
const CONTACT_PHONE = "22665915220";
const waLink = (text) => `https://wa.me/${CONTACT_PHONE}?text=${encodeURIComponent(text)}`;

/* ------------------------------------------------------------- persistence */
const KEY = "fasostyle.v1";

const defaultStore = () => ({
  favorites: [],
  reviews: {},      // id -> [{author, rating, comment, at, mine:true}]
  requests: [],
  recent: [],
  theme: null,
});

function load() {
  try {
    return { ...defaultStore(), ...JSON.parse(localStorage.getItem(KEY) || "{}") };
  } catch {
    return defaultStore();
  }
}
let store = load();
const save = () => {
  try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* quota */ }
};

/* ------------------------------------------------------------------- state */
const state = {
  view: "decouvrir",
  q: "",
  city: null,
  specs: new Set(),
  services: new Set(),
  prices: new Set(),
  minRating: 0,
  maxDelay: 0,        // 0 = indifférent
  verifiedOnly: false,
  sort: "pertinence",
};

/* ------------------------------------------------------------------ ratings */
const reviewsOf = (id) => [...(SEED_REVIEWS[id] || []), ...(store.reviews[id] || [])];

const ratingOf = (id) => {
  const list = reviewsOf(id);
  if (!list.length) return 0;
  return list.reduce((s, r) => s + r.rating, 0) / list.length;
};

const byId = Object.fromEntries(ATELIERS.map((a) => [a.id, a]));

/* -------------------------------------------------------------- search core */
/** Index texte pré-calculé pour une recherche insensible aux accents. */
const INDEX = new Map(
  ATELIERS.map((a) => [
    a.id,
    norm([a.name, a.city, CITY_REGIONS[a.city], a.quartier, a.desc, ...a.specs, ...a.services].join(" ")),
  ])
);

function matchScore(a, tokens) {
  if (!tokens.length) return 1;
  const hay = INDEX.get(a.id);
  const name = norm(a.name);
  let score = 0;
  for (const t of tokens) {
    if (!hay.includes(t)) return 0;
    if (name.startsWith(t)) score += 6;
    else if (name.includes(t)) score += 4;
    else if (norm(a.specs.join(" ")).includes(t)) score += 3;
    else if (norm(a.city + " " + a.quartier).includes(t)) score += 2;
    else score += 1;
  }
  return score;
}

function activeFilterCount() {
  return (
    (state.city ? 1 : 0) +
    state.specs.size +
    state.services.size +
    state.prices.size +
    (state.minRating ? 1 : 0) +
    (state.maxDelay ? 1 : 0) +
    (state.verifiedOnly ? 1 : 0)
  );
}

function results() {
  const tokens = norm(state.q).split(/\s+/).filter(Boolean);

  let out = ATELIERS.map((a) => ({ a, score: matchScore(a, tokens) }))
    .filter(({ a, score }) => {
      if (!score) return false;
      if (state.city && a.city !== state.city) return false;
      if (state.specs.size && ![...state.specs].every((s) => a.specs.includes(s))) return false;
      if (state.services.size && ![...state.services].every((s) => a.services.includes(s))) return false;
      if (state.prices.size && !state.prices.has(a.price)) return false;
      if (state.verifiedOnly && !a.verified) return false;
      if (state.maxDelay && a.delayDays > state.maxDelay) return false;
      if (state.minRating && ratingOf(a.id) < state.minRating) return false;
      return true;
    });

  const cmp = {
    pertinence: (x, y) =>
      y.score - x.score ||
      Number(y.a.featured) - Number(x.a.featured) ||
      ratingOf(y.a.id) - ratingOf(x.a.id),
    note: (x, y) =>
      ratingOf(y.a.id) - ratingOf(x.a.id) || reviewsOf(y.a.id).length - reviewsOf(x.a.id).length,
    avis: (x, y) => reviewsOf(y.a.id).length - reviewsOf(x.a.id).length,
    delai: (x, y) => x.a.delayDays - y.a.delayDays,
    anciennete: (x, y) => x.a.since - y.a.since,
    nom: (x, y) => x.a.name.localeCompare(y.a.name, "fr"),
  }[state.sort];

  return out.sort(cmp).map((r) => r.a);
}

/* ------------------------------------------------------------------ toast */
let toastTimer;
function toast(msg) {
  const el = $("#toast");
  $("#toastText").textContent = msg;
  el.hidden = false;
  requestAnimationFrame(() => el.classList.add("is-open"));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove("is-open");
    setTimeout(() => (el.hidden = true), 300);
  }, 3000);
}

/* ------------------------------------------------------------- components */
function starsHTML(value, cls = "") {
  const r = Math.round(value);
  return `<span class="stars ${cls}" aria-label="${value.toFixed(1)} sur 5">${
    Array.from({ length: 5 }, (_, i) =>
      `<svg class="${i < r ? "" : "off"}" aria-hidden="true"><use href="#ic-star"/></svg>`).join("")
  }</span>`;
}

function atelierRow(a) {
  const rating = ratingOf(a.id);
  const count = reviewsOf(a.id).length;
  const fav = store.favorites.includes(a.id);
  return `
  <article class="item" data-open="${a.id}" role="button" tabindex="0" aria-label="Voir ${esc(a.name)}">
    <span class="avatar" style="background:${CITY_COLORS[a.city]}">${esc(initials(a.name))}</span>
    <div class="item__body">
      <h3 class="item__name">
        ${esc(a.name)}
        ${a.verified ? `<span class="verified" title="Atelier vérifié">${icon("ic-verified", 15)}</span>` : ""}
      </h3>
      <p class="item__meta">
        <span class="item__city" style="color:${CITY_COLORS[a.city]}">${esc(a.city)}</span>
        <span class="dot"></span><span>${esc(a.quartier)}</span>
      </p>
      <div class="item__rating">
        ${count ? starsHTML(rating) : ""}
        <span class="count">${count ? `${rating.toFixed(1)} · ${plural(count, "avis", "avis")}` : "Nouveau sur Faso Style"}</span>
      </div>
      <div class="item__tags">
        ${a.specs.slice(0, 3).map((s) => `<span class="tag">${esc(s)}</span>`).join("")}
      </div>
      <p class="item__facts">
        <span>${icon("ic-clock", 13)} ${delayLabel(a.delayDays)}</span>
        <span class="price" title="${PRICE_LABELS[a.price]}">${priceMark(a.price)}</span>
      </p>
    </div>
    <button class="fav ${fav ? "is-on" : ""}" data-fav="${a.id}"
            aria-pressed="${fav}" aria-label="${fav ? "Retirer du panier" : "Ajouter au panier"}">
      ${icon(fav ? "ic-cart-fill" : "ic-cart", 19)}
    </button>
  </article>`;
}

function atelierCard(a) {
  const rating = ratingOf(a.id);
  const count = reviewsOf(a.id).length;
  return `
  <article class="promo" data-open="${a.id}" role="button" tabindex="0">
    <div class="promo__top" style="--c:${CITY_COLORS[a.city]}">
      <span class="avatar" style="background:${CITY_COLORS[a.city]}">${esc(initials(a.name))}</span>
      ${a.verified ? `<span class="verified">${icon("ic-verified", 16)}</span>` : ""}
    </div>
    <h3 class="promo__name">${esc(a.name)}</h3>
    <p class="promo__city">${esc(a.city)} · ${esc(a.quartier)}</p>
    <div class="promo__foot">
      ${count ? `${starsHTML(rating)}<span class="count">${rating.toFixed(1)}</span>`
              : `<span class="count">Nouveau</span>`}
      <span class="price">${priceMark(a.price)}</span>
    </div>
  </article>`;
}

const emptyState = (title, text, iconId = "ic-inbox") => `
  <div class="empty">
    ${icon(iconId, 34)}
    <b class="t-title-sm">${esc(title)}</b>
    <p class="t-body-sm">${esc(text)}</p>
  </div>`;

/* -------------------------------------------------------------- rendering */
/** Les rails de chips ne vivent plus que dans la feuille de filtres :
    cette fonction ne fait rien si la page ne les expose pas. */
function renderRails() {
  const cityRail = $("#cityRail");
  const specRail = $("#specRail");
  if (!cityRail || !specRail) return;
  const counts = Object.fromEntries(CITIES.map((c) => [c.name, 0]));
  for (const a of ATELIERS) counts[a.city]++;

  cityRail.innerHTML =
    `<button class="chip" data-city="" aria-pressed="${!state.city}">Toutes les villes
       <span class="chip__count">${ATELIERS.length}</span></button>` +
    CITIES.map((c) => `
      <button class="chip" data-city="${esc(c.name)}" aria-pressed="${state.city === c.name}">
        <span class="chip__dot" style="background:${c.color}"></span>${esc(c.name)}
        <span class="chip__count">${counts[c.name]}</span>
      </button>`).join("");

  specRail.innerHTML = SPECIALTIES.map((s) => `
    <button class="chip chip--sm" data-spec="${esc(s.name)}" aria-pressed="${state.specs.has(s.name)}">
      ${esc(s.name)}<span class="chip__count">${s.count}</span>
    </button>`).join("");
}

function renderList() {
  const list = results();
  const filters = activeFilterCount();
  const searching = state.q.trim().length > 0;

  $("#listAteliers").innerHTML = list.length
    ? list.map(atelierRow).join("")
    : emptyState("Aucun atelier trouvé", "Essayez une autre ville, une autre spécialité ou élargissez vos filtres.", "ic-search");

  renderSelectionBar();

  $("#resultCount").textContent = list.length
    ? plural(list.length, "atelier", "ateliers")
    : "Aucun résultat";
  $("#resetFilters").hidden = !(filters || searching);
  $("#sortLabel").textContent = SORTS.find((s) => s.id === state.sort).label;

  const badge = $("#filterBadge");
  badge.hidden = filters === 0;
  badge.textContent = filters;

  // Les carrousels éditoriaux disparaissent dès qu'on cherche ou filtre.
  const browsing = !filters && !searching;
  $("#featuredSection").hidden = !browsing;
  $("#recentSection").hidden = !browsing || store.recent.length === 0;
}

function renderFeatured() {
  $("#featuredRail").innerHTML = ATELIERS.filter((a) => a.featured).map(atelierCard).join("");
}

function renderRecent() {
  const items = store.recent.map((id) => byId[id]).filter(Boolean);
  $("#recentSection").hidden = items.length === 0;
  $("#recentRail").innerHTML = items.map(atelierCard).join("");
}

/** Récapitulatif WhatsApp de la sélection (le « panier »). */
function selectionMessage() {
  const items = store.favorites.map((id) => byId[id]).filter(Boolean);
  const lignes = items.map((a, i) => [
    `${i + 1}. ${a.name}`,
    `   ${a.city} · ${a.quartier}`,
    `   ${a.specs.join(", ")}`,
    `   Délai indicatif : ${delayLabel(a.delayDays)} · Budget : ${PRICE_LABELS[a.price]}`,
  ].join("\n"));

  return [
    `Bonjour, je souhaite passer commande via Faso Style (${plural(items.length, "atelier", "ateliers")}) :`,
    "",
    lignes.join("\n\n"),
    "",
    "Envoyé depuis Faso Style — https://faso-style.vercel.app",
  ].join("\n");
}

function sendSelection() {
  const items = store.favorites.map((id) => byId[id]).filter(Boolean);
  if (!items.length) return;

  window.open(waLink(selectionMessage()), "_blank", "noopener");
}

function renderSelectionBar() {
  const n = store.favorites.filter((id) => byId[id]).length;
  const html = n === 0 ? "" : `
    <div class="selection-bar">
      <div class="grow">
        <b class="t-title-sm">${plural(n, "atelier", "ateliers")}</b>
      </div>
      <button class="btn btn--primary" data-send-selection>
        ${icon("ic-cart", 18, "icon")} Valider commande
      </button>
    </div>`;

  // Dans les favoris la barre suit la liste ; sur l'accueil elle flotte
  // au-dessus de la barre d'onglets pour rester visible en permanence.
  const fav = $("#selectionBar");
  if (fav) fav.innerHTML = html;
  const home = $("#selectionBarHome");
  if (home) home.innerHTML = html.replace("selection-bar", "selection-bar selection-bar--float");

  $(".app")?.classList.toggle("has-selection", n > 0);
}

function renderFavoris() {
  const items = store.favorites.map((id) => byId[id]).filter(Boolean);
  $("#listFavoris").innerHTML = items.length
    ? items.map(atelierRow).join("")
    : emptyState("Votre panier est vide",
        "Appuyez sur l'icône panier d'un atelier pour l'ajouter à votre commande.", "ic-cart");

  const badge = $("#favBadge");
  badge.hidden = items.length === 0;
  badge.textContent = items.length;

  renderSelectionBar();
}

function renderRequests() {
  const slot = $("#requestsSlot");
  if (!store.requests.length) { slot.innerHTML = ""; return; }
  slot.innerHTML = `
    <h3 class="t-label" style="margin-bottom:var(--space-3)">Mes demandes (${store.requests.length})</h3>
    <div class="stack gap-2">
      ${store.requests.map((r, i) => `
        <div class="card card--flat request">
          <div class="grow">
            <b class="t-title-sm">${esc(r.name)}</b>
            <p class="t-body-sm t-muted">${esc(r.city)}${r.quartier ? " · " + esc(r.quartier) : ""} — ${esc(r.spec)}</p>
            <p class="t-body-sm t-subtle">${esc(r.phone)}</p>
          </div>
          <button class="btn btn--icon" data-del-request="${i}" aria-label="Supprimer la demande">
            ${icon("ic-close", 16)}
          </button>
        </div>`).join("")}
    </div>`;
}

function renderStats() {
  const set = (sel, value) => { const el = $(sel); if (el) el.textContent = value; };
  set("#statAteliers", ATELIERS.length);
  set("#statVilles", CITIES.length);
  set("#statAvis", ATELIERS.reduce((n, a) => n + reviewsOf(a.id).length, 0));

  const perCity = CITIES.map((c) => ({
    ...c, n: ATELIERS.filter((a) => a.city === c.name).length,
  })).sort((x, y) => y.n - x.n);
  const max = perCity[0].n;

  $("#statGrid").innerHTML = perCity.map((c) => `
    <div class="stat-bar">
      <div class="row between">
        <span class="t-label">${esc(c.name)}</span>
        <span class="t-body-sm t-subtle">${c.n}</span>
      </div>
      <div class="stat-bar__track">
        <i style="width:${(c.n / max) * 100}%;background:${c.color}"></i>
      </div>
      <span class="t-body-sm t-subtle">${esc(c.region)}</span>
    </div>`).join("");
}

/* ------------------------------------------------------------------ sheet */
const sheet = $("#sheet");
const scrim = $("#sheetScrim");
let lastFocus = null;
let sheetHideTimer;

function openSheet({ head, body, foot }) {
  lastFocus = document.activeElement;
  $("#sheetHead").innerHTML = head;
  $("#sheetBody").innerHTML = body;
  const footEl = $("#sheetFoot");
  footEl.innerHTML = foot || "";
  footEl.hidden = !foot;

  clearTimeout(sheetHideTimer);
  sheet.hidden = false;
  scrim.hidden = false;
  // Reflow synchrone : la transition démarre sans callback différé, sinon une
  // fermeture immédiate serait annulée par le rAF encore en attente.
  void sheet.offsetHeight;
  sheet.classList.add("is-open");
  scrim.classList.add("is-open");
  document.body.style.overflow = "hidden";
  sheet.querySelector("button, input, a")?.focus({ preventScroll: true });
}

function closeSheet() {
  sheet.classList.remove("is-open");
  scrim.classList.remove("is-open");
  document.body.style.overflow = "";
  clearTimeout(sheetHideTimer);
  sheetHideTimer = setTimeout(() => { sheet.hidden = true; scrim.hidden = true; }, 320);
  lastFocus?.focus?.({ preventScroll: true });
}

/* --------------------------------------------------------- sheet : profil */
let pickedStars = 5;

function profileHead(a) {
  const rating = ratingOf(a.id);
  const count = reviewsOf(a.id).length;
  return `
    <div class="row gap-3">
      <span class="avatar avatar--lg" style="background:${CITY_COLORS[a.city]}">${esc(initials(a.name))}</span>
      <div class="grow" style="min-width:0">
        <h3 class="t-title-md" id="sheetTitle">${esc(a.name)}
          ${a.verified ? `<span class="verified">${icon("ic-verified", 15)}</span>` : ""}</h3>
        <p class="t-body-sm t-muted">${esc(a.city)} · ${esc(a.quartier)}</p>
        <p class="t-body-sm t-subtle">${count ? `${rating.toFixed(1)}★ · ${plural(count, "avis", "avis")}` : "Nouveau sur Faso Style"}</p>
      </div>
      <button class="btn btn--icon" data-close-sheet aria-label="Fermer">${icon("ic-close", 19)}</button>
    </div>`;
}

function profileBody(a) {
  const list = reviewsOf(a.id);
  const rating = ratingOf(a.id);
  const dist = [5, 4, 3, 2, 1].map((n) => ({ n, c: list.filter((r) => r.rating === n).length }));
  const fav = store.favorites.includes(a.id);

  return `
    <p class="t-body t-muted">${esc(a.desc)}</p>

    <div class="facts">
      <div class="fact">${icon("ic-clock", 17)}<b>${delayLabel(a.delayDays)}</b><span>délai indicatif</span></div>
      <div class="fact"><b class="price">${priceMark(a.price)}</b><span>${PRICE_LABELS[a.price]}</span></div>
      <div class="fact">${icon("ic-history", 17)}<b>${new Date().getFullYear() - a.since} ans</b><span>d'activité</span></div>
    </div>

    <div class="profile__block">
      <h4>Spécialités</h4>
      <div class="row wrap gap-2">${a.specs.map((s) => `<span class="tag tag--lg">${esc(s)}</span>`).join("")}</div>
    </div>

    <div class="profile__block">
      <h4>Services</h4>
      <ul class="checks">${a.services.map((s) => `<li>${icon("ic-check", 15)}${esc(s)}</li>`).join("")}</ul>
    </div>

    <div class="profile__block">
      <h4>Avis clients</h4>
      ${list.length ? `
        <div class="rating-summary">
          <div class="rating-summary__score">
            <b>${rating.toFixed(1)}</b>
            ${starsHTML(rating, "stars--lg")}
            <span class="t-body-sm t-subtle">${plural(list.length, "avis", "avis")}</span>
          </div>
          <div class="rating-summary__dist">
            ${dist.map((d) => `
              <div class="dist-row">
                <span>${d.n}★</span>
                <i class="dist-track"><b style="width:${list.length ? (d.c / list.length) * 100 : 0}%"></b></i>
                <span>${d.c}</span>
              </div>`).join("")}
          </div>
        </div>
        <div class="reviews">
          ${list.slice().reverse().map((r) => `
            <div class="review">
              <div class="review__head">
                <span class="review__author">${esc(r.author)}
                  ${r.mine ? `<span class="review__mine">votre avis</span>` : ""}</span>
                ${starsHTML(r.rating)}
              </div>
              <p class="review__text">${esc(r.comment)}</p>
            </div>`).join("")}
        </div>`
      : `<p class="t-body-sm t-subtle">Aucun avis pour le moment. Soyez le premier à partager votre expérience.</p>`}
    </div>

    <form class="profile__block review-form" id="reviewForm" data-atelier="${a.id}">
      <h4>Laisser un avis</h4>
      <div class="star-picker" id="starPicker" role="radiogroup" aria-label="Note"></div>
      <input class="input" id="rv-author" placeholder="Votre nom" required maxlength="40">
      <textarea class="input" id="rv-comment" placeholder="Votre expérience avec cet atelier…" required maxlength="400"></textarea>
      <button class="btn btn--primary btn--block" type="submit">Publier mon avis</button>
      <p class="field__hint">Votre avis est enregistré sur cet appareil.</p>
    </form>

    <button class="btn ${fav ? "btn--tonal" : "btn--outline"} btn--block" data-fav="${a.id}" style="margin-top:var(--space-5)">
      ${icon(fav ? "ic-cart-fill" : "ic-cart", 18)} ${fav ? "Retirer du panier" : "Ajouter au panier"}
    </button>`;
}

function profileFoot(a) {
  const msg = [
    "Bonjour, je vous contacte via Faso Style au sujet de :",
    "",
    `${a.name}`,
    `${a.city} · ${a.quartier}`,
    `${a.specs.join(", ")}`,
    `Délai indicatif : ${delayLabel(a.delayDays)} · Budget : ${PRICE_LABELS[a.price]}`,
    "",
    "J'aimerais avoir des renseignements.",
  ].join("\n");

  return `
    <div class="sheet__actions">
      <a class="btn btn--primary grow" href="${waLink(msg)}" target="_blank" rel="noopener">
        ${icon("ic-whatsapp", 18, "icon")} WhatsApp
      </a>
      <a class="btn btn--outline btn--icon" href="tel:+${CONTACT_PHONE}" aria-label="Appeler Faso Style">${icon("ic-phone", 18)}</a>
      <button class="btn btn--outline btn--icon" data-share="${a.id}" aria-label="Partager">${icon("ic-share", 18)}</button>
    </div>
    <p class="sheet__phone">${formatPhone(CONTACT_PHONE)}</p>`;
}

function openProfile(id) {
  const a = byId[id];
  if (!a) return;

  store.recent = [id, ...store.recent.filter((r) => r !== id)].slice(0, 8);
  save();
  renderRecent();

  pickedStars = 5;
  openSheet({ head: profileHead(a), body: profileBody(a), foot: profileFoot(a) });
  renderStarPicker();
}

function renderStarPicker() {
  const el = $("#starPicker");
  if (!el) return;
  el.innerHTML = Array.from({ length: 5 }, (_, i) => `
    <button type="button" class="${i < pickedStars ? "on" : ""}" data-star="${i + 1}"
            role="radio" aria-checked="${i + 1 === pickedStars}" aria-label="${i + 1} étoile${i ? "s" : ""}">
      ${icon("ic-star", 30)}
    </button>`).join("");
}

/* ------------------------------------------------- sheet : comment ça marche */
const STEPS = [
  ["Cherchez", "Filtrez par ville, spécialité, budget, délai ou service : livraison, retouches, essayage à domicile, location de tenues…"],
  ["Comparez", "Chaque fiche présente le quartier, le délai indicatif, le niveau de prix, la note moyenne et les avis clients."],
  ["Sélectionnez", "Ajoutez plusieurs ateliers à votre sélection : elle vous suit depuis l'accueil comme depuis vos favoris."],
  ["Contactez", "Un appui envoie sur WhatsApp le récapitulatif complet de votre sélection, message déjà pré-rempli."],
];

function howItWorksSheet() {
  const head = `
    <div class="row between gap-3">
      <h3 class="t-title-md" id="sheetTitle">Comment ça marche</h3>
      <button class="btn btn--icon" data-close-sheet aria-label="Fermer">${icon("ic-close", 19)}</button>
    </div>`;

  const body = `
    <div class="steps">
      ${STEPS.map(([titre, texte], i) => `
        <div class="step">
          <span class="step__idx">${i + 1}</span>
          <div>
            <h3>${titre}</h3>
            <p>${texte}</p>
          </div>
        </div>`).join("")}
    </div>`;

  const foot = `
    <div class="sheet__actions">
      <button class="btn btn--primary btn--block" data-close-sheet>J'ai compris</button>
    </div>`;

  openSheet({ head, body, foot });
}

/* -------------------------------------------------------- sheet : filtres */
function filtersSheet() {
  const head = `
    <div class="row between gap-3">
      <h3 class="t-title-md" id="sheetTitle">Filtres & tri</h3>
      <button class="btn btn--icon" data-close-sheet aria-label="Fermer">${icon("ic-close", 19)}</button>
    </div>`;

  const body = `
    <div class="profile__block">
      <h4>Trier par</h4>
      <div class="options">
        ${SORTS.map((s) => `
          <button class="option" data-sort="${s.id}" aria-pressed="${state.sort === s.id}">
            <span>${s.label}</span>${icon("ic-check", 17, "option__check")}
          </button>`).join("")}
      </div>
    </div>

    <div class="profile__block">
      <h4>Ville</h4>
      <div class="row wrap gap-2">
        <button class="chip" data-city="" aria-pressed="${!state.city}">Toutes</button>
        ${CITIES.map((c) => `
          <button class="chip" data-city="${esc(c.name)}" aria-pressed="${state.city === c.name}">
            <span class="chip__dot" style="background:${c.color}"></span>${esc(c.name)}
          </button>`).join("")}
      </div>
    </div>

    <div class="profile__block">
      <h4>Spécialités</h4>
      <div class="row wrap gap-2">
        ${SPECIALTIES.map((s) => `
          <button class="chip chip--sm" data-spec="${esc(s.name)}" aria-pressed="${state.specs.has(s.name)}">
            ${esc(s.name)}<span class="chip__count">${s.count}</span>
          </button>`).join("")}
      </div>
    </div>

    <div class="profile__block">
      <h4>Services</h4>
      <div class="row wrap gap-2">
        ${SERVICES.map((s) => `
          <button class="chip chip--sm" data-service="${esc(s)}" aria-pressed="${state.services.has(s)}">${esc(s)}</button>
        `).join("")}
      </div>
    </div>

    <div class="profile__block">
      <h4>Budget</h4>
      <div class="row wrap gap-2">
        ${[1, 2, 3].map((p) => `
          <button class="chip" data-price="${p}" aria-pressed="${state.prices.has(p)}">
            <span class="price">${priceMark(p)}</span> ${PRICE_LABELS[p]}
          </button>`).join("")}
      </div>
    </div>

    <div class="profile__block">
      <h4>Note minimum</h4>
      <div class="row wrap gap-2">
        ${[0, 3, 4, 4.5].map((r) => `
          <button class="chip" data-rating="${r}" aria-pressed="${state.minRating === r}">
            ${r === 0 ? "Toutes" : `${r}★ et +`}
          </button>`).join("")}
      </div>
    </div>

    <div class="profile__block">
      <h4>Délai maximum</h4>
      <div class="row wrap gap-2">
        ${[0, 3, 7, 14].map((d) => `
          <button class="chip" data-delay="${d}" aria-pressed="${state.maxDelay === d}">
            ${d === 0 ? "Indifférent" : `${d} jours`}
          </button>`).join("")}
      </div>
    </div>

    <div class="profile__block">
      <button class="switch" data-verified aria-pressed="${state.verifiedOnly}">
        <span>
          <b class="t-title-sm">Ateliers vérifiés uniquement</b>
          <span class="t-body-sm t-muted">Coordonnées confirmées par l'équipe</span>
        </span>
        <i class="switch__track"><i class="switch__thumb"></i></i>
      </button>
    </div>`;

  const foot = `
    <div class="sheet__actions">
      <button class="btn btn--outline" data-clear-filters>Tout effacer</button>
      <button class="btn btn--primary grow" data-close-sheet id="applyFilters">
        Voir ${plural(results().length, "atelier", "ateliers")}
      </button>
    </div>`;

  openSheet({ head, body, foot });
}

function refreshFiltersSheet() {
  if (sheet.hidden || !$("[data-clear-filters]")) return;
  const scrollTop = $("#sheetBody").scrollTop;
  filtersSheet();
  $("#sheetBody").scrollTop = scrollTop;
}

/* --------------------------------------------------------------- actions */
function toggleFav(id) {
  const i = store.favorites.indexOf(id);
  if (i >= 0) { store.favorites.splice(i, 1); toast("Retiré du panier"); }
  else { store.favorites.unshift(id); toast("Ajouté au panier"); }
  save();
  haptic();
  renderList();
  renderFavoris();
  if (!sheet.hidden && $("#reviewForm")) {
    const a = byId[$("#reviewForm").dataset.atelier];
    if (a) { $("#sheetBody").innerHTML = profileBody(a); renderStarPicker(); }
  }
}

async function share(id) {
  const a = byId[id];
  const data = {
    title: `${a.name} — Faso Style`,
    text: `${a.name}, ${a.specs.join(", ").toLowerCase()} à ${a.city} (${a.quartier}).`,
    url: location.origin + location.pathname + "#/atelier/" + a.id,
  };
  try {
    if (navigator.share) await navigator.share(data);
    else { await navigator.clipboard.writeText(`${data.text} ${data.url}`); toast("Lien copié"); }
  } catch { /* annulé par l'utilisateur */ }
}

/** Vues atteignables ; « rejoindre » n'a pas d'onglet, on y entre depuis le profil. */
const VIEWS = ["decouvrir", "panier", "rejoindre", "profil"];
const PARENT_VIEW = { rejoindre: "profil" };

function setView(view) {
  state.view = view;
  $$(".view").forEach((v) => v.classList.toggle("is-active", v.id === `view-${view}`));
  $$(".tab").forEach((t) =>
    t.setAttribute("aria-selected", String(t.dataset.view === (PARENT_VIEW[view] || view))));

  const back = $("#appbarBack");
  const logo = $("#appbarLogo");
  if (back) back.hidden = !PARENT_VIEW[view];
  // toggleAttribute : la propriété .hidden n'existe pas sur un élément SVG.
  if (logo) logo.toggleAttribute("hidden", Boolean(PARENT_VIEW[view]));

  const titles = {
    decouvrir: ["Faso Style", "Annuaire des couturiers"],
    panier:    ["Mon panier", "Ateliers retenus"],
    rejoindre: ["Inscrire mon atelier", "Rejoindre l'annuaire"],
    profil:    ["Profil", "Réglages et informations"],
  }[view];
  $("#appbarTitle").textContent = titles[0];
  $("#appbarSub").textContent = titles[1];
  $("#main").scrollTo({ top: 0 });
  window.scrollTo({ top: 0 });
  if (location.hash !== `#/${view}`) history.replaceState(null, "", `#/${view}`);
}

function clearFilters() {
  state.city = null;
  state.specs.clear();
  state.services.clear();
  state.prices.clear();
  state.minRating = 0;
  state.maxDelay = 0;
  state.verifiedOnly = false;
  state.q = "";
  $("#searchInput").value = "";
  $("#searchClear").hidden = true;
  renderRails();
  renderList();
  renderSuggestions();
}

/* --------------------------------------------------------- suggestions UX */
function renderSuggestions() {
  const slot = $("#suggestSlot");
  const q = norm(state.q.trim());
  if (q.length < 2) { slot.innerHTML = ""; return; }

  const pool = [
    ...SPECIALTIES.map((s) => ({ label: s.name, kind: "spec" })),
    ...CITIES.map((c) => ({ label: c.name, kind: "city" })),
    ...SERVICES.map((s) => ({ label: s, kind: "service" })),
  ].filter((x) => norm(x.label).includes(q)).slice(0, 4);

  slot.innerHTML = pool.length
    ? `<div class="suggest">${pool.map((x) => `
        <button class="suggest__item" data-suggest="${x.kind}" data-value="${esc(x.label)}">
          ${icon(x.kind === "city" ? "ic-pin" : x.kind === "spec" ? "ic-scissors" : "ic-check", 15)}
          <span>${esc(x.label)}</span>
          <em>${x.kind === "city" ? "ville" : x.kind === "spec" ? "spécialité" : "service"}</em>
        </button>`).join("")}</div>`
    : "";
}

/* ------------------------------------------------------------------ theme */
function applyTheme(mode) {
  const root = document.documentElement;
  if (mode) root.dataset.theme = mode; else delete root.dataset.theme;
  const dark = mode
    ? mode === "dark"
    : matchMedia("(prefers-color-scheme: dark)").matches;
  $("#themeToggle").innerHTML = icon(dark ? "ic-sun" : "ic-moon", 20);
  $$('meta[name="theme-color"]').forEach((m) => m.remove());
  const meta = document.createElement("meta");
  meta.name = "theme-color";
  meta.content = dark ? "#14110F" : "#FBF8F3";
  document.head.appendChild(meta);
}

/* -------------------------------------------------------------- install */
let deferredPrompt = null;

function renderInstall() {
  const isStandalone =
    matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const slot = $("#installSlot");
  const cta = $("#installCta");

  if (isStandalone) {
    slot.innerHTML = "";
    cta.innerHTML = `<p class="t-body-sm t-subtle">${icon("ic-check", 15)} Application déjà installée sur cet appareil.</p>`;
    return;
  }

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (deferredPrompt) {
    slot.innerHTML = `
      <div class="banner">
        ${icon("ic-download", 22)}
        <div class="banner__text">
          <b>Installer Faso Style</b>
          <span>Accès hors connexion, comme une vraie application.</span>
        </div>
        <button class="btn btn--primary btn--sm" data-install>Installer</button>
      </div>`;
    cta.innerHTML = `<button class="btn btn--primary btn--block" data-install>${icon("ic-download", 18)} Installer l'application</button>`;
  } else {
    slot.innerHTML = "";
    cta.innerHTML = isIOS
      ? `<p class="t-body-sm t-muted">Sur iPhone : appuyez sur <b>Partager</b> puis <b>« Sur l'écran d'accueil »</b>.</p>`
      : `<p class="t-body-sm t-muted">Ouvrez le menu de votre navigateur puis <b>« Installer l'application »</b>.</p>`;
  }
}

/* ------------------------------------------------------------------ events */
function bind() {
  /* navigation */
  // Délégation : un clic sur l'icône ou sur le libellé compte pour l'onglet.
  $(".tabbar").addEventListener("click", (e) => {
    const tab = e.target.closest(".tab");
    if (!tab) return;
    haptic();
    setView(tab.dataset.view);
  });

  /* recherche */
  const input = $("#searchInput");
  let debounce;
  input.addEventListener("input", () => {
    state.q = input.value;
    $("#searchClear").hidden = !input.value;
    clearTimeout(debounce);
    debounce = setTimeout(() => { renderList(); renderSuggestions(); }, 120);
  });
  input.addEventListener("search", () => { state.q = input.value; renderList(); renderSuggestions(); });
  $("#searchClear").addEventListener("click", () => {
    input.value = ""; state.q = ""; $("#searchClear").hidden = true;
    renderList(); renderSuggestions(); input.focus();
  });

  $("#appbarBack").addEventListener("click", () => setView(PARENT_VIEW[state.view] || "decouvrir"));
  $("#openFilters").addEventListener("click", () => { haptic(); filtersSheet(); });
  $("#sortBtn").addEventListener("click", () => { haptic(); filtersSheet(); });
  $("#resetFilters").addEventListener("click", () => { clearFilters(); toast("Filtres effacés"); });
  $("#themeToggle").addEventListener("click", () => {
    const dark = document.documentElement.dataset.theme
      ? document.documentElement.dataset.theme === "dark"
      : matchMedia("(prefers-color-scheme: dark)").matches;
    store.theme = dark ? "light" : "dark";
    save();
    applyTheme(store.theme);
  });

  /* délégation globale */
  document.addEventListener("click", (e) => {
    const t = e.target;

    const fav = t.closest("[data-fav]");
    if (fav) { e.stopPropagation(); toggleFav(fav.dataset.fav); return; }

    const open = t.closest("[data-open]");
    if (open) { openProfile(open.dataset.open); return; }

    if (t.closest("[data-close-sheet]")) { closeSheet(); return; }

    const shareBtn = t.closest("[data-share]");
    if (shareBtn) { share(shareBtn.dataset.share); return; }

    const city = t.closest("[data-city]");
    if (city) {
      state.city = city.dataset.city || null;
      renderRails(); renderList(); refreshFiltersSheet();
      return;
    }

    const spec = t.closest("[data-spec]");
    if (spec) {
      const v = spec.dataset.spec;
      state.specs.has(v) ? state.specs.delete(v) : state.specs.add(v);
      renderRails(); renderList(); refreshFiltersSheet();
      return;
    }

    const service = t.closest("[data-service]");
    if (service) {
      const v = service.dataset.service;
      state.services.has(v) ? state.services.delete(v) : state.services.add(v);
      renderList(); refreshFiltersSheet();
      return;
    }

    const price = t.closest("[data-price]");
    if (price) {
      const v = Number(price.dataset.price);
      state.prices.has(v) ? state.prices.delete(v) : state.prices.add(v);
      renderList(); refreshFiltersSheet();
      return;
    }

    const rating = t.closest("[data-rating]");
    if (rating) { state.minRating = Number(rating.dataset.rating); renderList(); refreshFiltersSheet(); return; }

    const delay = t.closest("[data-delay]");
    if (delay) { state.maxDelay = Number(delay.dataset.delay); renderList(); refreshFiltersSheet(); return; }

    if (t.closest("[data-verified]")) {
      state.verifiedOnly = !state.verifiedOnly; renderList(); refreshFiltersSheet(); return;
    }

    const sort = t.closest("[data-sort]");
    if (sort) { state.sort = sort.dataset.sort; renderList(); refreshFiltersSheet(); return; }

    if (t.closest("[data-clear-filters]")) { clearFilters(); refreshFiltersSheet(); return; }

    const star = t.closest("[data-star]");
    if (star) { pickedStars = Number(star.dataset.star); renderStarPicker(); return; }

    const sug = t.closest("[data-suggest]");
    if (sug) {
      const { suggest, value } = sug.dataset;
      if (suggest === "city") state.city = value;
      if (suggest === "spec") state.specs.add(value);
      if (suggest === "service") state.services.add(value);
      state.q = ""; $("#searchInput").value = ""; $("#searchClear").hidden = true;
      renderRails(); renderList(); renderSuggestions();
      return;
    }

    const del = t.closest("[data-del-request]");
    if (del) {
      store.requests.splice(Number(del.dataset.delRequest), 1);
      save(); renderRequests(); toast("Demande supprimée");
      return;
    }

    if (t.closest('[data-sheet="how"]')) { haptic(); howItWorksSheet(); return; }

    const goto = t.closest("[data-goto]");
    if (goto) { haptic(); setView(goto.dataset.goto); return; }

    if (t.closest("[data-send-selection]")) { haptic(); sendSelection(); return; }

    if (t.closest("[data-install]")) {
      deferredPrompt?.prompt();
      deferredPrompt = null;
      return;
    }
  });

  /* clavier : ouvrir une fiche */
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !sheet.hidden) closeSheet();
    if ((e.key === "Enter" || e.key === " ") && e.target.matches("[data-open]")) {
      e.preventDefault();
      openProfile(e.target.dataset.open);
    }
  });

  scrim.addEventListener("click", closeSheet);

  /* avis */
  document.addEventListener("submit", (e) => {
    if (e.target.id === "reviewForm") {
      e.preventDefault();
      const id = e.target.dataset.atelier;
      const author = $("#rv-author").value.trim();
      const comment = $("#rv-comment").value.trim();
      if (!author || !comment) { toast("Merci de remplir votre nom et votre avis"); return; }
      (store.reviews[id] ||= []).push({
        author, rating: pickedStars, comment, at: Date.now(), mine: true,
      });
      save();
      const a = byId[id];
      $("#sheetBody").innerHTML = profileBody(a);
      $("#sheetHead").innerHTML = profileHead(a);
      pickedStars = 5;
      renderStarPicker();
      $("#sheetBody").scrollTo({ top: 0, behavior: "smooth" });
      renderList(); renderStats();
      toast("Merci ! Votre avis est publié.");
      return;
    }

    if (e.target.id === "partnerForm") {
      e.preventDefault();
      const f = e.target;
      const get = (id) => $("#" + id).value.trim();
      const fields = [
        ["p-name", "Indiquez le nom de votre maison"],
        ["p-city", "Choisissez une ville"],
        ["p-spec", "Indiquez votre spécialité principale"],
        ["p-phone", "Indiquez un numéro WhatsApp"],
      ];
      let ok = true;
      for (const [id, msg] of fields) {
        const err = $(`[data-error-for="${id}"]`);
        const empty = !get(id);
        if (err) { err.textContent = empty ? msg : ""; err.hidden = !empty; }
        $("#" + id).classList.toggle("is-invalid", empty);
        if (empty) ok = false;
      }
      const phone = get("p-phone");
      if (ok && phone.replace(/\D/g, "").length < 8) {
        const err = $('[data-error-for="p-phone"]');
        err.textContent = "Numéro trop court — utilisez le format +226 …";
        err.hidden = false;
        $("#p-phone").classList.add("is-invalid");
        ok = false;
      }
      if (!ok) { toast("Quelques champs sont à compléter"); return; }

      store.requests.unshift({
        name: get("p-name"), city: get("p-city"), quartier: get("p-quartier"),
        spec: get("p-spec"), phone,
        services: $$("#pServices [aria-pressed='true']").map((b) => b.dataset.pservice),
        at: Date.now(),
      });
      save();
      f.reset();
      $$("#pServices .chip").forEach((b) => b.setAttribute("aria-pressed", "false"));
      renderRequests();
      toast("Demande enregistrée — merci !");
      return;
    }
  });

  /* services du formulaire partenaire */
  $("#pServices").addEventListener("click", (e) => {
    const b = e.target.closest("[data-pservice]");
    if (!b) return;
    b.setAttribute("aria-pressed", b.getAttribute("aria-pressed") === "true" ? "false" : "true");
  });

  $("#resetData")?.addEventListener("click", () => {
    if (!confirm("Effacer favoris, avis, historique et demandes enregistrés sur cet appareil ?")) return;
    store = defaultStore();
    save();
    renderList(); renderFavoris(); renderRequests(); renderRecent(); renderStats();
    toast("Données locales effacées");
  });

  /* ombre de l'app bar au scroll */
  const scroller = $("#main");
  const onScroll = () => {
    const y = scroller.scrollTop || window.scrollY;
    $("#appbar").classList.toggle("is-scrolled", y > 4);
  };
  scroller.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("scroll", onScroll, { passive: true });

  /* connectivité */
  const bar = $("#offlineBar");
  const netState = () => bar.classList.toggle("is-open", !navigator.onLine);
  addEventListener("online", () => { netState(); toast("Connexion rétablie"); });
  addEventListener("offline", netState);
  netState();

  /* install */
  addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    renderInstall();
  });
  addEventListener("appinstalled", () => { deferredPrompt = null; renderInstall(); toast("Faso Style est installée"); });

  /* routage minimal */
  addEventListener("hashchange", route);
}

function route() {
  const h = location.hash.replace(/^#\//, "");
  const [seg, param] = h.split("/");
  if (seg === "atelier" && byId[param]) { setView("decouvrir"); openProfile(param); return; }
  if (seg === "infos") { setView("profil"); return; }    // anciens liens
  if (seg === "favoris") { setView("panier"); return; }
  if (VIEWS.includes(seg)) setView(seg);
}

/* -------------------------------------------------------------- bootstrap */
function fillPartnerForm() {
  $("#p-city").insertAdjacentHTML("beforeend",
    CITIES.map((c) => `<option>${esc(c.name)}</option>`).join(""));
  $("#specList").innerHTML = SPECIALTIES.map((s) => `<option value="${esc(s.name)}">`).join("");
  $("#pServices").innerHTML = SERVICES.map((s) =>
    `<button type="button" class="chip chip--sm" data-pservice="${esc(s)}" aria-pressed="false">${esc(s)}</button>`).join("");
}

function init() {
  applyTheme(store.theme);
  fillPartnerForm();
  renderRails();
  renderFeatured();
  renderRecent();
  renderList();
  renderFavoris();
  renderRequests();
  renderStats();
  renderInstall();
  bind();
  route();

  if ("serviceWorker" in navigator) {
    addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
  }
}

init();
