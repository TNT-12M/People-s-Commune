const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data', 'learning.db');

let SQL;
let db;

async function initDatabase() {
  try {
    // 初始化sql.js
    SQL = await initSqlJs();
    
    // 尝试加载现有数据库
    if (fs.existsSync(DB_PATH)) {
      const fileBuffer = fs.readFileSync(DB_PATH);
      db = new SQL.Database(fileBuffer);
      console.log('数据库加载成功');
    } else {
      db = new SQL.Database();
      console.log('创建新数据库');
    }
    
    // 创建表
    createTables();
    
    // 初始化数据
    initializeData();
    
    // 保存数据库
    saveDatabase();
    
    console.log('数据库初始化完成');
    return Promise.resolve(db);
  } catch (err) {
    console.error('数据库初始化失败:', err);
    return Promise.reject(err);
  }
}

function createTables() {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nickname TEXT UNIQUE NOT NULL,
      avatar TEXT,
      grade TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      grade TEXT NOT NULL,
      subject TEXT NOT NULL,
      level TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL,
      quote_message TEXT,  -- 存储引用信息的JSON
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS grades (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      level TEXT NOT NULL,
      sort_order INTEGER NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS subjects (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      grade_id INTEGER NOT NULL,
      FOREIGN KEY (grade_id) REFERENCES grades(id)
    )
  `);
  
  console.log('数据表创建完成');
}

function initializeData() {
  // 检查是否已有数据
  const result = db.exec('SELECT COUNT(*) as count FROM grades');
  
  if (result.length > 0 && result[0].values[0][0] > 0) {
    console.log('数据已存在，跳过初始化');
    return;
  }

  console.log('开始初始化年级和学科数据...');
  
  let gradeId = 1;
  let subjectId = 1;

  // 小学1-6年级
  const primarySubjects = ['语文', '数学', '英语'];

  for (let i = 1; i <= 6; i++) {
    db.run('INSERT INTO grades (id, name, level, sort_order) VALUES (?, ?, ?, ?)', 
      [gradeId, `${i}年级`, '小学', i]);
    
    primarySubjects.forEach(subjName => {
      db.run('INSERT INTO subjects (id, name, grade_id) VALUES (?, ?, ?)', 
        [subjectId++, subjName, gradeId]);
    });
    
    gradeId++;
  }

  // 初中1-3年级
  const middleSubjects = ['语文', '数学', '英语', '物理', '化学', '生物', '历史', '地理', '政治'];

  for (let i = 1; i <= 3; i++) {
    db.run('INSERT INTO grades (id, name, level, sort_order) VALUES (?, ?, ?, ?)', 
      [gradeId, `${i}年级`, '初中', 6 + i]);
    
    middleSubjects.forEach(subjName => {
      db.run('INSERT INTO subjects (id, name, grade_id) VALUES (?, ?, ?)', 
        [subjectId++, subjName, gradeId]);
    });
    
    gradeId++;
  }

  // 高中1-3年级
  const highSubjects = ['语文', '数学', '英语', '物理', '化学', '生物', '历史', '地理', '政治'];

  for (let i = 1; i <= 3; i++) {
    db.run('INSERT INTO grades (id, name, level, sort_order) VALUES (?, ?, ?, ?)', 
      [gradeId, `${i}年级`, '高中', 9 + i]);
    
    highSubjects.forEach(subjName => {
      db.run('INSERT INTO subjects (id, name, grade_id) VALUES (?, ?, ?)', 
        [subjectId++, subjName, gradeId]);
    });
    
    gradeId++;
  }

  console.log('年级和学科数据初始化完成');
}

// 保存数据库到文件
function saveDatabase() {
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  } catch (err) {
    console.error('保存数据库失败:', err);
  }
}

// 用户相关操作
function createUser(nickname, avatar = null) {
  try {
    db.run('INSERT INTO users (nickname, avatar) VALUES (?, ?)', [nickname, avatar]);
    const result = db.exec('SELECT last_insert_rowid() as id');
    const id = result[0].values[0][0];
    saveDatabase();
    console.log('创建用户:', nickname, 'ID:', id);
    return Promise.resolve({ id, nickname, avatar });
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed')) {
      return Promise.reject(new Error('昵称已被使用'));
    }
    console.error('创建用户失败:', err);
    return Promise.reject(err);
  }
}

function getUserByNickname(nickname) {
  try {
    const result = db.exec(`SELECT * FROM users WHERE nickname = '${nickname.replace(/'/g, "''")}'`);
    if (result.length === 0 || result[0].values.length === 0) {
      return Promise.resolve(undefined);
    }
    
    const columns = result[0].columns;
    const values = result[0].values[0];
    const row = {};
    columns.forEach((col, idx) => {
      row[col] = values[idx];
    });
    
    return Promise.resolve(row);
  } catch (err) {
    return Promise.reject(err);
  }
}

function getUserById(id) {
  try {
    const result = db.exec(`SELECT * FROM users WHERE id = ${id}`);
    if (result.length === 0 || result[0].values.length === 0) {
      return Promise.resolve(undefined);
    }
    
    const columns = result[0].columns;
    const values = result[0].values[0];
    const row = {};
    columns.forEach((col, idx) => {
      row[col] = values[idx];
    });
    
    return Promise.resolve(row);
  } catch (err) {
    return Promise.reject(err);
  }
}

function updateUserGrade(userId, grade) {
  try {
    db.run('UPDATE users SET grade = ? WHERE id = ?', [grade, userId]);
    saveDatabase();
    return Promise.resolve(true);
  } catch (err) {
    return Promise.reject(err);
  }
}

// 消息相关操作
function saveMessage(userId, grade, subject, content, level = '') {
  try {
    // 使用本地时间而不是UTC时间
    const now = new Date();
    const localTime = now.getFullYear() + '-' + 
      String(now.getMonth() + 1).padStart(2, '0') + '-' + 
      String(now.getDate()).padStart(2, '0') + ' ' + 
      String(now.getHours()).padStart(2, '0') + ':' + 
      String(now.getMinutes()).padStart(2, '0') + ':' + 
      String(now.getSeconds()).padStart(2, '0');
    
    db.run('INSERT INTO messages (user_id, grade, subject, level, content, created_at) VALUES (?, ?, ?, ?, ?, ?)', 
      [userId, grade, subject, level, content, localTime]);
    const result = db.exec('SELECT last_insert_rowid() as id');
    const id = result[0].values[0][0];
    saveDatabase();
    return Promise.resolve(id);
  } catch (err) {
    return Promise.reject(err);
  }
}

// 保存消息（包含引用信息）
function saveMessageWithQuote(userId, grade, subject, content, quoteMessage, level = '') {
  try {
    const quoteJson = quoteMessage ? JSON.stringify(quoteMessage) : null;
    // 使用本地时间而不是UTC时间
    const now = new Date();
    const localTime = now.getFullYear() + '-' + 
      String(now.getMonth() + 1).padStart(2, '0') + '-' + 
      String(now.getDate()).padStart(2, '0') + ' ' + 
      String(now.getHours()).padStart(2, '0') + ':' + 
      String(now.getMinutes()).padStart(2, '0') + ':' + 
      String(now.getSeconds()).padStart(2, '0');
    
    db.run('INSERT INTO messages (user_id, grade, subject, level, content, quote_message, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', 
      [userId, grade, subject, level, content, quoteJson, localTime]);
    const result = db.exec('SELECT last_insert_rowid() as id');
    const id = result[0].values[0][0];
    saveDatabase();
    return Promise.resolve(id);
  } catch (err) {
    console.error('保存消息失败:', err);
    return Promise.reject(err);
  }
}

function getMessages(grade, subject, limit = 50, offset = 0, level = '') {
  try {
    let query;
    
    // 闲聊室的特殊处理：只按subject查询，不按level和grade过滤
    if (subject === '闲聊室') {
      query = `
        SELECT m.id, m.user_id, m.grade, m.subject, m.content, m.quote_message, m.created_at, u.nickname 
        FROM messages m 
        JOIN users u ON m.user_id = u.id
        WHERE m.subject = '${subject.replace(/'/g, "''")}'
        ORDER BY m.created_at DESC 
        LIMIT ${limit} OFFSET ${offset}
      `;
    } else if (level) {
      // 新逻辑：按level和subject查询（打通年级屏障）
      query = `
        SELECT m.id, m.user_id, m.grade, m.subject, m.content, m.quote_message, m.created_at, u.nickname 
        FROM messages m 
        JOIN users u ON m.user_id = u.id
        WHERE m.subject = '${subject.replace(/'/g, "''")}'
          AND m.level = '${level.replace(/'/g, "''")}'
        ORDER BY m.created_at DESC 
        LIMIT ${limit} OFFSET ${offset}
      `;
    } else {
      // 没有level，只按subject查询（兼容旧逻辑）
      query = `
        SELECT m.id, m.user_id, m.grade, m.subject, m.content, m.quote_message, m.created_at, u.nickname 
        FROM messages m 
        JOIN users u ON m.user_id = u.id 
        WHERE m.subject = '${subject.replace(/'/g, "''")}'
        ORDER BY m.created_at DESC 
        LIMIT ${limit} OFFSET ${offset}
      `;
    }
    
    console.log('SQL查询:', query);
    
    const result = db.exec(query);
    
    console.log('查询结果数量:', result.length > 0 ? result[0].values.length : 0);
    if (result.length > 0 && result[0].values.length > 0) {
      console.log('第一条消息示例:', result[0].values[0]);
    }
    
    if (result.length === 0 || result[0].values.length === 0) {
      return Promise.resolve([]);
    }
    
    const columns = result[0].columns;
    console.log('数据库列名:', columns);
    
    const rows = result[0].values.map(values => {
      const row = {};
      columns.forEach((col, idx) => {
        // 将user_id转换为userId，保持前端一致
        if (col === 'user_id') {
          row['userId'] = values[idx];
        } else if (col === 'created_at') {
          // 将created_at转换为createdAt
          row['createdAt'] = values[idx];
        } else if (col === 'quote_message' && values[idx]) {
          // 解析引用信息JSON
          try {
            row['quoteMessage'] = JSON.parse(values[idx]);
          } catch (e) {
            console.error('解析引用信息失败:', e);
            row['quoteMessage'] = null;
          }
        } else if (col === 'content') {
          // 尝试解析content为JSON（可能包含imagePath等）
          try {
            const contentData = JSON.parse(values[idx]);
            // 如果是对象，只复制非null的字段
            if (typeof contentData === 'object' && contentData !== null) {
              row['content'] = contentData.content || values[idx];
              if (contentData.imagePath) row['imagePath'] = contentData.imagePath;
              if (contentData.filePath) row['filePath'] = contentData.filePath;
              if (contentData.filename) row['filename'] = contentData.filename;
              if (contentData.fileType) row['fileType'] = contentData.fileType;
            } else {
              row['content'] = values[idx];
            }
          } catch (e) {
            // 如果不是JSON，直接使用原始内容
            row['content'] = values[idx];
          }
        } else {
          row[col] = values[idx];
        }
      });
      return row;
    });
    
    console.log('第一条消息示例:', rows[0]);
    
    // 反转数组，使最早的消息在前
    return Promise.resolve(rows.reverse());
  } catch (err) {
    console.error('获取消息失败:', err);
    return Promise.reject(err);
  }
}

// 年级和学科查询
function getAllGrades() {
  try {
    const result = db.exec('SELECT * FROM grades ORDER BY sort_order');
    
    if (result.length === 0 || result[0].values.length === 0) {
      return Promise.resolve([]);
    }
    
    const columns = result[0].columns;
    const rows = result[0].values.map(values => {
      const row = {};
      columns.forEach((col, idx) => {
        row[col] = values[idx];
      });
      return row;
    });
    
    return Promise.resolve(rows);
  } catch (err) {
    return Promise.reject(err);
  }
}

function getSubjectsByGrade(gradeId) {
  try {
    const result = db.exec(`SELECT * FROM subjects WHERE grade_id = ${gradeId}`);
    
    if (result.length === 0 || result[0].values.length === 0) {
      return Promise.resolve([]);
    }
    
    const columns = result[0].columns;
    const rows = result[0].values.map(values => {
      const row = {};
      columns.forEach((col, idx) => {
        row[col] = values[idx];
      });
      return row;
    });
    
    return Promise.resolve(rows);
  } catch (err) {
    return Promise.reject(err);
  }
}

function getGradeById(id) {
  try {
    const result = db.exec(`SELECT * FROM grades WHERE id = ${id}`);
    
    if (result.length === 0 || result[0].values.length === 0) {
      return Promise.resolve(undefined);
    }
    
    const columns = result[0].columns;
    const values = result[0].values[0];
    const row = {};
    columns.forEach((col, idx) => {
      row[col] = values[idx];
    });
    
    return Promise.resolve(row);
  } catch (err) {
    return Promise.reject(err);
  }
}

function getGradeByName(name) {
  try {
    const result = db.exec(`SELECT * FROM grades WHERE name = '${name.replace(/'/g, "''")}'`);
    
    if (result.length === 0 || result[0].values.length === 0) {
      return Promise.resolve(undefined);
    }
    
    const columns = result[0].columns;
    const values = result[0].values[0];
    const row = {};
    columns.forEach((col, idx) => {
      row[col] = values[idx];
    });
    
    return Promise.resolve(row);
  } catch (err) {
    return Promise.reject(err);
  }
}

module.exports = {
  initDatabase,
  createUser,
  getUserByNickname,
  getUserById,
  updateUserGrade,
  saveMessage,
  saveMessageWithQuote,
  getMessages,
  getAllGrades,
  getSubjectsByGrade,
  getGradeById,
  getGradeByName
};
