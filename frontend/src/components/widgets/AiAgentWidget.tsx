import React from 'react';
import type { WidgetSize } from '../../store/layoutStore';
import { useConfigStore } from '../../store/configStore';
import { isAIConfigured } from '../../ai/provider';

interface AiAgentWidgetProps {
  size: WidgetSize;
}

/** Small entry card for the AI Agent. Clicking opens the full chat modal. */
export const AiAgentWidget: React.FC<AiAgentWidgetProps> = () => {
  const language = useConfigStore(s => s.language);
  const configured = isAIConfigured();

  if (!configured) {
    return (
      <div className="w-full h-full flex items-center gap-3 px-4 select-none overflow-hidden cursor-pointer">
        <div
          className="shrink-0 flex items-center justify-center rounded-xl"
          style={{ width: 44, height: 44, background: 'linear-gradient(135deg, #06b6d4 0%, #8b5cf6 50%, #ec4899 100%)', opacity: 0.5 }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1.27A7 7 0 0 1 7.27 19H6a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h-1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z" />
          </svg>
        </div>
        <div className="flex flex-col justify-center min-w-0" style={{ gap: '3px' }}>
          <span className="text-[15px] font-semibold text-white/50 leading-none tracking-tight">
            AI {language === 'zh' ? '助手' : 'Agent'}
          </span>
          <span className="text-[11px] text-white/25 leading-none">
            {language === 'zh' ? '请先配置 API Key' : 'Configure API Key'}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex items-center gap-3 px-4 select-none overflow-hidden cursor-pointer">
      <div
        className="shrink-0 flex items-center justify-center rounded-xl"
        style={{
          width: 44,
          height: 44,
          background: 'linear-gradient(135deg, #06b6d4 0%, #8b5cf6 50%, #ec4899 100%)',
          boxShadow: '0 2px 10px rgba(139,92,246,0.35)',
        }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1.27A7 7 0 0 1 7.27 19H6a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h-1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z" />
          <circle cx="10" cy="14" r="1" fill="white" />
          <circle cx="14" cy="14" r="1" fill="white" />
        </svg>
      </div>
      <div className="flex flex-col justify-center min-w-0" style={{ gap: '3px' }}>
        <span className="text-[15px] font-semibold text-white/90 leading-none tracking-tight">
          AI {language === 'zh' ? '助手' : 'Agent'}
        </span>
        <span className="text-[11px] text-white/45 leading-none">
          {language === 'zh' ? '智能桌面管家' : 'Smart Desktop Assistant'}
        </span>
      </div>
    </div>
  );
};
