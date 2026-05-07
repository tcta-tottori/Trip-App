// Local storage helper
const Storage = (() => {
  const PREFIX = 'disney2026.';
  return {
    get(key, fallback = null) {
      try {
        const raw = localStorage.getItem(PREFIX + key);
        if (raw === null) return fallback;
        return JSON.parse(raw);
      } catch (e) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch (e) {}
    },
    remove(key) { localStorage.removeItem(PREFIX + key); },
    exportAll() {
      const data = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(PREFIX)) {
          try { data[k.slice(PREFIX.length)] = JSON.parse(localStorage.getItem(k)); } catch {}
        }
      }
      return data;
    },
    importAll(data) {
      Object.entries(data).forEach(([k, v]) => {
        try { localStorage.setItem(PREFIX + k, JSON.stringify(v)); } catch {}
      });
    },
    clearAll() {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(PREFIX)) keys.push(k);
      }
      keys.forEach(k => localStorage.removeItem(k));
    }
  };
})();
