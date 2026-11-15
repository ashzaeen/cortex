// The Gemini function tools that connect a call to Cortex. The logic is in cortex.mjs (memoryActions);
// this file only declares the tools for LiveKit Agents. Plain JSON Schema, so no extra dependency.
import { llm } from '@livekit/agents';

/** @param {ReturnType<import('./cortex.mjs').memoryActions>} actions */
export function cortexTools(actions) {
  return {
    ask_memory: llm.tool({
      description:
        "Look something up in the caller's memory: what someone said or promised, what is open with a person, where something is, what happened earlier. " +
        'Use it for any question about the past. Answer only from what it returns.',
      parameters: {
        type: 'object',
        properties: { question: { type: 'string', description: "The caller's question, in their words." } },
        required: ['question'],
      },
      execute: args => actions.askMemory(args),
    }),
    brief_person: llm.tool({
      description: 'Get a short spoken brief on one person in memory: who they are, what was discussed, what is open. Use it when the caller asks to be briefed on someone.',
      parameters: {
        type: 'object',
        properties: { name: { type: 'string', description: "The person's name as the caller said it." } },
        required: ['name'],
      },
      execute: args => actions.briefPerson(args),
    }),
    draft_followup: llm.tool({
      description:
        'Draft a follow-up email to someone in memory when the caller asks you to email or follow up with them. This only drafts: nothing is sent. ' +
        'Read the subject and one short sentence aloud, then ask "Shall I send it?".',
      parameters: {
        type: 'object',
        properties: { name: { type: 'string', description: "The person's name as the caller said it." } },
        required: ['name'],
      },
      execute: args => actions.draftFollowUp(args),
    }),
    send_followup: llm.tool({
      description:
        'Send the follow-up email that draft_followup just drafted. Call it ONLY after the caller has clearly said yes to sending it, ' +
        'and then set caller_said_yes to true. Never send without a yes.',
      parameters: {
        type: 'object',
        properties: { caller_said_yes: { type: 'boolean', description: 'True only if the caller clearly said yes to sending this email.' } },
        required: ['caller_said_yes'],
      },
      execute: args => actions.sendFollowUp(args),
    }),
    undo_followup: llm.tool({
      description: 'Cancel the follow-up email that was just sent, if the caller says undo, cancel or stop it. It only works for about 30 seconds after sending.',
      parameters: { type: 'object', properties: {} },
      execute: () => actions.undoFollowUp(),
    }),
    save_what_you_see: llm.tool({
      description:
        "Save the caller's current camera picture to memory, for example a business card or a whiteboard they are holding up. " +
        'Only when the caller asks you to save or remember it. Never on your own.',
      parameters: {
        type: 'object',
        properties: { note: { type: 'string', description: 'One short line saying what the picture shows, for example "Business card: name, title, company".' } },
      },
      execute: args => actions.saveWhatYouSee(args),
    }),
  };
}
