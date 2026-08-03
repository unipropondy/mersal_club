const { poolPromise, sql } = require("./config/db");

async function run() {
  const pool = await poolPromise;
  const groupId = '79A30579-CB8A-48B1-859D-11BCEC4B7E45'; // Beer group

  try {
    const res = await pool.request().input("DishGroupId", sql.VarChar(50), groupId)
      .query(`
        WITH GroupModifiersCTE AS (
          -- 1. Direct Dish Modifiers for dishes in the group
          SELECT dm.DishId, dm.ModifierId AS ModifierID, m.ModifierCode, m.ModifierName,
                 CASE WHEN m.isPriceAffect = 1 AND m.isDishPrice = 1 THEN ISNULL(m.DishCost, 0) ELSE 0 END AS Price,
                 ISNULL(m.isOpenModifier, 0) AS isOpenModifier,
                 ISNULL(m.SortCode, 0) AS SortCode
          FROM DishModifier dm
          INNER JOIN ModifierMaster m ON dm.ModifierId = m.ModifierId
          INNER JOIN DishMaster d ON dm.DishId = d.DishId
          LEFT JOIN DishGroupMapping dmap ON d.DishId = dmap.DishId
          WHERE (d.DishGroupId = @DishGroupId OR dmap.DishGroupId = @DishGroupId) AND d.IsActive = 1

          UNION

          -- 2. Dish Group Modifiers for dishes in the group
          SELECT d.DishId, dgmod.ModifierId AS ModifierID, m.ModifierCode, m.ModifierName,
                 CASE WHEN m.isPriceAffect = 1 AND m.isDishPrice = 1 THEN ISNULL(m.DishCost, 0) ELSE 0 END AS Price,
                 ISNULL(m.isOpenModifier, 0) AS isOpenModifier,
                 ISNULL(m.SortCode, 0) AS SortCode
          FROM DishMaster d
          INNER JOIN DishGroupModifier dgmod ON d.DishGroupId = dgmod.DishGroupId
          INNER JOIN ModifierMaster m ON dgmod.ModifierId = m.ModifierId
          LEFT JOIN DishGroupMapping dmap ON d.DishId = dmap.DishId
          WHERE (d.DishGroupId = @DishGroupId OR dmap.DishGroupId = @DishGroupId) AND d.IsActive = 1

          UNION

          -- 3. Category Modifiers for dishes in the group
          SELECT d.DishId, cm.ModifierId AS ModifierID, m.ModifierCode, m.ModifierName,
                 CASE WHEN m.isPriceAffect = 1 AND m.isDishPrice = 1 THEN ISNULL(m.DishCost, 0) ELSE 0 END AS Price,
                 ISNULL(m.isOpenModifier, 0) AS isOpenModifier,
                 ISNULL(m.SortCode, 0) AS SortCode
          FROM DishMaster d
          INNER JOIN DishGroupMaster dg ON d.DishGroupId = dg.DishGroupId
          INNER JOIN CategoryModifier cm ON dg.CategoryId = cm.CategoryId
          INNER JOIN ModifierMaster m ON cm.ModifierId = m.ModifierId
          LEFT JOIN DishGroupMapping dmap ON d.DishId = dmap.DishId
          WHERE (d.DishGroupId = @DishGroupId OR dmap.DishGroupId = @DishGroupId) AND d.IsActive = 1
        )
        SELECT
          gm.DishId,
          gm.ModifierID,
          gm.ModifierCode,
          gm.ModifierName,
          gm.Price,
          gm.isOpenModifier,
          gm.SortCode,
          dg.DishGroupId AS ModifierGroupId,
          dg.DishGroupName AS ModifierGroupName,
          0 AS MinSelectionCount,
          0 AS MaxSelectionCount,
          0 AS MultiselectAllow
        FROM GroupModifiersCTE gm
        LEFT JOIN DishGroupModifier dgmr ON gm.ModifierID = dgmr.ModifierId
        LEFT JOIN DishGroupMaster dg ON COALESCE(dgmr.DishGroupId, @DishGroupId) = dg.DishGroupId
        ORDER BY gm.SortCode ASC, gm.ModifierName ASC
      `);

    console.log("=== Group Modifiers Results ===");
    console.log(res.recordset);

  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}
run();
