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

    const delta_kh = Math.max(0, target_kh - current_kh);
    const delta_ca = Math.max(0, target_ca - current_ca);
    const delta_mg = Math.max(0, target_mg - current_mg);

    const kh_ml = delta_kh / 0.036 * (TANK_VOLUME / 100);
    const ca_ml = delta_ca * (TANK_VOLUME / 100);
    const mg_ml = delta_mg * (TANK_VOLUME / 100);

    const task = await db.Task.create({
      task_id: Date.now().toString(),
      kh: kh_ml,
      ca: ca_ml,
      mg: mg_ml
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
    }

    res.json({ code: 0 });

  } catch (err) {
    console.error(err);
    res.json({ code: -1 });
  }
});

const PORT = process.env.PORT || 80;

app.listen(PORT, () => {
  console.log('启动成功', PORT);
});