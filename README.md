# 学习讨论平台

一个基于 Node.js + Express + WebSocket 的实时学习讨论网站，支持多年级、多学科的在线聊天功能。

## ✨ 功能特性

- 🎓 **完整的K12年级体系**: 小学1-6年级、初中1-3年级、高中1-3年级
- 📚 **丰富的学科覆盖**: 语文、数学、英语、物理、化学、生物、历史、地理、政治
- 💬 **实时聊天**: 基于WebSocket的即时消息推送
- 👥 **多人在线**: 支持多个用户同时在线讨论
- 💾 **消息持久化**: 所有聊天记录自动保存
- 🎨 **精美界面**: 现代化UI设计，响应式布局
- 🔐 **简化登录**: 仅需昵称即可快速注册登录

## 📁 项目结构

```
html/
├── server.js                 # Express服务器主文件
├── database.js               # SQLite数据库管理
├── package.json              # Node.js项目配置
├── 启动.bat                  # Windows快速启动脚本
├── 部署说明.md               # 详细部署文档
├── data/                     # 数据库目录
│   └── learning.db          # SQLite数据库文件（自动生成）
└── public/                   # 前端静态资源
    ├── index.html           # 主页面
    ├── css/
    │   └── style.css        # 样式文件
    └── js/
        ├── app.js           # 主应用逻辑
        ├── auth.js          # 用户认证模块
        └── chat.js          # 聊天功能模块
```

## 🚀 快速开始

### 方法一：使用启动脚本（推荐）

双击运行 `启动.bat`，脚本会自动：
1. 检查Node.js是否安装
2. 安装依赖包
3. 启动服务器

### 方法二：手动启动

1. **安装依赖**
   ```bash
   npm install
   ```

2. **启动服务器**
   ```bash
   npm start
   ```

3. **访问网站**
   
   打开浏览器访问：http://localhost:3000

## 🛠️ 技术栈

### 后端
- **Node.js**: JavaScript运行时
- **Express**: Web应用框架
- **SQLite**: 轻量级数据库
- **WebSocket (ws)**: 实时通信
- **express-session**: 会话管理

### 前端
- **HTML5**: 页面结构
- **CSS3**: 样式设计（渐变、动画、响应式）
- **JavaScript (ES6+)**: 交互逻辑
- **WebSocket API**: 客户端实时通信

## 📖 使用说明

### 1. 注册/登录
- 首次访问会显示登录/注册界面
- 输入昵称（2-20个字符）
- 点击注册或登录按钮

### 2. 选择年级
- 登录后会显示年级选择界面
- 点击选择你的年级
- 可以随时在左侧切换

### 3. 开始讨论
- 左侧导航栏按阶段分组（小学/初中/高中）
- 点击阶段名称展开年级列表
- 点击年级展开学科列表
- 点击学科进入聊天室

### 4. 发送消息
- 在底部输入框输入消息
- 按 Enter 键发送
- 按 Shift+Enter 换行
- 消息会实时显示给同房间的所有用户

## 🎨 界面预览

### 主要界面元素
- **顶部导航栏**: 显示网站Logo和当前用户信息
- **左侧边栏**: 年级和学科分类导航
- **聊天区域**: 
  - 欢迎界面（未选择学科时）
  - 聊天界面（显示消息列表和输入框）

### 设计特点
- 渐变色主题（蓝紫色）
- 卡片式布局
- 平滑过渡动画
- 响应式设计（支持移动端）

## ⚙️ 配置

### 修改端口号

编辑 `server.js` 文件第11行：
```javascript
const PORT = process.env.PORT || 3000; // 修改3000为其他端口
```

或通过环境变量设置：
```bash
# Windows PowerShell
$env:PORT=8080
npm start

# Linux/Mac
PORT=8080 npm start
```

## 🗄️ 数据库

### 数据结构

**users表** - 用户信息
- id: 用户ID
- nickname: 昵称
- avatar: 头像
- grade: 当前年级
- created_at: 创建时间

**messages表** - 聊天消息
- id: 消息ID
- user_id: 用户ID
- grade: 年级
- subject: 学科
- content: 消息内容
- created_at: 创建时间

**grades表** - 年级信息（预置12个年级）

**subjects表** - 学科信息（预置各年级学科）

### 数据备份

直接复制 `data/learning.db` 文件即可备份所有数据。

## 🔧 开发

### 开发模式启动
```bash
npm run dev
```

这会使用 nodemon 自动重启服务器（需要安装nodemon）。

### 代码结构说明

**后端架构**:
- `server.js`: 路由定义、WebSocket处理
- `database.js`: 数据库操作封装

**前端架构**:
- `auth.js`: 用户认证相关功能
- `chat.js`: WebSocket连接和消息处理
- `app.js`: 应用主逻辑和UI控制

## 📝 API接口

### 用户相关
- `POST /api/register` - 用户注册
- `POST /api/login` - 用户登录
- `POST /api/logout` - 用户登出
- `GET /api/user` - 获取当前用户信息
- `POST /api/user/grade` - 更新用户年级

### 数据查询
- `GET /api/grades` - 获取所有年级
- `GET /api/subjects/:gradeId` - 获取指定年级的学科
- `GET /api/messages/:grade/:subject` - 获取聊天记录

### WebSocket消息
- `join_room` - 加入聊天房间
- `leave_room` - 离开聊天房间
- `chat_message` - 发送聊天消息
- `new_message` - 接收新消息（服务端推送）

## 🐛 故障排除

### 问题1: 端口被占用
**解决方案**: 修改端口号（见配置部分）

### 问题2: 依赖安装失败
**解决方案**: 
```bash
# 清除缓存
npm cache clean --force
# 重新安装
npm install
```

### 问题3: 数据库错误
**解决方案**: 删除 `data/learning.db` 文件后重启服务器（会重新初始化）

### 问题4: WebSocket连接失败
**解决方案**: 
- 检查浏览器控制台错误
- 确认服务器正常运行
- 检查防火墙设置

## 📄 许可证

本项目仅供学习交流使用。

## 🤝 贡献

欢迎提出建议和改进方案！

## 📞 支持

如有问题，请查看 `部署说明.md` 获取更详细的文档。

---

**享受学习的乐趣！** 🎉
