import type { DevStage, Sample } from "../types";
import { DEV_STAGES } from "../types";
import { blockedInfo } from "../domain";

interface Props {
  samples: Sample[];
  byId: Map<string, Sample>;
  selectedId: string | null;
  activeStages: DevStage[];
  onToggleStage: (stage: DevStage) => void;
  onSelect: (id: string) => void;
}

function statusOf(s: Sample, blocked: boolean) {
  if (s.sent) return { text: "已送检", cls: "sent" };
  if (blocked) return { text: "温控阻断", cls: "blocked" };
  return { text: "在库", cls: "stock" };
}

/** 样本批次列表：发育阶段筛选 + 按案件关联分组 */
export default function BatchList({
  samples,
  byId,
  selectedId,
  activeStages,
  onToggleStage,
  onSelect,
}: Props) {
  const filtered =
    activeStages.length === 0
      ? samples
      : samples.filter((s) => s.devStage && activeStages.includes(s.devStage));

  const groups = new Map<string, Sample[]>();
  for (const s of filtered) {
    const list = groups.get(s.caseId) ?? [];
    list.push(s);
    groups.set(s.caseId, list);
  }
  const caseIds = [...groups.keys()].sort();

  return (
    <>
      <aside className="panel filter-panel">
        <h2>发育阶段筛选</h2>
        <div className="chips">
          {DEV_STAGES.map((stage) => (
            <button
              key={stage}
              className={activeStages.includes(stage) ? "active" : ""}
              onClick={() => onToggleStage(stage)}
            >
              {stage}
            </button>
          ))}
        </div>
        <p className="muted">
          {activeStages.length === 0
            ? "未选阶段：显示全部样本（刷新后保留）"
            : `已选：${activeStages.join("、")}`}
        </p>
      </aside>

      <section className="panel list-panel">
        <div className="heading">
          <div>
            <p>样本批次 · 案件关联</p>
            <h2>案件样本分组（{filtered.length}）</h2>
          </div>
        </div>
        <div className="case-groups">
          {caseIds.length === 0 && (
            <p className="chart-empty">当前筛选下没有样本。</p>
          )}
          {caseIds.map((caseId) => (
            <article key={caseId} className="case-group">
              <header>
                <h3>{caseId}</h3>
                <span>{groups.get(caseId)!.length} 份关联样本</span>
              </header>
              <div className="records">
                {groups.get(caseId)!.map((s) => {
                  const info = blockedInfo(s, byId);
                  const status = statusOf(s, info.blocked);
                  return (
                    <article
                      key={s.id}
                      className={
                        "record-row " +
                        (selectedId === s.id ? "selected" : "")
                      }
                      onClick={() => onSelect(s.id)}
                    >
                      <div className="record-main">
                        <h4>
                          {s.id}
                          {s.parentId && <i className="derived-tag">子样</i>}
                        </h4>
                        <p>
                          {s.species || "种类未登记"} ·{" "}
                          {s.devStage || "阶段未登记"} ·{" "}
                          {s.preservation || "保存方式未登记"} · 余量{" "}
                          {s.remainingG.toFixed(2)}g
                        </p>
                      </div>
                      <span className={`status ${status.cls}`}>
                        {status.text}
                      </span>
                    </article>
                  );
                })}
              </div>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
