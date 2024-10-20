import type { UUID } from "mongo/mod.ts";
import { ObjectId } from "../deps.ts";

interface Feedback {
  emotion: string[];
  contentAccuracyScore: number;
  text: string;
}

interface Clip {
  slideUUID: string;
  video: string;
  feedback: Feedback;
}

interface Slide {
  slide: string;
  slide_image: string;
}

interface Preset {
  presentationDescription: string; // what the presentation is about
  audienceDescription: string; // who the audience is, how knowledgeable they are, maybe demographic information
  toneDescription: string; // what tone the presentation should have, emotion-wise, how formal it is
}

interface Presentation {
  _id: UUID;
  name: string;
  pdfKey: string;
  preset: Preset;
  summary: Feedback;
  clips: { [clipId: string]: Clip };
  slides: Slide[];
  createdAt: Date;
  slidesStatus: string;
  presentationStatus: string;
}

interface User {
  googleId: string;
  email: string;
  name: string;
  presentations: Presentation[];
}

export type { Clip, Feedback, Presentation, Slide, User };
