const sql = require("mssql");

async function initDB(pool) {
  if (!pool) return;
  console.log("🔄 Running schema check and initialization...");

  const runQuery = async (name, query) => {
    try {
      await pool.request().query(query);
      console.log(`✅ ${name} OK`);
    } catch (err) {
      console.error(`❌ ${name} FAILED:`, err.message);
    }
  };

  try {
    // 1. SettlementItemDetail
    await runQuery("Create SettlementItemDetail", `
      IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[SettlementItemDetail]') AND type in (N'U'))
      BEGIN
          CREATE TABLE [dbo].[SettlementItemDetail](
              [ID] [int] IDENTITY(1,1) NOT NULL,
              [SettlementID] [uniqueidentifier] NULL,
              [DishId] [uniqueidentifier] NULL,
              [DishGroupId] [uniqueidentifier] NULL,
              [SubCategoryId] [uniqueidentifier] NULL,
              [CategoryId] [uniqueidentifier] NULL,
              [DishName] [nvarchar](255) NULL,
              [Qty] [int] NULL,
              [Price] [decimal](18, 2) NULL,
              [OrderDateTime] [datetime] NULL
          ) ON [PRIMARY]
      END
    `);

    // 2. MemberMaster
    await runQuery("Create MemberMaster", `
      IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[MemberMaster]') AND type in (N'U'))
      BEGIN
          CREATE TABLE [dbo].[MemberMaster](
              [MemberId] [uniqueidentifier] NOT NULL PRIMARY KEY DEFAULT NEWID(),
              [Name] [nvarchar](255) NOT NULL,
              [Phone] [nvarchar](50) NULL,
              [Email] [nvarchar](255) NULL,
              [Address] [nvarchar](max) NULL,
              [IsActive] [bit] DEFAULT 1,
              [Balance] [decimal](18, 2) DEFAULT 0,
              [CreditLimit] [decimal](18, 2) DEFAULT 0,
              [CurrentBalance] [decimal](18, 2) DEFAULT 0,
              [CreatedOn] [datetime] DEFAULT GETDATE()
          )
      END
    `);

    // 2.1 MemberMaster extra columns (prepaid balance alert flag)
    await runQuery("MemberMaster - LowBalanceAlertSent", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[MemberMaster]') AND name = 'LowBalanceAlertSent') ALTER TABLE [dbo].[MemberMaster] ADD LowBalanceAlertSent BIT NOT NULL DEFAULT 0");
    await runQuery("MemberMaster - ModifiedBy", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[MemberMaster]') AND name = 'ModifiedBy') ALTER TABLE [dbo].[MemberMaster] ADD ModifiedBy UNIQUEIDENTIFIER NULL");
    await runQuery("MemberMaster - ModifiedDate", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[MemberMaster]') AND name = 'ModifiedDate') ALTER TABLE [dbo].[MemberMaster] ADD ModifiedDate DATETIME NULL");
    await runQuery("MemberMaster - CreatedBy", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[MemberMaster]') AND name = 'CreatedBy') ALTER TABLE [dbo].[MemberMaster] ADD CreatedBy UNIQUEIDENTIFIER NULL");
    await runQuery("MemberMaster - Promocode", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[MemberMaster]') AND name = 'Promocode') ALTER TABLE [dbo].[MemberMaster] ADD Promocode NVARCHAR(100) NULL");
    await runQuery("MemberMaster - Promoamount", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[MemberMaster]') AND name = 'Promoamount') ALTER TABLE [dbo].[MemberMaster] ADD Promoamount DECIMAL(18,2) NULL");
    
    // AvailableCredit computed column — only add if it doesn't exist yet
    await runQuery("MemberMaster - AvailableCredit", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[MemberMaster]') AND name = 'AvailableCredit') ALTER TABLE [dbo].[MemberMaster] ADD AvailableCredit AS (CASE WHEN CreditLimit > 0 THEN (CreditLimit - CurrentBalance) ELSE CurrentBalance END)");

    // 🏆 REWARD POINTS: Add RewardCredit wallet column to MemberMaster
    await runQuery("MemberMaster - RewardCredit", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[MemberMaster]') AND name = 'RewardCredit') ALTER TABLE [dbo].[MemberMaster] ADD RewardCredit DECIMAL(18,4) NOT NULL DEFAULT 0");

    // 🏆 REWARD POINTS: Drop and recreate AvailableCredit computed column to include RewardCredit
    // This updates the formula so AvailableCredit = credit capacity + reward wallet
    await runQuery("MemberMaster - AvailableCredit (Reward-aware)", `
      IF EXISTS (SELECT * FROM sys.computed_columns WHERE object_id = OBJECT_ID(N'[dbo].[MemberMaster]') AND name = 'AvailableCredit')
      BEGIN
        -- Only rebuild if RewardCredit column now exists (safe guard)
        IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[MemberMaster]') AND name = 'RewardCredit')
        BEGIN
          -- Check if the formula already includes RewardCredit (avoid repeated DROP/ADD)
          DECLARE @existingDef NVARCHAR(MAX);
          SELECT @existingDef = definition FROM sys.computed_columns
          WHERE object_id = OBJECT_ID(N'[dbo].[MemberMaster]') AND name = 'AvailableCredit';
          IF @existingDef NOT LIKE '%RewardCredit%'
          BEGIN
            ALTER TABLE [dbo].[MemberMaster] DROP COLUMN AvailableCredit;
            ALTER TABLE [dbo].[MemberMaster] ADD AvailableCredit AS (CASE WHEN CreditLimit > 0 THEN (CreditLimit - CurrentBalance) ELSE 0 END + ISNULL(RewardCredit, 0));
          END
        END
      END
    `);

    // 🏆 REWARD POINTS: Unique constraint on Phone (no duplicate member numbers)
    await runQuery("MemberMaster - UniquePhone", `
      IF NOT EXISTS (
        SELECT 1 FROM sys.indexes 
        WHERE object_id = OBJECT_ID(N'[dbo].[MemberMaster]') AND name = 'UQ_MemberMaster_Phone'
      )
      BEGIN
        -- Only create if there are no existing duplicate phones
        IF NOT EXISTS (
          SELECT Phone, COUNT(*) FROM [dbo].[MemberMaster]
          WHERE Phone IS NOT NULL AND Phone <> ''
          GROUP BY Phone HAVING COUNT(*) > 1
        )
        BEGIN
          CREATE UNIQUE NONCLUSTERED INDEX UQ_MemberMaster_Phone
          ON [dbo].[MemberMaster](Phone)
          WHERE Phone IS NOT NULL AND Phone <> '';
        END
      END
    `);

    // 🏆 REWARD POINTS: RewardMaster — configures earn ratio
    await runQuery("Create RewardMaster", `
      IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[RewardMaster]') AND type in (N'U'))
      BEGIN
        CREATE TABLE [dbo].[RewardMaster] (
          [Id]           INT IDENTITY(1,1) PRIMARY KEY,
          [SpendAmount]  DECIMAL(18,2) NOT NULL DEFAULT 100,
          [CreditAmount] DECIMAL(18,4) NOT NULL DEFAULT 1,
          [IsActive]     BIT NOT NULL DEFAULT 1,
          [Description]  NVARCHAR(255) NULL,
          [CreatedOn]    DATETIME DEFAULT GETDATE(),
          [ModifiedOn]   DATETIME NULL
        );
        -- Seed with default: every $100 spent earns $1 reward credit
        INSERT INTO [dbo].[RewardMaster] (SpendAmount, CreditAmount, IsActive, Description)
        VALUES (100, 1, 1, 'Default: $100 spent = $1 reward credit');
      END
    `);

    // 🏆 REWARD POINTS: RewardPointDetails — per-transaction audit log
    await runQuery("Create RewardPointDetails", `
      IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[RewardPointDetails]') AND type in (N'U'))
      BEGIN
        CREATE TABLE [dbo].[RewardPointDetails] (
          [Id]           UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
          [MemberId]     UNIQUEIDENTIFIER NOT NULL,
          [SettlementId] UNIQUEIDENTIFIER NULL,
          [BillNo]       NVARCHAR(50) NULL,
          [BillAmount]   DECIMAL(18,2) NOT NULL DEFAULT 0,
          [PointsEarned] DECIMAL(18,4) NOT NULL DEFAULT 0,
          [PointsUsed]   DECIMAL(18,4) NOT NULL DEFAULT 0,
          [TransType]    NVARCHAR(20) NOT NULL DEFAULT 'EARN',
          [PayMode]      NVARCHAR(50) NULL,
          [Remarks]      NVARCHAR(255) NULL,
          [CreatedOn]    DATETIME DEFAULT GETDATE()
        );
        CREATE NONCLUSTERED INDEX IX_RewardPointDetails_MemberId ON [dbo].[RewardPointDetails](MemberId);
        CREATE NONCLUSTERED INDEX IX_RewardPointDetails_SettlementId ON [dbo].[RewardPointDetails](SettlementId);
      END
    `);

    // 🏆 REWARD POINTS: Add RewardPointDetails columns for backward compat if table already existed
    await runQuery("RewardPointDetails - PointsUsed", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[RewardPointDetails]') AND name = 'PointsUsed') ALTER TABLE [dbo].[RewardPointDetails] ADD PointsUsed DECIMAL(18,4) NOT NULL DEFAULT 0");
    await runQuery("RewardPointDetails - TransType", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[RewardPointDetails]') AND name = 'TransType') ALTER TABLE [dbo].[RewardPointDetails] ADD TransType NVARCHAR(20) NOT NULL DEFAULT 'EARN'");
    // 🏆 REWARD POINTS: Add remaining POS-required columns to legacy RewardPointDetails tables
    await runQuery("RewardPointDetails - MemberId",    "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[RewardPointDetails]') AND name = 'MemberId') ALTER TABLE [dbo].[RewardPointDetails] ADD MemberId UNIQUEIDENTIFIER NULL");
    await runQuery("RewardPointDetails - SettlementId","IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[RewardPointDetails]') AND name = 'SettlementId') ALTER TABLE [dbo].[RewardPointDetails] ADD SettlementId UNIQUEIDENTIFIER NULL");
    await runQuery("RewardPointDetails - BillNo",      "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[RewardPointDetails]') AND name = 'BillNo') ALTER TABLE [dbo].[RewardPointDetails] ADD BillNo NVARCHAR(100) NULL");
    await runQuery("RewardPointDetails - BillAmount",  "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[RewardPointDetails]') AND name = 'BillAmount') ALTER TABLE [dbo].[RewardPointDetails] ADD BillAmount DECIMAL(18,4) NULL DEFAULT 0");
    await runQuery("RewardPointDetails - PointsEarned","IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[RewardPointDetails]') AND name = 'PointsEarned') ALTER TABLE [dbo].[RewardPointDetails] ADD PointsEarned DECIMAL(18,4) NOT NULL DEFAULT 0");
    await runQuery("RewardPointDetails - PayMode",     "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[RewardPointDetails]') AND name = 'PayMode') ALTER TABLE [dbo].[RewardPointDetails] ADD PayMode NVARCHAR(50) NULL");
    await runQuery("RewardPointDetails - Remarks",     "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[RewardPointDetails]') AND name = 'Remarks') ALTER TABLE [dbo].[RewardPointDetails] ADD Remarks NVARCHAR(500) NULL");
    await runQuery("RewardPointDetails - CreatedOn",   "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[RewardPointDetails]') AND name = 'CreatedOn') ALTER TABLE [dbo].[RewardPointDetails] ADD CreatedOn DATETIME DEFAULT GETDATE()");
    await runQuery("RewardPointDetails - Index on MemberId", `
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_RewardPointDetails_MemberId' AND object_id = OBJECT_ID(N'[dbo].[RewardPointDetails]'))
        CREATE NONCLUSTERED INDEX IX_RewardPointDetails_MemberId ON [dbo].[RewardPointDetails](MemberId)
    `);

    // 2.1 CreditCustomerMaster (Dedicated Credit Accounts table separate from Members)
    await runQuery("Create CreditCustomerMaster", `
      IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[CreditCustomerMaster]') AND type in (N'U'))
      BEGIN
          CREATE TABLE [dbo].[CreditCustomerMaster](
              [CustomerId] [uniqueidentifier] NOT NULL PRIMARY KEY DEFAULT NEWID(),
              [Name] [nvarchar](255) NOT NULL,
              [Phone] [nvarchar](50) NULL,
              [Email] [nvarchar](255) NULL,
              [Address] [nvarchar](max) NULL,
              [IsActive] [bit] DEFAULT 1,
              [Balance] [decimal](18, 2) DEFAULT 0,
              [CreditLimit] [decimal](18, 2) DEFAULT 0,
              [CurrentBalance] [decimal](18, 2) DEFAULT 0,
              [CreatedOn] [datetime] DEFAULT GETDATE()
          )
      END
    `);

    // 3. SettlementHeader Columns
    await runQuery("SettlementHeader - IsCancelled", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[SettlementHeader]') AND name = 'IsCancelled') ALTER TABLE [dbo].[SettlementHeader] ADD IsCancelled BIT DEFAULT 0");
    await runQuery("SettlementHeader - CancellationReason", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[SettlementHeader]') AND name = 'CancellationReason') ALTER TABLE [dbo].[SettlementHeader] ADD CancellationReason NVARCHAR(255)");
    await runQuery("SettlementHeader - CancelledBy", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[SettlementHeader]') AND name = 'CancelledBy') ALTER TABLE [dbo].[SettlementHeader] ADD CancelledBy UNIQUEIDENTIFIER NULL");
    await runQuery("SettlementHeader - CancelledDate", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[SettlementHeader]') AND name = 'CancelledDate') ALTER TABLE [dbo].[SettlementHeader] ADD CancelledDate DATETIME NULL");
    await runQuery("SettlementHeader - CancelledByUserName", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[SettlementHeader]') AND name = 'CancelledByUserName') ALTER TABLE [dbo].[SettlementHeader] ADD CancelledByUserName NVARCHAR(100) NULL");
    await runQuery("SettlementHeader - SER_NAME", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[SettlementHeader]') AND name = 'SER_NAME') ALTER TABLE [dbo].[SettlementHeader] ADD SER_NAME NVARCHAR(255)");
    await runQuery("SettlementHeader - VoidItemQty", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[SettlementHeader]') AND name = 'VoidItemQty') ALTER TABLE [dbo].[SettlementHeader] ADD VoidItemQty INT DEFAULT 0");
    await runQuery("SettlementHeader - VoidItemAmount", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[SettlementHeader]') AND name = 'VoidItemAmount') ALTER TABLE [dbo].[SettlementHeader] ADD VoidItemAmount DECIMAL(18, 2) DEFAULT 0");
    await runQuery("SettlementHeader - ServiceCharge", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[SettlementHeader]') AND name = 'ServiceCharge') ALTER TABLE [dbo].[SettlementHeader] ADD ServiceCharge DECIMAL(18, 2) DEFAULT 0");
    await runQuery("SettlementHeader - RoundedBy", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[SettlementHeader]') AND name = 'RoundedBy') ALTER TABLE [dbo].[SettlementHeader] ADD RoundedBy DECIMAL(18, 2) DEFAULT 0");

    // 4. SettlementItemDetail Columns
    await runQuery("SettlementItemDetail - Status", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[SettlementItemDetail]') AND name = 'Status') ALTER TABLE [dbo].[SettlementItemDetail] ADD Status NVARCHAR(50) NULL");
    await runQuery("SettlementItemDetail - CategoryName", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[SettlementItemDetail]') AND name = 'CategoryName') ALTER TABLE [dbo].[SettlementItemDetail] ADD CategoryName NVARCHAR(255) NULL");
    await runQuery("SettlementItemDetail - SubCategoryName", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[SettlementItemDetail]') AND name = 'SubCategoryName') ALTER TABLE [dbo].[SettlementItemDetail] ADD SubCategoryName NVARCHAR(255) NULL");
    await runQuery("SettlementItemDetail - Spicy", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[SettlementItemDetail]') AND name = 'Spicy') ALTER TABLE [dbo].[SettlementItemDetail] ADD Spicy NVARCHAR(50) NULL");
    await runQuery("SettlementItemDetail - Salt", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[SettlementItemDetail]') AND name = 'Salt') ALTER TABLE [dbo].[SettlementItemDetail] ADD Salt NVARCHAR(50) NULL");
    await runQuery("SettlementItemDetail - Oil", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[SettlementItemDetail]') AND name = 'Oil') ALTER TABLE [dbo].[SettlementItemDetail] ADD Oil NVARCHAR(50) NULL");
    await runQuery("SettlementItemDetail - Sugar", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[SettlementItemDetail]') AND name = 'Sugar') ALTER TABLE [dbo].[SettlementItemDetail] ADD Sugar NVARCHAR(50) NULL");
    await runQuery("SettlementItemDetail - OrderDetailId", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[SettlementItemDetail]') AND name = 'OrderDetailId') ALTER TABLE [dbo].[SettlementItemDetail] ADD OrderDetailId UNIQUEIDENTIFIER NULL");
    await runQuery("SettlementItemDetail - SongName", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[SettlementItemDetail]') AND name = 'SongName') ALTER TABLE [dbo].[SettlementItemDetail] ADD SongName NVARCHAR(255) NULL");

    // 5. CancelRemarksMaster
    await runQuery("Create CancelRemarksMaster", `
      IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[CancelRemarksMaster]') AND type in (N'U'))
      BEGIN
          CREATE TABLE [dbo].[CancelRemarksMaster](
              [CRCode] [int] IDENTITY(1,1) NOT NULL PRIMARY KEY,
              [CRName] [nvarchar](255) NOT NULL,
              [IsActive] [bit] DEFAULT 1
          )
      END
    `);

    await runQuery("Insert CancelRemarks", `
      IF NOT EXISTS (SELECT TOP 1 1 FROM [dbo].[CancelRemarksMaster])
      BEGIN
          INSERT INTO [dbo].[CancelRemarksMaster] (CRName, IsActive) VALUES 
          ('Customer Changed Mind', 1),
          ('Order Error', 1),
          ('Duplicate Order', 1),
          ('Long Wait Time', 1),
          ('Technical Issue', 1),
          ('Out of Stock', 1)
      END
    `);

    // 6. CartItems
    await runQuery("Create CartItems", `
      IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[CartItems]') AND type in (N'U'))
      BEGIN
          CREATE TABLE [dbo].[CartItems](
              [ItemId] [nvarchar](128) NOT NULL PRIMARY KEY,
              [CartId] [nvarchar](max) NULL,
              [ProductId] [nvarchar](128) NULL,
              [Quantity] [int] NULL,
              [Cost] [decimal](18, 2) NULL,
              [OrderNo] [nvarchar](max) NULL,
              [OrderConfirmQty] [int] NULL,
              [DateCreated] [datetime] DEFAULT GETDATE()
          )
      END
    `);

    // 7. SettlementDiscountDetail
    await runQuery("Create SettlementDiscountDetail", `
      IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[SettlementDiscountDetail]') AND type in (N'U'))
      BEGIN
          CREATE TABLE [dbo].[SettlementDiscountDetail](
              [ID] [int] IDENTITY(1,1) NOT NULL PRIMARY KEY,
              [SettlementId] [uniqueidentifier] NULL,
              [DiscountId] [uniqueidentifier] NULL,
              [Description] [nvarchar](255) NULL,
              [SysAmount] [decimal](18, 2) NULL,
              [ManualAmount] [decimal](18, 2) NULL,
              [SortageOrExces] [decimal](18, 2) NULL
          )
      END
    `);

    // 8. POS Nitro Professional Updates
    await runQuery("RestaurantOrderDetailCur - ModifiersJSON", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[RestaurantOrderDetailCur]') AND name = 'ModifiersJSON') ALTER TABLE [dbo].[RestaurantOrderDetailCur] ADD ModifiersJSON NVARCHAR(MAX)");
    await runQuery("RestaurantOrderDetailCur - OrderNumber", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[RestaurantOrderDetailCur]') AND name = 'OrderNumber') ALTER TABLE [dbo].[RestaurantOrderDetailCur] ADD OrderNumber NVARCHAR(100)");
    await runQuery("RestaurantOrderDetailCur - Remarks", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[RestaurantOrderDetailCur]') AND name = 'Remarks') ALTER TABLE [dbo].[RestaurantOrderDetailCur] ADD Remarks NVARCHAR(300)");
    await runQuery("RestaurantOrderDetailCur - isTakeAway", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[RestaurantOrderDetailCur]') AND name = 'isTakeAway') ALTER TABLE [dbo].[RestaurantOrderDetailCur] ADD isTakeAway BIT DEFAULT 0");

    await runQuery("TableMaster - CurrentOrderId", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[TableMaster]') AND name = 'CurrentOrderId') ALTER TABLE [dbo].[TableMaster] ADD CurrentOrderId NVARCHAR(100)");
    await runQuery("TableMaster - entry_status", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[TableMaster]') AND name = 'entry_status') ALTER TABLE [dbo].[TableMaster] ADD entry_status VARCHAR(50) NULL");
    await runQuery("TableMaster - CustomerName", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[TableMaster]') AND name = 'CustomerName') ALTER TABLE [dbo].[TableMaster] ADD CustomerName NVARCHAR(100) NULL");
    await runQuery("TableMaster - Pax", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[TableMaster]') AND name = 'Pax') ALTER TABLE [dbo].[TableMaster] ADD Pax INT NULL");
    await runQuery("TableMaster - PAYMENT_STATUS", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[TableMaster]') AND name = 'PAYMENT_STATUS') ALTER TABLE [dbo].[TableMaster] ADD PAYMENT_STATUS INT NULL");

    await runQuery("Create OrderSequences", `
      IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[OrderSequences]') AND type in (N'U'))
      BEGIN
          CREATE TABLE [dbo].[OrderSequences](
              [RestaurantId] [uniqueidentifier] NOT NULL,
              [SequenceDate] [date] NOT NULL,
              [LastNumber] [int] NOT NULL DEFAULT 0,
              PRIMARY KEY ([RestaurantId], [SequenceDate])
          )
      END
    `);

    // 9. Ensure Discount Columns in Professional Tables
    await runQuery("RestaurantOrderDetailCur - DiscountAmount", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[RestaurantOrderDetailCur]') AND name = 'DiscountAmount') ALTER TABLE [dbo].[RestaurantOrderDetailCur] ADD DiscountAmount DECIMAL(18, 2) DEFAULT 0");
    await runQuery("RestaurantOrderDetailCur - DiscountType", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[RestaurantOrderDetailCur]') AND name = 'DiscountType') ALTER TABLE [dbo].[RestaurantOrderDetailCur] ADD DiscountType NVARCHAR(50)");

    await runQuery("RestaurantOrderDetail - DiscountAmount", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[RestaurantOrderDetail]') AND name = 'DiscountAmount') ALTER TABLE [dbo].[RestaurantOrderDetail] ADD DiscountAmount DECIMAL(18, 2) DEFAULT 0");
    await runQuery("RestaurantOrderDetail - DiscountType", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[RestaurantOrderDetail]') AND name = 'DiscountType') ALTER TABLE [dbo].[RestaurantOrderDetail] ADD DiscountType NVARCHAR(50)");

    await runQuery("SettlementHeader - DiscountAmount", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[SettlementHeader]') AND name = 'DiscountAmount') ALTER TABLE [dbo].[SettlementHeader] ADD DiscountAmount DECIMAL(18, 2) DEFAULT 0");
    await runQuery("SettlementHeader - DiscountType", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[SettlementHeader]') AND name = 'DiscountType') ALTER TABLE [dbo].[SettlementHeader] ADD DiscountType NVARCHAR(50)");

    // 10. Performance Indexes
    await runQuery("Index - SettlementHeader Date", "IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_SettlementHeader_Date') CREATE INDEX IX_SettlementHeader_Date ON [dbo].[SettlementHeader] (LastSettlementDate)");
    await runQuery("Index - SettlementHeader BillNo", "IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_SettlementHeader_BillNo') CREATE INDEX IX_SettlementHeader_BillNo ON [dbo].[SettlementHeader] (BillNo)");
    await runQuery("Index - SettlementItemDetail ID", "IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_SettlementItemDetail_SID') CREATE INDEX IX_SettlementItemDetail_SID ON [dbo].[SettlementItemDetail] (SettlementID)");
    await runQuery("Index - RestaurantOrderCur Tableno", "IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_RestaurantOrderCur_Tableno') CREATE INDEX IX_RestaurantOrderCur_Tableno ON [dbo].[RestaurantOrderCur] (Tableno)");
    await runQuery("Index - RestaurantOrderCur OrderNo", "IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_RestaurantOrderCur_OrderNo') CREATE INDEX IX_RestaurantOrderCur_OrderNo ON [dbo].[RestaurantOrderCur] (OrderNumber)");
    await runQuery("Index - RestaurantOrderCur ClosedCreated", "IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_RestaurantOrderCur_ClosedCreated') CREATE INDEX IX_RestaurantOrderCur_ClosedCreated ON [dbo].[RestaurantOrderCur] (isOrderClosed, CreatedOn)");
    await runQuery("Index - RestaurantOrderDetailCur OrderId", "IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_RestaurantOrderDetailCur_OrderId') CREATE INDEX IX_RestaurantOrderDetailCur_OrderId ON [dbo].[RestaurantOrderDetailCur] (OrderId)");
    await runQuery("Index - TableMaster SortCode", "IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_TableMaster_SortCode') CREATE INDEX IX_TableMaster_SortCode ON [dbo].[TableMaster] (SortCode)");
    await runQuery("Index - TableMaster TableNumber", "IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_TableMaster_TableNumber') CREATE INDEX IX_TableMaster_TableNumber ON [dbo].[TableMaster] (TableNumber)");
    await runQuery("Index - RestaurantOrder Tableno", "IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_RestaurantOrder_Tableno') CREATE INDEX IX_RestaurantOrder_Tableno ON [dbo].[RestaurantOrder] (Tableno)");

    // 11. CompanySettings
    await runQuery("Create CompanySettings", `
      IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[CompanySettings]') AND type in (N'U'))
      BEGIN
          CREATE TABLE [dbo].[CompanySettings](
              [Id] [nvarchar](50) NOT NULL PRIMARY KEY,
              [CompanyName] [nvarchar](255) NULL,
              [Address] [nvarchar](max) NULL,
              [GSTNo] [nvarchar](50) NULL,
              [GSTPercentage] [decimal](18, 2) NULL,
              [Phone] [nvarchar](50) NULL,
              [Email] [nvarchar](255) NULL,
              [CashierName] [nvarchar](100) NULL,
              [Currency] [nvarchar](50) NULL,
              [CurrencySymbol] [nvarchar](10) NULL,
              [CompanyLogoUrl] [nvarchar](max) NULL,
              [HalalLogoUrl] [nvarchar](max) NULL,
              [PrinterIP] [nvarchar](50) NULL,
              [ShowCompanyLogo] [bit] DEFAULT 0,
              [ShowHalalLogo] [bit] DEFAULT 0,
              [TaxMode] [nvarchar](50) DEFAULT 'exclusive',
              [WaiterRequired] [bit] DEFAULT 0,
              [HoldOvertimeMinutes] [int] DEFAULT 30,
              [SVCIdentification] [bit] DEFAULT 1,
              [UpdatedOn] [datetime] DEFAULT GETDATE()
          )
      END
    `);
    await runQuery("CompanySettings - HoldOvertimeMinutes", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[CompanySettings]') AND name = 'HoldOvertimeMinutes') ALTER TABLE [dbo].[CompanySettings] ADD HoldOvertimeMinutes INT DEFAULT 30");
    await runQuery("CompanySettings - ServiceChargePercentage", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[CompanySettings]') AND name = 'ServiceChargePercentage') ALTER TABLE [dbo].[CompanySettings] ADD ServiceChargePercentage DECIMAL(18, 2) DEFAULT 0");
    await runQuery("CompanySettings - SVCIdentification", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[CompanySettings]') AND name = 'SVCIdentification') ALTER TABLE [dbo].[CompanySettings] ADD SVCIdentification BIT NOT NULL DEFAULT 1");
    await runQuery("CompanySettings - TakeawayCharges", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[CompanySettings]') AND name = 'TakeawayCharges') ALTER TABLE [dbo].[CompanySettings] ADD TakeawayCharges DECIMAL(18, 2) DEFAULT 0");
    await runQuery("CompanySettings - LastBridgeHeartbeat", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[CompanySettings]') AND name = 'LastBridgeHeartbeat') ALTER TABLE [dbo].[CompanySettings] ADD LastBridgeHeartbeat DATETIME");
    await runQuery("AppSettings - EnableCheckoutFlow", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[AppSettings]') AND name = 'EnableCheckoutFlow') ALTER TABLE [dbo].[AppSettings] ADD EnableCheckoutFlow BIT NOT NULL DEFAULT 1");
    await runQuery("AppSettings - EnableDirectProcessToPay", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[AppSettings]') AND name = 'EnableDirectProcessToPay') ALTER TABLE [dbo].[AppSettings] ADD EnableDirectProcessToPay BIT NOT NULL DEFAULT 0");
    await runQuery("AppSettings - CustomerSideDisplay", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[AppSettings]') AND name = 'CustomerSideDisplay') ALTER TABLE [dbo].[AppSettings] ADD CustomerSideDisplay BIT NOT NULL DEFAULT 1");
    await runQuery("AppSettings - EnableGuestDetailsPopup", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[AppSettings]') AND name = 'EnableGuestDetailsPopup') ALTER TABLE [dbo].[AppSettings] ADD EnableGuestDetailsPopup BIT NOT NULL DEFAULT 1");
    await runQuery("AppSettings - EnableCashDrawer", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[AppSettings]') AND name = 'EnableCashDrawer') ALTER TABLE [dbo].[AppSettings] ADD EnableCashDrawer BIT NOT NULL DEFAULT 1");
    await runQuery("RestaurantOrderCur - TakeawayCharge", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[RestaurantOrderCur]') AND name = 'TakeawayCharge') ALTER TABLE [dbo].[RestaurantOrderCur] ADD TakeawayCharge DECIMAL(18, 2) DEFAULT 0");
    await runQuery("RestaurantOrder - TakeawayCharge", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[RestaurantOrder]') AND name = 'TakeawayCharge') ALTER TABLE [dbo].[RestaurantOrder] ADD TakeawayCharge DECIMAL(18, 2) DEFAULT 0");
    await runQuery("SettlementHeader - TakeawayCharge", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[SettlementHeader]') AND name = 'TakeawayCharge') ALTER TABLE [dbo].[SettlementHeader] ADD TakeawayCharge DECIMAL(18, 2) DEFAULT 0");

    // 11. OrderMergeHistory Setup
    await runQuery("Create OrderMergeHistory", `
      IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[OrderMergeHistory]') AND type in (N'U'))
      BEGIN
        CREATE TABLE [dbo].[OrderMergeHistory] (
          [MergeId] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          [ParentOrderId] UNIQUEIDENTIFIER NOT NULL,
          [ChildOrderId] UNIQUEIDENTIFIER NOT NULL,
          [ParentTableNo] NVARCHAR(50) NULL,
          [ChildTableNo] NVARCHAR(50) NULL,
          [MergedAt] DATETIME NOT NULL DEFAULT GETDATE(),
          [MergedBy] UNIQUEIDENTIFIER NULL,
          CONSTRAINT [PK_OrderMergeHistory] PRIMARY KEY CLUSTERED ([MergeId] ASC)
        )
      END
    `);

    await runQuery("Insert Default CompanySettings", `
      IF NOT EXISTS (SELECT TOP 1 1 FROM [dbo].[CompanySettings])
      BEGIN
          INSERT INTO [dbo].[CompanySettings] (Id, CompanyName, UpdatedOn) VALUES ('1', 'UCS POS', GETDATE())
      END
    `);

    // 12. Insert MEMBER & CREDIT Paymode if missing
    await runQuery("Insert MEMBER Paymode", `
      IF NOT EXISTS (SELECT 1 FROM [dbo].[Paymode] WHERE LTRIM(RTRIM(PayMode)) = 'MEMBER')
      BEGIN
          INSERT INTO [dbo].[Paymode] (Position, PayMode, Description, Active)
          VALUES (5, 'MEMBER', 'MEMBER', 1)
      END
    `);

    await runQuery("Insert CREDIT Paymode", `
      IF NOT EXISTS (SELECT 1 FROM [dbo].[Paymode] WHERE LTRIM(RTRIM(PayMode)) = 'CREDIT')
      BEGIN
          INSERT INTO [dbo].[Paymode] (Position, PayMode, Description, Active)
          VALUES (6, 'CREDIT', 'CREDIT', 1)
      END
    `);

    // 13. Create AIChatSessions and AIChatMessages tables
    await runQuery("Create AIChatSessions", `
      IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[AIChatSessions]') AND type in (N'U'))
      BEGIN
        CREATE TABLE [dbo].[AIChatSessions] (
          [SessionID] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
          [OrgID] INT NULL,
          [StoreID] INT NULL,
          [UserID] INT NULL,
          [Title] NVARCHAR(255) NULL,
          [CreatedAt] DATETIME NOT NULL DEFAULT GETDATE(),
          [LastActivityAt] DATETIME NOT NULL DEFAULT GETDATE()
        )
      END
    `);

    await runQuery("Create AIChatMessages", `
      IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[AIChatMessages]') AND type in (N'U'))
      BEGIN
        CREATE TABLE [dbo].[AIChatMessages] (
          [MessageID] INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
          [SessionID] UNIQUEIDENTIFIER NOT NULL,
          [Sender] NVARCHAR(50) NOT NULL,
          [ContentText] NVARCHAR(MAX) NULL,
          [StructuredPayload] NVARCHAR(MAX) NULL,
          [SQLExecuted] NVARCHAR(MAX) NULL,
          [ResponseTimeMs] INT NULL,
          [Timestamp] DATETIME NOT NULL DEFAULT GETDATE(),
          CONSTRAINT [FK_AIChatMessages_AIChatSessions] FOREIGN KEY ([SessionID]) REFERENCES [dbo].[AIChatSessions] ([SessionID]) ON DELETE CASCADE
        )
      END
    `);

    // 14. Create PaymentTransactionDetails table for unified split payments
    await runQuery("Create PaymentTransactionDetails", `
      IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[PaymentTransactionDetails]') AND type in (N'U'))
      BEGIN
          CREATE TABLE [dbo].[PaymentTransactionDetails](
              [PaymentTransactionId] [uniqueidentifier] NOT NULL PRIMARY KEY DEFAULT NEWID(),
              [ReferenceType] [nvarchar](50) NOT NULL,
              [ReferenceId] [uniqueidentifier] NOT NULL,
              [PayModeId] [int] NOT NULL,
              [Amount] [decimal](18, 2) NOT NULL,
              [ReferenceNo] [nvarchar](100) NULL,
              [CreatedDate] [datetime] NOT NULL DEFAULT GETDATE(),
              [CreatedBy] [uniqueidentifier] NULL
          )
      END
    `);

    // 15. Create CustomerCreditTransactions table for credit and payment ledger history
    await runQuery("Upgrade CustomerCreditTransactions Detector", `
      IF OBJECT_ID('dbo.CustomerCreditTransactions', 'U') IS NOT NULL AND COL_LENGTH('dbo.CustomerCreditTransactions', 'BillAmount') IS NULL
      BEGIN
          DROP TABLE [dbo].[CustomerCreditTransactions]
      END
    `);

    await runQuery("Drop CustomerCreditTransactions FK Constraint", `
      IF EXISTS (SELECT * FROM sys.foreign_keys WHERE object_id = OBJECT_ID(N'[dbo].[FK_CreditTrans_Member]') AND parent_object_id = OBJECT_ID(N'[dbo].[CustomerCreditTransactions]'))
      BEGIN
          ALTER TABLE [dbo].[CustomerCreditTransactions] DROP CONSTRAINT [FK_CreditTrans_Member]
      END
    `);

    await runQuery("Create CustomerCreditTransactions", `
      IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[CustomerCreditTransactions]') AND type in (N'U'))
      BEGIN
          CREATE TABLE [dbo].[CustomerCreditTransactions](
              [TransactionId] UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
              [MemberId] UNIQUEIDENTIFIER NOT NULL,
              [SettlementId] UNIQUEIDENTIFIER NULL,
              [BillNo] NVARCHAR(50) NULL,
              [TransactionType] NVARCHAR(20) NOT NULL,
              [BillAmount] DECIMAL(18, 2) DEFAULT 0,
              [PaidAmount] DECIMAL(18, 2) DEFAULT 0,
              [OutstandingAmount] DECIMAL(18, 2) DEFAULT 0,
              [PaymentMethod] NVARCHAR(50) NULL,
              [ReferenceNo] NVARCHAR(100) NULL,
              [Status] NVARCHAR(20) DEFAULT 'OPEN',
              [Remarks] NVARCHAR(500) NULL,
              [CreatedBy] UNIQUEIDENTIFIER NULL,
              [CreatedDate] DATETIME2 NOT NULL DEFAULT GETDATE(),
              [UpdatedDate] DATETIME2 NULL
          )
      END
    `);

    await runQuery("Upgrade CustomerCreditTransactions - Add CustomerType", `
      IF COL_LENGTH('dbo.CustomerCreditTransactions', 'CustomerType') IS NULL
      BEGIN
          ALTER TABLE [dbo].[CustomerCreditTransactions] ADD [CustomerType] NVARCHAR(20) NULL
      END
    `);

    await runQuery("Index - CustomerCreditTransactions MemberId", `
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_CreditTrans_MemberId' AND object_id = OBJECT_ID('CustomerCreditTransactions'))
      BEGIN
        CREATE NONCLUSTERED INDEX IX_CreditTrans_MemberId 
        ON CustomerCreditTransactions(MemberId) 
        INCLUDE (TransactionType, OutstandingAmount, BillNo, Status)
      END
    `);

    await runQuery("Index - CustomerCreditTransactions Settlement", `
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_CreditTrans_Settlement' AND object_id = OBJECT_ID('CustomerCreditTransactions'))
      BEGIN
        CREATE NONCLUSTERED INDEX IX_CreditTrans_Settlement 
        ON CustomerCreditTransactions(SettlementId) 
        INCLUDE (TransactionType, OutstandingAmount, Status)
      END
    `);

    await runQuery("Create CustomerCreditAllocations", `
      IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[CustomerCreditAllocations]') AND type in (N'U'))
      BEGIN
          CREATE TABLE [dbo].[CustomerCreditAllocations](
              [AllocationId] UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
              [PaymentTransactionId] UNIQUEIDENTIFIER NOT NULL,
              [InvoiceTransactionId] UNIQUEIDENTIFIER NOT NULL,
              [Amount] DECIMAL(18, 2) NOT NULL,
              [CreatedDate] DATETIME2 NOT NULL DEFAULT GETDATE()
          )
      END
    `);

    await runQuery("Index - CustomerCreditAllocations PaymentTransactionId", `
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_CreditAlloc_PaymentTransactionId' AND object_id = OBJECT_ID('CustomerCreditAllocations'))
      BEGIN
        CREATE NONCLUSTERED INDEX IX_CreditAlloc_PaymentTransactionId 
        ON CustomerCreditAllocations(PaymentTransactionId)
      END
    `);

    await runQuery("Index - CustomerCreditAllocations InvoiceTransactionId", `
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_CreditAlloc_InvoiceTransactionId' AND object_id = OBJECT_ID('CustomerCreditAllocations'))
      BEGIN
        CREATE NONCLUSTERED INDEX IX_CreditAlloc_InvoiceTransactionId 
        ON CustomerCreditAllocations(InvoiceTransactionId)
      END
    `);

    // 16. Create settlement table
    await runQuery("Create settlement table", `
      IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[settlement]') AND type in (N'U'))
      BEGIN
          CREATE TABLE [dbo].[settlement](
              [Id] [int] IDENTITY(1,1) NOT NULL PRIMARY KEY,
              [OutletId] [int] NULL,
              [SettlementDate] [date] NULL,
              [CashierName] [nvarchar](100) NULL,
              [OpeningCashJSON] [nvarchar](max) NULL,
              [OpeningCashTotal] [decimal](10, 2) NULL,
              [PhysicalCashJSON] [nvarchar](max) NULL,
              [PhysicalCashTotal] [decimal](10, 2) NULL,
              [TotalSales] [decimal](10, 2) NULL,
              [TotalDiscount] [decimal](10, 2) NULL,
              [VoidAmount] [decimal](10, 2) NULL,
              [NetSales] [decimal](10, 2) NULL,
              [CashReceived] [decimal](10, 2) NULL,
              [ExpectedClosingCash] [decimal](10, 2) NULL,
              [CashVariance] [decimal](10, 2) NULL,
              [VarianceStatus] [nvarchar](50) NULL,
              [PaymentBreakdownJSON] [nvarchar](max) NULL,
              [Status] [nvarchar](50) NULL,
              [SettledBy] [nvarchar](100) NULL,
              [SettledAt] [datetime] NULL,
              [CreatedAt] [datetime] NULL,
              [UpdatedAt] [datetime] NULL
          )
      END
    `);

    // 17. Create OpeningCashDenomination table
    await runQuery("Create OpeningCashDenomination table", `
      IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[OpeningCashDenomination]') AND type in (N'U'))
      BEGIN
          CREATE TABLE [dbo].[OpeningCashDenomination](
              [Id] [int] IDENTITY(1,1) NOT NULL PRIMARY KEY,
              [CurrencyValue] [decimal](18, 2) NULL,
              [NoteCount] [int] NULL,
              [Type] [nvarchar](50) NULL,
              [CreatedBy] [nvarchar](100) NULL,
              [CreatedOn] [datetime] NULL
          )
      END
    `);

    // 18. Create CashOutEntry table
    await runQuery("Create CashOutEntry table", `
      IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[CashOutEntry]') AND type in (N'U'))
      BEGIN
          CREATE TABLE [dbo].[CashOutEntry](
              [CashOutId] [uniqueidentifier] NOT NULL PRIMARY KEY DEFAULT NEWID(),
              [CashOutNo] [nvarchar](50) NULL,
              [CashOutDate] [date] NULL DEFAULT CAST(GETDATE() AS DATE),
              [Amount] [decimal](18, 2) NULL,
              [Reason] [nvarchar](255) NULL,
              [Remarks] [nvarchar](max) NULL,
              [PaymentMode] [nvarchar](50) NULL,
              [ReferenceNo] [nvarchar](100) NULL,
              [TerminalCode] [nvarchar](50) NULL,
              [CreatedBy] [nvarchar](100) NULL,
              [CreatedOn] [datetime] NULL
          )
      END
    `);

    // 18.1 Create CashInEntry table
    await runQuery("Create CashInEntry table", `
      IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[CashInEntry]') AND type in (N'U'))
      BEGIN
          CREATE TABLE [dbo].[CashInEntry](
              [CashInId] [uniqueidentifier] NOT NULL PRIMARY KEY DEFAULT NEWID(),
              [CashInNo] [nvarchar](50) NULL,
              [CashInDate] [date] NULL DEFAULT CAST(GETDATE() AS DATE),
              [Amount] [decimal](18, 2) NULL,
              [Reason] [nvarchar](255) NULL,
              [Remarks] [nvarchar](max) NULL,
              [PaymentMode] [nvarchar](50) NULL,
              [ReferenceNo] [nvarchar](100) NULL,
              [TerminalCode] [nvarchar](50) NULL,
              [CreatedBy] [nvarchar](100) NULL,
              [CreatedOn] [datetime] NULL
          )
      END
    `);

    // Add start_date to CashInEntry and CashOutEntry for business day integration
    await runQuery("CashInEntry - start_date", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[CashInEntry]') AND name = 'start_date') ALTER TABLE [dbo].[CashInEntry] ADD start_date DATE");
    await runQuery("CashOutEntry - start_date", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[CashOutEntry]') AND name = 'start_date') ALTER TABLE [dbo].[CashOutEntry] ADD start_date DATE");

    // 19. dishOrderItemShare updates
    await runQuery("dishOrderItemShare - TargetAmount", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[dishOrderItemShare]') AND name = 'TargetAmount') ALTER TABLE [dbo].[dishOrderItemShare] ADD TargetAmount DECIMAL(18, 2) DEFAULT 0");

    // 19.1 Create DateEntry table
    await runQuery("Create DateEntry table", `
      IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[DateEntry]') AND type in (N'U'))
      BEGIN
          CREATE TABLE [dbo].[DateEntry](
              [DateEntryId] [uniqueidentifier] NOT NULL PRIMARY KEY DEFAULT NEWID(),
              [username] [varchar](30) NULL,
              [StartDate] [date] NOT NULL,
              [CreatedBy] [varchar](30) NULL,
              [CreatedDate] [datetime] DEFAULT GETDATE(),
              [UpdateBy] [varchar](30) NULL,
              [UpdateDate] [datetime] NULL
          )
      END
    `);

    // 19.2 Create BusinessDayLog table
    await runQuery("Create BusinessDayLog table", `
      IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[BusinessDayLog]') AND type in (N'U'))
      BEGIN
          CREATE TABLE [dbo].[BusinessDayLog](
              [LogId] [uniqueidentifier] NOT NULL PRIMARY KEY DEFAULT NEWID(),
              [BusinessDate] [date] NOT NULL UNIQUE,
              [StartedAt] [datetime] NULL,
              [StartedBy] [varchar](30) NULL,
              [EndedAt] [datetime] NULL,
              [EndedBy] [varchar](30) NULL
          )
      END
    `);

    // 19.3 Create BusinessDayAuditLog table
    await runQuery("Create BusinessDayAuditLog table", `
      IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[BusinessDayAuditLog]') AND type in (N'U'))
      BEGIN
          CREATE TABLE [dbo].[BusinessDayAuditLog](
              [AuditId] [uniqueidentifier] NOT NULL PRIMARY KEY DEFAULT NEWID(),
              [BusinessDate] [date] NOT NULL,
              [EventType] [varchar](20) NOT NULL,
              [EventTime] [datetime] NOT NULL DEFAULT GETDATE(),
              [ActionBy] [varchar](30) NULL,
              [Remarks] [nvarchar](255) NULL
          )
      END
    `);

    // 20. Create CashDrawerRemarks table
    await runQuery("Create CashDrawerRemarks table", `
      IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[CashDrawerRemarks]') AND type in (N'U'))
      BEGIN
          CREATE TABLE [dbo].[CashDrawerRemarks](
              [Id] [int] IDENTITY(1,1) NOT NULL PRIMARY KEY,
              [Description] [nvarchar](100) NOT NULL
          )
      END
    `);

    await runQuery("CashDrawerRemarks - Description", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[CashDrawerRemarks]') AND name = 'Description') ALTER TABLE [dbo].[CashDrawerRemarks] ADD [Description] NVARCHAR(100) NOT NULL DEFAULT ''");

    // 21. Seed default CashDrawerRemarks
    await runQuery("Seed default CashDrawerRemarks", `
      IF NOT EXISTS (SELECT TOP 1 1 FROM [dbo].[CashDrawerRemarks])
      BEGIN
          INSERT INTO [dbo].[CashDrawerRemarks] (Description) VALUES
          ('Cash In'), ('Cash Out'), ('Opening Float'),
          ('Drawer Check'), ('Other')
      END
    `);

    await runQuery("Seed Settlement in CashDrawerRemarks", "IF NOT EXISTS (SELECT 1 FROM [dbo].[CashDrawerRemarks] WHERE Description = 'Settlement') INSERT INTO [dbo].[CashDrawerRemarks] (Description) VALUES ('Settlement')");

    // 22. Create CashDrawerLog table
    await runQuery("Create CashDrawerLog table", `
      IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[CashDrawerLog]') AND type in (N'U'))
      BEGIN
          CREATE TABLE [dbo].[CashDrawerLog](
              [LogId] [uniqueidentifier] NOT NULL PRIMARY KEY DEFAULT NEWID(),
              [OutletId] [int] NOT NULL DEFAULT 1,
              [TerminalCode] [nvarchar](50) NULL,
              [ActionType] [nvarchar](30) NULL,
              [Amount] [decimal](18, 2) NULL,
              [TenderedAmount] [decimal](18, 2) NULL,
              [ChangeAmount] [decimal](18, 2) NULL,
              [OrderId] [nvarchar](100) NULL,
              [Reason] [nvarchar](100) NULL,
              [Remark] [nvarchar](500) NULL,
              [OpenedByUserId] [nvarchar](100) NULL,
              [ApprovedByUserId] [nvarchar](100) NULL,
              [OpenSource] [nvarchar](20) NOT NULL,
              [IsSuccess] [bit] NOT NULL DEFAULT 1,
              [CreatedOn] [datetime] DEFAULT GETDATE()
          )
      END
    `);

    await runQuery("CashDrawerLog - OpenSource", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[CashDrawerLog]') AND name = 'OpenSource') ALTER TABLE [dbo].[CashDrawerLog] ADD [OpenSource] NVARCHAR(20) NOT NULL DEFAULT 'MANUAL'");
    await runQuery("CashDrawerLog - OrderId", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[CashDrawerLog]') AND name = 'OrderId') ALTER TABLE [dbo].[CashDrawerLog] ADD [OrderId] NVARCHAR(100) NULL");
    await runQuery("CashDrawerLog - LogId", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[CashDrawerLog]') AND name = 'LogId') ALTER TABLE [dbo].[CashDrawerLog] ADD [LogId] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID()");
    await runQuery("CashDrawerLog - OutletId", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[CashDrawerLog]') AND name = 'OutletId') ALTER TABLE [dbo].[CashDrawerLog] ADD [OutletId] INT NOT NULL DEFAULT 1");
    await runQuery("CashDrawerLog - ActionType", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[CashDrawerLog]') AND name = 'ActionType') ALTER TABLE [dbo].[CashDrawerLog] ADD [ActionType] NVARCHAR(30) NULL");
    await runQuery("CashDrawerLog - Amount", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[CashDrawerLog]') AND name = 'Amount') ALTER TABLE [dbo].[CashDrawerLog] ADD [Amount] DECIMAL(18, 2) NULL");
    await runQuery("CashDrawerLog - TenderedAmount", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[CashDrawerLog]') AND name = 'TenderedAmount') ALTER TABLE [dbo].[CashDrawerLog] ADD [TenderedAmount] DECIMAL(18, 2) NULL");
    await runQuery("CashDrawerLog - ChangeAmount", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[CashDrawerLog]') AND name = 'ChangeAmount') ALTER TABLE [dbo].[CashDrawerLog] ADD [ChangeAmount] DECIMAL(18, 2) NULL");
    await runQuery("CashDrawerLog - Reason", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[CashDrawerLog]') AND name = 'Reason') ALTER TABLE [dbo].[CashDrawerLog] ADD [Reason] NVARCHAR(100) NULL");
    await runQuery("CashDrawerLog - Remark", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[CashDrawerLog]') AND name = 'Remark') ALTER TABLE [dbo].[CashDrawerLog] ADD [Remark] NVARCHAR(500) NULL");
    await runQuery("CashDrawerLog - OpenedByUserId", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[CashDrawerLog]') AND name = 'OpenedByUserId') ALTER TABLE [dbo].[CashDrawerLog] ADD [OpenedByUserId] NVARCHAR(100) NULL");
    await runQuery("CashDrawerLog - ApprovedByUserId", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[CashDrawerLog]') AND name = 'ApprovedByUserId') ALTER TABLE [dbo].[CashDrawerLog] ADD [ApprovedByUserId] NVARCHAR(100) NULL");
    await runQuery("CashDrawerLog - IsSuccess", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[CashDrawerLog]') AND name = 'IsSuccess') ALTER TABLE [dbo].[CashDrawerLog] ADD [IsSuccess] BIT NOT NULL DEFAULT 1");
    await runQuery("CashDrawerLog - start_date", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[CashDrawerLog]') AND name = 'start_date') ALTER TABLE [dbo].[CashDrawerLog] ADD start_date DATE");

    // 2.1 ArtistCashBox table
    await runQuery("Create ArtistCashBox table", `
      IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[ArtistCashBox]') AND type in (N'U'))
      BEGIN
          CREATE TABLE [dbo].[ArtistCashBox](
              [CashBoxId] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
              [ArtistName] NVARCHAR(255) NOT NULL,
              [Amount] DECIMAL(18, 2) NOT NULL,
              [CreatedDate] DATETIME DEFAULT GETDATE(),
              [SettlementID] UNIQUEIDENTIFIER NULL,
              [start_date] DATE NULL
          )
      END
    `);

    await runQuery("ArtistCashBox - SettlementID", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[ArtistCashBox]') AND name = 'SettlementID') ALTER TABLE [dbo].[ArtistCashBox] ADD SettlementID UNIQUEIDENTIFIER NULL");
    await runQuery("ArtistCashBox - start_date", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[ArtistCashBox]') AND name = 'start_date') ALTER TABLE [dbo].[ArtistCashBox] ADD start_date DATE NULL");

    // ============================================================
    // ARTIST INCENTIVE MANAGEMENT MODULE — Accounting Ledger Tables
    // ============================================================
    await runQuery("Create ArtistBonusMaster table", `
      IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[ArtistBonusMaster]') AND type in (N'U'))
      BEGIN
          CREATE TABLE [dbo].[ArtistBonusMaster](
              [Id]              UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
              [ThresholdAmount] DECIMAL(18, 2)   NOT NULL,
              [BonusAmount]     DECIMAL(18, 2)   NOT NULL,
              [IsRepeating]     BIT              NOT NULL DEFAULT 1,
              [IsActive]        BIT              NOT NULL DEFAULT 1,
              [ArtistDishId]    UNIQUEIDENTIFIER NULL,
              [ArtistType]      NVARCHAR(100)    NULL,
              [CreatedDate]     DATETIME                  DEFAULT GETDATE()
          )
      END
    `);

    await runQuery("Create ArtistBonusTransaction table", `
      IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[ArtistBonusTransaction]') AND type in (N'U'))
      BEGIN
          CREATE TABLE [dbo].[ArtistBonusTransaction](
              [Id]              UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
              [ArtistDishId]    UNIQUEIDENTIFIER NOT NULL,
              [ArtistName]      NVARCHAR(200)    NOT NULL,
              [SalesFromDate]   DATETIME         NOT NULL,
              [SalesToDate]     DATETIME         NOT NULL,
              [TotalSales]      DECIMAL(18, 2)   NOT NULL,
              [ThresholdAmount] DECIMAL(18, 2)   NOT NULL,
              [BonusRuleAmount] DECIMAL(18, 2)   NOT NULL,
              [BonusEarned]     DECIMAL(18, 2)   NOT NULL,
              [IsRepeating]     BIT              NOT NULL DEFAULT 1,
              [CreatedDate]     DATETIME                  DEFAULT GETDATE()
          )
      END
    `);

    await runQuery("Create ArtistBonusPayment table", `
      IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[ArtistBonusPayment]') AND type in (N'U'))
      BEGIN
          CREATE TABLE [dbo].[ArtistBonusPayment](
              [Id]                   UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
              [BonusTransactionId]   UNIQUEIDENTIFIER NOT NULL,
              [ArtistDishId]         UNIQUEIDENTIFIER NOT NULL,
              [ArtistName]           NVARCHAR(200)    NOT NULL,
              [PaymentAmount]        DECIMAL(18, 2)   NOT NULL,
              [PaidDate]             DATETIME         NOT NULL DEFAULT GETDATE(),
              [PaidBy]               NVARCHAR(100)    NOT NULL,
              [Remarks]              NVARCHAR(500)    NULL,
              [CreatedDate]          DATETIME                  DEFAULT GETDATE()
          )
      END
    `);

    await runQuery("Index - ArtistBonusTransaction ArtistDishId", `
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_ArtistBonusTxn_ArtistDishId' AND object_id = OBJECT_ID('ArtistBonusTransaction'))
      BEGIN
        CREATE NONCLUSTERED INDEX IX_ArtistBonusTxn_ArtistDishId
        ON ArtistBonusTransaction(ArtistDishId)
        INCLUDE (BonusEarned, SalesFromDate, SalesToDate)
      END
    `);

    await runQuery("Index - ArtistBonusTransaction Dates", `
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_ArtistBonusTxn_Dates' AND object_id = OBJECT_ID('ArtistBonusTransaction'))
      BEGIN
        CREATE NONCLUSTERED INDEX IX_ArtistBonusTxn_Dates
        ON ArtistBonusTransaction(SalesFromDate, SalesToDate)
      END
    `);

    await runQuery("Index - ArtistBonusPayment TransactionId", `
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_ArtistBonusPay_TxnId' AND object_id = OBJECT_ID('ArtistBonusPayment'))
      BEGIN
        CREATE NONCLUSTERED INDEX IX_ArtistBonusPay_TxnId
        ON ArtistBonusPayment(BonusTransactionId)
        INCLUDE (PaymentAmount, PaidDate)
      END
    `);

    await runQuery("Index - ArtistBonusPayment ArtistDishId", `
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_ArtistBonusPay_ArtistDishId' AND object_id = OBJECT_ID('ArtistBonusPayment'))
      BEGIN
        CREATE NONCLUSTERED INDEX IX_ArtistBonusPay_ArtistDishId
        ON ArtistBonusPayment(ArtistDishId)
        INCLUDE (PaymentAmount, PaidDate, PaidBy)
      END
    `);

  } catch (err) {
    console.error("❌ DB Initialization Failed:", err.message);
  }
}

async function syncKitchensToPrintMaster(pool) {
  try {
    const kdsCheck = await pool.request().query("SELECT COUNT(*) as cnt FROM PrintMaster WHERE PrinterType = 4 AND IsActive = 1");
    if (kdsCheck.recordset[0].cnt === 0) {
      await pool.request().query(`
        INSERT INTO PrintMaster (PrinterId, PrinterName, PrinterPath, PrinterIP, PrinterType, PrintSection, KitchenTypeName, KitchenTypeValue, IsActive, PrintCopy)
        VALUES (NEWID(), 'KDS Printer', '', '', 4, 1, 'KDS Printer', 9, 1, 1)
      `);
      console.log("🛠️ Auto-created default KDS Printer in PrintMaster.");
    }
  } catch (err) {
    console.error("❌ Kitchen Sync failed:", err.message);
  }
}

module.exports = { initDB, syncKitchensToPrintMaster };
