
# dsh-cot-smart 观察
# 用法: node watch.js [行数]
# 默认显示最近 30 行路由决策。文件在重启后由插件写入。
const n = process.argv[2] ? parseInt(process.argv[2],10) : 30;
try {
  if(!fs.existsSync(path)){ console.log("日志文件尚不存在:", path, "
提示: 需重启 dsh web 后插件生效才会写入。"); process.exit(0); }
  const lines = fs.readFileSync(path,"utf8").trim().split("
");
  console.log("最近", Math.min(n,lines.length), "行 (共", lines.length, "条决策):");
  console.log("-----");
  lines.slice(-n).forEach(l=>console.log(l));
  console.log("-----");
  console.log("target=off 简单省token | high 中等 | max 超复杂深度");
} catch(e){ console.error("读取失败:", e.message); }
