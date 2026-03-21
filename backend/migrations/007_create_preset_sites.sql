-- 007: Create preset site categories and sites for the "Explore World" feature
-- Categories group preset sites (e.g. Video, Live, AI, News)
-- Sites belong to a category and are served to all users

CREATE TABLE IF NOT EXISTS preset_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    icon VARCHAR(50) NOT NULL DEFAULT '📁',
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS preset_sites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID NOT NULL REFERENCES preset_categories(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    url TEXT NOT NULL,
    icon VARCHAR(500) DEFAULT '',
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_preset_sites_category ON preset_sites(category_id);
CREATE INDEX IF NOT EXISTS idx_preset_categories_sort ON preset_categories(sort_order);
CREATE INDEX IF NOT EXISTS idx_preset_sites_sort ON preset_sites(sort_order);

-- Seed data: default categories and sites
-- 1. Video
INSERT INTO preset_categories (id, name, icon, sort_order) VALUES
    ('a0000000-0000-0000-0000-000000000001', 'Video', '🎬', 1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO preset_sites (category_id, title, url, icon, sort_order) VALUES
    ('a0000000-0000-0000-0000-000000000001', 'YouTube',     'https://www.youtube.com',      '', 1),
    ('a0000000-0000-0000-0000-000000000001', 'Bilibili',    'https://www.bilibili.com',     '', 2),
    ('a0000000-0000-0000-0000-000000000001', 'Netflix',     'https://www.netflix.com',      '', 3),
    ('a0000000-0000-0000-0000-000000000001', 'TikTok',      'https://www.tiktok.com',       '', 4),
    ('a0000000-0000-0000-0000-000000000001', 'Twitch',      'https://www.twitch.tv',        '', 5),
    ('a0000000-0000-0000-0000-000000000001', 'Disney+',     'https://www.disneyplus.com',   '', 6),
    ('a0000000-0000-0000-0000-000000000001', 'Prime Video', 'https://www.primevideo.com',   '', 7),
    ('a0000000-0000-0000-0000-000000000001', 'Vimeo',       'https://vimeo.com',            '', 8);

-- 2. Live Streaming
INSERT INTO preset_categories (id, name, icon, sort_order) VALUES
    ('a0000000-0000-0000-0000-000000000002', 'Live', '📺', 2)
ON CONFLICT (id) DO NOTHING;

INSERT INTO preset_sites (category_id, title, url, icon, sort_order) VALUES
    ('a0000000-0000-0000-0000-000000000002', 'Twitch',        'https://www.twitch.tv',       '', 1),
    ('a0000000-0000-0000-0000-000000000002', '斗鱼',          'https://www.douyu.com',       '', 2),
    ('a0000000-0000-0000-0000-000000000002', '虎牙',          'https://www.huya.com',        '', 3),
    ('a0000000-0000-0000-0000-000000000002', 'Bilibili 直播', 'https://live.bilibili.com',   '', 4),
    ('a0000000-0000-0000-0000-000000000002', 'YouTube Live',  'https://www.youtube.com/live','', 5),
    ('a0000000-0000-0000-0000-000000000002', 'Kick',          'https://kick.com',            '', 6);

-- 3. AI
INSERT INTO preset_categories (id, name, icon, sort_order) VALUES
    ('a0000000-0000-0000-0000-000000000003', 'AI', '🤖', 3)
ON CONFLICT (id) DO NOTHING;

INSERT INTO preset_sites (category_id, title, url, icon, sort_order) VALUES
    ('a0000000-0000-0000-0000-000000000003', 'ChatGPT',     'https://chat.openai.com',      '', 1),
    ('a0000000-0000-0000-0000-000000000003', 'Claude',      'https://claude.ai',            '', 2),
    ('a0000000-0000-0000-0000-000000000003', 'Gemini',      'https://gemini.google.com',    '', 3),
    ('a0000000-0000-0000-0000-000000000003', 'Perplexity',  'https://www.perplexity.ai',    '', 4),
    ('a0000000-0000-0000-0000-000000000003', 'Midjourney',  'https://www.midjourney.com',   '', 5),
    ('a0000000-0000-0000-0000-000000000003', 'Poe',         'https://poe.com',              '', 6),
    ('a0000000-0000-0000-0000-000000000003', 'HuggingFace', 'https://huggingface.co',       '', 7),
    ('a0000000-0000-0000-0000-000000000003', 'Stable Diffusion', 'https://stablediffusionweb.com', '', 8);

-- 4. News
INSERT INTO preset_categories (id, name, icon, sort_order) VALUES
    ('a0000000-0000-0000-0000-000000000004', 'News', '📰', 4)
ON CONFLICT (id) DO NOTHING;

INSERT INTO preset_sites (category_id, title, url, icon, sort_order) VALUES
    ('a0000000-0000-0000-0000-000000000004', 'Google News',  'https://news.google.com',      '', 1),
    ('a0000000-0000-0000-0000-000000000004', 'BBC',          'https://www.bbc.com',          '', 2),
    ('a0000000-0000-0000-0000-000000000004', 'CNN',          'https://www.cnn.com',          '', 3),
    ('a0000000-0000-0000-0000-000000000004', 'Reuters',      'https://www.reuters.com',      '', 4),
    ('a0000000-0000-0000-0000-000000000004', '知乎',         'https://www.zhihu.com',        '', 5),
    ('a0000000-0000-0000-0000-000000000004', '今日头条',     'https://www.toutiao.com',      '', 6),
    ('a0000000-0000-0000-0000-000000000004', 'Hacker News',  'https://news.ycombinator.com', '', 7),
    ('a0000000-0000-0000-0000-000000000004', 'The Verge',    'https://www.theverge.com',     '', 8);

-- 5. Social
INSERT INTO preset_categories (id, name, icon, sort_order) VALUES
    ('a0000000-0000-0000-0000-000000000005', 'Social', '💬', 5)
ON CONFLICT (id) DO NOTHING;

INSERT INTO preset_sites (category_id, title, url, icon, sort_order) VALUES
    ('a0000000-0000-0000-0000-000000000005', 'X (Twitter)', 'https://x.com',                '', 1),
    ('a0000000-0000-0000-0000-000000000005', 'Reddit',      'https://www.reddit.com',       '', 2),
    ('a0000000-0000-0000-0000-000000000005', 'Discord',     'https://discord.com',          '', 3),
    ('a0000000-0000-0000-0000-000000000005', '微博',        'https://weibo.com',            '', 4),
    ('a0000000-0000-0000-0000-000000000005', 'Instagram',   'https://www.instagram.com',    '', 5),
    ('a0000000-0000-0000-0000-000000000005', 'Telegram',    'https://web.telegram.org',     '', 6);

-- 6. Developer
INSERT INTO preset_categories (id, name, icon, sort_order) VALUES
    ('a0000000-0000-0000-0000-000000000006', 'Developer', '💻', 6)
ON CONFLICT (id) DO NOTHING;

INSERT INTO preset_sites (category_id, title, url, icon, sort_order) VALUES
    ('a0000000-0000-0000-0000-000000000006', 'GitHub',          'https://github.com',              '', 1),
    ('a0000000-0000-0000-0000-000000000006', 'Stack Overflow',  'https://stackoverflow.com',       '', 2),
    ('a0000000-0000-0000-0000-000000000006', 'MDN Web Docs',    'https://developer.mozilla.org',   '', 3),
    ('a0000000-0000-0000-0000-000000000006', 'Dev.to',          'https://dev.to',                  '', 4),
    ('a0000000-0000-0000-0000-000000000006', 'CodePen',         'https://codepen.io',              '', 5),
    ('a0000000-0000-0000-0000-000000000006', 'GitLab',          'https://gitlab.com',              '', 6),
    ('a0000000-0000-0000-0000-000000000006', 'npm',             'https://www.npmjs.com',           '', 7);

-- 7. Shopping
INSERT INTO preset_categories (id, name, icon, sort_order) VALUES
    ('a0000000-0000-0000-0000-000000000007', 'Shopping', '🛒', 7)
ON CONFLICT (id) DO NOTHING;

INSERT INTO preset_sites (category_id, title, url, icon, sort_order) VALUES
    ('a0000000-0000-0000-0000-000000000007', 'Amazon',    'https://www.amazon.com',   '', 1),
    ('a0000000-0000-0000-0000-000000000007', '淘宝',      'https://www.taobao.com',   '', 2),
    ('a0000000-0000-0000-0000-000000000007', '京东',      'https://www.jd.com',       '', 3),
    ('a0000000-0000-0000-0000-000000000007', 'eBay',      'https://www.ebay.com',     '', 4),
    ('a0000000-0000-0000-0000-000000000007', '拼多多',    'https://www.pinduoduo.com','', 5),
    ('a0000000-0000-0000-0000-000000000007', 'AliExpress','https://www.aliexpress.com','', 6);

-- 8. Music
INSERT INTO preset_categories (id, name, icon, sort_order) VALUES
    ('a0000000-0000-0000-0000-000000000008', 'Music', '🎵', 8)
ON CONFLICT (id) DO NOTHING;

INSERT INTO preset_sites (category_id, title, url, icon, sort_order) VALUES
    ('a0000000-0000-0000-0000-000000000008', 'Spotify',        'https://open.spotify.com',        '', 1),
    ('a0000000-0000-0000-0000-000000000008', 'Apple Music',    'https://music.apple.com',         '', 2),
    ('a0000000-0000-0000-0000-000000000008', '网易云音乐',     'https://music.163.com',           '', 3),
    ('a0000000-0000-0000-0000-000000000008', 'SoundCloud',     'https://soundcloud.com',          '', 4),
    ('a0000000-0000-0000-0000-000000000008', 'QQ音乐',         'https://y.qq.com',                '', 5),
    ('a0000000-0000-0000-0000-000000000008', 'YouTube Music',  'https://music.youtube.com',       '', 6);

-- 9. Tools & Productivity
INSERT INTO preset_categories (id, name, icon, sort_order) VALUES
    ('a0000000-0000-0000-0000-000000000009', 'Tools', '🔧', 9)
ON CONFLICT (id) DO NOTHING;

INSERT INTO preset_sites (category_id, title, url, icon, sort_order) VALUES
    ('a0000000-0000-0000-0000-000000000009', 'Google Drive',   'https://drive.google.com',        '', 1),
    ('a0000000-0000-0000-0000-000000000009', 'Notion',         'https://www.notion.so',           '', 2),
    ('a0000000-0000-0000-0000-000000000009', 'Figma',          'https://www.figma.com',           '', 3),
    ('a0000000-0000-0000-0000-000000000009', 'Canva',          'https://www.canva.com',           '', 4),
    ('a0000000-0000-0000-0000-000000000009', 'Trello',         'https://trello.com',              '', 5),
    ('a0000000-0000-0000-0000-000000000009', 'Google Docs',    'https://docs.google.com',         '', 6),
    ('a0000000-0000-0000-0000-000000000009', 'Excalidraw',     'https://excalidraw.com',          '', 7);

-- 10. Design & Wallpaper
INSERT INTO preset_categories (id, name, icon, sort_order) VALUES
    ('a0000000-0000-0000-0000-000000000010', 'Design', '🎨', 10)
ON CONFLICT (id) DO NOTHING;

INSERT INTO preset_sites (category_id, title, url, icon, sort_order) VALUES
    ('a0000000-0000-0000-0000-000000000010', 'Dribbble',      'https://dribbble.com',            '', 1),
    ('a0000000-0000-0000-0000-000000000010', 'Behance',       'https://www.behance.net',         '', 2),
    ('a0000000-0000-0000-0000-000000000010', 'Unsplash',      'https://unsplash.com',            '', 3),
    ('a0000000-0000-0000-0000-000000000010', 'Pexels',        'https://www.pexels.com',          '', 4),
    ('a0000000-0000-0000-0000-000000000010', 'Wallhaven',     'https://wallhaven.cc',            '', 5),
    ('a0000000-0000-0000-0000-000000000010', 'Pinterest',     'https://www.pinterest.com',       '', 6);
