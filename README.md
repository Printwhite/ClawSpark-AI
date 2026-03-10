# ClawSpark AI 极速安装器

一个面向新手的 OpenClaw 图形化安装器。

目标只有一个：让用户在无 VPN 网络下，也能稳定安装、配置并启动 OpenClaw。

[![GitHub Stars](https://img.shields.io/github/stars/Printwhite/ClawSpark-AI?style=for-the-badge)](https://github.com/Printwhite/ClawSpark-AI/stargazers)
[![Latest Release](https://img.shields.io/github/v/release/Printwhite/ClawSpark-AI?style=for-the-badge)](https://github.com/Printwhite/ClawSpark-AI/releases)
[![License](https://img.shields.io/github/license/Printwhite/ClawSpark-AI?style=for-the-badge)](./LICENSE)

如果这个项目帮你省下了时间，欢迎点一个 Star。

## 为什么这个项目值得 Star

- 真正面向中文用户：全中文引导流程，信息清晰。
- 无 VPN 友好：内置镜像与重试策略，安装成功率更高。
- 多模型即插即用：DeepSeek / Claude / OpenAI / Gemini / OpenRouter / Ollama。
- 支持自定义供应商：可直接接你的 OpenAI 兼容网关或 Anthropic 协议网关。
- 一键卸载闭环：可在安装器里直接卸载 OpenClaw 与本地配置。
- 安装过程可视化：实时日志、进度条、异常可重试。

## 一键下载

- Windows 安装包（推荐）
  - [前往 Releases 下载最新 EXE](https://github.com/Printwhite/ClawSpark-AI/releases/latest)

## 功能概览

- 环境检测：Node.js / npm / 磁盘空间 / 网络连通性
- 模型提供方选择：内置 + 自定义
- API 密钥校验：安装前校验，避免配置后才报错
- 渠道配置：Web 控制台 + 常见 IM 渠道开关
- 自动生成配置：`~/.openclaw/openclaw.json` 与 `.env`
- 自动启动网关：默认本地地址 `http://127.0.0.1:18789`
- 卸载功能：全局 CLI + 本地目录一键清理

## 快速开始（源码运行）

```bash
npm install
npm start
```

## 构建

```bash
# Windows
npm run build:win

# macOS
npm run build:mac

# Linux
npm run build:linux
```

构建产物默认输出到 `dist/`。

## 常见问题

### 1. 为什么打不开 `http://localhost:3080/`？

当前版本默认控制台地址是：

- `http://127.0.0.1:18789`

请优先使用这个地址。

### 2. 安装卡在 npm 阶段怎么办？

安装器已内置镜像和重试策略。你也可以手动检查：

- Node.js 版本是否 >= 22
- npm registry 网络连通性
- 杀毒软件是否拦截 `npm` 或 `openclaw`

### 3. 卸载命令超时怎么办？

已在安装器中修复：

- 延长卸载超时
- 增加离线优先参数
- 增加本地文件兜底删除逻辑

## 安全说明

- API Key 仅保存在本机 `~/.openclaw/.env`
- 安装器不会把你的 Key 上传到项目服务器

## 路线图

- 增加可选主题与品牌皮肤
- 增加更多渠道向导
- 增加离线包安装模式

## 贡献

欢迎提交 Issue / PR。

如果你希望这个项目持续维护，请给仓库一个 Star，这会直接提升项目可见度。

## License

MIT
