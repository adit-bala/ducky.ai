import { IPresentation } from "@/lib/api";
import { Badge, Box, Card, Container, Flex, Text } from "@radix-ui/themes";
import { useMemo } from "react";
import Markdown from "react-markdown";

interface FeedbackProps {
  presentation: IPresentation;
  index: number;
}

import styles from "./Feedback.module.scss";

export default function Feedback({ presentation, index }: FeedbackProps) {
  const clip = useMemo(() => presentation.clips![index], [presentation, index]);

  return (
    <Flex direction="column" gap="5" p="5" className={styles.root} flexGrow="1">
      <Container size="4">
        <Flex align="center" gap="5">
          <Box flexGrow="1" flexBasis="0" flexShrink="0">
            <Card>
              <img className={styles.slide} src={clip.slideUUID} />
            </Card>
          </Box>
          <Box flexGrow="1" flexBasis="0" flexShrink="0">
            <video src={clip.video} className={styles.video} controls />
          </Box>
        </Flex>
      </Container>
      <Container size="2">
        <Flex direction="column" gap="5">
          {(typeof clip.feedback.emotion === "string" ||
            clip.feedback.emotion === null) && (
            <Flex gap="2">
              {JSON.parse(clip.feedback.emotion).map((emotion: string) => (
                <Badge>{emotion}</Badge>
              ))}
            </Flex>
          )}
          {typeof clip.feedback.emotionScore === "string" && (
            <Flex gap="3" align="center">
              <div className={styles.score}>
                {clip.feedback.emotionScore}
              </div>
              <Text size="2">Confidence score</Text>
            </Flex>
          )}
          <Markdown>{clip.feedback.text}</Markdown>
        </Flex>
      </Container>
    </Flex>
  );
}
