import React, { useMemo } from 'react';
import { checkPasswordStrength, PasswordStrengthLevel } from '../utils/passwordStrength';
import { useTranslation } from '../i18n/useTranslation';

interface PasswordStrengthIndicatorProps {
  /** 当前密码值 */
  password: string;
}

/** 每个强度等级对应的颜色和宽度 */
const levelConfig: Record<PasswordStrengthLevel, { color: string; width: string; bars: number }> = {
  weak: { color: '#ef4444', width: '25%', bars: 1 },
  fair: { color: '#f59e0b', width: '50%', bars: 2 },
  good: { color: '#22c55e', width: '75%', bars: 3 },
  strong: { color: '#10b981', width: '100%', bars: 4 },
};

export const PasswordStrengthIndicator: React.FC<PasswordStrengthIndicatorProps> = ({ password }) => {
  const { t } = useTranslation();

  const result = useMemo(() => checkPasswordStrength(password), [password]);

  if (!password) return null;

  const config = levelConfig[result.level];
  const levelLabel = t(`password.level_${result.level}`);

  return (
    <div className="w-full -mt-1 mb-1">
      {/* 强度条 */}
      <div className="flex gap-1 mb-1.5">
        {[0, 1, 2, 3].map(i => (
          <div
            key={i}
            className="h-[3px] flex-1 rounded-full transition-all duration-300"
            style={{
              backgroundColor: i < config.bars ? config.color : 'rgba(255,255,255,0.1)',
            }}
          />
        ))}
      </div>

      {/* 强度等级文字 */}
      <div className="flex items-center justify-between">
        <span
          className="text-[11px] font-medium transition-colors duration-300"
          style={{ color: config.color }}
        >
          {levelLabel}
        </span>
      </div>

      {/* 未通过规则提示 */}
      {result.failedRules.length > 0 && result.level !== 'strong' && (
        <div className="mt-1 space-y-0.5">
          {result.failedRules.slice(0, 3).map(rule => (
            <div key={rule} className="flex items-center gap-1.5 text-[11px] text-white/40">
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none" className="shrink-0">
                <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1" />
                <path d="M4 6h4" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
              </svg>
              <span>{t(rule)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
