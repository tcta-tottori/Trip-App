// Leaflet map module
const TripMap = (() => {
  let map = null;
  let markers = [];
  let userMarker = null;
  let currentView = 'land';
  let containerEl = 'map';

  // Real-world coordinates fallback (used for sea + urayasu)
  const VIEWS = {
    land:    { center: [35.6336, 139.8810], zoom: 17, label: 'ディズニーランド' },
    sea:     { center: [35.6270, 139.8845], zoom: 17, label: 'ディズニーシー' },
    urayasu: { center: [35.6440, 139.8950], zoom: 13, label: '浦安エリア' }
  };

  // Image-based maps (CRS.Simple). width/height in image pixels.
  const PARK_MAPS = {
    land: {
      image: '../images/parks/tdl-map.jpg',
      width: 1400,
      height: 1224
    },
    sea: {
      image: '../images/parks/tds-map.jpg',
      width: 1600,
      height: 1131
    }
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
    containerEl = containerId;
    if (map) return;
    buildMap('land');
  }

  function setView(view) {
    currentView = view;
    buildMap(view);
  }

  function buildMap(view) {
    if (map) { map.remove(); map = null; }
    if (PARK_MAPS[view]) {
      initImageMap(PARK_MAPS[view]);
    } else {
      initOSMMap(view);
    }
    refreshMarkers();
  }

  function initImageMap(cfg) {
    map = L.map(containerEl, {
      crs: L.CRS.Simple,
      zoomControl: true,
      minZoom: -2,
      maxZoom: 2,
      attributionControl: false
    });
    const bounds = [[0, 0], [cfg.height, cfg.width]];
    L.imageOverlay(cfg.image, bounds).addTo(map);
    map.fitBounds(bounds);
    map.setMaxBounds([
      [-cfg.height * 0.1, -cfg.width * 0.1],
      [cfg.height * 1.1, cfg.width * 1.1]
    ]);
  }

  function initOSMMap(view) {
    map = L.map(containerEl, { zoomControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 19
    }).addTo(map);
    const v = VIEWS[view] || VIEWS.land;
    map.setView(v.center, v.zoom);
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

  // Convert image-fraction (mapX, mapY in 0..1) → Leaflet CRS.Simple latLng
  function imageLatLng(cfg, mx, my) {
    // CRS.Simple has y increasing upward; image top is at y=height
    return [(1 - my) * cfg.height, mx * cfg.width];
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
    const cfg = PARK_MAPS[park];
    const list = DataStore.attractions().filter(a => a.park === park && !a.closed);
    list.forEach(a => {
      let latLng;
      if (cfg && a.mapX != null && a.mapY != null) {
        latLng = imageLatLng(cfg, a.mapX, a.mapY);
      } else if (a.lat != null && a.lng != null) {
        latLng = [a.lat, a.lng];
      } else {
        return;
      }
      const isFav = favs.has(a.id);
      const cls = pinClass(a.fearLevel);
      const icon = L.divIcon({
        html: `<div class="pin ${cls}${isFav ? ' fav' : ''}">${isFav ? '⭐' : '🎢'}</div>`,
        className: 'custom-pin',
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });
      const m = L.marker(latLng, { icon }).addTo(map);
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
    if (PARK_MAPS[currentView]) {
      App.toast('このマップは現在地表示に対応していません');
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
    if (PARK_MAPS[currentView]) {
      const cfg = PARK_MAPS[currentView];
      map.fitBounds([[0, 0], [cfg.height, cfg.width]]);
      return;
    }
    if (!markers.length) return;
    const group = L.featureGroup(markers);
    map.fitBounds(group.getBounds(), { padding: [40, 40] });
  }

  function invalidate() { if (map) setTimeout(() => map.invalidateSize(), 50); }

  return { init, setView, refreshMarkers, locate, fitAll, invalidate };
})();
