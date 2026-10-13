
import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Pool } from "pg";
import { z } from "zod";

const db = new Pool({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
});

const server = new McpServer({
  name: "sanjivani-farmer-server",
  version: "1.0.0",
});

server.registerTool(
  "get_farmer_data",
  {
    description:
      "Retrieve farmer names, villages, sugarcane supplied in tons, " +
      "amount paid, and pending payments from PostgreSQL.",
    inputSchema: {
      question: z.string().describe("The farmer information requested"),
    },
  },
  async ({ question }) => {
    try {
      const result = await db.query(`
        SELECT farmer_id, name, village, sugarcane_tons,
               payment_pending, amount_paid
        FROM farmers
        ORDER BY payment_pending DESC
      `);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              question,
              farmers: result.rows,
            }),
          },
        ],
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);

      console.error("PostgreSQL error:", message);

      return {
        isError: true,
        content: [{ type: "text", text: message }],
      };
    }
  }
);

const transport = new StdioServerTransport();

async function main() {
  try {
    await db.query("SELECT 1");
    console.error("PostgreSQL connected successfully.");

    await server.connect(transport);
    console.error("MCP server started successfully.");
  } catch (error) {
    console.error("Server startup error:", error);
    await db.end();
    process.exitCode = 1;
  }
}

main();
