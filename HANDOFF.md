# 交接文档 · Magic Bean

给接手这个项目的新会话/新开发者。读完这份就能接着干，不用回溯之前的对话。

---

## 1. 这是什么

个人自用的「口播文案 → 成片 mp4」工具，对标花生AI（参考截图在 `reference/`），但面向单人、
素材走公开免费 API。

完整链路：

```
粘贴文案
  → LLM 拆分镜（你自己配置的 OpenAI 兼容接口）
  → 每个分镜搜素材（Pexels + Pixabay，也可上传自有素材）
  → Edge TTS 生成配音（免费，无需 key）；配音时长 = 该分镜的时间轴长度
  → 按配音切分逐句字幕
  → FFmpeg 合成：素材裁剪/循环 → 交叉淡化拼接 → 烧录字幕 → 混配音+背景音乐
  → 导出 mp4
```

**技术栈**：Next.js 16（App Router, Turbopack）+ TypeScript + Tailwind 4 /
Prisma 7 + SQLite（better-sqlite3 driver adapter）/ 系统 ffmpeg（spawn 调用）/
msedge-tts / zod。Node 22。

**状态**：功能完整，Phase 1–6 全部完成，另外做过一轮完整审计并修完所有发现的问题。
分支 `claude/personal-material-website-yip8ao`，最新提交 `541738d`。

---

## 2. 本地跑起来

```bash
npm install

cp .env.example .env.local     # 然后填 key，见下方
npx prisma migrate deploy
npx prisma generate
npm run dev                    # http://localhost:3000
```

### 系统依赖（不是 npm 包，必须单独装）

```bash
# macOS
brew install ffmpeg
brew install --cask font-noto-sans-cjk

# Ubuntu / Debian
sudo apt install ffmpeg fonts-noto-cjk
```

验证：`ffmpeg -version`、`fc-list :lang=zh | head`。
缺 ffmpeg 导不出视频；缺中文字体，导出视频里的中文字幕会变成方块（预览页看不出来，只有导出后才发现）。

### .env.local

```
PEXELS_API_KEY=
PIXABAY_API_KEY=
LLM_BASE_URL=      # 必须是 OpenAI 兼容的，且能接受 POST {LLM_BASE_URL}/chat/completions
LLM_API_KEY=
LLM_MODEL=
SUBTITLE_FONT=     # 可选，默认 "Noto Sans CJK SC"
```

`.env.local` 已被 gitignore。这些值只在首次读取时用于初始化数据库里的 Settings 单行记录，
之后以 `/settings` 页面里保存的为准。

> ⚠️ 之前的 key 曾在对话里明文出现过，建议到各平台重新生成一遍再用。

---

## 3. 目录导览

```
src/lib/
  db.ts              Prisma client 单例（用 better-sqlite3 adapter）
  settings.ts        Settings 单行记录读写 + 密钥打码（密钥永不回传浏览器明文）
  storage.ts         public/storage/ 下的路径工具 + 路径穿越校验
  http.ts            带超时的 fetch（所有出网请求都必须走这里）
  aspect.ts          16:9 / 9:16 / 1:1 规格：分辨率 + 字幕像素尺寸
  subtitles.ts       文案切句 → 定时字幕 cue；中文避头尾换行；生成 ASS
  types.ts           客户端安全的 DTO（不要在客户端组件里 import 生成的 Prisma client）
  useJobPolling.ts   后台任务轮询 hook（含刷新后重新接上正在跑的任务）
  llm/               OpenAI 兼容客户端 + 分镜拆分（含 JSON 容错和一次重试）
  materials/         pexels.ts / pixabay.ts / search.ts（并行查询+交错合并+无视频降级图片）
  tts/               edgeTts.ts（合成+音色列表）/ audioJob.ts（批量配音后台任务）
  jobs/runner.ts     通用任务框架：心跳、取消、失败兜底、僵尸任务回收
  shots/cues.ts      重新生成某分镜/整个项目的字幕 cue
  ffmpeg/
    exec.ts          spawn 封装：无输出超时 + 绝对超时 + 心跳回调
    pipeline.ts      ★ 合成主流程（最复杂的文件，改之前先读第 4 节）
    exportJob.ts     导出任务：装配数据 → 调 pipeline

src/app/api/
  projects/          列表/创建、单项目 GET/PATCH/DELETE、split、audio、export、jobs、music
  shots/[id]/        PATCH/DELETE、audio、material（选素材）、materials（搜素材）
  jobs/[jobId]/      GET 轮询 / DELETE 取消
  materials/         favorites、uploads
  settings/          读写 + test-llm / test-materials 连通性测试
  storage/           GET 磁盘占用 / POST 清理

src/components/      ProjectEditor（主编辑器）、ShotRow、ShotMaterialPicker（三 tab）、
                     PreviewPlayer、JobProgress、ProjectSettingsPanel、
                     BackgroundMusicPanel、ExportHistory、StoragePanel
```

---

## 4. 改代码前必须知道的几条不变量

这些是踩过坑之后定下来的，破坏其中任何一条都会出难查的 bug。

### 4.1 分镜时长由配音决定，不是由素材决定
`Shot.durationMs` = 该分镜配音的真实时长（ffprobe 测出来的）。素材会被裁剪或循环去凑这个长度，
不是反过来。字幕时间轴也基于它。改配音 → 必须同步更新 `Shot.durationMs` 和字幕 cue
（见 `lib/shots/cues.ts`）。

### 4.2 转场靠"预留padding"实现，别动这块的数学
开启转场时，每个分镜片段会在挨着转场的那一侧**多渲染半个转场时长**，这段多出来的正好被 xfade 吃掉。
所以成片总时长仍然精确等于 `sum(shot.durationMs)`，字幕不会漂移。
见 `pipeline.ts` 的 `computeTransitionPlan()` 和 `joinClipsWithTransitions()`。
改之前先跑一遍时长断言测试（第 6 节）。

### 4.3 字幕必须用 ASS，不能退回 SRT + force_style
**这是个隐蔽的大坑**：用 `subtitles=x.srt:force_style='FontSize=28,MarginV=60'` 时，libass 把
这些数值当成它自己默认脚本坐标系（384×288）里的值，再按视频高度缩放。所以同一组参数在
1280×720 下看着正常，在 720×1280 下字会大好几倍并且被 MarginV 顶出画面外。

现在的做法：`cuesToAss()` 生成 ASS，把 `PlayResX/PlayResY` 钉死为输出分辨率，
于是 `aspect.ts` 里的字号和边距就是**真实像素**。同时 `WrapStyle: 2` 关掉 libass 自己的换行，
换行完全由 `wrapCueText()` 控制（这样中文避头尾规则才生效）。

### 4.4 素材缓存的 key 必须包含"会影响产物"的所有维度
`clip-<hash>.mp4` 的 hash 由 `materialUrl + materialType + 分辨率 + 时长` 组成。
少任何一项都会导致换比例/换类型后复用到错误的旧片段。

### 4.5 所有出网请求走 `lib/http.ts`，所有 ffmpeg 走 `lib/ffmpeg/exec.ts`
前者保证有超时，后者保证有"卡死检测 + 心跳"。直接用裸 `fetch` 或裸 `spawn` 会让
挂起的请求永久卡住后台任务。

### 4.6 后台任务靠心跳判活
`Job.heartbeatAt` 由进度回调和 ffmpeg 的输出共同刷新。心跳超过 3 分钟没更新的
`queued/running` 任务会被 `reapStaleJobs()` 判为「进程重启后遗留」自动标失败。
**这是防止"崩一次就永久锁死导出"的关键**，别把它删了。

### 4.7 客户端组件不要 import 生成的 Prisma client
用 `lib/types.ts` 里的 DTO。服务端组件传数据给客户端组件时要显式序列化
（Prisma 返回 `Date`，DTO 用 `string`），参考 `app/projects/[id]/page.tsx`。

---

## 5. 哪些验证过、哪些没验证过（重要）

之前的开发是在一个**出网受限的沙箱**里做的，被墙掉了 `api.pexels.com`、`pixabay.com`、
`speech.platform.bing.com` 和那个 LLM 代理域名。所以：

### ✅ 已充分验证（用本地 fixture / 合成素材，跑真实代码路径）
- FFmpeg 合成全流程：三种比例、视频+图片混合、转场开/关、背景音乐、单分镜边界情况
- 成片时长精确等于各分镜配音时长之和（多组不规则时长验证过）
- 字幕：切句、时间轴连续且无缝、避头尾换行；**三种比例都截帧目视确认过渲染效果**
- 僵尸任务回收、并发保护、取消、后台配音任务、刷新后重新接上进度
- 自有素材上传 → 选中 → 导出（走本地文件不走 HTTP）
- 收藏去重、磁盘统计与清理（含"不会误删成品"）、路径穿越拦截、服务端参数校验
- 级联删除（实测 better-sqlite3 默认开启了 `PRAGMA foreign_keys`）
- 35 项端到端自动检查全绿；typecheck / eslint / production build 全绿

### ❌ 从未真实跑通（你在本地要做的第一件事）
1. **Pexels / Pixabay 真实搜索** —— 适配器是按官方文档写的，用 fixture 测过解析逻辑，
   但没打过真实接口。字段名可能有出入。
2. **真实 LLM 拆分镜** —— 协议是标准的，但你那个 `grok2api-v2.onrender.com` 代理的实际
   返回格式没验证过；prompt 的中文拆分效果也没在真模型上看过。
3. **Edge TTS 真实配音** —— 音质、语速、以及 `zh-CN-XiaoxiaoNeural` 之外的音色都没听过。
4. **端到端真实成片** —— 用真实素材+真实配音出一条完整视频，从没跑过。

**建议的第一步**：`npm run dev` → 打开 `/settings` → 点两个「测试连接」按钮。
这两个按钮就是为了在这一步立刻暴露配置问题而加的。通过之后再建项目走完整流程。

---

## 6. 常用命令

```bash
npm run dev            # 开发
npm run build          # 生产构建（会跑 tsc）
npm start              # 生产运行（导出/配音是常驻进程里的后台任务，必须用这个，不能 serverless）
npx tsc --noEmit       # 类型检查
npx eslint .           # lint
npx prisma studio      # 图形化看数据库
npx prisma migrate dev --name xxx    # 改完 schema 后建迁移
npx prisma generate    # 改完 schema 后重新生成 client（不做会报一堆"属性不存在"）
```

---

## 7. 已知坑（都踩过，省得你再踩一遍）

| 现象 | 原因 / 解法 |
|---|---|
| 改完 `schema.prisma` 后满屏 `Property 'xxx' does not exist on type 'PrismaClient'` | 忘了 `npx prisma generate` |
| dev 模式下新加的嵌套 API 路由一律 404，但 `npm run build` 里能看到 | Turbopack 路由缓存脏了。停服务 → `rm -rf .next` → 重启 |
| 删了 `dev.db` 后接口报错/查不到刚建的数据 | dev server 还握着已删除文件的句柄。先停服务，再删库、迁移，最后重启 |
| 导出的中文字幕是方块 | 宿主机没装中文字体，装 `fonts-noto-cjk` |
| 竖屏字幕巨大/跑到画面外 | 说明有人把字幕退回 SRT + force_style 了，见 4.3 |
| 预览里图片的 Ken Burns 不动 | keyframes 必须放 `globals.css`。styled-jsx 会给 keyframes 改名，而内联 `animationName` 引用的是原名，对不上 |
| eslint 报 `set-state-in-effect` | effect 里别直接 setState；用 `useEffect(() => { let cancelled=false; (async()=>{...})(); return ()=>{cancelled=true} }, [])` 这种写法 |

另外：配音 mp3 拼接后的总时长与"各分镜时长之和"有约 -10ms/6个分镜 的舍入漂移，
实测可忽略（方向也无害，不会切掉尾音），不用管。

---

## 8. 可以接着做的事

按性价比排序，都是选做：

1. **Docker 化** —— 把 ffmpeg 和中文字体打进镜像，省掉环境依赖。（用户已经问过，可以直接做）
2. **逐字/逐词高亮字幕** —— 现在是整句切分。msedge-tts 支持 `wordBoundaryEnabled` 元数据，
   能拿到词级时间戳，这是做卡拉OK式字幕的现成入口。
3. **更多转场类型** —— 现在只有 fade。ffmpeg 的 xfade 支持 wipeleft/slideup/circleopen 等几十种，
   `joinClipsWithTransitions()` 里 `transition=fade` 那个参数改成可配即可。
4. **素材质量优化** —— 现在每个分镜只用第一个搜索结果做默认值。可以让 LLM 同时输出多组关键词，
   或加个"换一批"按钮。
5. **导出预设** —— 码率/分辨率现在写死（CRF 20、720p 系列），可以做成可选。
6. **背景音乐搜索** —— Pexels/Pixabay 的公开 API 都不含音乐检索，如果想要得换源
   （比如 Jamendo / Free Music Archive 有 API）。

---

## 9. 明确的非目标

- **没有登录/权限体系**，是单人自用设计。别直接暴露公网。
- **不能部署到纯 Serverless**（Vercel 等）：需要常驻进程跑 ffmpeg 和后台任务，还要可写磁盘。
- 背景音乐是用户自备文件上传，不是搜索来的（原因见上）。
