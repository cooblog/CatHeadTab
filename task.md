# CatHeadTab 项目初始化

## Phase 1: 项目基础架构搭建
- [x] 创建项目根目录结构 (frontend/ backend/ docker/)
- [x] 初始化前端项目 (React 18 + Vite + Tailwind CSS)
- [x] 配置浏览器插件 Manifest V3
- [x] 初始化后端项目 (Go + Gin)
- [x] 创建 PostgreSQL Schema 迁移文件
- [x] 编写 docker-compose.yml 和 dev.ps1 本地测试脚本
- [ ] 创建 README.md

## Phase 2: 后端核心 API
- [x] 用户模型与多方式登录 (GitHub/Google/邮箱/账号)
- [x] JWT 鉴权中间件
- [ ] CORS 中间件 (支持 chrome-extension://)
- [ ] 书签 CRUD API (ltree)
- [ ] 桌面布局 API
- [ ] 用户偏好 API

## Phase 3: 前端核心功能
- [ ] 动态 Server URL 配置 & 初始化引导页
- [x] 个人中心与多标签设置面板
- [x] 云端数据同步引擎 (云端/本地上传拉取合并)
- [x] 持久化登录态自动校验
- [x] Axios 拦截器 (动态 Base URL + JWT)
- [x] 液态玻璃 UI 设计系统
- [x] 桌面网格布局 (Tab 1: Desktop)
- [ ] 拖拽与文件夹合并 (@dnd-kit)
- [x] 多重搜索模式 (Google/Bing/书签/历史/桌面)
- [x] 设置面板与个性化 (Settings Panel)
- [x] 书签管理器 (Tab 2: Bookmark Manager)
- [ ] AI 智能分类功能

## Phase 4: 验证与部署
- [ ] 前后端联调测试
- [ ] Docker 部署测试
- [ ] 浏览器插件打包测试

## Phase 5: 桌面解耦与独立应用 (Bookmark App)
- [x] 剥离书签与桌面的强绑定 (重构 DesktopLayout Store)
- [x] 实现独立窗口化的“书签浏览器” App (支持全屏/缩放)
- [x] 收拢云端同步逻辑仅针对纯桌面布局与设置
