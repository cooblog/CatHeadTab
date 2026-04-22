# CatHeadTab Privacy Policy

**Last Updated: April 19, 2026**

CatHeadTab is a browser new-tab extension that replaces your default new tab page with a customizable, high-aesthetics desktop interface. This Privacy Policy explains how we handle your data.

## Summary

**CatHeadTab does not collect, transmit, or sell any personal data.** All your data stays on your device unless you explicitly choose to enable cloud sync.

## Data Storage

### Local Data (stored on your device only)

| Data | Purpose | Storage Location |
|------|---------|-----------------|
| Desktop layout (icons, folders, widgets) | Display your customized new tab | `chrome.storage.local` |
| User preferences (language, wallpaper URL, lock screen timeout) | Persist your settings | `chrome.storage.local` |
| AI provider configurations & API keys | Connect to your chosen AI service | `chrome.storage.local` |
| Custom wallpaper images | Display your uploaded wallpaper | IndexedDB |
| AI chat history | Persist conversations with AI assistant | `chrome.storage.local` |

**Important:** AI API keys are stored exclusively on your local device and are **never** transmitted to our servers.

### Optional Cloud Sync (user-initiated only)

If you choose to create an account and connect to a backend server (either our public service or your own self-hosted instance), the following data may be synced:

- Desktop layout (pages, dock, folders, icons)
- User preferences (wallpaper URL, lock screen settings)
- Custom wallpaper image (compressed WebP)
- Bookmarks (for cloud backup only)

Cloud sync is **entirely optional** and **disabled by default**. You are always in control of when and what to sync.

## Browser API Access

CatHeadTab requests the following browser permissions, each used solely for the stated purpose:

| Permission | Purpose |
|-----------|---------|
| `storage` | Save your layout, settings, and preferences locally |
| `unlimitedStorage` | Store wallpaper images without hitting storage limits |
| `bookmarks` | Display and search your bookmarks in the Bookmark Browser |
| `history` | Display and search your browsing history in the History Browser |
| `favicon` | Show website icons next to your desktop shortcuts |
| `activeTab` | Read the current tab's URL and title when using the "Add to Desktop" popup |
| `system.cpu` | Display real-time CPU usage in the System Monitor widget |
| `system.memory` | Display real-time memory usage in the System Monitor widget |

### Data Requests & Proxying

To ensure reliability, avoid CORS limitations, and protect user privacy (by shielding your IP from third-party APIs), CatHeadTab uses a backend proxy for financial and trending data.

**Requests made to CatHeadTab servers (`catheadtab.cn` or your self-hosted instance):**

- **Stock & Index data**: Proxied from Yahoo Finance or Sina Finance.
- **Currency rates**: Proxied from Frankfurter API (European Central Bank).
- **Trending content**: Aggregated from GitHub, Bilibili, Weibo, Xiaohongshu, and BBC News.
- **Weather data**: Provided based on an anonymous IP-to-region lookup (your IP is processed temporarily but not stored for tracking).

All such requests are **anonymous** and not linked to your identity unless you explicitly choose to sign in for Cloud Sync.

### Host Permissions

To provide full functionality, CatHeadTab requests host permissions for `<all_urls>` (`http://*/*` and `https://*/*`). This is primarily used for:

| Host / Scope | Purpose |
|------|---------|
| **All Websites** (`*://*/*`) | **Fetch Website Icons (Favicon)**: When you add a website shortcut to your desktop, the extension may request the website to fetch its icon, enhancing your visual experience. |
| `https://catheadtab.cn/*` | Communicate with the official backend for proxying and sync |
| `https://api.openai.com/*` | Direct access to OpenAI services (when configured) |
| `https://api.deepseek.com/*` | Direct access to DeepSeek services (when configured) |
| `https://*.googleapis.com/*` | Direct access to Google AI services (when configured) |
| `https://api.anthropic.com/*` | Direct access to Anthropic services (when configured) |
| `https://*.aliyuncs.com/*` | Direct access to Aliyun/Qwen services (when configured) |

Other AI providers (Zhipu, Moonshot, Minimax, etc.) are accessed directly from your browser when configured. CatHeadTab does not proxy, log, or store your AI conversations or API keys on our servers.

## AI Assistant

The AI Agent feature allows you to interact with large language models (LLMs) to manage your desktop. When using this feature:

- **Your AI API key** is stored locally on your device and sent directly to your chosen AI provider. It is **never** sent to CatHeadTab servers.
- **Chat messages** are sent directly from your browser to the AI provider's API endpoint. CatHeadTab does not intercept, log, or store these messages (unless you use a self-hosted backend specifically configured to do so).
- **Chat history** is saved locally for convenience.
- The AI assistant can read your desktop layout, bookmarks, and browsing history **only when you ask it to** and only to fulfill your request. **This is only possible when running a local AI large model; we will absolutely never upload or save your bookmarks and browsing history.**

## Third-Party Services

CatHeadTab may interact with the following third-party services based on your usage:

- **AI providers**: OpenAI, DeepSeek, Google (Gemini), Anthropic (Claude), Aliyun (Qwen), Zhipu (ChatGLM), Moonshot (Kimi), Minimax.
- **Trending Sources**: GitHub, Bilibili, Weibo, Xiaohongshu, BBC News.
- **Finance Sources**: Yahoo Finance, Sina Finance, Frankfurter API.
- **Other**: Wallhaven (wallpapers), GitHub/Google OAuth (sync).

## Data Collection, Use, and Sharing

To comply with privacy regulations and store policies, we explicitly disclose how your data is handled:

### 1. What Data We Collect
- **Local Data**: We store your desktop layout, user preferences, and AI chat history locally on your device using `chrome.storage.local`. We also store custom wallpaper images locally using IndexedDB.
- **Cloud Sync Data (Optional)**: If you explicitly create an account and enable cloud sync, we collect and store your desktop layout, user preferences, custom wallpaper images, and bookmarks on our servers (or your self-hosted server) for the sole purpose of syncing across your devices.
- **Authentication Data**: If you use GitHub or Google OAuth to sign in, we collect your email address and basic profile information provided by the OAuth provider to create and manage your account.

### 2. How We Use Your Data
- **Core Functionality**: Your local data is used exclusively to render your customized new tab page and provide the extension's core features.
- **Cloud Sync**: Your synced data is used solely to restore your layout and preferences across different devices where you log in.
- **AI Assistant**: If you use the AI assistant, your prompts and relevant context (like bookmarks or history, only when explicitly requested by you) are sent to your configured AI provider to generate responses.

### 3. How We Share Your Data
- **We do not sell, rent, or trade your personal data to any third parties.**
- **We do not use your data for advertising or tracking purposes.**
- **Third-Party Service Providers**: 
  - **AI Providers**: If you configure and use the AI assistant, your prompts and necessary context are shared directly with your chosen AI provider (e.g., OpenAI, Google, DeepSeek) to generate responses. This data is subject to the respective provider's privacy policy.
  - **OAuth Providers**: If you sign in using GitHub or Google, we interact with these providers to authenticate you.
- **Legal Compliance**: We may disclose your data if required by law or in response to valid requests by public authorities.

## Self-Hosting

CatHeadTab supports full self-hosting. You can deploy the backend server on your own hardware (Homelab, NAS, VPS), keeping all synced data entirely under your control.

## Children's Privacy

CatHeadTab is not directed at children under 13. We do not knowingly collect personal information from children.

## Changes to This Policy

We may update this Privacy Policy from time to time. Changes will be posted on this page with an updated "Last Updated" date.

## Contact

If you have questions about this Privacy Policy, please open an issue on our [GitHub repository](https://github.com/CatHeadTab/CatHeadTab).
