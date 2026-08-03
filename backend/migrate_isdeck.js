const { poolPromise } = require('./config/db');

(async () => {
  try {
    const pool = await poolPromise;

    // Check if column already exists
    const check = await pool.request().query(
      "SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'DishMaster' AND COLUMN_NAME = 'IsDeck'"
    );

    if (check.recordset[0].cnt > 0) {
      console.log('✅ IsDeck column already exists — no migration needed.');
    } else {
      await pool.request().query(
        'ALTER TABLE DishMaster ADD IsDeck BIT NOT NULL DEFAULT 0'
      );
      console.log('✅ IsDeck column added to DishMaster successfully.');
    }

    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  }
})();
