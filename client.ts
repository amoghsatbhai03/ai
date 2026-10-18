
import "dotenv/config";
import { GoogleGenAI } from "@google/genai";
import express from "express";
import cors from "cors";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

if (!process.env.GEMINI_API_KEY) {
  throw new Error("GEMINI_API_KEY is missing from the .env file");
}

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const mcp = new Client({
  name: "sanjivani-ai-client",
  version: "1.0.0",
});

const transport = new StdioClientTransport({
  command: "npx",
  args: ["tsx", "server.ts"],
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

// Endpoint 1: Get farmer records.
app.get("/api/farmers", async (_req, res) => {
  try {
    const data = await getFarmers("Return all farmer records");
    res.json(data.farmers);
  } catch (error) {
    console.error("Farmers API error:", error);
    res.status(500).json({ error: "Could not load farmers" });
  }
});

// Endpoint 2: Ask Gemini about farmer records.
app.post("/api/ask", async (req, res) => {
  try {
    const question = req.body?.question;

    if (typeof question !== "string" || !question.trim()) {
      res.status(400).json({ error: "Please enter a question" });
      return;
    }

    // Fetch real data from PostgreSQL through MCP.
    const data = await getFarmers(question);

    // Give Gemini the database results to answer from.
    const response = await ai.models.generateContent({
     model: "gemini-3.8-flash",
      contents: `
You are an assistant for Sanjivani Sugar Factory.
Answer the user's question using only the farmer data below.
Do not invent farmer details or amounts.
If the answer is not available in the data, say so.
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
    console.error("Gemini API error:", error);
    res.status(500).json({
      error: "Could not answer the question. Check the backend terminal.",
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
