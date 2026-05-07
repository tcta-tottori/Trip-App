// Leaflet map module
const TripMap = (() => {
  let map = null;
  let markers = [];
  let userMarker = null;
  let watchId = null;
  let currentView = 'land';

  const VIEWS = {
    land:    { center: [35.6336, 139.8810], zoom: 17, label: 'ディズニーランド' },
    sea:     { center: [35.6270, 139.8845], zoom: 17, label: 'ディズニーシー' },
    urayasu: { center: [35.6440, 139.8950], zoom: 13, label: '浦安エリア' }
  };

  // Landmarks shown in addition to attractions
  const URAYASU_LANDMARKS = [
    { name: '東京ディズニーランド', icon: '🏰', lat: 35.6329, lng: 139.8804 },
    { name: '東京ディズニーシー', icon: '🌊', lat: 35.6267, lng: 139.8850 },
    { name: '舞浜駅', icon: '🚉', lat: 35.6359, lng: 139.8728 },
    { name: '新浦安駅', icon: '🚉', lat: 35.6481, lng: 139.9119 },
    { name: '浦安ブライトンホテル', icon: '🏨', lat: 35.6459, lng: 139.9112 },
    { name: '舞浜ユーラシア', icon: '🏨', lat: 35.6373, lng: 139.8758 },
    { name: 'イクスピアリ', icon: '🛍️', lat: 35.6353, lng: 139.8750 },
    { name: '羽田空港', icon: '✈️', lat: 35.5494, lng: 139.7798 }
  ];

  function init(containerId = 'map') {
    if (map) return;
    map = L.map(containerId, { zoomControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 19
    }).addTo(map);
    setView('land');
  }

  function setView(view) {
    currentView = view;
    const v = VIEWS[view] || VIEWS.land;
    if (map) map.setView(v.center, v.zoom);
    refreshMarkers();
  }

  function clearMarkers() {
    markers.forEach(m => map.removeLayer(m));
    markers = [];
  }

  function pinClass(level) {
    if (level <= 2) return 'green';
    if (level === 3) return 'orange';
    return 'red';
  }

  function refreshMarkers() {
    if (!map) return;
    clearMarkers();
    const favs = new Set(Storage.get('favorites', []));
    if (currentView === 'urayasu') {
      URAYASU_LANDMARKS.forEach(l => {
        const icon = L.divIcon({
          html: `<div class="pin">${l.icon}</div>`,
          className: 'custom-pin',
          iconSize: [32, 32],
          iconAnchor: [16, 16]
        });
        const m = L.marker([l.lat, l.lng], { icon }).addTo(map);
        m.bindPopup(`<strong>${l.name}</strong>`);
        markers.push(m);
      });
      return;
    }
    const park = currentView;
    const list = DataStore.attractions().filter(a => a.park === park && !a.closed);
    list.forEach(a => {
      const isFav = favs.has(a.id);
      const cls = pinClass(a.fearLevel);
      const icon = L.divIcon({
        html: `<div class="pin ${cls}${isFav ? ' fav' : ''}">${isFav ? '⭐' : '🎢'}</div>`,
        className: 'custom-pin',
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });
      const m = L.marker([a.lat, a.lng], { icon }).addTo(map);
      m.bindPopup(`
        <strong>${a.name}</strong><br>
        <small>${a.area} ・ 怖さ Lv${a.fearLevel}</small><br>
        <button class="btn small" onclick="App.showAttractionDetail('${a.id}')">詳細を見る</button>
      `);
      markers.push(m);
    });
  }

  function locate() {
    if (!navigator.geolocation) {
      App.toast('位置情報を利用できません');
      return;
    }
    navigator.geolocation.getCurrentPosition(pos => {
      const ll = [pos.coords.latitude, pos.coords.longitude];
      if (userMarker) map.removeLayer(userMarker);
      const icon = L.divIcon({ html: '<div class="user-pin"></div>', className: 'custom-pin', iconSize: [18, 18], iconAnchor: [9, 9] });
      userMarker = L.marker(ll, { icon }).addTo(map);
      map.setView(ll, 18);
    }, err => {
      App.toast('位置情報を取得できません');
    }, { enableHighAccuracy: true, timeout: 8000 });
  }

  function fitAll() {
    if (!markers.length) return;
    const group = L.featureGroup(markers);
    map.fitBounds(group.getBounds(), { padding: [40, 40] });
  }

  function invalidate() { if (map) setTimeout(() => map.invalidateSize(), 50); }

  return { init, setView, refreshMarkers, locate, fitAll, invalidate };
})();
