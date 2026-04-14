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

### CLI 用户管理

自部署时，可通过命令行直接管理用户，无需依赖邮件或 Web 界面：

```bash
# 创建新用户（交互式输入用户名、邮箱、密码）
./server user create

# 重置用户密码（通过用户名或邮箱查找用户）
./server user reset-password
```

> 管理员通过 CLI 创建的用户会自动标记为邮箱已验证，无需额外确认。

---

## 邮件与 SSO 配置指南

CatHeadTab 后端通过环境变量配置所有外部服务。所有配置均为**可选**：
- 不配置 SMTP → 注册时跳过邮箱验证，密码重置不可用
- 不配置 GitHub/Google OAuth → 前端自动隐藏对应的 SSO 按钮

### 环境变量总览

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `FRONTEND_URL` | `http://localhost:5173` | 前端地址，用于拼接邮件链接和 Google OAuth 回调 |
| `SMTP_HOST` | *(空)* | SMTP 服务器地址 |
| `SMTP_PORT` | `587` | SMTP 端口 |
| `SMTP_USER` | *(空)* | SMTP 认证用户名 |
| `SMTP_PASSWORD` | *(空)* | SMTP 认证密码 |
| `SMTP_FROM` | `noreply@catheadtab.com` | 发件人地址 |
| `GITHUB_CLIENT_ID` | *(空)* | GitHub OAuth App Client ID |
| `GITHUB_CLIENT_SECRET` | *(空)* | GitHub OAuth App Client Secret |
| `GOOGLE_CLIENT_ID` | *(空)* | Google OAuth Client ID |
| `GOOGLE_CLIENT_SECRET` | *(空)* | Google OAuth Client Secret |

---

### 1. 配置 SMTP 邮件服务

SMTP 用于发送**邮箱验证**和**密码重置**邮件。如果不配置，这两个功能将静默跳过。

#### 以 Gmail 为例

1. 登录 Google 账号 → [安全性设置](https://myaccount.google.com/security)
2. 开启「两步验证」（如未开启）
3. 进入 [应用专用密码](https://myaccount.google.com/apppasswords) 页面
4. 选择「邮件」→ 生成一个 16 位应用密码

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=abcd efgh ijkl mnop    # 16位应用密码，空格可保留
SMTP_FROM=noreply@yourdomain.com
```

#### 其他常见邮件服务商

| 服务商 | SMTP_HOST | SMTP_PORT |
|--------|-----------|-----------|
| Gmail | `smtp.gmail.com` | `587` |
| Outlook / Hotmail | `smtp.office365.com` | `587` |
| QQ 邮箱 | `smtp.qq.com` | `587` |
| 163 邮箱 | `smtp.163.com` | `465` |
| 阿里企业邮 | `smtp.mxhichina.com` | `465` |
| Mailgun | `smtp.mailgun.org` | `587` |
| SendGrid | `smtp.sendgrid.net` | `587` |

> ⚠️ **重要：** `FRONTEND_URL` 必须设置为用户实际访问的前端地址（如 `https://tab.example.com`），邮件中的验证/重置链接会基于此拼接。

---

### 2. 配置 GitHub SSO

#### Step 1 — 创建 GitHub OAuth App

1. 前往 [GitHub Developer Settings → OAuth Apps](https://github.com/settings/developers)
2. 点击 **New OAuth App**
3. 填写信息：

| 字段 | 值 | 说明 |
|------|----|------|
| Application name | `CatHeadTab` | 用户授权时看到的名称 |
| Homepage URL | `https://tab.example.com` | 你的前端地址 |
| Authorization callback URL | `https://tab.example.com` | 前端地址（前端接收 code 后转发给后端） |

4. 创建后在 App 详情页获取 **Client ID**
5. 点击 **Generate a new client secret** 获取 **Client Secret**（仅显示一次，请妥善保存）

#### Step 2 — 配置环境变量

```env
GITHUB_CLIENT_ID=Iv1.xxxxxxxxxxxx
GITHUB_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

#### 工作原理

```
用户点击 "GitHub 登录"
    ↓
前端跳转 GitHub 授权页（带 client_id）
    ↓
用户授权 → GitHub 回调到前端（带 code）
    ↓
前端 POST code → 后端 /api/v1/auth/github
    ↓
后端用 client_id + client_secret + code → GitHub 换 access_token
    ↓
后端拉取 GitHub 用户信息 → 创建/关联账号 → 返回 JWT
```

---

### 3. 配置 Google SSO

#### Step 1 — 创建 Google OAuth 凭据

1. 前往 [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials)
2. 创建或选择一个项目
3. 点击 **创建凭据** → **OAuth 客户端 ID**
4. 应用类型选择 **Web 应用**
5. 填写信息：

| 字段 | 值 |
|------|----|
| 名称 | `CatHeadTab` |
| 已获授权的 JavaScript 来源 | `https://tab.example.com` |
| 已获授权的重定向 URI | `https://tab.example.com/oauth/callback` |

> ⚠️ **Google 重定向 URI 必须完全匹配。** 后端代码中写死的回调地址为 `{FRONTEND_URL}/oauth/callback`，因此你在 Google Console 中填的必须与 `FRONTEND_URL` 环境变量 + `/oauth/callback` 完全一致。

6. 创建后获取 **Client ID** 和 **Client Secret**

#### Step 2 — 启用 API

确保在 Google Cloud Console 中已启用以下 API：
- **Google+ API** 或 **People API**（用于获取用户信息）

路径：[APIs & Services → Library](https://console.cloud.google.com/apis/library) → 搜索 "Google+ API" 或 "People API" → 启用

#### Step 3 — 配置环境变量

```env
GOOGLE_CLIENT_ID=xxxxxxxxxxxx-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxxxxxxxxxxxxx
```

#### 工作原理

```
用户点击 "Google 登录"
    ↓
前端跳转 Google 授权页（带 client_id + redirect_uri）
    ↓
用户授权 → Google 回调到 {FRONTEND_URL}/oauth/callback（带 code）
    ↓
前端 POST code → 后端 /api/v1/auth/google
    ↓
后端用 client_id + client_secret + code + redirect_uri → Google 换 access_token
    ↓
后端拉取 Google 用户信息 → 创建/关联账号 → 返回 JWT
```

---

### 4. Docker Compose 完整配置示例

以下是启用全部功能的 `docker-compose.yml` 参考配置：

```yaml
version: '3.8'
services:
  catheadtab-db:
    image: postgres:14-alpine
    environment:
      POSTGRES_USER: catheadtab
      POSTGRES_PASSWORD: secretpassword
      POSTGRES_DB: catheadtab
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U catheadtab"]
      interval: 5s
      timeout: 5s
      retries: 5

  catheadtab-backend:
    build: ./backend
    ports:
      - "8080:8080"
    environment:
      # ---- 基础配置 ----
      - DB_DSN=postgres://catheadtab:secretpassword@catheadtab-db:5432/catheadtab?sslmode=disable
      - JWT_SECRET=change-me-to-a-strong-random-string
      - GIN_MODE=release
      - PORT=8080
      - FRONTEND_URL=https://tab.example.com

      # ---- SMTP 邮件（可选） ----
      - SMTP_HOST=smtp.gmail.com
      - SMTP_PORT=587
      - SMTP_USER=your-email@gmail.com
      - SMTP_PASSWORD=your-app-password
      - SMTP_FROM=noreply@yourdomain.com

      # ---- GitHub OAuth（可选） ----
      - GITHUB_CLIENT_ID=
      - GITHUB_CLIENT_SECRET=

      # ---- Google OAuth（可选） ----
      - GOOGLE_CLIENT_ID=
      - GOOGLE_CLIENT_SECRET=
    depends_on:
      catheadtab-db:
        condition: service_healthy

volumes:
  pgdata:
```

### 5. 验证配置

启动服务后，可通过以下方式验证各功能是否正常：

```bash
# 健康检查
curl http://localhost:8080/api/v1/health

# 查看 OAuth 配置是否生效（返回 client_id，不返回 secret）
curl http://localhost:8080/api/v1/auth/oauth-config
# 预期返回：{"github_client_id":"Iv1.xxx","google_client_id":"xxx.apps.googleusercontent.com"}
# 如果为空字符串说明对应 SSO 未配置，前端会自动隐藏按钮
```

---

## 核心功能 (PRD)

*   **动态 Endpoint：** 插件可灵活连接公有或私有服务器，不锁死数据。
*   **液态玻璃 UI：** 高颜值模糊半透明界面，流畅过渡。
*   **AI 智能分类：** （规划中）支持结合大语言模型分析浏览器书签数据实现自动打标整理。

---
*基于白皮书规范打造的数字中枢新标签页。*

## License

This project is licensed under the [GNU Affero General Public License v3.0 (AGPL-3.0)](LICENSE).

You are free to use, modify, and self-host this software. If you modify the source code and provide it as a network service, you must make the modified source code available to users of that service under the same license.
