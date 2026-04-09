/**
 * 密码强度等级定义
 */
export type PasswordStrengthLevel = 'weak' | 'fair' | 'good' | 'strong';

/**
 * 密码强度校验结果
 */
export interface PasswordStrengthResult {
  /** 强度等级 */
  level: PasswordStrengthLevel;
  /** 得分 0-4 */
  score: number;
  /** 未通过的规则 key（用于 i18n） */
  failedRules: string[];
}

/**
 * 常见弱密码列表
 */
const COMMON_WEAK_PASSWORDS = new Set([
  'password', 'password1', 'password123', '123456', '12345678',
  '123456789', '1234567890', 'qwerty', 'qwerty123', 'abc123',
  'abcdef', 'abcabc', '111111', '000000', 'letmein',
  'welcome', 'admin', 'login', 'master', 'dragon',
  'monkey', 'shadow', 'sunshine', 'princess', 'football',
  'baseball', 'iloveyou', 'trustno1', 'superman', 'batman',
  'passw0rd', 'p@ssword', 'p@ssw0rd', 'qazwsx', 'zxcvbn',
]);

/**
 * 检查密码强度
 * @param password 密码字符串
 * @returns 密码强度结果
 */
export const checkPasswordStrength = (password: string): PasswordStrengthResult => {
  const failedRules: string[] = [];
  let score = 0;

  // 规则 1: 最少 8 个字符
  if (password.length >= 8) {
    score++;
  } else {
    failedRules.push('password.ruleMinLength');
  }

  // 规则 2: 包含大写和小写字母
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) {
    score++;
  } else {
    failedRules.push('password.ruleMixedCase');
  }

  // 规则 3: 包含数字
  if (/\d/.test(password)) {
    score++;
  } else {
    failedRules.push('password.ruleNumber');
  }

  // 规则 4: 包含特殊字符
  if (/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(password)) {
    score++;
  } else {
    failedRules.push('password.ruleSpecialChar');
  }

  // 额外弱密码检测：常见弱密码、纯重复字符、连续数字/字母
  if (COMMON_WEAK_PASSWORDS.has(password.toLowerCase())) {
    score = 0;
    if (!failedRules.includes('password.ruleCommon')) {
      failedRules.unshift('password.ruleCommon');
    }
  }

  // 纯重复字符检测（如 "aaaaaaa"）
  if (/^(.)\1+$/.test(password)) {
    score = 0;
    if (!failedRules.includes('password.ruleRepeating')) {
      failedRules.unshift('password.ruleRepeating');
    }
  }

  // 映射分数到等级
  let level: PasswordStrengthLevel;
  if (score <= 1) {
    level = 'weak';
  } else if (score === 2) {
    level = 'fair';
  } else if (score === 3) {
    level = 'good';
  } else {
    level = 'strong';
  }

  return { level, score, failedRules };
};

/**
 * 判断密码是否满足最低强度要求（至少 fair 级别）
 */
export const isPasswordAcceptable = (password: string): boolean => {
  const result = checkPasswordStrength(password);
  return result.score >= 2;
};
