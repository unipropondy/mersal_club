const { poolPromise } = require('./config/db');

(async () => {
  try {
    const pool = await poolPromise;

    console.log("Looking up CategoryMaster for 'Entertainment'...");
    const categoryResult = await pool.request().query(
      "SELECT CategoryId, CategoryName FROM CategoryMaster WHERE CategoryName LIKE '%Entertainment%'"
    );

    if (categoryResult.recordset.length === 0) {
      console.log("❌ Could not find Category containing 'Entertainment'.");
      process.exit(1);
    }

    const categories = categoryResult.recordset;
    console.log("Found categories:", categories);

    for (const cat of categories) {
      console.log(`Updating dishes under category: ${cat.CategoryName} (${cat.CategoryId})...`);
      
      // Update DishMaster items where the CategoryId of their DishGroup matches the category
      const updateResult = await pool.request()
        .input('CategoryId', cat.CategoryId)
        .query(`
          UPDATE d
          SET d.IsDeck = 1
          FROM DishMaster d
          INNER JOIN DishGroupMaster dg ON d.DishGroupId = dg.DishGroupId
          WHERE dg.CategoryId = @CategoryId
        `);
      
      console.log(`✅ Updated ${updateResult.rowsAffected[0]} dishes in ${cat.CategoryName}.`);
    }

    process.exit(0);
  } catch (err) {
    console.error('❌ Update failed:', err.message);
    process.exit(1);
  }
})();
