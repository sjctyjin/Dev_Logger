// 使用Express創建一個簡單的API端點
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const sql = require('mssql');
const app = express();
const { OpenAI } = require('openai');

// 配置
const port = 3000;
const openai = new OpenAI({
  apiKey: None'
});

// 資料庫配置
const dbConfig = {
  user: 'sa',
  password: 'pass',
  server: '192.168.3.24',
  database: 'DevLog',
  options: {
    trustServerCertificate: true // 開發環境適用
  }
};

// 中間件
app.use(cors());
app.use(bodyParser.json({limit: '10mb'}));

// 檢查專案是否存在
async function checkProjectExists(projectName) {
  const request = new sql.Request();
  request.input('projectName', projectName);
  
  const result = await request.query(`
    SELECT COUNT(*) AS count 
    FROM Projects 
    WHERE ProjectName = @projectName
  `);
  
  return result.recordset[0].count > 0;
}

// 獲取專案 ID
async function getProjectIdByName(projectName) {
  const request = new sql.Request();
  request.input('projectName', projectName);
  
  const result = await request.query(`
    SELECT ProjectID 
    FROM Projects 
    WHERE ProjectName = @projectName
  `);
  
  if (result.recordset.length > 0) {
    return result.recordset[0].ProjectID;
  }
  return null;
}

// 創建新專案
async function createNewProject(projectName) {
  const request = new sql.Request();
  request.input('projectName', projectName);
  request.input('description', `${projectName} 專案 (自動創建)`);
  request.input('createdDate', new Date());
  
  const result = await request.query(`
    INSERT INTO Projects (ProjectName, Description, CreatedDate)
    OUTPUT INSERTED.ProjectID
    VALUES (@projectName, @description, @createdDate)
  `);
  
  return result.recordset[0].ProjectID;
}

// 處理代碼片段
async function processCodeSnippets(conversationId, aiResponse) {
  if (aiResponse.includes('```')) {
    const codeBlocks = aiResponse.split('```');
    for (let i = 1; i < codeBlocks.length; i += 2) {
      if (i < codeBlocks.length) {
        let code = codeBlocks[i];
        let language = '';
        
        // 提取語言
        if (code.includes('\n')) {
          const firstLine = code.split('\n')[0].trim();
          if (firstLine) {
            language = firstLine;
            code = code.substring(firstLine.length).trim();
          }
        }
        
        const codeRequest = new sql.Request();
        codeRequest.input('conversationId', conversationId);
        codeRequest.input('language', language);
        codeRequest.input('code', code);
        codeRequest.input('createdDate', new Date());
        
        await codeRequest.query(`
          INSERT INTO CodeSnippets (ConversationID, Language, Code, CreatedDate)
          VALUES (@conversationId, @language, @code, @createdDate)
        `);
      }
    }
  }
}

// API端點 - 接收對話
app.post('/api/log-conversation', async (req, res) => {
  let pool;
  try {
    // 取得請求參數
    const { 
      projectId, 
      userQuery, 
      aiResponse, 
      timestamp, 
      category, 
      title, 
      summary,
      statusTag
    } = req.body;
    
    if (!userQuery || !aiResponse) {
      return res.status(400).json({ success: false, message: '缺少必要參數' });
    }
    
    // 連接資料庫
    pool = await sql.connect(dbConfig);
    
    // 檢查分類是否存在，如果存在就使用，如果不存在就創建
    let actualProjectId = projectId || 1;  // 默認使用傳入的 projectId 或 1
    
    // 如果有分類信息，檢查是否需要創建新專案
    if (category) {
      const categoryExists = await checkProjectExists(category);
      
      if (!categoryExists) {
        // 創建新專案類別
        actualProjectId = await createNewProject(category);
        console.log(`創建了新專案類別: ${category}, ID: ${actualProjectId}`);
      } else {
        // 獲取已存在類別的 ID
        const existingId = await getProjectIdByName(category);
        if (existingId !== null) {
          actualProjectId = existingId;
          console.log(`使用已存在的專案類別: ${category}, ID: ${actualProjectId}`);
        }
      }
    }
    
    // 保存對話
    const request = new sql.Request();
	const now = new Date();
	
	const options = {
	  year: 'numeric',
	  month: '2-digit',
	  day: '2-digit',
	  hour: '2-digit',
	  minute: '2-digit',
	  second: '2-digit',
	  hour12: false, // ✅ 關閉 AM/PM，變 24 小時制
	  timeZone: 'Asia/Taipei' // ✅ 可加也可不加，讓顯示對齊
	};
	const formatted = now.toLocaleString('zh-TW', options);
	console.log(now);                     // 顯示你本地時間（含時區）
	console.log(now.toISOString());      // UTC 格式（通常會差 +8 小時 in Taiwan）
	console.log("時間 : " + formatted); 
    request.input('projectId', actualProjectId);
    request.input('userQuery', userQuery);
    request.input('aiResponse', aiResponse);
    request.input('createdDate',formatted);
    request.input('statusTag',statusTag);
    
    // 如果有分類信息，添加到查詢中
    if (category && title && summary) {
      request.input('category', category);
      request.input('title', title);
      request.input('summary', summary);
      
      const query = `
        INSERT INTO Conversations (ProjectID, UserQuery, AIResponse, CreatedDate, Category, Title, Summary, IsProcessed,statusTag)
        OUTPUT INSERTED.ConversationID
        VALUES (@projectId, @userQuery, @aiResponse, @createdDate, @category, @title, @summary, 1,@statusTag)
      `;
      
      const result = await request.query(query);
      const conversationId = result.recordset[0].ConversationID;
      
      // 處理代碼片段
      await processCodeSnippets(conversationId, aiResponse);
      
      return res.json({ 
        success: true, 
        message: `對話已記錄到專案 [${category}] 並分類為: ${title}`,
        data: { category, title, summary,statusTag },
        conversationId
      });
    } 
    
  } catch (error) {
    console.error('處理對話錯誤:', error);
    return res.status(500).json({ success: false, message: error.message });
  } finally {
    // 關閉SQL連接
    if (pool) {
      try {
        await pool.close();
      } catch (e) {
        console.error('關閉SQL連接錯誤:', e);
      }
    }
  }
});

// 啟動伺服器
app.listen(port, () => {
  console.log(`伺服器運行於 http://localhost:${port}`);
});