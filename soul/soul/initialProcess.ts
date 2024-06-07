import {
  ChatMessageRoleEnum,
  MentalProcess,
  Perception,
  WorkingMemory,
  indentNicely,
  useActions,
  usePerceptions,
  useProcessManager,
  useProcessMemory,
  useSoulMemory,
} from "@opensouls/engine";
import brainstorm from "./lib/brainstorm.js";
import decision from "./lib/decision.js";
import externalDialog from "./lib/externalDialog.js";
import instruction from "./lib/instruction.js";
import internalMonologue from "./lib/internalMonologue.js";

const initialProcess: MentalProcess = async ({ workingMemory }) => {
  const { invokingPerception, pendingPerceptions } = usePerceptions();
  const { log } = useActions();

  let memory = workingMemory;

  log("starting");
  if (pendingPerceptions.current.length > 0) {
    log("aborting because of pending perceptions");
    return memory;
  }

  const roomDescription = useSoulMemory(
    "roomDescription",
    "- The human is positioned in the center of the image, facing downward."
  );

  log("getting description");
  let description;
  if (invokingPerception?.action === "addObject") {
    log("getting description from vision");
    const content = invokingPerception?._metadata?.image?.toString();
    if (!content) {
      throw new Error("No image found");
    }

    log(content.slice(0, 30) + "... (" + content.length + " bytes)");

    description = await describeImageWithVision(memory, content);
  } else {
    log("getting description from perception");
    description = (invokingPerception?._metadata?.description ?? invokingPerception?.content) as string;
  }
  if (!description) {
    throw new Error("No description found");
  }

  memory = memory.slice(0, memory.memories.length - 1);

  log("thinking about change");
  memory = memory
    .withMemory({
      role: ChatMessageRoleEnum.Assistant,
      content: `Room before change: ${roomDescription.current}`,
    })
    .withMemory({
      role: ChatMessageRoleEnum.Assistant,
      content: `Room after change: ${description}`,
    });

  const [, thoughtAboutChange] = await brainstorm(
    memory,
    "Name the one thing that changed in the room. Don't reflect about it, just observe what changed.",
    {
      model: "quality",
    }
  );

  roomDescription.current = description;

  log("noticed change: " + thoughtAboutChange);
  memory = memory.withMemory({
    role: ChatMessageRoleEnum.Assistant,
    content: `Milton noticed: ${thoughtAboutChange}`,
  });

  log("thinking about what happened");
  [memory] = await internalMonologue(
    memory,
    "Milton thinks about his situation and about what just happened in the room",
    {
      model: "gpt-4o",
    }
  );

  log("speaking");
  memory = await multiSpeak(memory, pendingPerceptions.current);

  log("done");
  return memory;
};

const multiSpeak = async (workingMemory: WorkingMemory, pendingPerceptions: Perception[]) => {
  const { speak, scheduleEvent, log } = useActions();
  const fragmentNo = useProcessMemory(0);
  const { wait } = useProcessManager();

  let memory = workingMemory;

  let phrase;
  [memory, phrase] = await externalDialog(
    memory,
    "Milton shares a thought fragment, hinting at a larger conversation to unfold. WITHOUT USING ELLIPSES.",
    { model: "quality" }
  );
  if (pendingPerceptions.length > 0) {
    log("aborting because of pending perceptions");
    return memory;
  }
  speak(phrase);

  const [, countString] = await decision(
    memory,
    {
      description: indentNicely`
        How many additional conversational pieces will Milton want to express next?
        Vary the number of pieces for a natural flow.
        The last conversation involved ${fragmentNo.current} pieces.
        Typically, expect 0. Occasionally, 1 or perhaps 2-5 pieces.
      `,
      choices: ["5", "4", "3", "2", "1", "0"],
    },
    { model: "quality" }
  );

  let count = parseInt(countString, 10);
  fragmentNo.current = count;

  if (count === 0) {
    return memory;
  }

  while (count > 1) {
    let [, phraseLength] = await decision(
      memory,
      {
        description: "How long should the next conversational piece be?",
        choices: ["very long", "long", "medium", "short"],
      },
      { model: "quality" }
    );

    const words =
      (phraseLength === "very long" ? 30 : phraseLength === "long" ? 30 : phraseLength === "medium" ? 20 : 10) +
      " words ";

    count -= 1;
    const previousMemory = memory;
    [memory, phrase] = await externalDialog(
      memory,
      indentNicely`
        - Milton shares another thought fragment, building on the previous one. WITHOUT USING ELLIPSES.
        - Ensure this piece is ${words} in length
        - Their last shared thought was: "${phrase}"
      `,
      { model: "quality" }
    );

    if (pendingPerceptions.length > 0) {
      log("aborting because of pending perceptions");
      return previousMemory;
    }
    speak(phrase);
  }

  const [, text] = await decision(
    memory,
    {
      description: `Does Milton need to add another piece to conclude their last thought?`,
      choices: ["yes", "no"],
    },
    { model: "quality" }
  );
  if (text === "yes") {
    const previousMemory = memory;
    [, phrase] = await externalDialog(
      memory,
      `Milton needs to conclude their last thought fragment in this conversation`,
      { model: "quality" }
    );
    if (pendingPerceptions.length > 0) {
      log("aborting because of pending perceptions");
      return previousMemory;
    }
    speak(phrase);
  }

  return memory;
};

async function describeImageWithVision(workingMemory: WorkingMemory, content: string) {
  const { log } = useActions();

  let memory = workingMemory;

  memory = memory.withMemory(workingMemory.memories[0]).withMemory({
    role: ChatMessageRoleEnum.User,
    content: [
      {
        type: "image_url",
        image_url: {
          url: content,
        },
      },
    ],
  });

  const [, value] = await instruction(
    memory,
    indentNicely`
      describe this pixel art image.
      - don't say it's pixel art
      - ignore the gray floor and the beige wall
      - ignore shadows
      - there's a human in the image, just say where he is, don't describe him. refer to him like this "the human is..."
      - use bulleted list, one item per object 
    `,
    { model: "gpt-4o" }
  );
  log(value);
  return value;
}

export default initialProcess;
