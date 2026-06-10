---
name: changelog
description: Draft the next release's bilingual (zh/en) entry in frontend/src/changelog.json from git commits since the last release tag. Use whenever the user wants to generate or update the changelog, write release notes, prepare a release, or mentions changelog.json, 更新日志, 发版说明 — and especially before running npm run release, which requires the entry to already be committed.
---

# CatHeadTab Changelog Generator

Generate the next version's entry in `frontend/src/changelog.json` from commits since the last release tag.

This file is the single source of truth for both the in-app "About / What's New" panel and the GitHub release notes (see `frontend/scripts/release.mjs`), and it ships inside the build — so the entry must exist and be committed **before** `npm run release` runs. The release script only warns if the entry is missing; it never writes one.

## Workflow

Run all git commands from the repo root.

1. **Find the last release tag**: `git describe --tags --abbrev=0` (tags look like `v1.0.2`).

2. **Collect commits since then**: `git log <tag>..HEAD --no-merges --pretty=format:"%s"`. If there are no commits, tell the user there is nothing to put in the changelog and stop.

3. **Decide the version number**:
   - If the user passed one (e.g. `/changelog 1.0.3` or `/changelog minor`), use it.
   - Otherwise default to a **patch** bump over the last tag — this repo bumps patch even for ordinary feature batches (1.0.1 shipped several new features). State the chosen version so the user can override.

4. **Select user-facing changes**. Keep `feat`, `fix`, and `perf` commits, plus anything else a user would notice. Drop `chore`, `docs`, `ci`, `build`, `test`, and internal refactors — the changelog reader is an end user of a browser new-tab page, not a developer. Merge commits that belong to one feature into a single bullet.

5. **Write the bullets** following the style guide below. Order: new features first, then improvements, then fixes — matching existing entries, which lead with 新增.

6. **Edit the JSON**: prepend an object to the array in `frontend/src/changelog.json`, matching the existing 2-space indentation:

   ```json
   {
     "version": "<x.y.z without the v prefix>",
     "date": "<today, YYYY-MM-DD>",
     "zh": ["…"],
     "en": ["…"]
   }
   ```

7. **Validate** that the file still parses:
   `node -e "JSON.parse(require('fs').readFileSync('frontend/src/changelog.json','utf8'))"`

8. **Show the entry to the user and wait for approval.** The draft is a starting point — the user knows which changes matter most to their users. After approval, commit only this file as `docs(changelog): add <version> entry`, then remind them the release itself is `npm run release` from `frontend/` (it requires a clean working tree, which is why the changelog commit comes first).

## Bullet style guide

Each bullet describes what the **user** gains, not what the code does. Translate from implementation language to product language. The zh list is the primary text; en mirrors it naturally rather than word-for-word.

- zh bullets start with a verb: 新增 / 修复 / 优化 / 改进 / 增强 / 支持
- en bullets start with a past-tense verb: Added / Fixed / Improved / Enhanced
- No trailing punctuation; keep each bullet to one line
- Name the feature area the way the UI does (日历, 便签, 设置), not by component or file name

**Example:**

Input commits:
```
feat(calendar): jump to date from festival list and add countdown shortcut
feat(calendar): quick year/month picker in calendar detail modal
fix(calendar): keep month festival list stable when jumping to a festival
```

Output bullets:
```
zh: "日历详情页支持点击右侧节日跳转到对应日期"
zh: "日历详情页新增年份与月份快速选择"
zh: "新增一键添加倒计时小组件：选中日期后即可在桌面创建倒计时"
zh: "修复本月节日列表在点击节日后条目消失的问题"
en: "Calendar detail: click a festival in the sidebar to jump to its date"
en: "Calendar detail: added a quick year/month picker"
en: "Added one-click countdown widgets: pick a date and create a countdown on the desktop"
en: "Fixed the monthly festival list losing entries after clicking a festival"
```

Note how three `feat` commits became four bullets — split or merge by what reads clearly to a user, not by commit boundaries.
