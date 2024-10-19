import { useState, useEffect, useRef } from "react";
import styles from "./Audio.module.scss";

export default function Audio() {
  const [volume, setVolume] = useState(0);
  const animationFrameRef = useRef<number>();

  useEffect(() => {
    let stream: MediaStream | null = null;

    const initialize = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });

        const context = new AudioContext();
        const analyser = context.createAnalyser();
        analyser.fftSize = 256;

        const source = context.createMediaStreamSource(stream);
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        function updateVolume() {
          analyser.getByteFrequencyData(dataArray);

          let sum = 0;

          for (const value of dataArray) sum += value;

          const average = sum / dataArray.length;

          const volume = average / 255;
          setVolume(volume);

          animationFrameRef.current = requestAnimationFrame(updateVolume);
        }

        updateVolume();
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

      if (!animationFrameRef.current) return;

      cancelAnimationFrame(animationFrameRef.current);
    };
  }, []);

  return (
    <div className={styles.root}>
      <div
        className={styles.volume}
        style={{
          width: `${volume * 100}%`,
        }}
      />
    </div>
  );
}
