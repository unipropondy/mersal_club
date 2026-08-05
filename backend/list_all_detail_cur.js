const { poolPromise } = require("./config/db");

async function check() {
  try {
    const pool = await poolPromise;
    
    console.log("\n=== All RestaurantOrderCur Rows ===");
    const orders = await pool.request().query("SELECT OrderId, OrderNumber, Tableno, isOrderClosed, TotalAmount, CreatedOn FROM RestaurantOrderCur");
    console.table(orders.recordset);

    console.log("\n=== All RestaurantOrderDetailCur Rows ===");
    const details = await pool.request().query("SELECT OrderDetailId, OrderId, OrderNumber, Description, Quantity, PricePerUnit, StatusCode, CreatedOn FROM RestaurantOrderDetailCur");
    console.table(details.recordset);

  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}

check();
