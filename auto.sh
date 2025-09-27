#!/bin/bash

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

NODE_INFO_FILE="$HOME/.xray_nodes_info"
PROJECT_DIR_NAME="python-xray-argo"

# 静默模式默认参数（仅保留非敏感参数）
# ######################## 静默模式参数注入位置 ########################
SILENT_UUID="5aa21b54-0704-4878-ad2c-7b0ff0ea401c"  # 静默模式UUID（留空自动生成）
SILENT_NAME="xray-node"         # 节点名称
SILENT_PORT=3000                # 服务端口
SILENT_CFIP="joeyblog.net"      # 优选IP/域名
SILENT_CFPORT=443               # 优选端口
SILENT_ARGO_PORT=8080           # Argo端口
SILENT_SUB_PATH="sub"           # 订阅路径
SILENT_KEEP_ALIVE="true"        # 是否启用Hugging Face保活（true/false）
# #######################################################################

# 如果是-v参数，直接查看节点信息
if [ "$1" = "-v" ]; then
    if [ -f "$NODE_INFO_FILE" ]; then
        echo -e "${GREEN}========================================${NC}"
        echo -e "${GREEN}                      节点信息查看                      ${NC}"
        echo -e "${GREEN}========================================${NC}"
        echo
        cat "$NODE_INFO_FILE"
        echo
    else
        echo -e "${RED}未找到节点信息文件${NC}"
        echo -e "${YELLOW}请先运行部署脚本生成节点信息${NC}"
    fi
    exit 0
fi

# 静默模式处理
silent_mode() {
    echo -e "${BLUE}=== 静默安装模式 ===${NC}"
    echo -e "${YELLOW}使用预设参数进行部署，不进行交互...${NC}"

    # 自动生成UUID（如果未指定）
    if [ -z "$SILENT_UUID" ]; then
        SILENT_UUID=$(generate_uuid)
        echo -e "${GREEN}自动生成UUID: $SILENT_UUID${NC}"
    fi

    # 检查保活参数合法性（从环境变量读取，不再依赖本地变量）
    if [ "$SILENT_KEEP_ALIVE" = "true" ]; then
        # 检查环境变量是否存在（Hugging Face Secrets会注入这些变量）
        if [ -z "$HF_TOKEN" ] || [ -z "$HF_REPO_ID" ]; then
            echo -e "${RED}错误：启用保活但未检测到HF_TOKEN或HF_REPO_ID环境变量${NC}"
            echo -e "${YELLOW}请在Hugging Face后台配置Secrets：HF_TOKEN和HF_REPO_ID${NC}"
            exit 1
        fi
    fi

    # 赋值保活变量（直接使用环境变量）
    KEEP_ALIVE_HF="$SILENT_KEEP_ALIVE"
    # 注意：HF_TOKEN和HF_REPO_ID从环境变量读取，不在这里定义

    # 修改配置文件
    sed -i "s/UUID = os.environ.get('UUID', '[^']*')/UUID = os.environ.get('UUID', '$SILENT_UUID')/" app.py
    echo -e "${GREEN}UUID 已设置为: $SILENT_UUID${NC}"

    sed -i "s/NAME = os.environ.get('NAME', '[^']*')/NAME = os.environ.get('NAME', '$SILENT_NAME')/" app.py
    echo -e "${GREEN}节点名称已设置为: $SILENT_NAME${NC}"

    sed -i "s/PORT = int(os.environ.get('SERVER_PORT') or os.environ.get('PORT') or [0-9]*)/PORT = int(os.environ.get('SERVER_PORT') or os.environ.get('PORT') or $SILENT_PORT)/" app.py
    echo -e "${GREEN}服务端口已设置为: $SILENT_PORT${NC}"

    sed -i "s/CFIP = os.environ.get('CFIP', '[^']*')/CFIP = os.environ.get('CFIP', '$SILENT_CFIP')/" app.py
    echo -e "${GREEN}优选IP已设置为: $SILENT_CFIP${NC}"

    sed -i "s/CFPORT = int(os.environ.get('CFPORT', '[^']*'))/CFPORT = int(os.environ.get('CFPORT', '$SILENT_CFPORT'))/" app.py
    echo -e "${GREEN}优选端口已设置为: $SILENT_CFPORT${NC}"

    sed -i "s/ARGO_PORT = int(os.environ.get('ARGO_PORT', '[^']*'))/ARGO_PORT = int(os.environ.get('ARGO_PORT', '$SILENT_ARGO_PORT'))/" app.py
    echo -e "${GREEN}Argo端口已设置为: $SILENT_ARGO_PORT${NC}"

    sed -i "s/SUB_PATH = os.environ.get('SUB_PATH', '[^']*')/SUB_PATH = os.environ.get('SUB_PATH', '$SILENT_SUB_PATH')/" app.py
    echo -e "${GREEN}订阅路径已设置为: $SILENT_SUB_PATH${NC}"

    echo -e "${GREEN}YouTube分流已自动配置${NC}"
    echo -e "${GREEN}静默配置完成！正在启动服务...${NC}"
}

generate_uuid() {
    if command -v uuidgen &> /dev/null; then
        uuidgen | tr '[:upper:]' '[:lower:]'
    elif command -v python3 &> /dev/null; then
        python3 -c "import uuid; print(str(uuid.uuid4()))"
    else
        hexdump -n 16 -e '4/4 "%08X" 1 "\n"' /dev/urandom | sed 's/\(..\)\(..\)\(..\)\(..\)\(..\)\(..\)\(..\)\(..\)\(..\)\(..\)\(..\)\(..\)\(..\)\(..\)\(..\)\(..\)/\1\2\3\4-\5\6-\7\8-\9\10-\11\12\13\14\15\16/' | tr '[:upper:]' '[:lower:]'
    fi
}

# 检查是否为静默模式
if [ "$1" = "-s" ]; then
    clear
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}    Python Xray Argo 静默部署模式   ${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo
else
    clear
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}    Python Xray Argo 一键部署脚本   ${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo
    echo -e "${BLUE}基于项目: ${YELLOW}https://github.com/eooce/python-xray-argo${NC}"
    echo -e "${BLUE}脚本仓库: ${YELLOW}https://github.com/byJoey/free-vps-py${NC}"
    echo
    echo -e "${GREEN}本脚本基于 eooce 大佬的 Python Xray Argo 项目开发${NC}"
    echo -e "${GREEN}提供极速、完整和静默三种配置模式，简化部署流程${NC}"
    echo -e "${GREEN}支持自动UUID生成、后台运行、节点信息输出${NC}"
    echo -e "${GREEN}默认集成YouTube分流优化，支持交互式查看节点信息${NC}"
    echo
    echo -e "${YELLOW}使用说明:${NC}"
    echo -e "${BLUE}  - 常规模式: 直接运行脚本选择操作${NC}"
    echo -e "${BLUE}  - 静默模式: 脚本后加 -s 参数（需预先配置脚本内参数）${NC}"
    echo -e "${BLUE}  - 查看节点: 脚本后加 -v 参数${NC}"
    echo
fi

# 如果是静默模式，直接执行静默逻辑
if [ "$1" = "-s" ]; then
    silent_mode
else
    # 非静默模式显示操作菜单
    echo -e "${YELLOW}请选择操作:${NC}"
    echo -e "${BLUE}1) 极速模式 - 只修改UUID并启动${NC}"
    echo -e "${BLUE}2) 完整模式 - 详细配置所有选项${NC}"
    echo -e "${BLUE}3) 查看节点信息 - 显示已保存的节点信息${NC}"
    echo -e "${BLUE}4) 查看保活状态 - 检查Hugging Face API保活状态${NC}"
    echo
    read -p "请输入选择 (1/2/3/4): " MODE_CHOICE

    if [ "$MODE_CHOICE" = "3" ]; then
        if [ -f "$NODE_INFO_FILE" ]; then
            echo
            echo -e "${GREEN}========================================${NC}"
            echo -e "${GREEN}                      节点信息查看                      ${NC}"
            echo -e "${GREEN}========================================${NC}"
            echo
            cat "$NODE_INFO_FILE"
            echo
            echo -e "${YELLOW}提示: 如需重新部署，请重新运行脚本选择模式1或2${NC}"
        else
            echo
            echo -e "${RED}未找到节点信息文件${NC}"
            echo -e "${YELLOW}请先运行部署脚本生成节点信息${NC}"
            echo
            echo -e "${BLUE}是否现在开始部署? (y/n)${NC}"
            read -p "> " START_DEPLOY
            if [ "$START_DEPLOY" = "y" ] || [ "$START_DEPLOY" = "Y" ]; then
                echo -e "${YELLOW}请选择部署模式:${NC}"
                echo -e "${BLUE}1) 极速模式${NC}"
                echo -e "${BLUE}2) 完整模式${NC}"
                read -p "请输入选择 (1/2): " MODE_CHOICE
            else
                echo -e "${GREEN}退出脚本${NC}"
                exit 0
            fi
        fi
        
        if [ "$MODE_CHOICE" != "1" ] && [ "$MODE_CHOICE" != "2" ]; then
            echo -e "${GREEN}退出脚本${NC}"
            exit 0
        fi
    fi

    if [ "$MODE_CHOICE" = "4" ]; then
        echo
        echo -e "${GREEN}========================================${NC}"
        echo -e "${GREEN}               Hugging Face API 保活状态检查              ${NC}"
        echo -e "${GREEN}========================================${NC}"
        echo
        
        if [ -d "$PROJECT_DIR_NAME" ]; then
            cd "$PROJECT_DIR_NAME"
        fi

        KEEPALIVE_PID=$(pgrep -f "keep_alive_task.sh")

        if [ -n "$KEEPALIVE_PID" ]; then
            echo -e "服务状态: ${GREEN}运行中${NC}"
            echo -e "进程PID: ${BLUE}$KEEPALIVE_PID${NC}"
            if [ -f "keep_alive_task.sh" ]; then
                REPO_ID=$(grep 'huggingface.co/api/spaces/' keep_alive_task.sh | head -1 | sed -n 's|.*api/spaces/\([^"]*\).*|\1|p')
                echo -e "目标仓库: ${YELLOW}$REPO_ID (类型: Space)${NC}"
            fi

            echo -e "\n${YELLOW}--- 最近一次保活状态 ---${NC}"
            if [ -f "keep_alive_status.log" ]; then
               cat keep_alive_status.log
            else
               echo -e "${YELLOW}尚未生成状态日志，请稍等片刻(最多2分钟)后重试...${NC}"
            fi
        else
            echo -e "服务状态: ${RED}未运行${NC}"
            echo -e "${YELLOW}提示: 您可能尚未部署服务或未在部署时设置Hugging Face保活。${NC}"
        fi
        echo
        exit 0
    fi
fi

echo -e "${BLUE}检查并安装依赖...${NC}"
if ! command -v python3 &> /dev/null; then
    echo -e "${YELLOW}正在安装 Python3...${NC}"
    sudo apt-get update && sudo apt-get install -y python3 python3-pip
fi

if ! python3 -c "import requests" &> /dev/null; then
    echo -e "${YELLOW}正在安装 Python 依赖: requests...${NC}"
    pip3 install requests
fi

if [ ! -d "$PROJECT_DIR_NAME" ]; then
    echo -e "${BLUE}下载完整仓库...${NC}"
    if command -v git &> /dev/null; then
        git clone https://github.com/eooce/python-xray-argo.git "$PROJECT_DIR_NAME"
    else
        echo -e "${YELLOW}Git未安装，使用wget下载...${NC}"
        wget -q https://github.com/eooce/python-xray-argo/archive/refs/heads/main.zip -O python-xray-argo.zip
        if command -v unzip &> /dev/null; then
            unzip -q python-xray-argo.zip
            mv python-xray-argo-main "$PROJECT_DIR_NAME"
            rm python-xray-argo.zip
        else
            echo -e "${YELLOW}正在安装 unzip...${NC}"
            sudo apt-get install -y unzip
            unzip -q python-xray-argo.zip
            mv python-xray-argo-main "$PROJECT_DIR_NAME"
            rm python-xray-argo.zip
        fi
    fi
    
    if [ $? -ne 0 ] || [ ! -d "$PROJECT_DIR_NAME" ]; then
        echo -e "${RED}下载失败，请检查网络连接${NC}"
        exit 1
    fi
fi

cd "$PROJECT_DIR_NAME"

echo -e "${GREEN}依赖安装完成！${NC}"
echo

if [ ! -f "app.py" ]; then
    echo -e "${RED}未找到app.py文件！${NC}"
    exit 1
fi

cp app.py app.py.backup
echo -e "${YELLOW}已备份原始文件为 app.py.backup${NC}"

# 初始化保活变量（非静默模式，从环境变量读取）
if [ "$1" != "-s" ]; then
    KEEP_ALIVE_HF="false"
    # 非静默模式下，HF_TOKEN和HF_REPO_ID通过交互输入，而非环境变量
fi

# 定义保活配置函数（非静默模式使用）
configure_hf_keep_alive() {
    echo
    echo -e "${YELLOW}是否设置 Hugging Face API 自动保活? (y/n)${NC}"
    read -p "> " SETUP_KEEP_ALIVE
    if [ "$SETUP_KEEP_ALIVE" = "y" ] || [ "$SETUP_KEEP_ALIVE" = "Y" ]; then
        echo -e "${YELLOW}请输入您的 Hugging Face 访问令牌 (Token):${NC}"
        echo -e "${BLUE}（令牌用于API认证，输入时将不可见。请前往 https://huggingface.co/settings/tokens 获取）${NC}"
        read -sp "Token: " HF_TOKEN_INPUT
        echo
        if [ -z "$HF_TOKEN_INPUT" ]; then
            echo -e "${RED}错误：Token 不能为空。已取消保活设置。${NC}"
            return
        fi

        echo -e "${YELLOW}请输入要访问的 Hugging Face 仓库ID (模型或Space均可，例如: joeyhuangt/aaaa):${NC}"
        read -p "Repo ID: " HF_REPO_ID_INPUT
        if [ -z "$HF_REPO_ID_INPUT" ]; then
            echo -e "${RED}错误：仓库ID 不能为空。已取消保活设置。${NC}"
            return
        fi

        HF_TOKEN="$HF_TOKEN_INPUT"
        HF_REPO_ID="$HF_REPO_ID_INPUT