# CatHeadTab Privacy Policy

**Last Updated: May 11, 2026**

CatHeadTab is a browser new-tab extension that replaces your default new tab page with a customizable desktop interface, widgets, optional cloud sync, and optional AI features. This Privacy Policy explains what data CatHeadTab handles, when data leaves your device, and which parties may receive it.

## Summary

Most CatHeadTab data is processed locally on your device by default. Certain optional or network-backed features transmit limited data so they can work, including account login, cloud sync, weather, finance, trending content, favicon fetching, and server-side AI. CatHeadTab does not sell, rent, trade, or use your data for advertising or tracking.

## Local Data

CatHeadTab stores the following data locally using `chrome.storage.local`, IndexedDB, or browser local storage:

| Data | Purpose | Local Storage |
|------|---------|---------------|
| Desktop layout, icons, folders, widgets, widget settings, and sticky note content | Render and customize the new tab page | `chrome.storage.local` |
| User preferences, language, wallpaper settings, lock timeout, and backend server URL | Persist settings | `chrome.storage.local` |
| AI provider configuration and user-provided AI API keys | Connect to user-selected local AI providers | `chrome.storage.local` |
| AI chat history | Preserve recent conversations for convenience | `chrome.storage.local` |
| Custom wallpaper images and favicon cache | Display assets efficiently | IndexedDB |
| Weather, stock, and exchange-rate cache | Reduce repeated network requests | Browser local storage |

AI API keys that you enter in the extension are stored locally and are not sent to CatHeadTab servers.

## Optional Account And Cloud Sync

If you choose to create an account, sign in, or connect the extension to a backend server, CatHeadTab may transmit and store the following data on the official CatHeadTab backend or on the self-hosted backend you configure:

- Account data, such as email address, username, password hash, email verification status, avatar, and session tokens.
- OAuth data from GitHub or Google, such as provider ID, email address, username, avatar URL, and OAuth tokens.
- Desktop layout, widget settings, user preferences, lock timeout, wallpaper URL, and custom wallpaper image.
- Usage metadata required for server-side AI limits, such as request count and token counts.

Cloud sync is optional. Browser bookmarks and browser history are displayed locally through Chrome APIs and are not uploaded by cloud sync in the current extension.

## Browser API Access

CatHeadTab requests the following Chrome extension permissions for user-facing features:

| Permission | Purpose |
|------------|---------|
| `storage` | Save layout, settings, AI configuration, and chat history locally |
| `unlimitedStorage` | Store wallpaper and favicon assets without hitting normal quota limits |
| `bookmarks` | Display and search your browser bookmarks inside the Bookmark Browser and local AI mode |
| `history` | Display and search your browser history inside the History Browser and local AI mode |
| `favicon` | Show browser-provided website icons next to shortcuts, bookmarks, and history items |
| `activeTab` | Read the active tab URL and title when you use the "Add to Desktop" popup |
| `system.cpu` | Display CPU usage in the System Monitor widget |
| `system.memory` | Display memory usage in the System Monitor widget |
| `declarativeNetRequest` | Add the required `Referer` header for Sina Finance stock quote requests |
| `search` | Send a web search through the browser's default search provider when you submit a web search from the new tab page |

## Host Permissions

CatHeadTab requests host permissions for `http://*/*` and `https://*/*`. These broad host permissions are used only for implemented, user-facing features:

| Scope | Purpose |
|-------|---------|
| Websites you add or open through CatHeadTab | Fetch page titles and favicons for desktop shortcuts |
| User-configured local AI endpoints | Let the extension connect to OpenAI-compatible or self-hosted AI APIs selected by the user |
| AI provider APIs | Send local AI requests directly to the provider you configure, such as OpenAI, DeepSeek, Google Gemini, Anthropic, Aliyun/Qwen, Zhipu, Moonshot, Minimax, or a self-hosted endpoint |
| Finance APIs | Fetch stock quotes directly in extension context when needed, including Yahoo Finance and Sina Finance |
| CatHeadTab or self-hosted backend | Provide account, sync, weather, finance proxy, trending, favicon proxy, wallpaper, and server-side AI features |

Local AI requests may be relayed through the extension's background service worker to avoid browser CORS limitations. This relay stays inside the installed extension and does not send your local AI API key or local AI chat content to CatHeadTab servers.

## Network-Backed Features

CatHeadTab may contact the following services depending on the features you use:

- **CatHeadTab backend or self-hosted backend**: account login, cloud sync, profile/avatar, custom wallpaper sync, server-side AI, weather lookup, finance proxy, trending data, favicon proxy, and wallpaper search.
- **AI providers**: local AI mode sends your prompts, selected context, and local AI API key directly to the AI provider you configured. Server AI mode sends chat messages to the configured backend, which forwards them to the server-configured AI provider.
- **GitHub and Google OAuth**: account sign-in and account linking.
- **Weather and geocoding providers**: weather lookup based on a configured city or backend IP-to-region lookup.
- **Finance sources**: stock symbols, watchlists, or currency pairs may be sent to Yahoo Finance, Sina Finance, Frankfurter, or the configured backend proxy.
- **Trending sources**: GitHub, Bilibili, Weibo, Xiaohongshu, and BBC News may be requested through the backend to display hot content.
- **Favicon sources and target websites**: domains you add as shortcuts may be requested directly or through the backend favicon proxy. The backend may use Google S2, DuckDuckGo icons, Favicone, or the target website to retrieve icons.
- **Wallhaven and configured wallpaper sources**: wallpaper browsing and search.

## AI Assistant

CatHeadTab supports two AI modes:

- **Local AI mode**: You provide an AI API key and endpoint. Your prompt, local chat context, and any requested local data are sent directly from the extension to your configured AI provider. When you explicitly ask the AI to search bookmarks or history, only the relevant tool results are sent to that AI provider. They are not sent to CatHeadTab servers.
- **Server AI mode**: If the connected backend has server-side AI configured, your chat messages are sent to that backend and forwarded to the backend's configured AI provider. CatHeadTab records usage metadata such as request counts and token counts for rate limiting. CatHeadTab does not store chat message bodies as AI chat history on the server.

In server AI mode, CatHeadTab does not provide bookmark or browsing-history tools to the AI assistant. Requests involving browser bookmarks or browsing history require local AI mode.

## Data Collection, Processing, Storage, And Sharing

### Data Transmitted To CatHeadTab Or A Configured Backend

CatHeadTab transmits data to a backend only when needed for enabled features:

- Account and authentication data for login, OAuth, email verification, password reset, and sessions.
- Cloud sync data for layout, widgets, preferences, avatar, custom wallpaper, and related user-provided content.
- Weather request data, including city, language, unit, and temporary IP processing by the backend for auto-location.
- Finance, trending, favicon, and wallpaper request parameters needed to return the requested content.
- Server AI chat requests and AI usage metadata when server AI mode is used.

### Data Shared With Third Parties

CatHeadTab shares data only as needed to provide user-facing features, comply with law, or protect security:

- AI prompts and necessary context with the AI provider selected by you or configured by the backend.
- OAuth login data with GitHub or Google when you use those providers.
- Domain names, stock symbols, currency pairs, city names, or wallpaper search parameters with the external service needed for the relevant feature.
- Data required by legal authorities if strictly required by law.

CatHeadTab does not transfer, sell, rent, or use user data for personalized advertising, retargeting, credit-worthiness, or data broker purposes.

## Chrome Web Store Limited Use Disclosure

CatHeadTab's use of information received from Chrome extension APIs and Chrome permissions adheres to the Chrome Web Store User Data Policy, including the Limited Use requirements. Data obtained from Chrome APIs is used only to provide or improve CatHeadTab's single purpose and user-facing features: new tab customization, bookmarks and history browsing, shortcut creation, widgets, optional sync, and optional AI assistance. CatHeadTab does not use this data for advertising, does not sell it, and does not allow humans to read it except with explicit user consent, for security, for legal compliance, or in aggregated and anonymized internal operations where permitted.

## Security

Data sent over the network is transmitted using HTTPS when the destination supports it. Authentication information is protected and is not publicly disclosed. Local storage security depends on your browser profile and device security.

## Self-Hosting

CatHeadTab supports self-hosting. If you configure your own backend, data sent to that backend is controlled by your deployment and its operators.

## Children's Privacy

CatHeadTab is not directed at children under 13. We do not knowingly collect personal information from children.

## Changes To This Policy

We may update this Privacy Policy from time to time. Changes will be posted on this page with an updated "Last Updated" date.

## Contact

If you have questions about this Privacy Policy, please open an issue on our [GitHub repository](https://github.com/DeaglePC/CatHeadTab).
