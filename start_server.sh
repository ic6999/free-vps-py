#!/bin/bash
# 启动脚本：优先执行 auto.sh 部署Xray+Argo，再启动Jupyter Lab
set -e  # 关键：开启错误终止模式，避免前序命令失败后仍继续执行

# ==============================================
# 1. 部署 Xray + Argo 固定隧道（核心优化部分）
# ==============================================
# 1.1 定义固定参数（集中管理，后续修改更便捷）
ARGO_TUNNEL_ID="09bb88ac-00a2-4172-a432-2e5b445f3086"
ARGO_TUNNEL_TOKEN="eyJhIjoiMTkwOGYwYWUxODYzNzk0MGYwYTZkMjEyMGU0NTUwYTEiLCJ0IjoiMDliYjg4YWMtMDBhMi00MTcyLWE0MzItMmU1YjQ0NWYzMDg2IiwicyI6IlpEUmpPVEpsTURZdE16SXdaQzAwT1dFeUxXRmlOVEl0TmpWaU56WTBNREF4WVRaaiJ9"
ARGO_FIXED_DOMAIN="xray.ic666.qzz.io"
AUTO_SCRIPT_PATH="./auto.sh"  # 明确脚本路径，避免环境变量影响

# 1.2 检查 auto.sh 是否存在（避免执行不存在的脚本）
if [ ! -f "$AUTO_SCRIPT_PATH" ]; then
    echo -e "\033[31m错误：未找到 auto.sh 脚本，路径：$AUTO_SCRIPT_PATH\033[0m"
    exit 1  # 终止脚本，避免后续无效执行
fi

# 1.3 赋予执行权限（即使已存在权限，执行此命令也无副作用）
chmod +x "$AUTO_SCRIPT_PATH"
echo -e "\033[32m✅ auto.sh 权限配置完成\033[0m"

# 1.4 传递参数并执行 auto.sh（使用 export 确保参数全局生效，兼容复杂脚本逻辑）
export ARGO_TUNNEL_ID ARGO_TUNNEL_TOKEN ARGO_FIXED_DOMAIN
echo -e "\033[34m🔧 开始部署 Xray + Argo 固定隧道（域名：$ARGO_FIXED_DOMAIN）\033[0m"
"$AUTO_SCRIPT_PATH" --silent

# 1.5 验证 auto.sh 执行结果（确保部署成功后再启动Jupyter）
if [ $? -ne 0 ]; then
    echo -e "\033[31m❌ auto.sh 执行失败，请查看 /home/user/app/app.log 日志\033[0m"
    exit 1
fi
echo -e "\033[32m✅ Xray + Argo 固定隧道部署完成\033[0m"

# ==============================================
# 2. 启动 Jupyter Lab（保持原逻辑，建议补充日志输出）
# ==============================================
echo -e "\033[34m🔧 开始启动 Jupyter Lab\033[0m"


JUPYTER_TOKEN="${JUPYTER_TOKEN:=huggingface}"

NOTEBOOK_DIR="/data"

jupyter labextension disable "@jupyterlab/apputils-extension:announcements"

jupyter-lab \
    --ip 0.0.0.0 \
    --port 7860 \
    --no-browser \
    --allow-root \
    --ServerApp.token="$JUPYTER_TOKEN" \
    --ServerApp.tornado_settings="{'headers': {'Content-Security-Policy': 'frame-ancestors *'}}" \
    --ServerApp.cookie_options="{'SameSite': 'None', 'Secure': True}" \
    --ServerApp.disable_check_xsrf=True \
    --LabApp.news_url=None \
    --LabApp.check_for_updates_class="jupyterlab.NeverCheckForUpdate" \
    --notebook-dir=$NOTEBOOK_DIR
