const multer = require('multer');
const XLSX = require('xlsx');
const axios = require('axios');

const upload = multer({ storage: multer.memoryStorage() });

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  upload.single('file')(req, res, async (err) => {
    if (err) {
      res.status(500).json({ error: '文件上传失败' });
      return;
    }
    try {
      const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
      const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';

      const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(sheet);

      const translatedData = [];
      for (const row of data) {
        if (row.title && row.content) {
          const translatedTitle = await translateText(row.title, DEEPSEEK_API_KEY, DEEPSEEK_API_URL);
          const translatedContent = await translateText(row.content, DEEPSEEK_API_KEY, DEEPSEEK_API_URL);
          translatedData.push({
            title: row.title,
            title_translated: translatedTitle,
            content: row.content,
            content_translated: translatedContent
          });
        }
      }

      const newWorkbook = XLSX.utils.book_new();
      const newSheet = XLSX.utils.json_to_sheet(translatedData);
      XLSX.utils.book_append_sheet(newWorkbook, newSheet, "翻译结果");
      const excelBuffer = XLSX.write(newWorkbook, { type: 'buffer', bookType: 'xlsx' });

      res.setHeader('Content-Disposition', 'attachment; filename=translated_result.xlsx');
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.send(excelBuffer);
    } catch (error) {
      res.status(500).json({ error: '处理文件时出错' });
    }
  });
};

// 辅助函数：判断是否为中文
function isChineseText(text) {
  const chineseRegex = /[\u4e00-\u9fa5]/;
  return chineseRegex.test(text);
}

// 辅助函数：判断是否为英文
function isEnglishText(text) {
  const cleanText = text.replace(/[^a-zA-Z\s]/g, '').trim();
  if (!cleanText) return false;
  const englishChars = cleanText.length;
  const totalChars = text.replace(/\s/g, '').length;
  return englishChars / totalChars > 0.5;
}

// 翻译函数
async function translateText(text, apiKey, apiUrl) {
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
    const response = await axios.post(apiUrl, {
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
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });
    if (response.data && response.data.choices && response.data.choices[0]) {
      return response.data.choices[0].message.content.trim();
    } else {
      throw new Error('翻译API返回格式错误');
    }
  } catch (error) {
    return '';
  }
} 
