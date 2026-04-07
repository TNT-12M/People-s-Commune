const initSqlJs = require('sql.js');
const fs = require('fs');

(async () => {
  const SQL = await initSqlJs();
  
  // 加载数据库文件
  if (fs.existsSync('learning.db')) {
    const buf = fs.readFileSync('learning.db');
    const db = new SQL.Database(buf);
    
    // 查询所有年级
    const result = db.exec('SELECT id, name, level FROM grades ORDER BY id');
    
    if (result.length > 0) {
      console.log('=== 所有年级数据 ===');
      const columns = result[0].columns;
      result[0].values.forEach(row => {
        const record = {};
        columns.forEach((col, idx) => {
          record[col] = row[idx];
        });
        console.log(record);
      });
      
      // 特别查看所有"1年级"的记录
      console.log('\n=== 所有1年级记录 ===');
      const grade1Result = db.exec("SELECT id, name, level FROM grades WHERE name = '1年级'");
      if (grade1Result.length > 0) {
        grade1Result[0].values.forEach(row => {
          console.log({ id: row[0], name: row[1], level: row[2] });
        });
      }
    }
  } else {
    console.log('数据库文件不存在');
  }
})();
