import { Theme } from "@radix-ui/themes";
import {
  RouterProvider,
  createBrowserRouter,
  redirect,
} from "react-router-dom";
import Landing from "@/app/Landing";
import Presentations from "@/app/Presentations";
import Presentation from "@/app/Presentation";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Layout from "@/components/Layout";
import "@radix-ui/themes/styles.css";

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      {
        index: true,
        element: <Landing />,
      },
      {
        path: "presentations",
        element: <Presentations />,
      },
      {
        path: "presentations/:id",
        element: <Presentation />,
      },
      {
        path: "*",
        loader: () => redirect("/"),
      },
    ],
  },
]);

const client = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={client}>
      <Theme>
        <RouterProvider router={router} />
      </Theme>
    </QueryClientProvider>
  );
}

export default App;
