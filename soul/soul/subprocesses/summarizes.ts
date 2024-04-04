import {
  ChatMessageRoleEnum,
  MentalProcess,
  WorkingMemory,
  createCognitiveStep,
  useActions,
  useProcessMemory,
} from "@opensouls/engine";
import internalMonologue from "../lib/internalMonologue.js";
import { prompt } from "../lib/prompt.js";

const summaryOfSeriesOfEvents = createCognitiveStep((existing: string) => {
  return {
    command: ({ soulName }: WorkingMemory) => {
      return prompt`
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
  `;
    },
  };
});

const summarizesSeriesOfEvents: MentalProcess = async ({ workingMemory }) => {
  let memory = workingMemory;

  const seriesOfEventsModel = useProcessMemory(prompt`
    ${memory.soulName} is experiencing a series of events and is trying to learn as much as possible about them.
  `);
  const { log: engineLog } = useActions();
  const log = (...args: any[]) => {
    engineLog("[summarizes]", ...args);
  };

  let finalMemory = memory;

  if (memory.memories.length > 10) {
    log("Updating notes");
    [memory] = await internalMonologue(memory, { instructions: "What have I learned so far.", verb: "noted" });

    const updatedNotes = await step.compute(summaryOfSeriesOfEvents(seriesOfEventsModel.current));
    seriesOfEventsModel.current = updatedNotes as string;

    return finalMemory.withUpdatedMemory(async (memories) => {
      const newMemories = memories.flat();
      return [
        newMemories[0],
        {
          role: ChatMessageRoleEnum.Assistant,
          content: prompt`
            ## Events so far
            ${updatedNotes}
          `,
          metadata: {
            conversationSummary: true,
          },
        },
        ...newMemories.slice(-8),
      ];
    });
  }

  return finalMemory;
};

export default summarizesSeriesOfEvents;
