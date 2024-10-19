import { useEffect, useRef } from "react";

import styles from "./Video.module.scss";

export default function Video() {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;

    const initialize = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            advanced: [{ facingMode: "user" }],
          },
        });

        if (!videoRef.current) return;

        videoRef.current.srcObject = stream;
      } catch (error) {
        // TODO: Handle error
        console.error(error);
      }
    };

    initialize();

    return () => {
      if (!stream) return;

      const tracks = stream.getTracks();

      if (!tracks.length) return;

      for (const track of tracks) track.stop();
    };
  }, []);

  // TODO: Handle loading and error
  return (
    <div className={styles.root}>
      <video ref={videoRef} className={styles.video} autoPlay muted />
    </div>
  );
}
