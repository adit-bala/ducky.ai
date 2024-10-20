import { createPresentation, getPresentations } from "@/lib/api";
import { PlusIcon } from "@radix-ui/react-icons";
import {
  Button,
  Card,
  Container,
  Dialog,
  Flex,
  Grid,
  Spinner,
  Text,
  TextArea,
  TextField,
} from "@radix-ui/themes";
import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

const accept = "application/pdf";

import styles from "./Presentations.module.scss";
import { useQuery } from "@tanstack/react-query";
import NavigationBar from "@/components/NavigationBar";

export default function Presentations() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [audience, setAudience] = useState("");
  const [tone, setTone] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["presentations"],
    queryFn: () => getPresentations(),
    select: (data) => data.toSorted((a, b) => a.name.localeCompare(b.name)),
  });

  const handleOpenChange = () => {
    if (!open && loading) return;

    setOpen(!open);
  };

  const handleChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.item(0);

    if (file?.type !== accept) return;

    setFile(file);
    setName(file.name);
    setDescription("");
    setAudience("");
    setTone("");
    setOpen(true);

    event.target.value = "";
  };

  const disabled = useMemo(
    () =>
      !name.trim() ||
      !description.trim() ||
      !audience.trim() ||
      !tone.trim() ||
      !file,
    [name, description, audience, tone, file]
  );

  const save = async () => {
    if (disabled) return;

    setLoading(true);

    try {
      const presentation = await createPresentation(
        file as File,
        name,
        description,
        audience,
        tone
      );

      navigate(`/presentations/${presentation._id}`);
    } catch (error) {
      console.error(error);

      // TODO: Handle error
    }
  };

  useEffect(() => {
    if (data || isLoading) return;

    navigate("/");
  }, [data, isLoading, navigate]);

  return (
    <Flex direction="column" flexGrow="1">
      <Dialog.Root open={open} onOpenChange={handleOpenChange}>
        <Dialog.Content maxWidth="440px">
          <Dialog.Title>Create presentation</Dialog.Title>
          <Dialog.Description size="2" mb="4">
            Create a new presentation.
          </Dialog.Description>
          <Flex direction="column" gap="4">
            <label>
              <Text as="div" size="2" mb="1" color="gray">
                Name
              </Text>
              <TextField.Root
                disabled={loading}
                placeholder="Enter a name"
                onChange={(event) => setName(event.target.value)}
                value={name}
              />
            </label>
            <label>
              <Text as="div" size="2" mb="1" color="gray">
                Description
              </Text>
              <TextArea
                disabled={loading}
                placeholder="Describe the presentation"
                onChange={(event) => setDescription(event.target.value)}
                value={description}
                rows={3}
              />
            </label>
            <label>
              <Text as="div" size="2" mb="1" color="gray">
                Audience
              </Text>
              <TextArea
                disabled={loading}
                placeholder="Describe your target audience"
                onChange={(event) => setAudience(event.target.value)}
                value={audience}
                rows={3}
              />
            </label>
            <label>
              <Text as="div" size="2" mb="1" color="gray">
                Tone
              </Text>
              <TextArea
                disabled={loading}
                placeholder="Describe your target tone"
                onChange={(event) => setTone(event.target.value)}
                value={tone}
                rows={3}
              />
            </label>
          </Flex>
          <Flex gap="3" mt="4" justify="end">
            <Dialog.Close>
              <Button variant="outline" color="gray" disabled={loading}>
                Cancel
              </Button>
            </Dialog.Close>
            <Button
              variant="classic"
              loading={loading}
              onClick={() => save()}
              disabled={disabled}
            >
              Save
            </Button>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>
      <NavigationBar />
      {isLoading || !data ? (
        <Flex justify="center" align="center" flexGrow="1" gap="3">
          <Spinner size="3" />
          <Text size="2" color="gray">
            Loading...
          </Text>
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
