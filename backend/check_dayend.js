const { poolPromise } = require('./config/db');
const sql = require('mssql');

(async () => {
  try {
    const pool = await poolPromise;

    // 1. Check SettlementHeader columns
    const shCols = await pool.request().query(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'SettlementHeader' ORDER BY ORDINAL_POSITION"
    );
    console.log('SettlementHeader columns:', shCols.recordset.map(r => r.COLUMN_NAME));

    // 2. Try running the actual day-end query directly
    const start = '2026-07-30';
    const end = '2026-07-30';

    const res = await pool.request()
      .input("startDate", sql.VarChar, start)
      .input("endDate", sql.VarChar, end)
      .query(`
        SELECT 
          SUM(CAST(ISNULL(d.Quantity, 0) AS DECIMAL(18,2))) as VoidQty,
          SUM(CAST(ISNULL(d.Quantity, 0) * ISNULL(d.PricePerUnit, 0) AS DECIMAL(18, 2))) as VoidAmount
        FROM (
          SELECT Quantity, PricePerUnit, START_DATE, CreatedOn FROM RestaurantOrderDetailCur WHERE StatusCode = 0
          UNION ALL
          SELECT Quantity, PricePerUnit, START_DATE, CreatedOn FROM RestaurantOrderDetail WHERE StatusCode = 0
        ) d
        WHERE CAST(ISNULL(d.START_DATE, CAST(d.CreatedOn AS DATE)) AS DATE) >= CAST(@startDate AS DATE)
          AND CAST(ISNULL(d.START_DATE, CAST(d.CreatedOn AS DATE)) AS DATE) <= CAST(@endDate AS DATE)
      `);
    console.log('Void Query Result:', res.recordset);

    process.exit(0);
  } catch (e) {
    console.error('ERROR:', e.message);
    process.exit(1);
  }
})();
