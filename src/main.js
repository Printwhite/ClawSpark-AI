const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("path");
const { exec, execSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const https = require("https");
const http = require("http");

let mainWindow;
const NPM_MIRROR_REGISTRY = "https://registry.npmmirror.com";
const NPM_OFFICIAL_REGISTRY = "https://registry.npmjs.org";

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 960,
    height: 680,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    titleBarStyle: "hidden",
    backgroundColor: "#f5f8ff",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.loadFile(path.join(__dirname, "index.html"));
}

app.whenReady().then(createWindow);
app.on("window-all-closed", () => app.quit());

// Window Controls
ipcMain.on("win:minimize", () => mainWindow?.minimize());
ipcMain.on("win:maximize", () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on("win:close", () => mainWindow?.close());
ipcMain.on("open-external", (_, url) => shell.openExternal(url));

// Environment Detection
ipcMain.handle("check-environment", async () => {
  const results = [];
  const platform = os.platform();
  const osName = platform === "win32" ? "Windows" : platform === "darwin" ? "macOS" : "Linux";
  const arch = os.arch();
  results.push({ name: "操作系统", detail: `${osName} ${arch}`, status: "pass" });

  // Node.js
  try {
    const nodeV = execSync("node --version", { encoding: "utf-8" }).trim();
    const major = parseInt(nodeV.replace("v", "").split(".")[0]);
    results.push({
      name: "Node.js (v22+)",
      detail: nodeV,
      status: major >= 22 ? "pass" : "warn",
      hint: major < 22 ? "建议使用 Node.js 22+ 以获得最佳兼容性" : "",
    });
  } catch {
    results.push({
      name: "Node.js (v22+)",
      detail: "未安装",
      status: "fail",
      hint: "请先安装 Node.js 22+：https://nodejs.org",
    });
  }

  // npm
  try {
    const npmV = execSync("npm --version", { encoding: "utf-8" }).trim();
    results.push({ name: "npm", detail: `v${npmV}`, status: "pass" });
  } catch {
    results.push({ name: "npm", detail: "未安装", status: "fail" });
  }

  // Disk space
  try {
    const fsStat = fs.statfsSync(os.homedir());
    const freeBytes = Number(fsStat.bavail) * Number(fsStat.bsize);
    const freeGB = (freeBytes / 1073741824).toFixed(1);
    results.push({
      name: "磁盘空间 (>500MB)",
      detail: `可用 ${freeGB} GB`,
      status: parseFloat(freeGB) > 0.5 ? "pass" : "fail",
    });
  } catch {
    results.push({ name: "磁盘空间", detail: "无法检测", status: "warn" });
  }

  // Network (try DNS)
  results.push(
    await new Promise((resolve) => {
      const req = https.get("https://registry.npmjs.org", { timeout: 5000 }, (res) => {
        resolve({ name: "网络连接", detail: `npm registry 可访问 (${res.statusCode})`, status: "pass" });
      });
      req.on("error", () => resolve({ name: "网络连接", detail: "无法访问 npm registry", status: "fail" }));
      req.on("timeout", () => { req.destroy(); resolve({ name: "网络连接", detail: "连接超时", status: "fail" }); });
    })
  );

  return results;
});

// Validate API Key
ipcMain.handle("validate-api-key", async (_, payload = {}) => {
  const { providerId, apiKey, customConfig } = payload || {};
  return new Promise((resolve) => {
    try {
      let options;
      let postData;
      let client = https;

      if (providerId === "deepseek") {
        postData = JSON.stringify({ model: "deepseek-chat", messages: [{ role: "user", content: "hi" }], max_tokens: 1 });
        const url = new URL("https://api.deepseek.com/chat/completions");
        options = { hostname: url.hostname, path: url.pathname, method: "POST", timeout: 10000,
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}`, "Content-Length": Buffer.byteLength(postData) }
        };
      } else if (providerId === "anthropic") {
        postData = JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 1, messages: [{ role: "user", content: "hi" }] });
        const url = new URL("https://api.anthropic.com/v1/messages");
        options = { hostname: url.hostname, path: url.pathname, method: "POST", timeout: 10000,
          headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01", "Content-Length": Buffer.byteLength(postData) }
        };
      } else if (providerId === "openai") {
        const url = new URL("https://api.openai.com/v1/models");
        options = { hostname: url.hostname, path: url.pathname, method: "GET", timeout: 10000,
          headers: { "Authorization": `Bearer ${apiKey}` }
        };
        postData = null;
      } else if (providerId === "google") {
        const url = new URL(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        options = { hostname: url.hostname, path: url.pathname + url.search, method: "GET", timeout: 10000 };
        postData = null;
      } else if (providerId === "openrouter") {
        const url = new URL("https://openrouter.ai/api/v1/models");
        options = { hostname: url.hostname, path: url.pathname, method: "GET", timeout: 10000,
          headers: { "Authorization": `Bearer ${apiKey}` }
        };
        postData = null;
      } else if (providerId === "ollama") {
        // Local check
        const req = http.get("http://localhost:11434/api/tags", { timeout: 3000 }, (res) => {
          let data = "";
          res.on("data", (c) => data += c);
          res.on("end", () => resolve({ valid: res.statusCode === 200, message: res.statusCode === 200 ? "Ollama 服务运行中" : "Ollama 无响应" }));
        });
        req.on("error", () => resolve({ valid: false, message: "Ollama 未启动，请先执行 `ollama serve`" }));
        return;
      } else if (providerId === "custom") {
        const custom = normalizeCustomProvider(customConfig || {});
        const key = String(apiKey || "").trim();
        if (!custom.baseUrl) {
          resolve({ valid: false, message: "请填写自定义供应商 Base URL" });
          return;
        }
        if (!key) {
          resolve({ valid: false, message: "请先输入 API Key" });
          return;
        }

        if (custom.api === "anthropic") {
          postData = JSON.stringify({ model: custom.modelId || "claude-sonnet-4-20250514", max_tokens: 1, messages: [{ role: "user", content: "hi" }] });
          const base = normalizeBaseUrl(custom.baseUrl);
          const url = new URL("/v1/messages", base);
          client = url.protocol === "http:" ? http : https;
          options = {
            hostname: url.hostname,
            port: url.port || undefined,
            path: `${url.pathname}${url.search}`,
            method: "POST",
            timeout: 10000,
            headers: {
              "Content-Type": "application/json",
              "x-api-key": key,
              "anthropic-version": "2023-06-01",
              "Content-Length": Buffer.byteLength(postData),
            },
          };
        } else {
          postData = null;
          const base = normalizeBaseUrl(custom.baseUrl);
          const url = new URL("/v1/models", base);
          client = url.protocol === "http:" ? http : https;
          options = {
            hostname: url.hostname,
            port: url.port || undefined,
            path: `${url.pathname}${url.search}`,
            method: "GET",
            timeout: 10000,
            headers: { Authorization: `Bearer ${key}` },
          };
        }
      } else {
        resolve({ valid: true, message: "跳过校验" });
        return;
      }

      const req = client.request(options, (res) => {
        let data = "";
        res.on("data", (c) => data += c);
        res.on("end", () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ valid: true, message: "校验通过" });
          } else if (res.statusCode === 401 || res.statusCode === 403) {
            resolve({ valid: false, message: "API Key 无效或权限不足" });
          } else {
            resolve({ valid: true, message: `服务返回 ${res.statusCode}，Key 格式看起来有效` });
          }
        });
      });
      req.on("error", (e) => resolve({ valid: false, message: `连接失败：${e.message}` }));
      req.on("timeout", () => { req.destroy(); resolve({ valid: false, message: "连接超时" }); });
      if (postData) req.write(postData);
      req.end();
    } catch (e) {
      resolve({ valid: false, message: `校验异常：${e.message}` });
    }
  });
});

// Install OpenClaw
ipcMain.handle("install-openclaw", async (event, payload = {}) => {
  const {
    providers = [],
    apiKeys = {},
    channels = [],
    customProviders = [],
  } = payload;

  const send = (msg) => mainWindow?.webContents.send("install-log", msg);
  const platform = os.platform();
  const home = os.homedir();
  const clawDir = path.join(home, ".openclaw");
  const customProviderMap = toCustomProviderMap(customProviders);
  const envNameMap = buildProviderEnvNameMap(providers, customProviderMap);

  try {
    // Step 1: Install openclaw via npm
    await installOpenClawCLI(send);
    send({ text: "OpenClaw CLI 已安装", type: "success", prefix: "OK" });

    // Step 2: Create config directory
    send({ text: `创建配置目录 ${clawDir}`, type: "info", prefix: "$" });
    if (!fs.existsSync(clawDir)) fs.mkdirSync(clawDir, { recursive: true });
    send({ text: "配置目录已就绪", type: "success", prefix: "OK" });

    // Step 3: Generate openclaw.json
    send({ text: "正在生成 openclaw.json...", type: "info", prefix: "..." });
    const config = generateConfig(providers, channels, customProviderMap, envNameMap);
    fs.writeFileSync(path.join(clawDir, "openclaw.json"), JSON.stringify(config, null, 2), "utf-8");
    send({ text: "配置文件写入完成", type: "success", prefix: "OK" });

    // Step 4: Set environment variables for API keys
    send({ text: "正在写入 API Key 到 env 文件...", type: "info", prefix: "..." });
    const envLines = [];
    for (const pid of providers) {
      const key = String(apiKeys[pid] || "").trim();
      if (key) {
        const envName = envNameMap[pid] || toProviderEnvName(pid);
        envLines.push(`${envName}=${key}`);
      }
    }
    if (envLines.length > 0) {
      const envFile = path.join(clawDir, ".env");
      fs.writeFileSync(envFile, envLines.join("\n") + "\n", "utf-8");
      send({ text: `已保存 ${envLines.length} 个 Key 到 ${envFile}`, type: "success", prefix: "OK" });
    }

    // Step 5: Setup shell profile for env vars
    send({ text: "正在配置 shell 环境变量加载...", type: "info", prefix: "..." });
    setupShellEnv(platform, home, clawDir);
    send({ text: "shell 环境变量加载配置完成", type: "success", prefix: "OK" });

    // Step 6: Start OpenClaw
    send({ text: "正在启动 OpenClaw 网关...", type: "info", prefix: "$" });
    try {
      const startCmd = platform === "win32"
        ? "start \"\" /B openclaw gateway run --allow-unconfigured --bind loopback --port 18789"
        : "nohup openclaw gateway run --allow-unconfigured --bind loopback --port 18789 >/dev/null 2>&1 &";
      const mergedEnv = { ...process.env, ...envFromLines(envLines) };

      exec(startCmd, { shell: true, env: mergedEnv });
      const ready = await waitForUrlReachable("http://127.0.0.1:18789/", 20000, 1000);
      if (!ready) throw new Error("20 秒内未检测到网关可访问");

      send({ text: "网关已启动 -> ws://127.0.0.1:18789", type: "success", prefix: "OK" });
      send({ text: "控制台已就绪 -> http://127.0.0.1:18789/（可执行 `openclaw dashboard` 获取带 token 链接）", type: "success", prefix: "OK" });
    } catch {
      send({ text: "已跳过网关自动启动（可手动执行 `openclaw gateway run --allow-unconfigured`）", type: "warn", prefix: "!" });
    }

    send({ text: "安装完成", type: "success", prefix: "OK" });
    return { success: true };
  } catch (e) {
    send({ text: `安装异常：${e.message}`, type: "error", prefix: "ERR" });
    return { success: false, error: e.message };
  }
});

ipcMain.handle("uninstall-openclaw", async () => {
  const send = (msg) => mainWindow?.webContents.send("install-log", msg);
  const platform = os.platform();
  const clawDir = path.join(os.homedir(), ".openclaw");

  try {
    send({ text: "开始卸载 OpenClaw...", type: "info", prefix: "$" });
    await stopOpenClawProcesses(platform, send);
    await uninstallOpenClawCLI(send);

    if (fs.existsSync(clawDir)) {
      fs.rmSync(clawDir, { recursive: true, force: true });
      send({ text: `已删除本地配置目录 ${clawDir}`, type: "success", prefix: "OK" });
    } else {
      send({ text: "本地配置目录不存在，跳过删除", type: "info", prefix: "..." });
    }

    send({ text: "卸载完成", type: "success", prefix: "OK" });
    return { success: true };
  } catch (e) {
    send({ text: `卸载失败：${e.message}`, type: "error", prefix: "ERR" });
    return { success: false, error: e.message };
  }
});

// Helpers
function getOpenClawVersion() {
  try {
    const v = execSync("openclaw --version", { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    return v || null;
  } catch {
    return null;
  }
}

async function installOpenClawCLI(send) {
  const existingVersion = getOpenClawVersion();
  if (existingVersion) {
    send({ text: `检测到 OpenClaw CLI ${existingVersion}，跳过安装`, type: "success", prefix: "OK" });
    return;
  }

  const githubReachable = await checkUrlReachable("https://codeload.github.com", 3500);
  if (!githubReachable) {
    send({ text: "当前网络无法访问 GitHub，优先尝试 cnpm 兜底安装", type: "warn", prefix: "!" });
  }

  const npmMirrorAttempt = {
    label: "npmmirror",
    command: `npm install -g openclaw@latest --registry=${NPM_MIRROR_REGISTRY} --fetch-retries=5 --fetch-retry-factor=2 --fetch-retry-maxtimeout=120000 --no-audit --no-fund --loglevel=info`,
    heartbeatText: "正在通过 npmmirror 安装 OpenClaw，首次可能需要几分钟...",
    timeoutMs: 4 * 60 * 1000,
  };
  const npmjsAttempt = {
    label: "npmjs",
    command: `npm install -g openclaw@latest --registry=${NPM_OFFICIAL_REGISTRY} --fetch-retries=3 --fetch-retry-factor=2 --fetch-retry-maxtimeout=120000 --no-audit --no-fund --loglevel=info`,
    heartbeatText: "正在通过 npmjs 重试安装...",
    timeoutMs: 3 * 60 * 1000,
  };
  const cnpmAttempt = {
    label: "cnpm",
    command: `npx --yes cnpm@9 i -g openclaw@latest --registry=${NPM_MIRROR_REGISTRY}`,
    heartbeatText: "正在通过 cnpm 镜像重试安装...",
    timeoutMs: 4 * 60 * 1000,
  };

  const attempts = githubReachable
    ? [npmMirrorAttempt, npmjsAttempt, cnpmAttempt]
    : [cnpmAttempt, npmMirrorAttempt, npmjsAttempt];

  const cleanAttemptSummary = attempts.map((a) => a.label).join(" -> ");
  send({ text: `安装策略：${cleanAttemptSummary}`, type: "info", prefix: "..." });

  let lastError = null;
  for (const attempt of attempts) {
    send({ text: attempt.command, type: "info", prefix: "$" });
    try {
      await runCommand(attempt.command, {
        timeoutMs: attempt.timeoutMs ?? 15 * 60 * 1000,
        heartbeatMs: 15000,
        heartbeatText: attempt.heartbeatText,
      });
      send({ text: `已通过 ${attempt.label} 成功安装 OpenClaw CLI`, type: "success", prefix: "OK" });
      return;
    } catch (e) {
      lastError = e;
      send({ text: `${attempt.label} 安装失败：${e.message}`, type: "warn", prefix: "!" });
    }
  }

  throw new Error(
    `OpenClaw 安装失败。当前网络可能无法拉取 GitHub 依赖。${lastError?.message || ""}`.trim()
  );
}

function checkUrlReachable(url, timeoutMs = 3000) {
  return new Promise((resolve) => {
    try {
      const target = new URL(url);
      const client = target.protocol === "http:" ? http : https;
      const req = client.get(target, { timeout: timeoutMs }, (res) => {
        res.resume?.();
        resolve(res.statusCode >= 200 && res.statusCode < 500);
      });
      req.on("error", () => resolve(false));
      req.on("timeout", () => {
        req.destroy();
        resolve(false);
      });
    } catch {
      resolve(false);
    }
  });
}

async function waitForUrlReachable(url, timeoutMs = 15000, pollMs = 1000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    // eslint-disable-next-line no-await-in-loop
    const ok = await checkUrlReachable(url, Math.min(2500, pollMs));
    if (ok) return true;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, pollMs));
  }
  return false;
}

function envFromLines(lines) {
  const env = {};
  for (const line of lines) {
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1);
    if (key) env[key] = value;
  }
  return env;
}

function runCommand(cmd, options = {}) {
  const timeoutMs = options.timeoutMs ?? 300000;
  const heartbeatMs = options.heartbeatMs ?? 15000;
  const heartbeatText = options.heartbeatText || "命令仍在执行中...";

  return new Promise((resolve, reject) => {
    let heartbeatTimer = null;

    const child = exec(cmd, { timeout: timeoutMs, maxBuffer: 20 * 1024 * 1024 }, (err, stdout) => {
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (err) {
        if (err.killed) {
          reject(new Error(`命令执行超时（${Math.round(timeoutMs / 1000)} 秒）`));
          return;
        }
        reject(new Error(err.message || "命令执行失败"));
        return;
      }
      resolve(stdout);
    });

    const emitLogs = (raw, type, prefix) => {
      const lines = raw
        .toString()
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      for (const line of lines) {
        if (type === "warn" && line.startsWith("npm warn")) continue;
        mainWindow?.webContents.send("install-log", { text: line, type, prefix });
      }
    };

    child.stdout?.on("data", (d) => emitLogs(d, "info", ">"));
    child.stderr?.on("data", (d) => emitLogs(d, "warn", "!"));

    heartbeatTimer = setInterval(() => {
      mainWindow?.webContents.send("install-log", { text: heartbeatText, type: "info", prefix: "..." });
    }, heartbeatMs);
  });
}

function generateConfig(providers, channels, customProviderMap = {}, envNameMap = {}) {
  const config = {
    gateway: { mode: "local", bind: "loopback", port: 18789 },
    models: { mode: "merge", providers: {} },
    agents: { defaults: { workspace: "~/.openclaw/workspace", model: {}, models: {} } },
    channels: {},
  };

  const providerConfigs = {
    deepseek: {
      baseUrl: "https://api.deepseek.com",
      apiKey: "${DEEPSEEK_API_KEY}",
      api: "openai-completions",
      models: [
        { id: "deepseek-chat", name: "DeepSeek Chat (V3)", reasoning: false, input: ["text"], contextWindow: 128000, maxTokens: 8192 },
        { id: "deepseek-reasoner", name: "DeepSeek Reasoner", reasoning: true, input: ["text"], contextWindow: 128000, maxTokens: 65536 },
      ],
    },
    anthropic: {
      apiKey: "${ANTHROPIC_API_KEY}",
      api: "anthropic",
      models: [
        { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4", reasoning: false, input: ["text", "image"], contextWindow: 200000, maxTokens: 8192 },
      ],
    },
    openai: {
      baseUrl: "https://api.openai.com/v1",
      apiKey: "${OPENAI_API_KEY}",
      api: "openai-completions",
      models: [
        { id: "gpt-4o", name: "GPT-4o", reasoning: false, input: ["text", "image"], contextWindow: 128000, maxTokens: 16384 },
        { id: "o3-mini", name: "o3-mini", reasoning: true, input: ["text"], contextWindow: 128000, maxTokens: 65536 },
      ],
    },
    google: {
      apiKey: "${GOOGLE_API_KEY}",
      api: "google-gemini",
      models: [
        { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", reasoning: true, input: ["text", "image"], contextWindow: 1000000, maxTokens: 65536 },
        { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", reasoning: false, input: ["text", "image"], contextWindow: 1000000, maxTokens: 8192 },
      ],
    },
    openrouter: {
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: "${OPENROUTER_API_KEY}",
      api: "openai-completions",
      models: [{ id: "auto", name: "OpenRouter Auto", reasoning: false, input: ["text"], contextWindow: 128000, maxTokens: 8192 }],
    },
    ollama: {
      baseUrl: "http://localhost:11434/v1",
      api: "openai-completions",
      models: [
        { id: "deepseek-r1:7b", name: "DeepSeek R1 7B (Local)", reasoning: true, input: ["text"], contextWindow: 32000, maxTokens: 8192 },
        { id: "llama3:8b", name: "Llama 3 8B (Local)", reasoning: false, input: ["text"], contextWindow: 8192, maxTokens: 4096 },
      ],
    },
  };

  const resolvedProviderConfigs = {};
  for (const pid of providers) {
    if (providerConfigs[pid]) {
      const builtIn = JSON.parse(JSON.stringify(providerConfigs[pid]));
      if (builtIn.apiKey) {
        const envName = envNameMap[pid] || toProviderEnvName(pid);
        builtIn.apiKey = `\${${envName}}`;
      }
      resolvedProviderConfigs[pid] = builtIn;
    } else if (customProviderMap[pid]) {
      const custom = customProviderMap[pid];
      const envName = envNameMap[pid] || toProviderEnvName(pid);
      resolvedProviderConfigs[pid] = buildCustomProviderConfig(custom, envName);
    }
  }

  for (const [pid, pc] of Object.entries(resolvedProviderConfigs)) {
    config.models.providers[pid] = pc;
    for (const m of pc.models || []) {
      config.agents.defaults.models[`${pid}/${m.id}`] = {};
    }
  }

  // Set default model (first provider's first model)
  if (providers.length > 0) {
    const first = resolvedProviderConfigs[providers[0]];
    if (first?.models?.[0]) {
      config.agents.defaults.model.primary = `${providers[0]}/${first.models[0].id}`;
    }
  }

  // Channels
  // WebChat/Control UI is built into gateway 18789 in current OpenClaw, no dedicated channels.webchat key.
  if (channels.includes("whatsapp")) config.channels.whatsapp = { enabled: true };
  if (channels.includes("telegram")) config.channels.telegram = { enabled: true };
  if (channels.includes("discord")) config.channels.discord = { enabled: true };
  if (channels.includes("slack")) config.channels.slack = { enabled: true };

  return config;
}

function toProviderEnvName(providerId) {
  const raw = String(providerId || "").toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const core = raw || "CUSTOM";
  return `${core}_API_KEY`;
}

function normalizeBaseUrl(baseUrl) {
  const url = String(baseUrl || "").trim();
  if (!url) return "";
  return url.endsWith("/") ? url : `${url}/`;
}

function normalizeCustomProvider(custom = {}) {
  const id = String(custom.id || "").trim();
  return {
    id: id || `custom_${Date.now()}`,
    name: String(custom.name || "自定义供应商").trim() || "自定义供应商",
    api: custom.api === "anthropic" ? "anthropic" : "openai-completions",
    baseUrl: normalizeBaseUrl(custom.baseUrl || ""),
    modelId: String(custom.modelId || "custom-model").trim() || "custom-model",
    modelName: String(custom.modelName || "").trim() || "自定义模型",
    reasoning: Boolean(custom.reasoning),
    contextWindow: Number(custom.contextWindow) > 0 ? Number(custom.contextWindow) : 128000,
    maxTokens: Number(custom.maxTokens) > 0 ? Number(custom.maxTokens) : 8192,
    envName: String(custom.envName || "").trim(),
  };
}

function toCustomProviderMap(customProviders = []) {
  const map = {};
  for (const item of customProviders) {
    const normalized = normalizeCustomProvider(item);
    map[normalized.id] = normalized;
  }
  return map;
}

function buildProviderEnvNameMap(providers = [], customProviderMap = {}) {
  const map = {};
  for (const pid of providers) {
    const custom = customProviderMap[pid];
    if (custom?.envName) {
      map[pid] = toProviderEnvName(custom.envName);
    } else {
      map[pid] = toProviderEnvName(pid);
    }
  }
  return map;
}

function buildCustomProviderConfig(customProvider, envName) {
  const cfg = {
    api: customProvider.api,
    apiKey: `\${${envName}}`,
    models: [
      {
        id: customProvider.modelId,
        name: customProvider.modelName || customProvider.name,
        reasoning: customProvider.reasoning,
        input: ["text"],
        contextWindow: customProvider.contextWindow,
        maxTokens: customProvider.maxTokens,
      },
    ],
  };

  if (customProvider.baseUrl) {
    // Keep the user-entered endpoint for proxy / self-hosted gateway scenarios.
    cfg.baseUrl = customProvider.baseUrl.replace(/\/+$/, "");
  }

  return cfg;
}

async function stopOpenClawProcesses(platform, send) {
  send({ text: "正在停止 OpenClaw 相关进程...", type: "info", prefix: "..." });
  const commands = platform === "win32"
    ? ["taskkill /F /IM openclaw.exe"]
    : ["pkill -f 'openclaw gateway'", "pkill -f openclaw"];

  for (const cmd of commands) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await runCommand(cmd, { timeoutMs: 12000, heartbeatMs: 6000, heartbeatText: "正在停止进程..." });
      send({ text: `已执行：${cmd}`, type: "success", prefix: "OK" });
    } catch {
      send({ text: `进程可能未运行，跳过：${cmd}`, type: "warn", prefix: "!" });
    }
  }
}

async function uninstallOpenClawCLI(send) {
  const before = getOpenClawVersion();
  if (!before) {
    send({ text: "未检测到 OpenClaw CLI，跳过全局卸载", type: "info", prefix: "..." });
    return;
  }

  const attempts = [
    `npm uninstall -g openclaw --registry=${NPM_MIRROR_REGISTRY} --no-audit --no-fund --prefer-offline --ignore-scripts --loglevel=warn`,
    "npm uninstall -g openclaw --no-audit --no-fund --prefer-offline --ignore-scripts --loglevel=warn",
  ];

  for (const cmd of attempts) {
    send({ text: cmd, type: "info", prefix: "$" });
    try {
      // eslint-disable-next-line no-await-in-loop
      await runCommand(cmd, { timeoutMs: 10 * 60 * 1000, heartbeatMs: 10000, heartbeatText: "正在执行全局卸载..." });
    } catch (e) {
      send({ text: `卸载命令失败：${e.message}`, type: "warn", prefix: "!" });
    }

    const after = getOpenClawVersion();
    if (!after) {
      send({ text: "OpenClaw CLI 卸载成功", type: "success", prefix: "OK" });
      return;
    }
  }

  send({ text: "npm 卸载未完成，尝试本地文件兜底卸载...", type: "warn", prefix: "!" });
  forceRemoveGlobalOpenClaw(send);
  const afterFallback = getOpenClawVersion();
  if (!afterFallback) {
    send({ text: "已通过兜底方案完成 OpenClaw CLI 卸载", type: "success", prefix: "OK" });
    return;
  }

  const stillThere = getOpenClawVersion();
  if (stillThere) {
    throw new Error(`CLI 仍存在：${stillThere}`);
  }
}

function forceRemoveGlobalOpenClaw(send) {
  let npmRoot = "";
  let npmPrefix = "";
  try {
    npmRoot = execSync("npm root -g", { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    npmRoot = "";
  }

  try {
    npmPrefix = execSync("npm config get prefix", { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    npmPrefix = "";
  }

  const candidates = new Set();
  if (npmRoot) {
    candidates.add(path.join(npmRoot, "openclaw"));
    candidates.add(path.join(npmRoot, ".bin", "openclaw"));
    candidates.add(path.join(npmRoot, ".bin", "openclaw.cmd"));
    candidates.add(path.join(npmRoot, ".bin", "openclaw.ps1"));
  }
  if (npmPrefix) {
    const binDir = os.platform() === "win32" ? npmPrefix : path.join(npmPrefix, "bin");
    candidates.add(path.join(binDir, "openclaw"));
    candidates.add(path.join(binDir, "openclaw.cmd"));
    candidates.add(path.join(binDir, "openclaw.ps1"));
  }

  let removed = 0;
  for (const filePath of candidates) {
    try {
      if (!fs.existsSync(filePath)) continue;
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        fs.rmSync(filePath, { recursive: true, force: true });
      } else {
        fs.rmSync(filePath, { force: true });
      }
      removed += 1;
      send({ text: `已删除：${filePath}`, type: "info", prefix: "..." });
    } catch (e) {
      send({ text: `删除失败（忽略）：${filePath} -> ${e.message}`, type: "warn", prefix: "!" });
    }
  }

  if (removed === 0) {
    send({ text: "未找到可删除的全局 OpenClaw 文件", type: "info", prefix: "..." });
  }
}

function setupShellEnv(platform, home, clawDir) {
  const loadLine = `\n# OpenClaw API Keys\nif [ -f "${clawDir}/.env" ]; then set -a; source "${clawDir}/.env"; set +a; fi\n`;
  if (platform === "win32") {
    // On Windows, we write a .bat loader
    const batPath = path.join(clawDir, "load-env.bat");
    const envFile = path.join(clawDir, ".env");
    const batContent = `@echo off\r\nfor /F "tokens=1,2 delims==" %%a in ('type "${envFile}"') do set %%a=%%b\r\n`;
    fs.writeFileSync(batPath, batContent, "utf-8");
  } else {
    // macOS / Linux: append to .bashrc / .zshrc
    const rcFiles = [".bashrc", ".zshrc"];
    for (const rc of rcFiles) {
      const rcPath = path.join(home, rc);
      if (fs.existsSync(rcPath)) {
        const content = fs.readFileSync(rcPath, "utf-8");
        if (!content.includes("OpenClaw API Keys")) {
          fs.appendFileSync(rcPath, loadLine, "utf-8");
        }
      }
    }
  }
}

