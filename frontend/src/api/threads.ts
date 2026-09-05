import { apiFetch } from './client';
import type { CreateThreadResponse, Thread, ThreadSummary } from '../types/thread';
import type { ReturnReportData } from '../types/report';

export function listThreads(): Promise<{ threads: ThreadSummary[] }> {
  return apiFetch<{ threads: ThreadSummary[] }>('/api/threads');
}

export function createThread(question: string): Promise<CreateThreadResponse> {
  return apiFetch<CreateThreadResponse>('/api/threads', {
    method: 'POST',
    body: JSON.stringify({ question }),
  });
}

export function getThread(threadId: string): Promise<Thread> {
  return apiFetch<Thread>(`/api/threads/${threadId}`);
}

export function getThreadReport(threadId: string): Promise<ReturnReportData> {
  return apiFetch<ReturnReportData>(`/api/threads/${threadId}/report`);
}

export function postFollowUp(threadId: string, question: string): Promise<{ status: string }> {
  return apiFetch<{ status: string }>(`/api/threads/${threadId}/follow-up`, {
    method: 'POST',
    body: JSON.stringify({ question }),
  });
}

/**
 * SSEでスレッドをリアルタイム受信する。
 * onMessage: 新しいメッセージが届くたびに呼ばれる
 * onComplete: status=completed になったら呼ばれる
 * onError: エラーが発生したら呼ばれる
 */
export function streamThread(
  threadId: string,
  onMessage: (message: import('../types/message').Message) => void,
  onComplete: (thread: Thread) => void,
  onError: (err: Error) => void
): () => void {
  const es = new EventSource(`/api/threads/${threadId}/stream`);

  es.addEventListener('message', (e: MessageEvent) => {
    const msg = JSON.parse(e.data) as import('../types/message').Message;
    onMessage(msg);
  });

  es.addEventListener('complete', (e: MessageEvent) => {
    const thread = JSON.parse(e.data) as Thread;
    es.close();
    onComplete(thread);
  });

  es.addEventListener('error', (e: Event) => {
    const msgEvent = e as MessageEvent;
    if (msgEvent.data) {
      onError(new Error(JSON.parse(msgEvent.data).detail || 'SSEエラー'));
    } else {
      onError(new Error('SSE接続エラー'));
    }
    es.close();
  });

  return () => { es.close(); };
}

/**
 * 2秒間隔でスレッドをポーリングし、status=completed になったら停止する。
 * onMessage: 新しいメッセージが届くたびに呼ばれる
 * onComplete: status=completed になったら呼ばれる
 */
export function pollThread(
  threadId: string,
  onMessage: (totalMessages: import('../types/message').Message[]) => void,
  onComplete: (thread: Thread) => void,
  onError: (err: Error) => void
): () => void {
  let stopped = false;
  let prevCount = 0;

  const poll = async () => {
    if (stopped) return;
    try {
      const thread = await getThread(threadId);
      if (stopped) return;
      if (thread.messages.length > prevCount) {
        prevCount = thread.messages.length;
        onMessage(thread.messages);
      }
      if (thread.status === 'completed') {
        onComplete(thread);
        return;
      }
      if (thread.status === 'failed' || thread.status === 'error') {
        onError(new Error(`スレッドがエラー状態です: ${thread.status}`));
        return;
      }
    } catch (e) {
      if (stopped) return;
      onError(e as Error);
      return;
    }
    if (!stopped) {
      setTimeout(poll, 2000);
    }
  };

  poll();
  return () => { stopped = true; };
}
