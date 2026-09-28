// Grafico a barre SVG, nessuna libreria. Colore verde (var --primary via currentColor).
interface BarChartProps {
  data: number[];
  labels?: string[];
  maxVal?: number;
  /** Mostra una etichetta sull'asse X ogni N barre (0 = nessuna etichetta). */
  labelEvery?: number;
}

export function BarChart({ data, labels = [], maxVal, labelEvery = 5 }: BarChartProps) {
  const W = 600, H = 200, left = 45, right = 590, top = 15, bottom = 170;
  const max = maxVal ?? Math.max(1, ...data);
  const n = data.length || 1;
  const slot = (right - left) / n;
  const barW = slot * 0.65;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block text-primary">
      <line x1={left} y1={bottom} x2={right} y2={bottom} stroke="#e2e6ea" />
      <line x1={left} y1={top} x2={left} y2={bottom} stroke="#e2e6ea" />
      <text x={10} y={19} className="fill-gray-400" fontSize={10}>{max}</text>
      <text x={10} y={bottom + 4} className="fill-gray-400" fontSize={10}>0</text>
      {data.map((v, i) => {
        const h = (v / max) * (bottom - top);
        const x = left + i * slot + (slot - barW) / 2;
        const y = bottom - h;
        const label = labels[i] ?? String(i + 1);
        // Etichette diradate sull'asse X: l'ultima barra è sempre etichettata.
        const showLabel = labelEvery > 0 && (i % labelEvery === 0 || i === n - 1);
        return (
          <g key={i}>
            <rect x={x.toFixed(1)} y={y.toFixed(1)} width={barW.toFixed(1)} height={h.toFixed(1)} fill="currentColor" opacity={0.85}>
              <title>{`${label}: ${v}`}</title>
            </rect>
            {showLabel && (
              <text
                x={(x + barW / 2).toFixed(1)}
                y={bottom + 14}
                textAnchor="middle"
                className="fill-gray-400"
                fontSize={9}
              >
                {label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
