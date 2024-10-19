import { formatDuration } from "@/lib/time";
import { Code, Flex, Text } from "@radix-ui/themes";
import { useEffect, useState } from "react";

interface TranscriptProps {
  startTime: number;
}

interface Line {
  text: string;
  time: number;
}

export default function Transcript({ startTime }: TranscriptProps) {
  const [lines, setLines] = useState<Line[]>([]);
  const [transcript, setTranscript] = useState("");

  useEffect(() => {
    const recognition = new webkitSpeechRecognition();

    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.addEventListener("result", (event) => {
      let transcript = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];

        // Check if the result is final
        if (result.isFinal) {
          setLines((results) => [
            ...results,
            {
              text: result[0].transcript,
              time: Date.now(),
            },
          ]);
        } else {
          transcript += result[0].transcript;
        }
      }

      setTranscript(transcript);
    });

    recognition.addEventListener("error", (event) => {
      console.error("Speech recognition error detected: " + event.error);
    });

    recognition.start();

    return () => {
      recognition.stop();
    };
  }, []);

  return (
    <Flex direction="column" gap="2">
      {lines.map(({ text, time }) => (
        <Flex gap="2" key={time}>
          <Code size="1">
            {startTime && time > startTime
              ? formatDuration(Math.floor((time - startTime) / 1000))
              : "00:00"}
          </Code>
          <Text size="1" color="gray">
            {text}
          </Text>
        </Flex>
      ))}
      <Text size="1">{transcript}</Text>
    </Flex>
  );
}
