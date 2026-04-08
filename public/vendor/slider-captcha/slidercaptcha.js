/**
 * SliderCaptcha - 滑块验证码
 * 参考: https://gitee.com/LongbowEnterprise/SliderCaptcha
 * 简化版实现
 */

class SliderCaptcha {
    constructor(options) {
        this.options = {
            id: 'captcha',
            width: 320,
            height: 160,
            sliderL: 50,
            offset: 5,
            loadingText: '正在加载中...',
            failedText: '验证失败，请重试',
            barText: '向右滑动完成验证',
            successText: '验证成功',
            onSuccess: null,
            onFail: null,
            onRefresh: null,
            remoteUrl: null,
            ...options
        };

        this.container = document.getElementById(this.options.id);
        if (!this.container) {
            console.error('SliderCaptcha: 找不到容器元素 #' + this.options.id);
            return;
        }

        this.isDragging = false;
        this.startX = 0;
        this.currentX = 0;
        this.maxX = 0;
        this.targetX = 0;
        this.verified = false;
        this.trackData = [];

        this.init();
    }

    init() {
        this.render();
        this.bindEvents();
        this.loadImage();
    }

    render() {
        this.container.className = 'slider-captcha';
        this.container.innerHTML = `
            <div class="captcha-container">
                <div class="captcha-loading">${this.options.loadingText}</div>
                <img class="captcha-image" style="display: none;">
                <div class="puzzle-slot" style="display: none;"></div>
                <div class="puzzle-piece" style="display: none;"></div>
                <button class="captcha-refresh" title="刷新">↻</button>
            </div>
            <div class="slider-bar">
                <div class="slider-track"></div>
                <div class="slider-text">${this.options.barText}</div>
                <div class="slider-btn">
                    <span class="slider-btn-icon">→</span>
                </div>
            </div>
            <div class="captcha-message"></div>
        `;

        this.elements = {
            container: this.container.querySelector('.captcha-container'),
            loading: this.container.querySelector('.captcha-loading'),
            image: this.container.querySelector('.captcha-image'),
            puzzleSlot: this.container.querySelector('.puzzle-slot'),
            puzzlePiece: this.container.querySelector('.puzzle-piece'),
            refreshBtn: this.container.querySelector('.captcha-refresh'),
            sliderBar: this.container.querySelector('.slider-bar'),
            sliderTrack: this.container.querySelector('.slider-track'),
            sliderText: this.container.querySelector('.slider-text'),
            sliderBtn: this.container.querySelector('.slider-btn'),
            message: this.container.querySelector('.captcha-message')
        };

        this.maxX = this.options.width - this.options.sliderL - 20;
    }

    bindEvents() {
        // 刷新按钮
        this.elements.refreshBtn.addEventListener('click', () => {
            this.reset();
            if (this.options.onRefresh) {
                this.options.onRefresh();
            }
        });

        // 滑块拖动事件
        const sliderBtn = this.elements.sliderBtn;

        // 鼠标事件
        sliderBtn.addEventListener('mousedown', this.handleStart.bind(this));
        document.addEventListener('mousemove', this.handleMove.bind(this));
        document.addEventListener('mouseup', this.handleEnd.bind(this));

        // 触摸事件（移动端支持）
        sliderBtn.addEventListener('touchstart', this.handleStart.bind(this), { passive: false });
        document.addEventListener('touchmove', this.handleMove.bind(this), { passive: false });
        document.addEventListener('touchend', this.handleEnd.bind(this));
    }

    handleStart(e) {
        if (this.verified) return;

        e.preventDefault();
        this.isDragging = true;
        this.startX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
        this.trackData = [];
        this.trackData.push({ x: 0, t: Date.now() });

        this.elements.sliderBtn.style.cursor = 'grabbing';
    }

    handleMove(e) {
        if (!this.isDragging) return;

        e.preventDefault();
        const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
        let deltaX = clientX - this.startX;

        // 限制滑动范围
        deltaX = Math.max(0, Math.min(deltaX, this.maxX));
        this.currentX = deltaX;

        // 更新滑块位置
        this.elements.sliderBtn.style.left = deltaX + 'px';
        this.elements.sliderTrack.style.width = (deltaX + this.options.sliderL / 2) + 'px';

        // 更新拼图位置
        this.elements.puzzlePiece.style.left = deltaX + 'px';

        // 隐藏提示文字
        this.elements.sliderText.classList.add('hidden');

        // 记录轨迹
        this.trackData.push({ x: deltaX, t: Date.now() });
    }

    handleEnd(e) {
        if (!this.isDragging) return;

        this.isDragging = false;
        this.elements.sliderBtn.style.cursor = 'grab';

        // 验证
        this.verify();
    }

    async verify() {
        const offset = Math.abs(this.currentX - this.targetX);
        const isValid = offset <= this.options.offset;

        // 如果有远程验证URL，发送到服务器验证
        if (this.options.remoteUrl && isValid) {
            try {
                const response = await fetch(this.options.remoteUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        track: this.trackData,
                        offset: offset,
                        timestamp: Date.now()
                    })
                });
                const result = await response.json();
                this.handleVerifyResult(result.success);
            } catch (error) {
                console.error('验证码验证失败:', error);
                this.handleVerifyResult(false);
            }
        } else {
            this.handleVerifyResult(isValid);
        }
    }

    handleVerifyResult(success) {
        if (success) {
            this.verified = true;
            this.container.classList.add('success');
            this.container.classList.remove('fail');
            this.elements.message.textContent = this.options.successText;
            this.elements.message.className = 'captcha-message success';
            this.elements.sliderBtn.innerHTML = '<span class="slider-btn-icon">✓</span>';

            if (this.options.onSuccess) {
                this.options.onSuccess(this.trackData);
            }
        } else {
            this.container.classList.add('fail');
            this.container.classList.remove('success');
            this.elements.message.textContent = this.options.failedText;
            this.elements.message.className = 'captcha-message fail';
            this.elements.sliderBtn.innerHTML = '<span class="slider-btn-icon">✕</span>';

            // 延迟后重置
            setTimeout(() => {
                this.reset();
            }, 1000);

            if (this.options.onFail) {
                this.options.onFail();
            }
        }
    }

    loadImage() {
        // 使用随机图片
        const imageUrl = `https://picsum.photos/${this.options.width}/${this.options.height}?random=${Date.now()}`;

        this.elements.image.onload = () => {
            this.elements.loading.style.display = 'none';
            this.elements.image.style.display = 'block';
            this.createPuzzle();
        };

        this.elements.image.onerror = () => {
            // 使用备用图片
            this.elements.image.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIwIiBoZWlnaHQ9IjE2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KICAgIDxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9IiNmMGYwZjAiLz4KICAgIDx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTgiIGZpbGw9IiM5OTkiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj7nsr7nlaXkvbPlpJrlkJfvvIw8L3RleHQ+Cjwvc3ZnPg==';
        };

        this.elements.image.src = imageUrl;
    }

    createPuzzle() {
        // 随机生成拼图位置
        const minX = 60;
        const maxX = this.options.width - this.options.sliderL - 20;
        const minY = 20;
        const maxY = this.options.height - this.options.sliderL - 20;

        this.targetX = Math.floor(Math.random() * (maxX - minX) + minX);
        const targetY = Math.floor(Math.random() * (maxY - minY) + minY);

        // 设置拼图槽位置
        this.elements.puzzleSlot.style.left = this.targetX + 'px';
        this.elements.puzzleSlot.style.top = targetY + 'px';
        this.elements.puzzleSlot.style.display = 'block';

        // 设置拼图块
        this.elements.puzzlePiece.style.left = '0px';
        this.elements.puzzlePiece.style.top = targetY + 'px';
        this.elements.puzzlePiece.style.width = this.options.sliderL + 'px';
        this.elements.puzzlePiece.style.height = this.options.sliderL + 'px';
        this.elements.puzzlePiece.style.backgroundImage = `url(${this.elements.image.src})`;
        this.elements.puzzlePiece.style.backgroundPosition = `-${this.targetX}px -${targetY}px`;
        this.elements.puzzlePiece.style.display = 'block';
    }

    reset() {
        this.verified = false;
        this.currentX = 0;
        this.trackData = [];

        // 重置样式
        this.container.classList.remove('success', 'fail');
        this.elements.sliderBtn.style.left = '0px';
        this.elements.sliderBtn.style.cursor = 'grab';
        this.elements.sliderBtn.innerHTML = '<span class="slider-btn-icon">→</span>';
        this.elements.sliderTrack.style.width = '0px';
        this.elements.sliderText.classList.remove('hidden');
        this.elements.message.textContent = '';
        this.elements.message.className = 'captcha-message';

        // 隐藏拼图
        this.elements.puzzleSlot.style.display = 'none';
        this.elements.puzzlePiece.style.display = 'none';

        // 重新加载图片
        this.loadImage();
    }

    isVerified() {
        return this.verified;
    }
}

// 全局暴露
window.SliderCaptcha = SliderCaptcha;
