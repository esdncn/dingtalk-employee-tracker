# 鄄城和美员工市场开发轨迹可视化平台

一个基于 Node.js + Express + Leaflet 的员工轨迹可视化系统，支持地图展示、轨迹回放、日历查看、数据导出等功能。

## 功能特性

- 📍 **地图轨迹可视化** - 在地图上展示员工打卡轨迹，支持颜色区分不同日期
- 📅 **月历视图** - 按月查看员工打卡记录，点击日期查看详细轨迹
- 📊 **打卡统计** - 实时统计本月打卡次数和天数
- 📥 **数据导出** - 一键导出轨迹数据为 CSV 文件
- 🔄 **自动更新** - 每小时自动从钉钉 API 拉取最新数据
- 🎯 **数据筛选** - 按月份筛选查看历史轨迹

## 技术栈

- **前端**: HTML5 + CSS3 + Vanilla JavaScript
- **地图**: Leaflet.js（开源地图库）
- **后端**: Node.js + Express
- **进程管理**: PM2
- **数据来源**: 钉钉考勤 API

## 系统要求

- Node.js: v14.0.0 或更高版本
- npm: 6.0.0 或更高版本
- PM2: 5.0.0 或更高版本
- 操作系统: Windows / Linux / macOS

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

编辑 `.env` 文件，填入钉钉应用信息：

```env
DINGTALK_APP_KEY=你的AppKey
DINGTALK_APP_SECRET=你的AppSecret
```

获取钉钉应用信息：
1. 登录[钉钉开发者平台](https://open-dev.dingtalk.com/)
2. 创建企业内部应用
3. 获取 AppKey 和 AppSecret
4. 申请权限：`qyapi_get_attendance_data`、`attendance/list`、`attendance/listRecord`

### 3. 配置员工映射

在 `.env` 文件中添加员工姓名到 UserId 的映射：

```env
USERID_MAP={"张三":"0123456789","李四":"987654321"}
```

### 4. 启动服务

```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### 5. 访问应用

打开浏览器访问：`http://localhost:5000`

## 目录结构

```
├── index.html              # 前端入口页面
├── style.css              # 样式文件
├── app.js                # 前端逻辑
├── server.js             # Express 服务器
├── fetch_dingtalk.js    # 钉钉 API 调用
├── package.json          # 项目依赖
├── ecosystem.config.js    # PM2 配置
├── .env                 # 环境变量（需自行配置）
├── data/                # 数据存储目录
│   └── index.json       # 数据索引
├── leaflet/            # Leaflet 地图库
└── logs/              # PM2 日志目录
```

## API 接口

| 接口 | 方法 | 说明 |
|------|------|------|
| `/` | GET | 主页 |
| `/trajectory_data.json` | GET | 获取轨迹数据（支持 `?month=YYYY-MM` 参数筛选月份）|
| `/data/monthly.json` | GET | 获取月度文件列表 |
| `/auto_update` | GET/POST | 手动触发数据更新 |
| `/update_status` | GET | 获取更新状态 |

## PM2 常用命令

```bash
# 启动服务
pm2 start ecosystem.config.js

# 查看状态
pm2 status

# 查看日志
pm2 logs dingtalk-tracker

# 重启服务
pm2 restart dingtalk-tracker

# 停止服务
pm2 stop dingtalk-tracker

# 保存配置
pm2 save
```

## 数据更新机制

- **自动更新**: 每小时第 0 分钟自动从钉钉 API 拉取最新数据
- **手动更新**: 访问 `/auto_update` 接口或通过钉钉机器人触发
- **数据存储**: 按月度分文件存储在 `data/` 目录

## 注意事项

1. **数据隐私**: 所有考勤数据仅用于轨迹展示，请妥善保管 `.env` 文件
2. **API 限制**: 钉钉 API 有调用频率限制，请勿频繁手动触发更新
3. **定时任务**: 系统会自动每小时更新一次，无需手动干预
4. **日志查看**: 如遇问题，可查看 `logs/` 目录下的 PM2 日志

## 故障排查

### 问题 1: 启动报错 `Cannot find module`
**解决**: 运行 `npm install` 安装依赖

### 问题 2: 数据更新失败
**解决**:
1. 检查 `.env` 文件配置是否正确
2. 查看日志：`pm2 logs dingtalk-tracker`
3. 确认钉钉 API 权限已开通

### 问题 3: 地图无法加载
**解决**:
1. 检查 `leaflet/` 目录是否存在
2. 检查网络连接
3. 打开浏览器控制台（F12）查看详细错误

### 问题 4: 端口 5000 被占用
**解决**: 修改 `server.js` 中的端口号或停止占用进程

## 版本历史

- **v3.6.0** (2026-03-24) - 代码清理、部署兼容性改进
- **v3.5.4** (2026-03-23) - 月份重置问题修复
- **v3.5.0** (2026-03-23) - 代码清理、功能精简

## 许可证

本项目仅供内部使用，请勿用于商业用途。

## 联系方式

如有问题，请联系系统管理员。
