-- 015: Fix top 10 rankings for key categories
-- Ensure the most popular/well-known sites appear at the top of each category.
-- Also add missing important sites (DeepSeek, 元宝, 小红书 in Social, etc.)
--
-- Strategy:
--   1. Push ALL existing sites down by adding 100 to sort_order (per category)
--   2. Insert the definitive top 10 with sort_order 1-10
--   3. For new sites, use ON CONFLICT (url) DO NOTHING to avoid duplicates

-- ============================================================
-- 🤖 AI — Fix top 10 and add missing sites
-- ============================================================

-- Step 1: Push existing AI sites down
UPDATE preset_sites
SET sort_order = sort_order + 100
WHERE category_id = 'a0000000-0000-0000-0000-000000000003';

-- Step 2: Set top 10 for AI
-- 1. ChatGPT  2. DeepSeek  3. Claude  4. Gemini  5. Kimi
-- 6. 豆包     7. 通义千问  8. 文心一言  9. 智谱清言  10. Perplexity
UPDATE preset_sites SET sort_order = 1
WHERE url = 'https://chat.openai.com';

UPDATE preset_sites SET sort_order = 3
WHERE url = 'https://claude.ai';

UPDATE preset_sites SET sort_order = 4
WHERE url = 'https://gemini.google.com';

UPDATE preset_sites SET sort_order = 5
WHERE url = 'https://kimi.moonshot.cn';

UPDATE preset_sites SET sort_order = 6
WHERE url = 'https://www.doubao.com';

UPDATE preset_sites SET sort_order = 7
WHERE url = 'https://tongyi.aliyun.com';

UPDATE preset_sites SET sort_order = 8
WHERE url = 'https://yiyan.baidu.com';

UPDATE preset_sites SET sort_order = 9
WHERE url = 'https://chatglm.cn';

UPDATE preset_sites SET sort_order = 10
WHERE url = 'https://www.perplexity.ai';

-- Step 3: Add missing AI sites
-- DeepSeek (completely missing!)
INSERT INTO preset_sites (category_id, title, url, icon, sort_order, description) VALUES
    ('a0000000-0000-0000-0000-000000000003', 'DeepSeek', 'https://chat.deepseek.com', '', 2, '深度求索AI助手')
ON CONFLICT (url) DO UPDATE SET sort_order = 2, title = 'DeepSeek';

-- 腾讯元宝 (completely missing!)
INSERT INTO preset_sites (category_id, title, url, icon, sort_order, description) VALUES
    ('a0000000-0000-0000-0000-000000000003', '腾讯元宝', 'https://yuanbao.tencent.com', '', 11, '腾讯AI助手')
ON CONFLICT (url) DO UPDATE SET sort_order = 11, title = '腾讯元宝';

-- MiniMax / 海螺AI
UPDATE preset_sites SET sort_order = 12
WHERE url = 'https://www.minimaxi.com';

-- Microsoft Copilot
UPDATE preset_sites SET sort_order = 13
WHERE url = 'https://copilot.microsoft.com';

-- Midjourney
UPDATE preset_sites SET sort_order = 14
WHERE url = 'https://www.midjourney.com';

-- ============================================================
-- 💬 Social — Fix top 10 and add missing sites
-- ============================================================

-- Step 1: Push existing Social sites down
UPDATE preset_sites
SET sort_order = sort_order + 100
WHERE category_id = 'a0000000-0000-0000-0000-000000000005';

-- Step 2: Set top 10 for Social
-- 1. 微信   2. 微博   3. 小红书  4. 抖音   5. X (Twitter)
-- 6. Instagram  7. Facebook  8. Discord  9. Reddit  10. Telegram
UPDATE preset_sites SET sort_order = 2
WHERE url = 'https://weibo.com';

UPDATE preset_sites SET sort_order = 5
WHERE url = 'https://x.com';

UPDATE preset_sites SET sort_order = 6
WHERE url = 'https://www.instagram.com';

UPDATE preset_sites SET sort_order = 7
WHERE url = 'https://www.facebook.com';

UPDATE preset_sites SET sort_order = 8
WHERE url = 'https://discord.com';

UPDATE preset_sites SET sort_order = 9
WHERE url = 'https://www.reddit.com';

UPDATE preset_sites SET sort_order = 10
WHERE url = 'https://web.telegram.org';

-- Add missing Social sites
-- 微信
INSERT INTO preset_sites (category_id, title, url, icon, sort_order, description) VALUES
    ('a0000000-0000-0000-0000-000000000005', '微信', 'https://weixin.qq.com', '', 1, '中国最大的即时通讯社交平台')
ON CONFLICT (url) DO UPDATE SET sort_order = 1;

-- 小红书 (not in Social category!)
INSERT INTO preset_sites (category_id, title, url, icon, sort_order, description) VALUES
    ('a0000000-0000-0000-0000-000000000005', '小红书', 'https://www.xiaohongshu.com', '', 3, '生活方式分享社区')
ON CONFLICT (url) DO UPDATE SET sort_order = 3, category_id = 'a0000000-0000-0000-0000-000000000005';

-- 抖音 (not in Social category!)
INSERT INTO preset_sites (category_id, title, url, icon, sort_order, description) VALUES
    ('a0000000-0000-0000-0000-000000000005', '抖音', 'https://www.douyin.com', '', 4, '短视频社交平台')
ON CONFLICT (url) DO UPDATE SET sort_order = 4, category_id = 'a0000000-0000-0000-0000-000000000005';

-- LinkedIn, WhatsApp, Snapchat push down
UPDATE preset_sites SET sort_order = 11
WHERE url = 'https://www.linkedin.com';

UPDATE preset_sites SET sort_order = 12
WHERE url = 'https://web.whatsapp.com';

UPDATE preset_sites SET sort_order = 13
WHERE url = 'https://www.snapchat.com';

UPDATE preset_sites SET sort_order = 14
WHERE url = 'https://www.threads.net';

UPDATE preset_sites SET sort_order = 15
WHERE url = 'https://mp.weixin.qq.com';

-- QQ
UPDATE preset_sites SET sort_order = 16
WHERE url = 'https://im.qq.com';

-- 豆瓣
UPDATE preset_sites SET sort_order = 17
WHERE url = 'https://www.douban.com';

-- ============================================================
-- 🎬 Video — Fix top 10
-- ============================================================

-- Step 1: Push existing Video sites down
UPDATE preset_sites
SET sort_order = sort_order + 100
WHERE category_id = 'a0000000-0000-0000-0000-000000000001';

-- Step 2: Set top 10 for Video
-- 1. YouTube  2. Bilibili  3. 腾讯视频  4. 爱奇艺  5. 优酷
-- 6. 抖音    7. 哔哩哔哩   8. Netflix  9. 芒果TV  10. Disney+
UPDATE preset_sites SET sort_order = 1
WHERE url = 'https://www.youtube.com';

UPDATE preset_sites SET sort_order = 2
WHERE url = 'https://www.bilibili.com';

UPDATE preset_sites SET sort_order = 3
WHERE url = 'https://v.qq.com';

UPDATE preset_sites SET sort_order = 4
WHERE url = 'https://www.iqiyi.com';

UPDATE preset_sites SET sort_order = 5
WHERE url = 'https://www.youku.com';

UPDATE preset_sites SET sort_order = 6
WHERE url = 'https://www.douyin.com';

UPDATE preset_sites SET sort_order = 8
WHERE url = 'https://www.netflix.com';

UPDATE preset_sites SET sort_order = 9
WHERE url = 'https://www.mgtv.com';

UPDATE preset_sites SET sort_order = 10
WHERE url = 'https://www.disneyplus.com';

-- TikTok
UPDATE preset_sites SET sort_order = 11
WHERE url = 'https://www.tiktok.com';

-- Prime Video
UPDATE preset_sites SET sort_order = 12
WHERE url = 'https://www.primevideo.com';

-- HBO Max
UPDATE preset_sites SET sort_order = 13
WHERE url = 'https://www.max.com';

-- Apple TV+
UPDATE preset_sites SET sort_order = 14
WHERE url = 'https://tv.apple.com';

-- 西瓜视频
UPDATE preset_sites SET sort_order = 15
WHERE url = 'https://www.ixigua.com';

-- 快手
UPDATE preset_sites SET sort_order = 16
WHERE url = 'https://www.kuaishou.com';

-- Remove duplicate entries (http versions that duplicate https)
DELETE FROM preset_sites WHERE url = 'http://v.qq.com/';
DELETE FROM preset_sites WHERE url = 'http://www.youku.com/';
DELETE FROM preset_sites WHERE url = 'https://www.iqiyi.com/';

-- ============================================================
-- 📺 Live — Fix top 10
-- ============================================================

-- Step 1: Push existing Live sites down
UPDATE preset_sites
SET sort_order = sort_order + 100
WHERE category_id = 'a0000000-0000-0000-0000-000000000002';

-- Step 2: Set top 10 for Live
-- 1. 斗鱼  2. 虎牙  3. 抖音直播  4. Bilibili直播  5. 快手直播
-- 6. YouTube Live  7. Twitch  8. Kick  9. YY直播  10. TikTok Live
UPDATE preset_sites SET sort_order = 1
WHERE url = 'https://www.douyu.com';

UPDATE preset_sites SET sort_order = 2
WHERE url = 'https://www.huya.com';

UPDATE preset_sites SET sort_order = 3
WHERE url = 'https://live.douyin.com';

UPDATE preset_sites SET sort_order = 4
WHERE url = 'https://live.bilibili.com';

UPDATE preset_sites SET sort_order = 5
WHERE url = 'https://live.kuaishou.com';

UPDATE preset_sites SET sort_order = 6
WHERE url = 'https://www.youtube.com/live';

-- Note: Twitch was in the original data, it might have been removed by dead-site cleanup
-- Insert it back just in case
INSERT INTO preset_sites (category_id, title, url, icon, sort_order, description) VALUES
    ('a0000000-0000-0000-0000-000000000002', 'Twitch', 'https://www.twitch.tv', '', 7, '全球最大游戏直播平台')
ON CONFLICT (url) DO UPDATE SET sort_order = 7;

UPDATE preset_sites SET sort_order = 8
WHERE url = 'https://kick.com';

UPDATE preset_sites SET sort_order = 9
WHERE url = 'https://www.yy.com';

UPDATE preset_sites SET sort_order = 10
WHERE url = 'https://www.tiktok.com/live';

-- Facebook Gaming
UPDATE preset_sites SET sort_order = 11
WHERE url = 'https://www.facebook.com/gaming';

-- Remove duplicate 抖音直播 entries
DELETE FROM preset_sites WHERE url = 'https://www.douyin.com/live';
