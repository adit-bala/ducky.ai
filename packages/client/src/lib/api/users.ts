import { API_BASE } from "./base";

export interface IUser {
  name: string;
  email: string;
}

export const getUser = async () => {
  const response = await fetch(`${API_BASE}/user`, {
    credentials: "include",
  });

  return (await response.json()) as IUser;
};
