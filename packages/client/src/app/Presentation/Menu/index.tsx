import { IPresentation } from "@/lib/api";
import {
  RadiobuttonIcon,
  ArrowLeftIcon,
  SquareIcon,
  TrackNextIcon,
  LayersIcon,
  TrackPreviousIcon,
} from "@radix-ui/react-icons";
import {
  Flex,
  Button,
  IconButton,
  Separator,
  Tooltip,
  Text,
  AlertDialog,
} from "@radix-ui/themes";
import { Link } from "react-router-dom";

import styles from "./Menu.module.scss";

interface MenuProps {
  presentation: IPresentation;
  expanded: boolean;
  updateExpanded: (expanded: boolean) => void;
  recording: boolean;
  updateRecording: (recording: boolean) => void;
  index: number;
  updateIndex: (index: number) => void;
}

export default function Menu({
  presentation,
  expanded,
  updateExpanded,
  recording,
  updateRecording,
  index,
  updateIndex,
}: MenuProps) {
  // const [open, setOpen] = useState(false);
  // const [loading, setLoading] = useState(false);
  // const [name, setName] = useState(presentation.name);
  // const queryClient = useQueryClient();

  // const handleOpenChange = (open: boolean) => {
  //   if (loading && !open) return;

  //   setOpen(open);
  // };

  // const save = async () => {
  //   if (!name.trim()) return;

  //   setLoading(true);

  //   try {
  //     await updatePresentation(presentation._id, name);

  //     queryClient.setQueryData(["presentations", presentation._id], {
  //       ...presentation,
  //       name,
  //     });
  //   } catch (error) {
  //     console.error(error);
  //   }

  //   setLoading(false);

  //   setOpen(false);
  // };

  return (
    <Flex
      p="3"
      gap="3"
      justify="end"
      align="center"
      flexShrink="0"
      className={styles.root}
    >
      <Tooltip content="Back to presentations">
        {recording ? (
          <IconButton variant="surface" color="gray" disabled>
            <ArrowLeftIcon />
          </IconButton>
        ) : (
          <Link to="/presentations">
            <IconButton variant="surface" color="gray">
              <ArrowLeftIcon />
            </IconButton>
          </Link>
        )}
      </Tooltip>
      <Separator orientation="vertical" size="1" />
      {/* <Dialog.Root open={open} onOpenChange={handleOpenChange}>
        <Tooltip content="Edit presentation">
          <Dialog.Trigger>
            <IconButton variant="surface" color="gray" disabled={recording}>
              <Pencil1Icon />
            </IconButton>
          </Dialog.Trigger>
        </Tooltip>
        <Dialog.Content maxWidth="440px">
          <Dialog.Title>Edit presentation</Dialog.Title>
          <Dialog.Description size="2" mb="4">
            Make changes to your presentation.
          </Dialog.Description>
          <label>
            <Text as="div" size="2" mb="1" color="gray">
              Name
            </Text>
            <TextField.Root
              defaultValue={presentation.name}
              placeholder="Enter a name"
              onChange={(event) => setName(event.target.value)}
              value={name}
            />
          </label>
          <Flex gap="3" mt="4" justify="end">
            <Dialog.Close>
              <Button variant="outline" color="gray">
                Cancel
              </Button>
            </Dialog.Close>
            <Button
              variant="classic"
              loading={loading}
              onClick={() => save()}
              disabled={name === presentation.name || !name.trim()}
            >
              Save
            </Button>
          </Flex>
        </Dialog.Content>
      </Dialog.Root> */}
      <Flex direction="column" flexGrow="1">
        <Text size="1" weight="medium">
          {presentation.name}
        </Text>
        <Text size="1" color="gray">
          {presentation.slides
            ? `${presentation.slides.length} slides`
            : "Processing..."}
        </Text>
      </Flex>
      {recording && presentation.slides ? (
        index === presentation.slides.length - 1 ? (
          <Button
            color="red"
            onClick={() => updateRecording(false)}
            variant="classic"
          >
            <SquareIcon />
            Stop recording
          </Button>
        ) : (
          <Button variant="classic" onClick={() => updateIndex(index + 1)}>
            Next slide
            <TrackNextIcon />
          </Button>
        )
      ) : presentation.presentationStatus !== "pending" ? (
        <>
          <Button
            variant="outline"
            color="gray"
            disabled={index === 0}
            onClick={() => updateIndex(index + 1)}
          >
            <TrackPreviousIcon />
            Previous slide
          </Button>
          <Button
            variant="outline"
            color="gray"
            disabled={index === presentation.slides!.length - 1}
            onClick={() => updateIndex(index + 1)}
          >
            Next slide
            <TrackNextIcon />
          </Button>
        </>
      ) : (
        <AlertDialog.Root>
          <AlertDialog.Trigger>
            <Button variant="classic">
              <RadiobuttonIcon />
              Start recording
            </Button>
          </AlertDialog.Trigger>
          <AlertDialog.Content maxWidth="448px">
            <AlertDialog.Title>Are you sure?</AlertDialog.Title>
            <AlertDialog.Description size="2">
              Once you start presenting, you will not be able to restart. We
              recommend finishing your presentation even if you make a mistake!
            </AlertDialog.Description>
            <Flex gap="3" mt="4" justify="end">
              <AlertDialog.Cancel>
                <Button variant="surface" color="gray">
                  Cancel
                </Button>
              </AlertDialog.Cancel>
              <AlertDialog.Action onClick={() => updateRecording(true)}>
                <Button variant="classic" color="red">
                  Yes, start recording
                </Button>
              </AlertDialog.Action>
            </Flex>
          </AlertDialog.Content>
        </AlertDialog.Root>
      )}
      <Separator orientation="vertical" size="1" />
      <Tooltip content={expanded ? "Hide slides" : "Show slides"}>
        <IconButton
          variant="surface"
          color="gray"
          onClick={() => updateExpanded(!expanded)}
          disabled={!presentation.slides}
        >
          <LayersIcon />
        </IconButton>
      </Tooltip>
    </Flex>
  );
}
