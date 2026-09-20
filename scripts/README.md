# 脚本

- `use-mobile-network.ps1`：生成 `apps/mobile/.env.local`，支持 USB ADB 与电脑热点/局域网两种学生端 API 地址。
- `adb-reverse.ps1`：建立 USB ADB 端口反向，支持 `-HostApiPort` 指向非默认后端端口。

后续在此放置数据库初始化、OpenAPI 生成、Demo 数据重置和发布检查脚本。脚本必须使用仓库根目录作为工作目录，并避免写入敏感信息。
