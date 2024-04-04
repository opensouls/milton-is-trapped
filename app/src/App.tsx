import { Soul } from "@opensouls/engine";
import { Text } from "nes-ui-react";
import { useCallback, useEffect, useState } from "react";
import tokens from "./.tokens.json";
import "./App.css";
import PixelEditor from "./components/PixelEditor";
import GameContainer from "./game/GameContainer";

function App() {
  const [tileBeingEdited, setTileBeingEdited] = useState<{ x: number; y: number } | null>(null);
  const [messages, setMessages] = useState<string[]>([]);
  // const [message, setMessage] = useState<string | null>(null);

  const [soul, setSoul] = useState<Soul | null>(null);

  useEffect(() => {
    if (soul) {
      return;
    }

    const connectSoul = async () => {
      const soul = new Soul({
        organization: "dooart",
        blueprint: "milton",
        soulId: tokens.soulId,
        // local: true,
        token: tokens.soulEngineApiKey,
        debug: true,
        local: tokens.soulLocal === "true",
      });

      await soul.connect();

      soul.on("says", async (event) => {
        const content = await event.content();
        // console.log(123123, content);
        // emitGameEvent("player-says", content);
        // setMessage(content);

        setMessages((messages) => {
          if (!messages) {
            return [content];
          }

          const newMessages = [...messages, content];
          return newMessages.filter((message, index) => newMessages.indexOf(message) === index);
        });
      });

      setSoul(soul);

      return () => {
        soul.disconnect();
      };
    };

    connectSoul();
  }, [soul]);

  const handleTileClick = useCallback((x: number, y: number) => {
    setTileBeingEdited({ x, y });
  }, []);

  const handleCancel = useCallback(() => {
    setTileBeingEdited(null);
    emitGameEvent("cancel-add-object", null);
  }, []);

  const handleCanvasUpdate = useCallback(
    async (base64: string) => {
      setMessages([]);

      soul?.dispatch({
        action: "addObject",
        content: `(image - ${base64.length} bytes)`,
        _metadata: {
          image: base64,
        },
      });
    },
    [soul]
  );

  return (
    <>
      <Text size="large">Milton is trapped in a room</Text>
      <div className="app-content">
        <GameContainer onTileClick={handleTileClick} onCanvasUpdate={handleCanvasUpdate} />
        <UiContainer tileBeingEdited={tileBeingEdited} onCancel={handleCancel} />
      </div>
      {messages.map((message, index) => (
        <Text key={index} size="large">
          {message}
        </Text>
      ))}
      {/* <Text size="large">{message}</Text> */}
    </>
  );
}

function UiContainer({
  tileBeingEdited,
  onCancel,
}: {
  tileBeingEdited: { x: number; y: number } | null;
  onCancel: () => void;
}) {
  const handleAddObject = (base64: string) => {
    emitGameEvent("add-base64-image", base64);
    onCancel();
  };

  return <PixelEditor onAddObject={handleAddObject} onCancel={onCancel} isEditing={!!tileBeingEdited} />;
}

function emitGameEvent(event: string, data: unknown) {
  // @ts-expect-error wip
  const game = window.game as Phaser.Game;

  if (game.scene.scenes.length > 1) {
    const mainScene = game.scene.scenes[1]; // Adjust based on your scene structure
    mainScene.events.emit(event, data);
  }
}

export default App;
