# Mote

一款极简耐看的 Halo 单栏个人博客主题，专注中文阅读体验，融合封面取色、平滑切页与独立站生活记录。

## 核心特性

- **极简刊物排版**：700px 单栏中文长文阅读韵律，支持正文字号（紧凑 / 标准 / 舒适）与无衬线 / 书刊衬线体实时切换，附带右侧伴读目录（TOC）与 `@media print` 刊物级打印样式。
- **随封面图自动取色**：文章页、独立页与项目详情页自动提取封面主副色调（WCAG AA 亮暗对比度自动校正、持久化 LRU 缓存，可选云端图床 `?imageAve` 主色接口），联动页面强调色、顶部渐隐氛围光带、浏览器 `theme-color` 状态栏以及搜索/评论组件。
- **原生动效与零刷新体验**：Swup 无刷新切页（切页时细雨白噪音不中断）、浏览器原生 View Transitions API 圆形扩散明暗切换、桌面端零抖动悬浮封面预览，以及尊重 `prefers-reduced-motion` 的克制微交互。
- **单篇元数据精细控制**：内置 `annotation-setting.yaml`，可在单篇文章或独立页中按需开关封面、目录、作者卡、时效提醒、自定义提示、版权/参考来源、GEO 核心要点摘要与专属强调色。
- **SEO & GEO 结构化增强**：自动输出 Schema.org `@graph` JSON-LD（`WebSite`、`Person`、`BlogPosting` + `Speakable`、`BreadcrumbList`）、Open Graph / Twitter Card、RSS 及可选 `LLMs.txt` 发现声明。
- **独立站互动与分享**：原生点赞、文章极简满版「书签图」海报生成（浅纸 / 夜墨双风格 + 二维码）、可选微信/支付宝赞赏弹窗，以及移动端自适应抽屉与底部伴读浮标。

## 插件适配

所有插件均为**可选适配**，未安装时自动隐藏对应入口与区块：

| 插件 | 路由 / 能力 | 适配亮点 |
| :--- | :--- | :--- |
| **评论组件**（`PluginCommentWidget` / `comment-next`） | 文章、单页、瞬间、留言板 | 深度对接亮暗双色、封面强调色与纯净输入框质感 |
| **搜索组件**（`PluginSearchWidget`） | 顶栏搜索与快捷键 | 全局配色与暗色模式同步 |
| **瞬间**（`PluginMoments`） | `/moments`、`/moments/{name}`、首页 | 去框化微日记流、紧凑拼图画廊、列表原位点赞与按需展开评论（评论数实时同步） |
| **图库**（`PluginPhotos`） | `/photos`、首页光影条 | 分组切换、专属看图光标与全屏灯箱 |
| **友链管理**（`PluginLinks` 2.5+） | `/links`、首页、自定义朋友圈页 | 分组展示、自助申请弹窗，支持 `page_friends.html` 朋友圈 RSS 动态 |
| **项目集**（`portfolio`） | `/portfolio`、`/portfolio/{slug}`、首页 | 替换首页「在做的小东西」，含筛选搜索、技术栈标签与封面取色详情页 |
| **装备管理**（`equipment`） | `/equipments` | 分组切换与极简横向器物展台清单 |
| **豆瓣**（`plugin-douban`） | `/douban` | 电影 / 图书 / 音乐 / 游戏切换、状态与题材筛选、评分与短评展架 |
| **RSS / Sitemap**（`PluginFeed` / `PluginSitemap`） | `/feed.xml` | 自动输出 `<link rel="alternate">` 订阅发现 |

## 自定义页面模板

在 Halo 后台「页面」新建独立页时，可在右侧「自定义模板」中选择：

- **朋友圈（`page_friends.html`）**：展示友链站点的最新 RSS 订阅动态（需开启 `PluginLinks` 2.5+ 订阅功能），并在主题设置「友链信息」中填写对应路径（如 `/friends`）。
- **留言板（`page_guestbook.html`）**：极简书信风格留言页，支持随封面图取色并直接衔接评论区。

## 快捷键

- `Shift + A`：打开阅读偏好（明暗、主题配色、字体字号、雨声、减少动画）
- `Shift + ?`：查看快捷键帮助

## 开发与打包

需要 Node.js >= 22.12 与 pnpm（Halo 要求 `>= 2.22.1`，`layout.html` 插件布局契约需 `>= 2.26.0`）：

```sh
pnpm install
pnpm run check   # TypeScript & Astro 类型检查
pnpm run build   # 构建 templates/ Thymeleaf 模板
pnpm run dev     # 监听改动自动重新构建
pnpm run pack    # 构建并打包可直接上传 Halo 后台的 theme-mote-<version>.zip
```

## 许可协议

GPL-3.0
