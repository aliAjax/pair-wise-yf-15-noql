import type { Sample, UiState } from "./types";

const SAMPLES_KEY = "hxyfront-62003:samples:v1";
const UI_KEY = "hxyfront-62003:ui:v1";

function t(day: number, hour: number, minute = 0): number {
  return new Date(2026, 8, day, hour, minute).getTime();
}

/** 首次进入时的内置记录，之后一切读写都走 localStorage（本地同步，无后台） */
export function seedSamples(): Sample[] {
  const now = Date.now();
  return [
    {
      id: "CASE-042-A",
      caseId: "CASE-042",
      location: "室外草地",
      exposureStage: "膨胀期",
      species: "丝光绿蝇",
      devStage: "幼虫",
      sampledAt: "2026-09-18 09:12",
      preservation: "75%乙醇保存",
      note: "幼虫三龄，采集于尸体下方土壤 5cm",
      massG: 12.0,
      remainingG: 10.0,
      parentId: null,
      sent: false,
      readings: [
        { id: "r-seed-1", at: t(18, 9, 20), tempC: 18.2, abnormal: false },
        { id: "r-seed-2", at: t(18, 14, 0), tempC: 31.5, abnormal: true },
      ],
      createdAt: now,
    },
    {
      id: "CASE-042-A-S1",
      caseId: "CASE-042",
      location: "室外草地",
      exposureStage: "膨胀期",
      species: "丝光绿蝇",
      devStage: "幼虫",
      sampledAt: "2026-09-18 09:12",
      preservation: "75%乙醇保存",
      note: "自 CASE-042-A 拆分子样",
      massG: 2.0,
      remainingG: 2.0,
      parentId: "CASE-042-A",
      sent: false,
      readings: [],
      createdAt: now,
    },
    {
      id: "CASE-042-B",
      caseId: "CASE-042",
      location: "阴影区域",
      exposureStage: "腐烂期",
      species: "丽蝇科（待定）",
      devStage: "蛹",
      sampledAt: "2026-09-18 10:05",
      preservation: "干燥冷冻保存",
      note: "需复核种属",
      massG: 5.0,
      remainingG: 5.0,
      parentId: null,
      sent: false,
      readings: [
        { id: "r-seed-3", at: t(18, 10, 10), tempC: 22.4, abnormal: false },
      ],
      createdAt: now,
    },
    {
      id: "CASE-051-A",
      caseId: "CASE-051",
      location: "水沟边缘",
      exposureStage: "干化期",
      species: "大头金蝇",
      devStage: "成虫",
      sampledAt: "2026-09-16 16:40",
      preservation: "针插干燥标本",
      note: "已完成拍照",
      massG: 4.0,
      remainingG: 4.0,
      parentId: null,
      sent: true,
      readings: [
        { id: "r-seed-4", at: t(16, 16, 50), tempC: 26.1, abnormal: false },
      ],
      createdAt: now,
    },
    {
      id: "CASE-051-B",
      caseId: "CASE-051",
      location: "水沟边缘",
      exposureStage: "干化期",
      species: "",
      devStage: "",
      sampledAt: "2026-09-16 17:05",
      preservation: "",
      note: "待鉴定，登记信息不全",
      massG: 3.5,
      remainingG: 3.5,
      parentId: null,
      sent: false,
      readings: [],
      createdAt: now,
    },
    {
      id: "CASE-063-A",
      caseId: "CASE-063",
      location: "室内地下室",
      exposureStage: "新鲜期",
      species: "厩腐蝇",
      devStage: "卵",
      sampledAt: "2026-09-19 08:30",
      preservation: "75%乙醇保存",
      note: "卵块连同基质整体保存",
      massG: 6.0,
      remainingG: 6.0,
      parentId: null,
      sent: false,
      readings: [
        { id: "r-seed-5", at: t(19, 8, 40), tempC: 16.8, abnormal: false },
        { id: "r-seed-6", at: t(19, 12, 15), tempC: 17.2, abnormal: false },
      ],
      createdAt: now,
    },
  ];
}

export function loadSamples(): Sample[] {
  try {
    const raw = localStorage.getItem(SAMPLES_KEY);
    if (!raw) {
      const seeded = seedSamples();
      saveSamples(seeded);
      return seeded;
    }
    const parsed: unknown = JSON.parse(raw);
    if (
      !Array.isArray(parsed) ||
      !parsed.every(
        (item) =>
          item &&
          typeof item === "object" &&
          typeof (item as Sample).id === "string"
      )
    ) {
      return seedSamples();
    }
    return parsed as Sample[];
  } catch {
    return seedSamples();
  }
}

export function saveSamples(samples: Sample[]): void {
  try {
    localStorage.setItem(SAMPLES_KEY, JSON.stringify(samples));
  } catch {
    // 本地存储不可用时仅内存生效，不影响当前操作
  }
}

export function loadUi(): UiState {
  const fallback: UiState = { stages: [], selectedId: null };
  try {
    const raw = localStorage.getItem(UI_KEY);
    if (!raw) return fallback;
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as UiState;
  } catch {
    // 忽略损坏的界面状态
  }
  return fallback;
}

export function saveUi(ui: UiState): void {
  try {
    localStorage.setItem(UI_KEY, JSON.stringify(ui));
  } catch {
    // 同上
  }
}
