import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from '../i18n/useTranslation';
import { isAIConfigured } from '../ai/provider';
import { runAgent } from '../ai/agent';
import type { AgentMessage } from '../ai/agent';
import { customStorage } from '../store/configStore';
import { useConfigStore } from '../store/configStore';

const CHAT_STORAGE_KEY = 'catheadtab-ai-chat';

/** Load chat history from local storage. */
async function loadChatHistory(): Promise<AgentMessage[]> {
  try {
    const raw = await customStorage.getItem(CHAT_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return [];
}

/** Save chat history to local storage. */
async function saveChatHistory(messages: AgentMessage[]) {
  // Keep last 50 messages to avoid storage bloat
  const trimmed = messages.slice(-50);
  await customStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(trimmed));
}

interface AiAgentModalProps {
  onClose: () => void;
}

export const AiAgentModal: React.FC<AiAgentModalProps> = ({ onClose }) => {
  const { language } = useTranslation();
  const isZh = language === 'zh';
  const activeModel = useConfigStore(s => {
    const cfg = s.aiProviderConfigs[s.aiActiveProvider];
    return cfg?.model || '';
  });
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [input, setInput] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const configured = isAIConfigured();

  // Load saved chat history on mount
  useEffect(() => {
    loadChatHistory().then(saved => {
      if (saved.length > 0) setMessages(saved);
      setLoaded(true);
    });
  }, []);

  // Auto-save whenever messages change (skip initial load)
  useEffect(() => {
    if (loaded && messages.length > 0) saveChatHistory(messages);
  }, [messages, loaded]);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;
    setInput('');
    const userMsg: AgentMessage = { role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setStreaming(true);
    try {
      let out = '';
      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);
      for await (const chunk of runAgent(text, [...messages, userMsg])) {
        out += chunk;
        setMessages(prev => [...prev.slice(0, -1), { role: 'assistant', content: out }]);
      }
      if (!out) setMessages(prev => [...prev.slice(0, -1), { role: 'assistant', content: isZh ? '✅ 操作已完成。' : '✅ Done.' }]);
    } catch (err: any) {
      const errMsg = err?.message || 'Unknown error';
      // Parse common API errors for user-friendly display
      let displayMsg = errMsg;
      try {
        const parsed = JSON.parse(errMsg);
        if (parsed?.error?.message) displayMsg = parsed.error.message;
      } catch { /* not JSON, use raw message */ }
      // Replace the empty assistant bubble with an error message
      setMessages(prev => {
        const filtered = prev.filter(m => m.content !== '');
        return [...filtered, { role: 'assistant', content: `❌ ${isZh ? '出错了' : 'Error'}: ${displayMsg}` }];
      });
    } finally { setStreaming(false); }
  }, [input, streaming, messages, isZh]);

  const hints = isZh
    ? ['整理我的桌面', '搜索书签 React', '添加 GitHub 到桌面', '最近浏览了什么']
    : ['Organize my desktop', 'Search bookmarks React', 'Add GitHub to desktop', 'Recent history'];

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center pointer-events-none ${isFullscreen ? 'p-0' : 'p-0 sm:p-6 md:p-12'}`}
      onContextMenu={e => { e.preventDefault(); e.stopPropagation(); }}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/20 backdrop-blur-[2px] pointer-events-auto animate-fadeIn"
        onClick={onClose}
      />

      {/* Window */}
      <div
        className={`bg-black/30 backdrop-blur-xl border-0 sm:border border-white/10 rounded-none sm:rounded-[1.5rem] md:rounded-[2rem] shadow-[0_30px_80px_rgba(0,0,0,0.55)] flex flex-col pointer-events-auto animate-scaleIn overflow-hidden transition-all duration-300 ${
          isFullscreen
            ? 'w-full h-full !rounded-none !border-0'
            : 'w-full h-full sm:w-[480px] sm:h-[75vh] md:w-[540px] md:h-[70vh]'
        }`}
        onClick={e => e.stopPropagation()}
      >
        {/* Header — macOS traffic lights on desktop, X button on mobile */}
        <div className="h-12 md:h-14 border-b border-white/10 flex items-center px-3 md:px-5 shrink-0 bg-white/[0.02] select-none">
          {/* Left: Mac traffic lights (desktop only) */}
          <div className="flex items-center gap-2 w-auto md:w-20">
            <div className="hidden md:flex gap-2.5">
              <button
                onClick={onClose}
                className="w-3.5 h-3.5 rounded-full bg-[#ff5f56] hover:bg-[#ff5f56]/80 flex items-center justify-center transition-colors group border border-black/20 !cursor-default"
              >
                <svg className="w-2 h-2 text-red-900 opacity-0 group-hover:opacity-100" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
              <button className="w-3.5 h-3.5 rounded-full bg-[#ffbd2e] hover:bg-[#ffbd2e]/80 flex items-center justify-center transition-colors group border border-black/20 !cursor-default">
                <svg className="w-2 h-2 text-yellow-900 opacity-0 group-hover:opacity-100" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 12h14"/></svg>
              </button>
              <button
                onClick={() => setIsFullscreen(f => !f)}
                className="w-3.5 h-3.5 rounded-full bg-[#27c93f] hover:bg-[#27c93f]/80 flex items-center justify-center transition-colors group border border-black/20 !cursor-default"
              >
                {isFullscreen ? (
                  <svg className="w-2 h-2 text-green-900 opacity-0 group-hover:opacity-100" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M4 14h6v6"/><path d="M20 10h-6V4"/><path d="M14 10l7-7"/><path d="M3 21l7-7"/></svg>
                ) : (
                  <svg className="w-2 h-2 text-green-900 opacity-0 group-hover:opacity-100" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/></svg>
                )}
              </button>
            </div>
          </div>

          {/* Center title */}
          <div className="flex-1 flex items-center justify-center gap-2">
            <div
              className="w-6 h-6 rounded-lg flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #06b6d4, #8b5cf6, #ec4899)' }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1.27A7 7 0 0 1 7.27 19H6a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h-1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z" />
              </svg>
            </div>
            <span className="text-[13px] font-semibold text-white/70">AI {isZh ? '助手' : 'Agent'}</span>
            {activeModel && <span className="text-[11px] text-white/25 font-mono">{activeModel}</span>}
          </div>

          {/* Right: clear (desktop) + close (mobile) */}
          <div className="flex items-center w-auto md:w-20 justify-end gap-1">
            {messages.length > 0 && (
              <button
                onClick={() => { setMessages([]); customStorage.removeItem(CHAT_STORAGE_KEY); }}
                className="hidden md:block px-2.5 py-1 rounded-lg text-[11px] text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors"
              >
                {isZh ? '清空' : 'Clear'}
              </button>
            )}
            <button
              onClick={onClose}
              className="md:hidden w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-white/70 hover:bg-white/20 transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          </div>
        </div>

        {/* Body */}
        {!configured ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 px-8 text-center">
            <span className="text-4xl">🔑</span>
            <p className="text-[13px] text-white/40 leading-relaxed">
              {isZh ? '请先在设置 → AI 助手中配置 API Key' : 'Configure API Key in Settings → AI Agent first'}
            </p>
          </div>
        ) : (
          <>
            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 space-y-3 no-scrollbar select-text">
              {messages.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center gap-4">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-white/[0.04]">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.2">
                      <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1.27A7 7 0 0 1 7.27 19H6a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h-1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z" />
                    </svg>
                  </div>
                  <p className="text-[12px] text-white/20">{isZh ? '试试这些指令' : 'Try these commands'}</p>
                  <div className="flex flex-wrap justify-center gap-2 px-4">
                    {hints.map(h => (
                      <button
                        key={h}
                        onClick={() => { setInput(h); inputRef.current?.focus(); }}
                        className="px-3.5 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-white/35 hover:text-white/60 text-[12px] transition-all"
                      >
                        {h}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[85%] sm:max-w-[80%] rounded-2xl px-4 py-2.5 text-[13px] leading-relaxed break-words whitespace-pre-wrap ${
                      msg.role === 'user'
                        ? 'bg-white/[0.08] text-white/85 rounded-br-lg'
                        : msg.content.startsWith('❌')
                          ? 'bg-red-500/10 border border-red-400/20 text-red-300/80 rounded-bl-lg'
                          : 'bg-white/[0.04] border border-white/[0.06] text-white/70 rounded-bl-lg'
                    }`}
                  >
                    {msg.content || (
                      <span className="inline-flex items-center gap-1.5 text-white/30">
                        <span className="w-1.5 h-1.5 rounded-full bg-white/30 animate-pulse" />
                        <span className="w-1.5 h-1.5 rounded-full bg-white/30 animate-pulse" style={{ animationDelay: '0.15s' }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-white/30 animate-pulse" style={{ animationDelay: '0.3s' }} />
                      </span>
                    )}
                  </div>
                </div>
              ))}
              {streaming && messages.length > 0 && messages[messages.length - 1].content === '' && null}
            </div>

            {/* Mobile clear button */}
            {messages.length > 0 && (
              <div className="md:hidden flex justify-center pb-1">
                <button
                  onClick={() => { setMessages([]); customStorage.removeItem(CHAT_STORAGE_KEY); }}
                  className="px-3 py-1 rounded-lg text-[11px] text-white/25 hover:text-white/50 hover:bg-white/5 transition-colors"
                >
                  {isZh ? '清空对话' : 'Clear chat'}
                </button>
              </div>
            )}

            {/* Input */}
            <div className="shrink-0 px-3 sm:px-4 pb-3 sm:pb-4 pt-2">
              <div className="flex items-center gap-2 bg-white/[0.05] hover:bg-white/[0.07] border border-white/[0.08] rounded-2xl px-4 py-3 transition-all focus-within:border-white/[0.15]">
                <input
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  placeholder={isZh ? '告诉 AI 你想做什么...' : 'Tell AI what you want...'}
                  disabled={streaming}
                  className="flex-1 bg-transparent text-[14px] text-white/85 placeholder:text-white/20 outline-none min-w-0"
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || streaming}
                  className="shrink-0 w-8 h-8 flex items-center justify-center rounded-xl bg-[#72d565]/70 hover:bg-[#72d565] disabled:opacity-20 transition-all"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
