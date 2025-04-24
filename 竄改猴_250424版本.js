// ==UserScript==
// @name         ChatGPT開發日誌工具 - JSON解析版 (HTML保留)
// @namespace    http://tampermonkey.net/
// @version      0.2
// @description  監控ChatGPT對話並提取JSON分類結果，自動記錄開發日誌，保留HTML格式
// @author       您的名稱
// @match        https://chatgpt.com/*
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function() {
    'use strict';

    console.log('ChatGPT開發日誌工具 - JSON解析版 (HTML保留) 已載入');

    // 配置項
    const BACKEND_URL = 'http://localhost:3000/api/log-conversation';
    const TRIGGER_PHRASES = ['$log', '$記錄', '$save', '$完成'];
    const PROJECT_ID = 1; // 水果採摘機器人專案

    // 添加控制面板
    function addControlPanel() {
        console.log('正在添加控制面板...');

        // 檢查是否已經存在面板
        if (document.getElementById('chat-logger-panel')) {
            return;
        }

        const panel = document.createElement('div');
        panel.id = 'chat-logger-panel';
        panel.style.position = 'fixed';
        panel.style.top = '120px';
        panel.style.right = '20px';
        panel.style.zIndex = '9999';
        panel.style.background = '#4F4F4F';
        panel.style.padding = '10px';
        panel.style.borderRadius = '5px';
        panel.style.boxShadow = '0 0 10px rgba(0,0,0,0.2)';
        panel.style.color = 'white';
        panel.style.fontWeight = 'bold';

        const statusText = document.createElement('div');
        statusText.id = 'chat-logger-status';
        statusText.textContent = '開發日誌: 已就緒';
        panel.appendChild(statusText);

        // 狀態標籤
        const statusLabel = document.createElement('label');
        statusLabel.textContent = '狀態標記：';
        statusLabel.style.display = 'block';
        statusLabel.style.marginTop = '10px';
        statusLabel.style.fontWeight = 'normal';
        panel.appendChild(statusLabel);

        // 單選按鈕容器
        const statusOptions = [
            { label: '✅ 已解決', value: 'resolved' },
            { label: '🕓 待處理', value: 'pending' },
            { label: '📌 其他', value: 'other' }
        ];

        statusOptions.forEach(opt => {
            const wrapper = document.createElement('div');
            wrapper.style.margin = '2px 0';

            const radio = document.createElement('input');
            radio.type = 'radio';
            radio.name = 'status';
            radio.value = opt.value;
            if (opt.value === 'pending') radio.checked = true; // 預設選中「待處理」

            const label = document.createElement('label');
            label.textContent = opt.label;
            label.style.marginLeft = '4px';

            wrapper.appendChild(radio);
            wrapper.appendChild(label);
            panel.appendChild(wrapper);
        });

        const logButton = document.createElement('button');
        logButton.textContent = '記錄當前對話';
        logButton.style.marginTop = '10px';
        logButton.style.padding = '5px 10px';
        logButton.style.cursor = 'pointer';
        logButton.style.backgroundColor = '#9D9D9D';
        logButton.style.border = 'none';
        logButton.style.borderRadius = '3px';
        logButton.style.color = 'white';
        logButton.style.fontWeight = 'bold';
        logButton.onclick = captureAndSendConversation;
        panel.appendChild(logButton);

        document.body.appendChild(panel);
        console.log('控制面板已添加');
    }

    // 從提供的 HTML 元素中提取純 JSON
    function extractJsonFromElement(element) {
        try {
            // 首先嘗試獲取純文本內容
            let rawText = element.textContent || '';

            // 尋找 JSON 對象的開始和結束
            const startIndex = rawText.indexOf('{');
            const endIndex = rawText.lastIndexOf('}');

            if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
                const jsonCandidate = rawText.substring(startIndex, endIndex + 1);

                // 移除任何可能干擾 JSON 解析的字符
                const cleanedJson = jsonCandidate
                    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // 控制字符
                    .replace(/^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g, ''); // 首尾空白字符

                console.log('提取的 JSON 字符串:', cleanedJson);

                // 嘗試解析
                const parsed = JSON.parse(cleanedJson);

                // 驗證必要的字段
                if (parsed && parsed.category && parsed.title && parsed.summary) {
                    return parsed;
                }
            }
        } catch (e) {
            console.warn('JSON 提取失敗:', e.message);
        }
        return null;
    }

    // 捕獲當前對話和JSON分類
    function captureConversation() {
        console.log('嘗試捕獲對話...');
        let classification = null;

        try {
            // 使用 data 屬性來識別用戶和助手消息
            const userMessages = document.querySelectorAll('[data-message-author-role="user"]');
            const assistantMessages = document.querySelectorAll('[data-message-author-role="assistant"]');

            console.log(`找到 ${userMessages.length} 條用戶消息和 ${assistantMessages.length} 條助手消息`);

            // 確定哪個列表較長
            const maxLength = Math.max(userMessages.length, assistantMessages.length);

            // 準備帶有段落標記的用戶問題和AI回答
            let formattedUserQuery = '';
            let formattedAIResponse = '';

            // 創建一個數組來保存所有消息（用於尋找 JSON 分類）
            const allMessages = [];

            // 按照對話的順序處理消息
            for (let i = 0; i < maxLength; i++) {
                // 處理用戶消息
                if (i < userMessages.length) {
                    const msg = userMessages[i];
                    const markdownContent = msg.querySelector('.markdown, .prose');

                    // 修改：使用 innerHTML 而非 textContent
                    const content = markdownContent ? markdownContent.innerHTML : msg.innerHTML;
                    const textContent = markdownContent ? markdownContent.textContent : msg.textContent; // 仍保留純文本用於 JSON 檢測

                    if (content.trim()) {
                        // 添加到格式化字符串，包含段落標記
                        formattedUserQuery += `[對話段落:${i+1}]\n${content.trim()}\n\n`;

                        // 添加到所有消息數組 (使用純文本用於 JSON 檢測)
                        allMessages.push({
                            role: 'user',
                            content: textContent.trim(),
                            htmlContent: content.trim()
                        });
                    }
                }

                // 處理助手消息
                if (i < assistantMessages.length) {
                    const msg = assistantMessages[i];
                    const markdownContent = msg.querySelector('.markdown, .prose');

                    // 修改：使用 innerHTML 而非 textContent
                    const content = markdownContent ? markdownContent.innerHTML : msg.innerHTML;
                    const textContent = markdownContent ? markdownContent.textContent : msg.textContent; // 仍保留純文本用於 JSON 檢測

                    if (content.trim()) {
                        // 添加到格式化字符串，包含段落標記
                        formattedAIResponse += `[對話段落:${i+1}]\n${content.trim()}\n\n`;

                        // 添加到所有消息數組 (使用純文本用於 JSON 檢測)
                        allMessages.push({
                            role: 'assistant',
                            content: textContent.trim(),
                            htmlContent: content.trim()
                        });

                        // 嘗試不同的選擇器找出JSON代碼塊
                        // 1. 嘗試找 code 元素
                        const codeElements = msg.querySelectorAll('pre code');
                        for (const codeEl of codeElements) {
                            // 檢查是否可能包含 JSON
                            if (codeEl.textContent.includes('"category"') &&
                                codeEl.textContent.includes('"title"') &&
                                codeEl.textContent.includes('"summary"')) {
                                const jsonData = extractJsonFromElement(codeEl);
                                if (jsonData) {
                                    classification = jsonData;
                                    console.log('從 code 元素找到分類:', classification);
                                    break;
                                }
                            }
                        }

                        // 2. 如果還沒找到，嘗試所有 pre 元素
                        if (!classification) {
                            const preBlocks = msg.querySelectorAll('pre');
                            for (const preBlock of preBlocks) {
                                if (preBlock.textContent.includes('"category"') &&
                                    preBlock.textContent.includes('"title"') &&
                                    preBlock.textContent.includes('"summary"')) {
                                    const jsonData = extractJsonFromElement(preBlock);
                                    if (jsonData) {
                                        classification = jsonData;
                                        console.log('從 pre 元素找到分類:', classification);
                                        break;
                                    }
                                }
                            }
                        }

                        // 3. 進一步嘗試 div 元素
                        if (!classification) {
                            const divElements = msg.querySelectorAll('div');
                            for (const div of divElements) {
                                if (div.textContent.includes('"category"') &&
                                    div.textContent.includes('"title"') &&
                                    div.textContent.includes('"summary"')) {
                                    const jsonData = extractJsonFromElement(div);
                                    if (jsonData) {
                                        classification = jsonData;
                                        console.log('從 div 元素找到分類:', classification);
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }
            }

            console.log(`共捕獲 ${allMessages.length} 條消息`);

            // 如果仍然沒有找到分類，嘗試從整個對話內容中提取
            if (!classification) {
                console.log('嘗試從整個對話中提取 JSON...');
                // 獲取最後一條助手回應
                if (allMessages.length > 0) {
                    let lastAssistantResponse = '';
                    for (let i = allMessages.length - 1; i >= 0; i--) {
                        if (allMessages[i].role === 'assistant') {
                            lastAssistantResponse = allMessages[i].content;
                            break;
                        }
                    }

                    if (lastAssistantResponse &&
                        lastAssistantResponse.includes('"category"') &&
                        lastAssistantResponse.includes('"title"') &&
                        lastAssistantResponse.includes('"summary"')) {
                        // 尋找 JSON 對象
                        const startIndex = lastAssistantResponse.indexOf('{');
                        const endIndex = lastAssistantResponse.lastIndexOf('}');

                        if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
                            try {
                                const jsonText = lastAssistantResponse.substring(startIndex, endIndex + 1);
                                const jsonData = JSON.parse(jsonText);

                                if (jsonData.category && jsonData.title && jsonData.summary) {
                                    classification = jsonData;
                                    console.log('從文本內容找到分類:', classification);
                                }
                            } catch (e) {
                                console.warn('從文本提取 JSON 失敗:', e.message);
                            }
                        }
                    }
                }
            }

            return {
                userQuery: formattedUserQuery.trim(),
                aiResponse: formattedAIResponse.trim(),
                classification
            };
        } catch (error) {
            console.error('捕獲對話時出錯:', error);
            return {
                userQuery: '',
                aiResponse: '',
                classification: null
            };
        }
    }

    // 捕獲並發送對話到後端
    function captureAndSendConversation() {
        updateStatus('正在捕獲對話...');

        try {
            const { userQuery, aiResponse, classification } = captureConversation();

            if (!userQuery || !aiResponse) {
                updateStatus('錯誤: 未找到對話內容');
                return;
            }

            // 發送到後端
            updateStatus('正在發送到伺服器...');
            // 取得勾選的狀態值
            const selectedStatus = document.querySelector('input[name="status"]:checked');

            // 準備要發送的數據
            const requestData = {
                projectId: PROJECT_ID,
                userQuery: userQuery, // 已包含HTML和段落標記
                aiResponse: aiResponse, // 已包含HTML和段落標記
                timestamp: new Date().toISOString(),
                isHtmlContent: true // 標記這是包含HTML的內容
            };

            if (selectedStatus) {
                requestData.statusTag = selectedStatus.value;
            }

            // 如果有分類信息，添加到請求中
            if (classification) {
                requestData.category = classification.category;
                requestData.title = classification.title;
                requestData.summary = classification.summary;
                requestData.isProcessed = true;
            }

            GM_xmlhttpRequest({
                method: 'POST',
                url: BACKEND_URL,
                data: JSON.stringify(requestData),
                headers: {
                    'Content-Type': 'application/json'
                },
                onload: function(response) {
                    try {
                        const data = JSON.parse(response.responseText);
                        if (data.success) {
                            if (classification) {
                                updateStatus(`成功: 對話已記錄並分類為 ${classification.title} [${classification.category}]`);
                                updateStatus(`成功: 對話已記錄`);
                            } else {
                                updateStatus(`成功: ${data.message || '對話已記錄'}`);
                                updateStatus(`成功: 對話已記錄`);
                            }
                        } else {
                            updateStatus(`錯誤: ${data.message || '處理失敗'}`);
                        }
                    } catch (e) {
                        updateStatus('錯誤: 解析伺服器回應失敗');
                    }
                },
                onerror: function(error) {
                    updateStatus('錯誤: 無法連接到伺服器');
                    console.error('發送對話錯誤:', error);
                }
            });

        } catch (e) {
            updateStatus('錯誤: ' + e.message);
            console.error('捕獲對話錯誤:', e);
        }
    }

    // 更新狀態
    function updateStatus(message) {
        const statusElement = document.getElementById('chat-logger-status');
        if (statusElement) {
            statusElement.textContent = '開發日誌: ' + message;
        }
    }

    // 監聽用戶輸入，檢測觸發詞
    function setupTriggerListener() {
        console.log('正在設置觸發詞監聽...');

        // 尋找輸入區域
        function findInputArea() {
            const selectors = [
                'textarea',
                'form textarea',
                '[role="textbox"]',
                '.stretch textarea'
            ];

            for (const selector of selectors) {
                const element = document.querySelector(selector);
                if (element) {
                    console.log(`找到輸入區域: ${selector}`);
                    return element;
                }
            }

            return null;
        }

        // 監聽用戶輸入區域
        const inputArea = findInputArea();
        if (!inputArea) {
            console.log('未找到輸入區域，稍後重試');
            setTimeout(setupTriggerListener, 1000);
            return;
        }

        console.log('為輸入區域添加事件監聽器');
        inputArea.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                const text = this.value;

                // 檢查是否包含觸發詞
                const hasTrigger = TRIGGER_PHRASES.some(phrase =>
                    text.includes(phrase)
                );

                if (hasTrigger) {
                    console.log('檢測到觸發詞');

                    // 延遲執行以確保對話已更新和JSON已生成
                    setTimeout(captureAndSendConversation, 2000);
                }
            }
        });

        console.log('觸發詞監聽設置完成');
    }

    // 初始化
    function initialize() {
        console.log('ChatGPT開發日誌工具正在初始化...');

        if (document.readyState === 'complete') {
            runScript();
        } else {
            window.addEventListener('load', runScript);
        }
    }

    function runScript() {
        console.log('頁面已加載，開始初始化腳本');

        // 添加控制面板
        setTimeout(addControlPanel, 2000);

        // 設置觸發詞監聽
        setTimeout(setupTriggerListener, 3000);

        console.log('ChatGPT開發日誌工具初始化完成');
    }

    // 啟動
    initialize();
})();