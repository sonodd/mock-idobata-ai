export interface Agent {
  id: string;
  nickname: string;
  expertise: string[];
  personality: string;
  is_self: boolean;
  // 詳細フィールド（GET /api/agents 拡張後に返される）
  background?: { label: string } | null;
  values?: string[] | null;
  tone?: { characteristics?: string; samples: string[] };
  episodes?: string[];
  // UI用（APIから返らない場合はフォールバック）
  color?: string;
  bgColor?: string;
  emoji?: string;
}

// API /api/agents レスポンス型
export interface AgentsResponse {
  agents: Agent[];
}
