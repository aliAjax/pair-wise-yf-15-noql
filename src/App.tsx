import { useEffect, useMemo, useState } from "react";
import "./styles.css";

/* ---------------- 类型与常量 ---------------- */

const STAGES = ["卵", "幼虫", "蛹", "成虫"] as const;
type Stage = (typeof STAGES)[number];

interface TempReading {
  at: string; // 记录时间（datetime-local 字符串）
  c: number; // 环境温度 ℃
  ok: boolean; // true=温控正常复测，false=温控异常
}

interface Sample {
  id: string;
  caseId: string; // 所属案件编号，子样强制与母样一致
  location: string; // 采样地点
  exposure: string; // 尸体暴露阶段
  species: string; // 昆虫种类（空串=未登记）
  stage: Stage | ""; // 发育阶段
  sampledAt: string; // 采样时间
  preservation: string; // 保存方式（空串=未登记）
  note: string; // 鉴定备注
  mass: number; // 母样余量（克）
  parentId: string | null; // 拆分来源
  rootId: string; // 溯源根样
  sent: boolean; // 是否已人工送检
  temps: TempReading[]; // 温度记录（按时间追加）
  createdAt: string;
}

type FilterKind = "全部" | Stage;
type TabKind = "batch" | "case" | "new";
type Banner = { kind: "ok" | "error"; text: string } | null;

const STORE_KEY = "hxyfront-62003:samples:v1";
const UI_KEY = "hxyfront-62003:ui:v1";

const FILTERS: FilterKind[] = ["全部", ...STAGES];

/* ---------------- 工具函数 ---------------- */

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function nowLocalInput() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
}

function fmtAt(s: string) {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmtMass(n: number) {
  return `${(Math.round(n * 100) / 100).toFixed(2)} g`;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function caseLetter(n: number) {
  return n < 26 ? String.fromCharCode(65 + n) : `A${n - 25}`;
}

function latestTemp(s: Sample): TempReading | null {
  return s.temps.length ? s.temps[s.temps.length - 1] : null;
}

/** 沿母样链向上查找最近一个温控异常的样本（自身也计入），无则返回 null */
function blockerOf(s: Sample, byId: Map<string, Sample>): Sample | null {
  const seen = new Set<string>();
  let cur: Sample | undefined = s;
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    const latest = latestTemp(cur);
    if (latest && !latest.ok) return cur;
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return null;
}

function descendantsOf(id: string, childrenOf: Map<string, Sample[]>): Sample[] {
  const out: Sample[] = [];
  const walk = (pid: string) => {
    for (const ch of childrenOf.get(pid) ?? []) {
      out.push(ch);
      walk(ch.id);
    }
  };
  walk(id);
  return out;
}

interface SplitCheck {
  label: string;
  ok: boolean;
}

function splitChecks(s: Sample): SplitCheck[] {
  return [
    { label: "已登记昆虫种类", ok: s.species.trim() !== "" },
    { label: "已登记发育阶段", ok: s.stage !== "" },
    { label: "已登记保存方式", ok: s.preservation.trim() !== "" },
    { label: "母样余量大于 0", ok: s.mass > 0 },
  ];
}

/* ---------------- 演示种子数据 ---------------- */

function seedSamples(): Sample[] {
  return [
    {
      id: "CASE-042-A",
      caseId: "CASE-042",
      location: "室外草地",
      exposure: "膨胀期",
      species: "丝光绿蝇（Lucilia sericata）",
      stage: "幼虫",
      sampledAt: "2026-09-18T10:30",
      preservation: "75% 乙醇保存",
      note: "幼虫三龄，发育整齐",
      mass: 20,
      parentId: null,
      rootId: "CASE-042-A",
      sent: false,
      temps: [
        { at: "2026-09-18T10:30", c: 28.6, ok: true },
        { at: "2026-09-18T16:00", c: 29.4, ok: true },
        { at: "2026-09-19T09:00", c: 27.8, ok: true },
      ],
      createdAt: "2026-09-18T10:30",
    },
    {
      id: "CASE-042-B",
      caseId: "CASE-042",
      location: "阴影区域",
      exposure: "腐烂期",
      species: "",
      stage: "蛹",
      sampledAt: "2026-09-18T11:10",
      preservation: "冷冻 −20℃ 保存",
      note: "需复核种属",
      mass: 12,
      parentId: null,
      rootId: "CASE-042-B",
      sent: false,
      temps: [{ at: "2026-09-18T11:10", c: 24.1, ok: true }],
      createdAt: "2026-09-18T11:10",
    },
    {
      id: "CASE-051-A",
      caseId: "CASE-051",
      location: "水沟边缘",
      exposure: "干化期",
      species: "大头金蝇（Chrysomya megacephala）",
      stage: "成虫",
      sampledAt: "2026-09-17T15:20",
      preservation: "干燥针插保存",
      note: "已完成拍照",
      mass: 6,
      parentId: null,
      rootId: "CASE-051-A",
      sent: false,
      temps: [{ at: "2026-09-17T15:20", c: 26.5, ok: true }],
      createdAt: "2026-09-17T15:20",
    },
  ];
}

/* ---------------- 本地数据同步 ---------------- */

function loadSamples(): Sample[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) return parsed as Sample[];
    }
  } catch {
    /* 损坏时回退演示数据 */
  }
  return seedSamples();
}

function loadUI(): { filter: FilterKind; tab: TabKind; selectedId: string | null } {
  const fallback = { filter: "全部" as FilterKind, tab: "batch" as TabKind, selectedId: null };
  try {
    const raw = localStorage.getItem(UI_KEY);
    if (raw) return { ...fallback, ...(JSON.parse(raw) as object) };
  } catch {
    /* 忽略 */
  }
  return fallback;
}

/* ---------------- 温度记录图 ---------------- */

function TempChart({ readings }: { readings: TempReading[] }) {
  if (readings.length === 0) {
    return <p className="chart-empty">暂无温度记录，追加后在此绘制温度图。</p>;
  }
  const W = 340;
  const H = 132;
  const padL = 30;
  const padR = 12;
  const padT = 14;
  const padB = 26;
  const cs = readings.map((r) => r.c);
  const min = Math.min(...cs);
  const max = Math.max(...cs);
  const span = Math.max(max - min, 1);
  const x = (i: number) =>
    readings.length === 1
      ? (W + padL - padR) / 2
      : padL + (i * (W - padL - padR)) / (readings.length - 1);
  const y = (c: number) => padT + (1 - (c - min) / span) * (H - padT - padB);
  const points = readings.map((r, i) => `${x(i)},${y(r.c)}`).join(" ");

  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="温度记录图">
      <line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} className="chart-axis" />
      <line x1={padL} y1={padT} x2={padL} y2={H - padB} className="chart-axis" />
      <text x={4} y={y(max) + 4} className="chart-label">
        {max.toFixed(1)}
      </text>
      <text x={4} y={y(min) + 4} className="chart-label">
        {min.toFixed(1)}
      </text>
      <polyline points={points} className="chart-line" />
      {readings.map((r, i) => (
        <g key={`${r.at}-${i}`}>
          <circle
            cx={x(i)}
            cy={y(r.c)}
            r={r.ok ? 3.5 : 5}
            className={r.ok ? "chart-dot" : "chart-dot chart-dot-bad"}
          />
          <text x={x(i)} y={H - 8} textAnchor="middle" className="chart-label">
            {fmtAt(r.at).slice(5)}
          </text>
        </g>
      ))}
    </svg>
  );
}

/* ---------------- 拆分表单（闭环核心） ---------------- */

function SplitPanel({
  sample,
  onSplit,
}: {
  sample: Sample;
  onSplit: (parentId: string, masses: number[]) => boolean;
}) {
  const [rows, setRows] = useState<string[]>([""]);
  const checks = splitChecks(sample);
  const eligible = checks.every((c) => c.ok);
  const locked = sample.sent;

  const nums = rows.map((r) => (r.trim() === "" ? NaN : Number(r)));
  const validRows = nums.filter((n) => Number.isFinite(n) && n > 0);
  const sum = round2(validRows.reduce((a, b) => a + b, 0));
  const remainder = round2(sample.mass - sum);
  const rowsValid = nums.length > 0 && nums.every((n) => Number.isFinite(n) && n > 0);
  const reserveOk = sum > 0 && remainder > 0;

  const submit = () => {
    if (onSplit(sample.id, nums)) setRows([""]);
  };

  if (locked) {
    return (
      <div className="split">
        <h3>拆分派生</h3>
        <p className="muted">该样已人工送检、脱离在库保管，不可再拆分。</p>
      </div>
    );
  }

  return (
    <div className="split">
      <h3>拆分派生</h3>
      <ul className="checklist">
        {checks.map((c) => (
          <li key={c.label} className={c.ok ? "ok" : "bad"}>
            <span>{c.ok ? "✓" : "✗"}</span>
            {c.label}
          </li>
        ))}
      </ul>

      {!eligible ? (
        <p className="muted">登记信息不全或母样无余量，补齐后才可拆分；子样将归入原案件 {sample.caseId}。</p>
      ) : (
        <>
          <div className="split-rows">
            {rows.map((row, i) => (
              <div className="split-row" key={i}>
                <label>
                  <span>子样 {i + 1} 质量（g）</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={row}
                    placeholder="如 2.5"
                    onChange={(e) =>
                      setRows((prev) => prev.map((v, idx) => (idx === i ? e.target.value : v)))
                    }
                  />
                </label>
                {rows.length > 1 && (
                  <button
                    type="button"
                    className="mini"
                    onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}
                  >
                    移除
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="split-actions">
            <button
              type="button"
              className="mini"
              onClick={() => setRows((prev) => [...prev, ""])}
            >
              + 添加一份子样
            </button>
          </div>
          <p className="mass-calc">
            拟拆分合计 <b>{fmtMass(sum)}</b> ｜ 母样余量 {fmtMass(sample.mass)} → 拆分后{" "}
            <b className={reserveOk ? "reserve-ok" : "reserve-bad"}>{fmtMass(Math.max(remainder, 0))}</b>
          </p>
          <p className="muted">规则：每份须为正数；合计必须小于母样余量，至少留一份母样余量，否则整次拒绝、列表不变。</p>
          <button
            type="button"
            className="primary"
            disabled={!rowsValid || !reserveOk}
            onClick={submit}
          >
            提交拆分
          </button>
        </>
      )}
    </div>
  );
}

/* ---------------- 主应用 ---------------- */

function App() {
  const [samples, setSamples] = useState<Sample[]>(loadSamples);
  const initialUI = useMemo(loadUI, []);
  const [filter, setFilter] = useState<FilterKind>(initialUI.filter);
  const [tab, setTab] = useState<TabKind>(initialUI.tab);
  const [selectedId, setSelectedId] = useState<string | null>(initialUI.selectedId);
  const [banner, setBanner] = useState<Banner>(null);
  const [savedAt, setSavedAt] = useState<string>(() => fmtAt(new Date().toISOString()));

  /* 本地数据同步：样本与界面状态刷新保留 */
  useEffect(() => {
    localStorage.setItem(STORE_KEY, JSON.stringify(samples));
    setSavedAt(fmtAt(new Date().toISOString()));
  }, [samples]);

  useEffect(() => {
    localStorage.setItem(UI_KEY, JSON.stringify({ filter, tab, selectedId }));
  }, [filter, tab, selectedId]);

  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 6000);
    return () => clearTimeout(t);
  }, [banner]);

  const byId = useMemo(() => new Map(samples.map((s) => [s.id, s])), [samples]);
  const childrenOf = useMemo(() => {
    const m = new Map<string, Sample[]>();
    for (const s of samples) {
      if (s.parentId) m.set(s.parentId, [...(m.get(s.parentId) ?? []), s]);
    }
    return m;
  }, [samples]);

  const blockerById = useMemo(() => {
    const m = new Map<string, Sample | null>();
    for (const s of samples) m.set(s.id, blockerOf(s, byId));
    return m;
  }, [samples, byId]);

  const selected = selectedId ? byId.get(selectedId) ?? null : null;

  /* 指标 */
  const latestTemps = samples.map(latestTemp).filter((t): t is TempReading => t !== null);
  const avgTemp =
    latestTemps.length > 0
      ? latestTemps.reduce((a, t) => a + t.c, 0) / latestTemps.length
      : null;
  const pendingId = samples.filter((s) => s.species.trim() === "").length;

  const visibleSamples = useMemo(
    () => (filter === "全部" ? samples : samples.filter((s) => s.stage === filter)),
    [samples, filter]
  );

  const caseGroups = useMemo(() => {
    const m = new Map<string, Sample[]>();
    for (const s of samples) {
      if (!m.has(s.caseId)) m.set(s.caseId, []);
      m.get(s.caseId)!.push(s);
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [samples]);

  /* ---------- 动作 ---------- */

  const addSample = (draft: {
    caseId: string;
    location: string;
    exposure: string;
    species: string;
    stage: Stage | "";
    sampledAt: string;
    preservation: string;
    note: string;
    mass: number;
  }) => {
    const caseId = draft.caseId.trim().toUpperCase();
    if (!caseId || !draft.location.trim() || !(draft.mass > 0)) {
      setBanner({ kind: "error", text: "案件编号、采样地点和大于 0 的初始质量为必填。" });
      return;
    }
    const count = samples.filter((s) => s.caseId === caseId).length;
    const id = `${caseId}-${caseLetter(count)}`;
    if (byId.has(id)) {
      setBanner({ kind: "error", text: `编号 ${id} 已存在，请检查案件编号。` });
      return;
    }
    const s: Sample = {
      id,
      caseId,
      location: draft.location.trim(),
      exposure: draft.exposure.trim(),
      species: draft.species.trim(),
      stage: draft.stage,
      sampledAt: draft.sampledAt || nowLocalInput(),
      preservation: draft.preservation.trim(),
      note: draft.note.trim(),
      mass: round2(draft.mass),
      parentId: null,
      rootId: id,
      sent: false,
      temps: [],
      createdAt: new Date().toISOString(),
    };
    setSamples((prev) => [...prev, s]);
    setSelectedId(id);
    setTab("batch");
    setBanner({ kind: "ok", text: `已登记新样本批次 ${id}。` });
  };

  /** 返回 true=拆分成功；false=整次拒绝，列表保持不变 */
  const performSplit = (parentId: string, masses: number[]): boolean => {
    const parent = byId.get(parentId);
    if (!parent) return false;
    const checks = splitChecks(parent);
    if (!checks.every((c) => c.ok)) {
      setBanner({
        kind: "error",
        text: `拆分被整次拒绝：${checks
          .filter((c) => !c.ok)
          .map((c) => c.label)} 未满足，列表保持不变。`,
      });
      return false;
    }
    if (parent.sent) {
      setBanner({ kind: "error", text: "拆分被整次拒绝：母样已送检，列表保持不变。" });
      return false;
    }
    if (masses.length === 0 || masses.some((n) => !Number.isFinite(n) || n <= 0)) {
      setBanner({
        kind: "error",
        text: "拆分被整次拒绝：每份子样质量必须是大于 0 的数字，列表保持不变。",
      });
      return false;
    }
    const sum = round2(masses.reduce((a, b) => a + b, 0));
    if (sum >= parent.mass - 1e-9) {
      setBanner({
        kind: "error",
        text: `拆分被整次拒绝：子样合计 ${fmtMass(sum)} 未给母样 ${fmtMass(
          parent.mass
        )} 保留正余量（至少留一份母样余量），列表保持不变。`,
      });
      return false;
    }

    const now = nowLocalInput();
    const existing = childrenOf.get(parentId)?.length ?? 0;
    const kids: Sample[] = masses.map((m, i) => ({
      id: `${parentId}-${existing + i + 1}`,
      caseId: parent.caseId, // 子样归入原案件
      location: parent.location,
      exposure: parent.exposure,
      species: parent.species,
      stage: parent.stage,
      sampledAt: now,
      preservation: parent.preservation,
      note: `由 ${parentId} 拆分派生`,
      mass: round2(m),
      parentId: parent.id,
      rootId: parent.rootId,
      sent: false,
      temps: [],
      createdAt: new Date().toISOString(),
    }));

    setSamples((prev) =>
      prev.map((s) => (s.id === parentId ? { ...s, mass: round2(s.mass - sum) } : s)).concat(kids)
    );
    const blockedHint = blockerById.get(parentId)
      ? "母样链存在温控异常，子样已同步暂停送检。"
      : "子样在库待人工送检。";
    setBanner({
      kind: "ok",
      text: `拆分成功：母样 ${parentId} 保留余量 ${fmtMass(
        round2(parent.mass - sum)
      )}，新增子样 ${kids.map((k) => k.id).join("、")}，均归入案件 ${parent.caseId}。${blockedHint}`,
    });
    return true;
  };

  const addTemp = (id: string, c: number, ok: boolean) => {
    if (!Number.isFinite(c)) {
      setBanner({ kind: "error", text: "请填写有效温度。" });
      return;
    }
    const target = byId.get(id);
    if (!target) return;

    // 变更前：哪些样本正被该样本阻断 / 该样本是否本就异常
    const beforeBlocked = new Set(
      samples.filter((s) => blockerById.get(s.id)?.id === id).map((s) => s.id)
    );
    const wasAnomaly = (() => {
      const l = latestTemp(target);
      return !!(l && !l.ok);
    })();

    setSamples((prev) =>
      prev.map((s) =>
        s.id === id ? { ...s, temps: [...s.temps, { at: nowLocalInput(), c, ok }] } : s
      )
    );

    if (!ok) {
      const count = descendantsOf(id, childrenOf).length;
      setBanner({
        kind: "error",
        text: `温控异常已记录：${id}${
          count > 0 ? ` 及其 ${count} 份子/孙样` : ""
        }全部暂停送检；复测正常前不得送检。`,
      });
    } else if (wasAnomaly) {
      // 复测后重新计算：仅统计因本样本而阻断、且复测后阻断消失的样本
      const next = samples.map((s) =>
        s.id === id ? { ...s, temps: [...s.temps, { at: nowLocalInput(), c, ok }] } : s
      );
      const nextById = new Map(next.map((s) => [s.id, s]));
      let unblocked = 0;
      for (const sid of beforeBlocked) {
        const s = nextById.get(sid);
        if (s && blockerOf(s, nextById) === null) unblocked++;
      }
      setBanner({
        kind: "ok",
        text: `复测正常：已解除 ${unblocked} 份样本的送检阻断。复测只解除阻断，不代替人工送检，请手动送检。`,
      });
    } else {
      setBanner({ kind: "ok", text: `${id} 温度记录 ${c}℃（正常）已追加。` });
    }
  };

  const sendForTesting = (id: string) => {
    const s = byId.get(id);
    if (!s) return;
    const blocker = blockerById.get(id);
    if (blocker) {
      setBanner({
        kind: "error",
        text: `${id} 暂停送检：温控异常来源为 ${blocker.id}（${fmtAt(
          latestTemp(blocker)!.at
        )}），复测正常解除阻断后再人工送检。`,
      });
      return;
    }
    if (s.sent) return;
    setSamples((prev) => prev.map((x) => (x.id === id ? { ...x, sent: true } : x)));
    setBanner({ kind: "ok", text: `${id} 已人工送检，进入实验室检测流程。` });
  };

  const exportSummary = () => {
    const blob = new Blob([JSON.stringify(samples, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `法医昆虫学样本摘要-${fmtAt(new Date().toISOString()).replace(/[: ]/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const resetDemo = () => {
    const seed = seedSamples();
    setSamples(seed);
    setSelectedId(null);
    setFilter("全部");
    setTab("batch");
    setBanner({ kind: "ok", text: "已恢复演示数据。" });
  };

  const statusOf = (s: Sample): { cls: string; text: string } => {
    if (s.sent) return { cls: "st-sent", text: "已送检" };
    if (blockerById.get(s.id)) return { cls: "st-block", text: "暂停送检" };
    return { cls: "st-keep", text: "在库" };
  };

  return (
    <main className="app">
      <section className="hero">
        <p>hxyfront-62003 · 源提示词5 · Port 62003</p>
        <h1>法医昆虫学样本记录</h1>
        <span>
          样本批次列表、发育阶段筛选、温度记录图、案件样本关联与详情卡片；支持拆分派生闭环：已登记种类、阶段、保存方式且有母样余量才可拆分，子样归入原案件，母样温控异常全部暂停送检，复测正常仅解除阻断、送检仍须人工操作。数据仅保存在本地。
        </span>
      </section>

      <section className="metrics">
        <article>
          <small>样本批次</small>
          <strong>{samples.length}</strong>
        </article>
        <article>
          <small>平均温度</small>
          <strong>{avgTemp === null ? "—" : `${avgTemp.toFixed(1)}℃`}</strong>
        </article>
        <article>
          <small>已登记发育阶段</small>
          <strong>{samples.filter((s) => s.stage !== "").length}</strong>
        </article>
        <article>
          <small>待鉴定</small>
          <strong>{pendingId}</strong>
        </article>
      </section>

      <div className="syncbar">
        <span className="sync-dot" />
        本地数据同步：{savedAt} 已保存（刷新保留）
        <button type="button" className="linklike" onClick={resetDemo}>
          恢复演示数据
        </button>
      </div>

      {banner && (
        <div className={`banner ${banner.kind === "error" ? "banner-error" : "banner-ok"}`}>
          {banner.text}
        </div>
      )}

      <section className="workspace workspace-3">
        <aside className="panel">
          <h2>发育阶段筛选</h2>
          <div className="chips">
            {FILTERS.map((item) => (
              <button
                key={item}
                className={filter === item ? "chip-on" : ""}
                onClick={() => setFilter(item)}
              >
                {item}
              </button>
            ))}
          </div>
          <p className="muted filter-note">
            当前：{filter}（{visibleSamples.length} 份）
          </p>
        </aside>

        <section className="panel main-panel">
          <div className="tabs">
            <button className={tab === "batch" ? "tab-on" : ""} onClick={() => setTab("batch")}>
              样本批次
            </button>
            <button className={tab === "case" ? "tab-on" : ""} onClick={() => setTab("case")}>
              案件样本关联
            </button>
            <button className={tab === "new" ? "tab-on" : ""} onClick={() => setTab("new")}>
              新增记录
            </button>
            <button type="button" className="export-btn" onClick={exportSummary}>
              导出摘要
            </button>
          </div>

          {tab === "batch" && (
            <div className="records">
              {visibleSamples.length === 0 && <p className="muted">该发育阶段暂无样本。</p>}
              {visibleSamples.map((s, index) => {
                const st = statusOf(s);
                return (
                  <article
                    key={s.id}
                    className={selectedId === s.id ? "rec rec-on" : "rec"}
                    onClick={() => setSelectedId(s.id)}
                  >
                    <b>{String(index + 1).padStart(2, "0")}</b>
                    <div>
                      <h3>
                        {s.id}
                        {s.parentId && <em className="tag tag-child">派生←{s.parentId}</em>}
                      </h3>
                      <p>
                        {[
                          s.caseId,
                          s.location,
                          s.species || "种类未登记",
                          s.stage || "阶段未登记",
                          s.preservation || "保存方式未登记",
                          `余量 ${fmtMass(s.mass)}`,
                        ].join(" · ")}
                      </p>
                    </div>
                    <span className={`status ${st.cls}`}>{st.text}</span>
                  </article>
                );
              })}
            </div>
          )}

          {tab === "case" && (
            <div className="cases">
              {caseGroups.map(([caseId, list]) => {
                const roots = list.filter((s) => !s.parentId || !byId.get(s.parentId));
                const renderNode = (s: Sample, depth: number) => {
                  const st = statusOf(s);
                  return (
                    <div key={s.id}>
                      <div
                        className="case-row"
                        style={{ paddingLeft: 12 + depth * 18 }}
                        onClick={() => setSelectedId(s.id)}
                      >
                        <span className={depth > 0 ? "tree-mark" : ""}>{depth > 0 ? "└" : ""}</span>
                        <b>{s.id}</b>
                        <span className="muted">
                          {s.species || "种类未登记"} · {s.stage || "阶段未登记"} · 余量{" "}
                          {fmtMass(s.mass)}
                        </span>
                        <span className={`status ${st.cls}`}>{st.text}</span>
                      </div>
                      {(childrenOf.get(s.id) ?? []).map((ch) => renderNode(ch, depth + 1))}
                    </div>
                  );
                };
                return (
                  <article className="case-card" key={caseId}>
                    <h3>
                      案件 {caseId}
                      <small>
                        {" "}
                        {list.length} 份样本（含 {list.length - roots.length} 份拆分子样）
                      </small>
                    </h3>
                    {roots.map((r) => renderNode(r, 0))}
                  </article>
                );
              })}
            </div>
          )}

          {tab === "new" && <NewSampleForm onAdd={addSample} />}
        </section>

        <section className="panel detail-panel">
          {selected ? (
            <DetailCard
              key={selected.id}
              sample={selected}
              blocker={blockerById.get(selected.id) ?? null}
              blockerTemp={blockerById.get(selected.id) ? latestTemp(blockerById.get(selected.id)!) : null}
              onAddTemp={addTemp}
              onSend={sendForTesting}
              onSplit={performSplit}
            />
          ) : (
            <div>
              <h2>样本详情卡片</h2>
              <p className="muted">在左侧批次列表或案件关联中选择样本，查看温度图、送检状态与拆分派生。</p>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

/* ---------------- 详情卡片 ---------------- */

function DetailCard({
  sample,
  blocker,
  blockerTemp,
  onAddTemp,
  onSend,
  onSplit,
}: {
  sample: Sample;
  blocker: Sample | null;
  blockerTemp: TempReading | null;
  onAddTemp: (id: string, c: number, ok: boolean) => void;
  onSend: (id: string) => void;
  onSplit: (parentId: string, masses: number[]) => boolean;
}) {
  const [tempVal, setTempVal] = useState("");
  const [tempOk, setTempOk] = useState("正常");
  const latest = latestTemp(sample);

  return (
    <div className="detail">
      <div className="detail-head">
        <h2>{sample.id}</h2>
        <span className={sample.sent ? "status st-sent" : blocker ? "status st-block" : "status st-keep"}>
          {sample.sent ? "已送检" : blocker ? "暂停送检" : "在库"}
        </span>
      </div>
      {sample.parentId && (
        <p className="muted">
          派生母样：{sample.parentId} ｜ 溯源根样：{sample.rootId} ｜ 归属案件：{sample.caseId}
        </p>
      )}

      <dl className="kv">
        <div>
          <dt>所属案件</dt>
          <dd>{sample.caseId}</dd>
        </div>
        <div>
          <dt>采样地点</dt>
          <dd>{sample.location}</dd>
        </div>
        <div>
          <dt>暴露阶段</dt>
          <dd>{sample.exposure || "—"}</dd>
        </div>
        <div>
          <dt>采样时间</dt>
          <dd>{fmtAt(sample.sampledAt)}</dd>
        </div>
        <div>
          <dt>昆虫种类</dt>
          <dd>{sample.species || "未登记"}</dd>
        </div>
        <div>
          <dt>发育阶段</dt>
          <dd>{sample.stage || "未登记"}</dd>
        </div>
        <div>
          <dt>保存方式</dt>
          <dd>{sample.preservation || "未登记"}</dd>
        </div>
        <div>
          <dt>母样余量</dt>
          <dd>{fmtMass(sample.mass)}</dd>
        </div>
        <div className="kv-wide">
          <dt>鉴定备注</dt>
          <dd>{sample.note || "—"}</dd>
        </div>
      </dl>

      <div className="detail-block">
        <h3>
          温度记录图
          {latest && (
            <small className={latest.ok ? "temp-ok" : "temp-bad"}>
              {" "}
              最新 {latest.c}℃ · {latest.ok ? "正常" : "异常"}
            </small>
          )}
        </h3>
        <TempChart readings={sample.temps} />
        <div className="temp-form">
          <input
            type="number"
            step="0.1"
            placeholder="温度 ℃"
            value={tempVal}
            onChange={(e) => setTempVal(e.target.value)}
          />
          <select value={tempOk} onChange={(e) => setTempOk(e.target.value)}>
            <option>正常</option>
            <option>异常</option>
          </select>
          <button
            type="button"
            onClick={() => {
              const v = Number(tempVal);
              if (Number.isFinite(v)) {
                onAddTemp(sample.id, v, tempOk === "正常");
                setTempVal("");
              }
            }}
          >
            追加记录
          </button>
        </div>
        {blocker && (
          <p className="block-note">
            温控异常阻断：来源 {blocker.id}（{blockerTemp ? `${blockerTemp.c}℃ @ ${fmtAt(blockerTemp.at)}` : ""}
            ）。该链上样本全部暂停送检；复测正常只解除阻断，不代替人工送检。
          </p>
        )}
      </div>

      <div className="detail-block">
        <h3>送检</h3>
        {sample.sent ? (
          <p className="muted">已送检，保管链已转移。</p>
        ) : blocker ? (
          <button type="button" className="primary" disabled>
            暂停送检
          </button>
        ) : (
          <button type="button" className="primary" onClick={() => onSend(sample.id)}>
            人工送检
          </button>
        )}
      </div>

      <div className="detail-block">
        <SplitPanel sample={sample} onSplit={onSplit} />
      </div>
    </div>
  );
}

/* ---------------- 新增记录表单 ---------------- */

function NewSampleForm({
  onAdd,
}: {
  onAdd: (d: {
    caseId: string;
    location: string;
    exposure: string;
    species: string;
    stage: Stage | "";
    sampledAt: string;
    preservation: string;
    note: string;
    mass: number;
  }) => void;
}) {
  const blank = () => ({
    caseId: "",
    location: "",
    exposure: "",
    species: "",
    stage: "" as Stage | "",
    sampledAt: nowLocalInput(),
    preservation: "",
    note: "",
    mass: "",
  });
  const [f, setF] = useState(blank);
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  return (
    <form
      className="new-form"
      onSubmit={(e) => {
        e.preventDefault();
        onAdd({
          caseId: f.caseId,
          location: f.location,
          exposure: f.exposure,
          species: f.species,
          stage: f.stage,
          sampledAt: f.sampledAt,
          preservation: f.preservation,
          note: f.note,
          mass: Number(f.mass),
        });
        setF(blank());
      }}
    >
      <div className="field-grid">
        <label>
          <span>案件编号 *</span>
          <input value={f.caseId} placeholder="如 CASE-060" onChange={(e) => set("caseId", e.target.value)} />
        </label>
        <label>
          <span>采样地点 *</span>
          <input value={f.location} onChange={(e) => set("location", e.target.value)} />
        </label>
        <label>
          <span>尸体暴露阶段</span>
          <input value={f.exposure} placeholder="如 膨胀期" onChange={(e) => set("exposure", e.target.value)} />
        </label>
        <label>
          <span>采样时间</span>
          <input type="datetime-local" value={f.sampledAt} onChange={(e) => set("sampledAt", e.target.value)} />
        </label>
        <label>
          <span>昆虫种类</span>
          <input value={f.species} onChange={(e) => set("species", e.target.value)} />
        </label>
        <label>
          <span>发育阶段</span>
          <select value={f.stage} onChange={(e) => set("stage", e.target.value)}>
            <option value="">未登记</option>
            {STAGES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>保存方式</span>
          <input value={f.preservation} placeholder="如 乙醇保存" onChange={(e) => set("preservation", e.target.value)} />
        </label>
        <label>
          <span>初始质量（g）*</span>
          <input type="number" min="0" step="0.01" value={f.mass} onChange={(e) => set("mass", e.target.value)} />
        </label>
        <label className="field-wide">
          <span>鉴定备注</span>
          <textarea rows={2} value={f.note} onChange={(e) => set("note", e.target.value)} />
        </label>
      </div>
      <button type="submit" className="primary">
        保存记录
      </button>
      <p className="muted">种类、阶段、保存方式可先留空，但未登记齐全且无正余量的样本不能拆分。</p>
    </form>
  );
}

export default App;
