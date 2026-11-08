// CZAS PRACY RM: ile czasu pracuję dziennie, tygodniowo i miesięcznie. Start/Stop z rodzajem pracy, wpisy ręczne.
// Dane w bazie Zadań RM (Supabase, to samo logowanie, tabela czas_pracy, każdy widzi tylko swoje).
// Bez config.js albo z ?proba: tryb próbny w tej przeglądarce.
const WERSJA = 'v1';

const RODZAJE = [
  ['biuro', '🏢', 'Biuro'], ['teren', '🏠', 'Prezentacje i teren'], ['spotkania', '🤝', 'Spotkania'],
  ['telefony', '📞', 'Telefony i maile'], ['dokumenty', '📄', 'Dokumenty i urzędy'], ['marketing', '📣', 'Marketing'],
  ['nauka', '🎓', 'Nauka'], ['inne', '⚙️', 'Inne']
];
const RODZ = Object.fromEntries(RODZAJE.map(([k, i, n]) => [k, { i, n }]));
const KOLORY = { biuro: '#094d47', teren: '#2563eb', spotkania: '#7c3aed', telefony: '#0891b2', dokumenty: '#b45309', marketing: '#be185d', nauka: '#65a30d', inne: '#78716c' };
const MIESIACE = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'];
const MIESIACE_D = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];
const DNI = ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota'];
const DNI_K = ['nd', 'pn', 'wt', 'śr', 'cz', 'pt', 'sb'];

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const plusDni = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
const dzis = () => ymd(new Date());
const poniedzialek = (s) => plusDni(s, -((parseYmd(s).getDay() + 6) % 7));
const hhmm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
// czas w minutach jako „7 h 25 min”, krótko „7:25”
const hTxt = (min) => { min = Math.round(min); const h = Math.floor(min / 60), m = min % 60; return h ? `${h} h${m ? ` ${m} min` : ''}` : `${m} min`; };
const hKrotko = (min) => { min = Math.round(min); return `${Math.floor(min / 60)}:${pad(min % 60)}`; };
const dataDlugo = (s) => { const d = parseYmd(s); return `${DNI[d.getDay()]}, ${d.getDate()} ${MIESIACE_D[d.getMonth()]}`; };
const czytajLS = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } };
const piszLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

function toast(t, ms = 2600) {
  const el = $('#toast'); el.textContent = t; el.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { el.hidden = true; }, ms);
}

// ===================== ŚWIĘTA I NORMA ETATU =====================
// dni robocze = pn–pt bez świąt ustawowych (od 2025 także Wigilia), norma 8 h na dzień roboczy
function wielkanoc(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mies = Math.floor((h + l - 7 * m + 114) / 31), dz = ((h + l - 7 * m + 114) % 31) + 1;
  return ymd(new Date(y, mies - 1, dz));
}
const swietaCache = {};
function swieta(y) {
  if (swietaCache[y]) return swietaCache[y];
  const w = wielkanoc(y);
  const l = [`${y}-01-01`, `${y}-01-06`, w, plusDni(w, 1), `${y}-05-01`, `${y}-05-03`, plusDni(w, 49), plusDni(w, 60),
    `${y}-08-15`, `${y}-11-01`, `${y}-11-11`, `${y}-12-25`, `${y}-12-26`];
  if (y >= 2025) l.push(`${y}-12-24`);
  return (swietaCache[y] = new Set(l));
}
const roboczy = (s) => { const g = parseYmd(s).getDay(); return g !== 0 && g !== 6 && !swieta(parseYmd(s).getFullYear()).has(s); };

// ===================== MAGAZYN DANYCH =====================
function magazynSupabase(cfg) {
  const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
  });
  const blad = (e) => { if (e) throw new Error(/czas_pracy/.test(e.message || '') && /exist|schema cache/i.test(e.message) ? 'Brak tabeli czas_pracy: uruchom raz setup.sql w Supabase' : (e.message || String(e))); };
  let user = null;
  async function profil() {
    const { data, error } = await sb.from('profile').select('*').eq('id', user.id).maybeSingle(); blad(error);
    if (!data || !data.aktywny) throw new Error('To konto nie jest aktywne w zespole RM.');
    return data;
  }
  return {
    demo: false,
    async init() { const { data } = await sb.auth.getSession(); user = data.session?.user || null; return user ? { user, profil: await profil() } : null; },
    async zaloguj(email, haslo) {
      const { data, error } = await sb.auth.signInWithPassword({ email: email.trim().toLowerCase(), password: haslo });
      if (error) throw new Error(/invalid/i.test(error.message) ? 'Zły e-mail albo hasło' : error.message);
      user = data.user; return { user, profil: await profil() };
    },
    async wyloguj() { await sb.auth.signOut(); },
    // wpisy, które zachodzą na okres [od, do) plus chodzący licznik
    async wpisy(odIso, doIso) {
      const { data, error } = await sb.from('czas_pracy').select('*').eq('osoba', user.id).lt('start', doIso)
        .or(`koniec.is.null,koniec.gt.${odIso}`).order('start').limit(3000); blad(error);
      return data;
    },
    async licznik() { const { data, error } = await sb.from('czas_pracy').select('*').eq('osoba', user.id).is('koniec', null).maybeSingle(); blad(error); return data; },
    async dodaj(w) { const { data, error } = await sb.from('czas_pracy').insert({ ...w, osoba: user.id }).select().single(); blad(error); return data; },
    async zmien(id, zm) { const { error } = await sb.from('czas_pracy').update({ ...zm, zmieniono: new Date().toISOString() }).eq('id', id); blad(error); },
    async usun(id) { const { error } = await sb.from('czas_pracy').delete().eq('id', id); blad(error); }
  };
}

function magazynProbny() {
  const K = 'cp-proba';
  const W = () => czytajLS(K, []), zapisz = (l) => piszLS(K, l);
  const id = () => 'x' + Date.now() + Math.random().toString(36).slice(2, 6);
  const profil = { id: 'ja', imie: 'Rafał (próba)', rola: 'admin' };
  return {
    demo: true,
    async init() { return { user: { id: 'ja', email: 'tryb próbny' }, profil }; },
    async zaloguj() { return this.init(); },
    async wyloguj() {},
    async wpisy(odIso, doIso) { return W().filter(w => w.start < doIso && (!w.koniec || w.koniec > odIso)).sort((a, b) => a.start.localeCompare(b.start)); },
    async licznik() { return W().find(w => !w.koniec) || null; },
    async dodaj(w) {
      if (!w.koniec && W().some(x => !x.koniec)) throw new Error('Licznik już chodzi');
      const n = { notatka: '', ...w, id: id(), osoba: 'ja', utworzono: new Date().toISOString() }; zapisz([...W(), n]); return n;
    },
    async zmien(wid, zm) { zapisz(W().map(w => w.id === wid ? { ...w, ...zm } : w)); },
    async usun(wid) { zapisz(W().filter(w => w.id !== wid)); }
  };
}

const cfg = window.RM_CONFIG || {};
const DB = (cfg.supabaseUrl && window.supabase && !/[?&]proba/.test(location.search)) ? magazynSupabase(cfg) : magazynProbny();

// ===================== STAN =====================
const S = { user: null, profil: null, tab: 'dzis', licznik: null, dzisWpisy: [], tydzien: poniedzialek(dzis()), miesiac: dzis().slice(0, 7),
  rodzaj: czytajLS('cp-rodzaj', 'biuro'), norma: czytajLS('cp-norma', 40) };

// ===================== LICZENIE =====================
// minuty wpisu w obrębie dnia (wpis przez północ dzieli się na dni), chodzący licznik liczy się do teraz
function minutyWDniu(w, dzien) {
  const a = parseYmd(dzien).getTime(), b = parseYmd(plusDni(dzien, 1)).getTime();
  const s = new Date(w.start).getTime(), k = w.koniec ? new Date(w.koniec).getTime() : Date.now();
  return Math.max(0, Math.min(b, k) - Math.max(a, s)) / 60000;
}
function okres(wpisy, od, doD) { // od, doD włącznie (YYYY-MM-DD)
  const dni = {}, rodz = {};
  for (let d = od; d <= doD; d = plusDni(d, 1)) {
    let suma = 0;
    for (const w of wpisy) { const m = minutyWDniu(w, d); if (m) { suma += m; rodz[w.kategoria] = (rodz[w.kategoria] || 0) + m; } }
    dni[d] = suma;
  }
  const razem = Object.values(dni).reduce((a, b) => a + b, 0);
  const przepracowane = Object.entries(dni).filter(([, m]) => m >= 15);
  const weekend = Object.entries(dni).filter(([d]) => !roboczy(d)).reduce((a, [, m]) => a + m, 0);
  let robocze = 0;
  for (let d = od; d <= doD; d = plusDni(d, 1)) if (roboczy(d)) robocze++;
  const najdluzszy = przepracowane.sort((a, b) => b[1] - a[1])[0];
  return { dni, rodz, razem, dniPracy: przepracowane.length, weekend, robocze, najdluzszy,
    srednia: przepracowane.length ? razem / przepracowane.length : 0 };
}
const isoOd = (d) => parseYmd(d).toISOString();

// ===================== START =====================
document.addEventListener('DOMContentLoaded', start);
async function start() {
  $$('[data-wersja]').forEach(el => el.textContent = WERSJA);
  if (DB.demo) { $('#banner').textContent = 'Tryb próbny: dane są tylko w tej przeglądarce.'; $('#banner').hidden = false; }
  try {
    const s = await DB.init();
    if (s) await poZalogowaniu(s); else pokazLogowanie();
  } catch (e) { pokazLogowanie(); $('#log-blad').textContent = e.message; }
  setInterval(tik, 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && S.user) odswiez(); });
}
function pokazLogowanie() { $$('.screen').forEach(el => el.hidden = true); $('#tabs').hidden = true; $('#ekran-logowanie').hidden = false; }
$('#form-logowanie').addEventListener('submit', async (e) => {
  e.preventDefault(); $('#log-blad').textContent = '';
  try { await poZalogowaniu(await DB.zaloguj($('#log-email').value, $('#log-haslo').value)); } catch (err) { $('#log-blad').textContent = err.message; }
});
async function poZalogowaniu({ user, profil }) {
  S.user = user; S.profil = profil;
  $('#ekran-logowanie').hidden = true; $('#tabs').hidden = false; $('#btn-ustawienia').hidden = false;
  pokaz(S.tab);
}
async function odswiez() {
  try {
    S.licznik = await DB.licznik();
    const d = dzis();
    S.dzisWpisy = await DB.wpisy(isoOd(d), isoOd(plusDni(d, 1)));
    if (S.tab === 'dzis') rysujDzis();
    if (S.tab === 'tydzien') await rysujTydzien();
    if (S.tab === 'miesiac') await rysujMiesiac();
  } catch (e) { toast(e.message, 6000); }
}

// ===================== ZAKŁADKI =====================
$('#tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) pokaz(b.dataset.tab); });
function pokaz(t) {
  S.tab = t;
  $$('#tabs [data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
  $$('.screen').forEach(el => el.hidden = el.id !== 'ekran-' + t);
  odswiez();
}

// ===================== DZIŚ =====================
function rysujDzis() {
  const L = S.licznik, d = dzis();
  const sumaDzis = S.dzisWpisy.reduce((a, w) => a + minutyWDniu(w, d), 0);
  const tydz = S.tydzienCache && S.tydzienCache.pn === poniedzialek(d) ? S.tydzienCache.min : null;
  const zWczoraj = L && ymd(new Date(L.start)) < d;
  const chipy = RODZAJE.map(([k, i, n]) => `<button type="button" class="chip${(L ? L.kategoria : S.rodzaj) === k ? ' on' : ''}" data-rodzaj="${k}">${i} ${n}</button>`).join('');
  $('#ekran-dzis').innerHTML = `
    <div class="card licznik${L ? ' chodzi' : ''}">
      ${L ? `<div class="licznik-rodzaj">${RODZ[L.kategoria]?.i || '⏱'} ${esc(RODZ[L.kategoria]?.n || L.kategoria)} · od ${hhmm(new Date(L.start))}${zWczoraj ? ' (wczoraj albo wcześniej)' : ''}</div>
        <div class="licznik-czas" id="licznik-czas">0:00:00</div>` : `<div class="licznik-rodzaj">Licznik stoi</div><div class="licznik-czas stoi">${hKrotko(sumaDzis)}</div><div class="small muted">dziś razem</div>`}
      <div class="sekcja">Rodzaj pracy${L ? ' <span class="small muted">(klik zmienia rodzaj: obecny wpis się kończy, nowy startuje)</span>' : ''}</div>
      <div class="chips">${chipy}</div>
      ${L ? `<button class="btn btn-stop btn-big" data-akcja="stop">⏹ Stop</button>` : `<button class="btn btn-main btn-big" data-akcja="start">▶ Start pracy</button>`}
      ${zWczoraj ? `<div class="uwaga">Licznik chodzi od ${dataDlugo(ymd(new Date(L.start)))}, ${hhmm(new Date(L.start))}. Zapomniałeś zatrzymać? Wpisz, o której skończyłeś:
        <div class="rzad"><input type="time" id="stop-godz" value="17:00"><button class="btn btn-ghost" data-akcja="stop-o">Zatrzymaj o tej godzinie</button></div></div>` : ''}
    </div>
    <div class="podsum3">
      <div><b id="suma-dzis">${hKrotko(sumaDzis)}</b><span>dziś</span></div>
      <div><b>${tydz != null ? hKrotko(tydz) : '…'}</b><span>ten tydzień</span></div>
      <div><b>${S.norma} h</b><span>norma tyg.</span></div>
    </div>
    <div class="card">
      <div class="row-between"><div class="card-title">Dziś, ${esc(dataDlugo(d))}</div><button class="link" data-akcja="reczny">＋ Dodaj ręcznie</button></div>
      ${listaWpisow(S.dzisWpisy, d) || '<p class="muted small">Jeszcze nic. Kliknij Start, kiedy zaczynasz pracę, albo dodaj czas ręcznie.</p>'}
    </div>`;
  tik();
  if (tydz == null) policzTydzienDoPodsumowania();
}
async function policzTydzienDoPodsumowania() {
  const pn = poniedzialek(dzis());
  try {
    const w = await DB.wpisy(isoOd(pn), isoOd(plusDni(pn, 7)));
    S.tydzienCache = { pn, min: okres(w, pn, plusDni(pn, 6)).razem };
    if (S.tab === 'dzis') rysujDzis();
  } catch (e) {}
}
function listaWpisow(wpisy, dzien) {
  return wpisy.map(w => {
    const s = new Date(w.start), k = w.koniec ? new Date(w.koniec) : null;
    const m = minutyWDniu(w, dzien);
    return `<button class="wpis" data-wpis="${esc(w.id)}" style="--k:${KOLORY[w.kategoria] || '#78716c'}">
      <span class="wpis-godz">${hhmm(s)} – ${k ? hhmm(k) : 'teraz'}</span>
      <span class="wpis-co">${RODZ[w.kategoria]?.i || ''} ${esc(RODZ[w.kategoria]?.n || w.kategoria)}${w.notatka ? `<small>${esc(w.notatka)}</small>` : ''}</span>
      <span class="wpis-ile">${k ? hKrotko(m) : '⏱'}</span></button>`;
  }).join('');
}
function tik() {
  const el = $('#licznik-czas'); if (!el || !S.licznik) return;
  const s = Math.max(0, Math.floor((Date.now() - new Date(S.licznik.start).getTime()) / 1000));
  el.textContent = `${Math.floor(s / 3600)}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
  const sd = $('#suma-dzis');
  if (sd) sd.textContent = hKrotko(S.dzisWpisy.reduce((a, w) => a + minutyWDniu(w, dzis()), 0) + (S.dzisWpisy.some(w => w.id === S.licznik.id) ? 0 : minutyWDniu(S.licznik, dzis())));
}

$('#ekran-dzis').addEventListener('click', async (e) => {
  const r = e.target.closest('[data-rodzaj]');
  if (r) {
    const k = r.dataset.rodzaj; S.rodzaj = k; piszLS('cp-rodzaj', k);
    if (S.licznik && S.licznik.kategoria !== k) { await zatrzymaj(new Date()); await wystartuj(k); toast(`Teraz: ${RODZ[k].n}`); }
    else rysujDzis();
    return;
  }
  const a = e.target.closest('[data-akcja]')?.dataset.akcja;
  if (a === 'start') { await wystartuj(S.rodzaj); toast('Start, licznik chodzi'); }
  if (a === 'stop') { const L = S.licznik; await zatrzymaj(new Date()); if (L) toast(`Zapisane: ${hTxt((Date.now() - new Date(L.start)) / 60000)}`); }
  if (a === 'stop-o') {
    const [h, m] = ($('#stop-godz').value || '17:00').split(':').map(Number);
    const k = new Date(S.licznik.start); k.setHours(h, m, 0, 0);
    if (k <= new Date(S.licznik.start)) k.setDate(k.getDate() + 1);
    if (k > new Date()) { toast('Ta godzina jeszcze nie minęła'); return; }
    await zatrzymaj(k); toast('Zatrzymane');
  }
  if (a === 'reczny') otworzWpis(null);
  const w = e.target.closest('[data-wpis]');
  if (w) otworzWpis(S.dzisWpisy.find(x => x.id === w.dataset.wpis));
});
async function wystartuj(k) {
  try { S.licznik = await DB.dodaj({ start: new Date().toISOString(), koniec: null, kategoria: k }); } catch (e) { toast(e.message, 5000); }
  await odswiez();
}
async function zatrzymaj(kiedy) {
  if (!S.licznik) return;
  const L = S.licznik;
  try {
    if (kiedy - new Date(L.start) < 60000) await DB.usun(L.id); // pomyłkowy start krótszy niż minuta nie zostaje
    else await DB.zmien(L.id, { koniec: kiedy.toISOString() });
    S.licznik = null; S.tydzienCache = null;
  } catch (e) { toast(e.message, 5000); }
  await odswiez();
}

// ===================== TYDZIEŃ =====================
async function rysujTydzien() {
  const pn = S.tydzien, nd = plusDni(pn, 6);
  const wpisy = await DB.wpisy(isoOd(pn), isoOd(plusDni(pn, 7)));
  const o = okres(wpisy, pn, nd);
  if (pn === poniedzialek(dzis())) S.tydzienCache = { pn, min: o.razem };
  const normaMin = S.norma * 60;
  const roznica = o.razem - normaMin;
  const max = Math.max(...Object.values(o.dni), 8 * 60);
  const a = parseYmd(pn), b = parseYmd(nd);
  $('#ekran-tydzien').innerHTML = `
    <div class="nawig"><button data-tyg="-1" aria-label="Poprzedni tydzień">‹</button>
      <b>${a.getDate()} ${MIESIACE_D[a.getMonth()]} – ${b.getDate()} ${MIESIACE_D[b.getMonth()]} ${b.getFullYear()}</b>
      <button data-tyg="1" aria-label="Następny tydzień"${pn >= poniedzialek(dzis()) ? ' disabled' : ''}>›</button></div>
    <div class="card center">
      <div class="duza">${hTxt(o.razem)}</div>
      <div class="pasek-normy"><i style="width:${Math.min(100, (100 * o.razem) / normaMin)}%"></i></div>
      <p class="small ${roznica > 0 ? 'nadg' : 'muted'}">${roznica >= 0 ? `Ponad normę ${S.norma} h: ${hTxt(roznica)}` : `Do normy ${S.norma} h brakuje: ${hTxt(-roznica)}`}</p>
    </div>
    <div class="podsum3">
      <div><b>${o.dniPracy}</b><span>dni pracy</span></div>
      <div><b>${hKrotko(o.srednia)}</b><span>średnio na dzień</span></div>
      <div><b>${hKrotko(o.weekend)}</b><span>w weekend</span></div>
    </div>
    <div class="card">
      <div class="card-title">Dzień po dniu</div>
      ${Object.entries(o.dni).map(([d, m]) => `<div class="slupek-wiersz${d === dzis() ? ' dzis' : ''}${!roboczy(d) ? ' wolne' : ''}">
        <span class="slupek-dzien">${DNI_K[parseYmd(d).getDay()]} ${parseYmd(d).getDate()}</span>
        <span class="slupek"><i style="width:${(100 * m) / max}%"></i></span><span class="slupek-ile">${m ? hKrotko(m) : '–'}</span></div>`).join('')}
    </div>
    ${htmlRodzaje(o)}
    ${htmlWniosek(o, 'tydzien')}`;
}

// ===================== MIESIĄC =====================
async function rysujMiesiac() {
  const [y, m] = S.miesiac.split('-').map(Number);
  const od = `${S.miesiac}-01`, koniecM = ymd(new Date(y, m, 0));
  const wpisy = await DB.wpisy(isoOd(od), isoOd(plusDni(koniecM, 1)));
  const o = okres(wpisy, od, koniecM);
  const trwa = S.miesiac === dzis().slice(0, 7);
  // norma: dni robocze × 8 h; w trwającym miesiącu także norma do dziś
  const normaMin = o.robocze * 8 * 60;
  let roboczeDoDzis = 0;
  for (let d = od; d <= (trwa ? dzis() : koniecM); d = plusDni(d, 1)) if (roboczy(d)) roboczeDoDzis++;
  const normaDoDzis = roboczeDoDzis * 8 * 60;
  const tygodnie = [];
  for (let pn = poniedzialek(od); pn <= koniecM; pn = plusDni(pn, 7)) {
    const a = pn < od ? od : pn, b = plusDni(pn, 6) > koniecM ? koniecM : plusDni(pn, 6);
    let s = 0; for (let d = a; d <= b; d = plusDni(d, 1)) s += o.dni[d] || 0;
    tygodnie.push([a, b, s]);
  }
  const maxT = Math.max(...tygodnie.map(t => t[2]), 40 * 60);
  const ten = dzis().slice(0, 7);
  $('#ekran-miesiac').innerHTML = `
    <div class="nawig"><button data-mies="-1" aria-label="Poprzedni miesiąc">‹</button>
      <b>${MIESIACE[m - 1]} ${y}${trwa ? ' (trwa)' : ''}</b>
      <button data-mies="1" aria-label="Następny miesiąc"${S.miesiac >= ten ? ' disabled' : ''}>›</button></div>
    <div class="card center">
      <div class="duza">${hTxt(o.razem)}</div>
      <div class="pasek-normy"><i style="width:${Math.min(100, (100 * o.razem) / (normaMin || 1))}%"></i></div>
      <p class="small muted">Norma etatu: ${o.robocze} dni roboczych × 8 h = ${normaMin / 60} h</p>
      <p class="small ${o.razem - (trwa ? normaDoDzis : normaMin) > 0 ? 'nadg' : 'muted'}">${(() => { const r = o.razem - (trwa ? normaDoDzis : normaMin); return `${trwa ? 'Do dziś ' : ''}${r >= 0 ? `ponad normę: ${hTxt(r)}` : `do normy brakuje: ${hTxt(-r)}`}`; })()}</p>
    </div>
    <div class="podsum3">
      <div><b>${o.dniPracy}</b><span>dni pracy</span></div>
      <div><b>${hKrotko(o.srednia)}</b><span>średnio na dzień</span></div>
      <div><b>${hKrotko(o.weekend)}</b><span>weekendy i święta</span></div>
    </div>
    <div class="card">
      <div class="card-title">Tydzień po tygodniu</div>
      ${tygodnie.map(([a, b, s]) => `<div class="slupek-wiersz"><span class="slupek-dzien szer">${parseYmd(a).getDate()}–${parseYmd(b).getDate()}</span>
        <span class="slupek"><i style="width:${(100 * s) / maxT}%"></i></span><span class="slupek-ile">${s ? hKrotko(s) : '–'}</span></div>`).join('')}
      ${o.najdluzszy ? `<p class="small muted">Najdłuższy dzień: ${esc(dataDlugo(o.najdluzszy[0]))}, ${hTxt(o.najdluzszy[1])}.</p>` : ''}
    </div>
    ${htmlRodzaje(o)}
    ${htmlWniosek(o, 'miesiac')}`;
}
function htmlRodzaje(o) {
  const l = Object.entries(o.rodz).sort((a, b) => b[1] - a[1]);
  if (!l.length) return '<div class="card"><p class="muted small">Brak zapisanego czasu w tym okresie.</p></div>';
  return `<div class="card"><div class="card-title">Na co poszedł czas</div>
    <div class="pasek-rodzaje">${l.map(([k, m]) => `<i style="width:${(100 * m) / o.razem}%;background:${KOLORY[k] || '#78716c'}" title="${esc(RODZ[k]?.n || k)}"></i>`).join('')}</div>
    ${l.map(([k, m]) => `<div class="rodzaj-wiersz"><span class="kropka" style="background:${KOLORY[k] || '#78716c'}"></span>${RODZ[k]?.i || ''} ${esc(RODZ[k]?.n || k)}<b>${hKrotko(m)}</b><span class="muted">${Math.round((100 * m) / o.razem)}%</span></div>`).join('')}</div>`;
}
// krótki wniosek z liczb, bez AI
function htmlWniosek(o, rodzaj) {
  if (!o.razem) return '';
  const zdania = [];
  const sr = o.srednia / 60;
  if (sr >= 10) zdania.push(`Średnio ${hKrotko(o.srednia)} na dzień pracy. To dużo na dłuższą metę, sprawdź, co da się oddać Anecie albo wyciąć.`);
  else if (sr < 5 && o.dniPracy >= 3) zdania.push(`Średnio ${hKrotko(o.srednia)} na dzień. Jeśli pracujesz więcej, pewnie licznik nie zawsze jest włączony.`);
  if (o.weekend >= 4 * 60) zdania.push(`W weekendy i święta: ${hTxt(o.weekend)}. Zaplanuj w tygodniu dzień krótszy w zamian.`);
  const teren = (o.rodz.teren || 0) + (o.rodz.spotkania || 0), biuro = (o.rodz.biuro || 0) + (o.rodz.dokumenty || 0);
  if (o.razem >= 600) {
    const pTeren = Math.round((100 * teren) / o.razem), pBiuro = Math.round((100 * biuro) / o.razem);
    if (pTeren < 25) zdania.push(`Prezentacje, teren i spotkania to tylko ${pTeren}% czasu. To ten czas daje pozyski i transakcje, warto go zwiększać.`);
    else zdania.push(`Prezentacje, teren i spotkania: ${pTeren}% czasu, biuro i dokumenty: ${pBiuro}%.`);
  }
  if (!zdania.length) zdania.push(rodzaj === 'tydzien' ? 'Równy tydzień, bez sygnałów ostrzegawczych w liczbach.' : 'Równy miesiąc, bez sygnałów ostrzegawczych w liczbach.');
  return `<div class="card wniosek">💬 ${zdania.map(esc).join(' ')}</div>`;
}
$('#ekran-tydzien').addEventListener('click', (e) => { const b = e.target.closest('[data-tyg]'); if (b && !b.disabled) { S.tydzien = plusDni(S.tydzien, 7 * Number(b.dataset.tyg)); rysujTydzien(); } });
$('#ekran-miesiac').addEventListener('click', (e) => {
  const b = e.target.closest('[data-mies]'); if (!b || b.disabled) return;
  const [y, m] = S.miesiac.split('-').map(Number); const n = new Date(y, m - 1 + Number(b.dataset.mies), 1);
  S.miesiac = ymd(n).slice(0, 7); rysujMiesiac();
});

// ===================== ARKUSZ: WPIS RĘCZNY I ZMIANA =====================
function otworzArkusz(tytul, html) { $('#ark-tytul').textContent = tytul; $('#ark-tresc').innerHTML = html; $('#tlo').hidden = false; $('#arkusz').hidden = false; }
function zamknijArkusz() { $('#tlo').hidden = true; $('#arkusz').hidden = true; }
$('#ark-zamknij').addEventListener('click', zamknijArkusz);
$('#tlo').addEventListener('click', zamknijArkusz);
let edytowany = null;
function otworzWpis(w) {
  edytowany = w;
  const s = w ? new Date(w.start) : new Date(Date.now() - 3600000), k = w && w.koniec ? new Date(w.koniec) : (w ? null : new Date());
  const rodz = w ? w.kategoria : S.rodzaj;
  otworzArkusz(w ? 'Zmiana wpisu' : 'Dodaj czas ręcznie', `<form id="f-wpis">
    <label>Dzień <input type="date" id="w-data" value="${ymd(s)}" max="${dzis()}" required></label>
    <div class="grid2"><label>Od <input type="time" id="w-od" value="${hhmm(s)}" required></label>
      <label>Do ${w && !w.koniec ? '<span class="small">(licznik chodzi)</span>' : ''}<input type="time" id="w-do" value="${k ? hhmm(k) : ''}"${w && !w.koniec ? '' : ' required'}></label></div>
    <div class="sekcja">Rodzaj pracy</div>
    <div class="chips" id="w-rodzaj">${RODZAJE.map(([kk, i, n]) => `<button type="button" class="chip${rodz === kk ? ' on' : ''}" data-v="${kk}">${i} ${n}</button>`).join('')}</div>
    <label>Notatka (nie musisz) <input type="text" id="w-notatka" maxlength="300" value="${esc(w?.notatka || '')}" placeholder="np. prezentacja Słoneczna, akt w Malborku"></label>
    <button class="btn btn-main" type="submit">${w ? 'Zapisz' : 'Dodaj'}</button>
    ${w ? '<button class="btn btn-ghost czerwony" type="button" data-usun="1">Usuń wpis</button>' : ''}
  </form>`);
}
$('#ark-tresc').addEventListener('click', async (e) => {
  const c = e.target.closest('#w-rodzaj [data-v]');
  if (c) { $$('#w-rodzaj .chip').forEach(x => x.classList.toggle('on', x === c)); return; }
  const n = e.target.closest('[data-norma]');
  if (n) { S.norma = Number(n.dataset.norma); piszLS('cp-norma', S.norma); $$('[data-norma]').forEach(x => x.classList.toggle('on', x === n)); toast(`Norma: ${S.norma} h tygodniowo`); odswiez(); return; }
  if (e.target.closest('[data-wyloguj]')) { await DB.wyloguj(); location.reload(); return; }
  const u = e.target.closest('[data-usun]');
  if (u && edytowany) {
    if (u.dataset.pewne !== '1') { u.dataset.pewne = '1'; u.textContent = 'Na pewno usunąć? Kliknij jeszcze raz'; return; }
    try { await DB.usun(edytowany.id); if (S.licznik?.id === edytowany.id) S.licznik = null; S.tydzienCache = null; toast('Usunięte'); zamknijArkusz(); odswiez(); } catch (err) { toast(err.message, 5000); }
  }
});
$('#ark-tresc').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (e.target.id !== 'f-wpis') return;
  const d = $('#w-data').value, od = $('#w-od').value, doG = $('#w-do').value;
  const s = new Date(`${d}T${od}:00`);
  let k = doG ? new Date(`${d}T${doG}:00`) : null;
  if (k && k <= s) k.setDate(k.getDate() + 1); // praca przez północ
  if (k && k > new Date()) { toast('Koniec nie może być w przyszłości'); return; }
  if (k && k - s > 16 * 3600000) { toast('Wpis dłuższy niż 16 h, sprawdź godziny'); return; }
  const dane = { start: s.toISOString(), koniec: k ? k.toISOString() : null, kategoria: $('#w-rodzaj .on')?.dataset.v || 'biuro', notatka: $('#w-notatka').value.trim() };
  if (!dane.koniec && !(edytowany && !edytowany.koniec)) { toast('Wpisz, o której skończyłeś'); return; }
  try {
    if (edytowany) await DB.zmien(edytowany.id, dane); else await DB.dodaj(dane);
    S.tydzienCache = null; toast(edytowany ? 'Zapisane' : 'Dodane'); zamknijArkusz(); odswiez();
  } catch (err) { toast(err.message, 5000); }
});
// klik we wpis także na liście tygodnia i miesiąca nie istnieje, wpisy zmienia się z zakładki Dziś albo przez „Dodaj ręcznie”

// ===================== USTAWIENIA =====================
$('#btn-ustawienia').addEventListener('click', () => {
  otworzArkusz('Ustawienia', `
    <div class="sekcja">Norma tygodniowa</div>
    <div class="chips">${[30, 35, 40, 45, 50].map(n => `<button type="button" class="chip${S.norma === n ? ' on' : ''}" data-norma="${n}">${n} h</button>`).join('')}</div>
    <p class="small muted">Do normy porównuję tydzień. Miesiąc liczy się zawsze z dni roboczych × 8 h (bez weekendów i świąt).</p>
    <p class="small muted">Zalogowano: ${esc(S.user?.email || '')}. Twój czas widzisz tylko Ty.</p>
    ${DB.demo ? '' : '<button class="btn btn-ghost" data-wyloguj="1">Wyloguj</button>'}`);
});

// ===================== SERVICE WORKER =====================
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {});
}
