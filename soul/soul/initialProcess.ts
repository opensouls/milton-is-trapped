import {
  ChatMessageRoleEnum,
  MentalProcess,
  Perception,
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
import { prompt } from "./lib/prompt.js";

const initialProcess: MentalProcess = async ({ workingMemory }) => {
  const { invokingPerception, pendingPerceptions } = usePerceptions();
  const { speak, log, dispatch } = useActions();

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

  let step = await memory.withUpdatedMemory(async (memories) => {
    const newMemories = memories.flat();
    return newMemories.slice(0, newMemories.length - 1);
  });

  log("thinking about change");
  const memoriesForDiff = [
    {
      role: ChatMessageRoleEnum.Assistant,
      content: `Room before change: ${roomDescription.current}`,
    },
    {
      role: ChatMessageRoleEnum.Assistant,
      content: `Room after change: ${description}`,
    },
  ];

  let computeStep = await step.withUpdatedMemory(async (memories) => {
    return memories.concat(memoriesForDiff);
  });
  log("computeStep: ", JSON.stringify(computeStep.memories.slice(-2)));

  const thoughtAboutChange = await computeStep.compute(
    brainstorm("Name the one thing that changed in the room. Don't reflect about it, just observe what changed."),
    {
      model: "quality",
    }
  );

  roomDescription.current = description;

  log("noticed change: " + thoughtAboutChange);
  step = step.withMemory([
    {
      role: ChatMessageRoleEnum.Assistant,
      content: `Milton noticed: ${thoughtAboutChange}`,
    },
  ]);

  log("thinking about what happened");
  step = await step.next(
    internalMonologue("Milton thinks about his situation and about what just happened in the room"),
    {
      model: "quality",
    }
  );

  log("speaking");
  step = await multiSpeak(step, pendingPerceptions.current);

  log("done");
  return step;
};

const multiSpeak = async (initialStep: CortexStep, pendingPerceptions: Perception[]) => {
  const { speak, scheduleEvent, log } = useActions();
  const fragmentNo = useProcessMemory(0);
  const { wait } = useProcessManager();

  let step = await initialStep.next(
    externalDialog(
      "Milton shares a thought fragment, hinting at a larger conversation to unfold. WITHOUT USING ELLIPSES."
    ),
    { model: "quality" }
  );
  if (pendingPerceptions.length > 0) {
    log("aborting because of pending perceptions");
    return initialStep;
  }
  speak(step.value);

  let count = parseInt(
    (await step.compute(
      decision(
        prompt`
      How many additional conversational pieces will Milton want to express next?
      Vary the number of pieces for a natural flow.
      The last conversation involved ${fragmentNo.current} pieces.
      Typically, expect 0. Occasionally, 1 or perhaps 2-5 pieces.
    `,
        ["5", "4", "3", "2", "1", "0"]
      ),
      { model: "quality" }
    )) as string
  ) as number;
  fragmentNo.current = count;

  if (count === 0) {
    return step;
  }

  let waitTime = 1000;
  while (count > 1) {
    await wait(waitTime);
    let length = await step.compute(
      decision(
        prompt`
        How long should the next conversational piece be?
      `,
        ["very long", "long", "medium", "short"]
      ),
      { model: "quality" }
    );

    waitTime = length === "very long" ? 6000 : length === "long" ? 4000 : length === "medium" ? 2000 : 1000;
    log(`waiting for ${waitTime}ms`);

    const words = (length === "very long" ? 60 : length === "long" ? 40 : length === "medium" ? 20 : 10) + " words ";

    count -= 1;
    const preStep = step;
    step = await step.next(
      externalDialog(prompt`
        - Milton shares another thought fragment, building on the previous one. WITHOUT USING ELLIPSES.
        - Ensure this piece is ${words} in length
        - Their last shared thought was: "${step.value}"
      `),
      { model: "quality" }
    );
    if (pendingPerceptions.length > 0) {
      log("aborting because of pending perceptions");
      return preStep;
    }
    speak(step.value);
  }

  const text = await step.compute(
    decision(
      prompt`
      Does Milton need to add another piece to conclude their last thought?
    `,
      ["yes", "no"]
    ),
    { model: "quality" }
  );
  if (text === "yes") {
    const preStep = step;
    step = await step.next(
      externalDialog(prompt`
        - Milton needs to conclude their last thought fragment in this conversation
      `),
      { model: "quality" }
    );
    if (pendingPerceptions.length > 0) {
      log("aborting because of pending perceptions");
      return preStep;
    }
    speak(step.value);
  }

  return step;
};

async function describeImageWithVision(initialStep: CortexStep<any>, content: string) {
  const { log } = useActions();

  // @ts-expect-error wip
  const visionStep = await initialStep.withUpdatedMemory((existing) => {
    return [
      existing.flat()[0],
      {
        role: ChatMessageRoleEnum.User,
        content: [
          {
            type: "image_url",
            image_url: {
              url: content,
            },
          },
        ],
      },
    ];
  });

  const visionResp = await visionStep.next(
    instruction(prompt`
    describe this pixel art image.
    - don't say it's pixel art
    - ignore the gray floor and the beige wall
    - ignore shadows
    - there's a human in the image, just say where he is, don't describe him. refer to him like this "the human is..."
    - use bulleted list, one item per object 
  `),
    { model: "vision" }
  );
  log(visionResp.value);
  return visionResp.value;
}

export default initialProcess;
