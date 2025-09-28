#!/bin/bash
# 原启动脚本：启动 Jupyter Lab 前先执行 auto.sh

# 1. 执行自定义自动安装脚本（关键新增步骤）
if [ -f "./auto.sh" ]; then
    echo "检测到 auto.sh，开始执行..."
    chmod +x ./auto.sh  # 确保脚本可执行
    ./auto.sh --silent          # 运行自动安装脚本
    echo "auto.sh 执行完成"
else
    echo "未找到 auto.sh，跳过执行"
fi

# 2. 原 Jupyter Lab 启动逻辑（保持不变）
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
