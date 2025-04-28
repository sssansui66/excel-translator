const express = require('express');
const multer = require('multer');
const cors = require('cors');
const axios = require('axios');
const XLSX = require('xlsx');
const path = require('path');

const app = express();
const port = 3001;

// API配置
const DEEPSEEK_API_KEY = 'sk-ab63461916ff4c86b99890b853cda6eb';
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';

// 启用CORS
app.use(cors());

// 配置静态文件服务
app.use(express.static(path.join(__dirname, 'public')));

// 配置文件上传（内存存储，适配Vercel）
const upload = multer({ storage: multer.memoryStorage() });

// 根路由处理
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 处理文件上传和翻译（全部内存流处理）
app.post('/translate', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: '没有上传文件' });
        }

        // 读取Excel文件（用buffer）
        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(sheet);

        // 翻译数据
        const translatedData = [];
        for (const row of data) {
            if (row.title && row.content) {
                const translatedTitle = await translateText(row.title);
                const translatedContent = await translateText(row.content);
                translatedData.push({
                    title: row.title,
                    title_translated: translatedTitle,
                    content: row.content,
                    content_translated: translatedContent
                });
            }
        }

        // 创建新的Excel文件（内存流）
        const newWorkbook = XLSX.utils.book_new();
        const newSheet = XLSX.utils.json_to_sheet(translatedData);
        XLSX.utils.book_append_sheet(newWorkbook, newSheet, "翻译结果");
        const excelBuffer = XLSX.write(newWorkbook, { type: 'buffer', bookType: 'xlsx' });

        // 设置响应头并返回二进制流
        res.setHeader('Content-Disposition', 'attachment; filename=translated_result.xlsx');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(excelBuffer);
    } catch (error) {
        console.error('处理文件时出错:', error);
        res.status(500).json({ error: '处理文件时出错' });
    }
});

// 判断文本是否包含中文
function isChineseText(text) {
    const chineseRegex = /[\u4e00-\u9fa5]/;
    return chineseRegex.test(text);
}

// 判断文本是否主要是英文
function isEnglishText(text) {
    const cleanText = text.replace(/[^a-zA-Z\s]/g, '').trim();
    if (!cleanText) return false;
    const englishChars = cleanText.length;
    const totalChars = text.replace(/\s/g, '').length;
    return englishChars / totalChars > 0.5;
}

// 翻译函数
async function translateText(text) {
    try {
        if (!text.trim()) {
            return text;
        }
        if (isEnglishText(text)) {
            return text;
        }
        if (!isChineseText(text)) {
            return text;
        }
        const response = await axios.post(DEEPSEEK_API_URL, {
            model: "deepseek-chat",
            messages: [
                {
                    role: "user",
                    content: `请将以下中文文本翻译成英文，只返回翻译结果，不要加任何额外的解释：\n${text}`
                }
            ],
            temperature: 0.7,
            max_tokens: 2000
        }, {
            headers: {
                'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });
        if (response.data && response.data.choices && response.data.choices[0]) {
            return response.data.choices[0].message.content.trim();
        } else {
            throw new Error('翻译API返回格式错误');
        }
    } catch (error) {
        console.error('翻译API调用失败:', error.response ? error.response.data : error.message);
        throw error;
    }
}

// 创建必要的目录
const fs = require('fs');
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}
if (!fs.existsSync('public')) {
    fs.mkdirSync('public');
}

module.exports = app;

if (require.main === module) {
    app.listen(port, () => {
        console.log(`服务器运行在 http://localhost:${port}`);
    });
} 