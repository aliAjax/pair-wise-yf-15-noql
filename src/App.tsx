import { useEffect, useMemo, useState } from "react";
import "./styles.css";
import type { DevStage, Notice, Sample, UiState } from "./types";
import {
  ancestorsOf,
  blockedInfo,
  latestReading,
  nextCaseLetter,
  nextChildSeq,
  splitSample,
} from "./domain";
import type { SplitResult } from "./domain";
import { loadSamples, loadUi, saveSamples, saveUi } from "./storage";
import BatchList from "./components/BatchList";
import SampleForm from "./components/SampleForm";
import type { NewSampleInput } from "./components/SampleForm";
import TemperatureChart from "./components/TemperatureChart";
import SampleDetail from "./components/SampleDetail";

const project = {
  sourceNo: 5,
  id: "hxyfront-62003",
  port: 62003,
  title: "法医昆虫学样本记录",
  prompt:
    "记录采样地点、环境温度、尸体暴露阶段、昆虫种类、发育阶段、采样时间、保存方式和鉴定备注；支持样本批次筛选、温度记录图、案件样本关联、单样详情，以及拆分派生与温控阻断闭环。数据仅本地同步。",
};

let uidSeq = 0;
function uid(prefix: string): string {
  uidSeq += 1;
  return `${prefix}-${Date.now().toString(36)}-${uidSeq}`;
}

function App() {
  const [samples, setSamples] = useState<Sample[]>(loadSamples);
  const [ui, setUi] = useState<UiState>(loadUi);
  const [notice, setNotice] = useState<Notice | null>(null);

  // 本地数据同步：任何变更立即落 localStorage，刷新保留，无后台
  useEffect(() => saveSamples(samples), [samples]);
  useEffect(() => saveUi(ui), [ui]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(timer);
  }, [notice]);

  const byId = useMemo(() => {
    const map = new Map<string, Sample>();
    for (const s of samples) map.set(s.id, s);
    return map;
  }, [samples]);

  const selected =
    samples.find((s) => s.id === ui.selectedId) ?? samples[0] ?? null;
  const chain = selected ? ancestorsOf(selected, byId) : [];
  const blocked = selected
    ? blockedInfo(selected, byId)
    : { blocked: false, reason: "" };

  const metrics = useMemo(() => {
    const latestTemps = samples
      .map(latestReading)
      .filter((r): r is NonNullable<typeof r> => r !== null && !r.abnormal)
      .map((r) => r.tempC);
    const avg =
      latestTemps.length > 0
        ? `${(
            latestTemps.reduce((a, b) => a + b, 0) / latestTemps.length
          ).toFixed(1)}℃`
        : "—";
    const stages = new Set(
      samples.map((s) => s.devStage).filter(Boolean)
    ).size;
    const pending = samples.filter(
      (s) => !s.species.trim() || !s.devStage || !s.preservation.trim()
    ).length;
    return [
      { metric: "样本批次", value: String(samples.length) },
      { metric: "平均温度", value: avg },
      { metric: "发育阶段", value: `${stages}/4` },
      { metric: "待鉴定", value: String(pending) },
    ];
  }, [samples]);

  function toggleStage(stage: DevStage) {
    setUi((prev) => ({
      ...prev,
      stages: prev.stages.includes(stage)
        ? prev.stages.filter((s) => s !== stage)
        : [...prev.stages, stage],
    }));
  }

  function handleAddReading(id: string, tempC: number, abnormal: boolean) {
    const reading = { id: uid("r"), at: Date.now(), tempC, abnormal };
    setSamples((prev) =>
      prev.map((s) =>
        s.id === id ? { ...s, readings: [...s.readings, reading] } : s
      )
    );
    if (abnormal) {
      setNotice({
        kind: "err",
        text: `${id} 记录 ${tempC.toFixed(
          1
        )}℃ 并标记温控异常：该样及全部派生样暂停送检；复测正常后仅解除阻断，仍需人工送检。`,
      });
    } else {
      setNotice({
        kind: "ok",
        text: `${id} 已补记 ${tempC.toFixed(
          1
        )}℃ 正常复测；若最新异常已被覆盖则解除阻断（送检仍需人工触发）。`,
      });
    }
  }

  function handleSend(id: string) {
    const target = byId.get(id);
    if (!target) return;
    if (target.sent) return;
    const info = blockedInfo(target, byId);
    if (info.blocked) {
      setNotice({ kind: "err", text: `${id} ${info.reason}，无法送检。` });
      return;
    }
    setSamples((prev) =>
      prev.map((s) => (s.id === id ? { ...s, sent: true } : s))
    );
    setNotice({ kind: "ok", text: `${id} 已人工送检。` });
  }

  /** 拆分派生：校验不通过时整次拒绝、列表不变 */
  function handleSplit(id: string, masses: number[]): SplitResult {
    const parent = byId.get(id);
    if (!parent) return { ok: false, error: "样本不存在" };
    const seq = nextChildSeq(id, samples);
    const result = splitSample(
      parent,
      masses.map((massG, i) => ({ id: `${id}-S${seq + i}`, massG })),
      (i) => `${id}-S${seq + i}`,
      Date.now()
    );
    if (!result.ok || !result.children) {
      setNotice({ kind: "err", text: result.error ?? "拆分失败" });
      return result;
    }
    const children = result.children;
    const remaining = result.remainingG!;
    setSamples((prev) => [
      ...prev.map((s) => (s.id === id ? { ...s, remainingG: remaining } : s)),
      ...children,
    ]);
    setNotice({
      kind: "ok",
      text: `拆分成功：新增 ${children.length} 份子样（${children
        .map((c) => c.id)
        .join("、")}），均归入案件 ${parent.caseId}；母样余量核减为 ${remaining.toFixed(
        2
      )}g。`,
    });
    return result;
  }

  function handleCreate(input: NewSampleInput): string | null {
    const letter = nextCaseLetter(input.caseId, samples);
    const newId = `${input.caseId}-${letter}`;
    if (byId.has(newId)) return "编号冲突，请刷新后重试";
    const now = Date.now();
    const sample: Sample = {
      id: newId,
      caseId: input.caseId,
      location: input.location,
      exposureStage: input.exposureStage,
      species: input.species,
      devStage: input.devStage,
      sampledAt: input.sampledAt,
      preservation: input.preservation,
      note: input.note,
      massG: input.massG,
      remainingG: input.massG,
      parentId: null,
      sent: false,
      readings: [],
      createdAt: now,
    };
    setSamples((prev) => [...prev, sample]);
    setUi((prev) => ({ ...prev, selectedId: newId }));
    setNotice({
      kind: "ok",
      text: `已登记 ${newId}${
        input.species && input.devStage && input.preservation
          ? "，信息齐全，可拆分派生"
          : "，补齐种类/阶段/保存方式后方可拆分"
      }。`,
    });
    return null;
  }

  return (
    <main className="app">
      <section className="hero">
        <p>
          {project.id} · 源提示词{project.sourceNo} · Port {project.port}
        </p>
        <h1>{project.title}</h1>
        <span>{project.prompt}</span>
      </section>

      <section className="metrics">
        {metrics.map((item) => (
          <article key={item.metric}>
            <small>{item.metric}</small>
            <strong>{item.value}</strong>
          </article>
        ))}
      </section>

      {notice && (
        <div className={`notice ${notice.kind}`} role="status">
          {notice.text}
        </div>
      )}

      <section className="workspace">
        <BatchList
          samples={samples}
          byId={byId}
          selectedId={selected?.id ?? null}
          activeStages={ui.stages}
          onToggleStage={toggleStage}
          onSelect={(sid) =>
            setUi((prev) => ({ ...prev, selectedId: sid }))
          }
        />
      </section>

      <TemperatureChart sample={selected} />

      <SampleDetail
        sample={selected}
        chain={chain}
        blocked={blocked}
        onAddReading={handleAddReading}
        onSend={handleSend}
        onSplit={handleSplit}
      />

      <SampleForm onCreate={handleCreate} />
    </main>
  );
}

export default App;
