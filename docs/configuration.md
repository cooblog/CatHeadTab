# Configuration Guide / 配置指南

CatHeadTab 后端通过环境变量配置所有外部服务。所有配置均为**可选**：
- 不配置 SMTP → 注册时跳过邮箱验证，密码重置不可用
- 不配置 GitHub/Google OAuth → 前端自动隐藏对应的 SSO 按钮

All backend services are configured via environment variables. Every setting is **optional**:
- No SMTP → email verification is skipped on registration; password reset is unavailable
- No GitHub/Google OAuth → the frontend automatically hides the corresponding SSO buttons

---

## Environment Variables / 环境变量总览

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_DSN` | `postgres://catheadtab:...@localhost:5432/catheadtab?sslmode=disable` | PostgreSQL connection string |
| `JWT_SECRET` | `dev-secret-change-me` | JWT signing secret — **change in production!** |
| `PORT` | `8080` | Server listen port |
| `GIN_MODE` | `debug` | Gin framework mode: `debug` / `release` / `test` |
| `FRONTEND_URL` | `http://localhost:5173` | Frontend URL (used in email links and Google OAuth callback) |
| `BACKEND_URL` | *(empty)* | Backend public URL (used as OAuth redirect_uri) |
| **SMTP** | | |
| `SMTP_HOST` | *(empty)* | SMTP server address |
| `SMTP_PORT` | `587` | SMTP port |
| `SMTP_USER` | *(empty)* | SMTP auth username |
| `SMTP_PASSWORD` | *(empty)* | SMTP auth password |
| `SMTP_FROM` | `noreply@catheadtab.com` | Sender address |
| **OAuth** | | |
| `GITHUB_CLIENT_ID` | *(empty)* | GitHub OAuth App Client ID |
| `GITHUB_CLIENT_SECRET` | *(empty)* | GitHub OAuth App Client Secret |
| `GOOGLE_CLIENT_ID` | *(empty)* | Google OAuth Client ID |
| `GOOGLE_CLIENT_SECRET` | *(empty)* | Google OAuth Client Secret |
| **Wallpaper** | | |
| `WALLHAVEN_API_KEY` | *(empty)* | Wallhaven API key (optional; SFW works without it) |
| `WALLHAVEN_PURITY` | `sfw` | Allowed purity levels: `sfw`, `sketchy`, `nsfw` (comma-separated) |
| `COS_SECRET_ID` | *(empty)* | Tencent Cloud COS Secret ID |
| `COS_SECRET_KEY` | *(empty)* | Tencent Cloud COS Secret Key |
| `COS_BUCKET` | *(empty)* | COS bucket name |
| `COS_REGION` | *(empty)* | COS region (e.g. `ap-guangzhou`) |
| `COS_ORIGINAL_PREFIX` | *(empty)* | COS key prefix for full-size images |
| `COS_THUMB_PREFIX` | *(empty)* | COS key prefix for thumbnails |
| **Token TTL** | | |
| `EMAIL_VERIFY_TOKEN_TTL_HOURS` | `24` | Email verification token lifetime (hours) |
| `PASSWORD_RESET_TOKEN_TTL_HOURS` | `1` | Password reset token lifetime (hours) |
| `JWT_TOKEN_TTL_DAYS` | `30` | JWT login token lifetime (days) |
| `TOKEN_CLEANUP_INTERVAL_HOURS` | `6` | Expired token cleanup interval (hours) |
| **Pro Membership** | | |
| `PRO_GATE_ENABLED` | `false` | Enable Pro role gating (set `true` for SaaS) |
| `PRO_FREE_UNTIL` | *(empty)* | ISO 8601 datetime; users registered before this get Pro automatically |
| **Logging** | | |
| `LOG_LEVEL` | `info` | Minimum log level: `debug` / `info` / `warn` / `error` |
| `LOG_FILE` | *(empty)* | Log file path (empty = console only) |
| `LOG_MAX_SIZE_MB` | `100` | Max size of a single log file before rotation (MB) |
| `LOG_MAX_AGE_DAYS` | `30` | Max days to retain old log files |
| `LOG_MAX_BACKUPS` | `10` | Max number of old log files to keep |
| `LOG_COMPRESS` | `false` | Gzip compress rotated log files |

---

## 1. SMTP Email / SMTP 邮件服务

SMTP 用于发送**邮箱验证**和**密码重置**邮件。如果不配置，这两个功能将静默跳过。

SMTP is used for **email verification** and **password reset** emails. If not configured, these features are silently skipped.

### Gmail Example

1. Go to [Google Security Settings](https://myaccount.google.com/security)
2. Enable 2-Step Verification
3. Go to [App Passwords](https://myaccount.google.com/apppasswords)
4. Generate a 16-character app password

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=abcd efgh ijkl mnop    # 16-char app password
SMTP_FROM=noreply@yourdomain.com
```

### Common Providers / 常见邮件服务商

| Provider | SMTP_HOST | SMTP_PORT |
|----------|-----------|-----------|
| Gmail | `smtp.gmail.com` | `587` |
| Outlook / Hotmail | `smtp.office365.com` | `587` |
| QQ Mail | `smtp.qq.com` | `587` |
| 163 Mail | `smtp.163.com` | `465` |
| Alibaba Enterprise Mail | `smtp.mxhichina.com` | `465` |
| Mailgun | `smtp.mailgun.org` | `587` |
| SendGrid | `smtp.sendgrid.net` | `587` |

> **Important:** `FRONTEND_URL` must be set to the actual frontend address (e.g. `https://tab.example.com`). Email verification/reset links are built from this URL.

---

## 2. GitHub SSO

### Step 1 — Create GitHub OAuth App

1. Go to [GitHub Developer Settings → OAuth Apps](https://github.com/settings/developers)
2. Click **New OAuth App**
3. Fill in:

| Field | Value | Notes |
|-------|-------|-------|
| Application name | `CatHeadTab` | Displayed during authorization |
| Homepage URL | `https://tab.example.com` | Your frontend URL |
| Authorization callback URL | `https://tab.example.com` | Frontend URL (receives code) |

4. Get **Client ID** from the app details page
5. Click **Generate a new client secret** (shown once — save it!)

### Step 2 — Set Environment Variables

```env
GITHUB_CLIENT_ID=Iv1.xxxxxxxxxxxx
GITHUB_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### How It Works

```
User clicks "Sign in with GitHub"
    ↓
Frontend redirects to GitHub authorization page (with client_id)
    ↓
User authorizes → GitHub redirects back to frontend (with code)
    ↓
Frontend POSTs code → Backend /api/v1/auth/github
    ↓
Backend exchanges code for access_token via GitHub API
    ↓
Backend fetches GitHub user info → Creates/links account → Returns JWT
```

---

## 3. Google SSO

### Step 1 — Create Google OAuth Credentials

1. Go to [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials)
2. Create or select a project
3. Click **Create Credentials** → **OAuth client ID**
4. Application type: **Web application**
5. Fill in:

| Field | Value |
|-------|-------|
| Name | `CatHeadTab` |
| Authorized JavaScript origins | `https://tab.example.com` |
| Authorized redirect URIs | `https://tab.example.com/oauth/callback` |

> **The Google redirect URI must match exactly.** The backend callback URL is `{FRONTEND_URL}/oauth/callback`, so your Google Console entry must match `FRONTEND_URL` + `/oauth/callback`.

6. Get **Client ID** and **Client Secret**

### Step 2 — Enable APIs

Ensure these APIs are enabled in Google Cloud Console:
- **Google+ API** or **People API** (for user info)

Path: [APIs & Services → Library](https://console.cloud.google.com/apis/library) → Search "People API" → Enable

### Step 3 — Set Environment Variables

```env
GOOGLE_CLIENT_ID=xxxxxxxxxxxx-xxxxxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxxxxxxxxxxxxx
```

### How It Works

```
User clicks "Sign in with Google"
    ↓
Frontend redirects to Google authorization page (with client_id + redirect_uri)
    ↓
User authorizes → Google redirects to {FRONTEND_URL}/oauth/callback (with code)
    ↓
Frontend POSTs code → Backend /api/v1/auth/google
    ↓
Backend exchanges code for access_token via Google API
    ↓
Backend fetches Google user info → Creates/links account → Returns JWT
```

---

## 4. Verify Configuration / 验证配置

```bash
# Health check
curl http://localhost:8080/api/v1/health

# Check OAuth config (returns client_id, never secrets)
curl http://localhost:8080/api/v1/auth/oauth-config
# Expected: {"github_client_id":"Iv1.xxx","google_client_id":"xxx.apps.googleusercontent.com"}
# Empty strings mean the corresponding SSO is not configured; frontend hides those buttons automatically.
```
