const { poolPromise } = require('./config/db');

(async () => {
  try {
    const pool = await poolPromise;

    console.log("Cleaning up unwanted printers from PrintMaster...");

    // Delete specific test and empty IP printers
    const result1 = await pool.request().query(`
      DELETE FROM PrintMaster 
      WHERE PrinterName IN ('23443232', 'test', '34565667')
         OR (PrinterPath = '' AND KitchenTypeValue IN (8790, 8791, 8792))
         OR PrinterPath = '192.168.10.197'
    `);

    console.log(`✅ Deleted ${result1.rowsAffected[0]} unwanted printer entries.`);

    // List remaining active ones
    const list = await pool.request().query('SELECT PrinterId, PrinterName, PrinterPath, PrinterType, KitchenTypeValue, IsActive FROM PrintMaster');
    console.log("Remaining printers in PrintMaster:");
    console.log(JSON.stringify(list.recordset, null, 2));

    process.exit(0);
  } catch (err) {
    console.error('❌ Cleanup failed:', err.message);
    process.exit(1);
  }
})();
