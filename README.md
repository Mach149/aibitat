# ChatFlow

This project is a fork from the original
[autogen](https://github.com/microsoft/autogen) but done in TypeScript.

I took a sightly different approach to the original project. Agents are now
provider agnostic and can be used with any provider that implements the
`AIProvider` interface. Also, it is stateless and can be used in a serverless
environment.

By default, it uses **OpenAI** and **GPT-3.5-TURBO** as the provider but you can
change it by passing `provider` and `model` to the `ChatFlow` constructor or by
setting them on the node config.

## Roadmap

- [x] **Automated reply with loop prevention.** Chats are kept alive until the
      assistant interrupts the conversation.
- [x] **Group chats.** Agents chat with multiple other agents at the same time
      as if they were in a Whatsapp group. The next agent to reply is chosen
      based on the conversation and predicted most likely to reply.
- [ ] **Function execution.** Agents can execute functions and return the result
      to the conversation.
- [ ] **Cache**. Store conversation history in a cache to improve performance
      and reduce the number of API calls.
- [ ] **Error handling.** Handle API errors gracefully.
- [ ] **Code execution.** Agents can execute code and return the result to the
      conversation.

#### Providers

- [ ] Anthropic
- [ ] Cohere
- [ ] Fireworks.ai
- [ ] Hugging Face
- [x] OpenAI
- [ ] Replicate

## Usage

You can install the package:

```bash
npm install chatflow
```

add you `OPEN_AI_API_KEY` to your environment variables and then use it like
this:

```ts
import {ChatFlow} from 'chatflow'

const flow = new ChatFlow({
  nodes: {
    '🧑': '🤖',
    '🤖': ['🐭', '🦁', '🐶'],
  },
  config: {
    '🧑': {
      type: 'assistant',
      interrupt: 'NEVER',
      role: 'You are a human assistant. Reply "TERMINATE" in when there is a correct answer.',
    },
    '🤖': {type: 'manager'},
    '🐭': {type: 'agent', role: 'You do the math.'},
    '🦁': {type: 'agent', role: 'You check to see if its correct'},
    '🐶': {
      type: 'agent',
      role: 'You reply "TERMINATE" if theres`s a confirmation',
    },
  },
})

flow.on('message', ({from, to, content}) => console.log(`${from}: ${content}`))
// 🧑: How much is 2 + 2?
// 🐭: The sum of 2 + 2 is 4.
// 🦁: That is correct.
// 🐶: TERMINATE

await flow.start({
  from: '🧑',
  to: '🤖',
  content: 'How much is 2 + 2?',
})

console.log('saving chats... ', flow.chats)
// saving chats...  [
//   {
//     from: "🧑",
//     to: "🤖",
//     content: "How much is 2 + 2?",
//     state: "success"
//   }, {
//     from: "🐭",
//     to: "🤖",
//     state: "success",
//     content: "The sum of 2 + 2 is 4."
//   }, {
//     from: "🦁",
//     to: "🤖",
//     state: "success",
//     content: "That is correct."
//   }, {
//     from: "🐶",
//     to: "🤖",
//     state: "success",
//     content: "TERMINATE"
//   }
// ]
```

Nodes are the agents that will be used in the conversation and how they connect
to each other. The `config` object is used to configure each node.

- `type`: `agent`, `assistant` or `manager`. Agents and managers never interrupt
  conversations by default while assistant always does. Managers don't reply to
  messages. They are used to group other agents.
- `interrupt`: `NEVER`, `ALWAYS`. When `NEVER`, the agent will never interrupt
  the conversation. When `ALWAYS`, the agent will always interrupt the
  conversation. (Note: any of them can interrupt the conversation if they reply
  "INTERRUPT")
- `role`: The role of the agent. It is used to describe the role the agent will
  perform in the chat.
- `maxRounds`: The maximum number of chats an agent or a group will reply to the
  conversation. It is used to prevent loops.

### Listening to events

You can listen to events using the `on` method:

```ts
flow.on('message', ({from, to, content}) => console.log(`${from}: ${content}`))
```

The following events are available:

- `message`: When a message is added to the chat.
- `terminate`: When the conversation is terminated. Generally means there is
  nothing else to do and a new conversation should be started.
- `interrupt`: When the conversation is interrupted by an agent. Generally means
  the agent has a question or needs help. The conversation can be resumed by
  calling `.continue(feedback)`.

## Contributing

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run examples/1-basic.ts
```

> Check out the [examples](./examples) folder for more examples.

This project was created using `bun init` in bun v1.0.3. [Bun](https://bun.sh)
is a fast all-in-one JavaScript runtime.
