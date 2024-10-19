import { createPresentation, getPresentations } from "@/lib/api";
import { PlusIcon } from "@radix-ui/react-icons";
import {
  Button,
  Card,
  Container,
  Flex,
  Grid,
  Spinner,
  Text,
} from "@radix-ui/themes";
import { ChangeEvent, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

const accept = "application/pdf";

import styles from "./Presentations.module.scss";
import { useQuery } from "@tanstack/react-query";
import NavigationBar from "@/components/NavigationBar";

export default function Presentations() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ["presentations"],
    queryFn: () => getPresentations(),
    select: (data) => data.toSorted((a, b) => a.name.localeCompare(b.name)),
  });

  const handleChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.item(0);

    if (file?.type !== accept) return;

    setLoading(true);

    try {
      const presentation = await createPresentation(file.name, file);

      navigate(`/presentations/${presentation._id}`);
    } catch (error) {
      console.error(error);
    }

    setLoading(false);
  };

  return (
    <Flex direction="column" flexGrow="1">
      <NavigationBar />
      {isLoading ? (
        <Flex justify="center" align="center" flexGrow="1">
          <Spinner size="3" />
        </Flex>
      ) : !data || data.length === 0 ? (
        <Flex justify="center" align="center" flexGrow="1">
          <Flex justify="between" align="center">
            <input
              type="file"
              accept={accept}
              hidden
              ref={inputRef}
              onChange={handleChange}
            />
            <Button
              onClick={() => inputRef.current?.click()}
              loading={loading}
              variant="classic"
              className={styles.button}
            >
              <PlusIcon />
              Add a new presentation
            </Button>
          </Flex>
        </Flex>
      ) : (
        <Container>
          <Flex direction="column" gap="5" p="5">
            <Flex justify="between" align="center">
              <input
                type="file"
                accept={accept}
                hidden
                ref={inputRef}
                onChange={handleChange}
              />
              <Button
                onClick={() => inputRef.current?.click()}
                loading={loading}
                variant="classic"
                className={styles.button}
              >
                <PlusIcon />
                Add a new presentation
              </Button>
            </Flex>
            <Grid columns="3" gap="5">
              {data.map((presentation) => (
                <Link
                  key={presentation._id}
                  to={`/presentations/${presentation._id}`}
                >
                  <Flex direction="column" gap="3">
                    <Card>
                      <img src={presentation.slides?.[0]} alt="" />
                    </Card>
                    <Flex direction="column" gap="1">
                      <Text size="2" weight="medium">
                        {presentation.name}
                      </Text>
                      <Text color="gray" size="1">
                        {presentation.slides
                          ? `${presentation.slides.length} slides`
                          : "Processing..."}
                      </Text>
                    </Flex>
                  </Flex>
                </Link>
              ))}
            </Grid>
          </Flex>
        </Container>
      )}
    </Flex>
  );
}
