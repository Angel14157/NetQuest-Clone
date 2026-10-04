'use strict';

/* ================= utilidades IPv4 ================= */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

const ipToInt = ip => ip.split('.').reduce((a, o) => (((a << 8) >>> 0) + (+o)) >>> 0, 0) >>> 0;
const intToIp = n => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
const maskInt = p => p <= 0 ? 0 : (0xFFFFFFFF << (32 - p)) >>> 0;
const maskStr = p => intToIp(maskInt(p));
const netOf   = (ip, p) => (ipToInt(ip) & maskInt(p)) >>> 0;
const blockOf = p => Math.pow(2, 32 - p);
const bcastOf = (ip, p) => (netOf(ip, p) | ((~maskInt(p)) >>> 0)) >>> 0;
const usable  = p => p >= 32 ? 0 : p >= 31 ? blockOf(p) : blockOf(p) - 2;
const firstU  = (net, p) => p >= 31 ? net : net + 1;
const lastU   = (net, p) => p >= 31 ? net + blockOf(p) - 1 : net + blockOf(p) - 2;
const classOf = ip => {
  const f = ipToInt(ip) >>> 24;
  return f < 128 ? 'A' : f < 192 ? 'B' : f < 224 ? 'C' : f < 240 ? 'D' : 'E';
};

function parseIp(str) {
  str = (str || '').trim();
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(str)) return null;
  const parts = str.split('.').map(Number);
  if (parts.some(o => o > 255)) return null;
  return parts.join('.');
}
function parsePrefix(str) {           // "255.255.255.0" | "/24" | "24"
  str = (str || '').trim();
  if (str.startsWith('/')) str = str.slice(1);
  if (/^\d{1,2}$/.test(str)) { const n = +str; return n <= 32 ? n : null; }
  const ip = parseIp(str); if (!ip) return null;
  const v = ipToInt(ip);
  if ((((v | ((v - 1) >>> 0))) >>> 0) !== 0xFFFFFFFF) return null; // bits contiguos
  let p = 0, x = v;
  while (x & 0x80000000) { p++; x = (x << 1) >>> 0; }
  return p;
}
const parseCidr = str => {
  const [i, p] = (str || '').split('/');
  const ip = parseIp(i), pref = parsePrefix(p);
  return ip && pref !== null ? { ip, p: pref } : null;
};

/* ================= topología ================= */
function defaultTopology() {           // ejercicio de la pizarra (uni)
  return {
    base: { ip: '172.16.0.0', p: 16 },
    labels: { A: 'CARACAS', B: 'LARA', C: 'Zulia' },
    segs: [
      { id: 'A0', name: 'E0 CARACAS', hosts: 2000, kind: 'lan', router: 'A', iface: 'Ethernet0' },
      { id: 'A1', name: 'E1 CARACAS', hosts: 5,    kind: 'lan', router: 'A', iface: 'Ethernet1' },
      { id: 'A2', name: 'E2 CARACAS', hosts: 14,   kind: 'lan', router: 'A', iface: 'Ethernet2' },
      { id: 'AB', name: 'Enlace A-B (ISP)', hosts: 2, kind: 'link', a: 'A', aIf: 'Serial0/0/0', b: 'B', bIf: 'Serial0/0/0', isp: true },
      { id: 'B0', name: 'E0 LARA', hosts: 600, kind: 'lan', router: 'B', iface: 'Ethernet0' },
      { id: 'B1', name: 'E1 LARA', hosts: 60,  kind: 'lan', router: 'B', iface: 'Ethernet1' },
      { id: 'B2', name: 'E2 LARA', hosts: 4,   kind: 'lan', router: 'B', iface: 'Ethernet2' },
      { id: 'BC', name: 'Enlace B-C (ISP)', hosts: 2, kind: 'link', a: 'B', aIf: 'Serial0/0/1', b: 'C', bIf: 'Serial0/0/0', isp: true },
      { id: 'C0', name: 'E0 ZULIA', hosts: 240, kind: 'lan', router: 'C', iface: 'Ethernet0' },
      { id: 'C1', name: 'E1 ZULIA', hosts: 4,   kind: 'lan', router: 'C', iface: 'Ethernet1' },
      { id: 'C2', name: 'E2 ZULIA', hosts: 20,  kind: 'lan', router: 'C', iface: 'Ethernet2' },
    ],
  };
}
function randomTopology() {            // variante aleatoria con la misma estructura
  const t = defaultTopology();
  t.base = { ip: `172.${rnd(16, 31)}.${rnd(0, 15) * 16}.0`, p: 20 };
  const h = { A0: rnd(800, 2000), A1: rnd(3, 10),  A2: rnd(8, 30),
              B0: rnd(300, 900),  B1: rnd(30, 120), B2: rnd(3, 10),
              C0: rnd(100, 250),  C1: rnd(3, 10),  C2: rnd(10, 40) };
  t.segs.forEach(s => { if (s.kind === 'lan') s.hosts = h[s.id]; });
  return t;
}
const needPrefix = hosts => 32 - Math.ceil(Math.log2(hosts + 2));

function solveVlsm(topo) {
  const baseNet = netOf(topo.base.ip, topo.base.p);
  const total   = blockOf(topo.base.p);
  const sorted  = [...topo.segs].sort((a, b) => needPrefix(a.hosts) - needPrefix(b.hosts));
  const out = {}; let cur = baseNet;
  for (const s of sorted) {
    const p = needPrefix(s.hosts), block = blockOf(p);
    let addr = Math.ceil(cur / block) * block;
    if (addr + block > baseNet + total) return null;
    out[s.id] = { net: addr, p };
    cur = addr + block;
  }
  return out;
}
function interfacesFor(router, topo) {
  const list = [];
  for (const s of topo.segs) {
    if (s.kind === 'lan' && s.router === router) list.push({ iface: s.iface, seg: s });
    if (s.kind === 'link') {
      if (s.a === router) list.push({ iface: s.aIf, seg: s });
      else if (s.b === router) list.push({ iface: s.bIf, seg: s });
    }
  }
  return list;
}
const COLORS = ['#5b8def', '#e07a5f', '#81b29a', '#f2cc8f', '#9b7ede',
                '#4dd4c0', '#ef6f9b', '#8fbf5a', '#6fa8ef', '#c98b5a'];
const colorOf = id => {
  const i = state.topo.segs.findIndex(s => s.id === id);
  return COLORS[(i < 0 ? 0 : i) % COLORS.length];
};

/* ================= creador de ejercicios (Mi ejercicio) ================= */
const CLASS_BASE = { A: '10.0.0.0/8', B: '172.16.0.0/16', C: '192.168.0.0/24' };
const DEFAULT_LABELS = ['CARACAS', 'LARA', 'ZULIA', 'MARACAIBO', 'VALENCIA', 'BARQUISIMETO'];
const CUSTOM_KEY = 'nq-custom';
const escAttr = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function defaultHosts(j) { return ['100', '50', '20', '10'][j] || '10'; }
function defaultRouter(i) {
  return { name: DEFAULT_LABELS[i] || `R${i + 1}`, lans: 1, hosts: [defaultHosts(0)] };
}
function defaultCx() {                     // plantilla = ejercicio de la pizarra
  return {
    cls: 'B', base: '172.16.0.0/16', n: 3, serial: true,
    routers: [
      { name: 'CARACAS', lans: 3, hosts: ['2000', '5', '14'] },
      { name: 'LARA',    lans: 3, hosts: ['600', '60', '4'] },
      { name: 'ZULIA',   lans: 3, hosts: ['240', '4', '20'] },
      { name: 'MARACAIBO', lans: 1, hosts: ['100'] },
      { name: 'VALENCIA',  lans: 1, hosts: ['100'] },
      { name: 'BARQUISIMETO', lans: 1, hosts: ['100'] },
    ],
  };
}
let cxState = defaultCx();

function saveCustom(t) { try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(t)); } catch (e) {} }
function loadCustom() {
  try {
    const t = JSON.parse(localStorage.getItem(CUSTOM_KEY));
    return t && t.base && t.labels && Array.isArray(t.segs) && t.segs.length ? t : null;
  } catch (e) { return null; }
}

// Construye la topología a partir de la especificación del creador.
function makeTopology(spec) {
  const cidr = parseCidr(spec.base);
  if (!cidr) throw new Error('red base inválida (ej.: 172.16.0.0/16)');
  const first = +cidr.ip.split('.')[0];
  if (first === 0 || first === 127) throw new Error('usa una red válida (evita 0.x y 127.x)');
  const cls = classOf(cidr.ip);
  if (cls !== spec.cls) throw new Error(`${cidr.ip} es clase ${cls}: elige la clase ${cls} o corrige la base`);
  const KEYS = 'ABCDEF';
  const n = Math.max(1, Math.min(6, spec.n | 0));
  const routers = spec.routers || [];
  if (routers.length < n) throw new Error('faltan datos de router');
  const clean = s => String(s || '').replace(/[<>&"]/g, '').trim().toUpperCase().slice(0, 10);
  const names = [];
  for (let i = 0; i < n; i++) names.push(clean(routers[i].name) || DEFAULT_LABELS[i] || `R${i + 1}`);
  if (new Set(names).size !== names.length) throw new Error('los nombres de router deben ser distintos');

  const labels = {}, segs = [], cnt = {};
  for (let i = 0; i < n; i++) {
    const k = KEYS[i]; labels[k] = names[i];
    const hs = (routers[i].hosts || []).slice(0, 3);
    if (!hs.length) throw new Error(`${names[i]} necesita al menos una interfaz LAN`);
    hs.forEach((h, j) => {
      const v = parseInt(h, 10);
      if (!v || v < 1 || v > 60000) throw new Error(`hosts inválidos en E${j} de ${names[i]} (1–60000)`);
      segs.push({ id: `${k}${j}`, name: `E${j} ${names[i]}`, hosts: v, kind: 'lan', router: k, iface: `Ethernet${j}` });
    });
    if (spec.serial && n > 1 && i < n - 1) {
      const b = KEYS[i + 1];
      const aIf = `Serial0/0/${cnt[k] || 0}`; cnt[k] = (cnt[k] || 0) + 1;
      const bIf = `Serial0/0/${cnt[b] || 0}`; cnt[b] = (cnt[b] || 0) + 1;
      segs.push({ id: k + b, name: `Enlace ${k}-${b} (ISP)`, hosts: 2, kind: 'link', a: k, aIf, b, bIf, isp: true });
    }
  }
  return { base: { ip: cidr.ip, p: cidr.p }, labels, segs, custom: true };
}

function renderBuilder() {                  // pinta las filas desde cxState
  $('#cx-base').value = cxState.base;
  $('#cx-n').value = cxState.n;
  $('#cx-serial').checked = cxState.serial;
  $$('#cx-class button').forEach(b => b.classList.toggle('active', b.dataset.c === cxState.cls));
  $('#cx-routers').innerHTML = cxState.routers.slice(0, cxState.n).map((r, i) => `
    <div class="cx-router" data-i="${i}">
      <span class="cx-tag">R${i + 1}</span>
      <input class="cx-name" value="${escAttr(r.name)}" maxlength="10" placeholder="nombre" title="Nombre del router">
      <label class="cx-lan">LANs
        <select class="cx-lans" title="Interfaces LAN de este router (1–3)">
          ${[1, 2, 3].map(v => `<option ${v === r.lans ? 'selected' : ''}>${v}</option>`).join('')}
        </select>
      </label>
      <div class="cx-hosts">
        ${r.hosts.slice(0, r.lans).map((h, j) =>
          `<label class="cx-host">E${j}<input type="number" min="1" max="60000" value="${escAttr(h)}" title="Hosts en Ethernet${j}"></label>`).join('')}
      </div>
    </div>`).join('');
}
function cxSpecFromDom() {                  // lee lo que el usuario escribió
  const rows = $$('#cx-routers .cx-router');
  return {
    cls: cxState.cls,
    base: $('#cx-base').value.trim(),
    n: Math.max(1, Math.min(6, +$('#cx-n').value || rows.length || 3)),
    serial: $('#cx-serial').checked,
    routers: rows.map(row => ({
      name: $('.cx-name', row).value,
      lans: +$('.cx-lans', row).value,
      hosts: $$('.cx-host input', row).map(i => i.value),
    })),
  };
}
function cxSpec() { return {                 // desde cxState (sin tocar el DOM)
  cls: cxState.cls, base: cxState.base, n: cxState.n, serial: cxState.serial,
  routers: cxState.routers.slice(0, cxState.n).map(r => ({ name: r.name, hosts: r.hosts.slice(0, r.lans) })),
}; }
function cxFromTopo(t) {                     // rellena el creador desde una topología
  const keys = Object.keys(t.labels || {});
  const cls = classOf(t.base.ip);
  cxState = {
    cls: ['A', 'B', 'C'].includes(cls) ? cls : 'B',
    base: `${t.base.ip}/${t.base.p}`,
    n: Math.max(1, Math.min(6, keys.length)),
    serial: t.segs.some(s => s.kind === 'link'),
    routers: keys.map(k => {
      const lans = t.segs.filter(s => s.kind === 'lan' && s.router === k)
                         .sort((a, b) => +a.iface.replace(/\D/g, '') - +b.iface.replace(/\D/g, ''));
      return { name: t.labels[k], lans: Math.max(1, Math.min(3, lans.length)), hosts: lans.map(s => String(s.hosts)) };
    }),
  };
  renderBuilder();
}
function buildCustom() {
  const msg = $('#cx-msg');
  let t;
  try { t = makeTopology(cxSpecFromDom()); }
  catch (e) {
    msg.className = 'build-msg err'; msg.textContent = '✗ ' + e.message;
    setStatus('revisa los datos del ejercicio'); return null;
  }
  if (!solveVlsm(t)) {
    msg.className = 'build-msg err';
    msg.textContent = `✗ los segmentos no caben en ${t.base.ip}/${t.base.p}: usa clase A/B, agranda la base o baja hosts`;
    setStatus('la red base no alcanza'); return null;
  }
  // todo bien → aplicar
  cxFromTopo(t);                              // sincroniza cxState con lo creado
  state.topo = t; state.topoMode = 'custom';
  saveCustom(t);
  state.assign = {}; state.solutionShown = false;
  if (!t.labels[state.console.router]) state.console.router = Object.keys(t.labels)[0];
  state.console = { router: state.console.router, assign: {}, hist: [], hi: -1, seen: {} };
  $('#term-out').innerHTML = '';
  $('#topo-mode').value = 'custom';
  renderTopo(); renderAsign(); termBanner(); renderPlan(); defaultAnalysis(); updateStats();
  msg.className = 'build-msg ok';
  msg.textContent = `✓ creado: ${Object.keys(t.labels).length} routers · ${t.segs.length} segmentos · clase ${classOf(t.base.ip)} (${t.base.ip}/${t.base.p})`;
  setStatus('ejercicio personalizado creado ✓');
  return t;
}

/* ================= estado ================= */
const state = {
  view: 'clasico',
  diff: 'facil',
  classic: { base: '192.168.23.8/24', p: 24, target: 26 },
  classicCls: null,                          // clase elegida en Subnetting clásico (null = auto)
  topo: defaultTopology(),
  topoMode: 'pizarra',
  assign: {},                                  // segId -> {ip, p} (raw usuario)
  solutionShown: false,
  console: { router: 'A', assign: {}, hist: [], hi: -1, seen: {} },
};

/* ================= helpers UI ================= */
function setStatus(msg) { $('#status-msg').textContent = msg; }
function setStats(labels, vals) {
  $$('#stats .stat span').forEach((el, i) => el.textContent = labels[i]);
  $('#st-check').textContent = vals[0];
  $('#st-rtx').textContent   = vals[1];
  $('#st-hosts').textContent = vals[2];
}
const AN_DEFAULT = 'Completa los campos y verifica para ver indicaciones.';
function openSide(open) {                  // móvil: despliega/oculta la hoja inferior del panel
  const s = $('.side'), t = $('#side-toggle');
  if (s) s.classList.toggle('open', !!open);
  if (t) t.textContent = open ? '▴' : '▾';
}
function setAnalysis(summary, items = []) {
  $('#analysis-text').textContent = summary;
  const ul = $('#analysis-list'); ul.innerHTML = '';
  items.forEach(it => {
    const li = document.createElement('li');
    li.className = it.ok ? 'ok' : 'bad';
    li.textContent = it.text;
    ul.appendChild(li);
  });
  // en móvil el panel es una hoja inferior: se despliega cuando hay feedback
  if (summary !== AN_DEFAULT && window.innerWidth <= 1080) openSide(true);
}
const defaultAnalysis = () => setAnalysis(AN_DEFAULT, []);

/* ================= vista: subnetting clásico ================= */
function newClassic(diff, cls) {
  cls = cls || state.classicCls || null;
  let ip, p;
  if (cls === 'A')      { ip = `10.${rnd(0, 255)}.${rnd(0, 255)}.${diff === 'facil' ? 0 : rnd(0, 20)}`; p = 8; }
  else if (cls === 'B') { ip = `172.${rnd(16, 31)}.${rnd(0, 255)}.${diff === 'facil' ? 0 : rnd(0, 20)}`; p = 16; }
  else if (cls === 'C') { ip = `192.168.${rnd(0, 255)}.${diff === 'facil' ? 0 : rnd(0, 20)}`; p = 24; }
  else if (diff === 'facil')  { ip = `192.168.${rnd(0, 254)}.${rnd(0, 20)}`; p = 24; }
  else if (diff === 'medio')  { ip = `192.168.${rnd(0, 254)}.${rnd(1, 30)}`; p = 24; }
  else {
    if (Math.random() < 0.5) { ip = `172.${rnd(16, 31)}.${rnd(0, 254)}.0`; p = 16; }
    else                     { ip = `10.${rnd(0, 255)}.0.0`;             p = 8;  }
  }
  const delta = diff === 'facil' ? 2 : diff === 'medio' ? 3 : 4;
  const t = Math.min(p + delta, 30);
  state.classic = { base: `${ip}/${p}`, p, target: t };
}
function classicSubnets() {
  const c = state.classic;
  const baseNet = netOf(c.base.split('/')[0], c.p);
  const n = Math.pow(2, c.target - c.p);
  const block = blockOf(c.target);
  return Array.from({ length: n }, (_, i) => {
    const net = (baseNet + i * block) >>> 0;
    return { net, p: c.target, first: firstU(net, c.target), last: lastU(net, c.target), bcast: (net + block - 1) >>> 0 };
  });
}
function renderClassic() {
  const c = state.classic;
  const netIp = c.base.split('/')[0];
  $('#cb-base').value = c.base;
  $$('#cb-chips button').forEach(b => b.classList.toggle('active', b.dataset.c === classOf(netIp)));

  const sel = $('#cb-prefix'); sel.innerHTML = '';
  for (let x = c.p + 1; x <= Math.min(c.p + 7, 30); x++) {
    if (Math.pow(2, x - c.p) > 128) break;
    const o = document.createElement('option');
    o.value = x; o.textContent = '/' + x;
    if (x === c.target) o.selected = true;
    sel.appendChild(o);
  }
  const n = Math.pow(2, c.target - c.p);
  $('#cb-count').textContent = n;
  $('#cb-size').textContent = usable(c.target) + ' hosts';

  // strip visual
  const subs = classicSubnets();
  const strip = $('#cb-strip'); strip.innerHTML = '';
  subs.forEach((s, i) => {
    const d = document.createElement('div');
    d.className = 'sc' + (n > 48 ? ' tiny' : '');
    d.textContent = i + 1;
    d.title = intToIp(s.net) + '/' + c.target;
    d.addEventListener('mouseenter', () => {
      $$('#cb-table tbody tr').forEach(r => r.classList.remove('hi'));
      const tr = $(`#cb-table tbody tr[data-r="${i}"]`);
      if (tr) { tr.classList.add('hi'); tr.scrollIntoView({ block: 'nearest' }); }
      $$('.sc', strip).forEach(x => x.classList.remove('hi')); d.classList.add('hi');
    });
    strip.appendChild(d);
  });

  // tabla
  const tb = $('#cb-table tbody'); tb.innerHTML = '';
  subs.forEach((s, i) => {
    const tr = document.createElement('tr');
    tr.dataset.r = i;
    tr.innerHTML = `
      <td class="num">${i + 1}</td>
      <td><span class="seg-name">Subred ${i + 1}</span></td>
      <td><input data-r="${i}" data-f="net"   placeholder="0.0.0.0"></td>
      <td><input data-r="${i}" data-f="mask"  placeholder="255.255.255.0"></td>
      <td><input data-r="${i}" data-f="first" placeholder="0.0.0.0"></td>
      <td><input data-r="${i}" data-f="last"  placeholder="0.0.0.0"></td>
      <td><input data-r="${i}" data-f="bcast" placeholder="0.0.0.0"></td>`;
    tb.appendChild(tr);
  });
  $$('#cb-table input').forEach(inp => inp.addEventListener('input', updateStats));
}
function readClassicFields() {
  const subs = classicSubnets();
  const rows = $$('#cb-table tbody tr');
  let ok = 0, total = 0, rtxOk = 0, hostsOk = 0;
  const errors = [];
  rows.forEach(tr => {
    const i = +tr.dataset.r, s = subs[i];
    const g = f => $(`input[data-r="${i}"][data-f="${f}"]`, tr);
    const checks = [
      ['net',   parseIp(g('net').value) === intToIp(s.net),   `dirección de red: esperada ${intToIp(s.net)}`],
      ['mask',  parsePrefix(g('mask').value) === s.p,         `máscara: esperada /${s.p} (${maskStr(s.p)})`],
      ['first', parseIp(g('first').value) === intToIp(s.first), `1ª usable: esperada ${intToIp(s.first)}`],
      ['last',  parseIp(g('last').value) === intToIp(s.last),   `última usable: esperada ${intToIp(s.last)}`],
      ['bcast', parseIp(g('bcast').value) === intToIp(s.bcast), `broadcast: esperada ${intToIp(s.bcast)}`],
    ];
    let rowOk = 0;
    checks.forEach(([f, good, msg]) => {
      total++;
      g(f).classList.toggle('good', good);
      g(f).classList.toggle('bad', !good && g(f).value.trim() !== '');
      if (good) { ok++; rowOk++; }
      else if (g(f).value.trim() !== '' && errors.length < 6) errors.push({ ok: false, text: `Subred ${i + 1} · ${msg}` });
    });
    if (rowOk === 5) hostsOk++;
    if (checks[4][1]) rtxOk++;
  });
  return { ok, total, rtxOk, hostsOk, errors, complete: ok === total };
}
function updateStats() {
  if (state.view === 'clasico') {
    const r = readClassicFields();
    setStats(['CHEQUEOS', 'RTX OK', 'HOSTS OK'], [`${r.ok}/${r.total}`, r.rtxOk, r.hostsOk]);
  } else if (state.view === 'topologia' || state.view === 'asignacion') {
    const sol = solveVlsm(state.topo);
    const baseNet = netOf(state.topo.base.ip, state.topo.base.p);
    const total = blockOf(state.topo.base.p);
    let used = 0, valid = 0, opt = 0, hosts = 0;
    state.topo.segs.forEach(s => {
      const a = state.assign[s.id];
      if (!a) return;
      const p = parsePrefix(a.p), ip = parseIp(a.ip);
      if (ip && p !== null && netOf(ip, p) === ipToInt(ip)) { used += blockOf(p); valid++; if (p === needPrefix(s.hosts)) opt++; hosts += s.hosts; }
    });
    if (state.view === 'topologia') {
      setStats(['SEGMENTOS', 'ESPACIO USADO', 'DISPONIBLE'],
               [`${valid}/${state.topo.segs.length}`, used, total - used]);
    } else {
      setStats(['VÁLIDOS', 'PREFIJO ÓPTIMO', 'HOSTS CUBIERTOS'],
               [`${valid}/${state.topo.segs.length}`, opt, hosts]);
    }
    void sol;
  } else if (state.view === 'consola') {
    const c = state.console;
    const totalIf = state.topo.segs.reduce((a, s) => a + (s.kind === 'link' ? 2 : 1), 0);
    const addr = interfacesFor(c.router, state.topo).filter(x => c.assign[x.seg.id]).length;
    let okSeg = 0, opt = 0;
    Object.entries(c.assign).forEach(([id, a]) => {
      const s = state.topo.segs.find(x => x.id === id);
      if (s && a.p <= needPrefix(s.hosts)) { okSeg++; if (a.p === needPrefix(s.hosts)) opt++; }
    });
    setStats(['INTERFACES', 'SUBREDES OK', 'PREFIJOS ÓPT'], [`${addr}/${totalIf}`, okSeg, opt]);
  } else if (state.view === 'aprender') {
    if (learnCur === 'examen') {
      setStats(['MEJOR INTENTO', 'PARA APROBAR', 'ESTADO'],
               [examBest >= 0 ? `${examBest}/${EXAM_N}` : '—', `${EXAM_PASS}/${EXAM_N}`,
                examPassed() ? 'APROBADO ✓' : 'PENDIENTE']);
    } else {
      const lvl = learnCur ? (LESSONS.find(x => x.id === learnCur) || {}).lvl : 0;
      setStats(['LECCIONES', 'NIVEL', 'PROGRESO'],
               [`${learnDone.length}/${LESSONS.length}`, lvl || '—',
                Math.round(learnDone.length / LESSONS.length * 100) + '%']);
    }
  }
}
function verifyClassic() {
  const r = readClassicFields();
  if (r.complete) {
    setAnalysis(`¡Perfecto! ${r.ok}/${r.total} campos correctos: plano de direcciones completo.`, []);
    setStatus('subnetting clásico verificado ✓');
  } else {
    setAnalysis(`${r.ok}/${r.total} campos correctos. Revisa las marcas rojas.`, r.errors);
    setStatus('hay campos por corregir');
  }
  updateStats();
}
function solutionClassic() {
  const subs = classicSubnets();
  subs.forEach((s, i) => {
    const set = (f, v) => { const el = $(`#cb-table input[data-r="${i}"][data-f="${f}"]`); if (el) { el.value = v; el.classList.add('good'); el.classList.remove('bad'); } };
    set('net', intToIp(s.net)); set('mask', maskStr(s.p));
    set('first', intToIp(s.first)); set('last', intToIp(s.last)); set('bcast', intToIp(s.bcast));
  });
  setStatus('solución mostrada');
  verifyClassic();
}
function hintClassic() {
  const c = state.classic;
  const n = Math.pow(2, c.target - c.p);
  setAnalysis(`Pista: con /${c.target} cada subred tiene ${blockOf(c.target)} direcciones (${usable(c.target)} utilizables) y serán ${n} subredes. Empieza en la dirección de red (${intToIp(netOf(c.base.split('/')[0], c.p))}), no en ${c.base.split('/')[0]}.`,
    [{ ok: true, text: `Salto entre subredes: ${blockOf(c.target)}` }]);
}

/* ================= vista: topología ================= */
// Layout dinámico: sirve para 1–6 routers con 1–3 LANs cada uno.
// Los routers van en columnas iguales; E0 abajo (como en la pizarra), E1/E2 arriba.
function topoLayout(t) {
  const keys = Object.keys(t.labels || {});
  const n = Math.max(keys.length, 1);
  const W = Math.max(1000, n * 310);          // ancho del viewBox según routers
  const col = W / n;
  const R = {}, B = {};
  keys.forEach((k, i) => { R[k] = { x: (i + 0.5) * col, y: 190 }; });
  keys.forEach(k => {
    const lans = t.segs.filter(s => s.kind === 'lan' && s.router === k);
    const place = (arr, y) => {
      if (!arr.length) return;
      const rowW = arr.length * 130 + (arr.length - 1) * 16;
      let x = Math.max(6, R[k].x - rowW / 2);
      arr.forEach(s => { B[s.id] = { x, y }; x += 146; });
    };
    place(lans.slice(1, 3), 46);    // E1, E2 arriba (máx 2)
    place(lans.slice(0, 1), 282);   // E0 abajo
    place(lans.slice(3), 46);       // por si hay más de 3 (no debería)
  });
  return { W, R, B };
}

function assignedNet(id) {
  const a = state.assign[id];
  if (!a) return null;
  const p = parsePrefix(a.p), ip = parseIp(a.ip);
  if (!ip || p === null) return null;
  return { net: netOf(ip, p), p, ip };
}
function renderTopo() {
  const t = state.topo;
  const baseIn = $('#topo-base');
  if (document.activeElement !== baseIn) baseIn.value = `${t.base.ip}/${t.base.p}`;
  const keys = Object.keys(t.labels || {});
  $('#topo-sub').textContent = `${keys.length} routers · ${t.segs.length} segmentos`;
  $('#status-base').textContent = `${t.base.ip}/${t.base.p}`;
  const labels = t.labels || {};
  const L = topoLayout(t);
  $('#topo-svg').setAttribute('viewBox', `0 0 ${L.W} 380`);

  const svg = [];
  const router = (k) => {
    const r = L.R[k]; if (!r) return '';
    return `<rect class="router-box" x="${r.x - 58}" y="${r.y - 30}" width="116" height="60" rx="12"/>
            <text class="node-t" x="${r.x}" y="${r.y - 5}" text-anchor="middle">${labels[k]}</text>
            <text class="node-s" x="${r.x}" y="${r.y + 15}" text-anchor="middle">Router_${k}</text>`;
  };
  const box = (id) => {
    const s = t.segs.find(x => x.id === id), pos = L.B[id];
    if (!s || !pos) return '';
    const a = assignedNet(id);
    const c = colorOf(id);
    return `<rect class="node-box ${a ? 'assigned' : ''}" x="${pos.x}" y="${pos.y}" width="130" height="64" rx="10" stroke="${a ? c : ''}"/>
      <text class="node-t" x="${pos.x + 12}" y="${pos.y + 21}">${s.name}</text>
      <text class="node-s" x="${pos.x + 12}" y="${pos.y + 38}">${s.hosts} hosts · /${needPrefix(s.hosts)}</text>
      ${a ? `<text class="node-p" x="${pos.x + 12}" y="${pos.y + 55}">${intToIp(a.net)}/${a.p}</text>`
          : `<text class="node-s" x="${pos.x + 12}" y="${pos.y + 55}">sin asignar</text>`}`;
  };
  const conn = (id, rx, ry) => {
    const pos = L.B[id]; if (!pos) return '';
    return `<line class="route-l" x1="${rx}" y1="${ry}" x2="${pos.x + 65}" y2="${pos.y < 190 ? pos.y + 64 : pos.y}"/>`;
  };

  // conexiones router-LAN
  t.segs.filter(s => s.kind === 'lan')
        .forEach(s => { const r = L.R[s.router]; if (r) svg.push(conn(s.id, r.x, r.y)); });

  // enlaces seriales (con nube ISP) entre routers adyacentes
  const serial = (s) => {
    const ra = L.R[s.a], rb = L.R[s.b];
    if (!ra || !rb) return;
    const x1 = ra.x + 58, x2 = rb.x - 58;
    const mid = (x1 + x2) / 2;
    const a = assignedNet(s.id);
    const cloud = s.isp
      ? `<ellipse cx="${mid}" cy="190" rx="40" ry="18" fill="#10141d" stroke="#4a5370" stroke-dasharray="5 4"/>
         <text class="node-s" x="${mid}" y="194" text-anchor="middle">ISP</text>`
      : `<circle cx="${mid}" cy="190" r="4" fill="#e07a5f"/>`;
    svg.push(`<line class="route-l" x1="${x1}" y1="190" x2="${x2}" y2="190"/>${cloud}
      <text class="node-s" x="${mid}" y="163" text-anchor="middle">${s.aIf} · 2 hosts</text>
      ${a ? `<text class="link-l" x="${mid}" y="228" text-anchor="middle">${intToIp(a.net)}/${a.p}</text>` : ''}`);
  };
  t.segs.filter(s => s.kind === 'link').forEach(serial);

  // cajas y routers
  t.segs.filter(s => s.kind === 'lan').forEach(s => svg.push(box(s.id)));
  keys.forEach(k => svg.push(router(k)));

  $('#topo-svg').innerHTML = svg.join('');
  renderPartition();
}
function renderPartition() {
  const t = state.topo;
  const total = blockOf(t.base.p);
  let used = 0;
  const parts = [], legend = [];
  t.segs.forEach(s => {
    const a = assignedNet(s.id);
    const p = a ? a.p : needPrefix(s.hosts);
    const block = blockOf(p);
    const c = colorOf(s.id);
    if (a) used += block;
    parts.push(a
      ? `<div class="seg" style="flex:0 0 max(${(block / total * 100).toFixed(2)}%,8px);background:${c}" title="${s.name} ${intToIp(a.net)}/${a.p}"></div>`
      : `<div class="seg free" style="flex:0 0 max(${(block / total * 100).toFixed(2)}%,8px)" title="${s.name} (plan /${p})"></div>`);
    const rango = a ? `${intToIp(a.net)} – ${intToIp(a.net + block - 1)}` : 'sin asignar';
    legend.push(`<div class="pl"><i class="sw" style="background:${a ? c : '#2a3143'}"></i>
      <b>${s.name}</b><span>/${p} · ${block} IPs · ${rango}</span></div>`);
  });
  parts.push(`<div class="seg free" style="flex:1 1 auto" title="espacio libre"></div>`);
  $('#part-bar').innerHTML = parts.join('');
  $('#part-legend').innerHTML = legend.join('');
  $('#part-stat').textContent = `ASIGNADO: ${used} / ${total} (${(used / total * 100).toFixed(1)} %)`;
}
function verifyTopoOrAsign() {
  const t = state.topo;
  const baseNet = netOf(t.base.ip, t.base.p), total = blockOf(t.base.p);
  const errors = []; let valid = 0, opt = 0, none = 0;
  const placed = [];
  t.segs.forEach(s => {
    const a = state.assign[s.id];
    if (!a || (!a.ip && !a.p)) { none++; return; }
    const p = parsePrefix(a.p), ip = parseIp(a.ip);
    if (!ip || p === null) { if (errors.length < 6) errors.push({ ok: false, text: `${s.name} · formato inválido (usa 0.0.0.0 y /n)` }); return; }
    const net = ipToInt(ip), need = needPrefix(s.hosts);
    if (netOf(ip, p) !== net) { if (errors.length < 6) errors.push({ ok: false, text: `${s.name} · ${ip} no es la dirección de red de /${p}` }); return; }
    if (p > need) { if (errors.length < 6) errors.push({ ok: false, text: `${s.name} · /${p} no cabe en ${s.hosts} hosts (mínimo /${need})` }); return; }
    if (net < baseNet || net + blockOf(p) > baseNet + total) { if (errors.length < 6) errors.push({ ok: false, text: `${s.name} · se sale de la red base ${t.base.ip}/${t.base.p}` }); return; }
    const clash = placed.find(q => net < q.net + blockOf(q.p) && q.net < net + blockOf(p));
    if (clash) { if (errors.length < 6) errors.push({ ok: false, text: `${s.name} · solapa con ${clash.name}` }); return; }
    placed.push({ name: s.name, net, p });
    valid++; if (p === need) opt++;
  });
  updateStats();
  const totalSegs = t.segs.length;
  if (valid === totalSegs) {
    setAnalysis(`¡Plan de direcciones correcto! ${valid}/${totalSegs} segmentos, ${opt} con prefijo óptimo.`, []);
    setStatus('topología verificada ✓');
  } else {
    setAnalysis(`${valid}/${totalSegs} segmentos válidos · ${none} sin asignar · ${opt} con prefijo óptimo.`,
      [...errors, ...(none ? [{ ok: false, text: `${none} segmentos sin dirección de red` }] : [])]);
    setStatus('plan incompleto o con errores');
  }
}
function solutionTopo() {
  const sol = solveVlsm(state.topo);
  if (!sol) {
    setAnalysis(`Sin solución: los segmentos no caben en ${state.topo.base.ip}/${state.topo.base.p}.`,
      [{ ok: false, text: `necesario: ${state.topo.segs.reduce((a, s) => a + blockOf(needPrefix(s.hosts)), 0)} de ${blockOf(state.topo.base.p)} IPs` },
       { ok: false, text: 'usa clase A/B, agranda la base o reduce hosts' }]);
    setStatus('base insuficiente para la solución');
    return;
  }
  state.assign = {};
  state.topo.segs.forEach(s => {
    const a = sol[s.id];
    state.assign[s.id] = { ip: intToIp(a.net), p: String(a.p) };
  });
  state.solutionShown = true;
  renderAsign(); renderTopo(); updateStats();
  setStatus('solución VLSM mostrada');
}
function hintTopo() {
  const t = state.topo;
  const need = t.segs.reduce((a, s) => a + blockOf(needPrefix(s.hosts)), 0);
  const pend = t.segs.filter(s => !state.assign[s.id]).length;
  setAnalysis(`Pista: ordena los segmentos de mayor a menor (por prefijo mínimo) y colócalos alineados a su tamaño dentro de ${t.base.ip}/${t.base.p}.`,
    [{ ok: true, text: `Espacio necesario: ${need} de ${blockOf(t.base.p)}` },
     { ok: false, text: `${pend} segmentos sin asignar` }]);
}

/* ================= vista: asignación ================= */
function renderAsign() {
  const t = state.topo;
  const need = t.segs.reduce((a, s) => a + blockOf(needPrefix(s.hosts)), 0);
  $('#asig-needed').textContent = `espacio necesario: ${need} de ${blockOf(t.base.p)}`;
  const tb = $('#asig-table tbody'); tb.innerHTML = '';
  t.segs.forEach(s => {
    const a = state.assign[s.id] || {};
    const sub = s.kind === 'lan' ? `Router_${s.router} · ${s.iface}` : `${s.a}(${s.aIf}) – ${s.b}(${s.bIf})`;
    const tr = document.createElement('tr');
    tr.dataset.seg = s.id;
    tr.innerHTML = `
      <td><span class="seg-name">${s.name}</span><br><span class="seg-sub">${sub}</span></td>
      <td><input data-k="hosts" class="hosts-in" value="${s.hosts}" title="Hosts del segmento (editable)"></td>
      <td><span class="pill pref-pill">/${needPrefix(s.hosts)}</span></td>
      <td><input data-k="ip" placeholder="0.0.0.0" value="${a.ip || ''}"></td>
      <td><input data-k="p" placeholder="/24" value="${a.p !== undefined ? '/' + String(a.p).replace(/^\//, '') : ''}"></td>
      <td><input data-k="first" class="calc" readonly placeholder="—"></td>
      <td><input data-k="last" class="calc" readonly placeholder="—"></td>
      <td><input data-k="bcast" class="calc" readonly placeholder="—"></td>`;
    tb.appendChild(tr);
  });
  $$('#asig-table input[data-k="ip"], #asig-table input[data-k="p"]').forEach(inp => {
    inp.addEventListener('input', () => {
      const tr = inp.closest('tr'), id = tr.dataset.seg;
      const ip = $('input[data-k="ip"]', tr).value.trim();
      const p  = $('input[data-k="p"]', tr).value.trim();
      if (!ip && !p) delete state.assign[id];
      else state.assign[id] = { ip, p: p.replace(/^\//, '') };
      updateRowPreview(tr); updateStats(); updateAssignHead();
    });
  });
  $$('#asig-table input[data-k="hosts"]').forEach(inp => {
    inp.addEventListener('input', () => {
      const tr = inp.closest('tr');
      const s = state.topo.segs.find(x => x.id === tr.dataset.seg);
      const v = parseInt(inp.value, 10);
      if (!s || !v || v < 1 || v > 60000) return;
      s.hosts = v;
      $('.pref-pill', tr).textContent = '/' + needPrefix(v);
      updateRowPreview(tr); updateStats(); updateAssignHead(); renderTopo();
      setStatus(`${s.name}: ${v} hosts → prefijo mínimo /${needPrefix(v)}`);
    });
  });
  $$('#asig-table tbody tr').forEach(updateRowPreview);
  updateAssignHead();
}
function updateRowPreview(tr) {
  const id = tr.dataset.seg;
  const ip = parseIp($('input[data-k="ip"]', tr).value);
  const p  = parsePrefix($('input[data-k="p"]', tr).value);
  const set = (k, v, cls) => {
    const el = $(`input[data-k="${k}"]`, tr);
    el.value = v; el.classList.toggle('good', !!cls); el.classList.toggle('bad', cls === false);
  };
  if (ip && p !== null && netOf(ip, p) === ipToInt(ip)) {
    const net = ipToInt(ip);
    set('first', intToIp(firstU(net, p)), true);
    set('last',  intToIp(lastU(net, p)), true);
    set('bcast', intToIp((net + blockOf(p) - 1) >>> 0), true);
  } else {
    set('first', '', null); set('last', '', null); set('bcast', '', null);
  }
}
function updateAssignHead() {
  const t = state.topo;
  const need = t.segs.reduce((a, s) => a + blockOf(needPrefix(s.hosts)), 0);
  $('#asig-needed').textContent = `espacio necesario: ${need} de ${blockOf(t.base.p)}`;
  const done = t.segs.filter(s => state.assign[s.id]).length;
  $('#asig-status').textContent = `${done} de ${t.segs.length} segmentos asignados`;
}

/* ================= consola ================= */
function termPrint(text, cls) {
  const out = $('#term-out');
  const div = document.createElement('div');
  if (cls) div.className = cls;
  div.innerHTML = text;
  out.appendChild(div);
  out.scrollTop = out.scrollHeight;
}
function termBanner() {
  const r = state.console.router;
  if (state.console.seen[r]) return;
  state.console.seen[r] = true;
  termPrint(`\n<b>Router_${r}</b> — interfaces activas y sin direccionamiento. Escribe <b>ayuda</b> para ver los comandos disponibles.`, 'dim');
}
function renderPlan() {                 // panel "Plan IP · Router"
  const t = state.topo, r = state.console.router;
  const sol = solveVlsm(t);
  const labels = t.labels || { A: 'A', B: 'B', C: 'C' };
  $('#plan-router').textContent = `Router_${r} · ${labels[r]}`;
  const list = interfacesFor(r, t);
  $('#plan-list').innerHTML = list.map(({ iface, seg }) => {
    const a = sol ? sol[seg.id] : null;
    if (!a) return '';
    const ip = intToIp(firstU(a.net, a.p));
    const role = seg.kind === 'link' ? 'GTL (extremo punto a punto)' : 'Gateway (GTL)';
    return `<div class="plan-item">
      <b>${iface}</b>
      <span class="plan-ip">${ip}/${a.p} — ${seg.kind === 'link' ? 'GTL' : 'Gateway'}</span>
      <span class="plan-sub">Máscara ${maskStr(a.p)} · ${role}<br>Primera IP útil · ${seg.name} (${seg.hosts} hosts)</span>
    </div>`;
  }).join('');
}
function renderConsoleTabs() {
  const tabs = $('#term-tabs'); tabs.innerHTML = '';
  const keys = Object.keys(state.topo.labels || { A: 1 });
  if (!keys.includes(state.console.router)) state.console.router = keys[0];
  keys.forEach(r => {
    const b = document.createElement('button');
    b.textContent = 'Router_' + r;
    if (r === state.console.router) b.classList.add('active');
    b.onclick = () => {
      state.console.router = r;
      renderConsoleTabs();
      $('#term-prompt').textContent = `Router_${r}#`;
      termPrint(`<br><span class="dim">— conectado a Router_${r} —</span>`);
      termBanner();
      renderPlan();
      updateStats();
      $('#term-input').focus();
    };
    tabs.appendChild(b);
  });
}
function consoleVerify() {
  const t = state.topo, c = state.console;
  const baseNet = netOf(t.base.ip, t.base.p), total = blockOf(t.base.p);
  let ok = 0, opt = 0;
  const placed = [];
  t.segs.forEach(s => {
    const a = c.assign[s.id];
    if (!a) { termPrint(`✗ ${s.name} — sin direccionar`, 'err'); return; }
    const need = needPrefix(s.hosts);
    const inBase = a.net >= baseNet && a.net + blockOf(a.p) <= baseNet + total;
    const fits = a.p <= need;
    const clash = placed.some(q => a.net < q.net + blockOf(q.p) && q.net < a.net + blockOf(a.p));
    if (inBase && fits && !clash) {
      placed.push(a); ok++; if (a.p === need) opt++;
      termPrint(`✓ ${s.name} — ${intToIp(a.net)}/${a.p} · GTL ${intToIp(firstU(a.net, a.p))} · broadcast ${intToIp((a.net + blockOf(a.p) - 1) >>> 0)}`, 'ok');
    } else {
      termPrint(`✗ ${s.name} — fuera de base, prefijo demasiado grande o solapada`, 'err');
    }
  });
  termPrint(ok === t.segs.length
    ? `\nVerificación correcta: ${ok}/${t.segs.length} segmentos (${opt} con prefijo óptimo).`
    : `\nVerificación: ${ok}/${t.segs.length} segmentos correctos.`,
    ok === t.segs.length ? 'ok' : 'warn');
  updateStats();
}
function runCommand(raw) {
  const line = raw.trim();
  if (!line) return;
  const prompt = `Router_${state.console.router}#`;
  termPrint(`<span class="cmd">${prompt} ${line.replace(/</g, '&lt;')}</span>`);
  const [cmd, ...args] = line.split(/\s+/);
  const c = state.console, t = state.topo, r = c.router;
  const low = cmd.toLowerCase();

  if (low === 'ayuda' || low === 'help') {
    termPrint(
`Comandos disponibles:
  ayuda                          esta lista de comandos
  interfaces                     estado de las interfaces
  ip address &lt;if&gt; &lt;ip/prefijo&gt;   direccionar una interfaz
  no ip address &lt;if&gt;             quitar la dirección
  verificar                      comprueba el direccionamiento
  limpiar                        limpia la consola`);
  }
  else if (low === 'interfaces' || low === 'show') {
    const list = interfacesFor(r, t);
    termPrint(`<span class="dim">Interface     Estado        Dirección</span>`);
    list.forEach(({ iface, seg }) => {
      const a = c.assign[seg.id];
      termPrint(`${iface.padEnd(14)}${(a ? 'up' : 'down').padEnd(14)}${a ? intToIp(a.net) + '/' + a.p : 'sin direccionamiento'}`);
    });
  }
  else if (low === 'limpiar' || low === 'clear') { $('#term-out').innerHTML = ''; termBanner(); }
  else if (low === 'verificar' || low === 'check') consoleVerify();
  else if (low === 'no' && (args[0] || '').toLowerCase() === 'ip' && (args[1] || '').toLowerCase() === 'address') {
    const list = interfacesFor(r, t);
    const item = list.find(x => x.iface.toLowerCase() === (args[2] || '').toLowerCase());
    if (!item) termPrint(`% Interfaz no encontrada. Disponibles: ${list.map(x => x.iface).join(', ')}`, 'err');
    else { delete c.assign[item.seg.id]; termPrint(`% ${item.iface} — dirección eliminada`, 'warn'); updateStats(); }
  }
  else if (low === 'ip' && (args[0] || '').toLowerCase() === 'address') {
    const list = interfacesFor(r, t);
    const item = list.find(x => x.iface.toLowerCase() === (args[1] || '').toLowerCase());
    if (!item) { termPrint(`% Interfaz no encontrada. Disponibles: ${list.map(x => x.iface).join(', ')}`, 'err'); return; }
    const cidr = parseCidr(args[2]);
    if (!cidr) { termPrint('% Formato inválido. Usa: ip address Gig0/0 172.21.240.1/24', 'err'); return; }
    const s = item.seg, need = needPrefix(s.hosts);
    const baseNet = netOf(t.base.ip, t.base.p), total = blockOf(t.base.p);
    const net = netOf(cidr.ip, cidr.p);
    if (cidr.p > need) { termPrint(`% /${cidr.p} no cabe en ${s.hosts} hosts (mínimo /${need})`, 'err'); return; }
    if (net < baseNet || net + blockOf(cidr.p) > baseNet + total) { termPrint(`% ${cidr.ip}/${cidr.p} está fuera de la red base ${t.base.ip}/${t.base.p}`, 'err'); return; }
    const clashId = Object.keys(c.assign).find(id => {
      if (id === s.id) return false;
      const q = c.assign[id];
      return net < q.net + blockOf(q.p) && q.net < net + blockOf(cidr.p);
    });
    if (clashId) { termPrint(`% Se solapa con ${t.segs.find(x => x.id === clashId).name}`, 'err'); return; }
    if (cidr.p < 31 && (cidr.ip === intToIp(net) || cidr.ip === intToIp((net + blockOf(cidr.p) - 1) >>> 0))) {
      termPrint('% La dirección de interfaz no puede ser la red ni el broadcast', 'err'); return;
    }
    const same = c.assign[s.id];
    if (same && (same.net !== net || same.p !== cidr.p) && s.kind === 'link') {
      termPrint(`% Los extremos del enlace deben estar en la misma subred (ya: ${intToIp(same.net)}/${same.p})`, 'err'); return;
    }
    c.assign[s.id] = { net, p: cidr.p };
    termPrint(`% ${item.iface} direccionada → subred ${intToIp(net)}/${cidr.p} · GTL ${intToIp(firstU(net, cidr.p))} · broadcast ${intToIp((net + blockOf(cidr.p) - 1) >>> 0)}`, 'ok');
    updateStats();
  }
  else termPrint(`% Comando no reconocido: ${cmd}. Escribe 'ayuda'.`, 'err');
}
function resetConsole() {
  state.console = { router: state.console.router, assign: {}, hist: [], hi: -1, seen: {} };
  $('#term-out').innerHTML = '';
  termBanner();
  updateStats();
  setStatus('consola reiniciada');
}
function solutionConsole() {
  const sol = solveVlsm(state.topo);
  if (!sol) {
    termPrint(`% Sin solución: los segmentos no caben en ${state.topo.base.ip}/${state.topo.base.p}. Usa una base más grande (clase A o B) o reduce hosts.`, 'err');
    return;
  }
  state.console.assign = {};
  state.topo.segs.forEach(s => {
    const a = sol[s.id];
    state.console.assign[s.id] = { net: a.net, p: a.p };
  });
  termPrint('<span class="dim">— solución aplicada a todos los routers —</span>');
  interfacesFor(state.console.router, state.topo).forEach(({ iface, seg }) => {
    const a = state.console.assign[seg.id];
    termPrint(`% ${iface} → ${intToIp(a.net)}/${a.p} · GTL ${intToIp(firstU(a.net, a.p))}`, 'ok');
  });
  updateStats();
}

/* ================= navegación y panel ================= */
const VIEW_META = {
  clasico:    { label: 'ejercicio: subnetting clásico', nueva: 'Nuevo reto' },
  topologia:  { label: 'diagrama: topología VLSM',       nueva: 'Nueva topología' },
  asignacion: { label: 'plan de direcciones',            nueva: 'Nueva topología' },
  consola:    { label: 'laboratorio: consola de routers', nueva: 'Reiniciar consola' },
  aprender:   { label: 'aprender: de cero a avanzado',    nueva: 'Reiniciar progreso' },
  acerca:     { label: 'acerca de NetQuest',             nueva: 'Nuevo reto' },
};
function switchView(v) {
  state.view = v;
  $$('.rail-btn').forEach(b => b.classList.toggle('active', b.dataset.view === v));
  $$('.view').forEach(s => s.classList.toggle('hidden', s.id !== 'view-' + v));
  $('#topbar-meta').textContent = VIEW_META[v].label;
  $('#btn-nueva').textContent = VIEW_META[v].nueva;
  $('#diff-tabs').style.display = v === 'clasico' ? 'flex' : 'none';
  defaultAnalysis();
  if (v === 'topologia' || v === 'asignacion') renderTopo();
  if (v === 'asignacion') renderAsign();
  if (v === 'consola') { renderConsoleTabs(); termBanner(); renderPlan(); $('#term-prompt').textContent = `Router_${state.console.router}#`; }
  if (v === 'aprender') renderLearnList();
  updateStats();
  setStatus('listo');
}
function hintCurrent() {
  ({ clasico: hintClassic, topologia: hintTopo, asignacion: hintTopo,
     consola: () => setAnalysis("Pista: usa 'interfaces' para listar, luego 'ip address <interfaz> <ip/prefijo>' con una IP útil de la subred (la GTL).", []),
     aprender: hintLearn,
     acerca: defaultAnalysis })[state.view]();
}
function solutionCurrent() {
  ({ clasico: solutionClassic, topologia: solutionTopo, asignacion: solutionTopo,
     consola: solutionConsole, aprender: revealLearn, acerca: () => {} })[state.view]();
}
function verifyCurrent() {
  ({ clasico: verifyClassic, topologia: verifyTopoOrAsign, asignacion: verifyTopoOrAsign,
     consola: consoleVerify, aprender: verifyLearn, acerca: () => {} })[state.view]();
}
function loadTopology(mode) {
  state.topoMode = mode;
  if (mode === 'pizarra') state.topo = defaultTopology();
  else if (mode === 'random') state.topo = randomTopology();
  else {
    const saved = loadCustom();
    if (saved) { state.topo = saved; cxFromTopo(saved); }
    else { cxState = defaultCx(); renderBuilder(); state.topo = makeTopology(cxSpec()); }
  }
  if (!state.topo.labels[state.console.router]) state.console.router = Object.keys(state.topo.labels)[0];
  state.assign = {}; state.solutionShown = false;
  state.console = { router: state.console.router, assign: {}, hist: [], hi: -1, seen: {} };
  $('#term-out').innerHTML = '';
  $('#topo-mode').value = mode;
  $('#builder').classList.toggle('hidden', mode !== 'custom');
  if (mode !== 'custom') $('#cx-msg').textContent = '';
  renderTopo(); renderAsign(); termBanner(); renderPlan(); defaultAnalysis(); updateStats();
}
function nuevaCurrent() {
  if (state.view === 'clasico') {
    newClassic(state.diff);
    state.solutionShown = false;
    renderClassic(); defaultAnalysis(); updateStats();
    setStatus('nuevo reto generado');
  } else if (state.view === 'consola') {
    resetConsole();
  } else if (state.view === 'aprender') {
    learnDone = []; saveLearn(); learnCur = null;
    examBest = -1; saveExam(); examState = null;
    resetLearnMain(); renderLearnList(); updateStats();
    setStatus('progreso y examen reiniciados');
  } else {
    loadTopology(state.topoMode);
    setStatus(state.topoMode === 'pizarra' ? 'ejercicio pizarra recargado'
             : state.topoMode === 'custom' ? 'ejercicio personalizado recargado'
             : 'nueva topología generada');
  }
}

/* ================= init ================= */
function init() {
  $$('.rail-btn').forEach(b => b.onclick = () => switchView(b.dataset.view));
  $('#btn-verificar').onclick = verifyCurrent;
  $('#btn-pista').onclick = hintCurrent;
  $('#btn-solucion').onclick = solutionCurrent;
  $('#btn-nueva').onclick = nuevaCurrent;
  $('#side-toggle').onclick = () => openSide(!$('.side').classList.contains('open'));

  $$('#diff-tabs button').forEach(b => b.onclick = () => {
    $$('#diff-tabs button').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    state.diff = b.dataset.diff;
    newClassic(state.diff);
    renderClassic(); defaultAnalysis(); updateStats();
    setStatus(`dificultad: ${b.textContent}`);
  });

  $('#cb-prefix').onchange = () => {
    state.classic.target = +$('#cb-prefix').value;
    renderClassic(); defaultAnalysis(); updateStats();
    setStatus(`dividido en /${state.classic.target}`);
  };
  const applyBase = () => {
    const cidr = parseCidr($('#cb-base').value);
    if (!cidr) { setStatus('red base inválida (ej.: 192.168.1.0/24)'); $('#cb-base').value = state.classic.base; return; }
    state.classic.base = `${cidr.ip}/${cidr.p}`;
    state.classic.p = cidr.p;
    if (state.classic.target <= cidr.p) state.classic.target = Math.min(cidr.p + 1, 30);
    renderClassic(); defaultAnalysis(); updateStats();
    setStatus('red base actualizada');
  };
  $('#cb-base').addEventListener('change', applyBase);
  $('#cb-base').addEventListener('keydown', e => { if (e.key === 'Enter') applyBase(); });

  // vista clásica: selector de clase A/B/C
  $$('#cb-chips button').forEach(b => b.onclick = () => {
    state.classicCls = b.dataset.c;
    state.solutionShown = false;
    newClassic(state.diff, state.classicCls);
    renderClassic(); defaultAnalysis(); updateStats();
    setStatus(`clase ${state.classicCls}: red base ${state.classic.base}`);
  });

  // topología: red base editable y selector de ejercicio
  const applyTopoBase = () => {
    const cidr = parseCidr($('#topo-base').value);
    if (!cidr) { setStatus('red base inválida (ej.: 172.16.0.0/20)'); renderTopo(); return; }
    state.topo.base = { ip: cidr.ip, p: cidr.p };
    state.assign = {};
    renderTopo(); renderAsign(); updateStats();
    setStatus(`red base: ${cidr.ip}/${cidr.p}`);
  };
  $('#topo-base').addEventListener('change', applyTopoBase);
  $('#topo-base').addEventListener('keydown', e => { if (e.key === 'Enter') applyTopoBase(); });
  $('#topo-mode').addEventListener('change', () => {
    loadTopology($('#topo-mode').value);
    setStatus({ pizarra: 'ejercicio de la pizarra', random: 'topología aleatoria',
                custom: 'modo personalizado: crea tu propio ejercicio' }[state.topoMode]);
  });

  // ---- creador de ejercicios ----
  $('#cx-class').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    cxState.cls = b.dataset.c;
    cxState.base = CLASS_BASE[b.dataset.c];
    $('#cx-base').value = cxState.base;
    $$('#cx-class button').forEach(x => x.classList.toggle('active', x === b));
    $('#cx-msg').textContent = '';
    setStatus(`clase ${b.dataset.c}: base sugerida ${CLASS_BASE[b.dataset.c]}`);
  });
  $('#cx-n').addEventListener('change', () => {
    const spec = cxSpecFromDom();
    cxState.routers = spec.routers;
    cxState.base = spec.base; cxState.serial = spec.serial;
    cxState.n = Math.max(1, Math.min(6, +$('#cx-n').value || 3));
    while (cxState.routers.length < cxState.n) cxState.routers.push(defaultRouter(cxState.routers.length));
    cxState.routers = cxState.routers.slice(0, cxState.n);
    renderBuilder();
    setStatus(`${cxState.n} routers en el ejercicio`);
  });
  $('#cx-routers').addEventListener('change', e => {
    if (!e.target.classList.contains('cx-lans')) return;
    const spec = cxSpecFromDom();
    cxState.routers = spec.routers;
    cxState.base = spec.base; cxState.serial = spec.serial; cxState.n = spec.n;
    const i = +e.target.closest('.cx-router').dataset.i;
    const r = cxState.routers[i];
    r.lans = +e.target.value;
    while (r.hosts.length < r.lans) r.hosts.push(defaultHosts(r.hosts.length));
    r.hosts = r.hosts.slice(0, r.lans);
    renderBuilder();
    setStatus(`Router ${i + 1}: ${r.lans} interfaz(es) LAN`);
  });
  $('#cx-create').addEventListener('click', buildCustom);
  $('#cx-serial').addEventListener('change', e => { cxState.serial = e.target.checked; });
  $('#cx-open').addEventListener('click', () => {
    loadTopology('custom');
    setStatus('modo personalizado: define tu ejercicio y pulsa “Crear ejercicio”');
    $('#builder').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });

  // consola
  const input = $('#term-input');
  input.addEventListener('keydown', e => {
    const c = state.console;
    if (e.key === 'Enter') {
      const v = input.value;
      if (v.trim()) { c.hist.push(v); c.hi = c.hist.length; }
      input.value = '';
      runCommand(v);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (c.hist.length) { c.hi = Math.max(0, c.hi - 1); input.value = c.hist[c.hi] || ''; }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (c.hist.length) { c.hi = Math.min(c.hist.length, c.hi + 1); input.value = c.hist[c.hi] || ''; }
    }
  });
  $('#term').addEventListener('click', () => input.focus());

  renderClassic();
  renderTopo();
  renderAsign();
  renderBuilder();
  renderConsoleTabs();
  termBanner();
  renderPlan();
  updateStats();
  switchView('clasico');
}
/* ================= aprender: curso de cero a avanzado ================= */
const LESSONS = [
{
  id:'ip', lvl:1, title:'¿Qué es una IP?',
  hint:'Piensa en la IP como el número de casa de tu PC: 4 números, cada uno de 0 a 255 (8 bits).',
  html:`
    <h4>Una dirección lógica</h4>
    <p>Una <b>dirección IP</b> es la dirección lógica que identifica a tu dispositivo dentro de una red. Es como el número de casa donde el cartero (el router) entrega los datos.</p>
    <ul>
      <li>Se escribe con <b>4 números separados por puntos</b>: <code>192.168.1.10</code></li>
      <li>Cada número se llama <b>octeto</b>: vale de <b>0 a 255</b> porque son 8 bits binarios (2⁸ = 256 combinaciones)</li>
      <li>En total una IPv4 tiene <b>32 bits</b></li>
    </ul>
    <div class="callout"><b>IP vs MAC:</b> la IP es <i>lógica</i> (cambia si te cambias de red); la MAC es <i>física</i> (grabada de fábrica en la tarjeta de red).</div>
    <div class="callout"><b>Pública vs privada:</b> la pública te identifica en internet; las privadas (<code>10.x</code>, <code>172.16-31.x</code>, <code>192.168.x</code>) solo viven en tu red local.</div>`,
  anim:'ip',
  quiz:[
    { q:'¿Cuántos bits tiene una dirección IPv4?', opts:['16 bits','32 bits','64 bits','128 bits'], a:1,
      ok:'¡Exacto! 4 octetos × 8 bits = 32 bits.', why:'Son 4 octetos de 8 bits: 4 × 8 = 32.' },
    { q:'¿Cuál es el rango válido de cada octeto?', opts:['0 a 127','0 a 255','1 a 32','0 a 1024'], a:1,
      ok:'¡Correcto! 2⁸ = 256 valores, del 0 al 255.', why:'8 bits permiten 256 combinaciones: de 0 a 255.' },
    { q:'¿Qué diferencia hay entre una IP y una MAC?', opts:['La IP es lógica y cambia; la MAC es física de fábrica','Son lo mismo','La MAC cambia al cambiarse de red','La IP va grabada en la tarjeta'], a:0,
      ok:'¡Bien! Ya distingues lógico de físico.', why:'La MAC es el número de serie de la tarjeta; la IP la asigna la red.' },
  ],
},
{
  id:'clases', lvl:1, title:'Clases de redes (A, B, C, D, E)',
  hint:'Mira el primer octeto: 1-126 = A, 128-191 = B, 192-223 = C.',
  html:`
    <h4>El primer octeto manda</h4>
    <p>Antes del CIDR, la clase de una red se definía por el <b>primer octeto</b>. Sigue usándose en exámenes y para saber la máscara "por defecto":</p>
    <ul>
      <li><b>Clase A</b> (1 – 126): máscara /8 → 16.777.214 hosts. Ej: <code>10.0.0.1</code></li>
      <li><b>Clase B</b> (128 – 191): máscara /16 → 65.534 hosts. Ej: <code>172.16.5.10</code></li>
      <li><b>Clase C</b> (192 – 223): máscara /24 → 254 hosts. Ej: <code>192.168.1.1</code></li>
      <li><b>Clase D</b> (224 – 239): <i>multicast</i> (un dato a muchos, ej. videoconferencias)</li>
      <li><b>Clase E</b> (240 – 255): experimentación</li>
    </ul>
    <div class="callout"><b>Rangos privados (casa y uni):</b> <code>10.0.0.0/8</code>, <code>172.16.0.0/12</code>, <code>192.168.0.0/16</code>. El ejercicio de tu pizarra usa clase B: <code>172.16.0.0/16</code>.</div>`,
  anim:'clases',
  quiz:[
    { q:'¿A qué clase pertenece 192.168.1.1?', opts:['Clase A','Clase B','Clase C','Clase D'], a:2,
      ok:'¡Correcto! Clase C (192-223) → /24 por defecto.', why:'El primer octeto 192 cae en el rango 192–223 = clase C.' },
    { q:'¿Cuántos hosts utilizables tiene la clase B por defecto?', opts:['254','65.534','16.777.214','510'], a:1,
      ok:'¡Eso! 2¹⁶ − 2 = 65.534.', why:'Clase B = /16 → 2¹⁶ − 2 = 65.534.' },
    { q:'La clase D se usa para…', opts:['Direcciones fijas','Multicast (un flujo a varios equipos)','Broadcast masivo','Pruebas de laboratorio'], a:1,
      ok:'¡Bien! Multicast.', why:'224–239 es multicast: se envía a múltiples receptores a la vez.' },
  ],
},
{
  id:'mascara', lvl:1, title:'La máscara de subred',
  hint:'La máscara "enciende" los bits de red: /24 = 255.255.255.0 = 24 bits de red.',
  html:`
    <h4>La máscara separa red de host</h4>
    <p>Una IP por sí sola no dice a qué red pertenece. Para eso está la <b>máscara de subred</b>: indica cuántos bits (de los 32) son de <b>red</b> y cuántos de <b>host</b>.</p>
    <ul>
      <li>Se escribe como una IP: <code>255.255.255.0</code></li>
      <li>O en notación CIDR: <code>/24</code> → 24 bits de red encendidos</li>
      <li><code>255.255.0.0</code> = <code>/16</code> · <code>255.255.255.252</code> = <code>/30</code></li>
    </ul>
    <div class="callout"><b>Operación clave:</b> para hallar la dirección de red se hace <b>IP AND máscara</b> (bit a bit: solo sobreviven los bits donde ambos son 1).</div>`,
  anim:'mascara',
  quiz:[
    { q:'¿Qué indica el prefijo /26?', opts:['26 hosts disponibles','26 bits de la dirección son de RED','La red tiene 26 equipos','Se divide en 26 subredes'], a:1,
      ok:'¡Exacto! 26 bits de red → 6 de host.', why:'El prefijo = cantidad de bits de RED de la máscara.' },
    { q:'255.255.255.0 equivale a…', opts:['/16','/24','/25','/30'], a:1,
      ok:'¡Correcto! Tres octetos completos = 24 bits.', why:'24 bits encendidos seguidos = /24.' },
    { q:'Para obtener la dirección de red se usa la operación…', opts:['OR','SUMA','AND','XOR'], a:2,
      ok:'¡Bien! AND deja solo los bits de red.', why:'IP AND máscara descarta los bits de host.' },
  ],
},
{
  id:'redbcast', lvl:1, title:'Red, broadcast y rangos',
  hint:'Red + 1 = primera usable; broadcast − 1 = última; utilizables = 2^h − 2.',
  html:`
    <h4>Las direcciones especiales</h4>
    <p>Dentro de cada bloque hay dos direcciones reservadas al extremo, y las de en medio son las que usan los equipos:</p>
    <ul>
      <li><b>Dirección de red</b>: primera del bloque (bits de host en 0). Identifica al segmento.</li>
      <li><b>Broadcast</b>: última del bloque (bits de host en 1). Llega a todos.</li>
      <li><b>Utilizables</b>: red + 1 … broadcast − 1, o sea <b>2ʰ − 2</b>.</li>
    </ul>
    <div class="callout"><b>Ejemplo:</b> <code>192.168.5.70/26</code> → red <b>192.168.5.64</b>, broadcast <b>192.168.5.127</b>, utilizables .65 – .126 (62 hosts).</div>`,
  anim:'rango',
  quiz:[
    { q:'En 192.168.5.64/26, ¿cuál es la dirección de broadcast?', opts:['192.168.5.63','192.168.5.64','192.168.5.126','192.168.5.127'], a:3,
      ok:'¡Correcto! .64 + 64 − 1 = .127.', why:'Bloque de 64: empieza en .64 y termina en .64 + 64 − 1 = .127.' },
    { q:'¿Cuántas IPs utilizables hay en esa subred?', opts:['60','62','64','66'], a:1,
      ok:'¡Eso! 64 − 2 = 62.', why:'2⁶ − 2 = 62 (se restan red y broadcast).' },
    { q:'La primera IP utilizable es…', opts:['192.168.5.64','192.168.5.65','192.168.5.66','192.168.5.127'], a:1,
      ok:'¡Bien! Red + 1.', why:'La dirección de red no se asigna: la primera usable es red + 1 = .65.' },
  ],
},
{
  id:'hosts', lvl:2, title:'¿Cuántos equipos caben?',
  hint:'Suma 2 (red + broadcast) y busca la potencia de 2 más pequeña que los contenga.',
  html:`
    <h4>Potencias de 2</h4>
    <p>Los bloques siempre son <b>potencias de 2</b> (2, 4, 8, 16… 256), porque se forman encendiendo bits de host:</p>
    <ul>
      <li><b>h</b> bits de host → 2ʰ direcciones → <b>2ʰ − 2 utilizables</b></li>
      <li>Necesitas 50 hosts → con 52 no basta 32 (30), sí 64 (62) → prefijo <b>/26</b> ✓</li>
      <li>Para 200 hosts: /25 da solo 126 → toca <b>/24</b> (254)</li>
    </ul>
    <div class="callout"><b>Fórmula rápida:</b> <code>prefijo = 32 − ceil(log2(hosts + 2))</code>. ¡En la consola la usaste sin saberlo!</div>`,
  anim:'hostsCalc',
  quiz:[
    { q:'Para 30 hosts, ¿cuál es el prefijo mínimo?', opts:['/26','/27','/28','/29'], a:1,
      ok:'¡Exacto! /27 → 2⁵ − 2 = 30, justo.', why:'/27 → 5 bits de host → 32 − 2 = 30 utilizables, justo 30.' },
    { q:'2⁷ − 2 = ?', opts:['62','126','254','510'], a:1,
      ok:'¡Correcto! 128 − 2.', why:'2⁷ = 128; 128 − 2 = 126.' },
    { q:'Si necesitas 200 hosts, usas…', opts:['/25','/26','/24','/30'], a:2,
      ok:'¡Bien! /24 da 254 ≥ 200.', why:'/25 solo da 126; /24 da 254 utilizables.' },
  ],
},
{
  id:'subnetting', lvl:2, title:'Subnetting: dividir una red',
  hint:'Bits prestados = 2ⁿ subredes; salto = 2^(32 − prefijo).',
  html:`
    <h4>Dividir para gobernar</h4>
    <p><b>Subnetting</b> = partir una red en varias más pequeñas "prestando" bits del campo de host al campo de red:</p>
    <ul>
      <li>1️⃣ ¿Cuántas subredes? → <b>n bits prestados = 2ⁿ subredes</b></li>
      <li>2️⃣ Súmalos al prefijo: /24 + 2 bits = <b>/26</b></li>
      <li>3️⃣ <b>Salto</b> = 2^(32 − prefijo) → con /26: 64 (.0, .64, .128, .192)</li>
      <li>4️⃣ Lista las subredes y resta 2 a cada una para hosts utilizables</li>
    </ul>
    <div class="callout"><b>Trampa del examen:</b> si la red base trae bits prendidos (<code>192.168.23.8/24</code>), la primera subred empieza en <code>192.168.23.0</code>, ¡no en .8!</div>`,
  anim:'split',
  quiz:[
    { q:'De /24 a /27 se generan…', opts:['4 subredes','6 subredes','8 subredes','16 subredes'], a:2,
      ok:'¡Correcto! 3 bits → 2³ = 8.', why:'27 − 24 = 3 bits prestados → 2³ = 8 subredes.' },
    { q:'Con prefijo /26, ¿cuál es el salto entre subredes?', opts:['16','32','64','128'], a:2,
      ok:'¡Eso! 2⁶ = 64.', why:'Salto = 2^(32 − 26) = 2⁶ = 64 direcciones.' },
    { q:'¿Cuántos bits se prestan de /24 a /26?', opts:['1 bit','2 bits','4 bits','8 bits'], a:1,
      ok:'¡Bien! 2 bits = 4 subredes.', why:'26 − 24 = 2 bits.' },
  ],
},
{
  id:'seriales', lvl:2, title:'Enlaces seriales: /30 y /31',
  hint:'Punto a punto = solo 2 equipos: sobra /30 (4 direcciones) o /31 (2 y las dos se usan).',
  html:`
    <h4>Menos es más en los enlaces</h4>
    <p>Un enlace serial (router ↔ router) solo une <b>2 equipos</b>: gastar una red clase C entera sería desperdicio. Se usan prefijos mínimos:</p>
    <ul>
      <li><b>/30</b> → 4 direcciones: red, 2 usables (un extremo y el otro), broadcast</li>
      <li><b>/31</b> → exactamente 2 y las dos se usan (estándar moderno p2p)</li>
      <li>En tu ejercicio: enlace A–B = <code>172.16.13.136/30</code> → .137 (Router_A) y .138 (Router_B)</li>
    </ul>
    <div class="callout"><b>Dato de examen:</b> en /30 la red y el broadcast <b>no</b> se asignan a interfaces: quedan solo 2 IPs utilizables.</div>`,
  anim:'serial',
  quiz:[
    { q:'¿Cuántas IPs utilizables tiene un /30?', opts:['1','2','4','6'], a:1,
      ok:'¡Correcto! Un extremo y el otro.', why:'4 direcciones − red − broadcast = 2 utilizables.' },
    { q:'¿Qué prefijo se usa típicamente en un enlace serial?', opts:['/24','/30','/16','/8'], a:1,
      ok:'¡Eso! /30 (o /31 moderno).', why:'Punto a punto = /30 clásico.' },
    { q:'En 10.0.0.4/30, ¿cuál es la broadcast?', opts:['10.0.0.5','10.0.0.6','10.0.0.7','10.0.0.8'], a:2,
      ok:'¡Bien! .4 red, .5 y .6 usables, .7 broadcast.', why:'Bloque de 4: .4, .5, .6, .7 → la última es broadcast.' },
  ],
},
{
  id:'vlsm', lvl:3, title:'VLSM (máscara de longitud variable)',
  hint:'Ordena de mayor a menor y alinea cada bloque a su tamaño antes de colocarlo.',
  html:`
    <h4>Subredes de distintos tamaños</h4>
    <p><b>VLSM</b> usa prefijos <i>diferentes</i> en la misma red: /21 para lo grande, /26 para lo mediano, /30 para los enlaces. Así casi no desperdicias direcciones.</p>
    <ul>
      <li>1️⃣ Ordena los segmentos de <b>mayor a menor</b></li>
      <li>2️⃣ Asigna a cada uno su prefijo mínimo (2ʰ − 2 ≥ hosts)</li>
      <li>3️⃣ Coloca cada bloque <b>alineado</b> a su tamaño (un /25 solo empieza en múltiplo de 128)</li>
      <li>4️⃣ Verifica que no se solapan y que caben en la red base</li>
    </ul>
    <div class="callout"><b>Tu ejercicio:</b> con base <code>172.16.0.0/16</code>, E0 CARACAS (2000 hosts) pide <b>/21</b>, E0 LARA (600) <b>/22</b>, E0 ZULIA (240) <b>/24</b>… y así hasta los seriales /30.</div>`,
  anim:'vlsm',
  quiz:[
    { q:'Para aplicar VLSM, lo primero es…', opts:['Asignar al azar','Ordenar los segmentos de mayor a menor','Empezar por los /30','Dividir en partes iguales'], a:1,
      ok:'¡Correcto! Los grandes primero.', why:'Si empiezas por los pequeños, los grandes no caben alineados.' },
    { q:'"Alinear un bloque" significa…', opts:['Que empiece en un múltiplo de su tamaño','Ponerlo al principio de la IP','Usar siempre /24','Que no tenga broadcast'], a:0,
      ok:'¡Eso! Ej.: un /25 solo empieza en .0 o .128.', why:'Un bloque de 128 solo puede comenzar en múltiplos de 128.' },
    { q:'VLSM permite usar prefijos distintos en la misma red:', opts:['Falso','Verdadero'], a:1,
      ok:'¡Verdadero! De ahí su nombre.', why:'Variable Length Subnet Mask = longitud de máscara variable.' },
  ],
},
{
  id:'ruteo', lvl:3, title:'Cómo rutea un router',
  hint:'El router ANDea el destino con las máscaras de su tabla; si no coincide, usa 0.0.0.0/0.',
  html:`
    <h4>La tabla de ruteo</h4>
    <p>Cada router guarda una <b>tabla</b> con las redes que conoce y por qué interfaz salen. Al llegar un paquete:</p>
    <ul>
      <li>Toma el <b>destino</b> del paquete</li>
      <li>Lo <b>ANDea</b> con las máscaras de sus rutas hasta hallar coincidencia</li>
      <li>Si no hay coincidencia → <b>ruta por defecto</b> <code>0.0.0.0/0</code> ("no sé, pregúntale a otro")</li>
    </ul>
    <div class="callout"><b>Puerta de enlace (gateway/GTL):</b> es la IP del router en tu red; sin ella tu PC no sale. Por eso en la consola se direcciona la interfaz con la <b>primera IP útil</b> de la subred.</div>`,
  anim:'packet',
  quiz:[
    { q:'0.0.0.0/0 significa…', opts:['Red nula','Ruta por defecto','Interfaz apagada','Dirección de broadcast'], a:1,
      ok:'¡Correcto! Coincide con todo: "por aquí salgo".', why:'Máscara /0 coincide con cualquier destino = ruta por defecto.' },
    { q:'¿Cómo decide el router por dónde enviar?', opts:['Solo por la MAC destino','Comparando el destino con su tabla usando la máscara','Por el número de puerto','Al azar'], a:1,
      ok:'¡Eso! AND + tabla de ruteo.', why:'El router hace destino AND máscara y busca la ruta coincidente.' },
    { q:'La puerta de enlace predeterminada es…', opts:['La IP del router en tu red','La IP de tu propia PC','La del servidor DNS','La dirección de broadcast'], a:0,
      ok:'¡Bien! La interfaz del router en tu LAN.', why:'Gateway = IP del router dentro de tu misma red.' },
  ],
},
{
  id:'practica', lvl:3, title:'Practica: tu ejercicio de la pizarra',
  hint:'Cuenta hosts → prefijos mínimos → VLSM → plan → consola. ¡Ese es el flujo de tu clase!',
  html:`
    <h4>El flujo completo</h4>
    <ul>
      <li>1️⃣ Cuenta los hosts de cada segmento (pizarra: 2000, 600, 240, 60, 20, 14, 5, 4…)</li>
      <li>2️⃣ Calcula el prefijo mínimo de cada uno (2ʰ − 2)</li>
      <li>3️⃣ Aplica VLSM: mayor a menor, alineados, sin solapes</li>
      <li>4️⃣ Llena el <b>plan de direcciones</b> (red, máscara, GTL, broadcast)</li>
      <li>5️⃣ Configura cada router: <code>ip address &lt;interfaz&gt; &lt;ip/prefijo&gt;</code></li>
    </ul>
    <div class="callout"><b>Regla de tu pizarra:</b> la IP principal de cada LAN va en <b>E0</b>; con VLSM se resuelven E1, E2 y los seriales.</div>
    <div class="anim-btns">
      <button class="btn" data-goto="clasico">▶ Subnetting clásico</button>
      <button class="btn" data-goto="topologia">▶ Topología VLSM</button>
      <button class="btn" data-goto="asignacion">▶ Asignación</button>
      <button class="btn" data-goto="consola">▶ Consola</button>
    </div>`,
  anim:null,
  quiz:[
    { q:'E0 de CARACAS tiene 2000 hosts: ¿prefijo mínimo?', opts:['/20','/21','/22','/24'], a:1,
      ok:'¡Correcto! 2048 = 2¹¹ → 32 − 11 = /21.', why:'2000 + 2 = 2002 → siguiente potencia 2048 = 2¹¹ → /21.' },
    { q:'Según la pizarra, la IP principal de cada LAN va en…', opts:['E1','E2','E0','Serial0/0/0'], a:2,
      ok:'¡Eso! La nota dice "IP Principal LAN → E0".', why:'La pizarra indica: Ip Principal LAN → E0.' },
    { q:'¿Qué comando direcciona una interfaz en la consola?', opts:['assign ip Ethernet0','ip address &lt;interfaz&gt; &lt;ip/prefijo&gt;','set interface lan1','mask apply'], a:1,
      ok:'¡Bien! Tal cual lo practicaste.', why:'Estilo IOS: ip address Ethernet0 172.16.0.1/21.' },
  ],
},
];

/* ---- animaciones ---- */
const ANIMS = {
  ip(slot){
    slot.innerHTML = `
      <div class="anim-row" id="ip-row"></div>
      <div class="bin" id="ip-bin"></div>
      <div class="anim-slider">
        <span class="val" id="ip-lbl"></span>
        <input type="range" min="0" max="255" value="10" id="ip-r" title="Cambia el 4.º octeto">
      </div>
      <p class="anim-cap">Mueve el deslizador: cada bit azul vale su posición (128·64·32·16·8·4·2·1). 8 bits = 1 octeto = 0 a 255.</p>`;
    const upd = v => {
      const o = [192,168,1,v];
      $('#ip-row', slot).innerHTML = o.map((n,i)=>`<div class="oct"><span class="lbl">OCTETO ${i+1}</span><span class="dec">${n}</span></div>`).join('');
      $('#ip-bin', slot).innerHTML = o.map(n=>`<div class="bin-g">${n.toString(2).padStart(8,'0').split('').map(b=>`<span class="bit ${b==='1'?'on':''}">${b}</span>`).join('')}</div>`).join('');
      $('#ip-lbl', slot).textContent = `192.168.1.${v} = ${v.toString(2).padStart(8,'0')}`;
    };
    $('#ip-r', slot).addEventListener('input', e => upd(+e.target.value));
    upd(10);
  },
  clases(slot){
    slot.innerHTML = `
      <div class="class-bar">
        <div style="flex:126;background:#5b8def" title="Clase A: 1 – 126 (por defecto /8)">A</div>
        <div style="flex:64;background:#81b29a"  title="Clase B: 128 – 191 (por defecto /16)">B</div>
        <div style="flex:32;background:#f2cc8f"  title="Clase C: 192 – 223 (por defecto /24)">C</div>
        <div style="flex:16;background:#9b7ede"  title="Clase D: 224 – 239 (multicast)">D</div>
        <div style="flex:16;background:#e07a5f"  title="Clase E: 240 – 255 (experimentación)">E</div>
      </div>
      <div class="class-list">
        <div class="cl"><b>A · 1-126 → /8</b>16.777.214 hosts · ej. 10.0.0.1</div>
        <div class="cl"><b>B · 128-191 → /16</b>65.534 hosts · ej. 172.16.5.10</div>
        <div class="cl"><b>C · 192-223 → /24</b>254 hosts · ej. 192.168.1.1</div>
        <div class="cl"><b>D · 224-239</b>multicast · ej. 224.0.0.5</div>
        <div class="cl"><b>E · 240-255</b>experimentación</div>
        <div class="cl"><b>127</b>loopback (127.0.0.1 = tu mismo PC)</div>
      </div>
      <p class="anim-cap">Pasa el mouse sobre cada franja de la barra: es el rango del primer octeto de cada clase.</p>`;
  },
  mascara(slot){
    slot.innerHTML = `
      <div class="bits32" id="mk-bits"></div>
      <div class="anim-slider">
        <span class="val" id="mk-v">/24</span>
        <input type="range" min="8" max="30" value="24" id="mk-r" title="Prefijo">
      </div>
      <div class="mask-info">
        <div class="mi"><span>MÁSCARA</span><b id="mk-d"></b></div>
        <div class="mi"><span>IP DE EJEMPLO</span><b>192.168.1.137</b></div>
        <div class="mi"><span>DIRECCIÓN DE RED (AND)</span><b id="mk-n"></b></div>
        <div class="mi"><span>HOSTS UTILIZABLES</span><b id="mk-h"></b></div>
      </div>
      <p class="anim-cap">Azul = bits de RED (los que dice la máscara). Gris = bits de HOST (tu equipo).</p>`;
    const upd = p => {
      $('#mk-bits', slot).innerHTML = Array.from({length:32},(_,i)=>`<span class="bit ${i<p?'net':'hst'}">${i<p?1:0}</span>`).join('');
      $('#mk-v', slot).textContent = '/' + p;
      $('#mk-d', slot).textContent = maskStr(p);
      $('#mk-n', slot).textContent = intToIp(netOf('192.168.1.137', p));
      $('#mk-h', slot).textContent = usable(p);
    };
    $('#mk-r', slot).addEventListener('input', e => upd(+e.target.value));
    upd(24);
  },
  rango(slot){
    slot.innerHTML = `
      <div class="range-bar" id="rg-bar">
        <div class="zone z1">dirección de red<br>192.168.5.64</div>
        <div class="zone z2">utilizables (62)<br>192.168.5.65 – .126</div>
        <div class="zone z3">broadcast<br>192.168.5.127</div>
        <div class="marker" id="rg-mk" style="left:0"></div>
      </div>
      <div class="anim-slider">
        <span class="val" id="rg-v">192.168.5.64</span>
        <input type="range" min="64" max="127" value="64" id="rg-r" title="Elige una IP del bloque /26">
      </div>
      <p class="anim-cap" id="rg-msg"></p>`;
    const upd = v => {
      $('#rg-mk', slot).style.left = `calc(${((v-64)/63*100).toFixed(1)}% - 1px)`;
      $('#rg-v', slot).textContent = `192.168.5.${v}`;
      $('#rg-msg', slot).textContent =
        v === 64 ? '📍 Dirección de red: identifica al segmento y NO se asigna a equipos.'
      : v === 127 ? '📢 Broadcast: llega a todos los equipos del segmento; tampoco se asigna.'
      : `✅ IP utilizable número ${v-64} de 62 — esta sí la puede usar un equipo (GTL = .65).`;
    };
    $('#rg-r', slot).addEventListener('input', e => upd(+e.target.value));
    upd(64);
  },
  hostsCalc(slot){
    slot.innerHTML = `
      <div class="anim-slider">
        <span>Necesito</span>
        <input type="number" id="hc-n" min="1" max="60000" value="50" style="width:110px;background:#161b28;border:1px solid #2a3143;color:#e6e9f2;border-radius:8px;padding:8px 10px;font-family:var(--mono)">
        <span>hosts</span>
      </div>
      <div class="mask-info" id="hc-out"></div>
      <div class="split-bar" id="hc-bar" style="height:34px"></div>
      <p class="anim-cap" id="hc-cap"></p>`;
    const upd = n => {
      if (!n || n < 1) return;
      const p = needPrefix(Math.min(n, 65000));
      const block = blockOf(p), u = usable(p);
      $('#hc-out', slot).innerHTML = `
        <div class="mi"><span>PREFIJO MÍNIMO</span><b>/${p}</b></div>
        <div class="mi"><span>MÁSCARA</span><b>${maskStr(p)}</b></div>
        <div class="mi"><span>DIRECCIONES DEL BLOQUE</span><b>${block}</b></div>
        <div class="mi"><span>UTILIZABLES (2ʰ−2)</span><b>${u}</b></div>`;
      const pct = Math.max(3, block / 256 * 100);
      $('#hc-bar', slot).innerHTML =
        `<div class="split-seg" style="flex:0 0 ${pct}%;background:#f0b429">/${p}</div>
         <div class="split-seg" style="flex:1;background:#171b27;color:#5f677f">sobra para otras subredes</div>`;
      $('#hc-cap', slot).textContent =
        `Para ${n} hosts caben en ${block} direcciones; el bloque ocupa ${(block/256*100).toFixed(1)} % de una red clase C (256 direcciones).`;
    };
    $('#hc-n', slot).addEventListener('input', e => upd(+e.target.value));
    upd(50);
  },
  split(slot){
    slot.innerHTML = `
      <div class="split-bar" id="sp-bar"></div>
      <div class="anim-btns">
        <button class="btn" data-n="1">/24 original</button>
        <button class="btn" data-n="2">÷2 → /25</button>
        <button class="btn" data-n="4">÷4 → /26</button>
        <button class="btn" data-n="8">÷8 → /27</button>
        <button class="btn" data-n="16">÷16 → /28</button>
      </div>
      <p class="anim-cap" id="sp-cap"></p>`;
    const cols = ['#5b8def','#81b29a','#f2cc8f','#9b7ede','#e07a5f','#4dd4c0','#ef6f9b','#8fbf5a','#6fa8ef','#c98b5a','#b8a3e0','#7fd4c1','#d4a37f','#a3c57f','#7f9fd4','#d47fb0'];
    const upd = n => {
      const pref = 24 + Math.log2(n), size = 256 / n;
      $('#sp-bar', slot).innerHTML = Array.from({length:n},(_,i)=>
        `<div class="split-seg" style="background:${cols[i%cols.length]}">${intToIp(ipToInt('192.168.1.0')+i*size)}<br>/${pref}</div>`).join('');
      $('#sp-cap', slot).textContent =
        `${n} subred(es) de ${size} direcciones (${size-2} utilizables c/u) · salto ${size} · prefijo /${pref}`;
    };
    $$('#sp-bar ~ .anim-btns .btn, .anim-btns .btn', slot).forEach(b => { if(b.dataset.n) b.onclick = () => upd(+b.dataset.n); });
    upd(4);
  },
  serial(slot){
    slot.innerHTML = `
      <div class="anim-btns">
        <button class="btn primary" id="s30">Ver /30 (clásico)</button>
        <button class="btn" id="s31">Ver /31 (moderno)</button>
      </div>
      <div class="serial-grid" id="sg" style="margin-top:12px"></div>
      <p class="anim-cap" id="scap"></p>`;
    const v30 = () => {
      $('#sg', slot).innerHTML = `
        <div class="serial-cell s-net"><span>dirección de red</span><b>172.16.13.136</b><span>no se asigna</span></div>
        <div class="serial-cell s-use"><span>usable 1 → Router_A</span><b>172.16.13.137</b><span>Serial0/0/0</span></div>
        <div class="serial-cell s-use"><span>usable 2 → Router_B</span><b>172.16.13.138</b><span>Serial0/0/0</span></div>
        <div class="serial-cell s-bc"><span>broadcast</span><b>172.16.13.139</b><span>no se asigna</span></div>`;
      $('#scap', slot).textContent = '/30 = 4 direcciones → solo 2 utilizables. ¡Exactamente los 2 extremos del enlace!';
    };
    const v31 = () => {
      $('#sg', slot).innerHTML = `
        <div class="serial-cell s-use"><span>usable 1 → Router_A</span><b>172.16.13.0</b><span>la red la usa él</span></div>
        <div class="serial-cell s-use"><span>usable 2 → Router_B</span><b>172.16.13.1</b><span>la broadcast también</span></div>`;
      $('#scap', slot).textContent = '/31 = 2 direcciones y las DOS se usan: no hay red ni broadcast reservadas.';
    };
    $('#s30', slot).onclick = v30; $('#s31', slot).onclick = v31;
    v30();
  },
  vlsm(slot){
    const segs = [
      { label:'LAN 100 hosts · /25', size:128, net:'192.168.1.0',   c:'#5b8def' },
      { label:'LAN 50 hosts · /26',  size:64,  net:'192.168.1.128', c:'#81b29a' },
      { label:'Enlace · /30',        size:4,   net:'192.168.1.192', c:'#f2cc8f' },
    ];
    slot.innerHTML = `
      <div class="vlsm-slot" id="vs"><div class="vlsm-seg free" id="vs-free" style="left:0;width:100%">192.168.1.0/24 · disponible</div></div>
      <ul class="vlsm-steps" id="vst"></ul>
      <div class="anim-btns">
        <button class="btn primary" id="vnext">Siguiente paso ▸</button>
        <button class="btn" id="vreset">Reiniciar</button>
      </div>
      <p class="anim-cap">Base: 192.168.1.0/24 (256 direcciones). Mayores primero y alineados: el /25 solo empieza en .0 o .128.</p>`;
    let acc = 0, step = 0;
    const els = segs.map(s => { const d = document.createElement('div'); d.className='vlsm-seg'; d.style.opacity=0; $('#vs',slot).appendChild(d); return d; });
    const free = $('#vs-free', slot), list = $('#vst', slot);
    const next = () => {
      if (step >= segs.length) return;
      const s = segs[step], el = els[step];
      el.textContent = s.label; el.style.background = s.c;
      el.style.left = (acc/256*100) + '%'; el.style.width = (s.size/256*100) + '%'; el.style.opacity = 1;
      const li = document.createElement('li');
      li.textContent = `${step+1}. ${s.net}/${32 - Math.log2(s.size)} → ${s.size} direcciones (${s.size-2 > 1000 ? s.size-2 : s.size-2} utilizables)`;
      list.appendChild(li);
      acc += s.size; step++;
      free.style.left = (acc/256*100) + '%'; free.style.width = ((256-acc)/256*100) + '%';
      free.textContent = acc < 256 ? `sobra ${256-acc} IPs` : '';
      if (step >= segs.length) {
        const li2 = document.createElement('li');
        li2.innerHTML = '<b>✅ ¡Listo! 128 + 64 + 4 = 196 de 256 direcciones usadas, sin solapes.</b>';
        list.appendChild(li2);
        $('#vnext', slot).disabled = true;
      }
    };
    $('#vnext', slot).onclick = next;
    $('#vreset', slot).onclick = () => {
      acc = 0; step = 0; list.innerHTML = ''; $('#vnext', slot).disabled = false;
      els.forEach(e => e.style.opacity = 0);
      free.style.left = 0; free.style.width = '100%'; free.textContent = '192.168.1.0/24 · disponible';
    };
  },
  packet(slot){
    slot.innerHTML = `
      <div class="net-anim">
        <div class="net-line"></div>
        <div class="net-node n1"><b>PC Ana</b><small>192.168.1.10</small></div>
        <div class="net-node n2"><b>Router</b><small>tabla de ruteo</small></div>
        <div class="net-node n3"><b>PC Beto</b><small>192.168.2.5</small></div>
        <div class="packet" id="pk">PAQ</div>
        <div class="rt-note" id="pkn"></div>
      </div>
      <div class="anim-btns"><button class="btn primary" id="pkgo">Enviar paquete ▸</button></div>
      <p class="anim-cap">Observa cómo el router consulta su tabla antes de reenviar.</p>`;
    const pk = $('#pk', slot), note = $('#pkn', slot), go = $('#pkgo', slot);
    let busy = false;
    go.onclick = () => {
      if (busy) return; busy = true; go.disabled = true;
      pk.style.transition = 'none'; pk.style.left = '14%'; pk.classList.add('show'); note.textContent = '';
      setTimeout(() => {
        pk.style.transition = 'left 1s ease-in-out'; pk.style.left = 'calc(50% - 17px)';
        note.textContent = '📡 El router recibe el paquete y mira el destino: 192.168.2.5';
      }, 60);
      setTimeout(() => { note.textContent = '🔍 192.168.2.5 AND máscara → coincide con la ruta 192.168.2.0/24 → interfaz de salida'; }, 1100);
      setTimeout(() => { pk.style.left = '84%'; note.textContent = '🚀 ¡Sale reenviado hacia la red destino!'; }, 2100);
      setTimeout(() => { note.textContent = '✅ ¡Paquete entregado! Así viajan tus datos por internet.'; }, 3200);
      setTimeout(() => { pk.classList.remove('show'); busy = false; go.disabled = false; }, 4200);
    };
  },
};

/* ---- progreso y quiz ---- */
let learnDone = (() => { try { const a = JSON.parse(localStorage.getItem('nq-progress')); return Array.isArray(a) ? a : []; } catch (e) { return []; } })();
const saveLearn = () => { try { localStorage.setItem('nq-progress', JSON.stringify(learnDone)); } catch (e) {} };
let learnCur = null, openQ = 0, qSel = null;
const lvlName = l => l === 1 ? 'Nivel 1 · Fundamentos' : l === 2 ? 'Nivel 2 · Cálculo' : 'Nivel 3 · Avanzado';
const learnUnlocked = i => i === 0 || learnDone.includes(LESSONS[i - 1].id);

function resetLearnMain() {
  $('#learn-main').innerHTML = `<div class="learn-empty">
    <p>👋 Elige la primera lección para empezar.</p>
    <p class="muted">Vas a pasar de <b>“¿qué es una IP?”</b> a resolver VLSM y configurar routers como en tu clase.</p>
  </div>`;
}
function renderLearnList() {
  const box = $('#learn-items'); if (!box) return;
  box.innerHTML = '';
  let last = 0;
  LESSONS.forEach((L, i) => {
    if (L.lvl !== last) {
      last = L.lvl;
      const h = document.createElement('div');
      h.className = 'lvl-h'; h.textContent = lvlName(L.lvl);
      box.appendChild(h);
    }
    const done = learnDone.includes(L.id), locked = !learnUnlocked(i);
    const d = document.createElement('div');
    d.className = 'lit' + (done ? ' done' : '') + (locked ? ' locked' : '') + (learnCur === L.id ? ' active' : '');
    d.innerHTML = `<span class="n">${i + 1}</span><span class="t">${L.title}</span><span class="st">${done ? '✓' : locked ? '🔒' : '▸'}</span>`;
    if (!locked) d.onclick = () => openLesson(L.id);
    else d.title = 'Completa la lección anterior para desbloquear';
    box.appendChild(d);
  });
  // --- examen final (se desbloquea al terminar las 10 lecciones) ---
  const eh = document.createElement('div');
  eh.className = 'lvl-h'; eh.textContent = 'Examen';
  box.appendChild(eh);
  const exUnlocked = examUnlocked();
  const exd = document.createElement('div');
  exd.className = 'lit' + (exUnlocked ? '' : ' locked') + (learnCur === 'examen' ? ' active' : '') + (examPassed() ? ' done' : '');
  const exStatus = !exUnlocked ? '🔒' : examPassed() ? '🏆' : examBest >= 0 ? Math.round(examBest / EXAM_N * 100) + '%' : '▸';
  exd.innerHTML = `<span class="n">📝</span><span class="t">Examen final del tema</span><span class="st">${exStatus}</span>`;
  if (exUnlocked) exd.onclick = openExam;
  else exd.title = `Completa las ${LESSONS.length} lecciones para presentar el examen`;
  box.appendChild(exd);
  const pct = Math.round(learnDone.length / LESSONS.length * 100);
  $('#learn-pct').textContent = pct + ' %';
  $('#learn-bar').style.width = pct + '%';
  $('#learn-count').textContent = `${learnDone.length} / ${LESSONS.length} lecciones`;
}
function openLesson(id) {
  learnCur = id; renderLearnList();
  const L = LESSONS.find(x => x.id === id);
  const main = $('#learn-main');
  main.innerHTML = `<div class="lesson">
    <div class="lesson-head"><span class="lvl-tag">${lvlName(L.lvl)}</span><h2>${L.title}</h2></div>
    ${L.html}
    ${L.anim ? `<div class="anim-box"><div class="anim-title">✨ Animación interactiva</div><div id="anim-slot"></div></div>` : ''}
    <div class="quiz" id="quiz"></div>
  </div>`;
  if (L.anim) ANIMS[L.anim]($('#anim-slot', main));
  $$('#learn-main [data-goto]').forEach(b => b.onclick = () => switchView(b.dataset.goto));
  openQ = 0; renderQuiz();
  updateStats();
}
function renderQuiz() {
  const L = LESSONS.find(x => x.id === learnCur);
  const q = L.quiz[openQ];
  if (!q) { lessonPassed(L); return; }
  qSel = null;
  $('#quiz').innerHTML = `
    <div class="quiz-head">Ejercicio · pregunta ${openQ + 1} de ${L.quiz.length}</div>
    <div class="quiz-q">${q.q}</div>
    <div class="quiz-opts">${q.opts.map((o, i) => `<button class="opt" data-i="${i}">${o}</button>`).join('')}</div>
    <button class="btn primary" id="quiz-go">Comprobar</button>
    <div class="quiz-fb" id="quiz-fb"></div>`;
  $$('#quiz .opt').forEach(b => b.onclick = () => {
    $$('#quiz .opt').forEach(x => x.classList.remove('sel'));
    b.classList.add('sel'); qSel = +b.dataset.i;
    $('#quiz-fb').textContent = '';
  });
  $('#quiz-go').onclick = checkQuiz;
}
function checkQuiz() {
  const L = LESSONS.find(x => x.id === learnCur);
  const q = L.quiz[openQ], fb = $('#quiz-fb');
  if (qSel === null) { fb.className = 'quiz-fb err'; fb.textContent = 'Elige una opción primero.'; return; }
  if (qSel === q.a) {
    $$('#quiz .opt')[qSel].classList.add('right');
    fb.className = 'quiz-fb ok'; fb.innerHTML = `✅ ¡Correcto! ${q.ok}`;
    $('#quiz-go').disabled = true;
    setTimeout(() => { openQ++; openQ < L.quiz.length ? renderQuiz() : lessonPassed(L); }, 1100);
  } else {
    $$('#quiz .opt')[qSel].classList.add('wrong');
    fb.className = 'quiz-fb err';
    fb.innerHTML = `❌ No es esa. ${q.why}<span class="why">Vuelve a intentarlo: la lección sigue desbloqueada.</span>`;
  }
}
function lessonPassed(L) {
  if (!learnDone.includes(L.id)) { learnDone.push(L.id); saveLearn(); }
  renderLearnList(); updateStats();
  const idx = LESSONS.findIndex(x => x.id === L.id), next = LESSONS[idx + 1];
  $('#quiz').innerHTML = `<div class="lesson-done">🎉 <b>¡Lección aprobada!</b> Llevas ${learnDone.length}/${LESSONS.length}.
    ${next ? `<br><button class="btn primary" id="q-next">Siguiente: ${next.title} ▸</button>`
           : `<br><b>🏆 ¡Curso COMPLETADO! Ya viste todo el tema.</b><br>Ahora viene el <b>examen final</b>: 20 preguntas del tema completo.<br><button class="btn primary" id="q-exam">📝 Presentar examen final ▸</button>`}</div>`;
  const b = $('#q-next'); if (b) b.onclick = () => openLesson(next.id);
  const b2 = $('#q-exam'); if (b2) b2.onclick = openExam;
  setStatus('lección aprobada ✓');
}
function hintLearn() {
  if (learnCur === 'examen') { setAnalysis('El examen no tiene pistas 💪 — repasa las lecciones y entrégalo cuando estés listo.', []); return; }
  const L = LESSONS.find(x => x.id === learnCur);
  if (!L) { setAnalysis('Elige una lección del menú de la izquierda para empezar el curso.', []); return; }
  setAnalysis(`Pista de “${L.title}”: ${L.hint}`, [{ ok: true, text: `Lección ${LESSONS.indexOf(L) + 1} de ${LESSONS.length} · ${lvlName(L.lvl)}` }]);
}
function verifyLearn() {
  if (learnCur === 'examen') { setAnalysis('La corrección del examen ocurre al entregarlo: aquí no hay verificado parcial.', []); return; }
  const go = $('#quiz-go');
  if (go) go.click();
  else setAnalysis('Abre una lección y responde su ejercicio; aquí te doy el veredicto.', []);
}
function revealLearn() {
  if (learnCur === 'examen') { setAnalysis('Las soluciones se revelan al terminar el examen, en la revisión final.', []); return; }
  const L = LESSONS.find(x => x.id === learnCur);
  const go = $('#quiz-go');
  if (!L || !go) { setAnalysis('Entra a una lección para ver la solución de su ejercicio.', []); return; }
  const q = L.quiz[openQ];
  $$('#quiz .opt')[q.a].classList.add('right');
  const fb = $('#quiz-fb');
  fb.className = 'quiz-fb ok';
  fb.innerHTML = `Respuesta correcta: <b>${q.opts[q.a]}</b>. ${q.why}`;
  go.disabled = true;
  setTimeout(() => { openQ++; openQ < L.quiz.length ? renderQuiz() : lessonPassed(L); }, 1600);
}

/* ================= examen final ================= */
const EXAM_QUESTIONS = [
  { q:'¿Cuántos bits tiene una dirección IPv4?', opts:['8 bits','16 bits','32 bits','64 bits'], a:2,
    why:'Son 4 octetos × 8 bits = 32 bits.' },
  { q:'¿Cuál es el rango válido de cada octeto?', opts:['0 a 127','0 a 255','1 a 32','0 a 1024'], a:1,
    why:'2⁸ = 256 valores: de 0 a 255.' },
  { q:'¿Cuál de estas es una dirección IP privada?', opts:['8.8.8.8','192.168.1.10','200.174.5.1','186.10.2.3'], a:1,
    why:'Los rangos privados son 10.x, 172.16-31.x y 192.168.x; el resto son públicas.' },
  { q:'¿A qué clase pertenece 172.16.5.10?', opts:['Clase A','Clase B','Clase C','Clase D'], a:1,
    why:'El primer octeto 172 está en 128–191 → clase B (por defecto /16).' },
  { q:'¿Cuántos hosts utilizables tiene la clase C por defecto?', opts:['64','126','254','65.534'], a:2,
    why:'Clase C = /24 → 2⁸ − 2 = 254.' },
  { q:'255.255.0.0 equivale a…', opts:['/8','/16','/24','/30'], a:1,
    why:'16 bits encendidos seguidos = /16.' },
  { q:'La notación /26 indica…', opts:['26 equipos en la red','26 bits de la dirección son de RED','26 subredes posibles','26 direcciones utilizables'], a:1,
    why:'El prefijo = bits de red; los 6 restantes son de host.' },
  { q:'Para hallar la dirección de red se usa la operación…', opts:['OR','AND','XOR','NOT'], a:1,
    why:'IP AND máscara deja solo los bits de red.' },
  { q:'¿Cuál es la dirección de broadcast de 10.10.10.64/26?', opts:['10.10.10.63','10.10.10.64','10.10.10.126','10.10.10.127'], a:3,
    why:'Bloque de 64: .64 + 64 − 1 = .127.' },
  { q:'¿Cuántas IPs utilizables tiene una subred /27?', opts:['62','30','16','32'], a:1,
    why:'5 bits de host → 2⁵ − 2 = 30.' },
  { q:'Prefijo mínimo para 12 hosts:', opts:['/26','/27','/28','/29'], a:2,
    why:'12 + 2 = 14 → siguiente potencia 16 = 2⁴ → 32 − 4 = /28 (14 utilizables).' },
  { q:'¿Cuántas subredes iguales se obtienen al pasar de /24 a /26?', opts:['2','4','8','16'], a:1,
    why:'2 bits prestados → 2² = 4 subredes.' },
  { q:'Con prefijo /27, ¿cuál es el salto entre subredes?', opts:['8','16','32','64'], a:0,
    why:'Salto = 2^(32 − 27) = 2⁵ = 8.' },
  { q:'El prefijo típico de un enlace serial punto a punto es…', opts:['/30','/24','/16','/8'], a:0,
    why:'/30 da 4 direcciones: red + 2 utilizables + broadcast (también se usa /31).' },
  { q:'En 192.168.100.8/30, ¿cuántas IPs utilizables hay?', opts:['1','2','4','6'], a:1,
    why:'Bloque .8–.11: .8 es red, .9 y .10 usables, .11 broadcast.' },
  { q:'¿Cuál es la primera IP utilizable de 172.16.0.0/20?', opts:['172.16.0.0','172.16.0.1','172.16.0.255','172.16.1.1'], a:1,
    why:'La dirección de red no se asigna: la primera usable es red + 1.' },
  { q:'Para aplicar VLSM primero se ordenan los segmentos de mayor a menor:', opts:['Verdadero','Falso'], a:0,
    why:'Los bloques grandes van primero para que quepan alineados.' },
  { q:'¿Cuántos hosts caben en una subred /22?', opts:['254','510','1.022','2.046'], a:2,
    why:'32 − 22 = 10 bits → 2¹⁰ − 2 = 1.022.' },
  { q:'La ruta por defecto se escribe…', opts:['0.0.0.0/0','0.0.0.0/32','255.255.255.255','127.0.0.1/8'], a:0,
    why:'Máscara /0: coincide con cualquier destino (\"no sé, por aquí salgo\").' },
  { q:'La puerta de enlace (gateway) es…', opts:['La IP del router dentro de tu red','La IP de tu propio equipo','La dirección de broadcast','La MAC del switch'], a:0,
    why:'Es la IP de la interfaz del router que comparte red contigo; sin ella no sales.' },
  { q:'En la consola, ¿qué comando asigna una dirección a una interfaz?', opts:['ip address Ethernet0 172.16.0.1/21','set ip interface Ethernet0','assign 172.16.0.1','ipconfig set 172.16.0.1'], a:0,
    why:'Estilo IOS: ip address &lt;interfaz&gt; &lt;ip/prefijo&gt;; aquí la interfaz se direcciona sola.' },
  { q:'E0 de LARA atiende 600 hosts: ¿prefijo mínimo con VLSM?', opts:['/20','/21','/22','/24'], a:2,
    why:'600 + 2 = 602 → potencia 1024 = 2¹⁰ → 32 − 10 = /22 (1.022 utilizables).' },
  { q:'En tu pizarra, E1 de ZULIA pide 4 hosts: ¿prefijo mínimo?', opts:['/30','/29','/28','/27'], a:1,
    why:'4 + 2 = 6 → potencia 8 = 2³ → 32 − 3 = /29 (6 utilizables).' },
  { q:'Los enlaces seriales A–B y B–C de tu ejercicio usan…', opts:['/21 y /22','/30 y /30','/24 y /24','/29 y /28'], a:1,
    why:'Cada enlace p2p solo necesita /30 (2 IPs utilizables).' },
  { q:'Una dirección de broadcast se reconoce porque…', opts:['Todos sus bits de host están en 1','Todos sus bits están en 0','Tiene el primer octeto en 255','Es la primera del bloque'], a:0,
    why:'Red = bits de host en 0; broadcast = bits de host en 1.' },
  { q:'La clase D se usa para…', opts:['multicast','broadcast general','unicast','loopback'], a:0,
    why:'224–239 = multicast: un flujo dirigido a varios receptores a la vez.' },
];
const EXAM_N = 20;   // preguntas por intento
const EXAM_PASS = 14; // 70 % para aprobar
let examBest = (() => { try { const v = parseInt(localStorage.getItem('nq-exam-best'), 10); return Number.isFinite(v) && v >= 0 ? v : -1; } catch (e) { return -1; } })();
let examState = null;
const saveExam = () => { try { localStorage.setItem('nq-exam-best', String(examBest)); } catch (e) {} };
const examUnlocked = () => LESSONS.every(L => learnDone.includes(L.id));
const examPassed = () => examBest >= EXAM_PASS;
function shuffleArr(a) {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
  return r;
}
function openExam() {
  if (!examUnlocked()) return;
  learnCur = 'examen'; renderLearnList(); examState = null;
  $('#learn-main').innerHTML = `<div class="lesson exam">
    <div class="lesson-head"><span class="lvl-tag">Examen final</span><h2>Examen del tema</h2></div>
    <p><b>${EXAM_N} preguntas</b> del curso completo: IP, clases, máscaras, cálculo de red y broadcast, subnetting, enlaces seriales, VLSM y ruteo… ¡incluidas preguntas de tu ejercicio de la pizarra!</p>
    <ul>
      <li>Cada intento selecciona una muestra <b>aleatoria</b> del banco de preguntas</li>
      <li><b>No hay pistas ni corrección hasta que entregues</b>, como un examen real</li>
      <li>Para aprobar necesitas <b>${EXAM_PASS} de ${EXAM_N} (70 %)</b></li>
      <li>Al terminar ves la revisión completa; tu <b>mejor intento queda guardado</b></li>
    </ul>
    <div id="exam-area"></div>
  </div>`;
  examIntro(); updateStats();
}
function examIntro() {
  const best = examBest >= 0 ? `${examBest}/${EXAM_N} (${Math.round(examBest / EXAM_N * 100)} %)` : 'sin intentos';
  $('#exam-area').innerHTML = `<div class="exam-intro ${examPassed() ? 'passed' : ''}">
    ${examPassed()
      ? '<b>🏆 ¡Ya tienes el examen aprobado!</b> Puedes repetirlo para mejorar tu nota.'
      : '<b>📝 ¿Listo para el examen?</b> Revisa las lecciones antes si lo necesitas: aquí ya no hay ayuda.'}
    <div class="exam-intro-row"><span>Mejor intento: <b>${best}</b></span><span>Para aprobar: <b>${EXAM_PASS}/${EXAM_N}</b></span></div>
    <button class="btn primary" id="ex-start">Comenzar examen ▸</button>
  </div>`;
  $('#ex-start').onclick = startExam;
}
function startExam() {
  examState = { qs: shuffleArr(EXAM_QUESTIONS).slice(0, EXAM_N), answers: Array(EXAM_N).fill(null), i: 0, warned: false };
  renderExamQ();
}
function renderExamQ() {
  const st = examState, q = st.qs[st.i];
  const countTxt = () => `pregunta ${st.i + 1} / ${st.qs.length} · respondidas ${st.answers.filter(a => a !== null).length} · aprobar ${EXAM_PASS}`;
  $('#exam-area').innerHTML = `
    <div class="exam-bar">
      <div class="lp-bar"><i style="width:${((st.i + 1) / st.qs.length * 100).toFixed(0)}%"></i></div>
      <span class="exam-count">${countTxt()}</span>
    </div>
    <div class="quiz">
      <div class="quiz-q">${st.i + 1}. ${q.q}</div>
      <div class="quiz-opts">${q.opts.map((o, i) => `<button class="opt ${st.answers[st.i] === i ? 'sel' : ''}" data-i="${i}">${o}</button>`).join('')}</div>
      <div class="exam-nav">
        <button class="btn" id="ex-prev" ${st.i === 0 ? 'disabled' : ''}>◂ Anterior</button>
        <span class="exam-hint">sin corrección hasta el final</span>
        <button class="btn primary" id="ex-next">${st.i === st.qs.length - 1 ? 'Entregar examen ▸' : 'Siguiente ▸'}</button>
      </div>
      <div class="quiz-fb" id="ex-fb"></div>
    </div>`;
  $$('#exam-area .opt').forEach(b => b.onclick = () => {
    $$('#exam-area .opt').forEach(x => x.classList.remove('sel'));
    b.classList.add('sel');
    st.answers[st.i] = +b.dataset.i; st.warned = false;
    $('#exam-area .exam-count').textContent = countTxt();
  });
  $('#ex-prev').onclick = () => { st.i--; renderExamQ(); };
  $('#ex-next').onclick = () => {
    if (st.i < st.qs.length - 1) { st.i++; st.warned = false; renderExamQ(); return; }
    const missing = st.answers.filter(a => a === null).length;
    if (missing && !st.warned) {
      st.warned = true;
      const fb = $('#ex-fb');
      fb.className = 'quiz-fb err';
      fb.textContent = `⚠ Quedan ${missing} preguntas sin responder (cuentan como malas). Vuelve a pulsar “Entregar examen” para confirmar.`;
      return;
    }
    submitExam();
  };
}
function submitExam() {
  const st = examState;
  const score = st.qs.reduce((n, q, i) => n + (st.answers[i] === q.a ? 1 : 0), 0);
  st.score = score; st.submitted = true;
  if (score > examBest) { examBest = score; saveExam(); }
  renderLearnList(); updateStats();
  const pct = Math.round(score / st.qs.length * 100);
  const ok = score >= EXAM_PASS;
  $('#exam-area').innerHTML = `
    <div class="exam-score ${ok ? 'ok' : 'bad'}">
      <div class="es-num">${score}<small>/${st.qs.length}</small></div>
      <div class="es-meta">
        <b>${ok ? '¡APROBADO! 🎉' : 'REPROBADO 😔'}</b>
        <span>${pct} % · para aprobar: ${EXAM_PASS}/${st.qs.length} (70 %)</span>
        <span>mejor intento: ${examBest}/${st.qs.length}${examBest >= EXAM_PASS ? ' · ✅ aprobado' : ''}</span>
      </div>
    </div>
    <div class="exam-nav exam-nav2">
      <button class="btn" id="ex-again">🔄 Otro intento</button>
      <button class="btn primary" id="ex-review">Ver revisión ▾</button>
    </div>
    <div class="exam-review" id="exam-review">${st.qs.map((q, i) => {
      const ans = st.answers[i], right = ans === q.a;
      return `<div class="ex-rev ${right ? 'ok' : 'bad'}">
        <div class="ex-rev-h">${i + 1}. ${q.q} <span>${right ? '✅' : '❌'}</span></div>
        <div class="ex-rev-a">Tu respuesta: <b>${ans === null ? '(sin responder)' : q.opts[ans]}</b>${right ? '' : ` · Correcta: <b>${q.opts[q.a]}</b>`}</div>
        <div class="ex-rev-w">${q.why}</div>
      </div>`;
    }).join('')}</div>`;
  $('#ex-again').onclick = startExam;
  $('#ex-review').onclick = e => {
    const r = $('#exam-review');
    r.classList.toggle('shown');
    e.target.textContent = r.classList.contains('shown') ? 'Ocultar revisión ▴' : 'Ver revisión ▾';
  };
  setStatus(ok ? `examen aprobado ✓ ${score}/${st.qs.length}` : `examen: ${score}/${st.qs.length} — repasa y repite`);
}

document.addEventListener('DOMContentLoaded', init);

/* PWA: registrar el service worker (solo sirve por http/https, no en file://) */
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
