# 🦞 ClawSpark AI 安装向导

面向小白用户的 OpenClaw 一键安装向导桌面应用。

支持 **DeepSeek** / **Claude** / **OpenAI** / **Google Gemini** / **OpenRouter** / **Ollama** 全系 AI 模型。

## 快速开始

### 1. 安装依赖

确保你已安装 [Node.js 22+](https://nodejs.org)，然后：

```bash
cd clawspark-installer
npm install
```

### 2. 启动应用

```bash
npm start
```

### 3. 打包成可执行文件

```bash
# Windows (.exe)
npm run build:win

# macOS (.dmg)
npm run build:mac

# Linux (.AppImage)
npm run build:linux

# 全平台
npm run build:all
```

打包后的文件在 `dist/` 目录下。

## 项目结构

```
clawspark-installer/
├── package.json          # 项目配置 & electron-builder 打包配置
├── src/
│   ├── main.js           # Electron 主进程（窗口管理、IPC、系统操作）
│   ├── preload.js        # 预加载脚本（安全桥接）
│   └── index.html        # 渲染进程（完整 UI，7 步安装向导）
├── assets/               # 图标文件（打包用）
└── README.md
```

## 功能清单

| 步骤 | 功能 | 说明 |
|------|------|------|
| 1. 欢迎 | 介绍页面 | 展示特性 |
| 2. 环境检测 | 真实系统检测 | Node.js、npm、磁盘、网络 |
| 3. 选择模型 | 多选 AI 提供商 | 6 个提供商 |
| 4. 输入密钥 | API Key 输入 + 验证 | 真实 API 调用验证 |
| 5. 通信渠道 | 选择聊天平台 | WebChat 默认开启 |
| 6. 安装中 | 真实执行安装 | npm install + 配置生成 |
| 7. 完成 | 快捷入口 | 一键打开 WebChat |

## 安装器做了什么

1. 执行 `npm install -g openclaw@latest`
2. 创建 `~/.openclaw/` 配置目录
3. 根据你的选择生成 `openclaw.json` 配置文件
4. 将 API Key 安全保存到 `~/.openclaw/.env`
5. 配置 Shell 环境变量自动加载
6. 启动 OpenClaw Gateway

## 注意事项

- API Key 仅保存在本地 `~/.openclaw/.env`，不会上传到任何服务器
- DeepSeek 需要去 [platform.deepseek.com](https://platform.deepseek.com/api_keys) 申请 API Key
- Ollama 本地模型需要提前安装 [Ollama](https://ollama.com) 并运行 `ollama serve`
- 打包时需要将图标文件放入 `assets/` 目录（icon.ico / icon.icns / icon.png）

## License

MIT
