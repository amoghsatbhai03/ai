
import "dotenv/config";
import { GoogleGenAI } from "@google/genai";
import express from "express";
import cors from "cors";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

if (!process.env.GEMINI_API_KEY) {
  throw new Error("GEMINI_API_KEY is missing from the environment");
}

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

console.error("Client environment check:", {
  PGHOST: process.env.PGHOST || "MISSING",
  PGPORT: process.env.PGPORT || "MISSING",
  PGDATABASE: process.env.PGDATABASE || "MISSING",
  PGUSER: process.env.PGUSER || "MISSING",
  PGPASSWORD: process.env.PGPASSWORD ? "SET" : "MISSING",
});

const mcp = new Client({
  name: "sanjivani-ai-client",
  version: "1.0.0",
});

const transport = new StdioClientTransport({
  command: "npx",
  args: ["tsx", "server.ts"],
  env: {
    ...process.env,
    PGHOST: process.env.PGHOST ?? "",
    PGPORT: process.env.PGPORT ?? "5432",
    PGDATABASE: process.env.PGDATABASE ?? "",
    PGUSER: process.env.PGUSER ?? "",
    PGPASSWORD: process.env.PGPASSWORD ?? "",
  },
});

const app = express();
app.use(cors());
app.use(express.json());

async function getFarmers(question: string) {
  const result = await mcp.callTool({
    name: "get_farmer_data",
    arguments: { question },
  });

  if (result.isError) {
    throw new Error(JSON.stringify(result.content));
  }

  const content = result.content as Array<{
    type: string;
    text?: string;
  }>;

  const text = content
    .filter(part => part.type === "text")
    .map(part => part.text ?? "")
    .join("\n");

  return JSON.parse(text) as {
    question: string;
    farmers: Array<{
      farmer_id: number;
      name: string;
      village: string;
      sugarcane_tons: string | number;
      payment_pending: string | number;
      amount_paid: string | number;
    }>;
  };
}

app.get("/api/farmers", async (_req, res) => {
  try {
    const data = await getFarmers("Return all farmer records");
    res.json(data.farmers);
  } catch (error) {
    console.error("Farmers API error:", error);
    res.status(500).json({ error: "Could not load farmers" });
  }
});

app.post("/api/ask", async (req, res) => {
  try {
    const question = req.body?.question;

    if (typeof question !== "string" || !question.trim()) {
      res.status(400).json({ error: "Please enter a question" });
      return;
    }

    const data = await getFarmers(question);

    const response = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: `
You are an assistant for Sanjivani Sugar Factory.
Answer using only the farmer data below.
Do not invent farmer details or amounts.
If the answer is unavailable, say so.
Format your answer clearly.

Farmer data:
${JSON.stringify(data.farmers, null, 2)}

User question:
${question}
`,
    });

    res.json({
      answer: response.text ?? "No answer was generated.",
    });
  } catch (error) {
    console.error("Question API error:", error);
    res.status(500).json({
      error: "Could not answer the question. Check the backend logs.",
    });
  }
});

async function main() {
  await mcp.connect(transport);
  console.log("MCP client connected.");

  const port = Number(process.env.PORT) || 3000;

  app.listen(port, "0.0.0.0", () => {
    console.log(`Backend running on port ${port}`);
  });
}

main().catch(error => {
  console.error("Backend startup error:", error);
  process.exitCode = 1;
});
