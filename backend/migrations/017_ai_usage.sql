-- AI 用量追踪表：记录每个用户每天的 token 消耗和请求次数
CREATE TABLE IF NOT EXISTS ai_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- 按天汇总，date 存储 UTC 日期
    usage_date DATE NOT NULL DEFAULT CURRENT_DATE,
    -- 累计请求次数
    request_count INTEGER NOT NULL DEFAULT 0,
    -- 累计 prompt tokens（输入）
    prompt_tokens INTEGER NOT NULL DEFAULT 0,
    -- 累计 completion tokens（输出）
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    -- 累计总 tokens（prompt + completion）
    total_tokens INTEGER NOT NULL DEFAULT 0,
    -- 最后一次请求时间
    last_request_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    -- 每用户每天唯一一行
    UNIQUE(user_id, usage_date)
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_user_date ON ai_usage(user_id, usage_date);
