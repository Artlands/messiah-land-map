'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type Place = {
  id: string;
  name: string;
  ancient: string;
  region: string;
  x: number;
  z: number;
  category: '生平' | '教导' | '神迹' | '受难周';
  date: string;
  title: string;
  description: string;
  reference: string;
};

const places: Place[] = [
  {
    id: 'jerusalem', name: '耶路撒冷', ancient: 'ΙΕΡΟΥΣΑΛΗΜ', region: '犹太地', x: 0.43, z: 0.61,
    category: '受难周', date: '约公元 30–33 年', title: '最后一周',
    description: '耶稣进入耶路撒冷，在圣殿教导；最后的晚餐、受难与复活的叙事都集中于此。', reference: '马可福音 11–16章',
  },
  {
    id: 'bethlehem', name: '伯利恒', ancient: 'ΒΗΘΛΕΕΜ', region: '犹太地', x: 0.41, z: 0.68,
    category: '生平', date: '约公元前 6–4 年', title: '降生之地',
    description: '位于耶路撒冷以南约九公里。马太福音与路加福音都将耶稣的降生置于伯利恒。', reference: '马太福音 2:1；路加福音 2:4–7',
  },
  {
    id: 'jericho', name: '耶利哥', ancient: 'ΙΕΡΙΧΩ', region: '犹太地', x: 0.64, z: 0.58,
    category: '教导', date: '前往耶路撒冷途中', title: '撒该与瞎子',
    description: '约旦河谷中的绿洲城。耶稣在此医治瞎子，并进入税吏撒该的家。', reference: '路加福音 18:35–19:10',
  },
  {
    id: 'bethany', name: '伯大尼', ancient: 'ΒΗΘΑΝΙΑ', region: '犹太地', x: 0.49, z: 0.61,
    category: '神迹', date: '受难周之前', title: '拉撒路复活',
    description: '橄榄山东麓的村庄，是马大、马利亚和拉撒路的家，也是耶稣前往耶路撒冷时的落脚地。', reference: '约翰福音 11:1–44',
  },
  {
    id: 'nazareth', name: '拿撒勒', ancient: 'ΝΑΖΑΡΕΤ', region: '加利利', x: 0.39, z: 0.27,
    category: '生平', date: '童年与早期生活', title: '成长之城',
    description: '耶稣成长的家乡。他后来在会堂宣读以赛亚书，但乡人拒绝接受他的宣告。', reference: '路加福音 4:16–30',
  },
  {
    id: 'cana', name: '迦拿', ancient: 'ΚΑΝΑ', region: '加利利', x: 0.46, z: 0.23,
    category: '神迹', date: '公开传道初期', title: '水变为酒',
    description: '约翰福音记载耶稣在婚宴中将水变为酒，称这是他所行的第一个记号。', reference: '约翰福音 2:1–11',
  },
  {
    id: 'capernaum', name: '迦百农', ancient: 'ΚΑΦΑΡΝΑΟΥΜ', region: '加利利', x: 0.67, z: 0.18,
    category: '教导', date: '加利利事工中心', title: '湖边的基地',
    description: '加利利海西北岸的渔村。耶稣在这里教导、呼召门徒，并医治多人。', reference: '马可福音 1:16–34；2:1–12',
  },
  {
    id: 'sea-galilee', name: '加利利海', ancient: 'ΘΑΛΑΣΣΑ ΓΑΛΙΛΑΙΑΣ', region: '加利利', x: 0.72, z: 0.25,
    category: '神迹', date: '加利利事工期间', title: '平静风浪',
    description: '耶稣许多教导与神迹发生在湖上或沿岸，包括平静风浪、在水面行走及喂饱众人。', reference: '马可福音 4:35–41；6:45–52',
  },
  {
    id: 'samaria', name: '叙加', ancient: 'ΣΥΧΑΡ', region: '撒马利亚', x: 0.42, z: 0.43,
    category: '教导', date: '途经撒马利亚', title: '井旁谈道',
    description: '耶稣在雅各井旁与一位撒马利亚妇人谈论“活水”，跨越当时的族群与宗教隔阂。', reference: '约翰福音 4:4–42',
  },
  {
    id: 'caesarea', name: '凯撒利亚', ancient: 'ΚΑΙΣΑΡΕΙΑ', region: '地中海沿岸', x: 0.12, z: 0.40,
    category: '生平', date: '罗马统治时期', title: '罗马行政港城',
    description: '希律大帝扩建的港城，是罗马在犹太行省的重要行政中心，为地图提供帝国统治的历史背景。', reference: '使徒行传 10章（后期背景）',
  },
];

const filters = ['全部', '生平', '教导', '神迹', '受难周'] as const;
type Filter = (typeof filters)[number];

const regionLabels = [
  { name: '加利利', sub: 'GALILEE', x: 0.45, z: 0.13 },
  { name: '撒马利亚', sub: 'SAMARIA', x: 0.40, z: 0.39 },
  { name: '犹太地', sub: 'JUDEA', x: 0.38, z: 0.71 },
  { name: '比利亚', sub: 'PEREA', x: 0.77, z: 0.53 },
];

function terrainHeight(x: number, z: number) {
  const ridge = 0.17 * Math.exp(-Math.pow((x - 0.42) / 0.16, 2));
  const galilee = 0.07 * Math.exp(-((x - 0.47) ** 2 + (z - 0.23) ** 2) / 0.022);
  const judea = 0.12 * Math.exp(-((x - 0.43) ** 2 + (z - 0.65) ** 2) / 0.035);
  const valley = 0.12 * Math.exp(-Math.pow((x - 0.69) / 0.085, 2));
  const texture = 0.014 * Math.sin(x * 39 + z * 13) + 0.01 * Math.sin(z * 48 - x * 9);
  return Math.max(0, 0.055 + ridge + galilee + judea - valley + texture);
}

function isLand(x: number, z: number) {
  const west = 0.055 + z * 0.11 + 0.018 * Math.sin(z * 12);
  const east = 0.86 - z * 0.11 + 0.045 * Math.sin(z * 8 + 1.4);
  return x > west && x < east;
}

type View = { rotation: number; tilt: number; zoom: number };

function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 1000, height: 700 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ width, height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return { ref, size };
}

function projectPoint(x: number, z: number, y: number, view: View, width: number, height: number) {
  const cx = x - 0.5;
  const cz = z - 0.5;
  const cos = Math.cos(view.rotation);
  const sin = Math.sin(view.rotation);
  const rx = cx * cos - cz * sin;
  const rz = cx * sin + cz * cos;
  const scale = Math.min(width * 0.86, height * 1.05) * view.zoom;
  const sy = Math.sin(view.tilt);
  const cy = Math.cos(view.tilt);
  return {
    x: width * 0.51 + rx * scale,
    y: height * 0.52 + rz * scale * sy - y * scale * cy,
    depth: rz,
  };
}

function TerrainCanvas({ view }: { view: View }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [resizeTick, setResizeTick] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    ctx.clearRect(0, 0, width, height);

    const haze = ctx.createRadialGradient(width * 0.52, height * 0.44, 30, width * 0.52, height * 0.44, width * 0.62);
    haze.addColorStop(0, 'rgba(28, 73, 84, .12)');
    haze.addColorStop(1, 'rgba(5, 13, 16, 0)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, width, height);

    const grid = 35;
    const cells: { depth: number; points: { x: number; y: number }[]; h: number }[] = [];
    for (let zi = 0; zi < grid; zi++) {
      for (let xi = 0; xi < grid; xi++) {
        const x0 = xi / grid;
        const z0 = zi / grid;
        const x1 = (xi + 1) / grid;
        const z1 = (zi + 1) / grid;
        const mx = (x0 + x1) / 2;
        const mz = (z0 + z1) / 2;
        if (!isLand(mx, mz)) continue;
        const hs = [terrainHeight(x0, z0), terrainHeight(x1, z0), terrainHeight(x1, z1), terrainHeight(x0, z1)];
        const pts = [
          projectPoint(x0, z0, hs[0], view, width, height),
          projectPoint(x1, z0, hs[1], view, width, height),
          projectPoint(x1, z1, hs[2], view, width, height),
          projectPoint(x0, z1, hs[3], view, width, height),
        ];
        cells.push({ depth: pts.reduce((a, p) => a + p.depth, 0) / 4, points: pts, h: hs.reduce((a, v) => a + v, 0) / 4 });
      }
    }
    cells.sort((a, b) => a.depth - b.depth);
    for (const cell of cells) {
      const light = Math.max(0, Math.min(1, (cell.h - 0.035) / 0.22));
      const r = Math.round(31 + light * 89);
      const g = Math.round(43 + light * 67);
      const b = Math.round(37 + light * 38);
      ctx.beginPath();
      cell.points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
      ctx.closePath();
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fill();
      ctx.strokeStyle = 'rgba(194, 168, 111, .055)';
      ctx.lineWidth = 0.45;
      ctx.stroke();
    }

    const drawLake = (cx: number, cz: number, rx: number, rz: number, color: string) => {
      const steps = 34;
      ctx.beginPath();
      for (let i = 0; i <= steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        const x = cx + Math.cos(a) * rx;
        const z = cz + Math.sin(a) * rz;
        const p = projectPoint(x, z, terrainHeight(x, z) + 0.004, view, width, height);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = 'rgba(125, 205, 208, .45)';
      ctx.lineWidth = 1;
      ctx.stroke();
    };
    drawLake(0.705, 0.245, 0.053, 0.092, 'rgba(24, 102, 112, .9)');
    drawLake(0.72, 0.685, 0.055, 0.16, 'rgba(18, 74, 85, .92)');

    ctx.save();
    ctx.setLineDash([3, 5]);
    ctx.strokeStyle = 'rgba(214, 184, 113, .32)';
    ctx.lineWidth = 1;
    for (let x = 0.2; x < 0.9; x += 0.15) {
      ctx.beginPath();
      let started = false;
      for (let z = 0.05; z <= 0.95; z += 0.025) {
        if (!isLand(x, z)) continue;
        const p = projectPoint(x, z, terrainHeight(x, z) + 0.007, view, width, height);
        if (!started) { ctx.moveTo(p.x, p.y); started = true; } else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }, [view, resizeTick]);

  useEffect(() => {
    const handler = () => setResizeTick((tick) => tick + 1);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  return <canvas ref={canvasRef} className="terrain-canvas" aria-hidden="true" />;
}

function Compass({ rotation }: { rotation: number }) {
  return (
    <div className="compass" aria-label="地图方向">
      <div className="compass-ring" style={{ transform: `rotate(${rotation}rad)` }}>
        <span className="north">N</span>
        <span className="south">S</span>
        <i />
      </div>
    </div>
  );
}

export default function Home() {
  const [activeId, setActiveId] = useState('jerusalem');
  const [filter, setFilter] = useState<Filter>('全部');
  const [view, setView] = useState<View>({ rotation: -0.12, tilt: 0.58, zoom: 0.92 });
  const [panelOpen, setPanelOpen] = useState(true);
  const { ref: mapRef, size } = useSize<HTMLDivElement>();
  const dragRef = useRef<{ x: number; rotation: number } | null>(null);
  const active = places.find((p) => p.id === activeId) ?? places[0];
  const visiblePlaces = useMemo(() => places.filter((p) => filter === '全部' || p.category === filter), [filter]);

  const markerPosition = useCallback((place: Place) => {
    const point = projectPoint(place.x, place.z, terrainHeight(place.x, place.z) + 0.025, view, size.width, size.height);
    return { left: point.x, top: point.y, zIndex: Math.round((point.depth + 1) * 100) };
  }, [view, size]);

  const regionPosition = useCallback((region: (typeof regionLabels)[number]) => {
    const point = projectPoint(region.x, region.z, terrainHeight(region.x, region.z) + 0.014, view, size.width, size.height);
    return { left: point.x, top: point.y };
  }, [view, size]);

  const selectPlace = (place: Place) => {
    setActiveId(place.id);
    setPanelOpen(true);
  };

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
          <button className="about-button" onClick={() => {
            setPanelOpen(true);
            document.querySelector('#guide')?.scrollIntoView({ behavior: 'smooth' });
          }}>关于本图</button>
        </nav>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <div className="eyebrow"><span /> THE LAND OF THE GOSPELS</div>
          <h1>走进耶稣<br />时代的<em>以色列</em></h1>
          <p>从加利利的湖岸，到耶路撒冷的山脊。转动这片土地，沿着福音书的记载，重新理解故事发生的距离与地貌。</p>
          <button className="primary-button" onClick={() => document.querySelector('#map')?.scrollIntoView({ behavior: 'smooth' })}>
            开始探索 <span>↘</span>
          </button>
        </div>
        <div className="hero-note"><span>01</span><p>地形为历史地理示意，地点位置采用现代坐标的近似关系。</p></div>
      </section>

      <section className="map-section" id="map" aria-label="耶稣时代以色列互动地图">
        <div
          className="map-stage"
          ref={mapRef}
          onPointerDown={(e) => {
            if ((e.target as HTMLElement).closest('button')) return;
            dragRef.current = { x: e.clientX, rotation: view.rotation };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (!dragRef.current) return;
            setView((v) => ({ ...v, rotation: dragRef.current!.rotation + (e.clientX - dragRef.current!.x) * 0.008 }));
          }}
          onPointerUp={() => { dragRef.current = null; }}
          onPointerCancel={() => { dragRef.current = null; }}
          onWheel={(e) => {
            e.preventDefault();
            setView((v) => ({ ...v, zoom: Math.max(0.68, Math.min(1.35, v.zoom - e.deltaY * 0.0007)) }));
          }}
        >
          <TerrainCanvas view={view} />
          <div className="map-glow" />
          {regionLabels.map((region) => (
            <div className="region-label" key={region.name} style={regionPosition(region)}>
              <b>{region.name}</b><span>{region.sub}</span>
            </div>
          ))}
          {visiblePlaces.map((place) => (
            <button
              key={place.id}
              className={`map-marker ${activeId === place.id ? 'active' : ''}`}
              style={markerPosition(place)}
              onClick={() => selectPlace(place)}
              aria-label={`查看${place.name}：${place.title}`}
            >
              <span className="marker-dot"><i /></span>
              <span className="marker-label"><b>{place.name}</b><small>{place.ancient}</small></span>
            </button>
          ))}

          <div className="map-heading">
            <span>历史地理档案 · 01</span>
            <h2>福音书中的土地</h2>
          </div>

          <div className="view-tools" aria-label="地图视图控制">
            <button onClick={() => setView((v) => ({ ...v, zoom: Math.min(1.35, v.zoom + 0.1) }))} aria-label="放大">＋</button>
            <button onClick={() => setView((v) => ({ ...v, zoom: Math.max(0.68, v.zoom - 0.1) }))} aria-label="缩小">−</button>
            <button onClick={() => setView({ rotation: -0.12, tilt: 0.58, zoom: 0.92 })} aria-label="重置视图">⌂</button>
          </div>
          <Compass rotation={view.rotation} />

          <div className="filter-bar" aria-label="事件类型筛选">
            {filters.map((item) => (
              <button key={item} className={filter === item ? 'active' : ''} onClick={() => setFilter(item)}>{item}</button>
            ))}
          </div>

          <div className="map-hint"><span>↔</span> 拖动旋转 · 滚轮缩放</div>

          <aside className={`story-panel ${panelOpen ? 'open' : ''}`} aria-live="polite">
            <button className="close-panel" onClick={() => setPanelOpen(false)} aria-label="关闭地点详情">×</button>
            <div className="panel-index">{String(places.indexOf(active) + 1).padStart(2, '0')} <span>/ {places.length}</span></div>
            <div className="panel-tag">{active.region} · {active.category}</div>
            <h3>{active.name}</h3>
            <div className="ancient-name">{active.ancient}</div>
            <div className="story-rule"><span /></div>
            <p className="story-title">{active.title}</p>
            <p className="story-description">{active.description}</p>
            <div className="reference"><small>经文索引</small><b>{active.reference}</b></div>
            <div className="date-row"><span>◷</span><div><small>时间线</small><b>{active.date}</b></div></div>
            <div className="panel-nav">
              <button onClick={() => {
                const i = places.indexOf(active);
                selectPlace(places[(i - 1 + places.length) % places.length]);
              }} aria-label="上一个地点">←</button>
              <div>{places.map((p) => <i key={p.id} className={p.id === active.id ? 'active' : ''} />)}</div>
              <button onClick={() => {
                const i = places.indexOf(active);
                selectPlace(places[(i + 1) % places.length]);
              }} aria-label="下一个地点">→</button>
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
          <article><span>01</span><h3>山地与河谷</h3><p>中央山脊连接加利利、撒马利亚与犹太地；约旦河谷则形成明显的南北通道。</p></article>
          <article><span>02</span><h3>行程与距离</h3><p>拿撒勒到耶路撒冷直线约一百公里。福音书中的“上耶路撒冷”，也是一次真实的爬升。</p></article>
          <article><span>03</span><h3>边界与称谓</h3><p>本图使用公元一世纪常见地区称谓。政治边界随希律诸王与罗马治理不断变化。</p></article>
        </div>
        <p className="source-note">本项目为教育性历史地理可视化；古代地点、年代与路线存在学术争议，图中均作近似表达。</p>
      </section>

      <footer><span>弥赛亚之地</span><p>以地理为线索 · 重读福音书</p><a href="#top">回到顶部 ↑</a></footer>
    </main>
  );
}
