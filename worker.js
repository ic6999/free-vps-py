// HuggingFace Space 自动保活 Worker
// 核心功能：显示Space自上次启动后的真实运行时间
const HF_SPACES = [
  {
    name: "Space",
    region: "Global",
    url: "https://ic6-h2.hf.space",
    spaceName: "ic6/h2",
    description: "主要应用空间（免费 CPU 版）"
  }
];

const CONFIG = {
  checkInterval: 15 * 60 * 1000,
  timeout: 30000,
  wakeUpThreshold: 1,
  retryCount: 1
};

// 全局状态管理（重点追踪Space的实际启动时间）
let spaceStateCache = {};
HF_SPACES.forEach(space => {
  spaceStateCache[space.spaceName] = {
    consecutiveSleepCount: 0,
    lastWakeUpTime: 0,
    // 关键字段：记录Space实际启动/唤醒的时间（而非Worker时间）
    spaceStartTime: 0, 
    lastKnownStatus: "unknown" // 记录上一次的状态，用于检测状态变化
  };
});

class HuggingFaceKeeper {
  constructor() {
    this.lastUpdate = new Date();
    this.appStatus = {};
    this.hfApiToken = typeof HF_API_TOKEN !== "undefined" ? HF_API_TOKEN : "";
  }

  /**
   * 格式化时间差（天/时/分/秒）
   */
  formatDuration(ms) {
    if (typeof ms !== 'number' || isNaN(ms) || ms < 0) return "0秒";
    
    const second = Math.floor(ms / 1000) % 60;
    const minute = Math.floor(ms / (1000 * 60)) % 60;
    const hour = Math.floor(ms / (1000 * 60 * 60)) % 24;
    const day = Math.floor(ms / (1000 * 60 * 60 * 24));
    
    const parts = [];
    if (day > 0) parts.push(`${day}天`);
    if (hour > 0 || parts.length > 0) parts.push(`${hour}时`);
    if (minute > 0 || parts.length > 0) parts.push(`${minute}分`);
    parts.push(`${second}秒`);
    
    return parts.join("");
  }

  /**
   * 检测Space状态（核心：追踪Space实际启动时间）
   */
  async checkSpaceStatus(space) {
    const cache = spaceStateCache[space.spaceName];
    const checkStartTime = Date.now();
    let retry = CONFIG.retryCount;
    
    while (retry > 0) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), CONFIG.timeout);
        const requestStartTime = Date.now();
        
        const response = await fetch(`https://huggingface.co/api/spaces/${space.spaceName}`, {
          method: "GET",
          signal: controller.signal,
          headers: {
            "User-Agent": "HF-Keeper/1.0",
            ...(this.hfApiToken ? { "Authorization": `Bearer ${this.hfApiToken}` } : {})
          }
        });
        
        const requestDuration = Date.now() - requestStartTime;
        clearTimeout(timeoutId);
        const spaceData = await response.json();
        const now = Date.now();

        let status, statusDesc, runningTime = "0秒";
        
        // 关键逻辑：检测Space状态变化，确定启动时间
        switch (spaceData.runtime?.stage) {
          case "RUNNING":
            status = "active";
            statusDesc = "正常运行中";
            
            // 状态从非运行变为运行 → 记录启动时间（Space实际启动时刻）
            if (cache.lastKnownStatus !== "active") {
              // 如果是首次检测或从睡眠/启动状态切换而来
              cache.spaceStartTime = now; 
              console.log(`[${space.spaceName}] 检测到启动，记录启动时间: ${new Date(cache.spaceStartTime).toLocaleString()}`);
            }
            
            // 计算运行时间：当前时间 - Space实际启动时间
            runningTime = this.formatDuration(now - cache.spaceStartTime);
            cache.consecutiveSleepCount = 0;
            break;
            
          case "SLEEPING":
            status = "inactive";
            statusDesc = "已睡眠（需唤醒）";
            runningTime = "已睡眠";
            cache.consecutiveSleepCount += 1;
            break;
            
          case "BUILDING":
          case "STARTING":
            status = "building";
            statusDesc = "构建/启动中";
            runningTime = "启动中";
            break;
            
          default:
            status = "error";
            statusDesc = "异常状态";
            runningTime = "状态异常";
        }
        
        // 更新最后已知状态，用于下次状态变化检测
        cache.lastKnownStatus = status;

        return {
          status,
          statusDesc,
          statusCode: response.status,
          responseTime: requestDuration,
          lastChecked: new Date(now).toISOString(),
          details: {
            sleepCount: cache.consecutiveSleepCount,
            runningTime: runningTime,
            spaceStartTime: cache.spaceStartTime // 传递Space启动时间给前端
          }
        };

      } catch (error) {
        retry--;
        if (retry === 0) {
          const errorDuration = Date.now() - checkStartTime;
          return {
            status: "error",
            statusDesc: "检测请求失败",
            statusCode: 500,
            responseTime: errorDuration,
            lastChecked: new Date().toISOString(),
            details: { 
              runningTime: "检测失败",
              spaceStartTime: cache.spaceStartTime
            }
          };
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  /**
   * 唤醒Space（唤醒成功后更新启动时间）
   */
  async wakeUpSpace(space) {
    const cache = spaceStateCache[space.spaceName];
    try {
      const now = Date.now();
      
      if (now - cache.lastWakeUpTime < 10 * 60 * 1000) {
        return {
          success: false,
          message: "10分钟内已唤醒过",
          timestamp: new Date(now).toISOString()
        };
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), CONFIG.timeout);

      const response = await fetch(space.url, {
        method: "GET",
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
      });

      clearTimeout(timeoutId);
      cache.lastWakeUpTime = now;
      // 唤醒时记录启动时间（Space将在几秒后变为运行状态）
      cache.spaceStartTime = now; 
      cache.consecutiveSleepCount = 0;

      return {
        success: response.ok,
        message: response.ok ? "唤醒请求已发送" : `唤醒失败（${response.status}）`,
        statusCode: response.status,
        timestamp: new Date(now).toISOString()
      };

    } catch (error) {
      return {
        success: false,
        message: `唤醒异常: ${error.message}`,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * 重启Space（重启成功后更新启动时间）
   */
  async restartSpace(space) {
    if (!this.hfApiToken) {
      return { success: false, message: "未配置HF_API_TOKEN" };
    }

    const cache = spaceStateCache[space.spaceName];
    try {
      const response = await fetch(`https://huggingface.co/api/spaces/${space.spaceName}/restart`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.hfApiToken}`,
          "Content-Type": "application/json"
        }
      });

      if (response.ok) {
        const now = Date.now();
        cache.spaceStartTime = now; // 重启后记录新的启动时间
      }

      return {
        success: response.ok,
        message: response.ok ? "重启请求已发送" : `重启失败（${response.status}）`,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return { success: false, message: `重启异常: ${error.message}` };
    }
  }

  /**
   * 获取所有状态
   */
  async getAllStatus() {
    const results = await Promise.all(HF_SPACES.map(space => this.checkSpaceStatus(space)));
    HF_SPACES.forEach((space, index) => {
      this.appStatus[space.name] = { ...space, ...results[index] };
    });
    this.lastUpdate = new Date();
    return this.appStatus;
  }

  /**
   * 生成前端页面
   */
  generateHTML(statusData) {
    const lastUpdate = this.lastUpdate.toLocaleString("zh-CN");
    const spaceList = Object.values(statusData);

    const getStatusColor = (status) => {
      switch (status) {
        case "active": return "#48c78e";
        case "inactive": return "#f14668";
        case "building": return "#ffe08a";
        case "error": return "#f14668";
        default: return "#363636";
      }
    };

    return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>HF-Keeper 自动保活</title>
    <style>
        :root {
            --primary: #ff6b35;
            --dark: #363636;
            --light: #f5f5f5;
            --success: #48c78e;
            --warning: #ffe08a;
            --danger: #f14668;
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', system-ui, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
            color: var(--dark);
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: rgba(255,255,255,0.95);
            backdrop-filter: blur(10px);
            border-radius: 20px;
            padding: 30px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.1);
        }
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 1px solid var(--light);
        }
        .header h1 { color: var(--primary); font-size: 2em; }
        .update-time { font-size: 0.9em; opacity: 0.8; }
        .space-card {
            margin-bottom: 25px;
            padding: 25px;
            border-radius: 15px;
            background: var(--light);
        }
        .card-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
        }
        .space-name { font-size: 1.4em; font-weight: 700; }
        .status-badge {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 6px 12px;
            border-radius: 20px;
            font-weight: 600;
            font-size: 0.9em;
        }
        .status-dot {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            animation: pulse 2s infinite;
        }
        @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.5; } 100% { opacity: 1; } }
        .metrics {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
            gap: 15px;
            margin-bottom: 20px;
        }
        .metric-item {
            padding: 12px;
            border-radius: 10px;
            background: white;
            text-align: center;
        }
        .metric-value {
            font-size: 1.5em;
            font-weight: 800;
            color: var(--primary);
            margin-bottom: 5px;
        }
        .metric-label { font-size: 0.85em; opacity: 0.8; }
        .action-buttons { display: flex; gap: 12px; flex-wrap: wrap; }
        .btn {
            padding: 10px 20px;
            border: none;
            border-radius: 10px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s;
            font-size: 0.9em;
        }
        .btn-wake { background: var(--success); color: white; }
        .btn-restart { background: var(--primary); color: white; }
        .btn-refresh { background: var(--dark); color: white; }
        .btn:hover { transform: translateY(-2px); opacity: 0.9; }
        .footer {
            text-align: center;
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid var(--light);
            font-size: 0.9em;
            opacity: 0.8;
        }
        @media (max-width: 768px) {
            .metrics { grid-template-columns: 1fr 1fr; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>HF-Keeper 自动保活监控</h1>
            <div class="update-time">最后更新: ${lastUpdate}</div>
        </div>

        ${spaceList.map(space => `
        <div class="space-card">
            <div class="card-header">
                <div class="space-name">${space.name} (${space.spaceName})</div>
                <div class="status-badge" style="background: ${getStatusColor(space.status)}20; color: ${getStatusColor(space.status)}">
                    <div class="status-dot" style="background: ${getStatusColor(space.status)}"></div>
                    ${space.statusDesc}
                </div>
            </div>

            <div class="metrics">
                <div class="metric-item">
                    <div class="metric-value">${space.responseTime || 0}ms</div>
                    <div class="metric-label">响应时间</div>
                </div>
                <div class="metric-item">
                    <div class="metric-value">${space.statusCode}</div>
                    <div class="metric-label">状态码</div>
                </div>
                <div class="metric-item">
                    <div class="metric-value running-time" 
                         data-start-time="${space.details.spaceStartTime}"
                         data-status="${space.status}">
                        ${space.details.runningTime}
                    </div>
                    <div class="metric-label">Space运行时间</div>
                </div>
                <div class="metric-item">
                    <div class="metric-value">${space.details.sleepCount}</div>
                    <div class="metric-label">连续睡眠次数</div>
                </div>
            </div>

            <div class="action-buttons">
                <button class="btn btn-refresh" onclick="refreshStatus()">🔄 刷新状态</button>
                <button class="btn btn-wake" onclick="wakeUpSpace('${space.spaceName}')">⏰ 手动唤醒</button>
                <button class="btn btn-restart" onclick="restartSpace('${space.spaceName}')">🔄 手动重启</button>
            </div>
        </div>
        `).join("")}

        <div class="footer">
            <p>HF-Keeper | 保活间隔: ${CONFIG.checkInterval / 60000}分钟 | 管理 ${HF_SPACES.length} 个 Space</p>
        </div>
    </div>

    <script>
        // 格式化时间差
        function formatDuration(ms) {
            if (typeof ms !== 'number' || isNaN(ms) || ms < 0) return "0秒";
            
            const second = Math.floor(ms / 1000) % 60;
            const minute = Math.floor(ms / (1000 * 60)) % 60;
            const hour = Math.floor(ms / (1000 * 60 * 60)) % 24;
            const day = Math.floor(ms / (1000 * 60 * 60 * 24));
            
            const parts = [];
            if (day > 0) parts.push(\`\${day}天\`);
            if (hour > 0 || parts.length > 0) parts.push(\`\${hour}时\`);
            if (minute > 0 || parts.length > 0) parts.push(\`\${minute}分\`);
            parts.push(\`\${second}秒\`);
            
            return parts.join("");
        }

        // 实时更新Space运行时间（基于Space实际启动时间）
        function startRealTimeUpdate() {
            setInterval(() => {
                document.querySelectorAll('.running-time[data-status="active"]').forEach(el => {
                    // 使用Space实际启动时间计算，而非Worker刷新时间
                    const startTime = Number(el.dataset.startTime);
                    const now = Date.now();
                    const durationMs = now - startTime;
                    el.textContent = formatDuration(durationMs > 0 ? durationMs : 0);
                });
            }, 1000);
        }

        window.onload = startRealTimeUpdate;

        // 刷新状态
        function refreshStatus() { window.location.reload(); }

        // 手动唤醒
        async function wakeUpSpace(spaceName) {
            try {
                const res = await fetch(\`/wake?space=\${spaceName}\`);
                const data = await res.json();
                alert(data.success ? \`✅ \${data.message}\` : \`❌ \${data.message}\`);
                setTimeout(refreshStatus, 3000);
            } catch (e) { alert(\`操作失败: \${e.message}\`); }
        }

        // 手动重启
        async function restartSpace(spaceName) {
            if (!confirm("确定重启？服务会中断10-30秒")) return;
            try {
                const res = await fetch(\`/restart?space=\${spaceName}\`);
                const data = await res.json();
                alert(data.success ? \`✅ \${data.message}\` : \`❌ \${data.message}\`);
                setTimeout(refreshStatus, 5000);
            } catch (e) { alert(\`操作失败: \${e.message}\`); }
        }

        // 定时全局刷新
        setInterval(refreshStatus, 5 * 60 * 1000);
    </script>
</body>
</html>`;
  }
}

/**
 * 请求处理
 */
async function handleRequest(request) {
  const keeper = new HuggingFaceKeeper();
  const url = new URL(request.url);
  const spaceName = url.searchParams.get("space");
  const targetSpace = HF_SPACES.find(s => s.spaceName === spaceName) || HF_SPACES[0];

  if (url.pathname === "/wake") {
    if (!targetSpace) return new Response(JSON.stringify({ success: false, message: "Space不存在" }), { headers: { "Content-Type": "application/json" } });
    const result = await keeper.wakeUpSpace(targetSpace);
    return new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json" } });
  }

  if (url.pathname === "/restart") {
    if (!targetSpace) return new Response(JSON.stringify({ success: false, message: "Space不存在" }), { headers: { "Content-Type": "application/json" } });
    const result = await keeper.restartSpace(targetSpace);
    return new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json" } });
  }

  if (url.pathname === "/status") {
    const status = await keeper.getAllStatus();
    return new Response(JSON.stringify(status, null, 2), { headers: { "Content-Type": "application/json" } });
  }

  const status = await keeper.getAllStatus();
  const html = keeper.generateHTML(status);
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

/**
 * 定时任务
 */
async function handleScheduledEvent() {
  console.log(`[定时保活] 开始执行（${new Date().toLocaleString()}）`);
  const keeper = new HuggingFaceKeeper();

  try {
    const statusData = await keeper.getAllStatus();
    const spaceList = Object.values(statusData);

    for (const space of spaceList) {
      if (space.status === "inactive" && space.details.sleepCount >= CONFIG.wakeUpThreshold) {
        console.log(`[${space.spaceName}] 触发自动唤醒`);
        const wakeResult = await keeper.wakeUpSpace(space);
        
        if (!wakeResult.success && keeper.hfApiToken) {
          console.log(`[${space.spaceName}] 尝试重启`);
          await keeper.restartSpace(space);
        }
      }
    }
  } catch (error) {
    console.error(`[定时保活] 异常:`, error.message);
  }
}

// 注册事件
addEventListener("fetch", event => {
  event.respondWith(handleRequest(event.request));
});

addEventListener("scheduled", event => {
  event.waitUntil(handleScheduledEvent());
});
