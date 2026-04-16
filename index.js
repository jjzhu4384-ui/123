const express = require('express');
const bodyParser = require('body-parser');
const { Op } = require('sequelize');
const db = require('./db');

const app = express();
app.use(bodyParser.json());

db.init();

// ============================
// 水体体积（自己改）
// ============================
const TANK_VOLUME = 150;

// ============================
// 首页
// ============================
app.get('/', (req, res) => {
  res.send('Aquarium API Running ✅');
});

// ============================
// ✅ 实时状态（小程序用）
// ============================
app.get('/status', async (req, res) => {
  try {
    const data = await db.DeviceStatus.findOne();

    if (!data) {
      return res.json({ code: -1, msg: '暂无数据' });
    }

    res.json({
      code: 0,
      data: {
        temp: data.temp,
        ph: data.ph,
        time: data.updatedAt
      }
    });

  } catch (err) {
    console.error(err);
    res.json({ code: -1 });
  }
});

// ============================
// 水质录入
// ============================
app.post('/water', async (req, res) => {
  try {
    const { nh3, no2, no3, po4, kh, ca, mg } = req.body;

    await db.WaterRecord.create({
      nh3, no2, no3, po4, kh, ca, mg
    });

    res.json({ code: 0 });

  } catch (err) {
    console.error(err);
    res.json({ code: -1 });
  }
});

// ============================
// 创建滴定任务（自动计算ml）
// ============================
app.post('/task', async (req, res) => {
  try {
    const {
      current_kh, target_kh,
      current_ca, target_ca,
      current_mg, target_mg
    } = req.body;

    const c_kh = Number(current_kh) || 0;
    const t_kh = Number(target_kh) || 0;
    const c_ca = Number(current_ca) || 0;
    const t_ca = Number(target_ca) || 0;
    const c_mg = Number(current_mg) || 0;
    const t_mg = Number(target_mg) || 0;

    // ✅ 用转换后的变量
    const delta_kh = Math.max(0, t_kh - c_kh);
    const delta_ca = Math.max(0, t_ca - c_ca);
    const delta_mg = Math.max(0, t_mg - c_mg);

    console.log({ c_kh, t_kh, delta_kh });

    const kh_ml = delta_kh
      ? +(delta_kh / 0.036 * (TANK_VOLUME / 100)).toFixed(2)
      : 0;

    const ca_ml = delta_ca
      ? +(delta_ca * (TANK_VOLUME / 100)).toFixed(2)
      : 0;

    const mg_ml = delta_mg
      ? +(delta_mg * (TANK_VOLUME / 100)).toFixed(2)
      : 0;

    const task = await db.Task.create({
      task_id: Date.now().toString(),
      kh: kh_ml,
      ca: ca_ml,
      mg: mg_ml,
      status: 'pending'
    });

    res.json({
      code: 0,
      data: { kh_ml, ca_ml, mg_ml }
    });

  } catch (err) {
    console.error(err);
    res.json({ code: -1 });
  }
});

// ============================
// 获取任务（ESP32）
// ============================
app.get('/task', async (req, res) => {
  const task = await db.Task.findOne({
    where: { status: 'pending' },
    order: [['createdAt', 'ASC']]
  });

  if (!task) return res.json({});

  res.json({
    id: task.task_id,
    kh: task.kh,
    ca: task.ca,
    mg: task.mg
  });
});

// ============================
// 上传执行结果（ESP32）
// ============================
app.post('/upload', async (req, res) => {
  try {
    const { task_id, kh, ca, mg, ph, temp } = req.body;

    await db.TaskLog.create({
      task_id,
      kh,
      ca,
      mg,
      ph,
      temp
    });

    await db.Task.update(
      { status: 'done' },
      { where: { task_id } }
    );

    res.json({ code: 0 });

  } catch (err) {
    console.error(err);
    res.json({ code: -1 });
  }
});

// ============================
// 实时数据（ESP32上传）
// ============================
let lastSaveTime = 0;

app.post('/realtime', async (req, res) => {
  try {
    const { temp, ph } = req.body;

    const exist = await db.DeviceStatus.findOne();

    if (exist) {
      await exist.update({ temp, ph });
    } else {
      await db.DeviceStatus.create({ temp, ph });
    }

    const now = Date.now();

    if (now - lastSaveTime > 5 * 60 * 1000) {
      lastSaveTime = now;

      await db.DeviceHistory.create({ temp, ph });

      // ✅ 新增：删除24小时前的数据
      const expireTime = new Date(Date.now() - 24 * 60 * 60 * 1000);

      await db.DeviceHistory.destroy({
        where: {
          createdAt: {
            [Op.lt]: expireTime
          }
        }
      });
    }

    res.json({ code: 0 });

  } catch (err) {
    console.error(err);
    res.json({ code: -1 });
  }
});

//曲线图接口
app.get("/history", async (req, res) => {
  try {
    const now = new Date();
    const before24h = now.getTime() - 24 * 60 * 60 * 1000;

    // ===== 温度 PH =====
    const tempList = await db.DeviceHistory.findAll({
      where: { createdAt: { [Op.gt]: before24h } },
      order: [["createdAt", "ASC"]]
    });

    const tempPh = { time: [], temp: [], ph: [] };

    tempList.forEach(item => {
      const t = new Date(item.createdAt);
      const label = `${t.getHours()}:${String(t.getMinutes()).padStart(2, "0")}`;

      tempPh.time.push(label);
      tempPh.temp.push(item.temp);
      tempPh.ph.push(item.ph);
    });

    // ===== KH CA MG（来自水质 + 执行日志）=====
    const waterList = await db.WaterRecord.findAll({
      order: [["createdAt", "ASC"]],
      limit: 30
    });

    const logList = await db.TaskLog.findAll({
      order: [["createdAt", "ASC"]],
      limit: 30
    });

    const kh = { time: [], value: [], dose: [] };
    const ca = { time: [], value: [], dose: [] };
    const mg = { time: [], value: [], dose: [] };

    // 👉 水质值
    waterList.forEach(item => {
      const t = new Date(item.createdAt);
      const label = `${t.getDate()}号`;

      kh.time.push(label);
      kh.value.push(item.kh);
      kh.dose.push(0);

      ca.time.push(label);
      ca.value.push(item.ca);
      ca.dose.push(0);

      mg.time.push(label);
      mg.value.push(item.mg);
      mg.dose.push(0);
    });

    // 👉 滴定执行记录（叠加 dose）
    logList.forEach(item => {
      const t = new Date(item.createdAt);
      const label = `${t.getDate()}号`;

      kh.time.push(label);
      kh.value.push(item.kh);
      kh.dose.push(item.kh);

      ca.time.push(label);
      ca.value.push(item.ca);
      ca.dose.push(item.ca);

      mg.time.push(label);
      mg.value.push(item.mg);
      mg.dose.push(item.mg);
    });

    // ===== 营养盐 =====
    const nutrients = {
      time: [],
      nh3: [],
      no2: [],
      no3: [],
      po4: []
    };

    waterList.forEach(item => {
      const t = new Date(item.createdAt);
      const label = `${t.getDate()}号`;

      nutrients.time.push(label);
      nutrients.nh3.push(item.nh3);
      nutrients.no2.push(item.no2);
      nutrients.no3.push(item.no3);
      nutrients.po4.push(item.po4);
    });

    res.json({
      tempPh,
      kh,
      ca,
      mg,
      nutrients
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "history error" });
  }
});
const PORT = process.env.PORT || 80;

app.listen(PORT, () => {
  console.log('启动成功', PORT);
});