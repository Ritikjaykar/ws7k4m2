import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const fmt = n => n == null ? '—' : `${Math.round(n).toLocaleString()} MW`;
const pct = n => n == null ? '—' : `${n.toFixed(1)}%`;

function WindMark() {
  return <img className="windmill" src="/windmill.svg" alt="Animated windmill" />;
}

function Atmosphere() {
  return <div className="atmosphere" aria-hidden="true"><span className="cloud cloud-a"/><span className="cloud cloud-b"/><span className="cloud cloud-c"/><span className="air air-a"/><span className="air air-b"/><span className="leaf leaf-a">⌁</span><span className="leaf leaf-b">⌁</span></div>;
}

function downloadCSV(points) {
  const header = 'deliveryTimeUtc,forecastMw,publishTimeUtc,actualMw,signedErrorMw,absoluteErrorMw\n';
  const body = points.map(p => [p.time, p.forecast ?? '', p.publishTime ?? '', p.actual ?? '', p.error ?? '', p.error == null ? '' : Math.abs(p.error)].join(',')).join('\n');
  const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([header + body], {type: 'text/csv'})); link.download = 'wind-verification-january-2026.csv'; link.click();
}

function Chart({ points }) {
  const shown = points.filter(p => p.forecast != null).slice(-24);
  if (!shown.length) return <div className="empty">No matched half-hour records.</div>;
  const max = Math.max(...shown.map(p => Math.max(p.actual, p.forecast))) * 1.1;
  const x = i => 24 + i * (552 / Math.max(1, shown.length - 1));
  const y = v => 220 - (v / max) * 190;
  const path = key => shown.map((p, i) => `${i ? 'L' : 'M'} ${x(i)} ${y(p[key])}`).join(' ');
  return <svg className="chart" viewBox="0 0 600 250" role="img" aria-label="Actual and forecast wind generation">
    <line x1="24" y1="220" x2="576" y2="220" className="axis" />
    <path d={path('actual')} className="line actual" /><path d={path('forecast')} className="line forecast" />
    <text x="24" y="244">{shown[0].time.slice(5, 10)}</text><text x="520" y="244">latest</text>
  </svg>;
}

function App() {
  const [data, setData] = useState(null); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const [from, setFrom] = useState('2026-01-01'); const [to, setTo] = useState('2026-01-31');
  const load = () => { setLoading(true); setError(''); fetch(`${API}/api/wind?start=${from}&end=${to}`).then(r => r.json()).then(setData).catch(() => setError('Could not reach the API. Start the backend on port 8000.')).finally(() => setLoading(false)); };
  useEffect(load, []);
  return <main><Atmosphere/><header><div><p className="eyebrow">UK POWER PROCUREMENT · ELEXON BMRS</p><div className="title-row"><h1>Wind signal</h1><WindMark/><span className="origin-air origin-air-a"/><span className="origin-air origin-air-b"/></div><p className="sub">A practical day-ahead view of renewable supply risk.</p></div><button onClick={load}>Update analysis</button></header>
    <section className="filters card"><div><label>Start date<input type="date" value={from} onChange={e => setFrom(e.target.value)}/></label></div><div><label>End date<input type="date" value={to} onChange={e => setTo(e.target.value)}/></label></div><div className="cutoff"><span>Decision rule</span><b>08:00 UTC, day before delivery</b></div></section>
    {loading && <div className="card">Loading Elexon records…</div>}{error && <div className="notice">{error}</div>}{data && <>
      <div className="source">Source: {data.source} · {data.metrics.count} matched half-hours · {data.decisionCutoff}</div>
      <section className="grid"><div className="card hero"><p className="label">LATEST ELIGIBLE FORECAST</p><strong>{fmt(data.latest?.forecast)}</strong><span>forecast wind generation</span><small>{data.latest?.time?.replace('T', ' ').slice(0, 16)} UTC · published {data.latest?.publishTime?.replace('T', ' ').slice(0, 16) || '—'}</small></div><div className="card"><p className="label">MAE</p><strong>{fmt(data.metrics.mae)}</strong><span>average absolute error</span></div><div className="card"><p className="label">RMSE</p><strong>{fmt(data.metrics.rmse)}</strong><span>penalises large misses</span></div><div className="card"><p className="label">BIAS</p><strong className={data.metrics.bias > 0 ? 'warn' : ''}>{fmt(data.metrics.bias)}</strong><span>positive means over-forecast</span></div><div className="card"><p className="label">WAPE</p><strong>{pct(data.metrics.wape)}</strong><span>error relative to actuals</span></div><div className="card"><p className="label">MAX ERROR</p><strong>{fmt(data.metrics.maxError)}</strong><span>largest absolute miss</span></div></section>
      <section className="quality card"><div><h2>Data quality & completeness</h2><p>Only forecasts available before the day-ahead cutoff are eligible.</p></div><div className="quality-stats"><b>{data.quality.matched}</b><span>matched</span><b>{data.quality.eligibleForecasts}</b><span>eligible forecasts</span><b>{data.quality.missingForecasts}</b><span>missing forecasts</span><b>{data.quality.missingActuals}</b><span>missing actuals</span></div></section>
      <details className="method card"><summary>How the analysis works</summary><p>Actual wind generation comes from FUELHH at 30-minute resolution. For each delivery interval, WINDFOR records published strictly before 08:00 UTC on the previous day are considered; the latest eligible publish is selected. Error is forecast minus actual. Total procurement volume is intentionally not estimated because demand and position data are outside this assignment’s data scope.</p></details>
      <section className="card chart-card"><div className="card-head"><div><h2>Forecast vs actual</h2><p>Last 24 matched half-hour slots · MW</p></div><div className="legend"><i className="actual-dot"/>Actual <i className="forecast-dot"/>Forecast</div></div><Chart points={data.points}/></section>
      <section className="card table-card"><div className="table-head"><div><h2>Verification intervals</h2><p>Selected day-ahead forecast against the national wind outturn.</p></div><button className="secondary" onClick={() => downloadCSV(data.points)}>Export CSV</button></div><table><thead><tr><th>Delivery time UTC</th><th>Selected forecast</th><th>Publish time</th><th>Actual</th><th>Error (F − A)</th></tr></thead><tbody>{data.points.slice(-12).reverse().map(p => <tr key={p.time}><td>{p.time.replace('T',' ').slice(0,16)}</td><td>{fmt(p.forecast)}</td><td>{p.publishTime?.replace('T',' ').slice(0,16) || '—'}</td><td>{fmt(p.actual)}</td><td className={Math.abs(p.error) > (data.metrics.mae || 0) ? 'warn' : ''}>{fmt(p.error)}</td></tr>)}</tbody></table></section>
    </>}</main>;
}
createRoot(document.getElementById('root')).render(<App />);
