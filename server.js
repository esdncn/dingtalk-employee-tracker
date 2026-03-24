/**
 * 员工轨迹地图 - Express 服务器 v3.2
 * 支持:
 * 1. 提供 Web 界面
 * 2. /auto_update 接口供钉钉机器人定时调用
 * 3. 每小时自动更新
 * 4. 月度数据存储（v3.1 新增）
 * 5. 月度筛选查看（v3.2 新增）
 */

// 加载环境变量
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const cron = require('node-cron');
const { main: fetchMain } = require('./fetch_dingtalk.js');

const app = express();
const PORT = process.env.PORT || 5000;
const PROJECT_DIR = __dirname;

// 允许跨域
app.use(cors());

// 更新状态
const updateStatus = {
    isUpdating: false,
    lastUpdate: null,
    message: '',
    success: null,
    recordCount: 0
};

/**
 * 执行数据更新任务
 */
async function runFetchTask() {
    try {
        updateStatus.message = '正在从钉钉拉取最新数据...';
        updateStatus.success = null;
        
        // 默认拉取最近30天的数据
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 30);
        
        const dateFrom = formatDate(startDate);
        const dateTo = formatDate(endDate);
        
        console.log(`\n[${new Date().toISOString()}] 开始更新数据: ${dateFrom} ~ ${dateTo}`);
        
        // 调用 fetch_dingtalk.js 的 main 函数
        const result = await fetchMain(dateFrom, dateTo, 'merge');
        
        // 计算记录数
        let recordCount = 0;
        for (const name in result) {
            for (const date in result[name]) {
                recordCount += result[name][date].length;
            }
        }
        
        updateStatus.success = true;
        updateStatus.message = `数据更新成功!获取 ${recordCount} 条打卡记录。更新时间: ${formatDateTime(new Date())}`;
        updateStatus.lastUpdate = new Date().toISOString();
        updateStatus.recordCount = recordCount;
        
        console.log(`[${new Date().toISOString()}] 数据更新完成: ${recordCount} 条记录`);
    } catch (error) {
        updateStatus.success = false;
        updateStatus.message = `数据更新失败: ${error.message}`;
        console.error(`[${new Date().toISOString()}] 更新失败:`, error);
    } finally {
        updateStatus.isUpdating = false;
    }
}

function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function formatDateTime(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * 路由: /auto_update - 自动更新接口
 * 供钉钉机器人或 cron 定时任务调用
 */
app.get('/auto_update', async (req, res) => {
    if (updateStatus.isUpdating) {
        return res.json({
            success: false,
            message: '数据正在更新中,请稍后再试...',
            status: 'running'
        });
    }
    
    updateStatus.isUpdating = true;
    updateStatus.message = '已启动数据更新任务...';
    
    // 立即返回,后台执行更新
    res.json({
        success: true,
        message: '数据更新任务已启动',
        status: 'started',
        tip: '请稍候几分钟,刷新地图页面查看最新数据'
    });
    
    // 异步执行更新
    runFetchTask();
});

// 也支持 POST 请求
app.post('/auto_update', async (req, res) => {
    // 逻辑同 GET
    if (updateStatus.isUpdating) {
        return res.json({
            success: false,
            message: '数据正在更新中,请稍后再试...',
            status: 'running'
        });
    }
    
    updateStatus.isUpdating = true;
    updateStatus.message = '已启动数据更新任务...';
    
    res.json({
        success: true,
        message: '数据更新任务已启动',
        status: 'started',
        tip: '请稍候几分钟,刷新地图页面查看最新数据'
    });
    
    runFetchTask();
});

/**
 * 路由: /update_status - 获取更新状态
 */
app.get('/update_status', (req, res) => {
    res.json(updateStatus);
});

/**
 * 路由: / - 主页
 */
app.get('/', (req, res) => {
    res.sendFile(path.join(PROJECT_DIR, 'index.html'));
});

/**
 * 路由: /trajectory_data.json - 提供合并后的月度数据
 * 支持查询参数 month (格式: YYYY-MM) 来筛选月份
 */
app.get('/trajectory_data.json', (req, res) => {
    const { month } = req.query;
    const dataDir = path.join(PROJECT_DIR, 'data');
    const indexPath = path.join(dataDir, 'index.json');

    if (!fs.existsSync(indexPath)) {
        return res.json({});
    }

    try {
        const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
        const mergedData = {};

        // 如果指定了月份，只加载该月份数据
        if (month) {
            const targetFile = index.files.find(f => `${f.year}-${f.month}` === month);
            if (targetFile) {
                const filePath = path.join(dataDir, targetFile.file);
                if (fs.existsSync(filePath)) {
                    const monthData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                    res.json(monthData);
                    return;
                }
            }
            res.json({});
            return;
        }

        // 没有指定月份，默认合并最近3个月
        const filesToLoad = index.files.slice(0, 3);

        for (const file of filesToLoad) {
            const filePath = path.join(dataDir, file.file);
            if (fs.existsSync(filePath)) {
                const monthData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                // 合并数据
                for (const name in monthData) {
                    if (!mergedData[name]) {
                        mergedData[name] = {};
                    }
                    for (const date in monthData[name]) {
                        mergedData[name][date] = monthData[name][date];
                    }
                }
            }
        }

        res.json(mergedData);
    } catch (error) {
        console.error('读取月度数据失败:', error);
        res.json({});
    }
});

/**
 * 路由: /data/monthly.json - 获取所有月度文件列表
 */
app.get('/data/monthly.json', (req, res) => {
    const indexPath = path.join(PROJECT_DIR, 'data', 'index.json');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.json({ files: [], lastUpdate: null });
    }
});

/**
 * 路由: /data/:filename - 提供单个月度数据文件
 */
app.get('/data/:filename', (req, res) => {
    const filename = req.params.filename;
    // 只允许访问 trajectory_ 开头的 JSON 文件
    if (!filename.startsWith('trajectory_') || !filename.endsWith('.json')) {
        return res.status(403).json({ error: 'Forbidden' });
    }

    const filePath = path.join(PROJECT_DIR, 'data', filename);
    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        res.status(404).json({ error: 'File not found' });
    }
});

/**
 * 静态文件服务 - 提供 maps 目录下的地图相关文件
 */
app.use('/maps', express.static(path.join(PROJECT_DIR, 'maps')));

/**
 * 静态文件服务 - 提供根目录下的 CSS、JS 和 leaflet 目录
 */
app.use(express.static(path.join(PROJECT_DIR, '.')));

// ============ 启动信息 ============
app.listen(PORT, '0.0.0.0', () => {
    console.log('='.repeat(60));
    console.log('员工轨迹地图 - 自动更新服务器 v3.2 (Node.js)');
    console.log('='.repeat(60));
    console.log(`工作目录: ${PROJECT_DIR}`);
    console.log(`服务器运行在: http://0.0.0.0:${PORT}`);
    console.log('');
    console.log('访问地址:');
    console.log(`  - 地图页面: http://localhost:${PORT}`);
    console.log('');
    console.log('API 接口:');
    console.log(`  - 自动更新: http://localhost:${PORT}/auto_update (GET/POST)`);
    console.log(`  - 更新状态: http://localhost:${PORT}/update_status (GET)`);
    console.log(`  - 月度列表: http://localhost:${PORT}/data/monthly.json`);
    console.log(`  - 轨迹数据: http://localhost:${PORT}/trajectory_data.json?month=YYYY-MM`);
    console.log('');
    console.log('定时任务:');
    console.log('  - 每小时自动更新一次');
    console.log('');
    console.log('钉钉机器人配置:');
    console.log(`  1. Webhook 地址: http://your-server:${PORT}/auto_update`);
    console.log('  2. 或使用服务器自带的每小时定时更新');
    console.log('='.repeat(60));
});

// ============ 定时任务:每小时更新一次 ============
// 每小时的第 0 分钟执行
cron.schedule('0 * * * *', () => {
    console.log(`\n[${new Date().toISOString()}] 定时任务触发 - 开始每小时自动更新`);
    if (!updateStatus.isUpdating) {
        updateStatus.isUpdating = true;
        runFetchTask();
    } else {
        console.log(`[${new Date().toISOString()}] 跳过 - 上次更新仍在进行中`);
    }
});

console.log('\n定时任务已配置:每小时自动更新一次\n');
