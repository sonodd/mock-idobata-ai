import type { Message } from './message';

export interface Thread {
  id: string;
  question: string;
  status: 'in_progress' | 'completed' | 'failed' | 'error';
  messages: Message[];
}

export interface CreateThreadResponse {
  id: string;
  question: string;
  status: string;
}

export interface ThreadSummary {
  id: string;
  question: string;
  status: 'in_progress' | 'completed' | 'failed' | 'error';
  created_at: string;
}
