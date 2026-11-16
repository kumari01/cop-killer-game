const Net = (() => {
  const s = window.SERVER_URL ? io(window.SERVER_URL) : io();
  const KEY = 'ck-session';
  return {
    emit: (e, d) => s.emit(e, d), on: (e, f) => s.on(e, f),
    save: v => sessionStorage.setItem(KEY, JSON.stringify(v)),
    load: () => { try { return JSON.parse(sessionStorage.getItem(KEY)); } catch (_) { return null; } },
    clear: () => sessionStorage.removeItem(KEY)
  };
})();
