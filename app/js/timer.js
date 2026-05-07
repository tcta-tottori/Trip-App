// Time / countdown utilities
const TripTimer = (() => {
  function now() {
    // Allow override via ?now=ISO for testing, e.g. ?now=2026-06-06T13:00
    const u = new URLSearchParams(location.search).get('now');
    if (u) return new Date(u);
    return new Date();
  }

  function isDuringTrip() {
    const n = now();
    return n >= DataStore.tripStart() && n <= DataStore.tripEnd();
  }

  function currentDayIndex() {
    if (!isDuringTrip()) return -1;
    const n = now();
    const days = DataStore.itinerary().days;
    for (let i = 0; i < days.length; i++) {
      const d = days[i].date;
      const dStart = new Date(d + 'T00:00:00+09:00');
      const dEnd = new Date(d + 'T23:59:59+09:00');
      if (n >= dStart && n <= dEnd) return i;
    }
    return -1;
  }

  function eventDate(day, event) {
    return new Date(day.date + 'T' + event.time + ':00+09:00');
  }

  function nextEvent() {
    const n = now();
    const days = DataStore.itinerary().days;
    for (const day of days) {
      for (const ev of day.events) {
        const t = eventDate(day, ev);
        if (t > n) return { day, ev, when: t };
      }
    }
    return null;
  }

  function daysUntilTrip() {
    const n = now();
    const start = DataStore.tripStart();
    if (n >= start) return 0;
    const ms = start - n;
    return Math.ceil(ms / (1000 * 60 * 60 * 24));
  }

  function countdown() {
    const n = now();
    const start = DataStore.tripStart();
    const ms = Math.max(0, start - n);
    const days = Math.floor(ms / 86400000);
    const hours = Math.floor((ms % 86400000) / 3600000);
    const mins = Math.floor((ms % 3600000) / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    return { days, hours, mins, secs, total: ms };
  }

  function timeUntil(targetDate) {
    const ms = targetDate - now();
    if (ms <= 0) return null;
    const mins = Math.floor(ms / 60000);
    if (mins < 60) return `あと ${mins} 分`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `あと ${hours} 時間 ${mins % 60} 分`;
    const days = Math.floor(hours / 24);
    return `あと ${days} 日`;
  }

  return { now, isDuringTrip, currentDayIndex, nextEvent, daysUntilTrip, countdown, timeUntil, eventDate };
})();
