import type { Sample } from "../types";

interface Props {
  sample: Sample | null;
}

function hhmm(at: number): string {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes()
  ).padStart(2, "0")}`;
}

/** 温度记录图：纯 SVG 折线，异常点红色标记，无第三方图表依赖 */
export default function TemperatureChart({ sample }: Props) {
  const W = 680;
  const H = 250;
  const PAD_L = 46;
  const PAD_R = 18;
  const PAD_T = 22;
  const PAD_B = 34;

  const body = (
    <p className="chart-empty">
      {sample
        ? `${sample.id} 暂无温度记录，可在详情卡片录入。`
        : "请在批次列表中选择样本查看温度记录图。"}
    </p>
  );

  if (!sample || sample.readings.length === 0) {
    return (
      <section className="panel">
        <div className="heading">
          <div>
            <p>温度记录图</p>
            <h2>{sample ? sample.id : "未选择样本"}</h2>
          </div>
        </div>
        <div className="chart">{body}</div>
      </section>
    );
  }

  const readings = sample.readings;
  const temps = readings.map((r) => r.tempC);
  let minT = Math.min(...temps);
  let maxT = Math.max(...temps);
  if (minT === maxT) {
    minT -= 1;
    maxT += 1;
  }
  const padT = (maxT - minT) * 0.2;
  minT -= padT;
  maxT += padT;

  const times = readings.map((r) => r.at);
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);

  const x = (at: number) =>
    readings.length === 1
      ? (PAD_L + W - PAD_R) / 2
      : PAD_L +
        ((at - minTime) / (maxTime - minTime)) * (W - PAD_L - PAD_R);
  const y = (temp: number) =>
    PAD_T + (1 - (temp - minT) / (maxT - minT)) * (H - PAD_T - PAD_B);

  const points = readings.map((r) => `${x(r.at)},${y(r.tempC)}`).join(" ");
  const gridN = 4;
  const gridValues = Array.from(
    { length: gridN + 1 },
    (_, i) => minT + ((maxT - minT) * i) / gridN
  );

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>温度记录图</p>
          <h2>{sample.id} · 共 {readings.length} 条记录</h2>
        </div>
        <span className="legend">
          <i className="dot normal" /> 正常
          <i className="dot abnormal" /> 温控异常
        </span>
      </div>
      <div className="chart">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="温度记录折线图">
          {gridValues.map((v) => (
            <g key={v.toFixed(1)}>
              <line
                x1={PAD_L}
                x2={W - PAD_R}
                y1={y(v)}
                y2={y(v)}
                className="grid-line"
              />
              <text x={PAD_L - 8} y={y(v) + 4} className="axis-label" textAnchor="end">
                {v.toFixed(1)}
              </text>
            </g>
          ))}
          {readings.length > 1 && (
            <polyline points={points} fill="none" className="temp-line" />
          )}
          {readings.map((r) => (
            <g key={r.id}>
              <circle
                cx={x(r.at)}
                cy={y(r.tempC)}
                r={r.abnormal ? 6 : 4}
                className={r.abnormal ? "temp-point abnormal" : "temp-point"}
              />
              <text x={x(r.at)} y={H - PAD_B + 20} className="axis-label" textAnchor="middle">
                {hhmm(r.at)}
              </text>
              <text x={x(r.at)} y={y(r.tempC) - 10} className="temp-value" textAnchor="middle">
                {r.tempC.toFixed(1)}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </section>
  );
}
