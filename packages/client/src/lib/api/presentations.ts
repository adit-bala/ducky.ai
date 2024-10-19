import { API_BASE } from "./base";

export type PresentationIdentifier = string & {
  readonly __brand: unique symbol;
};

export interface IPresentation {
  _id: PresentationIdentifier;
  slides?: string[];
  createdAt: string;
  name: string;
}

export const createPresentation = async (name: string, pdf: File) => {
  const formData = new FormData();
  formData.append("name", name);
  formData.append("pdf", pdf);

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

export const endPresentation = async (id: PresentationIdentifier) => {
  const response = await fetch(`${API_BASE}/presentations/${id}/end`, {
    method: "POST",
    credentials: "include",
  });

  return response.ok;
};

export const clipPresentation = async (
  id: PresentationIdentifier,
  index: number,
  timestamp: number,
  video: Blob,
  audio: Blob
) => {
  const formData = new FormData();
  formData.append("slideIndex", index.toString());
  formData.append("clipIndex", index.toString());
  formData.append("clipTimestamp", timestamp.toString());
  formData.append("videoFile", video);
  formData.append("audioFile", audio);

  const response = await fetch(`${API_BASE}/presentations/${id}/clip`, {
    method: "POST",
    body: formData,
    credentials: "include",
  });

  return (await response.json()) as IPresentation;
};

export const updatePresentation = async (
  id: PresentationIdentifier,
  name: string
) => {
  const response = await fetch(`${API_BASE}/presentations/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
  });

  return (await response.json()) as IPresentation;
};
