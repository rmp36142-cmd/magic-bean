# Magic Bean

个人版「文案 → AI 视频」工具。素材来自公开免费的 Pexels / Pixabay，分镜拆分接入你自己配置的
LLM（任意 OpenAI 兼容接口）。参考产品见 `reference/` 目录里的花生AI截图。

## 开发进度

- [x] Phase 1 — 项目骨架、数据模型（Prisma/SQLite）、设置页（LLM + 素材源 API Key）
- [ ] Phase 2 — 接入 LLM，把文案自动拆分为分镜
- [ ] Phase 3 — 接入 Pexels/Pixabay，按分镜关键词搜索并选择素材
- [ ] Phase 4 — TTS 配音 + 字幕时间轴 + 网页预览播放器
- [ ] Phase 5 — FFmpeg 真实合成导出 mp4

## 本地运行

```bash
npm install
cp .env.example .env.local   # 填入你自己的 API Key
npx prisma migrate dev
npm run dev
```

打开 http://localhost:3000。设置页 `/settings` 可以在运行时修改 LLM 与素材源的 Key。

## 部署说明

Phase 5 引入 FFmpeg 做真实视频合成，需要能跑原生二进制的服务器/容器（VPS、自建 Docker 等），
不能部署在纯 Serverless 平台（如 Vercel）上。
