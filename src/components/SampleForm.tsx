import { useState } from "react";
import type { DevStage } from "../types";
import { DEV_STAGES } from "../types";

export interface NewSampleInput {
  caseId: string;
  location: string;
  exposureStage: string;
  species: string;
  devStage: DevStage | "";
  sampledAt: string;
  preservation: string;
  note: string;
  massG: number;
}

interface Props {
  onCreate: (input: NewSampleInput) => string | null;
}

const empty = {
  caseId: "",
  location: "",
  exposureStage: "",
  species: "",
  devStage: "" as DevStage | "",
  sampledAt: "",
  preservation: "",
  note: "",
  massText: "",
};

/** 新增样本登记：登记齐全的样本才具备拆分资格 */
export default function SampleForm({ onCreate }: Props) {
  const [form, setForm] = useState(empty);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function submit() {
    const caseId = form.caseId.trim().toUpperCase();
    const mass = Number(form.massText);
    if (!caseId || !form.location.trim() || !form.sampledAt.trim()) {
      return;
    }
    if (!Number.isFinite(mass) || mass <= 0) return;
    const error = onCreate({
      caseId,
      location: form.location.trim(),
      exposureStage: form.exposureStage.trim(),
      species: form.species.trim(),
      devStage: form.devStage,
      sampledAt: form.sampledAt.trim(),
      preservation: form.preservation.trim(),
      note: form.note.trim(),
      massG: Math.round((mass + Number.EPSILON) * 100) / 100,
    });
    if (!error) setForm(empty);
  }

  const ready =
    form.caseId.trim() !== "" &&
    form.location.trim() !== "" &&
    form.sampledAt.trim() !== "" &&
    form.massText.trim() !== "" &&
    Number(form.massText) > 0;

  return (
    <section className="panel form-panel">
      <div className="heading">
        <div>
          <p>专业字段</p>
          <h2>新增样本登记</h2>
        </div>
        <button className="primary" disabled={!ready} onClick={submit}>
          保存样本
        </button>
      </div>
      <div className="field-grid">
        <label>
          <span>案件编号（归入案件）</span>
          <input
            placeholder="如 CASE-077"
            value={form.caseId}
            onChange={(e) => set("caseId", e.target.value)}
          />
        </label>
        <label>
          <span>采样地点</span>
          <input
            placeholder="填写采样地点"
            value={form.location}
            onChange={(e) => set("location", e.target.value)}
          />
        </label>
        <label>
          <span>尸体暴露阶段</span>
          <input
            placeholder="如 膨胀期"
            value={form.exposureStage}
            onChange={(e) => set("exposureStage", e.target.value)}
          />
        </label>
        <label>
          <span>昆虫种类</span>
          <input
            placeholder="如 丝光绿蝇（拆分必填）"
            value={form.species}
            onChange={(e) => set("species", e.target.value)}
          />
        </label>
        <label>
          <span>发育阶段（拆分必填）</span>
          <select
            value={form.devStage}
            onChange={(e) =>
              set("devStage", e.target.value as DevStage | "")
            }
          >
            <option value="">请选择发育阶段</option>
            {DEV_STAGES.map((stage) => (
              <option key={stage} value={stage}>
                {stage}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>采样时间</span>
          <input
            placeholder="如 2026-09-20 10:00"
            value={form.sampledAt}
            onChange={(e) => set("sampledAt", e.target.value)}
          />
        </label>
        <label>
          <span>保存方式（拆分必填）</span>
          <input
            placeholder="如 75%乙醇保存"
            value={form.preservation}
            onChange={(e) => set("preservation", e.target.value)}
          />
        </label>
        <label>
          <span>登记质量(g)</span>
          <input
            type="number"
            step="0.01"
            min="0.01"
            placeholder="如 10.00"
            value={form.massText}
            onChange={(e) => set("massText", e.target.value)}
          />
        </label>
        <label className="wide">
          <span>鉴定备注</span>
          <input
            placeholder="填写鉴定备注"
            value={form.note}
            onChange={(e) => set("note", e.target.value)}
          />
        </label>
      </div>
    </section>
  );
}
