import { API_BASE } from "./base";

export type PresentationIdentifier = string & {
  readonly __brand: unique symbol;
};

export interface IClip {
  slideUUID: string;
  video: string;
  feedback: {
    emotion: string[];
    emotionScore: number;
    text: string;
  };
}

export interface IPresentation {
  _id: PresentationIdentifier;
  slides?: string[];
  slidesStatus: "pending" | "complete";
  presentationStatus: "pending" | "processing" | "complete";
  createdAt: string;
  name: string;
  clips?: IClip[];
}

console.log(API_BASE);

export const createPresentation = async (
  file: File,
  name: string,
  description: string,
  audience: string,
  tone: string
) => {
  const formData = new FormData();
  formData.append("name", name);
  formData.append("pdf", file);
  formData.append("presentationDescription", description);
  formData.append("audienceDescription", audience);
  formData.append("toneDescription", tone);

  const response = await fetch(`${API_BASE}/presentations`, {
    method: "POST",
    body: formData,
    credentials: "include",
  });

  return (await response.json()) as IPresentation;
};

export const getPresentation = async (id: PresentationIdentifier) => {
  const response = await fetch(`${API_BASE}/presentations/${id}`, {
    credentials: "include",
  });

  return (await response.json()) as IPresentation;
};

export const getPresentations = async () => {
  const response = await fetch(`${API_BASE}/presentations`, {
    credentials: "include",
  });

  return (await response.json()) as IPresentation[];
};

export const clipPresentation = async (
  id: PresentationIdentifier,
  index: number,
  timestamp: number,
  video: Blob,
  audio: Blob,
  end = false
) => {
  const formData = new FormData();
  formData.append("slideIndex", index.toString());
  formData.append("clipIndex", index.toString());
  formData.append("clipTimestamp", timestamp.toString());
  formData.append("videoFile", video);
  formData.append("audioFile", audio);
  formData.append("isEnd", end.toString());

  const response = await fetch(`${API_BASE}/presentations/${id}/clip`, {
    method: "POST",
    body: formData,
    credentials: "include",
  });

  return (await response.json()) as IPresentation;
};

// export const updatePresentation = async (
//   id: PresentationIdentifier,
//   name: string
// ) => {
//   const response = await fetch(`${API_BASE}/presentations/${id}`, {
//     method: "PATCH",
//     body: JSON.stringify({ name }),
//     headers: {
//       "Content-Type": "application/json",
//     },
//     credentials: "include",
//   });

//   return (await response.json()) as IPresentation;
// };
