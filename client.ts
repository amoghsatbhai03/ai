
import "dotenv/config";
import OpenAI from "openai";
import express from "express";
import cors from "cors";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
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

// Endpoint 1: Get farmers from PostgreSQL through MCP.
app.get("/api/farmers", async (_req, res) => {
  try {
    const data = await getFarmers("Return all farmer records");
    res.json(data.farmers);
  } catch (error) {
    console.error("Farmers API error:", error);
    res.status(500).json({ error: "Could not load farmers" });
  }
});

// Endpoint 2: Ask an AI question about farmers.
app.post("/api/ask", async (req, res) => {
  try {
    const question = req.body?.question;

    if (typeof question !== "string" || !question.trim()) {
      res.status(400).json({ error: "Please enter a question" });
      return;
    }

    const { tools } = await mcp.listTools();

    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: question,
      tools: tools.map(tool => ({
        type: "function" as const,
        name: tool.name,
        description: tool.description ?? "",
        parameters: tool.inputSchema,
        strict: false,
      })),
      tool_choice: "required",
    });

    const outputs = [];

    for (const item of response.output) {
      if (item.type !== "function_call") continue;

      const result = await mcp.callTool({
        name: item.name,
        arguments: JSON.parse(item.arguments),
      });

      if (result.isError) {
        throw new Error(JSON.stringify(result.content));
      }

      const content = result.content as Array<{
        type: string;
        text?: string;
      }>;

      outputs.push({
        type: "function_call_output" as const,
        call_id: item.call_id,
        output: content
          .filter(part => part.type === "text")
          .map(part => part.text ?? "")
          .join("\n"),
      });
    }

    if (outputs.length === 0) {
      throw new Error("OpenAI did not request the farmer tool");
    }

    const answer = await openai.responses.create({
      model: "gpt-4.1-mini",
      previous_response_id: response.id,
      input: outputs,
    });

    res.json({ answer: answer.output_text });
  } catch (error) {
    console.error("AI API error:", error);
    res.status(500).json({
      error: "Could not answer the question. Check the backend terminal.",
    });
  }
});

async function main() {
  await mcp.connect(transport);
  console.log("MCP client connected.");

  app.listen(3000, () => {
    console.log("Backend running at http://localhost:3000");
  });
}

main().catch(error => {
  console.error("Backend startup error:", error);
  process.exitCode = 1;
});
