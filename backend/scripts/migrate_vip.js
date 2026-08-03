const sql = require("mssql");
const { poolPromise } = require("../config/db");

async function migrate() {
  console.log("🚀 Starting database migration for VIP Management Module...");
  try {
    const pool = await poolPromise;

    // 1. Create VIPDiscountRule Table
    console.log("Checking for VIPDiscountRule table...");
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[VIPDiscountRule]') AND type in (N'U'))
      BEGIN
        CREATE TABLE [dbo].[VIPDiscountRule] (
          [VIPRuleID] UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
          [RuleName] NVARCHAR(100) NOT NULL,
          [DishID] UNIQUEIDENTIFIER NULL,
          [DishGroupID] UNIQUEIDENTIFIER NULL,
          [DiscountType] VARCHAR(20) NOT NULL, -- 'PERCENTAGE' or 'FIXED'
          [DiscountValue] DECIMAL(18,2) NOT NULL,
          [Priority] INT NOT NULL DEFAULT 1,
          [IsActive] BIT NOT NULL DEFAULT 1,
          [CreatedDate] DATETIME NOT NULL DEFAULT GETDATE()
        );
        console.log("VIPDiscountRule table created.");
      END
      ELSE
      BEGIN
        console.log("VIPDiscountRule table already exists.");
      END
    `).catch(err => {
      // In MSSQL, nested console.log isn't supported inside SQL script, we will handle logs via Node
    });

    // We do it directly using standard SQL checks and log from Node
    const ruleTableCheck = await pool.request().query(`
      SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'VIPDiscountRule'
    `);
    if (ruleTableCheck.recordset.length === 0) {
      console.log("Creating VIPDiscountRule table...");
      await pool.request().query(`
        CREATE TABLE [dbo].[VIPDiscountRule] (
          [VIPRuleID] UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
          [RuleName] NVARCHAR(100) NOT NULL,
          [DishID] UNIQUEIDENTIFIER NULL,
          [DishGroupID] UNIQUEIDENTIFIER NULL,
          [DiscountType] VARCHAR(20) NOT NULL,
          [DiscountValue] DECIMAL(18,2) NOT NULL,
          [Priority] INT NOT NULL DEFAULT 1,
          [IsActive] BIT NOT NULL DEFAULT 1,
          [CreatedDate] DATETIME NOT NULL DEFAULT GETDATE()
        );
      `);
      console.log("✅ Created VIPDiscountRule table successfully.");
    } else {
      console.log("✓ VIPDiscountRule table already exists.");
    }

    // 2. Alter MemberMaster
    console.log("Altering MemberMaster table if columns are missing...");
    const memberCols = [
      { name: "IsVIP", type: "BIT DEFAULT 0 WITH VALUES" },
      { name: "VIPType", type: "VARCHAR(20) DEFAULT 'Manual' WITH VALUES" },
      { name: "VIPSince", type: "DATETIME NULL" },
      { name: "LifetimeSpend", type: "DECIMAL(18,2) DEFAULT 0 WITH VALUES" }
    ];

    for (const col of memberCols) {
      const res = await pool.request()
        .input("colName", sql.VarChar, col.name)
        .query(`
          SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
          WHERE TABLE_NAME = 'MemberMaster' AND COLUMN_NAME = @colName
        `);
      if (res.recordset.length === 0) {
        console.log(`Adding MemberMaster.${col.name}...`);
        await pool.request().query(`
          ALTER TABLE MemberMaster ADD ${col.name} ${col.type};
        `);
        console.log(`✅ Added column ${col.name} to MemberMaster.`);
      } else {
        console.log(`✓ MemberMaster.${col.name} column already exists.`);
      }
    }

    // 3. Alter SettlementHeader
    console.log("Altering SettlementHeader table if columns are missing...");
    const sHeaderCols = [
      { name: "IsVIP", type: "BIT DEFAULT 0 WITH VALUES" },
      { name: "VIPDiscountAmount", type: "DECIMAL(18,2) DEFAULT 0 WITH VALUES" }
    ];

    for (const col of sHeaderCols) {
      const res = await pool.request()
        .input("colName", sql.VarChar, col.name)
        .query(`
          SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
          WHERE TABLE_NAME = 'SettlementHeader' AND COLUMN_NAME = @colName
        `);
      if (res.recordset.length === 0) {
        console.log(`Adding SettlementHeader.${col.name}...`);
        await pool.request().query(`
          ALTER TABLE SettlementHeader ADD ${col.name} ${col.type};
        `);
        console.log(`✅ Added column ${col.name} to SettlementHeader.`);
      } else {
        console.log(`✓ SettlementHeader.${col.name} column already exists.`);
      }
    }

    // 4. Alter SettlementItemDetail
    console.log("Altering SettlementItemDetail table if columns are missing...");
    const sDetailCols = [
      { name: "VIPDiscountAmount", type: "DECIMAL(18,2) DEFAULT 0 WITH VALUES" },
      { name: "VIPRuleID", type: "UNIQUEIDENTIFIER NULL" }
    ];

    for (const col of sDetailCols) {
      const res = await pool.request()
        .input("colName", sql.VarChar, col.name)
        .query(`
          SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
          WHERE TABLE_NAME = 'SettlementItemDetail' AND COLUMN_NAME = @colName
        `);
      if (res.recordset.length === 0) {
        console.log(`Adding SettlementItemDetail.${col.name}...`);
        await pool.request().query(`
          ALTER TABLE SettlementItemDetail ADD ${col.name} ${col.type};
        `);
        console.log(`✅ Added column ${col.name} to SettlementItemDetail.`);
      } else {
        console.log(`✓ SettlementItemDetail.${col.name} column already exists.`);
      }
    }

    // 5. Alter AppSettings
    console.log("Altering AppSettings table if columns are missing...");
    const settingsCols = [
      { name: "VIPThreshold", type: "DECIMAL(18,2) DEFAULT 5000.00 WITH VALUES" }
    ];

    for (const col of settingsCols) {
      const res = await pool.request()
        .input("colName", sql.VarChar, col.name)
        .query(`
          SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
          WHERE TABLE_NAME = 'AppSettings' AND COLUMN_NAME = @colName
        `);
      if (res.recordset.length === 0) {
        console.log(`Adding AppSettings.${col.name}...`);
        await pool.request().query(`
          ALTER TABLE AppSettings ADD ${col.name} ${col.type};
        `);
        console.log(`✅ Added column ${col.name} to AppSettings.`);
      } else {
        console.log(`✓ AppSettings.${col.name} column already exists.`);
      }
    }

    console.log("🎉 Database migration completed successfully!");
    process.exit(0);
  } catch (err) {
    console.error("❌ Migration failed:", err.message);
    process.exit(1);
  }
}

migrate();
