// 気象庁の無料予報 API（APIキー不要・CORS許可）
// 千葉県（120000）を取得し、千葉県北西部（120010・浦安を含む）を抽出。
const Weather = (() => {
  const ENDPOINT = 'https://www.jma.go.jp/bosai/forecast/data/forecast/120000.json';
  const AREA_CODE = '120010'; // 千葉県北西部
  const CACHE_KEY = 'weatherCache';
  const TTL_MS = 30 * 60 * 1000;

  const ICON = {
    '晴': '☀️', '曇': '☁️', '雨': '🌧️', '雪': '❄️',
    '雷': '⛈️', '霧': '🌫️'
  };

  function pickIcon(text) {
    if (!text) return '🌤️';
    if (text.includes('雪')) return '❄️';
    if (text.includes('雷')) return '⛈️';
    if (text.includes('雨')) return '🌧️';
    if (text.includes('曇')) return text.includes('晴') ? '⛅' : '☁️';
    if (text.includes('晴')) return '☀️';
    if (text.includes('霧')) return '🌫️';
    return '🌤️';
  }

  async function fetchForecast({ force = false } = {}) {
    const cached = Storage.get(CACHE_KEY);
    if (!force && cached && (Date.now() - cached.fetchedAt) < TTL_MS) {
      return cached.parsed;
    }
    try {
      const res = await fetch(ENDPOINT, { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      const parsed = parse(data);
      Storage.set(CACHE_KEY, { fetchedAt: Date.now(), parsed });
      return parsed;
    } catch (e) {
      console.warn('Weather fetch failed', e);
      // Fall back to stale cache if any
      return cached ? cached.parsed : null;
    }
  }

  function findArea(timeSeries, code) {
    if (!timeSeries) return null;
    return (timeSeries.areas || []).find(a => a.area && a.area.code === code)
        || (timeSeries.areas || [])[0]
        || null;
  }
  function findTempArea(timeSeries) {
    // 気温は観測点単位。千葉観測所(45106) など。最初の要素を採用。
    if (!timeSeries) return null;
    return (timeSeries.areas || [])[0] || null;
  }

  function parse(data) {
    if (!Array.isArray(data) || !data.length) return null;
    const today = data[0];
    const ts = today.timeSeries || [];
    const wxArea = findArea(ts[0], AREA_CODE);
    const popArea = findArea(ts[1], AREA_CODE);
    const tempArea = findTempArea(ts[2]);

    const dates = (ts[0] && ts[0].timeDefines) || [];
    const popDates = (ts[1] && ts[1].timeDefines) || [];
    const tempDates = (ts[2] && ts[2].timeDefines) || [];

    const days = dates.slice(0, 3).map((iso, idx) => {
      const weather = wxArea ? (wxArea.weathers || [])[idx] : null;
      const wind = wxArea ? (wxArea.winds || [])[idx] : null;
      // pops can be 4 entries per day (6h buckets); take max for the calendar day
      const pops = [];
      const dateStr = iso.slice(0, 10);
      popDates.forEach((pd, i) => {
        if (pd.slice(0, 10) === dateStr && popArea && popArea.pops) {
          const v = parseInt(popArea.pops[i], 10);
          if (!isNaN(v)) pops.push(v);
        }
      });
      const tempEntries = [];
      tempDates.forEach((td, i) => {
        if (td.slice(0, 10) === dateStr && tempArea && tempArea.temps) {
          const v = parseInt(tempArea.temps[i], 10);
          if (!isNaN(v)) tempEntries.push(v);
        }
      });
      return {
        date: dateStr,
        weather: weather || '',
        icon: pickIcon(weather),
        wind: wind || '',
        popMax: pops.length ? Math.max(...pops) : null,
        tempMin: tempEntries.length ? Math.min(...tempEntries) : null,
        tempMax: tempEntries.length ? Math.max(...tempEntries) : null
      };
    });

    return {
      area: wxArea ? wxArea.area.name : '千葉県北西部',
      publishingOffice: today.publishingOffice || '',
      reportDatetime: today.reportDatetime || '',
      days
    };
  }

  function dayFor(parsed, isoDate) {
    if (!parsed || !parsed.days) return null;
    return parsed.days.find(d => d.date === isoDate) || null;
  }

  return { fetchForecast, dayFor, pickIcon };
})();
