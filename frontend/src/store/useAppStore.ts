import { create } from 'zustand';
import type { Agent } from '../types/agent';
import type { Message } from '../types/message';
import type { ReturnReportData } from '../types/report';

export type Phase = 'idle' | 'registering' | 'viewing' | 'sending' | 'discussing' | 'returning' | 'done';

// エージェントにUI表示用カラーを割り当てる
const AGENT_COLORS = [
  { color: '#3A7CA5', bgColor: '#EDF5FA', emoji: '🌊' },
  { color: '#5B9A5E', bgColor: '#EDF7EE', emoji: '🏕️' },
  { color: '#C4922A', bgColor: '#FDF6E8', emoji: '🌿' },
  { color: '#9B59B6', bgColor: '#F5EEF8', emoji: '🌸' },
  { color: '#1ABC9C', bgColor: '#E8F8F5', emoji: '🍃' },
];
const SELF_COLOR = { color: '#E8654A', bgColor: '#FFF0ED', emoji: '🔥' };

export function assignAgentColors(agents: Agent[]): Agent[] {
  let colorIdx = 0;
  return agents.map((agent) => {
    if (agent.is_self) {
      return { ...agent, ...SELF_COLOR };
    }
    const c = AGENT_COLORS[colorIdx % AGENT_COLORS.length];
    colorIdx++;
    return { ...agent, ...c };
  });
}

interface AppState {
  phase: Phase;
  question: string;
  threadId: string | null;
  agents: Agent[];
  messages: Message[];
  visibleMessages: Message[];
  typingAgentNickname: string | null;
  report: ReturnReportData | null;

  setPhase: (phase: Phase) => void;
  setQuestion: (q: string) => void;
  setThreadId: (id: string) => void;
  setAgents: (agents: Agent[]) => void;
  setMessages: (messages: Message[]) => void;
  setVisibleMessages: (messages: Message[]) => void;
  addVisibleMessage: (msg: Message) => void;
  setTypingAgentNickname: (name: string | null) => void;
  setReport: (report: ReturnReportData | null) => void;
  reset: () => void;
}

const initialState = {
  phase: 'idle' as Phase,
  question: '',
  threadId: null,
  agents: [],
  messages: [],
  visibleMessages: [],
  typingAgentNickname: null,
  report: null,
};

export const useAppStore = create<AppState>((set) => ({
  ...initialState,

  setPhase: (phase) => set({ phase }),
  setQuestion: (question) => set({ question }),
  setThreadId: (threadId) => set({ threadId }),
  setAgents: (agents) => set({ agents }),
  setMessages: (messages) => set({ messages }),
  setVisibleMessages: (visibleMessages) => set({ visibleMessages }),
  addVisibleMessage: (msg) =>
    set((state) => ({ visibleMessages: [...state.visibleMessages, msg] })),
  setTypingAgentNickname: (typingAgentNickname) => set({ typingAgentNickname }),
  setReport: (report) => set({ report }),
  reset: () => set(initialState),
}));
