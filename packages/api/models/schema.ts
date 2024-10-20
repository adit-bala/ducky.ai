import type { UUID } from "mongo/mod.ts";

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
interface Presentation {
  _id: UUID;
  name: string;
  pdfKey: string;
  clips: Clip[];
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
