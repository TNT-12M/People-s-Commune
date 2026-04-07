// 聊天模块 - WebSocket实时通信

class ChatModule {
    constructor() {
        this.ws = null;
        this.currentRoom = null;
        this.reconnectTimer = null;
        this.messageHandlers = [];
    }

    // 连接WebSocket
    connect(userId) {
        console.log('开始连接WebSocket, userId:', userId);
        
        this.isManualDisconnect = false; // 重置手动断开标志
        
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;
        
        console.log('WebSocket URL:', wsUrl);
        
        this.ws = new WebSocket(wsUrl);
        this.userId = userId;

        this.ws.onopen = () => {
            console.log('✅ WebSocket连接成功');
            // 隐藏连接状态提示
            this.hideConnectionStatus();
            if (this.reconnectTimer) {
                clearTimeout(this.reconnectTimer);
                this.reconnectTimer = null;
            }
        };

        this.ws.onmessage = (event) => {
            try {
                console.log('收到WebSocket消息:', event.data.substring(0, 200));
                const message = JSON.parse(event.data);
                console.log('解析后的消息类型:', message.type);
                this.handleMessage(message);
            } catch (error) {
                console.error('解析消息失败:', error);
            }
        };

        this.ws.onclose = (event) => {
            console.log('❌ WebSocket连接关闭', event.code, event.reason);
            
            // 如果是因为用户不存在而关闭（code 4001）
            if (event.code === 4001) {
                console.warn('用户不存在，自动退出登录');
                alert('用户不存在，请重新登录');
                // 清除本地存储
                localStorage.removeItem('user');
                localStorage.removeItem('grade');
                // 刷新页面
                location.reload();
                return;
            }
            
            this.attemptReconnect();
        };

        this.ws.onerror = (error) => {
            console.error('❌ WebSocket错误:', error);
        };
    }

    // 断开连接
    disconnect() {
        this.isManualDisconnect = true; // 标记为手动断开
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        this.currentRoom = null;
    }

    // 尝试重连
    attemptReconnect() {
        // 如果是手动断开，不重连
        if (this.isManualDisconnect) {
            console.log('手动断开连接，不重连');
            return;
        }
        
        if (!this.reconnectTimer && this.userId) {
            console.log('⏳ 3秒后尝试重连...');
            
            // 显示连接状态提示
            this.showConnectionStatus();
            
            this.reconnectAttempts = (this.reconnectAttempts || 0) + 1;
            
            this.reconnectTimer = setTimeout(() => {
                console.log('正在重连WebSocket...');
                this.connect(this.userId);
                
                // 如果重试次数超过5次，自动刷新页面
                if (this.reconnectAttempts >= 5) {
                    console.warn('重连失败次数过多，即将刷新页面...');
                    setTimeout(() => {
                        location.reload();
                    }, 2000);
                }
            }, 3000);  // 减少到3秒
        }
    }
    
    // 显示连接状态提示
    showConnectionStatus() {
        const statusEl = document.getElementById('connectionStatus');
        if (statusEl) {
            statusEl.style.display = 'flex';
        }
    }
    
    // 隐藏连接状态提示
    hideConnectionStatus() {
        const statusEl = document.getElementById('connectionStatus');
        if (statusEl) {
            statusEl.style.display = 'none';
        }
        // 重置重连计数
        this.reconnectAttempts = 0;
    }

    // 处理接收到的消息
    handleMessage(message) {
        console.log('收到消息:', message);
        
        switch (message.type) {
            case 'room_joined':
                console.log('已加入房间:', message.data);
                break;
            case 'new_message':
                this.notifyMessageHandlers(message.data);
                break;
            case 'online_count':
                this.updateOnlineCount(message.data);
                break;
            case 'user_not_found':
                console.warn('用户不存在，需要重新登录');
                alert(message.data.message || '用户不存在，请重新登录');
                // 清除本地存储并跳转到登录页
                localStorage.removeItem('user');
                localStorage.removeItem('grade');
                location.reload();
                break;
            default:
                console.log('未知消息类型:', message.type);
        }
    }

    // 更新在线人数显示
    updateOnlineCount(data) {
        const { count, roomKey, level, grade, subject } = data;
        
        // 更新顶部在线人数显示
        const onlineCountEl = document.getElementById('onlineCount');
        if (onlineCountEl) {
            onlineCountEl.textContent = count;
        }
        
        // 更新侧边栏中对应学科的状态点
        if (subject) {
            // 查找对应的学科项（现在只根据学科名称匹配）
            const subjectItems = document.querySelectorAll('.subject-item');
            subjectItems.forEach(item => {
                const itemSubject = item.dataset.subject;
                
                if (itemSubject === subject) {
                    const statusDot = item.querySelector('.status-dot');
                    if (statusDot) {
                        // 更新状态点颜色
                        if (count > 0) {
                            statusDot.className = 'status-dot online';
                            statusDot.title = `${count}人在线`;
                        } else {
                            statusDot.className = 'status-dot offline';
                            statusDot.title = '0人在线';
                        }
                    }
                }
            });
        }
    }

    // 加入房间
    joinRoom(grade, subject, level) {
        // 确保subject是字符串（可能是对象）
        const subjectName = typeof subject === 'object' ? subject.name : subject;
        
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            console.warn('WebSocket未连接，等待连接后加入房间');
            // 等待连接后再加入房间
            const checkConnection = setInterval(() => {
                if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                    clearInterval(checkConnection);
                    this.joinRoom(grade, subjectName, level);
                }
            }, 100);
            return;
        }

        // 新房间Key格式：level_subject（打通年级屏障）
        const roomKey = `${level}_${subjectName}`;
        
        // 如果已经在同一个房间，不需要重复加入
        if (this.currentRoom === roomKey) {
            return;
        }

        this.currentRoom = roomKey;

        this.ws.send(JSON.stringify({
            type: 'join_room',
            data: {
                grade: grade,
                subject: subjectName,
                level: level,
                userId: this.userId
            }
        }));

        console.log('请求加入房间:', roomKey);
    }

    // 离开房间
    leaveRoom() {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            return;
        }

        this.ws.send(JSON.stringify({
            type: 'leave_room'
        }));

        this.currentRoom = null;
        console.log('离开房间');
    }

    // 发送消息
    sendMessage(grade, subject, content) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            console.warn('WebSocket未连接，无法发送消息');
            alert('连接中，请稍后再试');
            return false;
        }

        if (!content || content.trim() === '') {
            return false;
        }

        this.ws.send(JSON.stringify({
            type: 'chat_message',
            data: {
                grade: grade,
                subject: subject,
                content: content.trim(),
                userId: this.userId
            }
        }));

        return true;
    }

    // 发送消息（支持引用）
    sendMessageData(messageData) {
        console.log('chatModule.sendMessageData被调用');
        console.log('WebSocket状态:', this.ws ? this.ws.readyState : 'null');
        console.log('WebSocket.OPEN常量:', WebSocket.OPEN);
        
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            console.warn('WebSocket未连接，无法发送消息');
            alert('连接中，请稍后再试');
            return false;
        }

        if (!messageData.content || messageData.content.trim() === '') {
            return false;
        }

        const sendData = {
            type: 'chat_message',
            data: {
                grade: messageData.grade,
                subject: typeof messageData.subject === 'object' ? messageData.subject.name : messageData.subject,
                level: messageData.level || '',
                content: messageData.content.trim(),
                userId: this.userId
            }
        };

        // 如果有引用，添加引用信息
        if (messageData.quoteMessage) {
            sendData.data.quoteMessage = messageData.quoteMessage;
        }
        
        // 如果有图片，添加图片信息
        if (messageData.imagePath) {
            sendData.data.imagePath = messageData.imagePath;
            sendData.data.filename = messageData.filename;
            sendData.data.extension = messageData.extension;
            sendData.data.hasIcon = messageData.hasIcon;
        }
        
        // 如果有文件，添加文件信息
        if (messageData.filePath) {
            sendData.data.filePath = messageData.filePath;
            sendData.data.filename = messageData.filename;
            sendData.data.fileType = messageData.fileType;
            sendData.data.extension = messageData.extension;
            sendData.data.hasIcon = messageData.hasIcon;
        }

        console.log('准备发送的WebSocket消息:', JSON.stringify(sendData).substring(0, 200));
        this.ws.send(JSON.stringify(sendData));
        console.log('消息已通过WebSocket发送');

        return true;
    }

    // 注册消息处理器
    onMessage(handler) {
        this.messageHandlers.push(handler);
    }

    // 通知所有消息处理器
    notifyMessageHandlers(message) {
        this.messageHandlers.forEach(handler => {
            try {
                handler(message);
            } catch (error) {
                console.error('消息处理器错误:', error);
            }
        });
    }

    // 获取连接状态
    isConnected() {
        return this.ws && this.ws.readyState === WebSocket.OPEN;
    }
}

// 加载历史消息
async function loadMessages(grade, subject, limit = 50, offset = 0) {
    // 获取当前学制
    const level = localStorage.getItem('currentLevel') || '';
    
    console.log('API请求: /api/messages/', level, grade, '/', subject, 'limit:', limit, 'offset:', offset);
    try {
        const url = `/api/messages/${encodeURIComponent(level)}/${encodeURIComponent(grade)}/${encodeURIComponent(subject)}?limit=${limit}&offset=${offset}`;
        console.log('完整URL:', url);
        
        const response = await fetch(url);
        console.log('API响应状态:', response.status);
        
        const data = await response.json();
        console.log('API响应数据:', data);
        
        if (data.success) {
            console.log('获取到', data.messages.length, '条消息');
            return data.messages;
        }
        console.error('API返回失败:', data);
        return [];
    } catch (error) {
        console.error('加载消息失败:', error);
        return [];
    }
}

// 格式化时间 - 显示相对时间
function formatTime(dateString) {
    if (!dateString) {
        return '未知时间';
    }
    
    // 尝试解析日期，支持多种格式
    let date;
    if (typeof dateString === 'string') {
        // 如果是SQLite格式 "YYYY-MM-DD HH:mm:ss"，转换为ISO格式
        if (dateString.includes(' ') && !dateString.includes('T')) {
            dateString = dateString.replace(' ', 'T');
        }
        date = new Date(dateString);
    } else {
        date = new Date(dateString);
    }
    
    // 检查日期是否有效
    if (isNaN(date.getTime())) {
        console.error('无效的日期格式:', dateString);
        return '时间错误';
    }
    
    return getRelativeTime(date);
}

// 获取相对时间描述
function getRelativeTime(date) {
    const now = new Date();
    const diff = now - date;
    
    // 小于10秒
    if (diff < 10000) {
        return '刚刚';
    }
    
    // 小于1分钟 - 显示具体秒数
    if (diff < 60000) {
        const seconds = Math.floor(diff / 1000);
        return `${seconds}秒前`;
    }
    
    // 小于1小时 - 显示分钟
    if (diff < 3600000) {
        const minutes = Math.floor(diff / 60000);
        return `${minutes}分钟前`;
    }
    
    // 小于24小时 - 显示小时
    if (diff < 86400000) {
        const hours = Math.floor(diff / 3600000);
        return `${hours}小时前`;
    }
    
    // 小于7天 - 显示天数
    if (diff < 604800000) {
        const days = Math.floor(diff / 86400000);
        return `${days}天前`;
    }
    
    // 其他情况显示具体日期
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    
    // 如果是今年，不显示年份
    if (year === now.getFullYear()) {
        return `${month}-${day} ${hours}:${minutes}`;
    }
    
    return `${year}-${month}-${day} ${hours}:${minutes}`;
}

// 启动实时更新时间定时器
let timeUpdateInterval = null;

function startTimeUpdate() {
    if (timeUpdateInterval) {
        clearInterval(timeUpdateInterval);
    }
    
    // 每5秒更新一次所有消息的时间显示
    timeUpdateInterval = setInterval(() => {
        const timeElements = document.querySelectorAll('.message .time');
        timeElements.forEach(el => {
            const originalTime = el.dataset.originalTime;
            if (originalTime) {
                el.textContent = getRelativeTime(new Date(originalTime));
            }
        });
    }, 5000); // 每5秒更新一次
}

// 停止时间更新
function stopTimeUpdate() {
    if (timeUpdateInterval) {
        clearInterval(timeUpdateInterval);
        timeUpdateInterval = null;
    }
}

// HTML转义，防止XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 导出
const chatModule = new ChatModule();
window.chatModule = chatModule;
window.loadMessages = loadMessages;
window.formatTime = formatTime;
window.escapeHtml = escapeHtml;
window.startTimeUpdate = startTimeUpdate;
window.stopTimeUpdate = stopTimeUpdate;
