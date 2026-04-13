const { Sequelize, DataTypes } = require("sequelize");

const {
  MYSQL_USERNAME,
  MYSQL_PASSWORD,
  MYSQL_ADDRESS = ""
} = process.env;

const [host, port] = MYSQL_ADDRESS.split(":");

const sequelize = new Sequelize("nodejs_demo", MYSQL_USERNAME, MYSQL_PASSWORD, {
  host,
  port,
  dialect: "mysql",
  logging: false,
  timezone: "+08:00"
});

// ============================
// 实时数据
// ============================
const DeviceStatus = sequelize.define("device_status", {
  temp: DataTypes.FLOAT,
  ph: DataTypes.FLOAT
});

// ============================
// 历史数据
// ============================
const DeviceHistory = sequelize.define("device_history", {
  temp: DataTypes.FLOAT,
  ph: DataTypes.FLOAT
});

// ============================
// 任务表
// ============================
const Task = sequelize.define("task", {
  task_id: DataTypes.STRING,

  kh: DataTypes.FLOAT,
  ca: DataTypes.FLOAT,
  mg: DataTypes.FLOAT,

  status: {
    type: DataTypes.STRING,
    defaultValue: "pending" // pending / done
  }
});

// ============================
// 执行日志
// ============================
const TaskLog = sequelize.define("task_log", {
  task_id: DataTypes.STRING,
  kh: DataTypes.FLOAT,
  ca: DataTypes.FLOAT,
  mg: DataTypes.FLOAT,
  ph: DataTypes.FLOAT,
  temp: DataTypes.FLOAT
});

// ============================
// 水质记录（人工）
// ============================
const WaterRecord = sequelize.define("water_record", {
  nh3: DataTypes.FLOAT,
  no2: DataTypes.FLOAT,
  no3: DataTypes.FLOAT,
  po4: DataTypes.FLOAT,
  kh: DataTypes.FLOAT,
  ca: DataTypes.FLOAT,
  mg: DataTypes.FLOAT
});

// ============================
// 初始化
// ============================
async function init() {
  await sequelize.authenticate();
  console.log("数据库连接成功");

  await sequelize.sync({ force: true });
  console.log("表已初始化");
}

module.exports = {
  init,
  sequelize,

  DeviceStatus,
  DeviceHistory,
  Task,
  TaskLog,
  WaterRecord
};