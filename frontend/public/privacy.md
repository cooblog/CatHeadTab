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

To comply with privacy regulations and Chrome Web Store policies, we explicitly disclose how your data is collected, used, and shared:

### 1. What Data We Collect
We collect and process the following categories of user data:
- **Personally Identifiable Information (PII)**: If you explicitly choose to create an account and enable Cloud Sync via GitHub or Google OAuth, we collect your email address and basic profile information.
- **Authentication Information**: We collect your AI API keys (e.g., for OpenAI, DeepSeek, Google, etc.) to enable the AI Assistant. These are strictly stored locally on your device. We also process OAuth tokens for Cloud Sync authentication.
- **Location Information**: We temporarily process your IP address for an IP-to-region lookup to provide local weather data.
- **Website Content & Activity (Local)**: Your desktop layout, user preferences, AI chat history, bookmarks (if sync is enabled), and browsing history are accessed to provide core functionalities. This data is primarily stored locally (`chrome.storage.local` and IndexedDB).

### 2. How We Use Your Data
We use the collected data exclusively to provide and improve the extension's features:
- **Personally Identifiable Information**: Used solely to create, manage, and authenticate your Cloud Sync account.
- **Authentication Information**: Your locally stored AI API keys are used to securely authenticate your direct requests to your chosen AI providers. OAuth tokens are used to maintain your Cloud Sync session.
- **Location Information**: Your IP address is used temporarily to fetch the correct weather forecast for your current region. It is not stored or tracked.
- **Website Content & Activity**: Local data is used to render your custom new tab page. If Cloud Sync is enabled, this data is synced across your devices to restore your layout. For the AI Assistant, your data (like bookmarks or history) is only processed when you explicitly request the AI to interact with it.

### 3. How We Share Your Data and With Whom
**We do not sell, rent, or trade your personal data to any third parties. We do not use your data for advertising or tracking purposes.**

To provide our core functionalities, we share specific data with the following relevant third parties:
- **AI Providers (Direct API Access)**: In accordance with our "Privacy First" principle, we require `<all_urls>` host permissions so your browser can send requests directly to the AI provider you configure (e.g., OpenAI, DeepSeek, Google, Anthropic, Aliyun, Zhipu, Moonshot, Minimax, or your self-hosted endpoints). Your prompts, relevant context (such as bookmarks/history if requested), and **Authentication Information** (API keys) are shared directly with these providers, bypassing our servers entirely.
- **Target Websites (Dynamic Favicon Fetching)**: When you add a custom website shortcut to your desktop, the extension uses `<all_urls>` permissions to directly fetch the favicon from that website. The target website may see your **Location Information** (IP address) as a standard web request.
- **OAuth Providers**: Your **Personally Identifiable Information** and **Authentication Information** are processed in coordination with GitHub or Google when you use them to sign in.
- **Weather Service Providers**: Your **Location Information** (IP address) may be temporarily processed by our backend or third-party weather APIs to return localized weather data.
- **Legal Compliance**: We may disclose your data if strictly required by law or in response to valid legal requests by public authorities.

## Self-Hosting

CatHeadTab supports full self-hosting. You can deploy the backend server on your own hardware (Homelab, NAS, VPS), keeping all synced data entirely under your control.

## Children's Privacy

CatHeadTab is not directed at children under 13. We do not knowingly collect personal information from children.

## Changes to This Policy

We may update this Privacy Policy from time to time. Changes will be posted on this page with an updated "Last Updated" date.

## Contact

If you have questions about this Privacy Policy, please open an issue on our [GitHub repository](https://github.com/CatHeadTab/CatHeadTab).
