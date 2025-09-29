
🔝皆可搭节点🟢
https://github.com/ic6999/one-node



原安装命令：

bash <(curl -l -s https://raw.githubusercontent.com/zzzhhh1/free-vps-py/refs/heads/main/test.sh)

修正后自动静默安装命令：

bash <(curl -l -s https://raw.githubusercontent.com/ic6999/free-vps-py/refs/heads/main/auto.sh --silent)

本地安装命令：

chmod +x auto.sh

./auto.sh --silent

节点信息：
./auto.sh -v


🔵保活 Worker（Cloudflare）代码：worker.js

核心功能：定时检测状态 + 自动唤醒 + 智能重启。

需添加环境变量HF_API_TOKEN（值=huggingface/HF_TOKEN)

智能重启需同步修改HF/files根目录的相关文件：dockerfile、start_server.sh
