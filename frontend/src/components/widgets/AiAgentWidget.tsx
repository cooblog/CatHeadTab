import React from 'react';
import type { WidgetSize } from '../../store/layoutStore';
import { useConfigStore } from '../../store/configStore';
import { isAIConfigured, hasAIAccess } from '../../ai/provider';
import { CatHeadIcon } from '../CatHeadIcon';

interface AiAgentWidgetProps {
  size: WidgetSize;
}

/** Small entry card for the AI Agent. Clicking opens the full chat modal. */
export const AiAgentWidget: React.FC<AiAgentWidgetProps> = () => {
  const language = useConfigStore(s => s.language);
  // Subscribe to reactive dependencies — triggers re-render when these change
  useConfigStore(s => s.serverAIConfig);
  useConfigStore(s => s.userProfile);
  useConfigStore(s => s.aiProviderConfigs);
  useConfigStore(s => s.aiActiveProvider);
  const proAccess = hasAIAccess();
  const configured = isAIConfigured();
  const renderIcon = (opacity = 1, active = false) => (
    <CatHeadIcon
      alt=""
      className="shrink-0 rounded-xl bg-black/25"
      imageClassName={active ? 'drop-shadow-[0_2px_10px_rgba(114,213,101,0.25)]' : ''}
      style={{
        width: 44,
        height: 44,
        opacity,
        boxShadow: active ? '0 2px 10px rgba(114,213,101,0.18)' : undefined,
      }}
    />
  );

  if (!proAccess) {
    return (
      <div className="w-full h-full flex items-center gap-3 px-4 select-none overflow-hidden cursor-pointer">
        {renderIcon(0.35)}
        <div className="flex flex-col justify-center min-w-0" style={{ gap: '3px' }}>
          <span className="text-[15px] font-semibold text-white/40 leading-none tracking-tight">
            AI {language === 'zh' ? '助手' : 'Agent'}
          </span>
          <span className="text-[11px] text-purple-400/60 leading-none flex items-center gap-1">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            {language === 'zh' ? 'Pro 专属功能' : 'Pro Feature'}
          </span>
        </div>
      </div>
    );
  }

  if (!configured) {
    return (
      <div className="w-full h-full flex items-center gap-3 px-4 select-none overflow-hidden cursor-pointer">
        {renderIcon(0.5)}
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
      {renderIcon(1, true)}
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
