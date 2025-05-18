import OpenAI from "openai";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import readline from "readline/promises";
import dotenv from "dotenv";
dotenv.config();
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY is not set");
}
class MCPClient {
  mcp;
  openai;
  transport = null;
  tools = [];
  messages = [];

  // 构造函数，初始化 OpenAI 和 MCP 客户端
  constructor() {
    this.openai = new OpenAI({
      apiKey: OPENAI_API_KEY,
      baseURL: "https://api.deepseek.com/v1",
      maxRetries: 2,
      timeout: 10000, // 10 minutes
      dangerouslyAllowBrowser: true,
    });
    this.mcp = new Client({ name: "mcp-client-cli", version: "1.0.0" });
  }

  // 连接到 MCP 服务器
  async connectToServer(serverScriptPath) {
    try {
      const isJs = serverScriptPath.endsWith(".js");
      if (!isJs) {
        throw new Error("Server script must be a .js file");
      }
      const command = process.execPath;
      this.transport = new StdioClientTransport({
        command,
        args: [serverScriptPath],
      });
      this.mcp.connect(this.transport);
      const toolsResult = await this.mcp.listTools();
      this.tools = toolsResult.tools.map((tool) => {
        return {
          type: "function",
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.inputSchema,
          },
        };
      });
      console.log(
        "Connected to server with tools:",
        this.tools.map((t) => t.function.name)
      );
    } catch (e) {
      console.log("Failed to connect to MCP server: ", e);
      throw e;
    }
  }

  // 处理用户查询
  async processQuery(query) {
    this.messages.push(
      {
        role: "user",
        content: query,
      },
    );
    try {
      const response = await this.openai.chat.completions.create({
        model: "deepseek-chat",
        stream: false,
        messages: this.messages,
        tools: this.tools,
      });
      const finalText = [];
      const toolResults = [];
      const assistantMessage = response.choices[0].message;
      if (assistantMessage.content) {
        finalText.push(assistantMessage.content);
      }
      console.log(1000);
      
      if (assistantMessage.tool_calls) {
        console.log(1111);
        
        for (const toolCall of assistantMessage.tool_calls) {
          const toolName = toolCall.function.name;
          const toolArgs = JSON.parse(toolCall.function.arguments);
          const result = await this.callTool({
            name: toolName,
            arguments: toolArgs,
          });

          toolResults.push(result);
          finalText.push(
            `[Calling tool ${toolName} with args ${JSON.stringify(toolArgs)}]`
          );

          this.messages.push({
            role: "assistant",
            content: assistantMessage.content || "",
            tool_calls: assistantMessage.tool_calls,
          });
          this.messages.push({
            role: "tool",
            name: toolName,
            content: JSON.stringify(result.content),
            tool_call_id: toolCall.id,
          });
          const secondResponse = await this.openai.chat.completions.create({
            model: "deepseek-chat",
            max_tokens: 1000,
            messages:this.messages,
          });
          if (secondResponse.choices[0].message.content) {
            finalText.push(secondResponse.choices[0].message.content);
          }
        }
      }

      console.log(finalText.join("\n"));
      return finalText.join("\n");
    } catch (e) {
      console.log("Failed to process query: ", e);
      throw e;
    }
  }

  // 列出所有工具
  async listTools() {
    try {
      const result = await this.mcp.listTools();
      console.log("Available tools:", result.tools);
      return result.tools;
    } catch (e) {
      console.log("Failed to list tools:", e);
      throw e;
    }
  }

  // 调用工具
  async callTool(tool) {
    try {
      const result = await this.mcp.callTool(tool);
      console.log("Tool result:", result);
      return result;
    } catch (e) {
      console.log("Failed to call tool:", e);
      throw e;
    }
  }

  // 列出所有资源
  async listResources() {
    try {
      const result = await this.mcp.listResources();
      console.log("Available resources:", result);
      return result.resources;
    } catch (e) {
      console.log("Failed to list resources:", e);
      throw e;
    }
  }

  // 读取指定资源的内容
  async readResource(resourceUri, variable) {
    try {
      const result = await this.mcp.readResource({
        uri: resourceUri,
      });
      console.log("Resource content:", result);
      return result.content;
    } catch (e) {
      console.log("Failed to read resource:", e);
      throw e;
    }
  }

  // 列出所有提示
  async listPrompts() {
    try {
      const result = await this.mcp.listPrompts();
      console.log("Available prompts:", result);
      return result.prompts;
    } catch (e) {
      console.log("Failed to list prompts:", e);
      throw e;
    }
  }

  // 调用指定提示
  async callPrompt(name, language) {
    try {
      const result = await this.mcp.getPrompt({
        name: "greet",
        arguments: { name, language },
      });
      console.log("Prompt result:", result.messages);
      return result.content;
    } catch (e) {
      console.log("Failed to call prompt:", e);
      throw e;
    }
  }

  // 启动聊天循环，处理用户输入的命令
  async chatLoop() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    console.log("\nAvailable commands:");
    console.log("tools - List all tools");
    console.log("list - List all resources");
    console.log("prompts - List all prompts");
    console.log("prompt <name> <args> - Call a prompt");
    console.log("read <uri> - Read a resource");
    console.log("q - Exit");

    while (true) {
      const input = await rl.question("\nCommand: ");
      const [command, ...args] = input.trim().split(/\s+/);

      switch (command.toLowerCase()) {
        case "tools":
          await this.listTools();
          break;

        case "list":
          await this.listResources();
          break;

        case "prompts":
          await this.listPrompts();
          break;

        case "prompt":
          if (args.length < 1) {
            console.log("Usage: prompt <name> [args]");
            break;
          }
          await this.callPrompt(args[0], args[1]);
          break;

        case "read":
          if (args.length === 0) {
            console.log("Usage: read <resource-uri>");
            break;
          }
          await this.readResource(args[0], args[1]);
          break;

        case "q":
          return;

        default:
          await this.processQuery(input);
      }
    }
  }

  // 清理资源，关闭 MCP 连接
  async cleanup() {
    await this.mcp.close();
  }
}

// 主函数，程序入口点
async function main() {
  if (process.argv.length < 3) {
    console.log("Usage: node index.ts <path_to_server_script>");
    return;
  }
  const mcpClient = new MCPClient();
  try {
    await mcpClient.connectToServer(process.argv[2]);
    await mcpClient.chatLoop();
  } finally {
    await mcpClient.cleanup();
    process.exit(0);
  }
}
main();