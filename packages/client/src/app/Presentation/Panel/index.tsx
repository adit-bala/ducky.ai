import { Box, Flex } from "@radix-ui/themes";

import styles from "./Panel.module.scss";
import classNames from "classnames";
import { useEffect, useRef } from "react";
import { IPresentation } from "@/lib/presentations";

interface PanelProps {
  presentation: IPresentation;
  updateIndex: (index: number) => void;
  index: number;
}

export default function Panel({
  presentation,
  updateIndex,
  index: currentIndex,
}: PanelProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!rootRef.current) return;

    const element = rootRef.current.children[currentIndex];

    if (!element) return;

    element.scrollIntoView({
      behavior: "smooth",
      block: "center",
      inline: "center",
    });
  }, [currentIndex]);

  return (
    <Box className={styles.root}>
      <Flex direction="column" p="4" gap="4" ref={rootRef}>
        {presentation.slides.map((slide, index) => (
          <div
            className={classNames(styles.slide, {
              [styles.active]: index === currentIndex,
            })}
            onClick={() => updateIndex(index)}
            key={index}
          >
            <img key={index} src={slide} alt="" />
          </div>
        ))}
      </Flex>
    </Box>
  );
}
