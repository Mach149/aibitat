import {
APIError,
RetryError
} from "./chunk-e99bee320a6e98be.js";

// src/index.ts
import {EventEmitter} from "events";

// src/providers/ai-provider.ts
class Provider {
  _client;
  constructor(client) {
    this._client = client;
  }
  get client() {
    return this._client;
  }
}
// src/providers/anthropic.ts
import Anthropic from "@anthropic-ai/sdk";
class AnthropicProvider extends Provider {
  model;
  constructor(config = {}) {
    const {
      options = {
        anthropicApiKey: config.apiKey || process.env.ANTHROPIC_API_KEY,
        maxRetries: 3
      },
      model = "claude-2"
    } = config;
    const client = new Anthropic(options);
    super(client);
    this.model = model;
  }
  async complete(messages, functions) {
    const promptMessages = [...messages];
    if (functions) {
      const functionPrompt = this.getFunctionPrompt(functions);
      promptMessages.splice(1, 0, {
        content: functionPrompt,
        role: "system"
      });
    }
    const prompt = promptMessages.map((message) => {
      const { content, role } = message;
      switch (role) {
        case "system":
          return content ? `${Anthropic.HUMAN_PROMPT} <admin>${content}</admin>` : "";
        case "function":
        case "user":
          return `${Anthropic.HUMAN_PROMPT} ${content}`;
        case "assistant":
          return `${Anthropic.AI_PROMPT} ${content}`;
        default:
          return content;
      }
    }).filter(Boolean).join("\n").concat(` ${Anthropic.AI_PROMPT}`);
    try {
      const response = await this.client.completions.create({
        model: this.model,
        max_tokens_to_sample: 3000,
        stream: false,
        prompt
      });
      const result = response.completion.trim();
      const cost = 0;
      if (result.includes("function_name") && functions) {
        let functionCall;
        try {
          functionCall = JSON.parse(result);
        } catch (error2) {
          return await this.complete([
            ...messages,
            {
              role: "function",
              content: `You gave me this function call: ${result} but I couldn't parse it.
                ${error2.message}
                
                Please try again.`
            }
          ], functions);
        }
        return {
          result: null,
          functionCall,
          cost
        };
      }
      return {
        result,
        cost
      };
    } catch (error2) {
      if (error2 instanceof Anthropic.RateLimitError || error2 instanceof Anthropic.InternalServerError || error2 instanceof Anthropic.APIError) {
        throw new RetryError(error2.message);
      }
      throw error2;
    }
  }
  getFunctionPrompt(functions) {
    const functionPrompt = `<functions>You have been trained to directly call a Javascript function passing a JSON Schema parameter as a response to this chat. This function will return a string that you can use to keep chatting.
  
  Here is a list of functions available to you:
  ${JSON.stringify(functions, null, 2)}
  
  When calling any of those function in order to complete your task, respond only this JSON format. Do not include any other information or any other stuff.
  
  Function call format:
  {
     function_name: "givenfunctionname",
     parameters: {}
  }
  </functions>`;
    return functionPrompt;
  }
}
// src/providers/openai.ts
import OpenAI from "openai";
class OpenAIProvider extends Provider {
  model;
  static COST_PER_TOKEN = {
    "gpt-4-1106-preview": {
      input: 0.01,
      output: 0.03
    },
    "gpt-4": {
      input: 0.03,
      output: 0.06
    },
    "gpt-4-32k": {
      input: 0.06,
      output: 0.12
    },
    "gpt-3.5-turbo": {
      input: 0.0015,
      output: 0.002
    },
    "gpt-3.5-turbo-16k": {
      input: 0.003,
      output: 0.004
    }
  };
  constructor(config = {}) {
    const {
      options = {
        apiKey: config.apiKey || process.env.OPENAI_API_KEY,
        maxRetries: 3,
        dangerouslyAllowBrowser: true
      },
      model = "gpt-4-1106-preview"
    } = config;
    const client = new OpenAI(options);
    super(client);
    this.model = model;
  }
  async complete(messages, functions) {
    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages,
        functions
      });
      const completion = response.choices[0].message;
      const cost = this.getCost(response.usage);
      if (completion.function_call) {
        let functionArgs;
        try {
          functionArgs = JSON.parse(completion.function_call.arguments);
        } catch (error3) {
          return this.complete([
            ...messages,
            {
              role: "function",
              name: completion.function_call.name,
              function_call: completion.function_call,
              content: error3.message
            }
          ], functions);
        }
        return {
          result: null,
          functionCall: {
            name: completion.function_call.name,
            arguments: functionArgs
          },
          cost
        };
      }
      return {
        result: completion.content,
        cost
      };
    } catch (error3) {
      if (error3 instanceof OpenAI.RateLimitError || error3 instanceof OpenAI.InternalServerError || error3 instanceof OpenAI.APIError) {
        throw new RetryError(error3.message);
      }
      throw error3;
    }
  }
  getCost(usage) {
    if (!usage) {
      return Number.NaN;
    }
    const modelBase = this.model.replace(/-(\d{4})$/, "");
    if (!(modelBase in OpenAIProvider.COST_PER_TOKEN)) {
      return Number.NaN;
    }
    const costPerToken = OpenAIProvider.COST_PER_TOKEN[modelBase];
    const inputCost = usage.prompt_tokens / 1000 * costPerToken.input;
    const outputCost = usage.completion_tokens / 1000 * costPerToken.output;
    return inputCost + outputCost;
  }
}
// src/index.ts
class AIbitat {
  emitter = new EventEmitter;
  defaultProvider;
  defaultInterrupt;
  maxRounds;
  _chats;
  agents = new Map;
  channels = new Map;
  functions = new Map;
  constructor(props = {}) {
    const {
      chats = [],
      interrupt = "NEVER",
      maxRounds = 100,
      provider = "openai",
      ...rest
    } = props;
    this._chats = chats;
    this.defaultInterrupt = interrupt;
    this.maxRounds = maxRounds;
    this.defaultProvider = {
      provider,
      ...rest
    };
  }
  get chats() {
    return this._chats;
  }
  use(plugin) {
    plugin.setup(this);
    return this;
  }
  agent(name, config = {}) {
    this.agents.set(name, config);
    return this;
  }
  channel(name, members, config = {}) {
    this.channels.set(name, {
      members,
      ...config
    });
    return this;
  }
  getAgentConfig(agent) {
    const config = this.agents.get(agent);
    if (!config) {
      throw new Error(`Agent configuration "${agent}" not found`);
    }
    return {
      role: "You are a helpful AI assistant.",
      ...config
    };
  }
  getChannelConfig(channel) {
    const config = this.channels.get(channel);
    if (!config) {
      throw new Error(`Channel configuration "${channel}" not found`);
    }
    return {
      maxRounds: 10,
      role: "",
      ...config
    };
  }
  getGroupMembers(node) {
    const group = this.getChannelConfig(node);
    return group.members;
  }
  onTerminate(listener) {
    this.emitter.on("terminate", listener);
    return this;
  }
  terminate(node) {
    this.emitter.emit("terminate", node, this);
  }
  onInterrupt(listener) {
    this.emitter.on("interrupt", listener);
    return this;
  }
  interrupt(route) {
    this._chats.push({
      ...route,
      state: "interrupt"
    });
    this.emitter.emit("interrupt", route, this);
  }
  onMessage(listener) {
    this.emitter.on("message", listener);
    return this;
  }
  newMessage(message) {
    const chat = {
      ...message,
      state: "success"
    };
    this._chats.push(chat);
    this.emitter.emit("message", chat, this);
  }
  onError(listener) {
    this.emitter.on("replyError", listener);
    return this;
  }
  newError(route, error4) {
    const chat = {
      ...route,
      content: error4 instanceof Error ? error4.message : String(error4),
      state: "error"
    };
    this._chats.push(chat);
    this.emitter.emit("replyError", error4, chat);
  }
  onStart(listener) {
    this.emitter.on("start", listener);
    return this;
  }
  async start(message) {
    this.newMessage(message);
    this.emitter.emit("start", message, this);
    await this.chat({
      to: message.from,
      from: message.to
    });
    return this;
  }
  async chat(route, keepAlive = true) {
    if (this.channels.get(route.from)) {
      let nextNode;
      try {
        nextNode = await this.selectNext(route.from);
      } catch (error4) {
        if (error4 instanceof APIError) {
          return this.newError({ from: route.from, to: route.to }, error4);
        }
        throw error4;
      }
      if (!nextNode) {
        this.terminate(route.from);
        return;
      }
      const nextChat = {
        from: nextNode,
        to: route.from
      };
      if (this.shouldAgentInterrupt(nextNode)) {
        this.interrupt(nextChat);
        return;
      }
      const history = this.getHistory({ to: route.from });
      const group = this.getGroupMembers(route.from);
      const rounds = history.filter((chat) => group.includes(chat.from)).length;
      const { maxRounds } = this.getChannelConfig(route.from);
      if (rounds >= maxRounds) {
        this.terminate(route.to);
        return;
      }
      await this.chat(nextChat);
      return;
    }
    let reply;
    try {
      reply = await this.reply(route);
    } catch (error4) {
      if (error4 instanceof APIError) {
        return this.newError({ from: route.from, to: route.to }, error4);
      }
      throw error4;
    }
    if (reply === "TERMINATE" || this.hasReachedMaximumRounds(route.from, route.to)) {
      this.terminate(route.to);
      return;
    }
    const newChat = { to: route.from, from: route.to };
    if (reply === "INTERRUPT" || this.agents.get(route.to) && this.shouldAgentInterrupt(route.to)) {
      this.interrupt(newChat);
      return;
    }
    if (keepAlive) {
      await this.chat(newChat, true);
    }
  }
  shouldAgentInterrupt(agent) {
    const config = this.getAgentConfig(agent);
    return this.defaultInterrupt === "ALWAYS" || config.interrupt === "ALWAYS";
  }
  async selectNext(channel) {
    const nodes = this.getGroupMembers(channel);
    const channelConfig = this.getChannelConfig(channel);
    if (nodes.length < 3) {
      console.warn(`- Group (${channel}) is underpopulated with ${nodes.length} agents. Direct communication would be more efficient.`);
    }
    const availableNodes = nodes.filter((node) => !this.hasReachedMaximumRounds(channel, node));
    const lastChat = this._chats.filter((c) => c.to === channel).at(-1);
    if (lastChat) {
      const index = availableNodes.indexOf(lastChat.from);
      if (index > -1) {
        availableNodes.splice(index, 1);
      }
    }
    if (!availableNodes.length) {
      return;
    }
    const provider = this.getProviderForConfig({
      model: "gpt-4-1106-preview",
      ...this.defaultProvider,
      ...channelConfig
    });
    const history = this.getHistory({ to: channel });
    const messages = [
      {
        role: "system",
        content: channelConfig.role
      },
      {
        role: "user",
        content: `You are in a role play game. The following roles are available:
${availableNodes.map((node) => `@${node}: ${this.getAgentConfig(node).role}`).join("\n")}.

Read the following conversation.

CHAT HISTORY
${history.map((c) => `@${c.from}: ${c.content}`).join("\n")}

Then select the next role from that is going to speak next. 
Only return the role.
`
      }
    ];
    const { result } = await provider.complete(messages);
    const name = result.replace(/^@/g, "");
    if (this.agents.get(name)) {
      return name;
    }
    return availableNodes[Math.floor(Math.random() * availableNodes.length)];
  }
  hasReachedMaximumRounds(from, to) {
    return this.getHistory({ from, to }).length >= this.maxRounds;
  }
  async reply(route) {
    const fromConfig = this.getAgentConfig(route.from);
    const chatHistory = this.channels.get(route.to) ? [
      {
        role: "user",
        content: `You are in a chat room. Read the following conversation (if there is one) and then reply. 
Do not add introduction or conclusion to your reply because this will be a continuous conversation. Don't introduce yourself.

CHAT HISTORY
${this.getHistory({ to: route.to }).map((c) => `@${c.from}: ${c.content}`).join("\n")}

@${route.from}:`
      }
    ] : this.getHistory(route).map((c) => ({
      content: c.content,
      role: c.from === route.to ? "user" : "assistant"
    }));
    const messages = [
      {
        content: fromConfig.role,
        role: "system"
      },
      ...chatHistory
    ];
    const functions = fromConfig.functions?.map((name) => this.functions.get(name)).filter((a) => !!a);
    const provider = this.getProviderForConfig({
      ...this.defaultProvider,
      ...fromConfig
    });
    const content = await this.handleExecution(provider, messages, functions);
    this.newMessage({ ...route, content });
    return content;
  }
  async handleExecution(provider, messages, functions) {
    const completion = await provider.complete(messages, functions);
    if (completion.functionCall) {
      const { name, arguments: args } = completion.functionCall;
      const fn = this.functions.get(name);
      if (!fn) {
        return await this.handleExecution(provider, [
          ...messages,
          {
            name,
            role: "function",
            content: `Function "${name}" not found. Try again.`
          }
        ], functions);
      }
      const result = await fn.handler(args);
      return await this.handleExecution(provider, [
        ...messages,
        {
          name,
          role: "function",
          content: result
        }
      ], functions);
    }
    return completion.result;
  }
  async continue(feedback) {
    const lastChat = this._chats.at(-1);
    if (!lastChat || lastChat.state !== "interrupt") {
      throw new Error("No chat to continue");
    }
    this._chats.pop();
    const { from, to } = lastChat;
    if (this.hasReachedMaximumRounds(from, to)) {
      throw new Error("Maximum rounds reached");
    }
    if (feedback) {
      const message = {
        from,
        to,
        content: feedback
      };
      this.newMessage(message);
      await this.chat({
        to: message.from,
        from: message.to
      });
    } else {
      await this.chat({ from, to });
    }
    return this;
  }
  async retry() {
    const lastChat = this._chats.at(-1);
    if (!lastChat || lastChat.state !== "error") {
      throw new Error("No chat to retry");
    }
    const { from, to } = this._chats.pop();
    await this.chat({ from, to });
    return this;
  }
  getHistory({ from, to }) {
    return this._chats.filter((chat) => {
      const isSuccess = chat.state === "success";
      if (!from) {
        return isSuccess && chat.to === to;
      }
      if (!to) {
        return isSuccess && chat.from === from;
      }
      const hasSent = chat.from === from && chat.to === to;
      const hasReceived = chat.from === to && chat.to === from;
      const mutual = hasSent || hasReceived;
      return isSuccess && mutual;
    });
  }
  getProviderForConfig(config) {
    if (typeof config.provider === "object") {
      return config.provider;
    }
    switch (config.provider) {
      case "openai":
        return new OpenAIProvider({
          model: config.model,
          apiKey: config.apiKey
        });
      case "anthropic":
        return new AnthropicProvider({
          model: config.model,
          apiKey: config.apiKey
        });
      default:
        throw new Error(`Unknown provider: ${config.provider}. Please use "openai"`);
    }
  }
  function(functionConfig) {
    this.functions.set(functionConfig.name, functionConfig);
    return this;
  }
}
var src_default = AIbitat;
export {
  src_default as default,
  Provider,
  OpenAIProvider,
  AnthropicProvider,
  AIbitat
};
