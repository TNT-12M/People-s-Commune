const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cookieSession = require('cookie-session');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const db = require('./database');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

// 创建downloads目录（按扩展名分类）
const downloadsDir = path.join(__dirname, 'downloads');
if (!fs.existsSync(downloadsDir)) {
  fs.mkdirSync(downloadsDir, { recursive: true });
}

// 创建uploads目录（用于临时上传和压缩）
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// 获取或创建扩展名文件夹
function getExtensionDir(ext) {
  const extDir = path.join(downloadsDir, ext);
  if (!fs.existsSync(extDir)) {
    fs.mkdirSync(extDir, { recursive: true });
  }
  return extDir;
}

// 获取唯一文件名（处理重复）
function getUniqueFilename(dir, originalname) {
  const ext = path.extname(originalname);
  const nameWithoutExt = path.basename(originalname, ext);
  
  let filename = originalname;
  let counter = 1;
  
  // 检查文件是否已存在
  while (fs.existsSync(path.join(dir, filename))) {
    filename = `${nameWithoutExt}(${counter})${ext}`;
    counter++;
  }
  
  return filename;
}

// 安全文件名处理（防止中文乱码）
function sanitizeFilename(filename) {
  // Windows下需要特殊处理中文编码
  try {
    const iconv = require('iconv-lite');
    
    // 尝试检测并转换编码
    let buffer;
    
    // 如果已经是UTF-8字符串，直接使用
    if (typeof filename === 'string') {
      // 检查是否包含乱码字符（非ASCII且非中文）
      if (/[^\x00-\x7F\u4e00-\u9fa5]/.test(filename)) {
        // 可能是latin1编码的UTF-8字节序列，重新解码
        buffer = Buffer.from(filename, 'latin1');
        return iconv.decode(buffer, 'utf8');
      }
      // 正常的UTF-8字符串
      return filename;
    }
    
    return filename;
  } catch (e) {
    console.error('文件名编码处理失败:', e.message);
    return filename;
  }
}

// 配置multer存储（上传到downloads分类目录）
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase() || '.unknown';
    const extDir = getExtensionDir(ext);
    console.log('=== Multer Destination ===');
    console.log('原始文件名:', file.originalname);
    console.log('扩展名:', ext);
    console.log('存储目录:', extDir);
    cb(null, extDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase() || '.unknown';
    const extDir = getExtensionDir(ext);
    // 处理中文文件名，避免乱码
    const originalName = sanitizeFilename(file.originalname);
    const uniqueFilename = getUniqueFilename(extDir, originalName);
    console.log('=== Multer Filename ===');
    console.log('原始文件名:', file.originalname);
    console.log('处理后文件名:', uniqueFilename);
    console.log('完整路径:', path.join(extDir, uniqueFilename));
    cb(null, uniqueFilename);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 500 * 1024 * 1024 // 500MB限制
  }
});

// 会话配置 - 使用cookie-session，数据存储在客户端cookie中
app.use(cookieSession({
  name: 'session',
  keys: ['learning-website-secret-key-2026'],
  maxAge: 24 * 60 * 60 * 1000 // 24小时
}));

// 中间件
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
// 上传文件服务（保留旧路径兼容）
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
// 下载文件服务（按扩展名分类）
app.use('/downloads', express.static(path.join(__dirname, 'downloads')));

// 根路径路由
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// WebSocket房间管理
const rooms = new Map(); // roomKey -> Set of WebSocket connections
const onlineUsers = new Map(); // userId -> WebSocket

function updateOnlineCount(roomKey) {
  const room = rooms.get(roomKey);
  const count = room ? room.size : 0;
  
  let level, subject;
  
  // 闲聊室的特殊处理
  if (roomKey === '闲聊室') {
    level = '闲聊室';
    subject = '闲聊室';
  } else {
    // 解析roomKey获取level和subject（新格式：level_subject）
    const parts = roomKey.split('_');
    level = parts[0];
    subject = parts.slice(1).join('_'); // 支持学科名包含下划线
  }
  
  const message = JSON.stringify({
    type: 'online_count',
    data: { 
      count,
      roomKey,
      level,
      subject
    }
  });
  
  // 广播给所有连接的客户端（确保所有设备都能收到更新）
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

function joinRoom(ws, grade, subject, level) {
  // 闲聊室的特殊处理：房间Key就是'闲聊室'
  let roomKey;
  if (subject === '闲聊室') {
    roomKey = '闲聊室';
  } else {
    // 普通学科房间：level_subject（打通年级屏障）
    roomKey = `${level}_${subject}`;
  }
  
  // 离开之前的房间
  if (ws.currentRoom) {
    leaveRoom(ws);
  }
  
  if (!rooms.has(roomKey)) {
    rooms.set(roomKey, new Set());
  }
  rooms.get(roomKey).add(ws);
  ws.currentRoom = roomKey;
  console.log(`用户加入房间: ${roomKey}, 当前人数: ${rooms.get(roomKey).size}`);
  
  // 更新在线人数
  updateOnlineCount(roomKey);
}

function leaveRoom(ws) {
  if (ws.currentRoom && rooms.has(ws.currentRoom)) {
    const roomKey = ws.currentRoom;
    rooms.get(roomKey).delete(ws);
    console.log(`用户离开房间: ${roomKey}, 剩余人数: ${rooms.get(roomKey).size}`);
    ws.currentRoom = null;
    
    // 更新在线人数
    updateOnlineCount(roomKey);
  }
}

function broadcastToRoom(roomKey, message, excludeWs = null) {
  const room = rooms.get(roomKey);
  console.log(`广播消息到房间 ${roomKey}, 房间内人数: ${room ? room.size : 0}`);
  
  if (room) {
    let sentCount = 0;
    room.forEach(client => {
      if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(message));
        sentCount++;
      }
    });
    console.log(`成功发送给 ${sentCount} 个客户端`);
  } else {
    console.log(`房间 ${roomKey} 不存在`);
  }
}

// WebSocket连接处理
wss.on('connection', (ws, req) => {
  console.log('新的WebSocket连接');
  
  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', async (data) => {
    try {
      console.log('收到WebSocket原始消息:', data.toString().substring(0, 200));
      const message = JSON.parse(data);
      console.log('解析后的消息类型:', message.type);
      
      if (message.type === 'join_room') {
        // 加入聊天房间
        const { grade, subject, userId, level } = message.data;
        
        console.log('收到join_room消息:', { grade, subject, level, userId });
        
        joinRoom(ws, grade, subject, level);
        ws.userId = userId;
        
        // 发送确认消息
        ws.send(JSON.stringify({
          type: 'room_joined',
          data: { grade, subject, level }
        }));
      } else if (message.type === 'chat_message') {
        console.log('开始处理聊天消息');
        // 处理聊天消息
        const { grade, subject, content, userId, level, quoteMessage, imagePath, filePath, filename, fileType, extension, hasIcon } = message.data;
        
        console.log('消息内容:', { grade, subject, level, content, userId });
        
        if (!content || content.trim() === '') {
          console.log('内容为空，忽略');
          return;
        }
        
        // 获取用户信息
        console.log('获取用户信息, userId:', userId);
        const user = await db.getUserById(userId);
        if (!user) {
          console.log('用户不存在，关闭连接');
          // 直接关闭WebSocket连接
          ws.send(JSON.stringify({
            type: 'user_not_found',
            data: { message: '用户不存在，请重新登录' }
          }));
          // 延迟100ms后关闭连接，确保消息发送成功
          setTimeout(() => {
            ws.close(4001, 'User not found');
          }, 100);
          return;
        }
        console.log('用户信息:', user);
        
        // 构建消息数据，包含图片和文件信息
        const messageData = {
          content: content,
          imagePath: imagePath || null,
          filePath: filePath || null,
          filename: filename || null,
          fileType: fileType || null,
          extension: extension || null,
          hasIcon: hasIcon || false
        };
        
        console.log('准备保存消息到数据库');
        // 保存消息到数据库（包含引用信息）
        const messageId = await db.saveMessageWithQuote(userId, grade, subject, JSON.stringify(messageData), quoteMessage, level);
        console.log('消息保存成功, ID:', messageId);
        
        // 构建广播消息
        const broadcastMsg = {
          type: 'new_message',
          data: {
            id: messageId,
            userId: userId,
            nickname: user.nickname,
            grade: grade,
            subject: subject,
            level: level,
            content: content,
            imagePath: imagePath || null,
            filePath: filePath || null,
            filename: filename || null,
            fileType: fileType || null,
            extension: extension || null,
            hasIcon: hasIcon || false,
            createdAt: new Date().toISOString()
          }
        };
        
        console.log('准备广播消息');
        // 如果有引用，添加引用信息
        if (quoteMessage) {
          broadcastMsg.data.quoteMessage = quoteMessage;
        }
        
        // 广播给房间内所有用户
        let roomKey;
        if (subject === '闲聊室') {
          roomKey = '闲聊室';
        } else {
          roomKey = `${level}_${subject}`;
        }
        console.log('广播到房间:', roomKey);
        broadcastToRoom(roomKey, broadcastMsg);
        console.log('广播完成');
      } else if (message.type === 'leave_room') {
        leaveRoom(ws);
      }
    } catch (error) {
      console.error('WebSocket消息处理错误:', error);
    }
  });

  ws.on('close', () => {
    console.log('WebSocket连接关闭');
    leaveRoom(ws);
  });

  ws.on('error', (error) => {
    console.error('WebSocket错误:', error);
    leaveRoom(ws);
  });
});

// 心跳检测
const interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      leaveRoom(ws);
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', () => {
  clearInterval(interval);
});

// API路由

// 用户注册
app.post('/api/register', async (req, res) => {
  try {
    const { nickname } = req.body;
    
    if (!nickname || nickname.trim() === '') {
      return res.status(400).json({ success: false, message: '昵称不能为空' });
    }
    
    if (nickname.length > 20) {
      return res.status(400).json({ success: false, message: '昵称不能超过20个字符' });
    }
    
    const user = await db.createUser(nickname.trim());
    req.session.userId = user.id;
    req.session.nickname = user.nickname;
    
    res.json({ success: true, user: { id: user.id, nickname: user.nickname } });
  } catch (error) {
    // 昵称重复是预期的业务错误，使用warn级别
    if (error.message === '昵称已被使用') {
      console.warn('注册警告:', error.message);
    } else {
      console.error('注册错误:', error);
    }
    res.status(400).json({ success: false, message: error.message });
  }
});

// 用户登录
app.post('/api/login', async (req, res) => {
  try {
    const { nickname } = req.body;
    
    if (!nickname || nickname.trim() === '') {
      return res.status(400).json({ success: false, message: '昵称不能为空' });
    }
    
    const user = await db.getUserByNickname(nickname.trim());
    
    if (!user) {
      return res.status(404).json({ success: false, message: '用户不存在，请先注册' });
    }
    
    req.session.userId = user.id;
    req.session.nickname = user.nickname;
    
    res.json({ success: true, user: { id: user.id, nickname: user.nickname, grade: user.grade } });
  } catch (error) {
    console.error('登录错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 用户登出
app.post('/api/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ success: false, message: '登出失败' });
    }
    res.json({ success: true });
  });
});

// 获取当前用户信息
app.get('/api/user', async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ success: false, message: '未登录' });
  }
  
  // 从数据库查询用户是否存在
  try {
    const user = await db.getUserById(req.session.userId);
    if (!user) {
      // 用户不存在，清除session
      req.session = null;
      return res.status(401).json({ success: false, message: '用户不存在' });
    }
    
    res.json({
      success: true,
      user: {
        id: user.id,
        nickname: user.nickname,
        grade: user.grade
      }
    });
  } catch (error) {
    console.error('获取用户信息错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 更新用户年级
app.post('/api/user/grade', async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ success: false, message: '未登录' });
  }
  
  try {
    const { grade } = req.body;
    await db.updateUserGrade(req.session.userId, grade);
    res.json({ success: true });
  } catch (error) {
    console.error('更新年级错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 文件上传接口
app.post('/api/upload', upload.single('file'), async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ success: false, message: '未登录' });
  }
  
  if (!req.file) {
    return res.status(400).json({ success: false, message: '没有上传文件' });
  }
  
  try {
    const file = req.file;
    const isImage = file.mimetype.startsWith('image/');
    const ext = path.extname(file.originalname).toLowerCase() || '.unknown';
    const extDir = getExtensionDir(ext);
    
    // 如果是图片且不是GIF，进行压缩
    if (isImage && !file.mimetype.includes('gif')) {
      console.log('开始压缩图片:', file.originalname);
      const compressedPath = file.path + '.compressed.jpg';
      
      try {
        await sharp(file.path)
          .resize(1920, 1080, { // 最大尺寸1920x1080
            fit: 'inside',
            withoutEnlargement: true
          })
          .jpeg({
            quality: 75, // 压缩质量75%
            progressive: true // 渐进式JPEG
          })
          .toFile(compressedPath);
        
        // 等待一小段时间确保文件释放
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // 删除原图
        try {
          fs.unlinkSync(file.path);
        } catch (unlinkError) {
          console.warn('删除原图失败，尝试直接重命名压缩文件:', unlinkError.message);
        }
        
        // 重命名压缩后的文件为原文件名
        try {
          fs.renameSync(compressedPath, file.path);
        } catch (renameError) {
          console.error('重命名失败:', renameError.message);
          // 如果重命名失败，使用压缩后的文件路径
          file.path = compressedPath;
        }
        
        const newSize = fs.statSync(file.path).size;
        const compressionRatio = ((file.size - newSize) / file.size * 100).toFixed(2);
        console.log(`图片压缩完成: ${file.size} -> ${newSize} bytes (减少${compressionRatio}%)`);
      } catch (compressError) {
        console.error('压缩过程出错:', compressError.message);
        // 清理压缩文件
        try {
          if (fs.existsSync(compressedPath)) {
            fs.unlinkSync(compressedPath);
          }
        } catch (e) {}
        // 继续使用原图
      }
    } else if (isImage && file.mimetype.includes('gif')) {
      console.log('GIF图片不压缩，保持原样:', file.originalname);
    }
    
    // 检查扩展名文件夹中是否有icon.png
    const iconPath = path.join(extDir, 'icon.png');
    const hasIcon = fs.existsSync(iconPath);
    
    // 返回文件信息
    res.json({
      success: true,
      file: {
        filename: file.filename,
        originalname: file.originalname,
        path: `/downloads/${ext}/${file.filename}`,
        size: isImage && !file.mimetype.includes('gif') ? fs.statSync(file.path).size : file.size,
        mimetype: file.mimetype,
        extension: ext,
        hasIcon: hasIcon
      }
    });
  } catch (error) {
    console.error('图片压缩失败:', error);
    // 如果压缩失败，仍然返回原图
    const file = req.file;
    const ext = path.extname(file.originalname).toLowerCase() || '.unknown';
    const extDir = getExtensionDir(ext);
    const iconPath = path.join(extDir, 'icon.png');
    const hasIcon = fs.existsSync(iconPath);
    
    res.json({
      success: true,
      file: {
        filename: file.filename,
        originalname: file.originalname,
        path: `/downloads/${ext}/${file.filename}`,
        size: file.size,
        mimetype: file.mimetype,
        extension: ext,
        hasIcon: hasIcon
      }
    });
  }
});

// 获取所有年级
app.get('/api/grades', async (req, res) => {
  try {
    const grades = await db.getAllGrades();
    res.json({ success: true, grades });
  } catch (error) {
    console.error('获取年级列表错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 获取指定年级的学科
app.get('/api/subjects/:gradeId', async (req, res) => {
  try {
    const gradeId = parseInt(req.params.gradeId);
    const subjects = await db.getSubjectsByGrade(gradeId);
    
    // 获取年级名称和学制
    const grade = await db.getGradeById(gradeId);
    const gradeName = grade ? grade.name : '';
    const level = grade ? grade.level : '';
    
    // 为每个学科添加在线人数
    const subjectsWithOnline = subjects.map(subject => {
      const subjectName = typeof subject === 'object' ? subject.name : subject;
      const roomKey = `${level}_${gradeName}_${subjectName}`;
      const onlineCount = rooms.has(roomKey) ? rooms.get(roomKey).size : 0;
      return {
        name: subjectName,
        onlineCount: onlineCount
      };
    });
    
    res.json({ success: true, subjects: subjectsWithOnline });
  } catch (error) {
    console.error('获取学科列表错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 获取聊天记录
app.get('/api/messages/:level/:grade/:subject', async (req, res) => {
  try {
    const { level, grade, subject } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    
    console.log('获取消息:', { level, grade, subject, limit, offset });
    
    const messages = await db.getMessages(grade, subject, limit, offset, level);
    res.json({ success: true, messages });
  } catch (error) {
    console.error('获取消息错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 启动服务器
async function startServer() {
  try {
    // 初始化数据库
    await db.initDatabase();
    
    // 启动HTTP服务器
    server.listen(PORT, () => {
      console.log(`学习网站服务器运行在 http://localhost:${PORT}`);
      console.log('按 Ctrl+C 停止服务器');
    });
  } catch (error) {
    console.error('服务器启动失败:', error);
    process.exit(1);
  }
}

startServer();
