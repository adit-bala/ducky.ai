import {
  Box,
  Card,
  Code,
  Flex,
  Separator,
  Spinner,
  Text,
} from "@radix-ui/themes";
import styles from "./Presentation.module.scss";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Panel from "./Panel";
import Menu from "./Menu";
import Preview from "./Preview";
import classNames from "classnames";
import { formatDuration } from "@/lib/time";
import { useNavigate, useParams } from "react-router-dom";
import {
  clipPresentation,
  getPresentation,
  IPresentation,
  PresentationIdentifier,
} from "@/lib/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Feedback from "./Feedback";

interface Chunk {
  index: number;
  timestamp: number;
  blob?: Blob;
}

export default function Presentation() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["presentations", id],
    queryFn: () => getPresentation(id as PresentationIdentifier),
    // Fetch the presentation every second while processing
    refetchInterval: ({ state: { data } }) =>
      data?.slidesStatus === "pending" ||
      data?.presentationStatus === "processing"
        ? 1000
        : false,
  });

  const [expanded, setExpanded] = useState(true);

  const [recording, setRecording] = useState(false);

  // Duration
  const intervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [startTime, setStartTime] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  // Capture video
  const [videoChunks, setVideoChunks] = useState<Chunk[]>([]);
  const [videoRecorder, setVideoRecorder] = useState<MediaRecorder | null>(
    null
  );

  // Capture audio
  const [audioChunks, setAudioChunks] = useState<Chunk[]>([]);
  const [audioRecorder, setAudioRecorder] = useState<MediaRecorder | null>(
    null
  );

  const elapsedTime = useMemo(() => {
    const duration = Math.floor((currentTime - startTime) / 1000);

    return formatDuration(duration);
  }, [startTime, currentTime]);

  const [index, setIndex] = useState(0);

  const slide = useMemo(() => data?.slides?.[index], [data, index]);

  useEffect(() => {
    const clip = async () => {
      if (!data?.slides) return;

      if (audioChunks.length === 0 || videoChunks.length === 0) return;

      const audioChunk = audioChunks[0];
      const videoChunk = videoChunks[0];

      if (!audioChunk.blob || !videoChunk.blob) return;

      console.log("Clipping");

      setAudioChunks((chunks) => {
        const _chunks = structuredClone(chunks);
        return _chunks.slice(1);
      });

      setVideoChunks((chunks) => {
        const _chunks = structuredClone(chunks);
        return _chunks.slice(1);
      });

      try {
        await clipPresentation(
          data._id,
          audioChunk.index,
          audioChunk.timestamp - startTime,
          videoChunk.blob,
          audioChunk.blob,
          audioChunk.index === data.slides.length - 1
        );
      } catch (error) {
        console.error(error);

        // TODO: Handle error
      }

      // Update the status
      queryClient.setQueryData<IPresentation>(
        ["presentations", id],
        (presentation) => {
          if (!presentation) return;

          const _presentation = structuredClone(presentation);
          _presentation.presentationStatus = "processing";
          return _presentation;
        }
      );
    };

    clip();
  }, [videoChunks, audioChunks, data, startTime, queryClient, id]);

  const updateIndex = useCallback(
    (index: number) => {
      setIndex(index);

      if (!recording) return;

      // Prepare for a clip
      const chunk = {
        index: index - 1,
        timestamp: Date.now(),
      };

      setVideoChunks((chunks) => {
        const _chunks = structuredClone(chunks);
        return [..._chunks, chunk];
      });

      setAudioChunks((chunks) => {
        const _chunks = structuredClone(chunks);
        return [..._chunks, chunk];
      });

      videoRecorder?.stop();
      audioRecorder?.stop();

      console.log("Requesting data");

      videoRecorder?.start();
      audioRecorder?.start();
    },
    [videoRecorder, audioRecorder, recording]
  );

  const updateRecording = useCallback(
    async (recording: boolean) => {
      setRecording(recording);

      setIndex(0);

      // Start recording
      if (recording) {
        const currentTime = Date.now();
        setCurrentTime(currentTime);
        setStartTime(currentTime);

        intervalRef.current = setInterval(() => {
          const currentTime = Date.now();
          setCurrentTime(currentTime);
        }, 1000);

        videoRecorder?.start();
        audioRecorder?.start();

        return;
      }

      if (intervalRef.current) clearInterval(intervalRef.current);

      // Prepare for a clip
      const chunk = {
        index,
        timestamp: Date.now(),
      };

      setVideoChunks((chunks) => {
        const _chunks = structuredClone(chunks);
        return [..._chunks, chunk];
      });

      setAudioChunks((chunks) => {
        const _chunks = structuredClone(chunks);
        return [..._chunks, chunk];
      });

      console.log("Requesting final data");

      videoRecorder?.stop();
      audioRecorder?.stop();
    },
    [videoRecorder, audioRecorder, index]
  );

  useEffect(() => {
    let videoRecorder: MediaRecorder;
    let audioRecorder: MediaRecorder;
    let videoStream: MediaStream;
    let audioStream: MediaStream;

    const initialize = async () => {
      // Video
      videoStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: {
          advanced: [{ facingMode: "user" }],
        },
      });

      videoRecorder = new MediaRecorder(videoStream, {
        mimeType: "video/webm",
      });

      videoRecorder.addEventListener("dataavailable", (event) => {
        console.log("Video data available", event.data);

        setVideoChunks((chunks) => {
          const _chunks = structuredClone(chunks);

          // We need to coordinate audio and video chunks
          const chunk = _chunks.findIndex((chunk) => !chunk.blob);
          if (chunk === -1) return _chunks;

          _chunks[chunk].blob = event.data;
          return _chunks;
        });
      });

      setVideoRecorder(videoRecorder);

      // Audio
      audioStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });

      audioRecorder = new MediaRecorder(audioStream, {
        mimeType: "audio/webm",
      });

      audioRecorder.addEventListener("dataavailable", (event) => {
        console.log("Audio data available", event.data);

        setAudioChunks((chunks) => {
          const _chunks = structuredClone(chunks);

          // We need to coordinate audio and video chunks
          const chunk = _chunks.findIndex((chunk) => !chunk.blob);
          if (chunk === -1) return _chunks;

          _chunks[chunk].blob = event.data;
          return _chunks;
        });
      });

      setAudioRecorder(audioRecorder);
    };

    initialize();

    return () => {
      videoRecorder?.stop();

      if (videoStream) {
        const videoTracks = videoStream.getTracks();

        for (const track of videoTracks) track.stop();
      }

      audioRecorder?.stop();

      if (audioStream) {
        const audioTracks = audioStream.getTracks();

        for (const track of audioTracks) track.stop();
      }
    };
  }, []);

  useEffect(() => {
    if (data || isLoading) return;

    navigate("/presentations");
  }, [data, navigate, isLoading]);

  if (!data) {
    return (
      <Flex flexGrow="1" justify="center" align="center" gap="3">
        <Spinner size="3" />
        <Text size="2" color="gray">
          Loading...
        </Text>
      </Flex>
    );
  }

  return (
    <Flex direction="column" className={styles.root}>
      <Menu
        presentation={data}
        index={index}
        expanded={expanded}
        recording={recording}
        updateIndex={updateIndex}
        updateExpanded={setExpanded}
        updateRecording={updateRecording}
      />
      <Separator size="4" />
      {data?.presentationStatus === "complete" && data?.clips ? (
        <Flex flexGrow="1" className={styles.body}>
          <Feedback presentation={data} index={index} />
          <Flex
            flexShrink="0"
            className={classNames({
              [styles.hidden]: !expanded,
            })}
          >
            <Separator orientation="vertical" size="4" />
            <Panel
              presentation={data}
              updateIndex={(index) => !recording && setIndex(index)}
              index={index}
            />
          </Flex>
        </Flex>
      ) : data?.presentationStatus === "processing" && !recording ? (
        <Flex flexGrow="1" justify="center" align="center" gap="3">
          <Spinner size="3" />
          <Text size="2" color="gray">
            Processing feedback...
          </Text>
        </Flex>
      ) : !data?.slides || data?.slidesStatus === "pending" ? (
        <Flex flexGrow="1" justify="center" align="center" gap="3">
          <Spinner size="3" />
          <Text size="2" color="gray">
            Processing presentation...
          </Text>
        </Flex>
      ) : (
        <Flex flexGrow="1" className={styles.body}>
          <Flex p="5" gap="5" flexGrow="1" className={styles.view}>
            <Flex flexGrow="1" justify="center" align="center">
              <Box maxWidth="896px">
                <Card variant="classic">
                  <img src={slide} alt="" />
                </Card>
              </Box>
            </Flex>
            <Flex direction="column" gap="4" justify="between">
              <Flex gap="3" justify="end" align="center">
                <Code
                  size="1"
                  color={recording ? "red" : "gray"}
                  variant="ghost"
                >
                  {elapsedTime}
                </Code>
                <div
                  className={classNames(styles.indicator, {
                    [styles.active]: recording,
                  })}
                />
              </Flex>
              <Preview startTime={startTime} />
            </Flex>
          </Flex>
          <Flex
            flexShrink="0"
            className={classNames({
              [styles.hidden]: !expanded,
            })}
          >
            <Separator orientation="vertical" size="4" />
            <Panel
              presentation={data}
              updateIndex={(index) => !recording && setIndex(index)}
              index={index}
            />
          </Flex>
        </Flex>
      )}
    </Flex>
  );
}
