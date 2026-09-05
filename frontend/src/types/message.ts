export interface Reaction {
  emoji: string;
  agent_nickname: string;
}

export interface Message {
  agent_nickname: string;
  content: string;
  turn_order: number;
  reactions?: Reaction[];
  reply_to?: string;
}
