-- 008: Import sites from web.yaml into preset_sites with deduplication
-- Adds description column, URL unique constraint, new categories, and ~150 sites

-- 1. Add description column to preset_sites
ALTER TABLE preset_sites ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';

-- 2. Add unique constraint on (category_id, url) for per-category dedup
-- First, remove potential duplicates before adding the constraint
DELETE FROM preset_sites a USING preset_sites b
WHERE a.ctid < b.ctid AND a.category_id = b.category_id AND a.url = b.url;

CREATE UNIQUE INDEX IF NOT EXISTS idx_preset_sites_category_url ON preset_sites(category_id, url);

-- 3. Also add a global unique index on normalized URL to prevent cross-category dupes
-- We keep category_id+url unique per category, but also prevent the same URL in multiple categories
-- Using a simple unique index on url
-- First remove cross-category duplicates (keep the one with lowest sort_order)
DELETE FROM preset_sites a USING preset_sites b
WHERE a.ctid > b.ctid AND a.url = b.url;

CREATE UNIQUE INDEX IF NOT EXISTS idx_preset_sites_url_unique ON preset_sites(url);

-- ============================================================
-- 4. New categories from web.yaml
-- ============================================================

-- 常用推荐
INSERT INTO preset_categories (id, name, icon, sort_order) VALUES
    ('b0000000-0000-0000-0000-000000000001', 'Popular', '⭐', 11)
ON CONFLICT (id) DO NOTHING;

-- 生物信息
INSERT INTO preset_categories (id, name, icon, sort_order) VALUES
    ('b0000000-0000-0000-0000-000000000002', 'Bioinformatics', '🧬', 12)
ON CONFLICT (id) DO NOTHING;

-- 云服务器
INSERT INTO preset_categories (id, name, icon, sort_order) VALUES
    ('b0000000-0000-0000-0000-000000000003', 'Cloud', '☁️', 13)
ON CONFLICT (id) DO NOTHING;

-- 办公学习
INSERT INTO preset_categories (id, name, icon, sort_order) VALUES
    ('b0000000-0000-0000-0000-000000000004', 'Office', '📝', 14)
ON CONFLICT (id) DO NOTHING;

-- 游戏竞技
INSERT INTO preset_categories (id, name, icon, sort_order) VALUES
    ('b0000000-0000-0000-0000-000000000005', 'Gaming', '🎮', 15)
ON CONFLICT (id) DO NOTHING;

-- 网盘资源
INSERT INTO preset_categories (id, name, icon, sort_order) VALUES
    ('b0000000-0000-0000-0000-000000000006', 'Cloud Storage', '💾', 16)
ON CONFLICT (id) DO NOTHING;

-- 图标素材
INSERT INTO preset_categories (id, name, icon, sort_order) VALUES
    ('b0000000-0000-0000-0000-000000000007', 'Icons', '🎯', 17)
ON CONFLICT (id) DO NOTHING;

-- 图标设计
INSERT INTO preset_categories (id, name, icon, sort_order) VALUES
    ('b0000000-0000-0000-0000-000000000008', 'Icon Design', '✏️', 18)
ON CONFLICT (id) DO NOTHING;

-- 平面素材
INSERT INTO preset_categories (id, name, icon, sort_order) VALUES
    ('b0000000-0000-0000-0000-000000000009', 'Graphics', '🖼️', 19)
ON CONFLICT (id) DO NOTHING;

-- 字体资源
INSERT INTO preset_categories (id, name, icon, sort_order) VALUES
    ('b0000000-0000-0000-0000-000000000010', 'Fonts', '🔤', 20)
ON CONFLICT (id) DO NOTHING;

-- 图形创意
INSERT INTO preset_categories (id, name, icon, sort_order) VALUES
    ('b0000000-0000-0000-0000-000000000011', 'Creative', '🎨', 21)
ON CONFLICT (id) DO NOTHING;

-- 界面设计
INSERT INTO preset_categories (id, name, icon, sort_order) VALUES
    ('b0000000-0000-0000-0000-000000000012', 'UI Design', '📐', 22)
ON CONFLICT (id) DO NOTHING;

-- 在线配色
INSERT INTO preset_categories (id, name, icon, sort_order) VALUES
    ('b0000000-0000-0000-0000-000000000013', 'Colors', '🌈', 23)
ON CONFLICT (id) DO NOTHING;

-- 谷歌插件
INSERT INTO preset_categories (id, name, icon, sort_order) VALUES
    ('b0000000-0000-0000-0000-000000000014', 'Extensions', '🧩', 24)
ON CONFLICT (id) DO NOTHING;

-- 资讯书籍
INSERT INTO preset_categories (id, name, icon, sort_order) VALUES
    ('b0000000-0000-0000-0000-000000000015', 'Reading', '📚', 25)
ON CONFLICT (id) DO NOTHING;

-- 博客论坛
INSERT INTO preset_categories (id, name, icon, sort_order) VALUES
    ('b0000000-0000-0000-0000-000000000016', 'Blogs', '📝', 26)
ON CONFLICT (id) DO NOTHING;

-- 设计规范
INSERT INTO preset_categories (id, name, icon, sort_order) VALUES
    ('b0000000-0000-0000-0000-000000000017', 'Design Systems', '📏', 27)
ON CONFLICT (id) DO NOTHING;

-- 视频教程
INSERT INTO preset_categories (id, name, icon, sort_order) VALUES
    ('b0000000-0000-0000-0000-000000000018', 'Tutorials', '🎓', 28)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 5. Insert sites — using ON CONFLICT (url) DO NOTHING for global dedup
-- ============================================================

-- === 常用推荐 (Popular) ===
INSERT INTO preset_sites (category_id, title, url, icon, sort_order, description) VALUES
    ('b0000000-0000-0000-0000-000000000001', '语雀',         'https://www.yuque.com/',           '', 1, '专业的云端知识库'),
    ('b0000000-0000-0000-0000-000000000001', 'QQ 邮箱',      'http://mail.qq.com/',              '', 2, '腾讯 QQ 邮箱'),
    ('b0000000-0000-0000-0000-000000000001', '开源中国',      'https://www.oschina.net/',         '', 3, '中文开源技术交流社区'),
    ('b0000000-0000-0000-0000-000000000001', '公众号平台',    'https://mp.weixin.qq.com/',        '', 4, '再小的个体也有自己的品牌'),
    ('b0000000-0000-0000-0000-000000000001', '搜狗微信',      'https://weixin.sogou.com/',        '', 5, '搜狗微信搜索，一搜即达'),
    ('b0000000-0000-0000-0000-000000000001', 'V2EX',          'https://www.v2ex.com/',            '', 6, 'V2EX 创意工作者的社区'),
    ('b0000000-0000-0000-0000-000000000001', 'BioIT',         'https://www.bioitee.com',          '', 7, '微信公众号：BioIT 爱好者')
ON CONFLICT (url) DO NOTHING;

-- === 生物信息 (Bioinformatics) ===
INSERT INTO preset_sites (category_id, title, url, icon, sort_order, description) VALUES
    ('b0000000-0000-0000-0000-000000000002', 'NCBI',          'https://www.ncbi.nlm.nih.gov/',   '', 1, 'National Center for Biotechnology Information'),
    ('b0000000-0000-0000-0000-000000000002', 'Bioconda',      'https://anaconda.org/bioconda/',   '', 2, 'Bioconda :: Anaconda.org'),
    ('b0000000-0000-0000-0000-000000000002', 'CPAN',          'https://metacpan.org/',            '', 3, 'Search the CPAN'),
    ('b0000000-0000-0000-0000-000000000002', 'Galaxy Project','https://galaxyproject.org/',        '', 4, 'Galaxy Community Hub'),
    ('b0000000-0000-0000-0000-000000000002', 'R Project',     'https://www.r-project.org/',       '', 5, 'The R Project for Statistical Computing'),
    ('b0000000-0000-0000-0000-000000000002', 'Bioconductor',  'http://www.bioconductor.org/',     '', 6, 'Open source software for bioinformatics')
ON CONFLICT (url) DO NOTHING;

-- === 云服务器 (Cloud) ===
INSERT INTO preset_sites (category_id, title, url, icon, sort_order, description) VALUES
    ('b0000000-0000-0000-0000-000000000003', '阿里云',        'https://www.aliyun.com/',          '', 1, '上云就上阿里云'),
    ('b0000000-0000-0000-0000-000000000003', '腾讯云',        'https://cloud.tencent.com/',       '', 2, '产业智变，云启未来'),
    ('b0000000-0000-0000-0000-000000000003', '华为云',        'https://www.huaweicloud.com/',     '', 3, '提供云计算服务'),
    ('b0000000-0000-0000-0000-000000000003', '云筏科技',      'https://www.cloudraft.cn/',        '', 4, '你的生信科研好选择'),
    ('b0000000-0000-0000-0000-000000000003', '极云普惠云电脑', 'https://www.ji-cloud.cn/',        '', 5, '云电脑-云游戏-手机变电脑软件'),
    ('b0000000-0000-0000-0000-000000000003', '青椒云',        'https://www.qingjiaocloud.com/',   '', 6, '云桌面，一站式云电脑服务平台')
ON CONFLICT (url) DO NOTHING;

-- === 办公学习 (Office) ===
INSERT INTO preset_sites (category_id, title, url, icon, sort_order, description) VALUES
    ('b0000000-0000-0000-0000-000000000004', '有道词典',      'https://www.youdao.com/',          '', 1, '免费即时的多语种在线翻译'),
    ('b0000000-0000-0000-0000-000000000004', '有道翻译',      'http://fanyi.youdao.com/',         '', 2, '有道翻译'),
    ('b0000000-0000-0000-0000-000000000004', '谷歌翻译',      'https://translate.google.cn/',     '', 3, '谷歌翻译'),
    ('b0000000-0000-0000-0000-000000000004', 'ProcessOn',     'https://www.processon.com/',       '', 4, '免费在线作图、实时协作')
ON CONFLICT (url) DO NOTHING;

-- === 影音视频 — 追加到现有 Video 分类 (a...01) ===
-- bilibili 已存在，腾讯视频/优酷/爱奇艺/QQ音乐/网易云 需要添加（音乐类已有单独分类，这里保留视频类）
INSERT INTO preset_sites (category_id, title, url, icon, sort_order, description) VALUES
    ('a0000000-0000-0000-0000-000000000001', '腾讯视频',     'http://v.qq.com/',                 '', 10, '腾讯视频，海量视频在线观看'),
    ('a0000000-0000-0000-0000-000000000001', '优酷',         'http://www.youku.com/',            '', 11, '优酷 - 这个世界很酷'),
    ('a0000000-0000-0000-0000-000000000001', '爱奇艺',       'https://www.iqiyi.com/',           '', 12, '爱奇艺在线视频')
ON CONFLICT (url) DO NOTHING;

-- === 游戏竞技 (Gaming) ===
INSERT INTO preset_sites (category_id, title, url, icon, sort_order, description) VALUES
    ('b0000000-0000-0000-0000-000000000005', '百度贴吧',      'https://tieba.baidu.com/',         '', 1, '百度贴吧'),
    ('b0000000-0000-0000-0000-000000000005', '台服战地之王',   'https://ava.mangot5.com/ava/index','', 2, '台服 AVA 战地之王')
ON CONFLICT (url) DO NOTHING;

-- === 网盘资源 (Cloud Storage) ===
INSERT INTO preset_sites (category_id, title, url, icon, sort_order, description) VALUES
    ('b0000000-0000-0000-0000-000000000006', '百度网盘',      'http://pan.baidu.com/',            '', 1, '百度网盘'),
    ('b0000000-0000-0000-0000-000000000006', '阿里云盘',      'https://www.aliyundrive.com/',     '', 2, '阿里云盘，你的数字世界'),
    ('b0000000-0000-0000-0000-000000000006', '天翼云盘',      'https://cloud.189.cn/',            '', 3, '家庭云|网盘|文件备份|资源分享'),
    ('b0000000-0000-0000-0000-000000000006', '坚果云',        'https://www.jianguoyun.com/',      '', 4, '坚果云官网')
ON CONFLICT (url) DO NOTHING;

-- === 图标素材 (Icons) ===
INSERT INTO preset_sites (category_id, title, url, icon, sort_order, description) VALUES
    ('b0000000-0000-0000-0000-000000000007', 'Iconfinder',     'https://www.iconfinder.com',      '', 1,  '2,100,000+ free and premium vector icons'),
    ('b0000000-0000-0000-0000-000000000007', 'iconfont',       'http://www.iconfont.cn/',         '', 2,  '阿里巴巴矢量图标库'),
    ('b0000000-0000-0000-0000-000000000007', 'iconmonstr',     'https://iconmonstr.com/',         '', 3,  'Free simple icons for your next project'),
    ('b0000000-0000-0000-0000-000000000007', 'Icon Archive',   'http://www.iconarchive.com/',     '', 4,  'Search 590,912 free icons'),
    ('b0000000-0000-0000-0000-000000000007', 'FindIcons',      'https://findicons.com/',          '', 5,  'Search through 300,000 free icons'),
    ('b0000000-0000-0000-0000-000000000007', 'IcoMoonApp',     'https://icomoon.io/app/',         '', 6,  'Icon Font, SVG, PDF & PNG Generator'),
    ('b0000000-0000-0000-0000-000000000007', 'easyicon',       'http://www.easyicon.net/',        '', 7,  'PNG、ICO、ICNS格式图标搜索下载'),
    ('b0000000-0000-0000-0000-000000000007', 'flaticon',       'https://www.flaticon.com/',       '', 8,  '634,000+ Free vector icons'),
    ('b0000000-0000-0000-0000-000000000007', 'UICloud',        'http://ui-cloud.com/',            '', 9,  'The largest user interface design database'),
    ('b0000000-0000-0000-0000-000000000007', 'Material icons', 'https://material.io/icons/',      '', 10, 'Access over 900 material system icons'),
    ('b0000000-0000-0000-0000-000000000007', 'Font Awesome',   'https://fontawesome.com/icons/',  '', 11, 'The complete set of 675 icons in Font Awesome'),
    ('b0000000-0000-0000-0000-000000000007', 'ion icons',      'http://ionicons.com/',            '', 12, 'The premium icon font for Ionic Framework'),
    ('b0000000-0000-0000-0000-000000000007', 'Simple Line Icons','http://simplelineicons.com/',   '', 13, 'Simple line Icons pack')
ON CONFLICT (url) DO NOTHING;

-- === 图标设计 (Icon Design) ===
INSERT INTO preset_sites (category_id, title, url, icon, sort_order, description) VALUES
    ('b0000000-0000-0000-0000-000000000008', 'Iconsfeed',          'http://www.iconsfeed.com/',       '', 1, 'iOS icons gallery'),
    ('b0000000-0000-0000-0000-000000000008', 'iOS Icon Gallery',   'http://iosicongallery.com/',      '', 2, 'Showcasing beautiful icon designs from the iOS App Store'),
    ('b0000000-0000-0000-0000-000000000008', 'World Vector Logo',  'https://worldvectorlogo.com/',    '', 3, 'Brand logos free to download'),
    ('b0000000-0000-0000-0000-000000000008', 'Instant Logo Search','http://instantlogosearch.com/',    '', 4, 'Search & download thousands of logos instantly')
ON CONFLICT (url) DO NOTHING;

-- === 平面素材 (Graphics) ===
INSERT INTO preset_sites (category_id, title, url, icon, sort_order, description) VALUES
    ('b0000000-0000-0000-0000-000000000009', 'freepik',      'https://www.freepik.com/',         '', 1,  'More than a million free vectors, PSD, photos and free icons'),
    ('b0000000-0000-0000-0000-000000000009', 'wallhalla',    'https://wallhalla.com/',           '', 2,  'Find awesome high quality wallpapers'),
    ('b0000000-0000-0000-0000-000000000009', '365PSD',       'https://365psd.com/',              '', 3,  'Free PSD & Graphics, Illustrations'),
    ('b0000000-0000-0000-0000-000000000009', 'Medialoot',    'https://medialoot.com/',           '', 4,  'Free & Premium Design Resources'),
    ('b0000000-0000-0000-0000-000000000009', '千图网',       'http://www.58pic.com/',            '', 5,  '专注免费设计素材下载的网站'),
    ('b0000000-0000-0000-0000-000000000009', '千库网',       'http://588ku.com/',                '', 6,  '免费 png 图片背景素材下载'),
    ('b0000000-0000-0000-0000-000000000009', '我图网',       'http://www.ooopic.com/',           '', 7,  '提供图片素材及模板下载'),
    ('b0000000-0000-0000-0000-000000000009', '90 设计',      'http://90sheji.com/',              '', 8,  '电商设计千图免费淘宝素材库'),
    ('b0000000-0000-0000-0000-000000000009', '昵图网',       'http://www.nipic.com/',            '', 9,  '原创素材共享平台'),
    ('b0000000-0000-0000-0000-000000000009', '懒人图库',     'http://www.lanrentuku.com/',       '', 10, '懒人图库专注于提供网页素材下载'),
    ('b0000000-0000-0000-0000-000000000009', '素材搜索',     'http://so.ui001.com/',             '', 11, '设计素材搜索聚合'),
    ('b0000000-0000-0000-0000-000000000009', 'PS 饭团网',    'http://psefan.com/',               '', 12, '不一样的设计素材库'),
    ('b0000000-0000-0000-0000-000000000009', '素材中国',     'http://www.sccnn.com/',            '', 13, '免费素材共享平台')
ON CONFLICT (url) DO NOTHING;

-- === 字体资源 (Fonts) ===
INSERT INTO preset_sites (category_id, title, url, icon, sort_order, description) VALUES
    ('b0000000-0000-0000-0000-000000000010', 'Google Fonts',     'https://fonts.google.com/',           '', 1,  'Making the web more beautiful through great typography'),
    ('b0000000-0000-0000-0000-000000000010', 'Typekit',          'https://typekit.com/',                '', 2,  'Quality fonts from the world''s best foundries'),
    ('b0000000-0000-0000-0000-000000000010', '方正字库',         'http://www.foundertype.com/',         '', 3,  '方正字库官方网站'),
    ('b0000000-0000-0000-0000-000000000010', '字体传奇网',       'http://ziticq.com/',                  '', 4,  '中国首个字体品牌设计师交流网'),
    ('b0000000-0000-0000-0000-000000000010', '私藏字体',         'http://sicangziti.com/',              '', 5,  '优质字体免费下载站'),
    ('b0000000-0000-0000-0000-000000000010', 'Fontsquirrel',     'https://www.fontsquirrel.com/',      '', 6,  'FREE fonts for graphic designers'),
    ('b0000000-0000-0000-0000-000000000010', 'Urban Fonts',      'https://www.urbanfonts.com/',        '', 7,  'Download Free Fonts and Free Dingbats'),
    ('b0000000-0000-0000-0000-000000000010', 'Lost Type',        'http://www.losttype.com/',           '', 8,  'A Collaborative Digital Type Foundry'),
    ('b0000000-0000-0000-0000-000000000010', 'FONTS2U',          'https://fonts2u.com/',               '', 9,  'Download free fonts for Windows and Mac'),
    ('b0000000-0000-0000-0000-000000000010', 'Fontex',           'http://www.fontex.org/',             '', 10, 'Free Fonts to Download + Premium Typefaces'),
    ('b0000000-0000-0000-0000-000000000010', 'FontM',            'http://fontm.com/',                  '', 11, 'Free Fonts'),
    ('b0000000-0000-0000-0000-000000000010', 'My Fonts',         'http://www.myfonts.com/',            '', 12, 'Fonts for Print, Products & Screens'),
    ('b0000000-0000-0000-0000-000000000010', 'Da Font',          'https://www.dafont.com/',            '', 13, 'Archive of freely downloadable fonts'),
    ('b0000000-0000-0000-0000-000000000010', 'OnlineWebFonts',   'https://www.onlinewebfonts.com/',    '', 14, 'WEB Free Fonts for Windows and Mac'),
    ('b0000000-0000-0000-0000-000000000010', 'Abstract Fonts',   'http://www.abstractfonts.com/',      '', 15, 'Abstract Fonts (13,866 free fonts)')
ON CONFLICT (url) DO NOTHING;

-- === 图形创意 (Creative) ===
INSERT INTO preset_sites (category_id, title, url, icon, sort_order, description) VALUES
    ('b0000000-0000-0000-0000-000000000011', 'Photoshop',         'https://www.adobe.com/cn/products/photoshop.html', '', 1, 'Adobe Photoshop'),
    ('b0000000-0000-0000-0000-000000000011', 'Affinity Designer', 'https://affinity.serif.com/',                      '', 2, '专业创意软件'),
    ('b0000000-0000-0000-0000-000000000011', 'Illustrator',       'https://www.adobe.com/cn/products/illustrator/',   '', 3, '矢量图形和插图'),
    ('b0000000-0000-0000-0000-000000000011', 'InDesign',          'http://www.adobe.com/cn/products/indesign.html',   '', 4, '页面设计、布局和出版'),
    ('b0000000-0000-0000-0000-000000000011', 'Cinema 4D',         'https://www.maxon.net/en/products/cinema-4d/overview/', '', 5, 'Cinema 4D - 3D artists tool'),
    ('b0000000-0000-0000-0000-000000000011', '3ds Max',           'https://www.autodesk.com/products/3ds-max/overview','', 6, '3D modeling, animation, and rendering'),
    ('b0000000-0000-0000-0000-000000000011', 'Blender',           'https://www.blender.org/',                         '', 7, 'Free and open source 3D creation suite')
ON CONFLICT (url) DO NOTHING;

-- === 界面设计 (UI Design) ===
INSERT INTO preset_sites (category_id, title, url, icon, sort_order, description) VALUES
    ('b0000000-0000-0000-0000-000000000012', 'Sketch',        'https://sketchapp.com/',              '', 1, 'The digital design toolkit'),
    ('b0000000-0000-0000-0000-000000000012', 'Adobe XD',      'http://www.adobe.com/products/xd.html','', 2, 'Design. Prototype. Experience.'),
    ('b0000000-0000-0000-0000-000000000012', 'InVision',      'https://www.invisionapp.com/',        '', 3, 'Powerful design prototyping tools'),
    ('b0000000-0000-0000-0000-000000000012', 'Marvel',        'https://marvelapp.com/',              '', 4, 'Simple design, prototyping and collaboration'),
    ('b0000000-0000-0000-0000-000000000012', 'Muse CC',       'https://creative.adobe.com/zh-cn/products/download/muse', '', 5, '无需编码即可进行网站设计')
ON CONFLICT (url) DO NOTHING;
-- Note: Figma already exists in Tools category (a...09), skip duplicate

-- === 在线配色 (Colors) ===
INSERT INTO preset_sites (category_id, title, url, icon, sort_order, description) VALUES
    ('b0000000-0000-0000-0000-000000000013', 'Khroma',           'http://khroma.co/generator/',                     '', 1,  'Discover, search, and save color combos'),
    ('b0000000-0000-0000-0000-000000000013', 'uiGradients',      'https://uigradients.com',                         '', 2,  'Beautiful colored gradients'),
    ('b0000000-0000-0000-0000-000000000013', 'Gradients',        'http://gradients.io/',                            '', 3,  'Curated gradients for designers and developers'),
    ('b0000000-0000-0000-0000-000000000013', 'Coolest',          'https://webkul.github.io/coolhue/',               '', 4,  'Coolest handpicked Gradient Hues'),
    ('b0000000-0000-0000-0000-000000000013', 'WebGradients',     'https://webgradients.com/',                       '', 5,  'Free collection of 180 linear gradients'),
    ('b0000000-0000-0000-0000-000000000013', 'Grabient',         'https://www.grabient.com/',                       '', 6,  'Grabient - gradient generator'),
    ('b0000000-0000-0000-0000-000000000013', 'The Days Color',   'http://www.thedayscolor.com/',                    '', 7,  'The daily color digest'),
    ('b0000000-0000-0000-0000-000000000013', 'Flat UI Colors',   'http://flatuicolors.com/',                        '', 8,  'Copy Paste Color Pallette from Flat UI Theme'),
    ('b0000000-0000-0000-0000-000000000013', 'Coolors',          'https://coolors.co/',                             '', 9,  'The super fast color schemes generator'),
    ('b0000000-0000-0000-0000-000000000013', 'Color Hunt',       'http://www.colorhunt.co/',                        '', 10, 'Beautiful Color Palettes'),
    ('b0000000-0000-0000-0000-000000000013', 'Adobe Color CC',   'https://color.adobe.com/zh/create/color-wheel',   '', 11, 'Create color schemes with the color wheel'),
    ('b0000000-0000-0000-0000-000000000013', 'Flat UI Color Picker','http://www.flatuicolorpicker.com/',             '', 12, 'Best Flat Colors For UI Design'),
    ('b0000000-0000-0000-0000-000000000013', 'Trianglify',       'http://qrohlf.com/trianglify-generator/',         '', 13, 'Trianglify Generator'),
    ('b0000000-0000-0000-0000-000000000013', 'Klart',            'https://klart.co/colors/',                        '', 14, 'Beautiful colors and designs to your inbox every week'),
    ('b0000000-0000-0000-0000-000000000013', 'Color Claim',      'http://www.vanschneider.com/colors',              '', 15, 'Unique colors for future projects by Tobias van Schneider')
ON CONFLICT (url) DO NOTHING;

-- === 在线工具 — 追加到现有 Tools 分类 (a...09) ===
INSERT INTO preset_sites (category_id, title, url, icon, sort_order, description) VALUES
    ('a0000000-0000-0000-0000-000000000009', 'TinyPNG',          'https://tinypng.com/',                       '', 10, 'Optimize images with perfect balance in quality and file size'),
    ('a0000000-0000-0000-0000-000000000009', 'goQR',             'http://goqr.me/',                            '', 11, 'Create QR codes for free'),
    ('a0000000-0000-0000-0000-000000000009', 'ezgif',            'https://ezgif.com',                          '', 12, 'Simple online GIF maker and toolset'),
    ('a0000000-0000-0000-0000-000000000009', 'Android 9-patch',  'http://inloop.github.io/shadow4android/',    '', 13, 'Android 9-patch shadow generator'),
    ('a0000000-0000-0000-0000-000000000009', 'Screen Sizes',     'http://screensiz.es/',                       '', 14, 'Viewport Sizes and Pixel Densities'),
    ('a0000000-0000-0000-0000-000000000009', 'SVGOMG',           'https://jakearchibald.github.io/svgomg/',    '', 15, 'SVG 在线压缩平台'),
    ('a0000000-0000-0000-0000-000000000009', '稿定抠图',         'https://www.gaoding.com',                    '', 16, '免费在线抠图软件')
ON CONFLICT (url) DO NOTHING;

-- === 谷歌插件 (Extensions) ===
INSERT INTO preset_sites (category_id, title, url, icon, sort_order, description) VALUES
    ('b0000000-0000-0000-0000-000000000014', 'Wappalyzer',    'https://www.wappalyzer.com/',       '', 1, 'Identify technology on websites'),
    ('b0000000-0000-0000-0000-000000000014', 'Panda',         'http://usepanda.com/',              '', 2, 'A smart news reader built for productivity'),
    ('b0000000-0000-0000-0000-000000000014', 'Sizzy',         'https://sizzy.co/',                 '', 3, 'Develop responsive websites crazy-fast'),
    ('b0000000-0000-0000-0000-000000000014', 'CSS Peeper',    'https://csspeeper.com/',            '', 4, 'Smart CSS viewer tailored for Designers'),
    ('b0000000-0000-0000-0000-000000000014', 'Insight',       'http://insight.io/',                '', 5, 'IDE-like code search and navigation'),
    ('b0000000-0000-0000-0000-000000000014', 'Must See',      'http://mustsee.earth/',             '', 6, 'Discover the world''s most beautiful places')
ON CONFLICT (url) DO NOTHING;

-- === 资讯书籍 (Reading) ===
INSERT INTO preset_sites (category_id, title, url, icon, sort_order, description) VALUES
    ('b0000000-0000-0000-0000-000000000015', '微信读书',      'https://weread.qq.com/',            '', 1, '微信读书电脑版'),
    ('b0000000-0000-0000-0000-000000000015', '书栈网',        'https://www.bookstack.cn/',         '', 2, 'IT 互联网开源编程书籍免费阅读与下载')
ON CONFLICT (url) DO NOTHING;

-- === 博客论坛 (Blogs) ===
INSERT INTO preset_sites (category_id, title, url, icon, sort_order, description) VALUES
    ('b0000000-0000-0000-0000-000000000016', 'Inoreader',        'https://www.inoreader.com/',       '', 1, '重新掌控你的新闻订阅源'),
    ('b0000000-0000-0000-0000-000000000016', '经管之家',         'https://bbs.pinggu.org/',          '', 2, '国内活跃的经济、管理、金融在线教育网站'),
    ('b0000000-0000-0000-0000-000000000016', '阮一峰的网络日志', 'http://www.ruanyifeng.com/blog/',  '', 3, '阮一峰，科技爱好者周刊'),
    ('b0000000-0000-0000-0000-000000000016', '酷壳',             'https://www.coolshell.cn/',        '', 4, '酷壳 – CoolShell')
ON CONFLICT (url) DO NOTHING;
-- Note: Hacker News already in News category (a...04), skip duplicate

-- === 设计规范 (Design Systems) ===
INSERT INTO preset_sites (category_id, title, url, icon, sort_order, description) VALUES
    ('b0000000-0000-0000-0000-000000000017', 'Design Guidelines',        'http://designguidelines.co/',                                   '', 1, 'The way products are built'),
    ('b0000000-0000-0000-0000-000000000017', 'Awesome Design Systems',   'https://github.com/alexpate/awesome-design-systems',            '', 2, 'A collection of awesome design systems'),
    ('b0000000-0000-0000-0000-000000000017', 'Material Design',          'https://material.io/guidelines/',                               '', 3, 'Introduction - Material Design'),
    ('b0000000-0000-0000-0000-000000000017', 'Human Interface Guidelines','https://developer.apple.com/ios/human-interface-guidelines',    '', 4, 'Human Interface Guidelines iOS'),
    ('b0000000-0000-0000-0000-000000000017', 'Photoshop Etiquette',      'http://viggoz.com/photoshopetiquette/',                         '', 5, 'PS礼仪-WEB设计指南')
ON CONFLICT (url) DO NOTHING;

-- === 视频教程 (Tutorials) ===
INSERT INTO preset_sites (category_id, title, url, icon, sort_order, description) VALUES
    ('b0000000-0000-0000-0000-000000000018', 'Photoshop Lady',  'http://www.photoshoplady.com/',                   '', 1, 'Your Favourite Photoshop Tutorials in One Place'),
    ('b0000000-0000-0000-0000-000000000018', 'doyoudo',         'http://doyoudo.com/',                             '', 2, '创意设计软件学习平台'),
    ('b0000000-0000-0000-0000-000000000018', '没位道',          'http://www.c945.com/web-ui-tutorial/',            '', 3, 'WEB UI免费视频公开课'),
    ('b0000000-0000-0000-0000-000000000018', '慕课网',          'https://www.imooc.com/',                          '', 4, '程序员的梦工厂')
ON CONFLICT (url) DO NOTHING;

-- === Update descriptions for existing sites from 007 seed data ===
-- Add descriptions to sites that already exist but had empty descriptions
UPDATE preset_sites SET description = 'Watch, share & discover videos' WHERE url = 'https://www.youtube.com' AND description = '';
UPDATE preset_sites SET description = 'Bilibili 视频弹幕网站' WHERE url = 'https://www.bilibili.com' AND description = '';
UPDATE preset_sites SET description = 'Watch TV shows & movies' WHERE url = 'https://www.netflix.com' AND description = '';
UPDATE preset_sites SET description = 'Short-form video platform' WHERE url = 'https://www.tiktok.com' AND description = '';
UPDATE preset_sites SET description = 'Live streaming platform' WHERE url = 'https://www.twitch.tv' AND description = '';
UPDATE preset_sites SET description = 'Disney streaming service' WHERE url = 'https://www.disneyplus.com' AND description = '';
UPDATE preset_sites SET description = 'Amazon streaming service' WHERE url = 'https://www.primevideo.com' AND description = '';
UPDATE preset_sites SET description = 'Video hosting platform' WHERE url = 'https://vimeo.com' AND description = '';
UPDATE preset_sites SET description = '斗鱼直播平台' WHERE url = 'https://www.douyu.com' AND description = '';
UPDATE preset_sites SET description = '虎牙直播平台' WHERE url = 'https://www.huya.com' AND description = '';
UPDATE preset_sites SET description = 'Bilibili 直播' WHERE url = 'https://live.bilibili.com' AND description = '';
UPDATE preset_sites SET description = 'YouTube 直播' WHERE url = 'https://www.youtube.com/live' AND description = '';
UPDATE preset_sites SET description = 'Live streaming platform' WHERE url = 'https://kick.com' AND description = '';
UPDATE preset_sites SET description = 'AI conversational assistant' WHERE url = 'https://chat.openai.com' AND description = '';
UPDATE preset_sites SET description = 'Anthropic AI assistant' WHERE url = 'https://claude.ai' AND description = '';
UPDATE preset_sites SET description = 'Google AI assistant' WHERE url = 'https://gemini.google.com' AND description = '';
UPDATE preset_sites SET description = 'AI-powered search engine' WHERE url = 'https://www.perplexity.ai' AND description = '';
UPDATE preset_sites SET description = 'AI image generation' WHERE url = 'https://www.midjourney.com' AND description = '';
UPDATE preset_sites SET description = 'AI chatbot aggregator' WHERE url = 'https://poe.com' AND description = '';
UPDATE preset_sites SET description = 'AI model hub' WHERE url = 'https://huggingface.co' AND description = '';
UPDATE preset_sites SET description = 'AI image generation' WHERE url = 'https://stablediffusionweb.com' AND description = '';
UPDATE preset_sites SET description = 'Google News aggregator' WHERE url = 'https://news.google.com' AND description = '';
UPDATE preset_sites SET description = 'British Broadcasting Corporation' WHERE url = 'https://www.bbc.com' AND description = '';
UPDATE preset_sites SET description = 'Cable News Network' WHERE url = 'https://www.cnn.com' AND description = '';
UPDATE preset_sites SET description = 'International news agency' WHERE url = 'https://www.reuters.com' AND description = '';
UPDATE preset_sites SET description = '知乎社区' WHERE url = 'https://www.zhihu.com' AND description = '';
UPDATE preset_sites SET description = '今日头条资讯' WHERE url = 'https://www.toutiao.com' AND description = '';
UPDATE preset_sites SET description = '计算机黑客和创业公司社会化新闻网站' WHERE url = 'https://news.ycombinator.com' AND description = '';
UPDATE preset_sites SET description = 'Technology news and media' WHERE url = 'https://www.theverge.com' AND description = '';
UPDATE preset_sites SET description = 'Social media platform' WHERE url = 'https://x.com' AND description = '';
UPDATE preset_sites SET description = 'Community discussion platform' WHERE url = 'https://www.reddit.com' AND description = '';
UPDATE preset_sites SET description = 'Chat & community platform' WHERE url = 'https://discord.com' AND description = '';
UPDATE preset_sites SET description = '微博社交平台' WHERE url = 'https://weibo.com' AND description = '';
UPDATE preset_sites SET description = 'Photo & video sharing' WHERE url = 'https://www.instagram.com' AND description = '';
UPDATE preset_sites SET description = 'Cloud-based messaging' WHERE url = 'https://web.telegram.org' AND description = '';
UPDATE preset_sites SET description = 'GitHub 开源社区' WHERE url = 'https://github.com' AND description = '';
UPDATE preset_sites SET description = 'Q&A for developers' WHERE url = 'https://stackoverflow.com' AND description = '';
UPDATE preset_sites SET description = 'Web technology documentation' WHERE url = 'https://developer.mozilla.org' AND description = '';
UPDATE preset_sites SET description = 'Developer community' WHERE url = 'https://dev.to' AND description = '';
UPDATE preset_sites SET description = 'Online code editor' WHERE url = 'https://codepen.io' AND description = '';
UPDATE preset_sites SET description = 'DevOps platform' WHERE url = 'https://gitlab.com' AND description = '';
UPDATE preset_sites SET description = 'Node.js package manager' WHERE url = 'https://www.npmjs.com' AND description = '';
UPDATE preset_sites SET description = 'Online marketplace' WHERE url = 'https://www.amazon.com' AND description = '';
UPDATE preset_sites SET description = '淘宝购物平台' WHERE url = 'https://www.taobao.com' AND description = '';
UPDATE preset_sites SET description = '京东购物平台' WHERE url = 'https://www.jd.com' AND description = '';
UPDATE preset_sites SET description = 'Online auction & shopping' WHERE url = 'https://www.ebay.com' AND description = '';
UPDATE preset_sites SET description = '拼多多购物平台' WHERE url = 'https://www.pinduoduo.com' AND description = '';
UPDATE preset_sites SET description = 'Global online marketplace' WHERE url = 'https://www.aliexpress.com' AND description = '';
UPDATE preset_sites SET description = 'Music streaming service' WHERE url = 'https://open.spotify.com' AND description = '';
UPDATE preset_sites SET description = 'Apple music streaming' WHERE url = 'https://music.apple.com' AND description = '';
UPDATE preset_sites SET description = '163 网易云音乐' WHERE url = 'https://music.163.com' AND description = '';
UPDATE preset_sites SET description = 'Audio distribution platform' WHERE url = 'https://soundcloud.com' AND description = '';
UPDATE preset_sites SET description = 'QQ 音乐，在线听歌' WHERE url = 'https://y.qq.com' AND description = '';
UPDATE preset_sites SET description = 'YouTube music streaming' WHERE url = 'https://music.youtube.com' AND description = '';
UPDATE preset_sites SET description = 'Cloud file storage' WHERE url = 'https://drive.google.com' AND description = '';
UPDATE preset_sites SET description = 'All-in-one workspace' WHERE url = 'https://www.notion.so' AND description = '';
UPDATE preset_sites SET description = 'Collaborative design tool' WHERE url = 'https://www.figma.com' AND description = '';
UPDATE preset_sites SET description = 'Visual design platform' WHERE url = 'https://www.canva.com' AND description = '';
UPDATE preset_sites SET description = 'Project management tool' WHERE url = 'https://trello.com' AND description = '';
UPDATE preset_sites SET description = 'Online document editor' WHERE url = 'https://docs.google.com' AND description = '';
UPDATE preset_sites SET description = 'Virtual whiteboard' WHERE url = 'https://excalidraw.com' AND description = '';
UPDATE preset_sites SET description = 'Design portfolio platform' WHERE url = 'https://dribbble.com' AND description = '';
UPDATE preset_sites SET description = 'Creative portfolio showcase' WHERE url = 'https://www.behance.net' AND description = '';
UPDATE preset_sites SET description = 'Free high-resolution photos' WHERE url = 'https://unsplash.com' AND description = '';
UPDATE preset_sites SET description = 'Free stock photos & videos' WHERE url = 'https://www.pexels.com' AND description = '';
UPDATE preset_sites SET description = 'Wallpaper search engine' WHERE url = 'https://wallhaven.cc' AND description = '';
UPDATE preset_sites SET description = 'Visual discovery platform' WHERE url = 'https://www.pinterest.com' AND description = '';
