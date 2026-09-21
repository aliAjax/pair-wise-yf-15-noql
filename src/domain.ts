import type { DevStage, Sample } from "./types";

/** 质量精度：0.01g（厘克），避免浮点误差 */
export const MIN_REMAIN_G = 0.01;
export const MASS_EPSILON = 1e-6;

export function roundMass(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** 拆分准入：已登记种类、阶段、保存方式，且母样余量足以再保留一份 */
export function splitReason(sample: Sample): string | null {
  if (!sample.species.trim()) return "尚未登记昆虫种类";
  if (!sample.devStage) return "尚未登记发育阶段";
  if (!sample.preservation.trim()) return "尚未登记保存方式";
  if (sample.remainingG <= MIN_REMAIN_G + MASS_EPSILON)
    return `母样余量不足（需至少保留 ${MIN_REMAIN_G.toFixed(2)}g）`;
  return null;
}

export function canSplit(sample: Sample): boolean {
  return splitReason(sample) === null;
}

export interface SplitDraft {
  id: string;
  massG: number;
}

export interface SplitResult {
  ok: boolean;
  error?: string;
  children?: Sample[];
  remainingG?: number;
}

/**
 * 拆分派生：原子校验 + 提交。
 * 任一子样质量非法、或合计超过“母样余量 - 必保留余量”，
 * 则整次拒绝，返回错误，调用方保持列表不变。
 */
export function splitSample(
  parent: Sample,
  drafts: SplitDraft[],
  nextId: (index: number) => string,
  now: number
): SplitResult {
  const gate = splitReason(parent);
  if (gate) return { ok: false, error: gate };
  if (drafts.length === 0)
    return { ok: false, error: "至少需要添加一份子样" };

  const masses: number[] = [];
  for (const draft of drafts) {
    const mass = roundMass(draft.massG);
    if (!Number.isFinite(mass) || mass <= 0)
      return { ok: false, error: "每份子样质量必须为正数（单位 g）" };
    masses.push(mass);
  }

  const total = roundMass(masses.reduce((sum, m) => sum + m, 0));
  const maxTotal = roundMass(parent.remainingG - MIN_REMAIN_G);
  if (total > maxTotal + MASS_EPSILON)
    return {
      ok: false,
      error: `子样合计 ${total.toFixed(2)}g 超过可拆分量 ${maxTotal.toFixed(
        2
      )}g（母样 ${parent.remainingG.toFixed(
        2
      )}g 必须至少保留 ${MIN_REMAIN_G.toFixed(2)}g），整次拒绝`,
    };

  const children: Sample[] = masses.map((mass, index) => ({
    id: nextId(index),
    // 子样归入原案件
    caseId: parent.caseId,
    location: parent.location,
    exposureStage: parent.exposureStage,
    species: parent.species,
    devStage: parent.devStage,
    sampledAt: parent.sampledAt,
    preservation: parent.preservation,
    note: `自 ${parent.id} 拆分子样`,
    massG: mass,
    remainingG: mass,
    parentId: parent.id,
    sent: false,
    readings: [],
    createdAt: now,
  }));

  return {
    ok: true,
    children,
    remainingG: roundMass(parent.remainingG - total),
  };
}

export function latestReading(sample: Sample) {
  return sample.readings.length
    ? sample.readings[sample.readings.length - 1]
    : null;
}

/** 沿派生链向上收集全部祖先（近 → 远） */
export function ancestorsOf(sample: Sample, byId: Map<string, Sample>): Sample[] {
  const chain: Sample[] = [];
  let cursor = sample.parentId;
  while (cursor) {
    const node = byId.get(cursor);
    if (!node) break;
    chain.push(node);
    cursor = node.parentId;
  }
  return chain;
}

/**
 * 温控阻断：自身最新读数异常，或任一母样（含隔代）最新读数异常，
 * 则暂停送检。
 */
export function blockedInfo(
  sample: Sample,
  byId: Map<string, Sample>
): { blocked: boolean; reason: string } {
  const own = latestReading(sample);
  if (own && own.abnormal)
    return { blocked: true, reason: `本样 ${own.tempC.toFixed(1)}℃ 温控异常` };
  for (const ancestor of ancestorsOf(sample, byId)) {
    const reading = latestReading(ancestor);
    if (reading && reading.abnormal)
      return {
        blocked: true,
        reason: `母样 ${ancestor.id}（${reading.tempC.toFixed(
          1
        )}℃）温控异常，全部派生样暂停送检`,
      };
  }
  return { blocked: false, reason: "" };
}

/** 案件下一个根样编号字母：CASE-042 + A/B/C… */
export function nextCaseLetter(
  caseId: string,
  samples: Sample[]
): string {
  const used = new Set(
    samples
      .filter((s) => s.parentId === null && s.caseId === caseId)
      .map((s) => s.id.slice(caseId.length + 1)[0])
  );
  let code = 65; // A
  while (used.has(String.fromCharCode(code))) code += 1;
  return String.fromCharCode(code);
}

/** 该母样下一个子样序号 */
export function nextChildSeq(
  parentId: string,
  samples: Sample[]
): number {
  const prefix = parentId + "-S";
  let seq = 1;
  for (const s of samples) {
    if (s.parentId === parentId && s.id.startsWith(prefix)) {
      const n = Number(s.id.slice(prefix.length));
      if (Number.isInteger(n) && n >= seq) seq = n + 1;
    }
  }
  return seq;
}

export function isStageRegistered(s: Sample): s is Sample & {
  devStage: DevStage;
} {
  return Boolean(s.devStage);
}
