import { firebaseConfig, FIREBASE_SDK } from './firebase-config.js';

export const isDemo = () => new URLSearchParams(location.search).has('demo') || !firebaseConfig.apiKey;

export function createStore() {
  return isDemo() ? Promise.resolve(createDemoStore()) : createFirebaseStore();
}

// Chế độ thử: localStorage, đồng bộ giữa các tab bằng sự kiện storage
function createDemoStore() {
  const KEY = 'pb-demo-db';
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) ?? {}; } catch { return {}; } };
  const snapshot = () => { const v = read(); return { scores: v.scores ?? {}, overrides: v.overrides ?? {} }; };
  const dataCbs = new Set(), authCbs = new Set();
  let user = null;
  const emit = () => { const d = snapshot(); dataCbs.forEach(cb => cb(d)); };
  const write = fn => {
    const v = read(); fn(v);
    try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* bỏ qua */ }
    emit();
    return Promise.resolve();
  };
  addEventListener('storage', e => { if (e.key === KEY) emit(); });
  const setUser = u => { user = u; authCbs.forEach(cb => cb(user)); return Promise.resolve(); };
  return {
    demo: true,
    onData(cb) { dataCbs.add(cb); cb(snapshot()); },
    onConnection(cb) { cb(true); },
    onAuth(cb) { authCbs.add(cb); cb(user); },
    signIn: email => setUser({ email: email || 'demo@local' }),
    signOut: () => setUser(null),
    setScore: (id, v) => write(db => {
      db.scores ??= {};
      if (v) db.scores[id] = { ...v, updatedAt: Date.now() }; else delete db.scores[id];
    }),
    setOverride: (ev, g, order) => write(db => {
      db.overrides ??= {}; db.overrides[ev] ??= {};
      if (order) db.overrides[ev][g] = order; else delete db.overrides[ev][g];
    }),
  };
}

async function createFirebaseStore() {
  const base = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK}`;
  const [{ initializeApp }, dbm] = await Promise.all([
    import(`${base}/firebase-app.js`), import(`${base}/firebase-database.js`),
  ]);
  const app = initializeApp(firebaseConfig);
  const db = dbm.getDatabase(app);
  // Chỉ trang admin mới cần Auth, nạp khi dùng tới
  let authP;
  const auth = () => (authP ??= import(`${base}/firebase-auth.js`).then(m => ({ m, a: m.getAuth(app) })));
  return {
    demo: false,
    onData(cb) {
      dbm.onValue(dbm.ref(db), s => {
        const v = s.val() ?? {};
        cb({ scores: v.scores ?? {}, overrides: v.overrides ?? {} });
      });
    },
    onConnection(cb) { dbm.onValue(dbm.ref(db, '.info/connected'), s => cb(s.val() === true)); },
    async onAuth(cb) { const { m, a } = await auth(); m.onAuthStateChanged(a, cb); },
    async signIn(email, pw) { const { m, a } = await auth(); await m.signInWithEmailAndPassword(a, email, pw); },
    async signOut() { const { m, a } = await auth(); await m.signOut(a); },
    setScore(id, v) {
      const r = dbm.ref(db, `scores/${id}`);
      return v ? dbm.set(r, { ...v, updatedAt: dbm.serverTimestamp() }) : dbm.remove(r);
    },
    setOverride(ev, g, order) {
      const r = dbm.ref(db, `overrides/${ev}/${g}`);
      return order ? dbm.set(r, order) : dbm.remove(r);
    },
  };
}
