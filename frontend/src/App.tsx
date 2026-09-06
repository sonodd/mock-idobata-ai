import { useEffect, useRef, useState } from 'react';
import { assignAgentColors, useAppStore } from './store/useAppStore';
import { fetchAgents } from './api/agents';
import type { Agent } from './types/agent';
import { createThread, pollThread, streamThread, getThreadReport, postFollowUp, getThread } from './api/threads';
import type { Message } from './types/message';
import type { Thread } from './types/thread';
import IdleScreen from './components/IdleScreen';
import SendingAnimation from './components/SendingAnimation';
import DiscussingScreen from './components/DiscussingScreen';
import ReturnReport from './components/ReturnReport';
import AgentRegistrationScreen from './components/AgentRegistrationScreen';
import AgentDetailScreen from './components/AgentDetailScreen';
import ThreadHistoryPanel from './components/ThreadHistoryPanel';

function App() {
  const {
    phase, question, agents, messages, visibleMessages,
    typingAgentNickname, report, threadId,
    setPhase, setQuestion, setAgents, setMessages, setVisibleMessages,
    setTypingAgentNickname, setThreadId, setReport, reset,
  } = useAppStore();

  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const stopPollRef = useRef<(() => void) | null>(null);
  const delayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connectThread = (
    id: string,
    onMessages: (allMessages: Message[]) => void,
    onComplete: (thread: Thread) => void,
    onError: (err: Error) => void
  ): (() => void) => {
    let acc: Message[] = [];
    let stopFallback: (() => void) | null = null;
    const stop = streamThread(
      id,
      (msg) => { acc = [...acc, msg]; onMessages(acc); },
      onComplete,
      (sseErr) => {
        console.warn('SSE接続失敗、ポーリングに切替:', sseErr);
        const stopPoll = pollThread(id, onMessages, onComplete, onError);
        stopFallback = stopPoll;
      }
    );
    return () => { stop(); stopFallback?.(); };
  };

  useEffect(() => {
    fetchAgents()
      .then((res) => setAgents(assignAgentColors(res.agents)))
      .catch(console.error);
  }, [setAgents]);

  useEffect(() => {
    return () => {
      stopPollRef.current?.();
      if (delayTimerRef.current !== null) clearTimeout(delayTimerRef.current);
    };
  }, []);

  const handleSubmit = async () => {
    setPhase('sending');
    try {
      const res = await createThread(question);
      setThreadId(res.id);
      delayTimerRef.current = setTimeout(() => {
        delayTimerRef.current = null;
        setPhase('discussing');
        const stop = connectThread(
          res.id,
          (allMessages) => {
            setVisibleMessages(allMessages);
            const lastMsg = allMessages[allMessages.length - 1];
            const nextTyping = agents.find(
              (a) => a.nickname !== lastMsg?.agent_nickname && !a.is_self
            );
            setTypingAgentNickname(nextTyping?.nickname ?? null);
          },
          (thread) => {
            setMessages(thread.messages);
            setVisibleMessages(thread.messages);
            setTypingAgentNickname(null);
            setPhase('returning');
            getThreadReport(res.id).then((r) => setReport(r)).catch(console.error);
            setTimeout(() => setPhase('done'), 2500);
          },
          (err) => {
            console.error('Poll error:', err);
            setErrorMessage('会議中にエラーが発生しました。もう一度お試しください。');
            setPhase('idle');
          }
        );
        stopPollRef.current = stop;
      }, 1500);
    } catch (e) {
      console.error(e);
      setErrorMessage(e instanceof Error ? e.message : '会議を開始できませんでした');
      setPhase('idle');
    }
  };

  const resetToIdle = () => {
    stopPollRef.current?.();
    stopPollRef.current = null;
    if (delayTimerRef.current !== null) { clearTimeout(delayTimerRef.current); delayTimerRef.current = null; }
    setPhase('idle');
  };

  const handleReset = () => {
    stopPollRef.current?.();
    stopPollRef.current = null;
    if (delayTimerRef.current !== null) { clearTimeout(delayTimerRef.current); delayTimerRef.current = null; }
    reset();
    fetchAgents()
      .then((r) => setAgents(assignAgentColors(r.agents)))
      .catch(console.error);
  };

  const handleFollowUp = async (followUpQuestion: string) => {
    if (!threadId) return;
    stopPollRef.current?.();
    stopPollRef.current = null;
    if (delayTimerRef.current !== null) { clearTimeout(delayTimerRef.current); delayTimerRef.current = null; }
    setReport(null);
    setPhase('sending');
    try {
      await postFollowUp(threadId, followUpQuestion);
      delayTimerRef.current = setTimeout(() => {
        delayTimerRef.current = null;
        setPhase('discussing');
        setVisibleMessages([]);
        setTypingAgentNickname(null);
        const stop = connectThread(
          threadId,
          (allMessages) => {
            setVisibleMessages(allMessages);
            const lastMsg = allMessages[allMessages.length - 1];
            const nextTyping = agents.find(
              (a) => a.nickname !== lastMsg?.agent_nickname && !a.is_self
            );
            setTypingAgentNickname(nextTyping?.nickname ?? null);
          },
          (thread) => {
            setMessages(thread.messages);
            setVisibleMessages(thread.messages);
            setTypingAgentNickname(null);
            setPhase('returning');
            getThreadReport(threadId).then((r) => setReport(r)).catch(console.error);
            setTimeout(() => setPhase('done'), 2500);
          },
          (err) => {
            console.error('FollowUp poll error:', err);
            setErrorMessage('追加質問中にエラーが発生しました。もう一度お試しください。');
            setPhase('done');
          }
        );
        stopPollRef.current = stop;
      }, 1500);
    } catch (e) {
      console.error(e);
      setErrorMessage(e instanceof Error ? e.message : '追加質問を送信できませんでした');
      setPhase('idle');
    }
  };

  const handleSelectThread = async (selectedThreadId: string) => {
    stopPollRef.current?.();
    try {
      const thread = await getThread(selectedThreadId);
      setThreadId(selectedThreadId);
      setQuestion(thread.question);
      setMessages(thread.messages);
      setVisibleMessages(thread.messages);
      if (thread.status === 'completed') {
        setPhase('done');
        getThreadReport(selectedThreadId).then((r) => setReport(r)).catch(console.error);
      } else if (thread.status === 'in_progress') {
        setPhase('discussing');
        const stop = connectThread(
          selectedThreadId,
          (allMessages) => {
            setVisibleMessages(allMessages);
          },
          (t) => {
            setMessages(t.messages);
            setVisibleMessages(t.messages);
            setPhase('returning');
            getThreadReport(selectedThreadId).then((r) => setReport(r)).catch(console.error);
            setTimeout(() => setPhase('done'), 2500);
          },
          (err) => {
            console.error('Poll error:', err);
            setPhase('idle');
          }
        );
        stopPollRef.current = stop;
      }
    } catch (e) {
      console.error(e);
    }
  };

  const selfAgent = agents.find((a) => a.is_self);
  const selfColor = selfAgent?.color ?? '#E8654A';
  const selfEmoji = selfAgent?.emoji ?? '🔥';

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(170deg, #f9f5f0 0%, #f0e8dd 50%, #e8dfcf 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '16px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 390,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            textAlign: 'center',
            padding: '18px 0 14px',
            borderBottom: '1px solid rgba(160,140,120,0.15)',
            marginBottom: 16,
          }}
        >
          <div style={{ fontSize: 22, marginBottom: 4 }}>🫧</div>
          <div style={{ fontSize: 17, fontWeight: 700, color: '#4a3f35', fontFamily: "'Zen Maru Gothic', sans-serif", letterSpacing: -0.3 }}>井戸端会議 AI</div>
          <div style={{ fontSize: 11, color: '#9a8e82', fontFamily: "'Zen Maru Gothic', sans-serif", marginTop: 2 }}>分身が代わりに相談してきます</div>
        </div>

        <p style={{ fontSize: 12, lineHeight: 1.7, color: '#75685b', margin: '12px 0' }}>
          AIによる会話シミュレーションです。本人の発言や事実確認を表すものではありません。
          会議を始めると、プロフィール・質問・会話履歴がAnthropicへ送信され、API料金が発生します。
          入力内容はこの端末のサーバーに保存されます。秘密情報や、他人を特定できる情報は入力しないでください。
        </p>
        {phase === 'registering' && (
          <AgentRegistrationScreen
            onComplete={() => {
              fetchAgents()
                .then((res) => setAgents(assignAgentColors(res.agents)))
                .catch(console.error);
              setPhase('idle');
            }}
            onCancel={() => setPhase('idle')}
          />
        )}
        {phase === 'idle' && (
          <>
            {errorMessage && (
              <div style={{
                background: '#fee2e2',
                border: '1px solid #fca5a5',
                borderRadius: 8,
                padding: '10px 14px',
                marginBottom: 12,
                color: '#dc2626',
                fontSize: 13,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                <span>{errorMessage}</span>
                <button
                  onClick={() => setErrorMessage(null)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: 16, padding: 0 }}
                >✕</button>
              </div>
            )}
            <IdleScreen
              question={question}
              onQuestionChange={setQuestion}
              onSubmit={handleSubmit}
              agents={agents}
              onRegisterAgent={() => setPhase('registering')}
              onViewAgent={(agent) => { setSelectedAgent(agent); setPhase('viewing'); }}
              threadHistorySlot={<ThreadHistoryPanel onSelectThread={handleSelectThread} />}
            />
          </>
        )}
        {phase === 'viewing' && selectedAgent && (
          <AgentDetailScreen
            agent={selectedAgent as import('./api/agents').AgentDetail}
            onSave={() => {
              fetchAgents()
                .then((res) => setAgents(assignAgentColors(res.agents)))
                .catch(console.error);
              setSelectedAgent(null);
              setPhase('idle');
            }}
            onClose={() => { setSelectedAgent(null); setPhase('idle'); }}
          />
        )}
        {phase === 'sending' && (
          <SendingAnimation selfColor={selfColor} selfEmoji={selfEmoji} />
        )}
        {(phase === 'discussing' || phase === 'returning') && (
          <DiscussingScreen
            messages={visibleMessages}
            typingAgentNickname={typingAgentNickname}
            agents={agents}
            totalMessages={messages.length}
            isReturning={phase === 'returning'}
            onResetToIdle={resetToIdle}
          />
        )}
        {phase === 'done' && (
          <>
            <p style={{ fontSize: 12, lineHeight: 1.7, color: '#75685b' }}>
              リアクションはランダムな演出です。レポートは発言の抜粋をルールで選んだもので、
              内容の正しさや参加者の賛同を保証しません。
            </p>
            <ReturnReport
              report={report}
              messages={messages}
              agents={agents}
              selfColor={selfColor}
              selfEmoji={selfEmoji}
              onReset={handleReset}
              onResetToIdle={resetToIdle}
              onFollowUp={handleFollowUp}
              question={question}
            />
            <ThreadHistoryPanel onSelectThread={handleSelectThread} />
          </>
        )}
      </div>
    </div>
  );
}

export default App;
