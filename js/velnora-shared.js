/* ================================================================
   VELNORA — Comportements JS partagés, produit voyageur
   Deux fonctions communes à plusieurs écrans, isolées ici pour
   éviter la duplication (identique auparavant sur 5 écrans).
   ================================================================ */

/**
 * Active la pseudo-classe :active au tap sur iOS Safari (qui l'ignore sans
 * écouteur tactile enregistré) — condition nécessaire au retour tactile
 * (compression douce) défini dans velnora-shared.css sur tous les écrans.
 */
document.addEventListener('touchstart', function(){}, {passive:true});

/**
 * Recul discret de la back-affordance au défilement vers le bas,
 * réapparition immédiate au moindre geste vers le haut.
 * Réservé aux écrans à défilement long (Guide pratique, La propriété,
 * Recommandations, Contacts utiles, Check-in/Check-out).
 * Les écrans courts (Wi-Fi & Accès, Départ) gardent la back-affordance
 * fixe en permanence et n'appellent pas cette fonction.
 */
function initBackAffordance(){
  const scroller = document.getElementById('scroll');
  const back = document.getElementById('back');
  if (!scroller || !back) return;
  const isNormalPageMode = () => window.matchMedia('(max-width:600px)').matches;
  let lastY = 0, accum = 0, ticking = false;
  function handleScroll(){
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      let y = isNormalPageMode() ? (window.scrollY || document.documentElement.scrollTop) : scroller.scrollTop;
      y = Math.max(0, y);
      const delta = y - lastY;
      accum += delta;
      if (y <= 40){ back.classList.remove('receded'); accum = 0; }
      else if (accum > 24){ back.classList.add('receded'); accum = 0; }
      else if (accum < -24){ back.classList.remove('receded'); accum = 0; }
      lastY = y;
      ticking = false;
    });
  }
  scroller.addEventListener('scroll', handleScroll, {passive:true});
  window.addEventListener('scroll', handleScroll, {passive:true});
}

/**
 * Copie la valeur affichée dans une .copy-row (Wi-Fi, mot de passe, code
 * du portail…) dans le presse-papier, avec retour visuel (pastille
 * "Copier" → coche, ~1.4s) et vibration légère si l'appareil l'expose.
 * Usage : onclick="copyValue(this)" sur le conteneur .copy-row.
 */
function copyValue(row){
  const valueEl = row.querySelector('.val');
  const pillEl = row.querySelector('.copy-pill');
  if (!valueEl) return;
  const text = valueEl.textContent.trim();
  const originalLabel = pillEl ? pillEl.textContent : '';

  const showCopied = () => {
    row.classList.add('copied');
    if (pillEl) pillEl.textContent = 'Copié';
    if (navigator.vibrate) navigator.vibrate(8);
    clearTimeout(row._copyTimeout);
    row._copyTimeout = setTimeout(() => {
      row.classList.remove('copied');
      if (pillEl) pillEl.textContent = originalLabel || 'Copier';
    }, 1400);
  };

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(showCopied).catch(() => {
      // Repli silencieux si l'API Clipboard est indisponible (contexte non sécurisé, permission refusée…)
      showCopied();
    });
  } else {
    showCopied();
  }
}

/**
 * Accordéon : un seul acc-item ouvert à la fois, l'ouverture d'un
 * nouveau sujet referme automatiquement le précédent.
 * Usage : onclick="toggleAccordion(this)" sur le conteneur .acc-item
 * (Check-in/Check-out) ou son en-tête .acc-head (Guide pratique).
 */
function toggleAccordion(trigger){
  const item = trigger.classList.contains('acc-item') ? trigger : trigger.closest('.acc-item');
  if (!item) return;
  const already = item.classList.contains('open');
  item.parentElement.querySelectorAll('.acc-item').forEach(i => i.classList.remove('open'));
  if (!already) item.classList.add('open');
  if (navigator.vibrate) navigator.vibrate(5);
}

/**
 * Partage natif des identifiants Wi-Fi via la feuille de partage du
 * système (Web Share API — Safari iOS, Chrome Android). Repli : copie
 * combinée réseau + mot de passe dans le presse-papier, même retour
 * visuel que copyValue(), si l'appareil n'expose pas navigator.share.
 * Usage : onclick="shareWifi(this, 'Villa-Aurea', 'Aurea2026')".
 */
function shareWifi(btn, ssid, password){
  const text = `Wi-Fi Villa Aurea\nRéseau : ${ssid}\nMot de passe : ${password}`;

  if (navigator.share) {
    navigator.share({ title: 'Wi-Fi Villa Aurea', text }).catch(() => {
      // Annulation par l'utilisateur (bouton natif "Annuler") — pas une erreur, aucun repli nécessaire.
    });
    return;
  }

  const original = btn ? btn.textContent : '';
  navigator.clipboard && navigator.clipboard.writeText(text).then(() => {
    if (navigator.vibrate) navigator.vibrate(8);
    if (btn){
      btn.textContent = 'Copié';
      setTimeout(() => { btn.textContent = original; }, 1400);
    }
  });
}

/**
 * Formate une plage de séjour (arrivée → départ) dans un style éditorial
 * discret : "12 → 18 août" si même mois, "28 août → 3 septembre" sinon.
 * Retourne null si les dates sont absentes ou invalides — l'appelant
 * décide alors de ne rien afficher plutôt que d'afficher un espace vide.
 * Usage : formatStayRange('2026-08-12', '2026-08-18').
 */
function formatStayRange(arrivalISO, departureISO){
  try{
    const a = new Date(arrivalISO + 'T00:00:00');
    const d = new Date(departureISO + 'T00:00:00');
    if (isNaN(a) || isNaN(d)) return null;
    const sameMonth = a.getMonth() === d.getMonth() && a.getFullYear() === d.getFullYear();
    const start = new Intl.DateTimeFormat('fr-FR', sameMonth ? { day:'numeric' } : { day:'numeric', month:'long' }).format(a);
    const end = new Intl.DateTimeFormat('fr-FR', { day:'numeric', month:'long' }).format(d);
    return `${start} → ${end}`;
  }catch(e){ return null; }
}

/**
 * Avant-séjour — l'accès à l'expérience s'ouvre à 14h00 le jour de
 * l'arrivée (avant l'heure de check-in officielle, pour couvrir le cas
 * d'un voyageur en avance). Avant ce cap, l'accès est bloqué par un
 * écran plein écran non-interactif (voir enforceStayGate ci-dessous).
 * Retourne false si la date est absente ou invalide (repli silencieux).
 * Usage : isStayNotStarted(guest.arrival).
 */
function isStayNotStarted(arrivalISO){
  try{
    if (!arrivalISO) return false;
    const gate = new Date(arrivalISO + 'T14:00:00');
    if (isNaN(gate)) return false;
    return new Date() < gate;
  }catch(e){ return false; }
}

/**
 * Fin de séjour — le séjour est considéré terminé à 12h00 (heure de
 * départ) le jour du check-out. Passé ce cap, l'accès est bloqué par un
 * écran plein écran non-interactif (voir enforceStayGate ci-dessous).
 * Retourne false si la date est absente ou invalide (repli silencieux).
 * Usage : isStayEnded(guest.departure).
 */
function isStayEnded(departureISO){
  try{
    if (!departureISO) return false;
    const gate = new Date(departureISO + 'T12:00:00');
    if (isNaN(gate)) return false;
    return new Date() > gate;
  }catch(e){ return false; }
}

/**
 * Applique le blocage d'accès si le séjour est terminé : superpose un
 * écran plein écran non-interactif sur tout le contenu de la page,
 * quelle que soit la page ouverte (script partagé, chargé partout).
 */
(function enforceStayGate(){
  let guest = null;
  try{ guest = JSON.parse(localStorage.getItem('velnoraGuest') || 'null'); }catch(e){}
  if (!guest) return;

  const ended = guest.departure && isStayEnded(guest.departure);
  const notStarted = !ended && guest.arrival && isStayNotStarted(guest.arrival);
  if (!ended && !notStarted) return;

  let title, sub;
  if (ended){
    const d = new Date(guest.departure + 'T00:00:00');
    const formatted = !isNaN(d) ? new Intl.DateTimeFormat('fr-FR', { day:'numeric', month:'long' }).format(d) : null;
    title = 'Votre séjour à la Villa Aurea s’est achevé.';
    sub = formatted ? ('Cette expérience vous était réservée jusqu\'au ' + formatted + ' à 12h00.') : '';
  } else {
    const a = new Date(guest.arrival + 'T00:00:00');
    const formatted = !isNaN(a) ? new Intl.DateTimeFormat('fr-FR', { day:'numeric', month:'long' }).format(a) : null;
    title = 'Votre séjour à la Villa Aurea n’a pas encore commencé.';
    sub = formatted ? ('Cette expérience s\'ouvre le ' + formatted + ' à partir de 14h00.') : '';
  }

  const overlay = document.createElement('div');
  overlay.setAttribute('style', 'position:fixed;inset:0;z-index:9999;background:#0d0c0b;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;padding:24px;text-align:center;');
  overlay.innerHTML =
    '<svg viewBox="0 0 100 100" width="40" height="40" fill="none" stroke="#efece5" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">'
    + '<rect x="5" y="3" width="90" height="94" rx="16" ry="16"/><path d="M27,15 L50,82 L73,15"/></svg>'
    + '<div style="font-family:-apple-system,\'Helvetica Neue\',Arial,sans-serif;color:#efece5;font-size:17px;font-weight:500;max-width:320px;">' + title + '</div>'
    + (sub ? '<div style="font-family:-apple-system,\'Helvetica Neue\',Arial,sans-serif;color:#8f887a;font-size:13px;max-width:300px;">' + sub + '</div>' : '')
    + (ended ? '<a href="#" id="velnoraResetStay" style="font-family:-apple-system,\'Helvetica Neue\',Arial,sans-serif;color:#c7ad82;font-size:12.5px;letter-spacing:.02em;text-decoration:underline;text-underline-offset:3px;margin-top:6px;">Vous revenez à la Villa Aurea ?</a>' : '');

  document.documentElement.style.overflow = 'hidden';
  if (document.body) document.body.appendChild(overlay);
  else document.addEventListener('DOMContentLoaded', () => document.body.appendChild(overlay));

  if (ended){
    const resetLink = overlay.querySelector('#velnoraResetStay');
    if (resetLink) resetLink.addEventListener('click', function(e){
      e.preventDefault();
      try{ localStorage.removeItem('velnoraGuest'); }catch(err){}
      window.location.href = '00-intro.html';
    });
  }
})();

/**
 * Météo réelle — remplace la puce statique de l'Accueil par la
 * température et la condition réelles de la propriété (Open-Meteo,
 * aucune clé requise). Icônes construites sur la même grammaire que le
 * reste du système (trait 2px, contour seul) — six conditions couvertes :
 * soleil, nuageux, couvert, pluie, orage, brouillard.
 * Usage : initWeather(latitude, longitude) sur l'écran Accueil uniquement.
 */
function initWeather(lat, lon){
  const chip = document.getElementById('weatherChip');
  if (!chip) return;

  const ICONS = {
    sun:   '<circle cx="12" cy="12" r="4.2"/><path d="M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/>',
    cloud: '<path d="M7 18h10a4 4 0 0 0 .5-7.97A5.5 5.5 0 0 0 7.1 12.06 4 4 0 0 0 7 18z"/>',
    rain:  '<path d="M7 15h9a4 4 0 0 0 .3-8 5.5 5.5 0 0 0-10.4.9A4 4 0 0 0 7 15z"/><path d="M9 19l-1 2M13 19l-1 2M17 19l-1 2"/>',
    storm: '<path d="M7 13h9a4 4 0 0 0 .3-8 5.5 5.5 0 0 0-10.4.9A4 4 0 0 0 7 13z"/><path d="M13 13l-3 5h3l-2 4"/>',
    fog:   '<path d="M4 10h13M6 14h14M4 18h13" />'
  };

  // Codes météo (norme WMO, utilisée par Open-Meteo) regroupés en six conditions.
  function condFromCode(code){
    if ([0].includes(code)) return 'sun';
    if ([1,2].includes(code)) return 'sun';
    if ([3].includes(code)) return 'cloud';
    if ([45,48].includes(code)) return 'fog';
    if ([51,53,55,56,57,61,63,65,66,67,80,81,82].includes(code)) return 'rain';
    if ([71,73,75,77,85,86].includes(code)) return 'rain';
    if ([95,96,99].includes(code)) return 'storm';
    return 'sun';
  }

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&timezone=auto`;

  fetch(url).then(r => r.ok ? r.json() : Promise.reject()).then(data => {
    const cur = data && data.current;
    if (!cur) return;
    const temp = Math.round(cur.temperature_2m);
    const cond = condFromCode(cur.weather_code);
    const svg = chip.querySelector('svg');
    const label = chip.querySelector('.wc-temp');
    if (svg) svg.innerHTML = ICONS[cond] || ICONS.sun;
    if (label) label.textContent = temp + '°';
    chip.classList.add('live');
  }).catch(() => {
    // Repli silencieux : la puce garde sa valeur de secours déjà présente dans le HTML.
  });
}

/**
 * Ouverture native de l'application de cartes du système (Apple Plans
 * sur iOS/macOS Safari, Google Maps ailleurs) plutôt qu'un lien web
 * générique — comportement déjà validé dans les écrans de référence.
 * Usage : onclick="openInMaps(lat, lon, 'Nom du lieu')" (event bloqué,
 * lat/lon en dur pour la propriété pilote).
 */
function openInMaps(lat, lon, label){
  const isApple = /iPad|iPhone|iPod|Macintosh/.test(navigator.userAgent) && 'ontouchend' in document || /iPad|iPhone|iPod/.test(navigator.userAgent);
  const query = encodeURIComponent(label || '');
  const url = isApple
    ? `https://maps.apple.com/?ll=${lat},${lon}&q=${query}`
    : `https://www.google.com/maps/search/?api=1&query=${query}`;
  window.open(url, '_blank', 'noopener');
}

/**
 * Galerie plein écran — ouvre une photo de "La propriété" en
 * superposition, navigation par balayage horizontal (swipe) ou tap sur
 * les bords, fermeture par le geste back-affordance standard (glyphe +
 * mot) pour rester cohérent avec le reste du produit.
 * Usage : data-gallery sur chaque vignette + galleryOpen(index) au tap.
 */
let _galleryIndex = 0;
let _galleryItems = [];
function galleryInit(items){ _galleryItems = items; }
function galleryOpen(index){
  const ov = document.getElementById('lightbox');
  if (!ov) return;
  _galleryIndex = index;
  _renderGallery();
  ov.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function galleryClose(){
  const ov = document.getElementById('lightbox');
  if (!ov) return;
  ov.classList.remove('open');
  document.body.style.overflow = '';
}
function galleryStep(dir){
  _galleryIndex = (_galleryIndex + dir + _galleryItems.length) % _galleryItems.length;
  _renderGallery();
}
function _renderGallery(){
  const img = document.getElementById('lightboxImg');
  const cap = document.getElementById('lightboxCap');
  const item = _galleryItems[_galleryIndex];
  if (!item || !img) return;
  img.style.opacity = 0;
  setTimeout(() => {
    img.src = item.src;
    img.alt = item.alt || '';
    if (cap) cap.textContent = item.cap || '';
    img.style.opacity = 1;
  }, 200);
}
function galleryInitSwipe(){
  const ov = document.getElementById('lightbox');
  if (!ov) return;
  let startX = 0, deltaX = 0;
  ov.addEventListener('touchstart', e => { startX = e.touches[0].clientX; }, {passive:true});
  ov.addEventListener('touchmove', e => { deltaX = e.touches[0].clientX - startX; }, {passive:true});
  ov.addEventListener('touchend', () => {
    if (Math.abs(deltaX) > 50) galleryStep(deltaX < 0 ? 1 : -1);
    deltaX = 0;
  });
}

/**
 * Remplit chaque barre d'étoiles proportionnellement à sa note réelle
 * (ex. 4.6/5 = 92% d'or). Usage : initStarRatings() une fois au chargement.
 */
function initStarRatings(){
  document.querySelectorAll('.stars[data-rating]').forEach(el => {
    const rating = parseFloat(el.getAttribute('data-rating')) || 0;
    const pct = Math.max(0, Math.min(100, (rating/5)*100));
    const fg = el.querySelector('.stars-fg');
    if (fg) fg.style.width = pct + '%';
  });
}

/**
 * Recommandations locales — onglets de catégorie (filtre les cartes) +
 * carte interactive (Leaflet, fond de carte sombre) dont les repères
 * suivent le filtre actif. Un tap sur un repère ouvre l'itinéraire natif.
 * Les entrées sans coordonnées (ex. service sur demande) n'ont simplement
 * pas de repère sur la carte.
 * Usage : initRecommandations() une fois, après le chargement du DOM.
 */
function initRecommandations(){
  const tabs = document.querySelectorAll('.rec-tab');
  const cards = document.querySelectorAll('.p-card');
  const empty = document.getElementById('recEmpty');
  const mapEl = document.getElementById('recMap');
  if (!tabs.length || !mapEl || typeof L === 'undefined') return;

  const map = L.map('recMap', { zoomControl:false, attributionControl:true, scrollWheelZoom:false });
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '© OpenStreetMap, © CARTO',
    subdomains: 'abcd', maxZoom: 19
  }).addTo(map);

  const markers = [];
  cards.forEach(card => {
    const lat = parseFloat(card.dataset.lat), lon = parseFloat(card.dataset.lon);
    if (isNaN(lat) || isNaN(lon)) return;
    const icon = L.divIcon({ className: 'vln-pin-wrap', html: '<div class="vln-pin"></div>', iconSize:[10,10] });
    const marker = L.marker([lat, lon], { icon }).addTo(map);
    marker.on('click', () => openInMaps(lat, lon, card.dataset.name || ''));
    marker._cat = card.dataset.cat;
    markers.push(marker);
  });

  function fitToVisible(){
    const visible = markers.filter(m => map.hasLayer(m));
    if (!visible.length) return;
    const group = L.featureGroup(visible);
    map.fitBounds(group.getBounds().pad(0.35), { maxZoom: 13 });
  }

  function applyFilter(cat){
    let anyVisible = false;
    cards.forEach(card => {
      const match = cat === 'all' || card.dataset.cat === cat;
      card.style.display = match ? '' : 'none';
      if (match) anyVisible = true;
    });
    markers.forEach(m => {
      const match = cat === 'all' || m._cat === cat;
      if (match) { if (!map.hasLayer(m)) m.addTo(map); }
      else { if (map.hasLayer(m)) map.removeLayer(m); }
    });
    if (empty) empty.style.display = anyVisible ? 'none' : 'block';
    fitToVisible();
  }

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      applyFilter(tab.dataset.cat);
    });
  });

  setTimeout(() => { map.invalidateSize(); fitToVisible(); }, 60);
}




/* ================= Assistant Velnora (FAQ locale + relais conciergerie) =================
   Fonctionne 100% côté client, sans dépendance ni coût : réponses par correspondance de
   mots-clés sur une base de connaissances propre à la Villa Aurea. Bascule vers un humain
   (Camille) en un clic via WhatsApp, avec le contexte de la conversation pré-rempli.
   -> Le jour où l'hôte veut une vraie IA conversationnelle (LLM), il suffira de remplacer
   vlnMatchKB() par un appel à un backend sécurisé : toute la coquille (UI, historique,
   relais humain) reste inchangée. */

const VLN_CONCIERGE_WA = '33647821590';

const VLN_KB = [
  { kw:['wifi','wi-fi','internet','mot de passe','password','code wifi'],
    a:"Le réseau est « Villa-Aurea », mot de passe « Aurea2026 ». La connexion couvre toute la villa, terrasse et piscine comprises." },
  { kw:['arrivee','arrivée','checkin','check-in','heure arrivee','quand arriver'],
    a:"L'arrivée standard est à partir de 16h. Une arrivée anticipée dès 11h est possible en extra, sous réserve de disponibilité." },
  { kw:['depart','départ','checkout','check-out','heure depart','quand partir'],
    a:"Le départ est fixé à 10h. Un départ tardif jusqu'à 16h est proposé en extra. Vous trouverez toutes les consignes de départ dans l'écran « Départ »." },
  { kw:['caution','depot','dépôt','garantie'],
    a:"Une empreinte bancaire est demandée à l'arrivée et libérée sans frais après l'état des lieux. L'option « Zéro caution » (25 €) permet de s'en dispenser, dans Extras & Services." },
  { kw:['piscine','baignade'],
    a:"La piscine (10 × 4 m) est chauffée à 28°C de mai à septembre, parfois dès fin avril si la météo le permet. Plus de détails dans l'écran « Guide de la Villa »." },
  { kw:['jacuzzi','spa','sauna','bien etre','bien-être','massage'],
    a:"La villa dispose d'un sauna privé au niveau -1. Plusieurs options bien-être existent aussi en extra : massage à domicile, séance de yoga privée — voir Extras & Services." },
  { kw:['petit dejeuner','petit-déjeuner','breakfast','pain','viennoiserie'],
    a:"Le petit-déjeuner livré en chambre (28 €/pers.) se commande dans Extras & Services, comme le panier de bienvenue gourmand." },
  { kw:['extra','extras','service','services','commander','commande'],
    a:"Toutes les prestations additionnelles — table, confort, mer, bien-être, célébrations, transport — sont regroupées dans l'écran « Extras & Services », avec commande en un clic." },
  { kw:['bateau','paddle','kayak','plage','plages','mer','voile','snorkeling','plongee','plongée'],
    a:"Location de paddle et kayaks livrée à la villa, sortie en bateau privé avec skipper, excursion snorkeling et navette vers la plage : tout est dans Extras & Services, catégorie « Mer & Plage »." },
  { kw:['animal','chien','chat','animaux'],
    a:"Un forfait animal de compagnie (30 €/séjour, panier et gamelles fournis) est disponible dans Extras & Services, catégorie « Famille & Animaux »." },
  { kw:['bebe','bébé','enfant','enfants','garde','baby'],
    a:"Kit bébé complet, garde d'enfants ponctuelle et lit d'appoint sont proposés dans Extras & Services, catégorie « Famille & Animaux »." },
  { kw:['transfert','aeroport','aéroport','gare','navette','taxi','voiture'],
    a:"Transfert privé gare ou aéroport dès 90 €, location de voiture livrée à la villa, voiturier sur demande : voir Extras & Services, catégorie « Transport »." },
  { kw:['adresse','ou est','où est','localisation','plan','venir','acces','accès','giens','hyeres','hyères'],
    a:"La Villa Aurea se trouve à Hyères, sur la Presqu'île de Giens, face à la mer. L'itinéraire précis est disponible depuis l'écran « La Villa »." },
  { kw:['contact','urgence','probleme','problème','panne','joindre'],
    a:"Camille, votre conciergerie, est joignable au +33 6 47 82 15 90. Les numéros d'urgence figurent dans l'écran « Votre Conciergerie »." },
  { kw:['restaurant','manger','diner','dîner','table gastronomique'],
    a:"La sélection de Camille recense les meilleures tables et plages de la presqu'île (La Table du Lodge, La Colombe, L'Envie...) dans l'écran « Sélection de Camille »." },
  { kw:['eclairage','éclairage','lumiere','lumière','tydom','domotique'],
    a:"La tablette murale de l'entrée pilote une partie des éclairages — jardin, piscine, porche, garage. Le reste s'allume à l'interrupteur, pièce par pièce." },
  { kw:['menage','ménage','nettoyage'],
    a:"Un ménage supplémentaire en cours de séjour (60 €) peut être ajouté à la date de votre choix, dans Extras & Services." },
  { kw:['bonjour','salut','hello','bonsoir'],
    a:"Bonjour ! Je suis l'assistant de la Villa Aurea. Posez-moi une question sur le wifi, les horaires, la piscine ou les extras — ou parlez directement à Camille ci-dessous." }
];

function vlnStripAccents(s){
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
}

function vlnMatchKB(input){
  const norm = vlnStripAccents(input);
  let best = null, bestScore = 0;
  VLN_KB.forEach(entry => {
    let score = 0;
    entry.kw.forEach(k => { if (norm.includes(vlnStripAccents(k))) score++; });
    if (score > bestScore){ bestScore = score; best = entry; }
  });
  return best ? best.a : null;
}

function initAssistant(){
  if (document.getElementById('vlnFab')) return; // déjà injecté

  const fab = document.createElement('button');
  fab.id = 'vlnFab'; fab.className = 'vln-fab'; fab.setAttribute('aria-label','Assistant de la villa');
  fab.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';
  document.body.appendChild(fab);

  const veil = document.createElement('div'); veil.className = 'vln-chat-veil'; document.body.appendChild(veil);

  const chat = document.createElement('div'); chat.className = 'vln-chat';
  chat.innerHTML = `
    <div class="vln-chat-head">
      <div class="av"><svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="3" width="90" height="94" rx="16" ry="16"/><path d="M27,15 L50,82 L73,15"/></svg></div>
      <div class="id"><div class="nm">Assistant Villa Aurea</div><div class="st">Répond à partir de votre guide</div></div>
      <div class="vln-chat-close" id="vlnChatClose"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg></div>
    </div>
    <div class="vln-chat-body" id="vlnChatBody"></div>
    <div class="vln-chips" id="vlnChips">
      <div class="vln-chip" data-q="Quel est le code wifi ?">Wifi</div>
      <div class="vln-chip" data-q="À quelle heure est le check-in ?">Horaires</div>
      <div class="vln-chip" data-q="Quels extras sont disponibles ?">Extras</div>
      <div class="vln-chip" data-q="Comment fonctionne la caution ?">Caution</div>
    </div>
    <div class="vln-human-row" id="vlnHumanRow">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>
      <span>Parler directement à Camille, votre conciergerie</span>
    </div>
    <div class="vln-chat-input">
      <input type="text" id="vlnInput" placeholder="Écrivez votre question…" autocomplete="off">
      <button id="vlnSend" aria-label="Envoyer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button>
    </div>`;
  document.body.appendChild(chat);

  const body = chat.querySelector('#vlnChatBody');
  const input = chat.querySelector('#vlnInput');
  const history = [];

  function addMsg(text, who){
    const el = document.createElement('div');
    el.className = 'vln-msg ' + (who === 'user' ? 'vln-msg-user' : 'vln-msg-bot');
    el.textContent = text;
    body.appendChild(el);
    body.scrollTop = body.scrollHeight;
    history.push((who === 'user' ? 'Vous : ' : 'Assistant : ') + text);
  }

  function openChat(){
    veil.classList.add('show'); chat.classList.add('show'); fab.classList.add('hide');
    if (!body.children.length){
      addMsg("Bonjour ! Je suis l'assistant de la Villa Aurea — posez-moi une question sur le wifi, les horaires, la piscine ou les extras.", 'bot');
    }
    setTimeout(() => input.focus(), 300);
  }
  function closeChat(){
    veil.classList.remove('show'); chat.classList.remove('show'); fab.classList.remove('hide');
  }

  fab.addEventListener('click', openChat);
  veil.addEventListener('click', closeChat);
  chat.querySelector('#vlnChatClose').addEventListener('click', closeChat);

  function handleAsk(text){
    if (!text.trim()) return;
    addMsg(text, 'user');
    input.value = '';
    setTimeout(() => {
      const answer = vlnMatchKB(text);
      if (answer){
        addMsg(answer, 'bot');
      } else {
        addMsg("Je n'ai pas la réponse exacte dans le guide de la villa. Le mieux est de demander directement à Camille, juste en dessous — je transmets votre question.", 'bot');
      }
    }, 260);
  }

  chat.querySelector('#vlnSend').addEventListener('click', () => handleAsk(input.value));
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleAsk(input.value); });

  chat.querySelectorAll('.vln-chip').forEach(chip => {
    chip.addEventListener('click', () => handleAsk(chip.dataset.q));
  });

  chat.querySelector('#vlnHumanRow').addEventListener('click', () => {
    let guest = null;
    try{ guest = JSON.parse(localStorage.getItem('velnoraGuest') || 'null'); }catch(e){}
    const firstName = (guest && guest.firstName) ? guest.firstName.trim() : '';
    const recap = history.slice(-6).join('\n');
    const text = 'Bonjour Camille,' + (firstName ? ' ici ' + firstName + ',' : '') +
      "\nJ'ai échangé avec l'assistant de la villa et j'aimerais vous parler directement." +
      (recap ? '\n\nRécapitulatif de notre échange :\n' + recap : '') +
      '\n\nMerci de votre retour.';
    window.open('https://wa.me/' + VLN_CONCIERGE_WA + '?text=' + encodeURIComponent(text), '_blank');
  });
}
