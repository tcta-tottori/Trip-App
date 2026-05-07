// Notification reminders for upcoming events
const Notify = (() => {
  const STATE_KEY = 'notifyState';
  let timers = [];

  function settings() {
    return Storage.get('notifySettings', { enabled: false, mins: [30, 60] });
  }

  function isSupported() {
    return 'Notification' in window;
  }

  async function requestPermission() {
    if (!isSupported()) return 'denied';
    if (Notification.permission === 'granted') return 'granted';
    if (Notification.permission === 'denied') return 'denied';
    try {
      return await Notification.requestPermission();
    } catch {
      return 'denied';
    }
  }

  function show(title, body, tag) {
    if (!isSupported() || Notification.permission !== 'granted') return;
    const opts = {
      body,
      tag,
      icon: 'icons/icon.svg',
      badge: 'icons/icon.svg',
      lang: 'ja'
    };
    // Prefer SW-based notifications (works when tab is hidden in some browsers)
    if (navigator.serviceWorker && navigator.serviceWorker.ready) {
      navigator.serviceWorker.ready.then(reg => {
        reg.showNotification(title, opts).catch(() => {
          try { new Notification(title, opts); } catch {}
        });
      });
    } else {
      try { new Notification(title, opts); } catch {}
    }
  }

  function clearAll() {
    timers.forEach(t => clearTimeout(t));
    timers = [];
  }

  function schedule() {
    clearAll();
    const cfg = settings();
    if (!cfg.enabled || !isSupported() || Notification.permission !== 'granted') return;
    const fired = new Set(Storage.get(STATE_KEY, []));
    const now = TripTimer.now();
    const days = DataStore.itinerary().days;
    const upcoming = [];
    days.forEach(day => {
      day.events.forEach((ev, idx) => {
        const at = TripTimer.eventDate(day, ev);
        if (at <= now) return;
        upcoming.push({ day, ev, idx, at });
      });
    });

    // Schedule up to 24 nearest reminders to avoid timer flood
    upcoming.slice(0, 24).forEach(({ day, ev, idx, at }) => {
      cfg.mins.forEach(m => {
        const fireAt = at.getTime() - m * 60 * 1000;
        const delay = fireAt - now.getTime();
        if (delay <= 0) return;
        if (delay > 2147483000) return; // > ~24.8 days: skip (browser limit)
        const tag = `${day.date}_${ev.time}_${idx}_${m}`;
        if (fired.has(tag)) return;
        const t = setTimeout(() => {
          show(`まもなく ${ev.time} ${ev.title}`, `あと ${m} 分です${ev.location ? ` ・ ${ev.location}` : ''}`, tag);
          const set = new Set(Storage.get(STATE_KEY, []));
          set.add(tag);
          Storage.set(STATE_KEY, [...set]);
        }, delay);
        timers.push(t);
      });
    });
  }

  // Cleanup fired tags older than 7 days to keep state small
  function gc() {
    const days = DataStore.itinerary().days;
    const valid = new Set();
    days.forEach(d => d.events.forEach((ev, idx) => {
      [30, 60, 15, 120].forEach(m => valid.add(`${d.date}_${ev.time}_${idx}_${m}`));
    }));
    const fired = Storage.get(STATE_KEY, []).filter(tag => valid.has(tag));
    Storage.set(STATE_KEY, fired);
  }

  return { settings, isSupported, requestPermission, schedule, clearAll, show, gc };
})();
