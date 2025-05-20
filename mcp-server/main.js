import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// 创建一个McpServer实例，名称为"Demo"，版本为"1.0.0"
const server = new McpServer({
  name: "Demo",
  version: "1.0.0",
});

// 定义一个名为"add"的工具，接受两个数字参数a和b，返回它们的和加1
server.tool(
  "add",
  "张三计算法",
  { a: z.number(), b: z.number() },
  async ({ a, b }) => ({
    content: [{ type: "text", text: String(a + b + 1) }],
  })
);

// 定义一个名为"Choose"的工具，接受一个数组，返回最终的选择结果
server.tool(
  "Choose",
  "张三选择法",
  { arr: z.array(z.any()) },
  async ({ arr }) => {
    // 选择数组中 quote 最小的元素
    arr.sort((a, b) => a.quote - b.quote);
    const result = arr[0];
    return {
      content: [
        {
          type: "text",
          text: `选择结果：${result.name}，报价：${result.quote}，吃亏是福`,
        },
      ],
    };
  }
);

// 定义一个名为"greeting"的资源，根据{name}参数生成问候信息
server.resource(
  "greeting",
  new ResourceTemplate("greeting://{name}", {
    list: async () => ({
      resources: [
        {
          uri: "greeting://world",
          name: "这是一个描述",
        },
      ],
    }),
  }),
  async (uri, { name }) => ({
    contents: [
      {
        uri: uri.href, // 确保 uri.href 是字符串
        text: `Hello, ${name}!`,
      },
    ],
  })
);

// 根据前缀value获取用户ID列表
const completeUserId = async (value) => {
  const response = await fetch("http://localhost:3000/users");
  const users = await response.json();
  return users
    .filter((user) => user.id.startsWith(value))
    .map((user) => user.id);
};

// 创建一个名为"user"的资源模板，支持用户列表请求和用户ID自动完成
const userResourceTemplate = new ResourceTemplate("user://{userId}", {
  list: async () => ({
    resources: [
      {
        uri: "user://all",
        name: "请求server获取用户列表",
      },
    ],
  }),
  complete: {
    userId: completeUserId,
  },
});

// 定义一个名为"user"的资源，根据{userId}参数获取用户信息
server.resource("user", userResourceTemplate, async (uri, { userId }) => {
  let response;
  if (userId !== "all") {
    response = await fetch(`http://localhost:3000/users?id=${userId}`);
  } else {
    response = await fetch(`http://localhost:3000/users`);
  }
  const user = await response.json();
  return {
    contents: [
      {
        uri: uri.href, // 确保 uri.href 是字符串
        text: JSON.stringify(user),
      },
    ],
  };
});

// 定义一个名为"greet"的提示，生成问候消息，支持多种语言
server.prompt(
  "greet",
  "Generate a greeting message",
  {
    name: z.string().describe("Name to greet"),
    language: z.enum(["en", "zh", "es"]).describe("Language for greeting"),
  },
  async ({ name, language }) => {
    const greetings = {
      en: `Hello, ${name}!`,
      zh: `你好，${name}！`,
      es: `¡Hola, ${name}!`,
    };
    return {
      messages: [
        {
          role: "assistant",
          content: {
            type: "text",
            text: greetings[language],
          },
        },
      ],
    };
  }
);

// 使用StdioServerTransport创建一个传输实例，并将server连接到该传输实例
const transport = new StdioServerTransport();
await server.connect(transport);
