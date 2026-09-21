export type DevStage = "卵" | "幼虫" | "蛹" | "成虫";

export const DEV_STAGES: DevStage[] = ["卵", "幼虫", "蛹", "成虫"];

export interface TempReading {
  id: string;
  at: number;
  tempC: number;
  abnormal: boolean;
}

export interface Sample {
  id: string;
  /** 案件编号：子样始终继承母样，归入原案件 */
  caseId: string;
  location: string;
  /** 尸体暴露阶段 */
  exposureStage: string;
  /** 昆虫种类，空串表示尚未鉴定登记 */
  species: string;
  /** 发育阶段，空串表示尚未登记 */
  devStage: DevStage | "";
  sampledAt: string;
  /** 保存方式，空串表示尚未登记 */
  preservation: string;
  note: string;
  /** 登记初始质量(g) */
  massG: number;
  /** 母样余量(g)，拆分后核减，但始终保留最小余量 */
  remainingG: number;
  /** 派生来源：母样 id，根样为 null */
  parentId: string | null;
  /** 是否已人工送检（任何自动流程都不会改写该状态） */
  sent: boolean;
  readings: TempReading[];
  createdAt: number;
}

export interface Notice {
  kind: "ok" | "err";
  text: string;
}

export interface UiState {
  stages: DevStage[];
  selectedId: string | null;
}
