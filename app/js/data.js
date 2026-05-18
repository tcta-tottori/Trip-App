// Data loader — fetches JSON files and applies any local edits
const DataStore = (() => {
  let attractions = null;
  let itinerary = null;          // active (possibly edited) version
  let itineraryOriginal = null;  // pristine copy from data/itinerary.json
  let checklist = null;

  async function load() {
    try {
      const [a, i, c] = await Promise.all([
        fetch('../data/attractions.json').then(r => r.json()),
        fetch('../data/itinerary.json').then(r => r.json()),
        fetch('../data/checklist.json').then(r => r.json())
      ]);
      attractions = a.attractions;
      itineraryOriginal = i;
      const localOverride = Storage.get('itineraryEdit', null);
      itinerary = localOverride ? mergeWithOriginal(localOverride, i) : deepClone(i);
      checklist = c.items;
    } catch (e) {
      console.error('Data load failed', e);
      attractions = []; itinerary = { days: [] }; itineraryOriginal = { days: [] }; checklist = [];
    }
  }

  // Keep top-level "trip" object up to date with the bundled file while
  // letting users own everything under "days".
  function mergeWithOriginal(saved, original) {
    return {
      trip: original.trip || saved.trip || {},
      days: Array.isArray(saved.days) ? saved.days : (original.days || [])
    };
  }

  function deepClone(o) { return JSON.parse(JSON.stringify(o)); }

  function setItinerary(newItinerary) {
    itinerary = deepClone(newItinerary);
    Storage.set('itineraryEdit', { days: itinerary.days });
  }

  function resetItinerary() {
    Storage.remove('itineraryEdit');
    itinerary = deepClone(itineraryOriginal || { days: [] });
  }

  function isItineraryEdited() {
    return Storage.get('itineraryEdit', null) != null;
  }

  return {
    load,
    attractions: () => attractions || [],
    itinerary: () => itinerary || { days: [] },
    itineraryOriginal: () => itineraryOriginal || { days: [] },
    setItinerary,
    resetItinerary,
    isItineraryEdited,
    checklistDefault: () => checklist || [],
    findAttraction: (id) => (attractions || []).find(a => a.id === id),
    tripStart: () => new Date('2026-06-06T07:00:00+09:00'),
    tripEnd: () => new Date('2026-06-08T18:00:00+09:00')
  };
})();
