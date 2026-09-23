# 28strings 网站存档

从腾讯云服务器备份同步的象棋、五子棋网站。保留原前端目录结构，后端位于 server/。

## 后端运行

安装 Node.js 和 MongoDB。在 server 目录执行 npm ci，设置 JWT_SECRET（自行生成的随机密钥）和 MONGODB_URI（数据库连接字符串），然后运行 node server.js。环境变量须由系统或进程管理器设置；程序不会自动加载 .env 文件。

前端由 Nginx 提供服务，/api/ 和 /socket.io/ 转发到后端 3000 端口，/uploads/ 指向 server/uploads/。实际部署需按服务器配置。

数据库、用户上传文件、服务器密钥和机器专属配置不入库。数据库原始备份另行保存，尚未验证恢复。此次提交仅同步存档，没有部署或修改线上网站。
