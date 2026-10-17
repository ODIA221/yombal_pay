import { useState } from 'react';
import { dayLabel, fcfa, num } from '../lib/format.js';

// Ventes encaissées sur 7 jours : une seule série → une seule teinte, pas de légende (le titre la nomme).
export default function RevenueChart({ series }) {
  const [hover, setHover] = useState(null);
  const W = 560;
  const H = 180;
  const pad = { top: 22, bottom: 26, left: 4, right: 4 };
  const max = Math.max(...series.map((d) => d.xof), 1);
  const step = (W - pad.left - pad.right) / series.length;
  const barW = Math.min(36, step * 0.56);
  const y = (v) => pad.top + (H - pad.top - pad.bottom) * (1 - v / max);
  const peak = series.reduce((a, d, i) => (d.xof > series[a].xof ? i : a), 0);
  const base = H - pad.bottom;

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Ventes encaissées sur les 7 derniers jours" onMouseLeave={() => setHover(null)}>
        <line x1={0} x2={W} y1={base} y2={base} className="chart-axis" />
        {series.map((d, i) => {
          const cx = pad.left + step * i + step / 2;
          const top = y(d.xof);
          const h = Math.max(0, base - top);
          const r = Math.min(4, h / 2, barW / 2);
          const today = i === series.length - 1;
          return (
            <g key={d.day} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={0} aria-label={`${dayLabel(d.day)} : ${fcfa(d.xof)}, ${d.count} paiement(s)`}>
              {/* zone de survol plus large que la barre */}
              <rect x={cx - step / 2} y={pad.top - 10} width={step} height={base - pad.top + 10} fill="transparent" />
              {h > 0 && (
                <path
                  d={`M${cx - barW / 2},${base} V${top + r} Q${cx - barW / 2},${top} ${cx - barW / 2 + r},${top} H${cx + barW / 2 - r} Q${cx + barW / 2},${top} ${cx + barW / 2},${top + r} V${base} Z`}
                  className={`chart-bar ${today ? 'today' : ''} ${hover === i ? 'hover' : ''}`}
                />
              )}
              {(i === peak || today) && d.xof > 0 && hover === null && (
                <text x={cx} y={top - 7} textAnchor="middle" className="chart-value">
                  {num(d.xof / 1000)}k
                </text>
              )}
              <text x={cx} y={H - 8} textAnchor="middle" className={`chart-label ${today ? 'today' : ''}`}>
                {dayLabel(d.day)}
              </text>
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div className="chart-tip" style={{ left: `${((pad.left + step * hover + step / 2) / W) * 100}%` }}>
          <strong>{fcfa(series[hover].xof)}</strong>
          <span>
            {series[hover].count} paiement{series[hover].count > 1 ? 's' : ''} · {new Date(`${series[hover].day}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
          </span>
        </div>
      )}
    </div>
  );
}
