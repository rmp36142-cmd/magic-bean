# Magic Bean

个人版「文案 → AI 视频」工具。素材来自公开免费的 Pexels / Pixabay，分镜拆分接入你自己配置的
LLM（任意 OpenAI 兼容接口），配音使用免费的 Edge TTS，最终用 FFmpeg 真实合成导出 mp4。
参考产品见 `reference/` 目录里的花生AI截图。

## 开发进度

- [x] Phase 1 — 项目骨架、数据模型（Prisma/SQLite）、设置页（LLM + 素材源 API Key）
- [x] Phase 2 — 接入 LLM，把文案自动拆分为分镜
- [x] Phase 3 — 接入 Pexels/Pixabay，按分镜关键词搜索并选择素材
- [x] Phase 4 — TTS 配音 + 字幕时间轴 + 网页预览播放器
- [x] Phase 5 — FFmpeg 真实合成导出 mp4

## 使用流程

1. 首页粘贴口播文案，创建项目
2. 点「拆分镜头」——调用你配置的 LLM，把文案拆成若干分镜，每个分镜带画面描述和中/英文关键词
3. 每个分镜点「选择素材」——从 Pexels/Pixabay 搜索结果里选一个视频/图片
4. 点「生成全部配音」——为每个分镜生成配音（Edge TTS，免费，无需 Key），分镜的时间轴长度由配音时长决定
5. 网页预览播放器可以直接看效果（素材+字幕+配音）
6. 都配置好之后点「导出视频」，后端 FFmpeg 会把所有分镜素材裁剪/循环匹配配音时长、拼接、烧录字幕、混入配音，产出可下载的 mp4，网页轮询显示进度

## 本地运行

```bash
npm install
cp .env.example .env.local   # 填入你自己的 API Key
npx prisma migrate dev
npm run dev
```

打开 http://localhost:3000。设置页 `/settings` 可以在运行时修改 LLM 与素材源的 Key。

## 部署说明

- 需要能跑原生二进制的服务器/容器（VPS、自建 Docker 等）来运行 FFmpeg 做真实视频合成，
  不能部署在纯 Serverless 平台（如 Vercel）上。
- 部署环境需要安装 `ffmpeg`（`apt install ffmpeg` 或系统对应的包管理器）。
- 需要至少一个支持中文的字体（比如 `fonts-wqy-zenhei` 或 `fonts-noto-cjk`），否则导出视频里
  烧录的中文字幕会显示成方块。
- 导出是常驻进程里的后台任务（提交后立即返回，网页轮询进度），需要一个持续运行的 Node 进程
  （`npm run start`），不能用请求结束就销毁实例的无服务器函数运行。

## 已知取舍 / 后续可扩展

- 字幕粒度是"每个分镜一段"，不是逐字/逐词高亮；如果分镜文案较长，字幕会一次性显示整段。
- 素材/配音下载后缓存在 `public/storage/`（未加清理机制，长期使用需要自行清理磁盘）。
- 没有做背景音乐混音、转场特效、历史版本等增强功能（原方案里的"Phase 6"，可选）。
