import {
RetryError
} from "../chunk-e99bee320a6e98be.js";

// src/plugins/cli.ts
import {input} from "@inquirer/prompts";
import chalk from "chalk";
var cli = function({
  simulateStream = true
} = {}) {
  return {
    name: "cli",
    setup(aibitat) {
      let printing = [];
      aibitat.onError(async (error2) => {
        console.error(chalk.red(`   error: ${error2.message}`));
        if (error2 instanceof RetryError) {
          console.error(chalk.red(`   retrying in 60 seconds...`));
          setTimeout(() => {
            aibitat.retry();
          }, 60000);
          return;
        }
      });
      aibitat.onStart(() => {
        console.log();
        console.log(`\uD83D\uDE80 starting chat ...
`);
        console.time("\uD83D\uDE80 chat finished!");
        printing = [Promise.resolve()];
      });
      aibitat.onMessage(async (message) => {
        const next = new Promise(async (resolve) => {
          await Promise.all(printing);
          await cli.print(message, simulateStream);
          resolve();
        });
        printing.push(next);
      });
      aibitat.onTerminate(async () => {
        await Promise.all(printing);
        console.timeEnd("\uD83D\uDE80 chat finished");
      });
      aibitat.onInterrupt(async (node) => {
        await Promise.all(printing);
        const feedback = await cli.askForFeedback(node);
        console.log();
        if (feedback === "exit") {
          console.timeEnd("\uD83D\uDE80 chat finished");
          return process.exit(0);
        }
        await aibitat.continue(feedback);
      });
    }
  };
};
cli.print = async (message, simulateStream = true) => {
  const replying = chalk.dim(`(to ${message.to})`);
  const reference = `${chalk.magenta("\u270E")} ${chalk.bold(message.from)} ${replying}:`;
  if (!simulateStream) {
    console.log(reference);
    console.log(message.content);
    console.log();
    return;
  }
  process.stdout.write(`${reference}\n`);
  const chunks = message.content?.split(" ") || [];
  const stream = new ReadableStream({
    async start(controller) {
      for (const chunk of chunks) {
        const bytes = new TextEncoder().encode(chunk + " ");
        controller.enqueue(bytes);
        await new Promise((r) => setTimeout(r, Math.floor(Math.random() * 40) + 10));
      }
      controller.close();
    }
  });
  for await (const chunk of stream) {
    process.stdout.write(new TextDecoder().decode(chunk));
  }
  console.log();
  console.log();
};
cli.askForFeedback = (node) => {
  return input({
    message: `Provide feedback to ${chalk.yellow(node.to)} as ${chalk.yellow(node.from)}. Press enter to skip and use auto-reply, or type 'exit' to end the conversation: `
  });
};
// src/plugins/web-browsing.ts
import {loadSummarizationChain} from "langchain/chains";
import {ChatOpenAI} from "langchain/chat_models/openai";
import {PromptTemplate} from "langchain/prompts";
import {RecursiveCharacterTextSplitter} from "langchain/text_splitter";
import {NodeHtmlMarkdown} from "node-html-markdown";
async function search(query, options = {}) {
  console.log("\uD83D\uDD25 ~ Searching on Google...");
  const url = "https://google.serper.dev/search";
  const payload = JSON.stringify({
    q: query
  });
  const headers = {
    "X-API-KEY": options.serperApiKey || process.env.SERPER_API_KEY,
    "Content-Type": "application/json"
  };
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: payload
  });
  return response.text();
}
async function scrape(url) {
  console.log("\uD83D\uDD25 Scraping website...", url);
  const headers = {
    "Cache-Control": "no-cache",
    "Content-Type": "application/json"
  };
  const data = {
    url
  };
  const data_json = JSON.stringify(data);
  const response = await fetch(`https://chrome.browserless.io/content?token=${process.env.BROWSERLESS_TOKEN}`, {
    method: "POST",
    headers,
    body: data_json
  });
  if (response.status !== 200) {
    console.log("\uD83D\uDD25 ~ error", data);
    console.log("\uD83D\uDD25 ~ error", response);
    return `HTTP request failed with status code "${response.status}: ${response.statusText}"`;
  }
  const html = await response.text();
  const text = NodeHtmlMarkdown.translate(html);
  if (text.length <= 8000) {
    return text;
  }
  console.log("\uD83D\uDD25 Text is too long. Summarizing...", text);
  return summarize(text);
}
async function summarize(content) {
  const llm = new ChatOpenAI({
    temperature: 0,
    modelName: "gpt-3.5-turbo-16k-0613"
  });
  const textSplitter = new RecursiveCharacterTextSplitter({
    separators: ["\n\n", "\n"],
    chunkSize: 1e4,
    chunkOverlap: 500
  });
  const docs = await textSplitter.createDocuments([content]);
  const mapPrompt = `
    Write a detailed summary of the following text for a research purpose:
    "{text}"
    SUMMARY:
    `;
  const mapPromptTemplate = new PromptTemplate({
    template: mapPrompt,
    inputVariables: ["text"]
  });
  const chain = loadSummarizationChain(llm, {
    type: "map_reduce",
    combinePrompt: mapPromptTemplate,
    combineMapPrompt: mapPromptTemplate,
    verbose: true
  });
  const res = await chain.call({
    input_documents: docs
  });
  return res.text;
}
function experimental_webBrowsing({} = {}) {
  return {
    name: "web-browsing-plugin",
    setup(aibitat) {
      aibitat.function({
        name: "web-browsing",
        description: "Searches for a given query online or navigate to a given url.",
        parameters: {
          $schema: "http://json-schema.org/draft-07/schema#",
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "A search query."
            },
            url: {
              type: "string",
              format: "uri",
              description: "A web URL."
            }
          },
          oneOf: [{ required: ["query"] }, { required: ["url"] }],
          additionalProperties: false
        },
        async handler({ query, url }) {
          console.log("\uD83D\uDD25 ~ Browsing on the internet");
          if (url) {
            return await scrape(url);
          }
          return await search(query);
        }
      });
    }
  };
}
// src/plugins/file-history.ts
import fs from "fs";
import path from "path";
function fileHistory({
  filename = `history/chat-history-${new Date().toISOString()}.json`
} = {}) {
  return {
    name: "file-history-plugin",
    setup(aibitat) {
      const folderPath = path.dirname(filename);
      if (folderPath) {
        fs.mkdirSync(folderPath, { recursive: true });
      }
      aibitat.onMessage(() => {
        const content = JSON.stringify(aibitat.chats, null, 2);
        if (typeof Bun !== "undefined") {
          return Bun.write(filename, content);
        }
        fs.writeFile(filename, content, (err) => {
          if (err) {
            console.error(err);
          }
        });
      });
    }
  };
}
export {
  summarize,
  scrape,
  fileHistory,
  experimental_webBrowsing,
  cli
};
