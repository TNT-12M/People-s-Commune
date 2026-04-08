// 用户认证模块

let currentUser = null;
let captchaInstance = null;
let captchaVerified = false;

// 检查登录状态
async function checkAuth() {
    console.log('检查登录状态...');
    
    // 先检查localStorage中是否有用户信息
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
        try {
            currentUser = JSON.parse(savedUser);
            console.log('从localStorage恢复用户:', currentUser);
        } catch (e) {
            console.error('解析localStorage失败:', e);
        }
    }
    
    try {
        const response = await fetch('/api/user');
        console.log('API响应状态:', response.status);
        
        if (response.status === 401) {
            // Session已过期，清除localStorage
            console.log('Session已过期，清除localStorage');
            currentUser = null;
            localStorage.removeItem('currentUser');
            return false;
        }
        
        const data = await response.json();
        console.log('API响应数据:', data);
        
        if (data.success) {
            currentUser = data.user;
            
            // 检查数据库中是否存在该用户
            if (!currentUser || !currentUser.id) {
                console.warn('用户数据无效，清除登录状态');
                currentUser = null;
                localStorage.removeItem('currentUser');
                location.reload(); // 刷新页面
                return false;
            }
            
            // 如果localStorage中有grade但API返回的没有，保留localStorage的grade
            const savedUser = localStorage.getItem('currentUser');
            if (savedUser) {
                try {
                    const localUser = JSON.parse(savedUser);
                    if (localUser.grade && !currentUser.grade) {
                        currentUser.grade = localUser.grade;
                        console.log('从localStorage恢复年级:', currentUser.grade);
                    }
                } catch (e) {
                    console.error('解析localStorage失败:', e);
                }
            }
            // 保存到localStorage
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            console.log('用户已登录:', currentUser);
            return true;
        }
        
        // API返回未登录，清除localStorage
        console.log('用户未登录');
        currentUser = null;
        localStorage.removeItem('currentUser');
        return false;
    } catch (error) {
        console.error('检查登录状态失败:', error);
        // 如果API失败，但有localStorage，仍然认为已登录
        if (currentUser) {
            console.log('API失败，使用localStorage中的用户信息');
            return true;
        }
        return false;
    }
}

// 注册
async function register() {
    const nickname = document.getElementById('registerNickname').value.trim();
    const messageEl = document.getElementById('authMessage');
    
    if (!nickname) {
        showMessage(messageEl, '请输入昵称', 'error');
        return;
    }
    
    if (nickname.length < 2 || nickname.length > 20) {
        showMessage(messageEl, '昵称长度必须在2-20个字符之间', 'error');
        return;
    }
    
    // 检查验证码是否通过
    if (!captchaVerified || !captchaInstance || !captchaInstance.isVerified()) {
        showMessage(messageEl, '请先完成滑块验证码验证', 'error');
        return;
    }
    
    try {
        console.log('正在注册:', nickname);
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ nickname })
        });
        
        console.log('注册响应状态:', response.status);
        const data = await response.json();
        console.log('注册响应数据:', data);
        
        if (data.success) {
            currentUser = data.user;
            // 保存到localStorage
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            showMessage(messageEl, '注册成功！', 'success');
            setTimeout(() => {
                hideAuthModal();
                showGradeSelector();
            }, 1000);
        } else {
            showMessage(messageEl, data.message, 'error');
            // 注册失败后重置验证码
            if (captchaInstance) {
                captchaInstance.reset();
                captchaVerified = false;
                document.getElementById('registerBtn').disabled = true;
            }
        }
    } catch (error) {
        console.error('注册失败:', error);
        showMessage(messageEl, '注册失败，请稍后重试', 'error');
        // 注册失败后重置验证码
        if (captchaInstance) {
            captchaInstance.reset();
            captchaVerified = false;
            document.getElementById('registerBtn').disabled = true;
        }
    }
}

// 登录
async function login() {
    const nickname = document.getElementById('loginNickname').value.trim();
    const messageEl = document.getElementById('authMessage');
    
    if (!nickname) {
        showMessage(messageEl, '请输入昵称', 'error');
        return;
    }
    
    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ nickname })
        });
        
        const data = await response.json();
        
        if (data.success) {
            currentUser = data.user;
            // 保存到localStorage
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            showMessage(messageEl, '登录成功！', 'success');
            setTimeout(() => {
                hideAuthModal();
                if (!data.user.grade) {
                    showGradeSelector();
                } else {
                    showMainContainer();
                }
            }, 1000);
        } else {
            showMessage(messageEl, data.message, 'error');
        }
    } catch (error) {
        console.error('登录失败:', error);
        showMessage(messageEl, '登录失败，请稍后重试', 'error');
    }
}

// 登出
async function logout() {
    try {
        await fetch('/api/logout', {
            method: 'POST'
        });
        
        currentUser = null;
        // 清除localStorage
        localStorage.removeItem('currentUser');
        hideMainContainer();
        showAuthModal();
        
        // 断开WebSocket连接
        if (window.chatModule) {
            window.chatModule.disconnect();
        }
    } catch (error) {
        console.error('登出失败:', error);
    }
}

// 显示消息提示
function showMessage(element, text, type) {
    element.textContent = text;
    element.className = `message ${type}`;
    
    setTimeout(() => {
        element.className = 'message';
        element.textContent = '';
    }, 3000);
}

// 显示/隐藏认证模态框
function showAuthModal() {
    document.getElementById('authModal').classList.add('active');
    document.getElementById('userInfo').style.display = 'none';
}

function hideAuthModal() {
    document.getElementById('authModal').classList.remove('active');
    document.getElementById('userInfo').style.display = 'flex';
    document.getElementById('userNickname').textContent = currentUser.nickname;
}

// 初始化验证码
function initCaptcha() {
    // 如果已经初始化过，先销毁
    if (captchaInstance) {
        captchaInstance.reset();
    }
    
    // 延迟初始化，确保DOM已渲染
    setTimeout(() => {
        const captchaContainer = document.getElementById('captchaContainer');
        if (!captchaContainer) return;
        
        // 清空容器
        captchaContainer.innerHTML = '<div id="sliderCaptcha"></div>';
        
        // 创建验证码实例
        captchaInstance = new SliderCaptcha({
            id: 'sliderCaptcha',
            width: 280,
            height: 140,
            sliderL: 45,
            offset: 5,
            barText: '向右滑动完成验证',
            successText: '验证成功',
            failedText: '验证失败，请重试',
            remoteUrl: '/api/captcha/verify',
            onSuccess: function(trackData) {
                console.log('验证码验证成功');
                captchaVerified = true;
                // 启用注册按钮
                const registerBtn = document.getElementById('registerBtn');
                if (registerBtn) {
                    registerBtn.disabled = false;
                }
            },
            onFail: function() {
                console.log('验证码验证失败');
                captchaVerified = false;
                // 禁用注册按钮
                const registerBtn = document.getElementById('registerBtn');
                if (registerBtn) {
                    registerBtn.disabled = true;
                }
            },
            onRefresh: function() {
                console.log('验证码已刷新');
                captchaVerified = false;
                // 禁用注册按钮
                const registerBtn = document.getElementById('registerBtn');
                if (registerBtn) {
                    registerBtn.disabled = true;
                }
            }
        });
    }, 100);
}

// 切换登录/注册标签
function showTab(tab) {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const tabs = document.querySelectorAll('.tab-btn');
    const messageEl = document.getElementById('authMessage');
    
    messageEl.className = 'message';
    messageEl.textContent = '';
    
    tabs.forEach(t => t.classList.remove('active'));
    
    if (tab === 'login') {
        loginForm.style.display = 'flex';
        registerForm.style.display = 'none';
        tabs[0].classList.add('active');
    } else {
        loginForm.style.display = 'none';
        registerForm.style.display = 'flex';
        tabs[1].classList.add('active');
        // 切换到注册标签时初始化验证码
        initCaptcha();
    }
}

// 显示年级选择器
function showGradeSelector() {
    document.getElementById('gradeSelector').style.display = 'flex';
    loadGrades();
}

function hideGradeSelector() {
    document.getElementById('gradeSelector').style.display = 'none';
}

// 加载年级列表
async function loadGrades() {
    try {
        const response = await fetch('/api/grades');
        const data = await response.json();
        
        if (data.success) {
            renderGradeList(data.grades);
        }
    } catch (error) {
        console.error('加载年级列表失败:', error);
    }
}

// 渲染年级列表
function renderGradeList(grades) {
    const gradeList = document.getElementById('gradeList');
    gradeList.innerHTML = '';
    
    grades.forEach(grade => {
        const gradeItem = document.createElement('div');
        gradeItem.className = 'grade-item';
        gradeItem.innerHTML = `
            <div class="grade-name">${grade.name}</div>
            <div class="grade-level">${grade.level}</div>
        `;
        gradeItem.onclick = () => selectGrade(grade.id, grade.name);
        gradeList.appendChild(gradeItem);
    });
}

// 选择年级
async function selectGrade(gradeId, gradeName) {
    if (!currentUser) return;
    
    try {
        console.log('选择年级:', gradeName);
        const response = await fetch('/api/user/grade', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ grade: gradeName })
        });
        
        const data = await response.json();
        console.log('选择年级响应:', data);
        
        if (data.success) {
            currentUser.grade = gradeName;
            // 保存到localStorage
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            console.log('年级已保存:', gradeName);
            hideGradeSelector();
            showMainContainer();
            
            // 更新顶部按钮文本
            updateGradeButton();
            
            // 初始化侧边栏
            if (window.appModule) {
                window.appModule.initSidebar();
            }
        }
    } catch (error) {
        console.error('选择年级失败:', error);
    }
}

// 显示主容器
function showMainContainer() {
    document.getElementById('mainContainer').style.display = 'flex';
    document.getElementById('userInfo').style.display = 'flex';
    document.getElementById('userNickname').textContent = currentUser.nickname;
    
    // 更新年级按钮文本
    updateGradeButton();
    
    // 初始化侧边栏
    if (window.appModule) {
        window.appModule.initSidebar();
    }
}

function hideMainContainer() {
    document.getElementById('mainContainer').style.display = 'none';
}

// 更新年级按钮文本
function updateGradeButton() {
    const btn = document.getElementById('btnLevelSelect');
    if (btn) {
        // 从localStorage获取当前学制
        const currentLevel = localStorage.getItem('currentLevel') || '小学';
        btn.textContent = currentLevel;
    }
    
    // 同时更新年级选择按钮
    const gradeBtn = document.getElementById('btnGradeSelect');
    if (gradeBtn && currentUser && currentUser.grade) {
        const currentLevel = localStorage.getItem('currentLevel') || '';
        if (typeof updateGradeSelectButtonText === 'function') {
            updateGradeSelectButtonText(currentLevel, currentUser.grade);
        } else {
            // 如果app.js还没加载，直接设置文本
            gradeBtn.textContent = currentLevel ? `${currentLevel}${currentUser.grade}` : currentUser.grade;
        }
    }
}

// 获取当前用户
function getCurrentUser() {
    return currentUser;
}

// 导出函数
window.authModule = {
    checkAuth,
    register,
    login,
    logout,
    getCurrentUser,
    showTab,
    showGradeSelector,
    hideGradeSelector,
    selectGrade,
    showMainContainer,
    hideMainContainer,
    updateGradeButton,
    showAuthModal,
    hideAuthModal,
    showMessage,
    initCaptcha
};
