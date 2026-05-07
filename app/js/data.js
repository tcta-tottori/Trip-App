// Data loader — fetches JSON files
const DataStore = (() => {
  let attractions = null;
  let itinerary = null;
  let checklist = null;

  async function load() {
    try {
      const [a, i, c] = await Promise.all([
        fetch('../data/attractions.json').then(r => r.json()),
        fetch('../data/itinerary.json').then(r => r.json()),
        fetch('../data/checklist.json').then(r => r.json())
      ]);
      attractions = a.attractions;
      itinerary = i;
      checklist = c.items;
    } catch (e) {
      console.error('Data load failed', e);
      attractions = []; itinerary = { days: [] }; checklist = [];
    }
  }

  return {
    load,
    attractions: () => attractions || [],
    itinerary: () => itinerary || { days: [] },
    checklistDefault: () => checklist || [],
    findAttraction: (id) => (attractions || []).find(a => a.id === id),
    tripStart: () => new Date('2026-06-06T07:00:00+09:00'),
    tripEnd: () => new Date('2026-06-08T18:00:00+09:00')
  };
})();
