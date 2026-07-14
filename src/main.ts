import './styles.css';
import { createScenario } from './physics/scenario';
import { World, type WorldSnapshot } from './physics/world';
import { summarizeRun, type RunSummary } from './physics/metrics';
import { ft, mToFt, mph } from './physics/units';
import { horizontalDistance } from './physics/vector';
import { layersToWindLayers, type WindsAloftLayer } from './physics/windsAloft';
import { runMonteCarlo, distributionsFromSummaries, type DistributionSummary } from './physics/monteCarlo';

const app = document.querySelector<HTMLDivElement>('#app')!;
const defaultWindRows: WindsAloftLayer[] = [
  { altitudeFt: 0, directionDeg: 180, speedMph: 5 },
  { altitudeFt: 3000, directionDeg: 180, speedMph: 15 },
  { altitudeFt: 6000, directionDeg: 180, speedMph: 20 },
  { altitudeFt: 9000, directionDeg: 180, speedMph: 25 },
  { altitudeFt: 12000, directionDeg: 180, speedMph: 30 },
];

app.innerHTML = `
  <header class="hero">
    <div>
      <p class="eyebrow"><a class="dashboard-link" href="http://netexplore:8080/" data-dashboard-link>← Dashboard</a> · Realtime teaching simulator</p>
      <h1>Freefall Drift Explorer</h1>
      <p>Compare exit order, upper-level wind drift, stochastic deployment altitude, snivel/opening loss, and canopy congestion. Not jump advice — a physics toy for exploring assumptions.</p>
    </div>
    <div class="hero-card">
      <strong>Wind matters:</strong> use the editable upper-level wind table, or pull the latest AviationWeather FD wind/temp forecast for RDU.
    </div>
  </header>
  <main>
    <section class="panel controls">
      <label>Seed <input id="seed" type="number" value="42" /></label>
      <label>Manifest <input id="numJumpers" type="number" min="2" max="24" value="10" /></label>
      <label>Group switch <input id="groupSwitch" type="number" min="1" max="24" value="5" /></label>
      <label>Exit separation (s) <input id="exitSeparationS" type="number" min="2" max="30" value="8" /></label>
      <label class="check"><input id="fastFallFirst" type="checkbox" /> Freefly / fast-fall first</label>
      <label>Playback speed <input id="speed" type="range" min="0.25" max="12" step="0.25" value="5" /></label>
      <div class="buttons">
        <button id="reset">Reset run</button>
        <button id="pause">Pause</button>
      </div>
    </section>
    <section class="wind-panel panel">
      <div class="wind-heading">
        <div>
          <h2>Upper-level winds</h2>
          <p>Direction is the direction the wind blows <strong>toward</strong>. Defaults mirror the README sample: 0:5 · 3000:15 · 6000:20 · 9000:25 · 12000:30 mph.</p>
        </div>
        <div class="forecast-tools">
          <label>Station <input id="station" value="RDU" maxlength="4" /></label>
          <label>Forecast <select id="fcst"><option>06</option><option>12</option><option>24</option></select></label>
          <button id="loadForecast">Load RDU winds aloft</button>
        </div>
      </div>
      <div id="windRows" class="wind-rows"></div>
      <div id="forecastStatus" class="small status-line">Manual winds loaded.</div>
    </section>
    <section class="sim-grid">
      <canvas id="scene" width="920" height="620" aria-label="Simulation canvas"></canvas>
      <aside class="panel">
        <h2>Run metrics</h2>
        <div id="metrics" class="metrics"></div>
        <div class="mc-tools">
          <button id="runMonteCarlo">Run 1000 Monte Carlo sims</button>
          <div id="mcStatus" class="small status-line">Monte Carlo not run yet.</div>
        </div>
        <div id="mcResults" class="mc-results"></div>
        <h2>Deployment model</h2>
        <ul class="small">
          <li>Target: 3500 ft with ± jitter</li>
          <li>Opening/snivel loss: 300–800 ft</li>
          <li>Canopy vertical descent: 18–35 mph</li>
          <li>Seeded: same URL/config gives same run</li>
        </ul>
      </aside>
    </section>
    <section class="panel">
      <h2>What to look for</h2>
      <p>The original app argued that exit order should be evaluated by <em>canopy congestion</em>, not just freefall horizontal separation. This version makes the wind dependence explicit: small changes in upper-level winds can dominate opening locations and stacked-canopy timing.</p>
    </section>
  </main>
`;

const canvas = document.querySelector<HTMLCanvasElement>('#scene')!;
document.querySelectorAll<HTMLAnchorElement>('[data-dashboard-link]').forEach(link => {
  link.href = `${location.protocol}//${location.hostname}:8080/`;
});
const ctx = canvas.getContext('2d')!;
const metricsEl = document.querySelector<HTMLDivElement>('#metrics')!;
const mcResultsEl = document.querySelector<HTMLDivElement>('#mcResults')!;
const mcStatusEl = document.querySelector<HTMLDivElement>('#mcStatus')!;
const windRowsEl = document.querySelector<HTMLDivElement>('#windRows')!;
const forecastStatus = document.querySelector<HTMLDivElement>('#forecastStatus')!;
const controls = {
  seed: document.querySelector<HTMLInputElement>('#seed')!,
  numJumpers: document.querySelector<HTMLInputElement>('#numJumpers')!,
  groupSwitch: document.querySelector<HTMLInputElement>('#groupSwitch')!,
  exitSeparationS: document.querySelector<HTMLInputElement>('#exitSeparationS')!,
  fastFallFirst: document.querySelector<HTMLInputElement>('#fastFallFirst')!,
  speed: document.querySelector<HTMLInputElement>('#speed')!,
  station: document.querySelector<HTMLInputElement>('#station')!,
  fcst: document.querySelector<HTMLSelectElement>('#fcst')!,
};

let windRows = [...defaultWindRows];
let currentScenario = createScenario({ windLayers: layersToWindLayers(windRows) });
let world: World;
let snapshots: WorldSnapshot[] = [];
let summary: RunSummary;
let paused = false;
let last = performance.now();
let accumulator = 0;
const fixedDt = 1 / 30;

function renderWindRows() {
  windRowsEl.innerHTML = windRows.map((row, index) => `
    <div class="wind-row" data-index="${index}">
      <strong>${row.altitudeFt.toLocaleString()} ft</strong>
      <label>toward ° <input data-wind="direction" type="number" min="0" max="360" step="10" value="${row.directionDeg}" /></label>
      <label>mph <input data-wind="speed" type="number" min="0" max="120" step="1" value="${row.speedMph.toFixed(0)}" /></label>
    </div>`).join('');
  windRowsEl.querySelectorAll<HTMLInputElement>('input[data-wind]').forEach(input => {
    input.addEventListener('input', () => {
      const row = input.closest<HTMLElement>('.wind-row')!;
      const index = Number(row.dataset.index);
      const key = input.dataset.wind === 'direction' ? 'directionDeg' : 'speedMph';
      windRows[index] = { ...windRows[index], [key]: Number(input.value) || 0 };
      forecastStatus.textContent = 'Manual wind edit applied.';
      reset();
    });
  });
}

function reset() {
  const numJumpers = Number(controls.numJumpers.value);
  const scenario = createScenario({
    seed: Number(controls.seed.value) || 1,
    numJumpers,
    groupSwitch: Math.min(Number(controls.groupSwitch.value) || Math.ceil(numJumpers / 2), numJumpers - 1),
    exitSeparationS: Number(controls.exitSeparationS.value) || 8,
    fastFallFirst: controls.fastFallFirst.checked,
    windLayers: layersToWindLayers(windRows),
  });
  currentScenario = scenario;
  world = new World(scenario);
  snapshots = [world.snapshot()];
  summary = summarizeRun(snapshots);
  accumulator = 0;
  last = performance.now();
  draw(world.snapshot());
  renderMetrics(world.snapshot(), summary);
}

async function loadForecast() {
  const station = controls.station.value.trim().toUpperCase() || 'RDU';
  forecastStatus.textContent = `Loading ${station} winds aloft…`;
  try {
    const res = await fetch(`/api/winds-aloft?station=${encodeURIComponent(station)}&region=mia&fcst=${encodeURIComponent(controls.fcst.value)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    windRows = data.layers;
    renderWindRows();
    forecastStatus.textContent = `Loaded ${data.station} ${data.fcst}h forecast from AviationWeather. Valid/use window: ${data.header || 'see source'}`;
    reset();
  } catch (err) {
    forecastStatus.textContent = `Could not load forecast: ${err instanceof Error ? err.message : String(err)}. Manual winds still work.`;
  }
}

function tick(now: number) {
  const speed = Number(controls.speed.value) || 1;
  if (!paused) {
    accumulator += ((now - last) / 1000) * speed;
    while (accumulator >= fixedDt) {
      world.step(fixedDt);
      const snap = world.snapshot();
      snapshots.push(snap);
      accumulator -= fixedDt;
      if (snap.jumpers.every(j => j.phase === 'landed')) break;
    }
  }
  const snap = world.snapshot();
  summary = summarizeRun(snapshots);
  draw(snap);
  renderMetrics(snap, summary);
  last = now;
  requestAnimationFrame(tick);
}

function draw(snapshot: WorldSnapshot) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const sky = ctx.createLinearGradient(0, 0, 0, canvas.height);
  sky.addColorStop(0, '#72b7ff');
  sky.addColorStop(1, '#d7f2ff');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawWindArrows();
  ctx.strokeStyle = 'rgba(15,23,42,.2)';
  ctx.lineWidth = 1;
  for (let ftMark = 0; ftMark <= 13000; ftMark += 1000) {
    const y = altitudeY(ft(ftMark));
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    if (ftMark % 3000 === 0) {
      ctx.fillStyle = 'rgba(15,23,42,.65)';
      ctx.fillText(`${ftMark.toLocaleString()} ft`, 8, y - 4);
    }
  }
  ctx.fillStyle = '#174e2a';
  ctx.fillRect(0, canvas.height - 22, canvas.width, 22);

  const canopies = snapshot.jumpers.filter(j => j.phase === 'canopy');
  for (let i = 0; i < canopies.length; i++) {
    for (let k = i + 1; k < canopies.length; k++) {
      const a = screenPoint(canopies[i]);
      const b = screenPoint(canopies[k]);
      const close = horizontalDistance(canopies[i].position, canopies[k].position) < 300 && Math.abs(canopies[i].position.y - canopies[k].position.y) < 150;
      if (close) {
        ctx.strokeStyle = 'rgba(239,68,68,.45)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
    }
  }

  for (const j of snapshot.jumpers) {
    const p = screenPoint(j);
    ctx.save();
    ctx.translate(p.x, p.y);
    if (j.phase === 'freefall') drawFreefall(j.id, j.velocity.y < -65 ? '#7c2d12' : '#365314');
    else if (j.phase === 'deploying') drawDeploying(j.id);
    else if (j.phase === 'canopy') drawCanopy(j.id);
    else if (j.phase === 'landed') drawLanded(j.id);
    ctx.restore();
  }
}

function drawWindArrows() {
  for (const row of windRows) {
    const y = altitudeY(ft(row.altitudeFt));
    const len = 18 + row.speedMph * 1.5;
    const rad = (row.directionDeg * Math.PI) / 180;
    const dx = Math.sin(rad) * len;
    const dz = Math.cos(rad) * len;
    const x = canvas.width - 115;
    ctx.strokeStyle = 'rgba(37,99,235,.55)';
    ctx.fillStyle = 'rgba(37,99,235,.75)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + dx, y - dz * 0.2); ctx.stroke();
    ctx.beginPath(); ctx.arc(x + dx, y - dz * 0.2, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillText(`${row.speedMph.toFixed(0)} mph`, x - 50, y + 4);
  }
}

type DrawableJumper = WorldSnapshot['jumpers'][number];
function screenPoint(j: DrawableJumper) {
  const feetZ = mToFt(j.position.z);
  const feetX = mToFt(j.position.x);
  return { x: canvas.width / 2 + feetZ / 18 + feetX / 50, y: altitudeY(j.position.y) };
}
function altitudeY(altM: number) { return 20 + (1 - Math.min(1, Math.max(0, altM / ft(13000)))) * (canvas.height - 50); }
function drawFreefall(id: string, color: string) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillText(id.replace('J', ''), 10, 4); }
function drawDeploying(id: string) { ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 12, Math.PI, 0); ctx.stroke(); ctx.fillStyle = '#92400e'; ctx.beginPath(); ctx.arc(0, 6, 5, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#111827'; ctx.fillText(id.replace('J', ''), 14, 4); }
function drawCanopy(id: string) { ctx.fillStyle = '#2563eb'; ctx.beginPath(); ctx.ellipse(0, -6, 18, 9, 0, Math.PI, 0); ctx.fill(); ctx.strokeStyle = '#1e3a8a'; ctx.beginPath(); ctx.moveTo(-12, 0); ctx.lineTo(0, 10); ctx.lineTo(12, 0); ctx.stroke(); ctx.fillStyle = '#111827'; ctx.fillText(id.replace('J', ''), 20, 2); }
function drawLanded(id: string) { ctx.fillStyle = '#334155'; ctx.fillRect(-6, -4, 12, 8); ctx.fillText(id.replace('J', ''), 8, 2); }

function runMonteCarloUi() {
  const button = document.querySelector<HTMLButtonElement>('#runMonteCarlo')!;
  button.disabled = true;
  mcResultsEl.innerHTML = '';
  const totalRuns = 1000;
  const batchSize = 25;
  const summaries: RunSummary[] = [];
  const seedStart = Number(controls.seed.value) || 1;
  const started = performance.now();
  mcStatusEl.textContent = `Running ${totalRuns} simulations… 0/${totalRuns}`;

  const runBatch = () => {
    const remaining = totalRuns - summaries.length;
    const runs = Math.min(batchSize, remaining);
    const batch = runMonteCarlo({ baseScenario: currentScenario, runs, seedStart: seedStart + summaries.length, dtS: 1 / 10 });
    summaries.push(...batch.summaries);
    mcStatusEl.textContent = `Running ${totalRuns} simulations… ${summaries.length}/${totalRuns}`;
    if (summaries.length < totalRuns) {
      setTimeout(runBatch, 0);
      return;
    }
    const elapsed = ((performance.now() - started) / 1000).toFixed(1);
    mcStatusEl.textContent = `${totalRuns} simulations complete in ${elapsed}s. Congestion score = close canopy pair-seconds.`;
    mcResultsEl.innerHTML = renderDistributionTable(distributionsFromSummaries(summaries));
    button.disabled = false;
  };
  setTimeout(runBatch, 20);
}

function renderDistributionTable(distributions: Record<string, DistributionSummary>): string {
  const labels: Record<string, string> = {
    maxOpenCanopiesBelow1000Ft: 'Max canopies <1000 ft',
    maxOpenCanopiesBelow500Ft: 'Max canopies <500 ft',
    minHorizontalSeparationFt: 'Min horizontal sep ft',
    fullyOpenAltitudeMinFt: 'Lowest fully-open ft',
    fullyOpenAltitudeMaxFt: 'Highest fully-open ft',
    fullyOpenAltitudeSpreadFt: 'Fully-open spread ft',
    canopyCongestionScore: 'Congestion score',
  };
  const rows = Object.entries(distributions).map(([key, d]) => `
    <tr><th>${labels[key] ?? key}</th><td>${fmt(d.min)}</td><td>${fmt(d.p10)}</td><td>${fmt(d.median)}</td><td>${fmt(d.p90)}</td><td>${fmt(d.p95)}</td><td>${fmt(d.max)}</td><td>${fmt(d.mean)}</td></tr>`).join('');
  return `<table><thead><tr><th>Stat</th><th>min</th><th>p10</th><th>median</th><th>p90</th><th>p95</th><th>max</th><th>mean</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function fmt(value: number): string {
  return Math.abs(value) >= 10 ? value.toFixed(0) : value.toFixed(1);
}

function renderMetrics(snapshot: WorldSnapshot, s: RunSummary) {
  const phases = snapshot.jumpers.reduce<Record<string, number>>((acc, j) => { acc[j.phase] = (acc[j.phase] || 0) + 1; return acc; }, {});
  const strongestWind = [...windRows].sort((a, b) => b.speedMph - a.speedMph)[0];
  metricsEl.innerHTML = `
    <div><strong>Time</strong><span>${snapshot.timeS.toFixed(0)} s</span></div>
    <div><strong>Freefall</strong><span>${phases.freefall || 0}</span></div>
    <div><strong>Deploying</strong><span>${phases.deploying || 0}</span></div>
    <div><strong>Canopy</strong><span>${phases.canopy || 0}</span></div>
    <div><strong>Landed</strong><span>${phases.landed || 0}</span></div>
    <div><strong>Strongest wind</strong><span>${strongestWind.altitudeFt.toLocaleString()} ft @ ${strongestWind.speedMph.toFixed(0)} mph</span></div>
    <div><strong>Max canopies &lt;1000 ft</strong><span>${s.maxOpenCanopiesBelow1000Ft}</span></div>
    <div><strong>Max canopies &lt;500 ft</strong><span>${s.maxOpenCanopiesBelow500Ft}</span></div>
    <div><strong>Min canopy horizontal sep</strong><span>${s.minHorizontalSeparationFt.toFixed(0)} ft</span></div>
    <div><strong>Fully-open range</strong><span>${s.fullyOpenAltitudeRangeFt.min.toFixed(0)}–${s.fullyOpenAltitudeRangeFt.max.toFixed(0)} ft</span></div>
    <div><strong>Congestion score</strong><span>${s.canopyCongestionScore}</span></div>
  `;
}

for (const input of [controls.seed, controls.numJumpers, controls.groupSwitch, controls.exitSeparationS, controls.fastFallFirst]) input.addEventListener('input', reset);
document.querySelector<HTMLButtonElement>('#reset')!.addEventListener('click', reset);
document.querySelector<HTMLButtonElement>('#pause')!.addEventListener('click', (event) => { paused = !paused; (event.currentTarget as HTMLButtonElement).textContent = paused ? 'Resume' : 'Pause'; });
document.querySelector<HTMLButtonElement>('#loadForecast')!.addEventListener('click', loadForecast);
document.querySelector<HTMLButtonElement>('#runMonteCarlo')!.addEventListener('click', runMonteCarloUi);

renderWindRows();
reset();
requestAnimationFrame(tick);
