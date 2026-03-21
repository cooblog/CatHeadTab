# CatHeadTab

一款高颜值、响应式、深度集成大语言模型 (LLM) 的浏览器新标签页插件。支持前后端彻底解耦，用户既可以直接连接官方公办云服务，也可零门槛指向自部署的私有服务器（Homelab/NAS），打造属于自己的数字中枢。

## 技术栈

*   **前端:** React 18, Vite, Tailwind CSS v4, Framer Motion, Zustand
*   **后端:** Go, Gin Framework, jwt-go
*   **数据库:** PostgreSQL 14+ (`ltree`, `JSONB`)

## 开发环境启动指南

为了方便本地开发和调试，项目中提供了一键启动脚本。

### 环境要求

1.  Node.js (v18+)
2.  Go (v1.22+)
3.  PostgreSQL (v14+)，监听于本地 `5432` 端口，或者使用提供的 Docker 镜像启动。

### 启动测试

我们在系统根目录提供了一个方便的 PowerShell 脚本 `dev.ps1`，可以通过它一键启动前后端：

```powershell
# 1. 如果你本地没有 PostgreSQL，可以通过以下命令快速拉起一个（需要 Docker）：
docker-compose up -d catheadtab-db

# 2. 运行一键测试脚本（将会弹出两个新窗口分别运行前端和后端）
.\dev.ps1
```

启动完成后：
- 前端页面：`http://localhost:5173`
- 后端 API：`http://localhost:8080/api/v1/health`

## 浏览器插件打包

1. 进入 `frontend` 目录。
2. 运行 `npm run build`。
3. 打开 Chrome / Edge 浏览器的“扩展程序”页面，开启“开发者模式”。
4. 点击“加载已解压的扩展程序”，选择 `frontend/dist` 目录。

## Docker 自部署 (Self-Hosting)

推荐直接使用根目录的 `docker-compose.yml` 运行生产环境：

```bash
docker-compose up -d
```

## 核心功能 (PRD)

*   **动态 Endpoint：** 插件可灵活连接公有或私有服务器，不锁死数据。
*   **液态玻璃 UI：** 高颜值模糊半透明界面，流畅过渡。
*   **AI 智能分类：** （规划中）支持结合大语言模型分析浏览器书签数据实现自动打标整理。

---
*基于白皮书规范打造的数字中枢新标签页。*
