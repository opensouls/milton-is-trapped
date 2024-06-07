import { Text } from "nes-ui-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import "./App.css";
import PixelEditor from "./components/PixelEditor";
import GameContainer from "./game/GameContainer";

function App() {
  const [tileBeingEdited, setTileBeingEdited] = useState<{ x: number; y: number } | null>(null);
  const [messages, setMessages] = useState<string[]>([]);
  const [soul, setSoul] = useState<WebSocket | null>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const audioQueue = useRef<HTMLAudioElement[]>([]);
  const isPlaying = useRef<boolean>(false);

  useEffect(() => {
    if (soul) {
      return;
    }

    const connectSoul = async () => {
      const uuid = uuidv4();
      const websocketServer = import.meta.env.VITE_WEBSOCKET_SERVER ?? "ws://localhost:3000";
      const websocketUrl = `${websocketServer}/ws?client_id=${uuid}`;
      const socket = new WebSocket(websocketUrl);

      socket.onopen = () => {
        console.log("Connected to soul, id:" + uuid);
      };

      socket.onmessage = async (event) => {
        const content = JSON.parse(event.data);

        if (content.text) {
          setMessages((messages) => {
            if (!messages) {
              return [content.text];
            }

            const newMessages = [...messages, content.text];
            return newMessages.filter((message, index) => newMessages.indexOf(message) === index);
          });

          setTimeout(() => {
            if (messagesRef.current) {
              messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
            }
          }, 100);
        }

        if (content.audio) {
          const audioUrl = content.audio;
          const audio = new Audio(`${import.meta.env.VITE_HTTP_SERVER}/audio?url=${encodeURIComponent(audioUrl)}`);

          audio.oncanplaythrough = () => {
            audioQueue.current.push(audio);
            if (!isPlaying.current) {
              playNextAudio();
            }
          };

          audio.load();
        }
      };

      setSoul(socket);

      return () => {
        console.log("Closing soul connection, id:" + uuid);
        socket.close();
      };
    };

    connectSoul();
  }, [soul]);

  const playNextAudio = () => {
    if (audioQueue.current.length > 0) {
      isPlaying.current = true;

      const audio = audioQueue.current.shift();
      if (audio === undefined) {
        console.error("Audio is undefined");
        return;
      }

      audio.onplaying = () => {
        emitGameEvent("toggle-talking-start", null);
      };

      audio.onended = () => {
        emitGameEvent("toggle-talking-stop", null);
        isPlaying.current = false;
        playNextAudio();
      };

      audio.onerror = (e) => {
        emitGameEvent("toggle-talking-stop", null);
        console.error("Error loading audio file:", e);
        isPlaying.current = false;
        playNextAudio();
      };

      audio.play().catch((error) => {
        emitGameEvent("toggle-talking-stop", null);
        console.error("Error playing audio file:", error);
        isPlaying.current = false;
        playNextAudio();
      });
    }
  };

  const handleTileClick = useCallback((x: number, y: number) => {
    console.log("Tile clicked", x, y);
    setTileBeingEdited({ x, y });
  }, []);

  const handleCancel = useCallback(() => {
    setTileBeingEdited(null);
    emitGameEvent("cancel-add-object", null);
  }, []);

  const handleAddedObject = useCallback(() => {
    setTileBeingEdited(null);
  }, []);

  const handleCanvasUpdate = useCallback(
    async (base64: string) => {
      if (soul) {
        soul.send(
          JSON.stringify({
            action: "addObject",
            content: `(image - ${base64.length} bytes)`,
            _metadata: {
              image: base64,
            },
          })
        );
      }
    },
    [soul]
  );

  return (
    <>
      <Text size="large">Milton is trapped in a room</Text>
      <div style={{ display: "flex", gap: 20 }}>
        <div className="app-content">
          <UiContainer tileBeingEdited={tileBeingEdited} onCancel={handleCancel} onAddedObject={handleAddedObject} />
          <GameContainer
            onTileClick={handleTileClick}
            onCanvasUpdate={handleCanvasUpdate}
            isInteractive={!tileBeingEdited}
          />
        </div>
        <div style={{ width: 512, height: 512, overflowY: "scroll", color: "#deb887" }} ref={messagesRef}>
          {messages.map((message, index) => (
            <Text key={index} size="large" style={{ marginBottom: "3rem" }}>
              {message}
            </Text>
          ))}
        </div>
      </div>
    </>
  );
}

function UiContainer({
  tileBeingEdited,
  onAddedObject,
  onCancel,
}: {
  tileBeingEdited: { x: number; y: number } | null;
  onAddedObject: () => void;
  onCancel: () => void;
}) {
  const handleAddObject = (base64: string) => {
    emitGameEvent("add-base64-image", base64);
    onAddedObject();
  };

  return <PixelEditor onAddObject={handleAddObject} onCancel={onCancel} isEditing={!!tileBeingEdited} />;
}

function emitGameEvent(event: string, data: unknown) {
  // @ts-expect-error wip
  const game = window.game as Phaser.Game;

  if (game.scene.scenes.length > 1) {
    const mainScene = game.scene.scenes[1];
    mainScene.events.emit(event, data);
  }
}

export default App;
