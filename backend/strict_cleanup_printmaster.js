const { poolPromise } = require('./config/db');

(async () => {
  try {
    const pool = await poolPromise;

    console.log("Cleaning up PrintMaster to keep only specified printers...");

    // Delete everything except:
    // - Receipt Printer (PrinterType = 1)
    // - TakeAway Printer (PrinterType = 3)
    // - KDS Printer (PrinterType = 4)
    // - Kitchen printers (PrinterType = 2) where KitchenTypeValue is 8788 (Entertainment) or 8789 (Liquor)
    const result = await pool.request().query(`
      DELETE FROM PrintMaster 
      WHERE NOT (
        PrinterType IN (1, 3, 4)
        OR (PrinterType = 2 AND KitchenTypeValue IN (8788, 8789))
      )
    `);

    console.log(`✅ Deleted ${result.rowsAffected[0]} unwanted printer entries.`);

    // Fetch and display remaining printers
    const list = await pool.request().query(`
      SELECT PrinterId, PrinterName, PrinterPath, PrinterType, KitchenTypeValue, IsActive 
      FROM PrintMaster
    `);
    console.log("Remaining active printers in PrintMaster:");
    console.log(JSON.stringify(list.recordset, null, 2));

    process.exit(0);
  } catch (err) {
    console.error('❌ Cleanup failed:', err.message);
    process.exit(1);
  }
})();
