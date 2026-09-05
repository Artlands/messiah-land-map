'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { places, themes, type Place, type ThemeFilter } from './places';
import { regionLabels, regions, peaks, lakes } from './geo';
import { toTraditional } from './zh-hant';
import { toEnglish } from './en';
import {
  clamp, clampPan, drawScene, elevationRange, groundAt, hypsometric, makeFrame, normLat,
  normLon, project, regionAt, relief, RULER_TINT, TILT, zoomAbout, type Frame, type View,
} from './terrain';

const RULERS: { key: keyof typeof RULER_TINT; name: string; note: string }[] = [
  { key: 'antipas', name: '希律安提帕', note: '加利利 · 比利亚' },
  { key: 'philip', name: '希律腓力', note: '戈兰 · 特拉可尼' },
  { key: 'prefect', name: '罗马巡抚', note: '犹太 · 撒马利亚 · 以土买' },
  { key: 'decapolis', name: '低加波利', note: '自治希腊化城邦' },
  { key: 'nabataea', name: '拿巴天王国', note: '亚哩达四世' },
  { key: 'syria', name: '叙利亚行省', note: '腓尼基 · 以土利亚' },
];

type Lang = 'hans' | 'hant' | 'en';
const LANGS: [Lang, string][] = [['hans', '简'], ['hant', '繁'], ['en', 'EN']];
const CONVERT: Record<Lang, ((s: string) => string) | null> = {
  hans: null, hant: toTraditional, en: toEnglish,
};
const HTML_LANG: Record<Lang, string> = { hans: 'zh-CN', hant: 'zh-Hant', en: 'en' };

const rgb = (c: [number, number, number]) => `rgb(${c[0]},${c[1]},${c[2]})`;

/**
 * Where to write the Mediterranean. It is drawn as flat bands rather than a
 * lake ring, so unlike the lakes it has no polygon to take a centroid from —
 * this is open water off the Carmel coast, the widest reach of sea in frame.
 */
const SEA_LABEL = { lon: 34.56, lat: 32.7 };

/** Kept out of the JSX so the English-table extractor sees one plain literal. */
const STAGE_LABEL = '地形视图 · 方向键平移，Shift + 方向键旋转俯仰，加减号缩放';

const DEFAULT_VIEW: View = { rotation: -0.1, tilt: 0.62, zoom: 1, perspective: false, panX: 0, panY: 0 };

/**
 * The control scheme Google Earth uses. Drag the ground to pan it, hold Ctrl / Shift
 * or use the right or middle button to orbit, wheel towards the cursor to zoom,
 * two fingers to pinch, twist and tilt, double-click to zoom into a point.
 *
 * The listeners are native rather than React props because React registers
 * `wheel` passively, so its handler cannot cancel the page scroll.
 *
 * Returns the zoom primitive so the on-screen buttons and the keyboard reuse
 * the same cursor-anchored maths.
 */
function useEarthControls(
  ref: React.RefObject<HTMLDivElement | null>,
  view: View,
  setView: React.Dispatch<React.SetStateAction<View>>,
) {
  const viewRef = useRef(view);
  useEffect(() => { viewRef.current = view; }, [view]);

  const zoomAt = useCallback((factor: number, px?: number, py?: number) => {
    const el = ref.current;
    if (!el) return;
    const w = el.clientWidth;
    const h = el.clientHeight;
    setView((v) => zoomAbout(v, factor, px ?? w / 2, py ?? h / 2, w, h));
  }, [ref, setView]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const pointers = new Map<number, { x: number; y: number }>();
    let drag: { mode: 'pan' | 'orbit'; x: number; y: number; from: View } | null = null;
    let pinch: { dist: number; angle: number; x: number; y: number } | null = null;
    let travel = 0;

    /**
     * Overlay controls swallow a gesture, the site markers do not — they cover
     * enough of the land that bailing on them would leave dead patches you
     * cannot drag from. A marker still selects on a click; `travel` is what
     * separates that click from the tail of a pan.
     */
    const chrome = (e: Event) => {
      const hit = (e.target as HTMLElement).closest('button, a');
      return hit !== null && !hit.classList.contains('map-marker');
    };

    const twoFinger = () => {
      const [a, b] = [...pointers.values()];
      return {
        dist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
        angle: Math.atan2(b.y - a.y, b.x - a.x),
        x: (a.x + b.x) / 2,
        y: (a.y + b.y) / 2,
      };
    };

    const grab = (mode: 'pan' | 'orbit', x: number, y: number) => {
      drag = { mode, x, y, from: viewRef.current };
      el.dataset.grab = mode;
    };

    const onPointerDown = (e: PointerEvent) => {
      // Before the bail, not after: a press on an overlay control still has to
      // clear the previous gesture, or the click suppression below eats it.
      travel = 0;
      if (chrome(e)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) {
        grab(e.button === 1 || e.button === 2 || e.ctrlKey || e.metaKey || e.shiftKey ? 'orbit' : 'pan',
          e.clientX, e.clientY);
      } else {
        drag = null;
        pinch = twoFinger();
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      // Capture on the first move rather than on press: a captured pointer
      // retargets its click to the capturing element, which would stop a
      // marker from ever seeing the click that selects it.
      if (!el.hasPointerCapture(e.pointerId)) el.setPointerCapture(e.pointerId);

      if (pointers.size >= 2 && pinch) {
        const now = twoFinger();
        const was = pinch;
        pinch = now;
        travel = 8;
        setView((v) => ({
          ...v,
          rotation: v.rotation + (now.angle - was.angle),
          tilt: clamp(v.tilt + (now.y - was.y) * 0.004, TILT.min, TILT.max),
        }));
        const box = el.getBoundingClientRect();
        zoomAt(now.dist / was.dist, now.x - box.left, now.y - box.top);
        return;
      }

      if (!drag) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      travel = Math.max(travel, Math.hypot(dx, dy));
      const from = drag.from;
      if (drag.mode === 'pan') {
        setView((v) => ({
          ...v,
          panX: clampPan(from.panX + dx, el.clientWidth),
          panY: clampPan(from.panY + dy, el.clientHeight),
        }));
      } else {
        setView((v) => ({
          ...v,
          rotation: from.rotation + dx * 0.006,
          tilt: clamp(from.tilt + dy * 0.004, TILT.min, TILT.max),
        }));
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      if (pointers.size === 1) {
        // Lifting one finger of a pinch hands the gesture to the one still down.
        const [rest] = [...pointers.values()];
        grab('pan', rest.x, rest.y);
      } else if (pointers.size === 0) {
        drag = null;
        delete el.dataset.grab;
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const box = el.getBoundingClientRect();
      // Line-mode wheels report a few lines, a trackpad pinch reports tiny
      // pixel deltas with ctrlKey set; both need scaling into the same range.
      const delta = e.deltaY * (e.deltaMode === 1 ? 16 : 1) * (e.ctrlKey ? 5 : 1);
      zoomAt(Math.exp(-clamp(delta, -400, 400) * 0.0016), e.clientX - box.left, e.clientY - box.top);
    };

    // A pan that ends over a marker must not also select it.
    const onClickCapture = (e: MouseEvent) => {
      if (travel > 4) { e.stopPropagation(); e.preventDefault(); }
    };

    const onDoubleClick = (e: MouseEvent) => {
      if (chrome(e)) return;
      const box = el.getBoundingClientRect();
      zoomAt(e.shiftKey ? 1 / 1.7 : 1.7, e.clientX - box.left, e.clientY - box.top);
    };

    const onContextMenu = (e: MouseEvent) => e.preventDefault();

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointercancel', onPointerUp);
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('click', onClickCapture, true);
    el.addEventListener('dblclick', onDoubleClick);
    el.addEventListener('contextmenu', onContextMenu);
    return () => {
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', onPointerUp);
      el.removeEventListener('pointercancel', onPointerUp);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('click', onClickCapture, true);
      el.removeEventListener('dblclick', onDoubleClick);
      el.removeEventListener('contextmenu', onContextMenu);
    };
  }, [ref, setView, zoomAt]);

  return zoomAt;
}

function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 1200, height: 820 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setSize({ width, height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return { ref, size };
}

function TerrainCanvas({ view, size, showRegions, highlightRegion }: {
  view: View; size: { width: number; height: number }; showRegions: boolean; highlightRegion: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(size.width * dpr);
    canvas.height = Math.round(size.height * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const frame = makeFrame(view, size.width, size.height);
    const draw = (stride: number) =>
      drawScene(ctx, size.width, size.height, frame, { stride, showRegions, highlightRegion });
    // Coarse mesh right away so dragging stays responsive, full 2 km mesh once it settles.
    draw(3);
    const id = setTimeout(() => draw(1), 200);
    return () => clearTimeout(id);
  }, [view, size, showRegions, highlightRegion]);

  return <canvas ref={canvasRef} className="terrain-canvas" style={{ width: size.width, height: size.height }} aria-hidden="true" />;
}

function Compass({ rotation, onReset }: { rotation: number; onReset: () => void }) {
  return (
    <button className="compass" onClick={onReset} aria-label="正北朝上">
      <div className="compass-ring" style={{ transform: `rotate(${rotation}rad)` }}>
        <span className="north">N</span>
        <span className="south">S</span>
        <i />
      </div>
    </button>
  );
}

export default function Home() {
  const [activeId, setActiveId] = useState('jerusalem');
  const [filter, setFilter] = useState<ThemeFilter>('全部');
  const [view, setView] = useState<View>(DEFAULT_VIEW);
  const [showRegions, setShowRegions] = useState(true);
  const [showTowns, setShowTowns] = useState(true);
  const [panelOpen, setPanelOpen] = useState(true);
  const [lang, setLang] = useState<Lang>(() => {
    const saved = typeof window !== 'undefined' && localStorage.getItem('script');
    return saved === 'hant' || saved === 'en' ? saved : 'hans';
  });
  const { ref: mapRef, size } = useSize<HTMLDivElement>();
  const zoomAt = useEarthControls(mapRef, view, setView);

  const active = places.find((p) => p.id === activeId) ?? places[0];
  const story = useMemo(() => places.filter((p) => p.kind === 'gospel'), []);
  const frame: Frame = useMemo(() => makeFrame(view, size.width, size.height), [view, size]);

  const highlightRegion = useMemo(() => regionAt(active.lon, active.lat), [active]);

  const visible = useMemo(
    () => places.filter((p) => {
      if (!showTowns && p.kind !== 'gospel') return false;
      return filter === '全部' || p.theme === filter;
    }),
    [filter, showTowns],
  );

  /**
   * Greedy label declutter: dots always draw, names drop out when they would
   * collide with one already placed. Gospel sites outrank towns, the selected
   * site outranks everything, and near beats far on a tie.
   */
  const markers = useMemo(() => {
    const rank = (p: Place) =>
      (p.id === activeId ? 30 : 0) + (p.kind === 'gospel' ? 10 : p.kind === 'decapolis' ? 4 : 0);
    const laid = visible
      .map((p) => {
        const q = project(normLon(p.lon), normLat(p.lat), groundAt(p.lon, p.lat), frame);
        const wide = p.kind === 'gospel' || p.id === activeId;
        return {
          place: p,
          x: q.x,
          y: q.y,
          z: Math.round((q.depth + 1) * 200),
          w: (lang === 'en'
            ? toEnglish(p.name).length * (wide ? 7.5 : 5.5)
            : p.name.length * (wide ? 15 : 12)) + 34,
          h: wide ? 36 : 24,
          label: true,
        };
      })
      .sort((a, b) => rank(b.place) - rank(a.place) || b.z - a.z);
    const taken: { x0: number; x1: number; y0: number; y1: number }[] = [];
    for (const m of laid) {
      const box = { x0: m.x + 8, x1: m.x + 8 + m.w, y0: m.y - m.h / 2, y1: m.y + m.h / 2 };
      if (taken.some((t) => box.x0 < t.x1 && box.x1 > t.x0 && box.y0 < t.y1 && box.y1 > t.y0)) {
        m.label = false;
      } else {
        taken.push(box);
      }
    }
    return laid;
  }, [visible, frame, activeId, lang]);

  // The Mediterranean is drawn at sea level, so its label sits on that plane.
  const seaLabel = project(normLon(SEA_LABEL.lon), normLat(SEA_LABEL.lat), 0, frame);

  const anchor = useCallback((lon: number, lat: number) => {
    const p = project(normLon(lon), normLat(lat), groundAt(lon, lat), frame);
    return { left: p.x, top: p.y, zIndex: Math.round((p.depth + 1) * 200) };
  }, [frame]);

  const selectPlace = (place: Place) => {
    setActiveId(place.id);
    setPanelOpen(true);
  };

  const step = (delta: number) => {
    const i = story.findIndex((p) => p.id === active.id);
    const base = i < 0 ? 0 : i;
    selectPlace(story[(base + delta + story.length) % story.length]);
  };

  /**
   * Language switch. Every visible string is authored in simplified Chinese and
   * lives in the DOM (the canvas draws no text), so the swap runs over text
   * nodes after each render rather than threading a translation call through
   * every component. Traditional is a script conversion, English a lookup in
   * app/en.json; both take the simplified text as their source. Anything inside
   * [data-no-convert] is left alone — the toggle has to keep showing 简 and 繁
   * in their own scripts.
   *
   * `rendered` is what we last wrote. If a node no longer matches it, React has
   * replaced the text and the new value becomes the source.
   */
  const written = useRef(new WeakMap<Node, { source: string; rendered: string }>());
  const converted = useRef(false);
  useEffect(() => {
    const convert = CONVERT[lang];
    if (!convert && !converted.current) return;
    converted.current = convert !== null;
    document.documentElement.lang = HTML_LANG[lang];

    const store = written.current;
    const swap = (node: Node, read: () => string, write: (value: string) => void) => {
      const record = store.get(node);
      const current = read();
      const source = record && current === record.rendered ? record.source : current;
      if (convert) {
        const rendered = convert(source);
        if (current !== rendered) write(rendered);
        store.set(node, { source, rendered });
      } else if (record) {
        if (current !== source) write(source);
        store.delete(node);
      }
    };

    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) =>
          node.nodeType === Node.ELEMENT_NODE
            ? (node as Element).hasAttribute('data-no-convert')
              ? NodeFilter.FILTER_REJECT
              : NodeFilter.FILTER_SKIP
            : NodeFilter.FILTER_ACCEPT,
      },
    );
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node as Text;
      swap(text, () => text.nodeValue ?? '', (value) => { text.nodeValue = value; });
    }

    // Labels read by assistive technology follow the visible script too.
    for (const el of document.querySelectorAll('[aria-label]:not([data-no-convert])')) {
      swap(el, () => el.getAttribute('aria-label') ?? '', (value) => el.setAttribute('aria-label', value));
    }
  });

  // The tint ramp is not linear in metres, so build the legend from the same
  // function the terrain uses and put the sea-level tick where it actually falls.
  const { rampCss, seaLevelStop } = useMemo(() => {
    const { hi, lo } = elevationRange;
    const stops = Array.from({ length: 25 }, (_, i) => {
      const [r, g, b] = hypsometric(hi + ((lo - hi) * i) / 24);
      return `rgb(${r | 0},${g | 0},${b | 0}) ${((i / 24) * 100).toFixed(1)}%`;
    });
    return { rampCss: `linear-gradient(90deg, ${stops.join(',')})`, seaLevelStop: (hi / (hi - lo)) * 100 };
  }, []);

  const distanceToJerusalem = useMemo(() => {
    const j = places.find((p) => p.id === 'jerusalem')!;
    const dLat = (active.lat - j.lat) * 110.57;
    const dLon = (active.lon - j.lon) * 111.32 * Math.cos(((active.lat + j.lat) / 2) * Math.PI / 180);
    return Math.round(Math.hypot(dLat, dLon));
  }, [active]);

  return (
    <main className="site-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="弥赛亚之地首页">
          <span className="brand-mark">✦</span>
          <span><b>弥赛亚之地</b><small>公元一世纪 · 互动地形志</small></span>
        </a>
        <div className="era"><span /> 公元 30 年左右</div>
        <nav aria-label="主导航">
          <a href="#map">探索地图</a>
          <a href="#guide">阅读指南</a>
          <a className="about-button" href="#sources">资料来源</a>
          <div className="script-toggle" data-no-convert role="group" aria-label="语言 / Language">
            {LANGS.map(([code, label]) => (
              <button
                key={code}
                className={lang === code ? 'on' : ''}
                aria-pressed={lang === code}
                onClick={() => { setLang(code); localStorage.setItem('script', code); }}
              >
                {label}
              </button>
            ))}
          </div>
        </nav>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <div className="eyebrow"><span /> THE LAND OF THE GOSPELS</div>
          <h1>走进耶稣<br />时代的<em>以色列</em></h1>
          <p>地形取自 NASA SRTM 高程模型（按约 2 公里网格取样），海岸线、湖泊与河道取自 Natural Earth 实测矢量，行政分界还原公元 30 年前后的分封格局。转动这片土地，重新理解福音书里的距离与高差。</p>
          <button className="primary-button" onClick={() => document.querySelector('#map')?.scrollIntoView({ behavior: 'smooth' })}>
            开始探索 <span>↘</span>
          </button>
        </div>
        <div className="hero-note"><span>01</span><p>垂直方向放大约 5 倍，否则整片高地在这个跨度下几乎是平的。平面位置与高程数值均为实测值。</p></div>
      </section>

      <section className="map-section" id="map" aria-label="耶稣时代以色列互动地图">
        <div
          className="map-stage"
          ref={mapRef}
          tabIndex={0}
          role="application"
          aria-label={STAGE_LABEL}
          onKeyDown={(e) => {
            const nudge = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
            if (nudge) {
              const [kx, ky] = nudge;
              setView((v) => e.shiftKey
                ? { ...v, rotation: v.rotation + kx * 0.12, tilt: clamp(v.tilt + ky * 0.08, TILT.min, TILT.max) }
                : {
                    ...v,
                    panX: clampPan(v.panX - kx * 60, size.width),
                    panY: clampPan(v.panY - ky * 60, size.height),
                  });
            } else if (e.key === '+' || e.key === '=') zoomAt(1.25);
            else if (e.key === '-' || e.key === '_') zoomAt(1 / 1.25);
            else if (e.key === '0') setView((v) => ({ ...DEFAULT_VIEW, perspective: v.perspective }));
            else return;
            e.preventDefault();
          }}
        >
          <TerrainCanvas view={view} size={size} showRegions={showRegions} highlightRegion={highlightRegion} />

          {showRegions && regionLabels.map((r) => (
            <div className="region-label" key={r.name} style={anchor(r.lon, r.lat)}>
              <b>{r.name}</b><span>{r.sub}</span>
            </div>
          ))}

          {lakes.filter((l) => l.name).map((l) => {
            const c = l.ring.reduce((a, p) => [a[0] + p[0] / l.ring.length, a[1] + p[1] / l.ring.length], [0, 0]);
            const p = project(normLon(c[0]), normLat(c[1]), relief(l.surface), frame);
            return (
              <div className="water-label" key={l.id} style={{ left: p.x, top: p.y }}>
                <b>{l.name}</b><span>{l.surface} m</span>
              </div>
            );
          })}

          <div className="water-label" style={{ left: seaLabel.x, top: seaLabel.y }}>
            <b>地中海</b>
          </div>

          {peaks.filter((pk) => !places.some((p) => p.name === pk.name)).map((pk) => (
            <div className="peak-label" key={pk.name} style={anchor(pk.lon, pk.lat)}>
              <i>▲</i><b>{pk.name}</b><span>{pk.elev} m</span>
            </div>
          ))}

          {markers.map(({ place, x, y, z, label }) => (
            <button
              key={place.id}
              className={`map-marker kind-${place.kind} ${activeId === place.id ? 'active' : ''} ${label ? '' : 'no-label'}`}
              style={{ left: x, top: y, zIndex: z }}
              onClick={() => selectPlace(place)}
              aria-label={place.name}
            >
              <span className="marker-dot"><i /></span>
              <span className="marker-label"><b>{place.name}</b><small>{place.greek}</small></span>
            </button>
          ))}

          <div className="map-heading">
            <span>历史地理档案 · 01</span>
            <h2>福音书中的土地</h2>
            <div className="terrain-stats">
              30.60–33.75°N <i /> 34.20–36.50°E <i /> SRTM · 2 km 网格
            </div>
          </div>

          <div className="elevation-legend" aria-label="高程图例">
            <div className="legend-zero"><b style={{ left: `${seaLevelStop}%` }}>海平面</b></div>
            <div className="legend-ramp" style={{ background: rampCss }} />
            <div className="legend-ticks">
              <b>{Math.round(elevationRange.hi)} m</b>
              <b>{Math.round(elevationRange.lo)} m</b>
            </div>
            <small>实测高程 · 垂直放大 5×</small>
          </div>

          <div className="ruler-legend" aria-label="公元 30 年前后的管辖分区">
            <h4>公元 30 年前后的管辖</h4>
            {RULERS.map((r) => (
              <div key={r.key} className={regions[highlightRegion]?.ruler === r.key ? 'on' : ''}>
                <i style={{ background: rgb(RULER_TINT[r.key]) }} />
                <b>{r.name}</b><span>{r.note}</span>
              </div>
            ))}
          </div>

          <div className="view-tools" aria-label="地图视图控制">
            <button onClick={() => zoomAt(1.25)} aria-label="放大">＋</button>
            <button onClick={() => zoomAt(1 / 1.25)} aria-label="缩小">−</button>
            <button onClick={() => setView((v) => ({ ...DEFAULT_VIEW, perspective: v.perspective }))} aria-label="重置视图">⌂</button>
            <button className={view.perspective ? 'on' : ''} onClick={() => setView((v) => ({ ...v, perspective: !v.perspective }))} aria-label="切换透视投影">⏢</button>
            <button className={showRegions ? 'on' : ''} onClick={() => setShowRegions((s) => !s)} aria-label="切换分封疆界">▧</button>
            <button className={showTowns ? 'on' : ''} onClick={() => setShowTowns((s) => !s)} aria-label="切换城邑标注">◦</button>
          </div>
          <Compass rotation={view.rotation} onReset={() => setView((v) => ({ ...v, rotation: 0 }))} />

          <div className="filter-bar" aria-label="事件类型筛选">
            {themes.map((item) => (
              <button key={item} className={filter === item ? 'active' : ''} onClick={() => setFilter(item)}>{item}</button>
            ))}
          </div>

          <div className="map-hint"><span>✥</span> 拖动平移 · Shift 或右键拖动旋转俯仰 · 滚轮缩放 · 双击放大</div>

          <aside className={`story-panel ${panelOpen ? 'open' : ''}`} aria-live="polite">
            <button className="close-panel" onClick={() => setPanelOpen(false)} aria-label="关闭地点详情">×</button>
            <div className="panel-index">
              {String(places.indexOf(active) + 1).padStart(2, '0')} <span>/ {places.length}</span>
            </div>
            <div className="panel-tag">{active.region} · {active.theme}</div>
            <h3>{active.name}</h3>
            <div className="ancient-name">{active.greek}</div>
            {active.site && <div className="modern-site">今址 · {active.site}</div>}
            <div className="story-rule"><span /></div>
            {active.title && <p className="story-title">{active.title}</p>}
            <p className="story-description">{active.description}</p>
            {active.reference && (
              <div className="reference"><small>经文索引</small><b>{active.reference}</b></div>
            )}
            {active.date && (
              <div className="date-row"><span>◷</span><div><small>时间线</small><b>{active.date}</b></div></div>
            )}
            <div className="date-row"><span>↥</span><div><small>海拔</small><b>{active.elev > 0 ? '+' : ''}{active.elev} 米</b></div></div>
            <div className="date-row"><span>⌖</span><div><small>坐标</small><b>{active.lat.toFixed(4)}°N, {active.lon.toFixed(4)}°E</b></div></div>
            <div className="date-row"><span>↔</span><div><small>距耶路撒冷直线</small><b>{distanceToJerusalem} 公里</b></div></div>
            <div className="panel-nav">
              <button onClick={() => step(-1)} aria-label="上一个地点">←</button>
              <div>{story.map((p) => <i key={p.id} className={p.id === active.id ? 'active' : ''} />)}</div>
              <button onClick={() => step(1)} aria-label="下一个地点">→</button>
            </div>
          </aside>
        </div>
      </section>

      <section className="guide" id="guide">
        <div className="guide-intro">
          <span className="eyebrow"><i /> HOW TO READ THE MAP</span>
          <h2>山川让叙事<br />有了<em>尺度</em></h2>
        </div>
        <div className="guide-grid">
          <article>
            <span>01</span><h3>三条南北向的带状地形</h3>
            <p>自西向东依次是海岸平原（0–50 米）、中央山脊（加利利、撒马利亚、犹大山地，多在 500–1000 米）与约旦裂谷。三者之间的高差决定了古代道路的走向。</p>
          </article>
          <article>
            <span>02</span><h3>世界最低的陆地裂谷</h3>
            <p>加利利海水面约在海平面下 209 米，死海约在 −400 米上下。从耶利哥（−258 米）上耶路撒冷（+754 米），27 公里内要爬升一千米——「上耶路撒冷」是字面意义的上行。</p>
          </article>
          <article>
            <span>03</span><h3>被切成四块的土地</h3>
            <p>耶稣公开传道时，加利利与比利亚属希律安提帕，东北部属希律腓力，犹太、撒马利亚与以土买由罗马巡抚直辖，东侧则是低加波利的自治城邦。从加利利去耶路撒冷，要么穿过撒马利亚，要么绕行约旦河东。</p>
          </article>
        </div>
        <div className="source-note" id="sources">
          <p>
            高程：NASA SRTM 30 米数字高程模型，按 0.02°（约 2 公里）网格取样，共 {'18,328'} 个采样点，经 opentopodata 公开接口获取。
            海岸线、加利利海、死海与约旦河等河道中心线：Natural Earth 10m 物理矢量。
            死海的利桑海峡在 1979 年前南北盆地相连，本图按一世纪状态合并；米伦湖（Semechonitis）于 1950 年代排干，按历史范围补绘。
            公元 30 年前后的分封疆界与古代地名为教育性近似，位置采用今址或学界主流候选地的实测坐标。
          </p>
          <div>
            <a href="https://www.earthdata.nasa.gov/data/instruments/srtm" target="_blank" rel="noreferrer">NASA SRTM ↗</a>
            <a href="https://www.opentopodata.org/datasets/srtm/" target="_blank" rel="noreferrer">OpenTopoData ↗</a>
            <a href="https://www.naturalearthdata.com/downloads/10m-physical-vectors/" target="_blank" rel="noreferrer">Natural Earth ↗</a>
          </div>
        </div>
      </section>

      <footer><span>弥赛亚之地</span><p>以地理为线索 · 重读福音书</p><a href="#top">回到顶部 ↑</a></footer>
    </main>
  );
}
