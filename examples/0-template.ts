import {input} from '@inquirer/prompts'

import {AIbitat} from '../src'
import {cli} from '../src/plugins'

const aibitat = new AIbitat({
  nodes: {
    '🧑': '🤖',
  },
  config: {
    '🧑': {type: 'assistant'},
    '🤖': {type: 'agent'},
  },
}).use(cli())

// Ask for the topic of the chat before starting the conversation
const topic = await input({
  message: 'What is the topic of this chat?',
  validate: (value: string) => value.length > 0 || 'Please enter a topic',
})

await aibitat.start({
  from: '🧑',
  to: '🤖',
  content: `Talk about "${topic}"`,
})
