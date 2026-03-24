#!/usr/bin/env node
/**
 * 钉钉考勤数据自动拉取脚本 v3.1 (Node.js 版本)
 * 从钉钉 attendance/listRecord 接口获取含坐标的打卡详情
 * 数据按月度保存,每月一个文件: trajectory_YYYY_MM.json
 */

// 加载环境变量
require('dotenv').config();

const axios = require('axios');
const fs = require('fs');
const path = require('path');

// ============ 配置 ============
// 从环境变量读取 API 密钥（更安全）
const APP_KEY = process.env.DINGTALK_APP_KEY || "你的AppKey";
const APP_SECRET = process.env.DINGTALK_APP_SECRET || "你的AppSecret";

// 9名员工 userId 映射（示例，请根据实际情况修改）
const EMPLOYEES = {
    "张三": "示例UserId1",
    "李四":   "示例UserId2",
};

const TRAJECTORY_DIR = path.join(__dirname, "data");

// 获取月度数据文件名
function getMonthlyFilePath(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return path.join(TRAJECTORY_DIR, `trajectory_${year}_${month}.json`);
}

// 确保数据目录存在
function ensureDataDir() {
    if (!fs.existsSync(TRAJECTORY_DIR)) {
        fs.mkdirSync(TRAJECTORY_DIR, { recursive: true });
    }
}

// ============ 工具函数 ============

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function msToDateStr(ms) {
    const date = new Date(ms);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function msToDateTimeStr(ms) {
    const date = new Date(ms);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

// ============ API 函数 ============

async function getAccessToken() {
    console.log("  获取 AccessToken...");
    const url = `https://oapi.dingtalk.com/gettoken?appkey=${APP_KEY}&appsecret=${APP_SECRET}`;
    const resp = await axios.get(url, { timeout: 10000 });
    const data = resp.data;
    
    if (data.errcode === 0) {
        console.log(`  OK Token: ${data.access_token.substring(0, 20)}...`);
        return data.access_token;
    }
    throw new Error(`获取 AccessToken 失败: ${JSON.stringify(data)}`);
}

async function fetchRecords(accessToken, userIds, dateFrom, dateTo) {
    const url = `https://oapi.dingtalk.com/attendance/listRecord?access_token=${accessToken}`;
    const payload = {
        userIds: userIds,
        checkDateFrom: dateFrom,
        checkDateTo: dateTo,
        isI18n: false
    };
    
    try {
        const resp = await axios.post(url, payload, { timeout: 10000 });
        const data = resp.data;
        
        if (data.errcode === 0) {
            return data.recordresult || [];
        }
        console.log(`  ⚠ listRecord 错误: errcode=${data.errcode} msg=${data.errmsg}`);
        return [];
    } catch (error) {
        console.log(`  ⚠ 请求失败: ${error.message}`);
        return [];
    }
}

async function fetchAllRecords(accessToken, userIds, startDate, endDate) {
    const allRecords = [];
    let current = new Date(startDate);
    const end = new Date(endDate);
    
    while (current <= end) {
        const chunkEnd = new Date(current);
        chunkEnd.setDate(chunkEnd.getDate() + 6);
        if (chunkEnd > end) {
            chunkEnd.setTime(end.getTime());
        }
        
        const dateFrom = formatDateTime(current, "00:00:00");
        const dateTo = formatDateTime(chunkEnd, "23:59:59");
        
        console.log(`    拉取 ${dateFrom.substring(0, 10)} ~ ${dateTo.substring(0, 10)} ...`);
        const records = await fetchRecords(accessToken, userIds, dateFrom, dateTo);
        allRecords.push(...records);
        await sleep(300); // 避免触发频率限制
        
        current = new Date(chunkEnd);
        current.setDate(current.getDate() + 1);
    }
    
    return allRecords;
}

function formatDateTime(date, timeStr) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day} ${timeStr}`;
}

function buildTrajectory(records, nameMap) {
    const trajectory = {};
    
    for (const rec of records) {
        const userId = rec.userId || "";
        const name = nameMap[userId] || userId;
        
        // 坐标
        const lng = rec.userLongitude;
        const lat = rec.userLatitude;
        if (!lng || !lat || lng == 0 || lat == 0) {
            continue; // 没有坐标的记录跳过
        }
        
        // 时间
        const checkTimeMs = rec.userCheckTime || 0;
        const checkTimeStr = msToDateTimeStr(checkTimeMs);
        const dateStr = msToDateStr(checkTimeMs);
        
        // 地址
        const address = rec.userAddress || "";

        // 打卡备注（尝试多个可能的字段）
        // 钉钉API返回的字段：outsideRemark(外勤备注)、userRemark(打卡备注)、baseRemark(基础备注)
        // 优先级：outsideRemark > userRemark > baseRemark > remark
        let remark = rec.outsideRemark || rec.userRemark || rec.baseRemark || rec.remark || "";

        // 如果remark是OnDuty/OffDuty，说明是打卡类型，不是用户备注
        if (remark === "OnDuty" || remark === "OffDuty") {
            remark = ""; // 清空打卡类型，不显示
        }

        // 定位结果
        const locationResult = rec.locationResult || "";

        const entry = {
            time: checkTimeStr,
            longitude: lng,
            latitude: lat,
            address: address,
            remark: remark,
            locationResult: locationResult,
            source: "dingtalk_api"
        };
        
        if (!trajectory[name]) {
            trajectory[name] = {};
        }
        if (!trajectory[name][dateStr]) {
            trajectory[name][dateStr] = [];
        }
        trajectory[name][dateStr].push(entry);
    }
    
    // 每天内按时间排序
    for (const name in trajectory) {
        for (const date in trajectory[name]) {
            trajectory[name][date].sort((a, b) => a.time.localeCompare(b.time));
        }
    }
    
    return trajectory;
}

function mergeTrajectory(existing, newData) {
    const merged = JSON.parse(JSON.stringify(existing));
    for (const name in newData) {
        if (!merged[name]) {
            merged[name] = {};
        }
        for (const date in newData[name]) {
            merged[name][date] = newData[name][date];
        }
    }
    return merged;
}

// ============ 主流程 ============

async function main(startDateStr = null, endDateStr = null, mode = "merge") {
    console.log("=".repeat(50));
    console.log("钉钉考勤数据拉取工具 v3.1 (Node.js)");
    console.log("=".repeat(50));
    
    // 确保数据目录存在
    ensureDataDir();
    
    // 1. 确定日期范围
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    let endDt = endDateStr ? new Date(endDateStr) : today;
    let startDt = startDateStr ? new Date(startDateStr) : new Date(today);
    startDt.setDate(startDt.getDate() - 29);
    
    console.log(`\n[日期] 拉取范围: ${formatDate(startDt)} ~ ${formatDate(endDt)}`);
    
    // 2. 获取 token
    console.log("\n[1/5] 获取 AccessToken ...");
    const token = await getAccessToken();
    
    // 3. 拉取全员数据
    const userIds = Object.values(EMPLOYEES);
    const nameMap = {};
    for (const [name, id] of Object.entries(EMPLOYEES)) {
        nameMap[id] = name;
    }
    
    console.log(`\n[2/5] 拉取 ${Object.keys(EMPLOYEES).length} 名员工的打卡记录 ...`);
    const allRecords = await fetchAllRecords(token, userIds, startDt, endDt);
    console.log(`\n  共获取 ${allRecords.length} 条原始打卡记录`);
    
    // 4. 转换格式
    console.log("\n[3/5] 转换数据格式 ...");
    const newTrajectory = buildTrajectory(allRecords, nameMap);
    
    let totalPoints = 0;
    for (const name in newTrajectory) {
        for (const date in newTrajectory[name]) {
            totalPoints += newTrajectory[name][date].length;
        }
    }
    console.log(`  转换完成: ${Object.keys(newTrajectory).length} 名员工, ${totalPoints} 个有效坐标点`);
    
    const sortedNames = Object.keys(newTrajectory).sort();
    for (const name of sortedNames) {
        let total = 0;
        for (const date in newTrajectory[name]) {
            total += newTrajectory[name][date].length;
        }
        console.log(`    ${name}: ${Object.keys(newTrajectory[name]).length} 天, ${total} 条`);
    }
    
    // 5. 按月度保存数据
    console.log("\n[4/5] 按月度保存数据 ...");
    
    // 确定涉及的月份
    const months = new Set();
    for (const name in newTrajectory) {
        for (const date in newTrajectory[name]) {
            const [year, month] = date.split('-');
            months.add(`${year}-${month}`);
        }
    }
    
    const monthList = Array.from(months).sort();
    console.log(`  涉及 ${monthList.length} 个月份: ${monthList.join(', ')}`);
    
    // 为每个月创建或更新数据
    for (const monthStr of monthList) {
        const [year, month] = monthStr.split('-');
        const monthDate = new Date(parseInt(year), parseInt(month) - 1, 1);
        const monthlyFile = getMonthlyFilePath(monthDate);
        
        // 提取该月份的数据
        const monthData = {};
        for (const name in newTrajectory) {
            for (const date in newTrajectory[name]) {
                if (date.startsWith(monthStr)) {
                    if (!monthData[name]) {
                        monthData[name] = {};
                    }
                    monthData[name][date] = newTrajectory[name][date];
                }
            }
        }
        
        // 合并或写入
        if (mode === "merge" && fs.existsSync(monthlyFile)) {
            console.log(`  合并模式: data/${path.basename(monthlyFile)}`);
            const existing = JSON.parse(fs.readFileSync(monthlyFile, 'utf8'));
            const final = mergeTrajectory(existing, monthData);
            fs.writeFileSync(monthlyFile, JSON.stringify(final, null, 2), 'utf8');
            
            let totalAll = 0;
            for (const name in final) {
                for (const date in final[name]) {
                    totalAll += final[name][date].length;
                }
            }
            console.log(`    已保存: ${Object.keys(final).length} 名员工, ${totalAll} 个坐标点`);
        } else {
            console.log(`  替换模式: data/${path.basename(monthlyFile)}`);
            fs.writeFileSync(monthlyFile, JSON.stringify(monthData, null, 2), 'utf8');
            
            let totalAll = 0;
            for (const name in monthData) {
                for (const date in monthData[name]) {
                    totalAll += monthData[name][date].length;
                }
            }
            console.log(`    已保存: ${Object.keys(monthData).length} 名员工, ${totalAll} 个坐标点`);
        }
    }
    
    // 6. 生成汇总索引
    console.log("\n[5/5] 生成数据索引 ...");
    const indexFile = path.join(TRAJECTORY_DIR, "index.json");
    
    // 扫描所有月度文件
    const files = fs.readdirSync(TRAJECTORY_DIR)
        .filter(f => f.startsWith('trajectory_') && f.endsWith('.json'))
        .sort()
        .reverse(); // 最新的在前
    
    const indexData = {
        lastUpdate: new Date().toISOString(),
        files: files.map(f => {
            const match = f.match(/trajectory_(\d{4})_(\d{2})\.json/);
            if (match) {
                return {
                    file: f,
                    year: match[1],
                    month: match[2],
                    label: `${match[1]}年${match[2]}月`
                };
            }
            return null;
        }).filter(Boolean)
    };
    
    fs.writeFileSync(indexFile, JSON.stringify(indexData, null, 2), 'utf8');
    console.log(`  已生成索引: data/index.json`);
    console.log(`  共 ${indexData.files.length} 个月度文件`);
    
    console.log("\n完成!数据已按月度保存到 data/ 目录。");
    console.log("=".repeat(50));
    
    return newTrajectory;
}

function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// 命令行调用
if (require.main === module) {
    const args = process.argv.slice(2);
    const startDate = args[0] || null;
    const endDate = args[1] || null;
    const mode = args[2] || "merge";
    
    main(startDate, endDate, mode).catch(console.error);
}

module.exports = { main };
