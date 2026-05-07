// Checklist module
const Checklist = (() => {
  const CATEGORIES = [
    { key: 'all',        label: 'すべて' },
    { key: 'urgent',     label: '🔥 やること' },
    { key: 'travel',     label: '✈️ 移動' },
    { key: 'pack',       label: '🎒 持ち物' },
    { key: 'kids',       label: '👶 子ども' },
    { key: 'pack-rain',  label: '☔ 雨天' }
  ];

  function getAll() {
    const defaults = DataStore.checklistDefault();
    const custom = Storage.get('checklistCustom', []);
    return [...defaults, ...custom];
  }

  function getDoneSet() { return new Set(Storage.get('checklistDone', [])); }

  function setDone(id, done) {
    const set = getDoneSet();
    done ? set.add(id) : set.delete(id);
    Storage.set('checklistDone', [...set]);
  }

  function addCustom(text, category = 'pack') {
    const custom = Storage.get('checklistCustom', []);
    const id = 'c' + Date.now();
    custom.push({ id, category, text, custom: true });
    Storage.set('checklistCustom', custom);
    return id;
  }

  function deleteCustom(id) {
    const custom = Storage.get('checklistCustom', []).filter(x => x.id !== id);
    Storage.set('checklistCustom', custom);
    const set = getDoneSet(); set.delete(id);
    Storage.set('checklistDone', [...set]);
  }

  function progress() {
    const items = getAll();
    const done = getDoneSet();
    const completed = items.filter(i => done.has(i.id)).length;
    return { completed, total: items.length, pct: items.length ? Math.round(100 * completed / items.length) : 0 };
  }

  return { CATEGORIES, getAll, getDoneSet, setDone, addCustom, deleteCustom, progress };
})();
