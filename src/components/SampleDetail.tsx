import { useMemo, useState } from "react";
import type { Sample } from "../types";
import {
  MIN_REMAIN_G,
  canSplit,
  latestReading,
  roundMass,
  splitReason,
} from "../domain";
import type { SplitResult } from "../domain";

interface Props {
  sample: Sample | null;
  chain: Sample[];
  blocked: { blocked: boolean; reason: string };
  onAddReading: (id: string, tempC: number, abnormal: boolean) => void;
  onSend: (id: string) => void;
  onSplit: (id: string, masses: number[]) => SplitResult;
}

function fieldRow(label: string, value: string, missing = false) {
  return (
    <div className="detail-field">
      <span>{label}</span>
      <b className={missing ? "missing" : ""}>{missing ? "未登记" : value}</b>
    </div>
  );
}

/** 单个样本详情卡片：温控记录、人工送检、拆分派生闭环入口 */
export default function SampleDetail({
  sample,
  chain,
  blocked,
  onAddReading,
  onSend,
  onSplit,
}: Props) {
  const [tempText, setTempText] = useState("");
  const [masses, setMasses] = useState<string[]>([""]);

  const parsedTotal = useMemo(
    () =>
      roundMass(
        masses.reduce((sum, m) => sum + (Number(m) || 0), 0)
      ),
    [masses]
  );

  if (!sample) {
    return (
      <section className="panel detail">
        <div className="heading">
          <div>
            <p>单个样本详情卡片</p>
            <h2>未选择样本</h2>
          </div>
        </div>
        <p className="chart-empty">点击左侧批次列表中的样本查看详情。</p>
      </section>
    );
  }

  const latest = latestReading(sample);
  const reason = splitReason(sample);
  const splittable = canSplit(sample);
  const maxTotal = roundMass(sample.remainingG - MIN_REMAIN_G);

  function submitReading(abnormal: boolean) {
    const value = Number(tempText);
    if (!Number.isFinite(value) || tempText.trim() === "") {
      setTempText("");
      return;
    }
    onAddReading(sample!.id, value, abnormal);
    setTempText("");
  }

  function updateMass(index: number, value: string) {
    setMasses((prev) => prev.map((m, i) => (i === index ? value : m)));
  }

  function submitSplit() {
    const nums = masses.map((m) => Number(m));
    const result = onSplit(sample!.id, nums);
    if (result.ok) setMasses([""]);
  }

  return (
    <section className="panel detail">
      <div className="heading">
        <div>
          <p>单个样本详情卡片</p>
          <h2>{sample.id}</h2>
        </div>
        <div className="badges">
          <span className="badge case">{sample.caseId}</span>
          {sample.parentId && (
            <span className="badge derived" title={sample.parentId}>
              派生于 {sample.parentId}
            </span>
          )}
          {sample.sent ? (
            <span className="badge sent">已送检</span>
          ) : blocked.blocked ? (
            <span className="badge blocked">暂停送检</span>
          ) : (
            <span className="badge ready">可送检</span>
          )}
        </div>
      </div>

      {chain.length > 0 && (
        <p className="chain">
          派生链：
          {[...chain].reverse().map((a) => (
            <span key={a.id} className="chain-node">{a.id}</span>
          ))}
          <span className="chain-node self">{sample.id}</span>
        </p>
      )}

      <div className="detail-grid">
        {fieldRow("采样地点", sample.location)}
        {fieldRow("尸体暴露阶段", sample.exposureStage)}
        {fieldRow("昆虫种类", sample.species, !sample.species.trim())}
        {fieldRow("发育阶段", sample.devStage, !sample.devStage)}
        {fieldRow("采样时间", sample.sampledAt)}
        {fieldRow("保存方式", sample.preservation, !sample.preservation.trim())}
        {fieldRow("登记质量", `${sample.massG.toFixed(2)} g`)}
        {fieldRow("母样余量", `${sample.remainingG.toFixed(2)} g`)}
      </div>
      <p className="detail-note">
        <span>鉴定备注</span>
        {sample.note || "—"}
      </p>

      <div className="detail-block">
        <h3>温度记录（{sample.readings.length}）</h3>
        {sample.readings.length > 0 && (
          <ul className="reading-list">
            {sample.readings.map((r) => (
              <li key={r.id} className={r.abnormal ? "abnormal" : ""}>
                <span>{new Date(r.at).toLocaleString("zh-CN")}</span>
                <b>{r.tempC.toFixed(1)}℃</b>
                <em>{r.abnormal ? "温控异常" : "正常"}</em>
              </li>
            ))}
          </ul>
        )}
        <div className="inline-form">
          <input
            type="number"
            step="0.1"
            placeholder="录入环境温度 ℃"
            value={tempText}
            onChange={(e) => setTempText(e.target.value)}
          />
          <button
            disabled={tempText.trim() === ""}
            onClick={() => submitReading(false)}
          >
            记录温度
          </button>
          <button
            className="danger"
            disabled={tempText.trim() === ""}
            onClick={() => submitReading(true)}
          >
            标记温控异常
          </button>
        </div>
        {latest && latest.abnormal && (
          <p className="block-hint">
            最新记录 {latest.tempC.toFixed(1)}℃ 异常：本样及全部派生样暂停送检；
            待温控复测正常后仅解除阻断，仍需人工点击送检。
          </p>
        )}
      </div>

      <div className="detail-block">
        <h3>送检</h3>
        {sample.sent ? (
          <p className="sent-hint">样本已送检，记录已锁定为已送检状态。</p>
        ) : (
          <>
            <button
              className="primary"
              disabled={blocked.blocked}
              onClick={() => onSend(sample.id)}
            >
              {blocked.blocked ? "暂停送检（温控阻断中）" : "人工送检"}
            </button>
            {blocked.blocked && <p className="block-hint">{blocked.reason}</p>}
            <p className="muted">复测正常只解除阻断，不代替人工送检。</p>
          </>
        )}
      </div>

      <div className="detail-block">
        <h3>拆分派生</h3>
        {!splittable ? (
          <p className="block-hint">不可拆分：{reason}</p>
        ) : (
          <>
            <p className="muted">
              可拆分总量 {maxTotal.toFixed(2)}g（母样余量{" "}
              {sample.remainingG.toFixed(2)}g，至少保留 {MIN_REMAIN_G.toFixed(2)}g）。
              子样自动归入案件 {sample.caseId}，并继承种类、发育阶段与保存方式。
            </p>
            <div className="split-rows">
              {masses.map((m, i) => (
                <label key={i} className="split-row">
                  <span>子样 {i + 1} 质量(g)</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="例如 1.50"
                    value={m}
                    onChange={(e) => updateMass(i, e.target.value)}
                  />
                  <button
                    className="ghost"
                    disabled={masses.length === 1}
                    onClick={() =>
                      setMasses((prev) => prev.filter((_, j) => j !== i))
                    }
                  >
                    移除
                  </button>
                </label>
              ))}
            </div>
            <div className="split-actions">
              <button
                className="ghost"
                onClick={() => setMasses((prev) => [...prev, ""])}
              >
                + 增加一份子样
              </button>
              <span className={parsedTotal > maxTotal ? "over" : ""}>
                合计 {parsedTotal.toFixed(2)}g / 上限 {maxTotal.toFixed(2)}g
              </span>
              <button
                className="primary"
                disabled={parsedTotal <= 0 || parsedTotal > maxTotal}
                onClick={submitSplit}
              >
                确认拆分
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
