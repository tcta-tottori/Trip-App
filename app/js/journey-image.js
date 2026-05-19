// Render an itinerary day (or the full trip) onto a canvas as a shareable PNG.
const JourneyImage = (() => {
  const W = 1080;
  const PAD = 56;
  const TIME_X = PAD;
  const TIME_W = 120;
  const LINE_X = PAD + TIME_W + 50;
  const TEXT_X = LINE_X + 40;
  const TEXT_W = W - TEXT_X - PAD;

  const SANS = '"Zen Kaku Gothic New", "Hiragino Sans", "Yu Gothic", "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
  const SERIF = '"Shippori Mincho", "Yu Mincho", "Hiragino Mincho ProN", "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", serif';

  const TYPE_ICON = {
    flight: '✈️',
    transit: '🚃',
    park: '🎢',
    meal: '🍴',
    hotel: '🏨',
    shopping: '🛍️',
    note: '📝'
  };

  function setFont(ctx, size, weight, family) {
    ctx.font = `${weight} ${size}px ${family || SANS}`;
  }

  function formatDateJa(s) {
    const [y, m, d] = s.split('-');
    const w = ['日', '月', '火', '水', '木', '金', '土'][new Date(s + 'T00:00:00+09:00').getDay()];
    return `${y}年${+m}月${+d}日（${w}）`;
  }

  // Character-level wrap; CJK has no whitespace so we break per char.
  function wrapText(ctx, text, maxWidth) {
    const out = [];
    let line = '';
    for (const ch of String(text)) {
      if (ch === '\n') { out.push(line); line = ''; continue; }
      const candidate = line + ch;
      if (ctx.measureText(candidate).width > maxWidth && line.length > 0) {
        out.push(line);
        line = ch;
      } else {
        line = candidate;
      }
    }
    if (line) out.push(line);
    return out.length ? out : [''];
  }

  function measureEvent(ctx, ev) {
    let h = 28; // top padding
    setFont(ctx, 26, '700', SERIF);
    const titleText = `${TYPE_ICON[ev.type] || '📍'}  ${ev.highlight ? '★ ' : ''}${ev.title}`;
    const titleLines = wrapText(ctx, titleText, TEXT_W);
    h += titleLines.length * 36;
    if (ev.location) {
      setFont(ctx, 19, '500', SANS);
      const lines = wrapText(ctx, '📍 ' + ev.location, TEXT_W);
      h += 4 + lines.length * 26;
    }
    if (ev.description) {
      setFont(ctx, 19, '400', SANS);
      const lines = wrapText(ctx, ev.description, TEXT_W);
      h += 4 + lines.length * 26;
    }
    h += 22; // bottom padding
    return Math.max(h, 96);
  }

  function measureDay(ctx, day, isFirst) {
    let h = isFirst ? 0 : 40;
    h += 32; // "DAY N"
    h += 52; // big title
    h += 32; // date
    h += 24; // pre-list gap
    for (const ev of day.events) h += measureEvent(ctx, ev);
    h += 12;
    return h;
  }

  function render(days, opts) {
    opts = opts || {};
    const tmp = document.createElement('canvas');
    const tctx = tmp.getContext('2d');

    const headerH = 200;
    const footerH = 80;
    let body = 0;
    days.forEach((d, i) => { body += measureDay(tctx, d, i === 0); });
    const totalH = headerH + body + footerH;

    const dpr = 2;
    const canvas = document.createElement('canvas');
    canvas.width = W * dpr;
    canvas.height = totalH * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.textBaseline = 'top';

    // Background — soft Disney-ish gradient matching the app palette.
    const bg = ctx.createLinearGradient(0, 0, 0, totalH);
    bg.addColorStop(0, '#eaf3f8');
    bg.addColorStop(0.55, '#dfeef5');
    bg.addColorStop(1, '#cfe4ee');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, totalH);

    // Faint corner sparkles.
    drawSparkle(ctx, W - 80, 80, 18, '#7dd3e8');
    drawSparkle(ctx, W - 130, 150, 10, '#5eb8d4');
    drawSparkle(ctx, 80, totalH - 110, 14, '#7dd3e8');

    // Header
    setFont(ctx, 44, '700', SERIF);
    ctx.fillStyle = '#1d4d6b';
    ctx.fillText('🏰 ' + (opts.title || 'ディズニー旅行 2026'), PAD, PAD);

    if (opts.subtitle) {
      setFont(ctx, 22, '500', SANS);
      ctx.fillStyle = '#6c7a8a';
      ctx.fillText(opts.subtitle, PAD, PAD + 68);
    }

    // Decorative line
    ctx.strokeStyle = '#7dd3e8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(PAD, PAD + 124);
    ctx.lineTo(W - PAD, PAD + 124);
    ctx.stroke();

    let y = headerH;
    days.forEach((day, i) => {
      if (i > 0) y += 40;

      // Day badge
      setFont(ctx, 18, '700', SANS);
      ctx.fillStyle = '#c0392b';
      ctx.fillText(`DAY ${day.dayNumber}`, PAD, y);
      y += 32;

      // Day title
      setFont(ctx, 32, '700', SERIF);
      ctx.fillStyle = '#1d4d6b';
      ctx.fillText(day.title || '', PAD, y);
      y += 52;

      // Date
      setFont(ctx, 20, '500', SANS);
      ctx.fillStyle = '#6c7a8a';
      ctx.fillText(formatDateJa(day.date), PAD, y);
      y += 32;

      y += 24;

      const eventsStartY = y;
      let eventsTotalH = 0;
      for (const ev of day.events) eventsTotalH += measureEvent(tctx, ev);

      // Timeline rail (behind dots)
      ctx.strokeStyle = '#c8dee7';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(LINE_X, eventsStartY + 24);
      ctx.lineTo(LINE_X, eventsStartY + eventsTotalH - 24);
      ctx.stroke();

      for (const ev of day.events) {
        const evH = measureEvent(tctx, ev);

        // Time label
        setFont(ctx, 26, '700', SERIF);
        ctx.fillStyle = '#1d4d6b';
        ctx.fillText(ev.time || '', TIME_X, y + 30);

        // Dot
        const isHl = !!ev.highlight;
        ctx.fillStyle = isHl ? '#c0392b' : '#3a91b8';
        ctx.beginPath();
        ctx.arc(LINE_X, y + 40, isHl ? 10 : 7, 0, Math.PI * 2);
        ctx.fill();
        if (isHl) {
          ctx.strokeStyle = 'rgba(192,57,43,0.25)';
          ctx.lineWidth = 6;
          ctx.beginPath();
          ctx.arc(LINE_X, y + 40, 14, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Title
        setFont(ctx, 26, '700', SERIF);
        ctx.fillStyle = isHl ? '#c0392b' : '#11314a';
        const icon = TYPE_ICON[ev.type] || '📍';
        const titleText = `${icon}  ${isHl ? '★ ' : ''}${ev.title}`;
        const titleLines = wrapText(ctx, titleText, TEXT_W);
        let ly = y + 28;
        titleLines.forEach(l => { ctx.fillText(l, TEXT_X, ly); ly += 36; });

        if (ev.location) {
          ly += 4;
          setFont(ctx, 19, '500', SANS);
          ctx.fillStyle = '#6c7a8a';
          const lines = wrapText(ctx, '📍 ' + ev.location, TEXT_W);
          lines.forEach(l => { ctx.fillText(l, TEXT_X, ly); ly += 26; });
        }
        if (ev.description) {
          ly += 4;
          setFont(ctx, 19, '400', SANS);
          ctx.fillStyle = '#11314a';
          const lines = wrapText(ctx, ev.description, TEXT_W);
          lines.forEach(l => { ctx.fillText(l, TEXT_X, ly); ly += 26; });
        }

        y += evH;
      }
      y += 12;
    });

    // Footer
    setFont(ctx, 14, '500', SANS);
    ctx.fillStyle = '#6c7a8a';
    const now = new Date();
    const stamp = `${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    ctx.fillText('Disney Trip 2026', PAD, totalH - 50);
    ctx.textAlign = 'right';
    ctx.fillText(`generated ${stamp}`, W - PAD, totalH - 50);
    ctx.textAlign = 'left';

    return canvas;
  }

  function drawSparkle(ctx, cx, cy, size, color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.moveTo(cx, cy - size);
    ctx.lineTo(cx + size * 0.25, cy - size * 0.25);
    ctx.lineTo(cx + size, cy);
    ctx.lineTo(cx + size * 0.25, cy + size * 0.25);
    ctx.lineTo(cx, cy + size);
    ctx.lineTo(cx - size * 0.25, cy + size * 0.25);
    ctx.lineTo(cx - size, cy);
    ctx.lineTo(cx - size * 0.25, cy - size * 0.25);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function toBlob(canvas) {
    return new Promise(resolve => canvas.toBlob(b => resolve(b), 'image/png'));
  }

  async function download(canvas, filename) {
    const blob = await toBlob(canvas);
    if (!blob) return false;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  }

  async function share(canvas, filename, title) {
    if (typeof navigator === 'undefined' || !navigator.share || !navigator.canShare) return false;
    const blob = await toBlob(canvas);
    if (!blob) return false;
    const file = new File([blob], filename, { type: 'image/png' });
    if (!navigator.canShare({ files: [file] })) return false;
    try {
      await navigator.share({ files: [file], title: title || 'Disney Trip 2026' });
      return true;
    } catch (e) {
      return false;
    }
  }

  function canShareFiles() {
    if (typeof navigator === 'undefined' || !navigator.canShare) return false;
    try {
      const f = new File([new Blob(['x'])], 'x.png', { type: 'image/png' });
      return navigator.canShare({ files: [f] });
    } catch {
      return false;
    }
  }

  return { render, download, share, canShareFiles };
})();
