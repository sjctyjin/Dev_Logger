// 使用 Express 建立一個 API 服務，用於獲取資料庫中的對話記錄
const express = require('express');
const cors = require('cors');
const sql = require('mssql');
const app = express();
const port = 3001; // 使用不同於主服務的埠號
const path = require('path');

// 資料庫配置
const dbConfig = {
  user: 'sa',
  password: 'pass',
  server: '192.168.3.24',
  database: 'DevLog',
  options: {
    trustServerCertificate: true
  }
};

// 中間件
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));


// 獲取所有專案
app.get('/api/projects', async (req, res) => {
  try {
    await sql.connect(dbConfig);
    const result = await sql.query`
      SELECT ProjectID, ProjectName, Description, CreatedDate
      FROM Projects
      ORDER BY ProjectName
    `;
    res.json(result.recordset);
  } catch (error) {
    console.error('獲取專案錯誤:', error);
    res.status(500).json({ error: error.message });
  } finally {
    sql.close();
  }
});

// 獲取指定專案的所有對話
app.get('/api/conversations/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;
    await sql.connect(dbConfig);
    const result = await sql.query`
      SELECT ConversationID, Title, Category, CreatedDate, Summary,StatusTag
      FROM Conversations
      WHERE ProjectID = ${projectId}
      ORDER BY CreatedDate DESC
    `;
    res.json(result.recordset);
  } catch (error) {
    console.error('獲取對話錯誤:', error);
    res.status(500).json({ error: error.message });
  } finally {
    sql.close();
  }
});

// 獲取單個對話詳情 - 修改版
app.get('/api/conversation/:conversationId', async (req, res) => {
  try {
    const { conversationId } = req.params;
    await sql.connect(dbConfig);
    
    // 獲取對話內容 - 使用 REPLACE 保留換行符並處理特殊標記
    const conversationResult = await sql.query`
      SELECT 
        ConversationID, 
        ProjectID, 
        REPLACE(UserQuery, CHAR(13) + CHAR(10), CHAR(10)) AS UserQuery,
        REPLACE(AIResponse, CHAR(13) + CHAR(10), CHAR(10)) AS AIResponse, 
        CreatedDate, 
        Category, 
        Title, 
        Summary, 
        IsProcessed,
        StatusTag 
      FROM Conversations
      WHERE ConversationID = ${conversationId}
    `;
    
    if (conversationResult.recordset.length === 0) {
      return res.status(404).json({ error: '找不到指定的對話記錄' });
    }
    
    // 獲取相關的代碼片段
    const snippetsResult = await sql.query`
      SELECT SnippetID, Language, Code, CreatedDate
      FROM CodeSnippets
      WHERE ConversationID = ${conversationId}
      ORDER BY CreatedDate
    `;
    
    // 組合結果
    const conversation = conversationResult.recordset[0];
    
    // 處理特殊標記，使正則表達式能夠正確匹配段落標記
    // 處理可能的 "複製編輯" 標記，避免干擾段落標記的解析
    if (conversation.UserQuery) {
      conversation.UserQuery = conversation.UserQuery
        .replace(/(\w+)複製編輯/g, '') // 移除類似 "bash複製編輯" 的標記
        .replace(/複製編輯/g, '');     // 移除單獨的 "複製編輯" 標記
    }
    
    if (conversation.AIResponse) {
      conversation.AIResponse = conversation.AIResponse
        .replace(/(\w+)複製編輯/g, '') // 移除類似 "bash複製編輯" 的標記
        .replace(/複製編輯/g, '');     // 移除單獨的 "複製編輯" 標記
    }
    
    conversation.snippets = snippetsResult.recordset;
    
    // 添加調試信息
    console.log('對話段落標記檢查 (UserQuery):', 
      (conversation.UserQuery.match(/\[對話段落:\d+\]/g) || []).length + ' 個段落標記');
    console.log('對話段落標記檢查 (AIResponse):', 
      (conversation.AIResponse.match(/\[對話段落:\d+\]/g) || []).length + ' 個段落標記');
    
    res.json(conversation);
  } catch (error) {
    console.error('獲取對話詳情錯誤:', error);
    res.status(500).json({ error: error.message });
  } finally {
    sql.close();
  }
});

// 修改搜索功能，處理特殊標記
app.get('/api/search', async (req, res) => {
  try {
    const { keyword, category, startDate, endDate } = req.query;
    
    await sql.connect(dbConfig);
    
    let query = `
      SELECT 
        c.ConversationID, 
        c.Title, 
        c.Category, 
        c.CreatedDate, 
        c.Summary, 
        c.StatusTag, 
        p.ProjectName
      FROM Conversations c
      JOIN Projects p ON c.ProjectID = p.ProjectID
      WHERE 1=1
    `;
    
    const params = [];
    
    if (keyword) {
      query += ` AND (
        c.UserQuery LIKE @keyword OR 
        c.AIResponse LIKE @keyword OR 
        c.Title LIKE @keyword OR 
        c.Summary LIKE @keyword
      )`;
      params.push({ name: 'keyword', value: `%${keyword}%` });
    }
    
    if (category) {
      query += ` AND c.Category = @category`;
      params.push({ name: 'category', value: category });
    }
    
    if (startDate) {
      query += ` AND c.CreatedDate >= @startDate`;
      params.push({ name: 'startDate', value: new Date(startDate) });
    }
    
    if (endDate) {
      query += ` AND c.CreatedDate <= @endDate`;
      params.push({ name: 'endDate', value: new Date(endDate) });
    }
    
    query += ` ORDER BY c.CreatedDate DESC`;
    
    const request = new sql.Request();
    
    // 添加所有參數
    params.forEach(param => {
      request.input(param.name, param.value);
    });
    
    const result = await request.query(query);
    res.json(result.recordset);
  } catch (error) {
    console.error('搜索對話錯誤:', error);
    res.status(500).json({ error: error.message });
  } finally {
    sql.close();
  }
});
// 獲取所有類別
app.get('/api/categories', async (req, res) => {
  try {
    await sql.connect(dbConfig);
    const result = await sql.query`
      SELECT DISTINCT Category
      FROM Conversations
      WHERE Category IS NOT NULL
      ORDER BY Category
    `;
    res.json(result.recordset.map(item => item.Category));
  } catch (error) {
    console.error('獲取類別錯誤:', error);
    res.status(500).json({ error: error.message });
  } finally {
    sql.close();
  }
});

// 啟動伺服器
// app.listen(port, () => {
//   console.log(`對話查看器 API 伺服器運行於 http://localhost:${port}`);
// });
app.listen(port, '0.0.0.0', () => {
  // 獲取本機IP地址顯示在日誌中
  const networkInterfaces = require('os').networkInterfaces();
  console.log(networkInterfaces);
  // 找到乙太網路2的介面
  const ethernetTwo = networkInterfaces['乙太網路 2'] || 
                      networkInterfaces['Ethernet 2'] || 
                      networkInterfaces['eth1']; // 可能的名稱變體
  
  let ip;
  
  // 如果找到乙太網路2的介面，則使用它的IPv4地址
  if (ethernetTwo) {
    const ipv4 = ethernetTwo.find(iface => iface.family === 'IPv4' && !iface.internal);
    if (ipv4) {
      ip = ipv4.address;
    }
  }
  
  // 如果乙太網路2未找到或沒有IPv4地址，則使用原先的備用方法
  if (!ip) {
    ip = Object.values(networkInterfaces)
      .flat()
      .filter(details => details.family === 'IPv4' && !details.internal)
      .map(details => details.address)[0];
  }
  
  console.log(`對話查看器 API 伺服器運行於:`);
  console.log(`- 本地訪問: http://localhost:${port}`);
  console.log(`- 區域網路訪問s: http://${ip}:${port}`);
});