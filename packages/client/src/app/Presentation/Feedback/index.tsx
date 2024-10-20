import { IPresentation } from "@/lib/api";
import { Container, Flex } from "@radix-ui/themes";
import { useMemo } from "react";

interface FeedbackProps {
  presentation: IPresentation;
  index: number;
}

export default function Feedback({ presentation, index }: FeedbackProps) {
  const clip = useMemo(() => presentation.clips![index], [presentation, index]);

  return (
    <Flex direction="column" gap="5">
      <Container size="4">
        <Flex direction="column" align="center" gap="5">
          {clip.feedback.text}
        </Flex>
      </Container>
    </Flex>
  );
}
