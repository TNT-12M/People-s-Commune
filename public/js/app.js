// 更新年级选择按钮文本
function updateGradeSelectButtonText(level, grade) {
    const btn = document.getElementById('btnGradeSelect');
    if (btn) {
        btn.textContent = `${level}${grade}`;
    }
}

// 主应用逻辑

class App {
    constructor() {
        this.currentGrade = null;
        this.currentSubject = null;
        this.grades = [];
        this.subjects = {};
        this.messagePage = 1; // 当前页码
        this.hasMoreMessages = true; // 是否还有更多消息
        this.isLoadingMessages = false; // 是否正在加载消息
        this.quotedMessage = null; // 当前引用的消息
    }

    // 初始化应用
    async init() {
        console.log('=== 应用初始化开始 ===');
        console.log('window.authModule:', window.authModule);
        console.log('window.chatModule:', window.chatModule);
        
        // 检查登录状态
        const isLoggedIn = await window.authModule.checkAuth();
        console.log('登录状态:', isLoggedIn);
        
        if (isLoggedIn) {
            const user = window.authModule.getCurrentUser();
            console.log('当前用户:', user);
            
            // 先连接WebSocket
            console.log('连接WebSocket');
            window.chatModule.connect(user.id);
            
            if (!user.grade) {
                console.log('显示年级选择器');
                window.authModule.showGradeSelector();
            } else {
                console.log('显示主容器');
                window.authModule.showMainContainer();
                // initSidebar已经在showMainContainer中调用
                
                // 更新年级选择按钮文本
                const currentLevel = localStorage.getItem('currentLevel') || '';
                if (currentLevel && user.grade) {
                    updateGradeSelectButtonText(currentLevel, user.grade);
                }
                
                // 检查是否有上次选择的房间
                const lastRoom = localStorage.getItem('lastRoom');
                if (lastRoom) {
                    try {
                        const { grade, subject, level } = JSON.parse(lastRoom);
                        console.log('恢复上次的房间:', level, grade, subject);
                        // 找到对应的学科项并触发点击
                        setTimeout(() => {
                            const subjectItem = document.querySelector(`.subject-item[data-subject="${subject}"]`);
                            if (subjectItem) {
                                // 先移除所有激活状态
                                document.querySelectorAll('.subject-item.active').forEach(el => {
                                    el.classList.remove('active');
                                });
                                // 添加激活状态
                                subjectItem.classList.add('active');
                                // 触发点击事件（加载消息）
                                subjectItem.click();
                            }
                        }, 500);
                    } catch (e) {
                        console.error('解析上次房间失败:', e);
                    }
                }
            }
        } else {
            console.log('显示登录模态框');
            window.authModule.showAuthModal();
        }

        // 绑定事件
        this.bindEvents();
        
        // 启动实时更新时间
        if (window.startTimeUpdate) {
            window.startTimeUpdate();
        }
        
        console.log('=== 应用初始化完成 ===');
    }

    // 绑定事件
    bindEvents() {
        // 消息输入框回车发送
        const messageInput = document.getElementById('messageInput');
        
        // 点击外部关闭学制菜单
        document.addEventListener('click', (e) => {
            const levelSelector = document.querySelector('.level-selector');
            const levelMenu = document.getElementById('levelMenu');
            const levelBtn = document.getElementById('btnLevelSelect');
            
            if (levelSelector && levelMenu && levelBtn) {
                if (!levelSelector.contains(e.target)) {
                    levelMenu.classList.remove('show');
                    levelBtn.classList.remove('active');
                }
            }
        });
        if (messageInput) {
            messageInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.sendMessage();
                }
            });
        }

        // 注册消息处理器
        window.chatModule.onMessage((message) => {
            this.handleNewMessage(message);
        });
        
        // 监听消息列表滚动，实现分页加载
        const messageList = document.getElementById('messageList');
        if (messageList) {
            messageList.addEventListener('scroll', () => {
                this.handleScroll(messageList);
            });
        }
    }
    
    // 处理滚动事件
    handleScroll(messageList) {
        // 如果正在加载或没有更多消息，不处理
        if (this.isLoadingMessages || !this.hasMoreMessages) {
            return;
        }
        
        // 当滚动到顶部附近时（距离顶部50px）
        if (messageList.scrollTop < 50) {
            console.log('加载更多历史消息...');
            this.messagePage++;
            this.loadAndRenderMessages(
                this.currentGrade, 
                this.currentSubject, 
                this.messagePage, 
                true  // 追加模式
            );
        }
        
        // 检查是否需要显示跳转底部按钮
        const isAtBottom = messageList.scrollHeight - messageList.scrollTop - messageList.clientHeight < 100;
        const scrollBtn = document.getElementById('scrollToBottomBtn');
        if (scrollBtn) {
            scrollBtn.style.display = isAtBottom ? 'none' : 'block';
        }
    }

    // 初始化侧边栏
    async initSidebar() {
        try {
            const response = await fetch('/api/grades');
            const data = await response.json();
            
            if (data.success) {
                this.grades = data.grades;
                this.renderSidebar();
            }
        } catch (error) {
            console.error('加载年级列表失败:', error);
        }
    }

    // 渲染侧边栏
    async renderSidebar() {
        const sidebar = document.getElementById('gradeSidebar');
        sidebar.innerHTML = '';

        // 获取当前选中的学制
        const currentLevel = localStorage.getItem('currentLevel') || '小学';
        
        console.log('当前学制:', currentLevel);

        // 创建闲聊室项（所有人都能看到）
        const chatRoomItem = document.createElement('div');
        chatRoomItem.className = 'subject-item';
        chatRoomItem.dataset.subject = '闲聊室';
        chatRoomItem.dataset.isChatRoom = 'true';
        
        const chatContentDiv = document.createElement('div');
        chatContentDiv.className = 'subject-content';
        
        const chatNameSpan = document.createElement('span');
        chatNameSpan.textContent = '💬 闲聊室';
        chatContentDiv.appendChild(chatNameSpan);
        
        const chatStatusDot = document.createElement('span');
        chatStatusDot.className = 'status-dot offline';
        chatStatusDot.title = '0人在线';
        chatContentDiv.appendChild(chatStatusDot);
        
        chatRoomItem.appendChild(chatContentDiv);
        chatRoomItem.onclick = () => this.selectChatRoom(chatRoomItem);
        sidebar.appendChild(chatRoomItem);
        
        // 添加分隔线
        const divider = document.createElement('div');
        divider.style.cssText = 'height: 1px; background: #e2e8f0; margin: 4px 8px;';
        sidebar.appendChild(divider);

        // 创建学科容器
        const subjectsContainer = document.createElement('div');
        subjectsContainer.className = 'subject-list show';
        subjectsContainer.id = 'subjects-container';

        sidebar.appendChild(subjectsContainer);

        // 加载该学制下的所有学科（去重）
        await this.loadAllSubjectsForLevel(currentLevel);
    }
    
    // 加载某学制下的所有学科（去重）
    async loadAllSubjectsForLevel(level) {
        const container = document.getElementById('subjects-container');
        if (!container) return;
        
        // 获取该学制下的所有年级
        const levelGrades = this.grades.filter(g => g.level === level);
        
        // 收集所有学科（去重）
        const subjectSet = new Set();
        for (const grade of levelGrades) {
            try {
                const response = await fetch(`/api/subjects/${grade.id}`);
                const data = await response.json();
                
                if (data.success) {
                    data.subjects.forEach(subj => {
                        subjectSet.add(subj.name);
                    });
                }
            } catch (error) {
                console.error(`加载${grade.name}学科失败:`, error);
            }
        }
        
        // 渲染学科列表
        const subjects = Array.from(subjectSet);
        subjects.forEach(subjectName => {
            const subjectItem = document.createElement('div');
            subjectItem.className = 'subject-item';
            
            const contentDiv = document.createElement('div');
            contentDiv.className = 'subject-content';
            
            const nameSpan = document.createElement('span');
            nameSpan.textContent = subjectName;
            contentDiv.appendChild(nameSpan);
            
            const statusDot = document.createElement('span');
            statusDot.className = 'status-dot offline';
            statusDot.title = '0人在线';
            contentDiv.appendChild(statusDot);
            
            subjectItem.appendChild(contentDiv);
            subjectItem.dataset.subject = subjectName;
            subjectItem.onclick = () => this.selectSubjectOnly(subjectName, subjectItem);
            container.appendChild(subjectItem);
        });
    }
    
    // 只选择学科（不改变年级）
    selectSubjectOnly(subjectName, element) {
        // 移除之前的激活状态
        document.querySelectorAll('.subject-item.active').forEach(el => {
            el.classList.remove('active');
        });
        
        // 设置新的激活状态
        element.classList.add('active');
        
        this.currentSubject = subjectName;
        
        // 获取当前用户信息
        const user = window.authModule.getCurrentUser();
        if (!user || !user.grade) {
            alert('请先选择年级');
            return;
        }
        
        const grade = user.grade;
        const level = localStorage.getItem('currentLevel') || '';
        
        // 设置currentGrade（重要！）
        this.currentGrade = grade;
        
        console.log('=== 选择学科 ===');
        console.log('level:', level, 'grade:', grade, 'subject:', subjectName);
        
        // 保存当前房间
        localStorage.setItem('lastRoom', JSON.stringify({ grade, subject: subjectName, level }));
        
        // 更新聊天标题 - 只显示学制和学科
        const titleText = `${level} - ${subjectName}`;
        document.getElementById('chatTitle').textContent = titleText;
        
        // 更新用户年级信息（显示在在线人数前面）
        const userGradeInfo = document.getElementById('userGradeInfo');
        if (userGradeInfo) {
            userGradeInfo.textContent = grade;
        }
        
        // 切换到聊天视图
        document.getElementById('welcomeView').style.display = 'none';
        document.getElementById('chatView').style.display = 'flex';
        
        // 加入房间
        window.chatModule.joinRoom(grade, subjectName, level);
        
        // 加载历史消息
        this.loadAndRenderMessages(grade, subjectName);
    }
    
    // 选择闲聊室（不受学制年级限制）
    selectChatRoom(element) {
        // 移除之前的激活状态
        document.querySelectorAll('.subject-item.active').forEach(el => {
            el.classList.remove('active');
        });
        
        // 设置新的激活状态
        element.classList.add('active');
        
        this.currentSubject = '闲聊室';
        
        // 获取当前用户信息
        const user = window.authModule.getCurrentUser();
        if (!user) {
            alert('请先登录');
            return;
        }
        
        // 闲聊室使用特殊的grade和level
        const grade = '闲聊室';
        const level = '闲聊室';
        
        // 设置currentGrade
        this.currentGrade = grade;
        
        console.log('=== 选择闲聊室 ===');
        console.log('level:', level, 'grade:', grade, 'subject:', this.currentSubject);
        
        // 保存当前房间
        localStorage.setItem('lastRoom', JSON.stringify({ grade, subject: this.currentSubject, level }));
        
        // 更新聊天标题
        document.getElementById('chatTitle').textContent = '💬 闲聊室';
        
        // 隐藏用户年级信息（闲聊室不需要显示年级）
        const userGradeInfo = document.getElementById('userGradeInfo');
        if (userGradeInfo) {
            userGradeInfo.textContent = '';
        }
        
        // 切换到聊天视图
        document.getElementById('welcomeView').style.display = 'none';
        document.getElementById('chatView').style.display = 'flex';
        
        // 加入闲聊室房间
        window.chatModule.joinRoom(grade, this.currentSubject, level);
        
        // 加载闲聊室历史消息
        this.loadAndRenderMessages(grade, this.currentSubject);
    }

    // 切换阶段展开/收起
    toggleLevel(titleElement) {
        const subjectList = titleElement.nextElementSibling;
        titleElement.classList.toggle('expanded');
        subjectList.classList.toggle('show');
    }

    // 加载某个阶段所有年级的学科
    async loadSubjectsForLevel(level, grades) {
        const container = document.getElementById(`subjects-${level}`);
        
        for (const grade of grades) {
            try {
                console.log(`加载 ${level} - ${grade.name} (ID: ${grade.id}) 的学科`);
                const response = await fetch(`/api/subjects/${grade.id}`);
                const data = await response.json();
                
                if (data.success) {
                    console.log(`${level} - ${grade.name} 的学科:`, data.subjects);
                    this.subjects[grade.name] = data.subjects;
                    
                    // 创建年级分组
                    const gradeGroup = document.createElement('div');
                    gradeGroup.className = 'grade-group';
                    
                    const gradeTitle = document.createElement('div');
                    gradeTitle.className = 'grade-title';
                    gradeTitle.textContent = grade.name;
                    gradeTitle.onclick = () => this.toggleGrade(gradeTitle);
                    
                    const subjectList = document.createElement('div');
                    subjectList.className = 'subject-list';
                    subjectList.id = `grade-${grade.name}`;
                    
                    // 添加学科项
                    data.subjects.forEach(subject => {
                        const subjectItem = document.createElement('div');
                        subjectItem.className = 'subject-item';
                        
                        // 创建学科名称和状态指示器容器
                        const contentDiv = document.createElement('div');
                        contentDiv.className = 'subject-content';
                        
                        // 学科名称
                        const nameSpan = document.createElement('span');
                        nameSpan.textContent = subject.name;
                        contentDiv.appendChild(nameSpan);
                        
                        // 在线状态指示器
                        const statusDot = document.createElement('span');
                        statusDot.className = `status-dot ${subject.onlineCount > 0 ? 'online' : 'offline'}`;
                        statusDot.title = `${subject.onlineCount}人在线`;
                        contentDiv.appendChild(statusDot);
                        
                        subjectItem.appendChild(contentDiv);
                        subjectItem.dataset.grade = grade.name;
                        subjectItem.dataset.subject = subject.name;
                        subjectItem.onclick = () => this.selectSubject(grade.name, subject.name, subjectItem);
                        subjectList.appendChild(subjectItem);
                    });
                    
                    gradeGroup.appendChild(gradeTitle);
                    gradeGroup.appendChild(subjectList);
                    container.appendChild(gradeGroup);
                }
            } catch (error) {
                console.error(`加载${grade.name}学科失败:`, error);
            }
        }
    }

    // 切换年级展开/收起
    toggleGrade(titleElement) {
        const subjectList = titleElement.nextElementSibling;
        titleElement.classList.toggle('expanded');
        subjectList.classList.toggle('show');
    }

    // 选择学科
    selectSubject(grade, subject, element) {
        // 确保subject是字符串
        const subjectName = typeof subject === 'object' ? subject.name : subject;
        
        // 移除之前的激活状态
        document.querySelectorAll('.subject-item.active').forEach(el => {
            el.classList.remove('active');
        });
        
        // 设置新的激活状态
        element.classList.add('active');
        
        this.currentGrade = grade;
        this.currentSubject = subjectName;
        
        // 查找年级对应的学制（需要同时匹配name和当前选中的学制）
        const currentLevel = localStorage.getItem('currentLevel') || '';
        const gradeInfo = this.grades.find(g => g.name === grade && g.level === currentLevel);
        const level = gradeInfo ? gradeInfo.level : currentLevel;
        
        console.log('=== selectSubject调试 ===');
        console.log('grade:', grade);
        console.log('subject:', subjectName);
        console.log('currentLevel:', currentLevel);
        console.log('gradeInfo:', gradeInfo);
        console.log('level:', level);
        console.log('所有年级数据:', this.grades);
        
        // 保存上次选择的房间（包含学制）
        localStorage.setItem('lastRoom', JSON.stringify({ grade, subject: subjectName, level }));
        
        // 更新聊天标题 - 只显示学制和学科
        const titleText = level ? `${level} - ${subject}` : `${subject}`;
        document.getElementById('chatTitle').textContent = titleText;
        
        // 更新用户年级信息（显示在在线人数前面）
        const userGradeInfo = document.getElementById('userGradeInfo');
        if (userGradeInfo) {
            userGradeInfo.textContent = grade;
        }
        
        // 切换到聊天视图
        document.getElementById('welcomeView').style.display = 'none';
        document.getElementById('chatView').style.display = 'flex';
        
        // 加入房间（包含level）
        window.chatModule.joinRoom(grade, subject, level);
        
        // 加载历史消息
        this.loadAndRenderMessages(grade, subject);
        
        // 移动端：选择后自动关闭侧边栏
        if (window.innerWidth <= 768) {
            const sidebar = document.querySelector('.sidebar');
            const overlay = document.getElementById('sidebarOverlay');
            if (sidebar) sidebar.classList.remove('active');
            if (overlay) overlay.classList.remove('active');
        }
    }

    // 加载并渲染消息
    async loadAndRenderMessages(grade, subject, page = 1, append = false) {
        console.log('=== 开始加载消息 ===');
        console.log('年级:', grade, '学科:', subject, '页码:', page, '追加:', append);
        
        const messageList = document.getElementById('messageList');
        
        if (!append) {
            // 清空消息列表
            messageList.innerHTML = '';
            this.messagePage = 1;
            this.hasMoreMessages = true;
        }
        
        this.isLoadingMessages = true;
        const messages = await window.loadMessages(grade, subject, 50, (page - 1) * 50);
        this.isLoadingMessages = false;
        
        console.log('获取到的消息数量:', messages.length);
        console.log('消息数据:', messages);
        
        // 移除加载提示
        const loadingEl = document.getElementById('loadingMore');
        if (loadingEl) {
            loadingEl.remove();
        }
        
        if (messages.length === 0) {
            if (!append) {
                messageList.innerHTML = '<div style="text-align: center; color: #a0aec0; padding: 40px;">暂无消息，开始第一句对话吧！</div>';
            }
            this.hasMoreMessages = false;
            console.log('没有更多消息');
            return;
        }
        
        if (messages.length < 50) {
            this.hasMoreMessages = false;
            console.log('已加载所有消息');
        }
        
        this.renderMessages(messages, append);
        console.log('=== 消息加载完成 ===');
    }

    // 渲染消息列表
    renderMessages(messages, append = false) {
        console.log('=== 开始渲染消息 ===');
        console.log('渲染消息，数量:', messages.length, '追加:', append);
        
        const messageList = document.getElementById('messageList');
        console.log('messageList元素:', messageList);
        console.log('messageList当前内容:', messageList.innerHTML.substring(0, 100));
        
        if (!append) {
            messageList.innerHTML = '';
            console.log('已清空messageList');
        }
        
        if (messages.length === 0 && !append) {
            messageList.innerHTML = '<div style="text-align: center; color: #a0aec0; padding: 40px;">暂无消息，开始第一句对话吧！</div>';
            console.log('显示暂无消息提示');
            return;
        }
        
        const currentUser = window.authModule.getCurrentUser();
        console.log('当前用户:', currentUser);
        
        let renderedCount = 0;
        messages.forEach((msg, index) => {
            // 确保userId是数字类型进行比较
            const isOwn = Number(msg.userId) === Number(currentUser.id);
            console.log(`渲染第${index + 1}条消息:`, msg.nickname, 'msg.userId:', msg.userId, 'currentUser.id:', currentUser.id, '是自己:', isOwn);
            const messageEl = this.createMessageElement(msg, isOwn);
            console.log('创建的消息元素:', messageEl);
            if (append) {
                // 追加到开头（因为是历史消息）
                messageList.insertBefore(messageEl, messageList.firstChild);
            } else {
                messageList.appendChild(messageEl);
            }
            renderedCount++;
        });
        
        console.log('已渲染', renderedCount, '条消息');
        console.log('messageList现在的内容长度:', messageList.innerHTML.length);
        console.log('messageList子元素数量:', messageList.children.length);
        
        // 如果不是追加模式，滚动到底部
        if (!append) {
            this.scrollToBottom();
        }
        console.log('=== 渲染完成 ===');
    }

    // 创建消息元素
    createMessageElement(msg, isOwn) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${isOwn ? 'own' : 'other'}`;
        messageDiv.dataset.messageId = msg.id; // 添加消息ID
        
        const timeStr = window.formatTime(msg.createdAt);
        // 闲聊室不显示年级信息
        const gradeInfo = (msg.grade && msg.grade !== '闲聊室') ? `[${msg.grade}]` : '';
        
        // 检查是否有引用
        let quoteHtml = '';
        if (msg.quoteMessage) {
            quoteHtml = `
                <div class="quote-block" onclick="scrollToQuotedMessage('${msg.quoteMessage.id}')">
                    <div class="quote-nickname">回复 ${window.escapeHtml(msg.quoteMessage.nickname)}</div>
                    <div class="quote-content">${window.escapeHtml(msg.quoteMessage.content.substring(0, 50))}${msg.quoteMessage.content.length > 50 ? '...' : ''}</div>
                </div>
            `;
        }
        
        // 检查是否有图片
        let imageHtml = '';
        if (msg.imagePath) {
            imageHtml = `
                <div class="message-image" onclick="viewImage('${msg.imagePath}')">
                    <img src="${msg.imagePath}" alt="${window.escapeHtml(msg.filename || '图片')}" class="message-thumbnail" decoding="async">
                </div>
            `;
        }
        
        // 检查是否有文件
        let fileHtml = '';
        if (msg.filePath) {
            const ext = msg.extension || '.unknown';
            const mimetype = msg.fileType || '';
            
            // 判断是否是图片格式（通过扩展名或mimetype）
            const isImageFormat = mimetype.startsWith('image/') || 
                                 ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg'].includes(ext.toLowerCase());
            
            if (isImageFormat) {
                // 图片格式文件，显示缩略图
                fileHtml = `
                    <div class="message-image" onclick="viewImage('${msg.filePath}')">
                        <img src="${msg.filePath}" alt="${window.escapeHtml(msg.filename)}" class="message-thumbnail" decoding="async">
                    </div>
                `;
            } else {
                // 非图片文件，显示图标
                const iconPath = `/downloads${ext}/icon.png`;
                
                fileHtml = `
                    <div class="message-file">
                        <a href="${msg.filePath}" download="${window.escapeHtml(msg.filename)}" class="file-link">
                            <img src="${iconPath}" class="file-icon-img" onerror="this.style.display='none'; this.nextElementSibling.style.display='inline';" />
                            <span class="file-icon-fallback" style="display:none;">📄</span>
                            <span class="file-name">${window.escapeHtml(msg.filename)}</span>
                        </a>
                    </div>
                `;
            }
        }
        
        messageDiv.innerHTML = `
            ${quoteHtml}
            <div class="message-meta">
                <span class="nickname">${gradeInfo} ${window.escapeHtml(msg.nickname)}</span>
                <span class="time" data-original-time="${msg.createdAt}">${timeStr}</span>
            </div>
            ${imageHtml}
            ${fileHtml}
            ${!msg.imagePath && !msg.filePath ? `<div class="message-content">${window.escapeHtml(msg.content)}</div>` : ''}
        `;
        
        // 添加右键菜单和长按事件 - 引用功能
        let pressTimer = null;
        
        // 电脑端右键菜单
        messageDiv.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            currentContextMenuTarget = msg;
            showContextMenu(e.clientX, e.clientY);
        });
        
        // 移动端长按
        messageDiv.addEventListener('touchstart', (e) => {
            currentContextMenuTarget = msg;
            pressTimer = setTimeout(() => {
                e.preventDefault(); // 防止弹出系统菜单
                showContextMenu(e.touches[0].clientX, e.touches[0].clientY);
            }, 500); // 500ms长按触发
        });
        
        messageDiv.addEventListener('touchend', () => {
            if (pressTimer) {
                clearTimeout(pressTimer);
                pressTimer = null;
            }
        });
        
        messageDiv.addEventListener('touchmove', () => {
            if (pressTimer) {
                clearTimeout(pressTimer);
                pressTimer = null;
            }
        });
        
        return messageDiv;
    }

    // 处理新消息
    handleNewMessage(message) {
        console.log('=== 收到新消息 ===');
        console.log('消息内容:', message);
        
        const currentLevel = localStorage.getItem('currentLevel') || '';
        console.log('当前房间:', currentLevel, this.currentGrade, this.currentSubject);
        console.log('消息房间:', message.level, message.grade, message.subject);
        
        // 闲聊室的特殊处理：只要subject是闲聊室就显示
        if (this.currentSubject === '闲聊室') {
            if (message.subject !== '闲聊室') {
                console.log('不是闲聊室的消息，忽略');
                return;
            }
        } else {
            // 普通学科房间：检查level、grade、subject是否匹配
            if (message.level !== currentLevel || message.grade !== this.currentGrade || message.subject !== this.currentSubject) {
                console.log('不是当前房间的消息，忽略');
                return;
            }
        }
        
        const currentUser = window.authModule.getCurrentUser();
        console.log('当前用户:', currentUser);
        const isOwn = Number(message.userId) === Number(currentUser.id);
        console.log('是自己发的消息:', isOwn);
        
        const messageList = document.getElementById('messageList');
        console.log('messageList元素:', messageList);
        console.log('messageList子元素数量:', messageList.children.length);
        
        // 如果是第一条消息，清空提示
        if (messageList.children.length === 1 && messageList.children[0].textContent.includes('暂无消息')) {
            console.log('清空暂无消息提示');
            messageList.innerHTML = '';
        }
        
        const messageEl = this.createMessageElement(message, isOwn);
        console.log('创建的消息元素:', messageEl);
        messageList.appendChild(messageEl);
        console.log('消息已添加到DOM');
        console.log('现在messageList子元素数量:', messageList.children.length);
        
        // 滚动到底部
        this.scrollToBottom();
        console.log('=== 新消息处理完成 ===');
    }

    // 发送消息
    sendMessage() {
        console.log('App.sendMessage被调用');
        const input = document.getElementById('messageInput');
        let content = input.value.trim();
        
        console.log('输入内容:', content);
        
        if (!content) {
            console.log('内容为空，不发送');
            return;
        }
        
        if (!this.currentGrade || !this.currentSubject) {
            console.log('没有选择年级或学科');
            alert('请先选择一个年级和学科');
            return;
        }
        
        console.log('准备发送消息:', { grade: this.currentGrade, subject: this.currentSubject, content });
        
        // 获取当前学制
        const level = localStorage.getItem('currentLevel') || '';
        
        // 准备发送的数据
        const messageData = {
            grade: this.currentGrade,
            subject: this.currentSubject,
            level: level,
            content: content
        };
        
        // 如果有引用，添加引用信息
        if (this.quotedMessage) {
            messageData.quoteMessage = {
                id: this.quotedMessage.id,
                nickname: this.quotedMessage.nickname,
                content: this.quotedMessage.content
            };
            // 清除引用
            cancelQuote();
        }
        
        console.log('调用chatModule.sendMessageData');
        const success = window.chatModule.sendMessageData(messageData);
        console.log('发送结果:', success);
        
        if (success) {
            input.value = '';
            input.style.height = 'auto';
            console.log('消息发送成功');
        } else {
            console.log('消息发送失败');
        }
    }

    // 滚动到底部
    scrollToBottom() {
        const messageList = document.getElementById('messageList');
        setTimeout(() => {
            messageList.scrollTop = messageList.scrollHeight;
        }, 100);
    }
}

// 全局函数
function sendMessage() {
    console.log('sendMessage被调用');
    console.log('window.appModule:', window.appModule);
    
    if (!window.appModule) {
        console.error('appModule未初始化');
        alert('系统未就绪，请刷新页面');
        return;
    }
    
    console.log('currentGrade:', window.appModule.currentGrade);
    console.log('currentSubject:', window.appModule.currentSubject);
    
    window.appModule.sendMessage();
}

function logout() {
    window.authModule.logout();
}

// 显示年级选择器（用于切换学制）
function showGradeSelector() {
    if (window.authModule && window.authModule.showGradeSelector) {
        window.authModule.showGradeSelector();
    }
}

// 切换学制菜单
function toggleLevelMenu() {
    const menu = document.getElementById('levelMenu');
    const btn = document.getElementById('btnLevelSelect');
    if (menu && btn) {
        menu.classList.toggle('show');
        btn.classList.toggle('active');
    }
}

// 选择学制
function selectLevel(level) {
    console.log('选择学制:', level);
    
    // 保存到localStorage
    localStorage.setItem('currentLevel', level);
    
    // 更新按钮文本
    const btn = document.getElementById('btnLevelSelect');
    if (btn) {
        btn.textContent = level;
    }
    
    // 关闭菜单
    const menu = document.getElementById('levelMenu');
    const btnEl = document.getElementById('btnLevelSelect');
    if (menu) menu.classList.remove('show');
    if (btnEl) btnEl.classList.remove('active');
    
    // 重新渲染侧边栏
    if (window.appModule) {
        window.appModule.renderSidebar();
    }
    
    // 清除上次选择的房间（因为学制变了）
    localStorage.removeItem('lastRoom');
}

// 显示年级选择弹窗
function showGradeSelectorModal() {
    const modal = document.getElementById('gradeSelectorModal');
    if (modal) {
        modal.style.display = 'flex';
        loadGradeOptions();
    }
}

// 隐藏年级选择弹窗
function hideGradeSelectorModal() {
    const modal = document.getElementById('gradeSelectorModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// 加载年级选项
function loadGradeOptions() {
    const currentLevel = localStorage.getItem('currentLevel') || '小学';
    const gradeOptionsContainer = document.getElementById('gradeOptions');
    
    if (!gradeOptionsContainer) return;
    
    gradeOptionsContainer.innerHTML = '';
    
    // 获取当前学制下的所有年级
    if (window.appModule && window.appModule.grades) {
        const levelGrades = window.appModule.grades.filter(g => g.level === currentLevel);
        
        levelGrades.forEach(grade => {
            const optionCard = document.createElement('div');
            optionCard.className = 'grade-option-card';
            optionCard.textContent = grade.name;
            optionCard.dataset.grade = grade.name;
            optionCard.onclick = () => selectGradeInModal(grade.name, optionCard);
            gradeOptionsContainer.appendChild(optionCard);
        });
    }
    
    // 高亮当前选中的学制
    highlightCurrentSelection();
}

// 在弹窗中选择学制
function selectLevelInModal(level) {
    console.log('弹窗中选择学制:', level);
    localStorage.setItem('currentLevel', level);
    
    // 高亮选中的学制
    document.querySelectorAll('.level-option-card').forEach(card => {
        card.classList.remove('active');
        if (card.dataset.level === level) {
            card.classList.add('active');
        }
    });
    
    // 重新加载年级选项
    loadGradeOptions();
}

// 在弹窗中选择年级
function selectGradeInModal(gradeName, element) {
    console.log('弹窗中选择年级:', gradeName);
    localStorage.setItem('selectedGrade', gradeName);
    
    // 高亮选中的年级
    document.querySelectorAll('.grade-option-card').forEach(card => {
        card.classList.remove('active');
    });
    element.classList.add('active');
    
    // 启用确定按钮
    const confirmBtn = document.getElementById('confirmGradeBtn');
    if (confirmBtn) {
        confirmBtn.disabled = false;
    }
}

// 确认年级选择
async function confirmGradeSelection() {
    const level = localStorage.getItem('currentLevel');
    const grade = localStorage.getItem('selectedGrade');
    
    if (!level || !grade) {
        alert('请选择学制和年级');
        return;
    }
    
    console.log('确认选择:', level, grade);
    
    // 保存到localStorage
    localStorage.setItem('currentLevel', level);
    localStorage.setItem('currentGrade', grade);
    localStorage.removeItem('currentSubject'); // 清除学科
    localStorage.removeItem('lastRoom'); // 清除房间
    
    // 调用原有的selectGrade函数并等待完成
    if (window.authModule && window.authModule.selectGrade) {
        if (window.appModule && window.appModule.grades) {
            const gradeInfo = window.appModule.grades.find(g => g.name === grade && g.level === level);
            if (gradeInfo) {
                await window.authModule.selectGrade(gradeInfo.id, grade);
            }
        }
    }
    
    hideGradeSelectorModal();
    
    // 更新按钮文本
    updateGradeSelectButtonText(level, grade);
    
    // 重新初始化侧边栏并自动选择第一个学科
    if (window.appModule) {
        await window.appModule.renderSidebar();
        
        // 自动选择第一个学科
        const firstSubject = document.querySelector('.subject-item');
        if (firstSubject) {
            const subjectName = firstSubject.dataset.subject;
            if (subjectName) {
                console.log('自动选择第一个学科:', subjectName);
                // 触发点击事件，进入房间
                firstSubject.click();
            }
        }
    }
}

// 高亮当前选择
function highlightCurrentSelection() {
    const currentLevel = localStorage.getItem('currentLevel') || '小学';
    const currentUser = window.authModule ? window.authModule.getCurrentUser() : null;
    const currentGrade = currentUser ? currentUser.grade : null;
    
    // 高亮学制
    document.querySelectorAll('.level-option-card').forEach(card => {
        card.classList.remove('active');
        if (card.dataset.level === currentLevel) {
            card.classList.add('active');
        }
    });
    
    // 高亮年级
    if (currentGrade) {
        document.querySelectorAll('.grade-option-card').forEach(card => {
            card.classList.remove('active');
            if (card.dataset.grade === currentGrade) {
                card.classList.add('active');
                // 启用确定按钮
                const confirmBtn = document.getElementById('confirmGradeBtn');
                if (confirmBtn) {
                    confirmBtn.disabled = false;
                }
            }
        });
    }
}

function showTab(tab) {
    window.authModule.showTab(tab);
}

function register() {
    window.authModule.register();
}

function login() {
    window.authModule.login();
}

// 跳转到底部
function scrollToBottom() {
    const messageList = document.getElementById('messageList');
    if (messageList) {
        messageList.scrollTo({
            top: messageList.scrollHeight,
            behavior: 'smooth'
        });
    }
}

// 切换侧边栏（移动端）
function toggleSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    
    if (sidebar && overlay) {
        sidebar.classList.toggle('active');
        overlay.classList.toggle('active');
    }
}

// 处理图片上传
async function handleImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // 检查文件大小（限制500MB）
    if (file.size > 500 * 1024 * 1024) {
        alert('图片大小不能超过500MB');
        return;
    }
    
    try {
        // 上传图片到服务器
        const formData = new FormData();
        formData.append('file', file);
        
        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (result.success) {
            // 发送消息，附带图片路径和图标信息
            sendMessageWithImage(`[图片] ${file.name}`, result.file.path, file.name, result.file.extension, result.file.hasIcon);
        } else {
            alert(result.message || '图片上传失败');
        }
        
        // 清空input
        event.target.value = '';
    } catch (error) {
        console.error('图片上传失败:', error);
        alert('图片上传失败，请重试');
    }
}

// 处理文件上传
async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // 检查文件大小（限制500MB）
    if (file.size > 500 * 1024 * 1024) {
        alert('文件大小不能超过500MB');
        return;
    }
    
    try {
        // 上传文件到服务器
        const formData = new FormData();
        formData.append('file', file);
        
        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (result.success) {
            // 发送消息，附带文件路径和图标信息
            sendMessageWithFile(`[文件] ${file.name}`, result.file.path, file.name, file.type, result.file.extension, result.file.hasIcon);
        } else {
            alert(result.message || '文件上传失败');
        }
        
        // 清空input
        event.target.value = '';
    } catch (error) {
        console.error('文件上传失败:', error);
        alert('文件上传失败，请重试');
    }
}

// 将文件转换为Base64
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// 发送带图片的消息
function sendMessageWithImage(content, imagePath, filename, extension, hasIcon) {
    const input = document.getElementById('messageInput');
    
    if (!window.appModule || !window.appModule.currentGrade || !window.appModule.currentSubject) {
        alert('请先选择一个年级和学科');
        return;
    }
    
    // 获取当前学制
    const level = localStorage.getItem('currentLevel') || '';
    
    const messageData = {
        grade: window.appModule.currentGrade,
        subject: window.appModule.currentSubject,
        level: level,
        content: content,
        imagePath: imagePath,
        filename: filename,
        fileType: 'image/' + extension.replace('.', ''),
        extension: extension,
        hasIcon: hasIcon
    };
    
    const success = window.chatModule.sendMessageData(messageData);
    
    if (success) {
        input.value = '';
        input.style.height = 'auto';
    }
}

// 发送带文件的消息
function sendMessageWithFile(content, filePath, filename, fileType, extension, hasIcon) {
    const input = document.getElementById('messageInput');
    
    if (!window.appModule || !window.appModule.currentGrade || !window.appModule.currentSubject) {
        alert('请先选择一个年级和学科');
        return;
    }
    
    // 获取当前学制
    const level = localStorage.getItem('currentLevel') || '';
    
    const messageData = {
        grade: window.appModule.currentGrade,
        subject: window.appModule.currentSubject,
        level: level,
        content: content,
        filePath: filePath,
        filename: filename,
        fileType: fileType,
        extension: extension,
        hasIcon: hasIcon
    };
    
    const success = window.chatModule.sendMessageData(messageData);
    
    if (success) {
        input.value = '';
        input.style.height = 'auto';
    }
}

// 查看图片
function viewImage(imageSrc) {
    // 创建模态框显示大图
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.9);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        cursor: pointer;
    `;
    
    const img = document.createElement('img');
    img.src = imageSrc;
    img.style.cssText = `
        max-width: 90%;
        max-height: 90%;
        object-fit: contain;
    `;
    
    modal.appendChild(img);
    document.body.appendChild(modal);
    
    // 点击关闭
    modal.onclick = () => {
        document.body.removeChild(modal);
    };
}

// 格式化文件大小
function formatFileSize(bytes) {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// 将formatFileSize暴露给全局
window.formatFileSize = formatFileSize;

// 全局变量保存当前引用的消息
let currentContextMenuTarget = null;

// 显示右键菜单
function showContextMenu(x, y) {
    const contextMenu = document.getElementById('contextMenu');
    if (!contextMenu) return;
    
    // 确保菜单不超出屏幕
    const menuWidth = 150;
    const menuHeight = 100;
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    
    let left = x;
    let top = y;
    
    if (x + menuWidth > windowWidth) {
        left = windowWidth - menuWidth - 10;
    }
    
    if (y + menuHeight > windowHeight) {
        top = windowHeight - menuHeight - 10;
    }
    
    contextMenu.style.left = left + 'px';
    contextMenu.style.top = top + 'px';
    contextMenu.style.display = 'block';
}

// 隐藏右键菜单
function hideContextMenu() {
    const contextMenu = document.getElementById('contextMenu');
    if (contextMenu) {
        contextMenu.style.display = 'none';
    }
}

// 处理右键菜单操作
function handleContextMenuAction(action) {
    hideContextMenu();
    
    if (!currentContextMenuTarget) return;
    
    if (action === 'quote') {
        quoteMessage(
            currentContextMenuTarget.id,
            currentContextMenuTarget.nickname,
            currentContextMenuTarget.content
        );
    } else if (action === 'copy') {
        // 复制消息内容
        navigator.clipboard.writeText(currentContextMenuTarget.content).then(() => {
            console.log('已复制消息内容');
        }).catch(err => {
            console.error('复制失败:', err);
        });
    }
    
    currentContextMenuTarget = null;
}

// 点击页面其他地方关闭右键菜单
document.addEventListener('click', (e) => {
    const contextMenu = document.getElementById('contextMenu');
    if (contextMenu && !contextMenu.contains(e.target)) {
        hideContextMenu();
    }
});

// 引用消息
function quoteMessage(messageId, nickname, content) {
    const app_instance = window.app;
    if (!app_instance) return;
    
    app_instance.quotedMessage = { id: messageId, nickname, content };
    
    // 聚焦输入框
    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
        messageInput.focus();
        messageInput.placeholder = `回复 ${nickname}: ${content.substring(0, 30)}${content.length > 30 ? '...' : ''}`;
    }
    
    console.log('已设置引用消息:', app_instance.quotedMessage);
}

// 取消引用
function cancelQuote() {
    const app_instance = window.app;
    if (app_instance) {
        app_instance.quotedMessage = null;
    }
    
    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
        messageInput.placeholder = '输入消息... (按Enter发送，Shift+Enter换行)';
    }
}

// 跳转到引用的消息
function scrollToQuotedMessage(messageId) {
    const messageList = document.getElementById('messageList');
    if (!messageList) return;
    
    // 查找对应的消息元素
    const targetMessage = messageList.querySelector(`[data-message-id="${messageId}"]`);
    if (targetMessage) {
        targetMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // 高亮显示一下
        targetMessage.style.transition = 'background 0.3s';
        targetMessage.style.background = 'rgba(102, 126, 234, 0.2)';
        setTimeout(() => {
            targetMessage.style.background = '';
        }, 1500);
    } else {
        console.log('未找到消息:', messageId);
        // TODO: 如果消息不在当前视图中，可能需要加载更多历史消息
    }
}

// 初始化应用
const app = new App();
window.app = app; // 暴露给全局，供引用功能使用
window.appModule = app;

// DOM加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    app.init();
});
