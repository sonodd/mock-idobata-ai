import { apiFetch } from './client';
import type { AgentsResponse } from '../types/agent';

export function fetchAgents(): Promise<AgentsResponse> {
  return apiFetch<AgentsResponse>('/api/agents');
}

export interface CreateAgentInput {
  nickname: string;
  background?: { label: string };
  expertise: string[];
  personality: string;
  values?: string[];
  tone: { characteristics?: string; samples: string[] };
  episodes: string[];
  is_self: boolean;
}

export interface AgentDetail {
  id: string;
  nickname: string;
  personality: string;
  background?: { label: string } | null;
  expertise: string[];
  values?: string[] | null;
  tone?: { characteristics?: string; samples: string[] };
  episodes: string[];
  is_self: boolean;
  color?: string;
}

export function createAgent(input: CreateAgentInput): Promise<{ id: string }> {
  return apiFetch<{ id: string }>('/api/agents', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateAgent(id: string, input: CreateAgentInput): Promise<AgentDetail> {
  return apiFetch<AgentDetail>(`/api/agents/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}
