// HuggingFace Space 自动保活 Worker（Cloudflare）
// 核心功能：定时检测状态 + 自动唤醒 + 智能重启

// 1. 配置你的 HuggingFace Space 列表（可添加多个）
const HF_SPACES = [
    {
      name: "HF-space",          // 自定义名称（前端显示用）
      region: "Global",          // 区域（自定义）
      url: "https://ic6-h2.hf.space",  // Space 前端访问 URL（关键：用于唤醒）
      spaceName: "ic6/h2",       // Space 唯一标识（格式：用户名/空间名，用于 API 调用）
      description: "主要应用空间（免费 CPU 版）"
    }
  ];
  
  // 2. 保活配置（可根据需求调整）
  const CONFIG = {
    checkInterval: 15 * 60 * 1000,  // 定时检测间隔（15分钟，免费版建议≥10分钟避免配额超限）
    timeout: 30000,                 // 请求超时时间（30秒）
    wakeUpThreshold: 1,             // 连续检测到睡眠 N 次后触发唤醒（建议 1-2）
    retryCount: 1                   // 请求失败重试次数（1次足够）
  };
  
  // 3. 全局状态管理（记录连续睡眠次数，避免误唤醒）
  let spaceStateCache = {};
  // 初始化缓存
  HF_SPACES.forEach(space => {
    spaceStateCache[space.spaceName] = {
      consecutiveSleepCount: 0,  // 连续睡眠次数
      lastWakeUpTime: 0          // 上次唤醒时间（毫秒时间戳）
    };
  });
  
  class HuggingFaceKeeper {
    constructor() {
      this.lastUpdate = new Date();
      this.appStatus = {};
      // 从 Worker 环境变量获取 API Token（需在 Cloudflare 控制台配置）
      this.hfApiToken = typeof HF_API_TOKEN !== "undefined" ? HF_API_TOKEN : "";
    }
  
    /**
     * 核心1：检测 Space 真实状态（基于 HuggingFace 官方 API）
     * @param {Object} space - Space 配置项
     * @returns {Object} 状态详情（status: active/inactive/building/error）
     */
    async checkSpaceStatus(space) {
      let retry = CONFIG.retryCount;
      while (retry > 0) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), CONFIG.timeout);
  
          // 调用 HuggingFace Space 状态 API（官方文档：https://huggingface.co/docs/hub/api#spaces）
          const response = await fetch(`https://huggingface.co/api/spaces/${space.spaceName}`, {
            method: "GET",
            signal: controller.signal,
            headers: {
              "User-Agent": "HF-Keeper/1.0 (Cloudflare Worker)",
              ...(this.hfApiToken ? { "Authorization": `Bearer ${this.hfApiToken}` } : {})
            }
          });
  
          clearTimeout(timeoutId);
          const spaceData = await response.json();
  
          // 根据 API 返回的 runtime.stage 判断状态
          let status, statusDesc;
          switch (spaceData.runtime?.stage) {
            case "RUNNING":
              status = "active";
              statusDesc = "正常运行中";
              spaceStateCache[space.spaceName].consecutiveSleepCount = 0; // 重置睡眠计数
              break;
            case "SLEEPING":
              status = "inactive";
              statusDesc = "已睡眠（需唤醒）";
              spaceStateCache[space.spaceName].consecutiveSleepCount += 1; // 累加睡眠计数
              break;
            case "BUILDING":
            case "STARTING":
              status = "building";
              statusDesc = "构建/启动中";
              break;
            default:
              status = "error";
              statusDesc = `异常状态: ${spaceData.runtime?.stage || "未知"}`;
          }
  
          return {
            status,
            statusDesc,
            statusCode: response.status,
            responseTime: Date.now() - this.lastUpdate.getTime(),
            lastChecked: new Date().toISOString(),
            details: {
              runtime: spaceData.runtime?.stage || "未知",
              hardware: spaceData.runtime?.hardware || "未知",
              storage: spaceData.runtime?.storage || "未知",
              sleepCount: spaceStateCache[space.spaceName].consecutiveSleepCount // 连续睡眠次数
            }
          };
  
        } catch (error) {
          retry--;
          if (retry === 0) {
            console.error(`[${space.spaceName}] 状态检测失败:`, error.message);
            return {
              status: "error",
              statusDesc: "检测请求失败",
              statusCode: 500,
              responseTime: 0,
              lastChecked: new Date().toISOString(),
              details: { error: error.message }
            };
          }
          await new Promise(resolve => setTimeout(resolve, 1000)); // 重试间隔1秒
        }
      }
    }
  
    /**
     * 核心2：唤醒睡眠的 Space（主动访问前端 URL，免费版关键保活手段）
     * @param {Object} space - Space 配置项
     * @returns {Object} 唤醒结果
     */
    async wakeUpSpace(space) {
      try {
        // 避免短时间内重复唤醒（10分钟内只唤醒1次）
        const now = Date.now();
        if (now - spaceStateCache[space.spaceName].lastWakeUpTime < 10 * 60 * 1000) {
          return {
            success: false,
            message: "10分钟内已唤醒过，跳过重复操作",
            timestamp: new Date().toISOString()
          };
        }
  
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), CONFIG.timeout);
  
        // 访问 Space 前端 URL 唤醒（无需 API Token，模拟用户访问）
        const response = await fetch(space.url, {
          method: "GET",
          signal: controller.signal,
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml"
          }
        });
  
        clearTimeout(timeoutId);
        spaceStateCache[space.spaceName].lastWakeUpTime = now; // 更新唤醒时间
        spaceStateCache[space.spaceName].consecutiveSleepCount = 0; // 重置睡眠计数
  
        return {
          success: response.ok,
          message: response.ok ? "唤醒请求已发送（Space 正在启动）" : `唤醒失败（HTTP ${response.status}）`,
          statusCode: response.status,
          timestamp: new Date().toISOString()
        };
  
      } catch (error) {
        console.error(`[${space.spaceName}] 唤醒失败:`, error.message);
        return {
          success: false,
          message: `唤醒请求异常: ${error.message}`,
          timestamp: new Date().toISOString()
        };
      }
    }
  
    /**
     * 核心3：重启 Space（唤醒无效时备用，需 API Token）
     * @param {Object} space - Space 配置项
     * @returns {Object} 重启结果
     */
    async restartSpace(space) {
      if (!this.hfApiToken) {
        return { success: false, message: "未配置 HF_API_TOKEN，无法调用重启 API" };
      }
  
      try {
        const response = await fetch(`https://huggingface.co/api/spaces/${space.spaceName}/restart`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${this.hfApiToken}`,
            "Content-Type": "application/json",
            "User-Agent": "HF-Keeper/1.0 (Cloudflare Worker)"
          }
        });
  
        return {
          success: response.ok,
          message: response.ok ? "重启请求已发送（约10-30秒生效）" : `重启失败（HTTP ${response.status}）`,
          timestamp: new Date().toISOString()
        };
      } catch (error) {
        console.error(`[${space.spaceName}] 重启失败:`, error.message);
        return { success: false, message: `重启异常: ${error.message}` };
      }
    }
  
    /**
     * 获取所有 Space 状态（供前端显示和定时任务使用）
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
     * 生成前端监控页面（优化状态显示，区分活跃/睡眠/异常）
     */
    generateHTML(statusData) {
      const lastUpdate = this.lastUpdate.toLocaleString("zh-CN");
      const spaceList = Object.values(statusData);
  
      // 状态颜色映射
      const getStatusColor = (status) => {
        switch (status) {
          case "active": return "#48c78e"; // 成功绿
          case "inactive": return "#f14668"; // 危险红
          case "building": return "#ffe08a"; // 警告黄
          case "error": return "#f14668"; // 错误红
          default: return "#363636"; // 默认黑
        }
      };
  
      return `
  <!DOCTYPE html>
  <html lang="zh-CN">
  <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>HF-Keeper - HuggingFace 自动保活</title>
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
          .action-buttons { display: flex; gap: 12px; }
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
              .action-buttons { flex-wrap: wrap; }
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
                      <div class="metric-value">${space.details.hardware}</div>
                      <div class="metric-label">硬件配置</div>
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
              <p>HF-Keeper v1.0 | 定时保活间隔: ${CONFIG.checkInterval / 60000}分钟 | 配置 ${HF_SPACES.length} 个 Space</p>
          </div>
      </div>
  
      <script>
          // 前端状态刷新
          function refreshStatus() { window.location.reload(); }
  
          // 前端手动唤醒
          async function wakeUpSpace(spaceName) {
              try {
                  const res = await fetch(\`/wake?space=\${spaceName}\`);
                  const data = await res.json();
                  alert(data.success ? \`✅ \${data.message}\` : \`❌ \${data.message}\`);
                  setTimeout(refreshStatus, 3000);
              } catch (e) { alert(\`操作失败: \${e.message}\`); }
          }
  
          // 前端手动重启
          async function restartSpace(spaceName) {
              if (!confirm("确定重启？服务会中断10-30秒")) return;
              try {
                  const res = await fetch(\`/restart?space=\${spaceName}\`);
                  const data = await res.json();
                  alert(data.success ? \`✅ \${data.message}\` : \`❌ \${data.message}\`);
                  setTimeout(refreshStatus, 5000);
              } catch (e) { alert(\`操作失败: \${e.message}\`); }
          }
  
          // 前端自动刷新（5分钟一次）
          setInterval(refreshStatus, 5 * 60 * 1000);
      </script>
  </body>
  </html>`;
    }
  }
  
  /**
   * HTTP 请求处理（前端页面、唤醒/重启接口、状态接口）
   */
  async function handleRequest(request) {
    const keeper = new HuggingFaceKeeper();
    const url = new URL(request.url);
    const spaceName = url.searchParams.get("space");
    const targetSpace = HF_SPACES.find(s => s.spaceName === spaceName) || HF_SPACES[0];
  
    // 1. 唤醒接口（/wake?space=用户名/空间名）
    if (url.pathname === "/wake") {
      if (!targetSpace) return new Response(JSON.stringify({ success: false, message: "Space 不存在" }), { headers: { "Content-Type": "application/json" } });
      const result = await keeper.wakeUpSpace(targetSpace);
      return new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json" } });
    }
  
    // 2. 重启接口（/restart?space=用户名/空间名）
    if (url.pathname === "/restart") {
      if (!targetSpace) return new Response(JSON.stringify({ success: false, message: "Space 不存在" }), { headers: { "Content-Type": "application/json" } });
      const result = await keeper.restartSpace(targetSpace);
      return new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json" } });
    }
  
    // 3. 状态接口（/status，返回 JSON）
    if (url.pathname === "/status") {
      const status = await keeper.getAllStatus();
      return new Response(JSON.stringify(status, null, 2), { headers: { "Content-Type": "application/json" } });
    }
  
    // 4. 默认返回前端监控页面
    const status = await keeper.getAllStatus();
    const html = keeper.generateHTML(status);
    return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  }
  
  /**
   * 定时保活任务（Cloudflare Scheduled Trigger 触发）
   * 核心：检测所有 Space，连续睡眠达到阈值则自动唤醒
   */
  async function handleScheduledEvent() {
    console.log(`[定时保活] 开始执行（${new Date().toLocaleString()}）`);
    const keeper = new HuggingFaceKeeper();
  
    try {
      // 1. 获取所有 Space 状态
      const statusData = await keeper.getAllStatus();
      const spaceList = Object.values(statusData);
  
      // 2. 遍历检测，符合条件则自动唤醒
      for (const space of spaceList) {
        console.log(`[${space.spaceName}] 状态: ${space.status}（连续睡眠: ${space.details.sleepCount}次）`);
        
        // 连续睡眠达到阈值 → 触发自动唤醒
        if (space.status === "inactive" && space.details.sleepCount >= CONFIG.wakeUpThreshold) {
          console.log(`[${space.spaceName}] 触发自动唤醒`);
          const wakeResult = await keeper.wakeUpSpace(space);
          console.log(`[${space.spaceName}] 唤醒结果: ${wakeResult.success ? "成功" : "失败"} - ${wakeResult.message}`);
          
          // 唤醒失败 → 尝试重启（备选方案）
          if (!wakeResult.success && keeper.hfApiToken) {
            console.log(`[${space.spaceName}] 唤醒失败，尝试重启`);
            const restartResult = await keeper.restartSpace(space);
            console.log(`[${space.spaceName}] 重启结果: ${restartResult.success ? "成功" : "失败"} - ${restartResult.message}`);
          }
        }
      }
  
      console.log(`[定时保活] 执行完成（共处理 ${spaceList.length} 个 Space）`);
    } catch (error) {
      console.error(`[定时保活] 执行异常:`, error.message);
    }
  }
  
  // 注册 Cloudflare Worker 事件
  addEventListener("fetch", event => {
    event.respondWith(handleRequest(event.request));
  });
  
  addEventListener("scheduled", event => {
    event.waitUntil(handleScheduledEvent());
  });
