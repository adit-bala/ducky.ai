import Audio from "./Audio";
import { Flex, Switch, Text } from "@radix-ui/themes";
import Video from "./Video";
import { useState } from "react";

import styles from "./Preview.module.scss";
import Transcript from "./Transcript";

interface PreviewProps {
  startTime: number;
}

export default function Preview({ startTime }: PreviewProps) {
  const [video, setVideo] = useState(true);
  const [transcript, setTranscript] = useState(true);
  const [audio, setAudio] = useState(true);

  return (
    <Flex direction="column" gap="4" flexShrink="0" className={styles.root}>
      {transcript && <Transcript startTime={startTime} />}
      {audio && <Audio />}
      {video && <Video />}
      <Flex direction="column" gap="2">
        <Text as="label" size="2">
          <Flex gap="2" justify="between">
            Show transcript
            <Switch
              size="1"
              checked={transcript}
              onCheckedChange={setTranscript}
            />
          </Flex>
        </Text>
        <Text as="label" size="2">
          <Flex gap="2" justify="between">
            Show volume
            <Switch size="1" checked={audio} onCheckedChange={setAudio} />
          </Flex>
        </Text>
        <Text as="label" size="2">
          <Flex gap="2" justify="between">
            Show video
            <Switch size="1" checked={video} onCheckedChange={setVideo} />
          </Flex>
        </Text>
      </Flex>
    </Flex>
  );
}
