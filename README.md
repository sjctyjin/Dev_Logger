# 開發日誌查看器部署與建置指南

本指南協助您從零開始在新電腦上部署完整的「ChatGPT 對話日誌紀錄與查看系統」，包含後端伺服器、資料庫、前端網頁查看工具與 Tampermonkey 擴充功能整合。

---

## 🧰 環境準備

### ✅ 安裝 Node.js

1. 前往 https://nodejs.org/ 下載 LTS 版本
2. 安裝後確認版本：

```bash
node -v
npm -v
```

### ✅ 安裝 SQL Server（可選）

- 安裝 SQL Server Express 或使用現有 SQL 資料庫
- 建立開發日誌相關資料表（見下方）

---

## 📦 後端伺服器建置（資料記錄與 API）

### 1. 初始化專案資料夾

```bash
mkdir Dev_Logger
cd Dev_Logger
npm init -y
```

### 2. 安裝依賴套件

```bash
npm install express body-parser cors mssql 
```

### 3. 建立伺服器程式

- 建立 `server.js`，內容包含：
    - 接收 Tampermonkey 傳送的紀錄
    - 連接 MSSQL 資料庫寫入對話資料
    - 提供前端查詢 API `/api/conversations`, `/api/conversation/:id`, `/api/search`, `/api/projects` 等

### 4. 啟動伺服器

```bash
node server.js
```

> 預設在 http://localhost:3000 運行
> 

---

## 🗂️ 資料庫設計（MSSQL）

### 建立四張表：先在SSMS建立一個 DevLog 資料庫，然後新增查詢輸入以下內容

```sql
USE [DevLog]
GO
/****** Object:  Table [dbo].[CodeSnippets]    Script Date: 2025/4/24 上午 09:57:52 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[CodeSnippets](
	[SnippetID] [int] IDENTITY(1,1) NOT NULL,
	[ConversationID] [int] NULL,
	[Language] [nvarchar](50) NULL,
	[Code] [nvarchar](max) NULL,
	[CreatedDate] [datetime] NULL,
PRIMARY KEY CLUSTERED 
(
	[SnippetID] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
GO
/****** Object:  Table [dbo].[Conversations]    Script Date: 2025/4/24 上午 09:57:52 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[Conversations](
	[ConversationID] [int] IDENTITY(1,1) NOT NULL,
	[IsProcessed] [bit] NULL,
	[ProjectID] [int] NULL,
	[statusTag] [varchar](50) NULL,
	[UserQuery] [nvarchar](max) NOT NULL,
	[AIResponse] [nvarchar](max) NOT NULL,
	[CreatedDate] [datetime] NULL,
	[Category] [nvarchar](50) NULL,
	[Title] [nvarchar](max) NULL,
	[Summary] [nvarchar](max) NULL,
 CONSTRAINT [PK__Conversa__C050D897EB86B333] PRIMARY KEY CLUSTERED 
(
	[ConversationID] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
GO
/****** Object:  Table [dbo].[Projects]    Script Date: 2025/4/24 上午 09:57:52 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[Projects](
	[ProjectID] [int] IDENTITY(1,1) NOT NULL,
	[ProjectName] [nvarchar](100) NOT NULL,
	[Description] [nvarchar](500) NULL,
	[CreatedDate] [datetime] NULL,
PRIMARY KEY CLUSTERED 
(
	[ProjectID] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [dbo].[Reports]    Script Date: 2025/4/24 上午 09:57:52 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[Reports](
	[ReportID] [int] IDENTITY(1,1) NOT NULL,
	[ProjectID] [int] NULL,
	[ReportType] [nvarchar](20) NULL,
	[StartDate] [date] NULL,
	[EndDate] [date] NULL,
	[ReportContent] [nvarchar](max) NULL,
	[CreatedDate] [datetime] NULL,
PRIMARY KEY CLUSTERED 
(
	[ReportID] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
GO
ALTER TABLE [dbo].[CodeSnippets] ADD  DEFAULT (getdate()) FOR [CreatedDate]
GO
ALTER TABLE [dbo].[Conversations] ADD  CONSTRAINT [DF__Conversat__IsPro__29572725]  DEFAULT ((0)) FOR [IsProcessed]
GO
ALTER TABLE [dbo].[Conversations] ADD  CONSTRAINT [DF__Conversat__Creat__286302EC]  DEFAULT (getdate()) FOR [CreatedDate]
GO
ALTER TABLE [dbo].[Projects] ADD  DEFAULT (getdate()) FOR [CreatedDate]
GO
ALTER TABLE [dbo].[Reports] ADD  DEFAULT (getdate()) FOR [CreatedDate]
GO
ALTER TABLE [dbo].[CodeSnippets]  WITH CHECK ADD  CONSTRAINT [FK__CodeSnipp__Conve__2C3393D0] FOREIGN KEY([ConversationID])
REFERENCES [dbo].[Conversations] ([ConversationID])
GO
ALTER TABLE [dbo].[CodeSnippets] CHECK CONSTRAINT [FK__CodeSnipp__Conve__2C3393D0]
GO
ALTER TABLE [dbo].[Conversations]  WITH CHECK ADD  CONSTRAINT [FK__Conversat__Proje__276EDEB3] FOREIGN KEY([ProjectID])
REFERENCES [dbo].[Projects] ([ProjectID])
GO
ALTER TABLE [dbo].[Conversations] CHECK CONSTRAINT [FK__Conversat__Proje__276EDEB3]
GO
ALTER TABLE [dbo].[Reports]  WITH CHECK ADD FOREIGN KEY([ProjectID])
REFERENCES [dbo].[Projects] ([ProjectID])
GO

```

---

## 🖥️ 前端介面建置（查看紀錄）

### 1. 建立新資料夾與初始化

```bash
mkdir dev-logger-viewer
cd dev-logger-viewer
npm init -y
```

### 2. 安裝套件

```bash
npm install express cors mssql
```

### 3. 建立後端服務 `server.js`

- 建立 API `/api/conversations/:projectId`、`/api/conversation/:id`、`/api/search`，從資料庫撈資料回傳給前端

### 4. 加入靜態前端服務支援

```
const path = require('path');
app.use(express.static(path.join(__dirname, 'public')));
```

### 5. 建立前端畫面

```bash
mkdir public
```

- 將您製作的 `index.html` 放進 `public/` 資料夾
- 包含：
    - 專案清單
    - 搜索（關鍵字、類別、時間）
    - 對話詳情區（使用者問題、AI 回答、代碼區段、Markdown支援）

### 6. 啟動伺服器

```bash
node server.js

```

> 預設在 http://localhost:3001 提供前端介面
> 

### 7. 使用說明

- 瀏覽專案：左側專案清單 → 點擊專案 → 載入對應對話紀錄
- 搜索對話：可依照 **關鍵字、類別、時間範圍** 搜尋過往紀錄
- 檢視詳情：右側載入完整問答紀錄（段落、格式化內容）

---

## 🧩 ChatGPT 對話擷取（Tampermonkey）

### 1. 安裝 Tampermonkey 擴充套件

- Chrome / Edge 使用者請至 https://www.tampermonkey.net/

### 2. 匯入腳本

- 新增一個腳本 → 貼上您編寫的 `ChatGPT 開發日誌擷取腳本`
- 功能包括：
    - 偵測 ChatGPT 頁面是否包含 `$log`, `$save`, `$完成`
    - 抓取整段使用者與 AI 對話
    - 自動送出 POST 至 `/api/log-conversation`

---

## ✅ 常見重建流程清單

| 項目 | 指令 / 動作 |
| --- | --- |
| 安裝 Node.js | 安裝官網版本 |
| 初始化資料夾 | `npm init -y` |
| 安裝後端依賴 | `npm install express mssql cors` |
| 建立資料表 | 使用 SQL 指令建表 |
| 啟動伺服器 | `node server.js` |
| 放置 `index.html` | 到 `public/` 資料夾內 |
| 使用 Tampermonkey 擷取 | 安裝擴充 + 貼腳本 |

---

這份指南可在每次換新電腦或還原環境時快速參考部署流程。
