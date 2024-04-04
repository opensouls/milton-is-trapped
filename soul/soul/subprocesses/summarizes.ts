import {
  ChatMessageRoleEnum,
  MentalProcess,
  WorkingMemory,
  createCognitiveStep,
  indentNicely,
  useActions,
  useProcessMemory,
} from "@opensouls/engine";
import internalMonologue from "../lib/internalMonologue.js";

const summaryOfSeriesOfEvents = createCognitiveStep((existing: string) => {
  return {
    command: ({ soulName }: WorkingMemory) => {
      return {
        role: ChatMessageRoleEnum.System,
        content: indentNicely`
          ## Existing notes
          ${existing}

          ## Description
          Write an updated and clear paragraph describing everything that happened so far.
          Make sure to keep details that ${soulName} would want to remember.

          ## Rules
          * Keep descriptions as a paragraph
          * Keep relevant information from before
          * Use abbreviated language to keep the notes short
          * Make sure to detail the motivation of ${soulName} (what are they trying to accomplish, what have they done so far).

          Please reply with the updated notes on the series of events:
      `,
      };
    },
  };
});

const summarizesSeriesOfEvents: MentalProcess = async ({ workingMemory }) => {
  const conversationModel = useProcessMemory(indentNicely`
    ${workingMemory.soulName} is experiencing a series of events and is trying to learn as much as possible about them.
  `);
  const { log: engineLog } = useActions();
  const log = (...args: any[]) => {
    engineLog("[summarizes]", ...args);
  };

  if (workingMemory.memories.length > 15) {
    log("summarizing series of events");
    const [withMemoryThoughts] = await internalMonologue(workingMemory, {
      instructions: `What have I learned so far.`,
      verb: "noted",
    });

    const [, updatedNotes] = await summaryOfSeriesOfEvents(withMemoryThoughts, conversationModel.current);
    log("done summarizing");

    conversationModel.current = updatedNotes as string;

    if (workingMemory.find((m) => !!m.metadata?.conversationSummary)) {
      return workingMemory
        .map((m) => {
          if (m.metadata?.conversationSummary) {
            return {
              ...m,
              content: updatedNotes,
            };
          }
          return m;
        })
        .slice(0, 2)
        .concat(workingMemory.slice(-8));
    }

    return workingMemory
      .slice(0, 1)
      .withMemory({
        role: ChatMessageRoleEnum.Assistant,
        content: indentNicely`
          ## Conversation so far
          ${updatedNotes}
        `,
        metadata: {
          conversationSummary: true,
        },
      })
      .concat(workingMemory.slice(-8));
  }

  return workingMemory;
};

export default summarizesSeriesOfEvents;
