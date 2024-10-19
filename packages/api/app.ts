import { Application, Context, Middleware, Router } from "./deps.ts";
import { sleep } from "./deps.ts";
import { MongoClient } from "./deps.ts";
import { createGoogleOAuthConfig, createHelpers } from "./deps.ts";
import { load } from "./deps.ts";
import { createRequestEvent, respondWithOak } from "./utils.ts";
import { Presentation } from "./models/schema.ts";
import { oakCors } from "cors";

// Load environment variables
const env = await load();
for (const [key, value] of Object.entries(env)) {
  Deno.env.set(key, value);
}

// Deno KV
const kv = await Deno.openKv();
// const rows = kv.list({prefix:[]});
// for await (const row of rows) {
//   kv.delete(row.key);
// }

// Connect to MongoDB
const client = new MongoClient();
await client.connect(Deno.env.get("MONGO_URI")!);
const db = client.database(Deno.env.get("MONGO_DB")!);

// Get the collections
const users = db.collection("users");

// Configure Google OAuth
const oauthConfig = createGoogleOAuthConfig({
  redirectUri: "http://localhost:8080/oauth/callback",
  scope: [
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
  ],
});

const { getSessionId, signIn, signOut, handleCallback } =
  createHelpers(oauthConfig);

// Create the S3 Client
const s3 = new S3Client({
  region: Deno.env.get("AWS_REGION") || "us-east-1",
  credentials: {
    accessKeyId: Deno.env.get("AWS_ACCESS_KEY_ID")!,
    secretAccessKey: Deno.env.get("AWS_SECRET_ACCESS_KEY")!,
  },
});

// Create the router
const authRouter = new Router();

authRouter.get("/", async (ctx: Context) => {
  try {
    const requestEvent = await createRequestEvent(ctx);
    const sessionId = await getSessionId(requestEvent.request);
    const hasSessionIdCookie = sessionId !== undefined;

    const body = `
      <p>Authorization endpoint URI: ${oauthConfig.authorizationEndpointUri}</p>
      <p>Token URI: ${oauthConfig.tokenUri}</p>
      <p>Scope: ${oauthConfig.defaults?.scope}</p>
      <p>Signed in: ${hasSessionIdCookie}</p>
      <p>
        <a href="/sign-in">Sign in with Google</a>
      </p>
      <p>
        <a href="/sign-out">Sign out</a>
      </p>
    `;

    ctx.response.headers.set("content-type", "text/html; charset=utf-8");
    ctx.response.body = body;
  } catch (error) {
    console.error("Error in / route:", error);
    ctx.response.status = 500;
    ctx.response.body = "Internal Server Error";
  }
});

authRouter.get("/sign-in", async (ctx: Context) => {
  try {
    const requestEvent = await createRequestEvent(ctx);
    const response = await signIn(requestEvent.request);
    await respondWithOak(ctx, response); // Handle the Response
  } catch (error) {
    console.error("Error in /oauth/signin route:", error);
    ctx.response.status = 500;
    ctx.response.body = "Internal Server Error";
  }
});

authRouter.get("/oauth/callback", async (ctx: Context) => {
  try {
    const requestEvent = await createRequestEvent(ctx);
    const { response, sessionId, tokens } = await handleCallback(
      requestEvent.request
    );
    if (tokens.accessToken) {
      // Fetch user information using the access token
      const userInfoResponse = await fetch(
        `https://www.googleapis.com/oauth2/v3/userinfo?access_token=${tokens.accessToken}`
      );

      if (userInfoResponse.ok) {
        const userInfo = await userInfoResponse.json();
        console.log("User Info:", userInfo);

        // Extract relevant information
        const { sub: googleId, email, name } = userInfo;
        // Check if user already exists
        let user = await users.findOne({ googleId });
        if (!user) {
          // Create a new user
          const insertId = await users.insertOne({
            googleId,
            email,
            name,
            presentations: [],
          });
          user = await users.findOne({ _id: insertId })!;
          console.log("New user created:", user);
        }
        // Store sessionId to userId mapping in Deno KV
        const result = await kv.set([`${sessionId}`], googleId, {
          expireIn: Date.now() + 1000 * 60 * 60 * 24,
        });
        console.log("stored user in kv store", result);
      }
    }
    // Set the session ID cookie
    ctx.cookies.set("session_id", sessionId, {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      path: "/",
    });
    await respondWithOak(ctx, response);
  } catch (error) {
    console.error("Error in /callback route:", error);
    ctx.response.status = 500;
    ctx.response.body = "Internal Server Error";
  }
});

authRouter.get("/sign-out", async (ctx: Context) => {
  try {
    const requestEvent = await createRequestEvent(ctx);
    await signOut(requestEvent.request);
    ctx.response.redirect("/");
  } catch (error) {
    console.error("Error in /signout route:", error);
    ctx.response.status = 500;
    ctx.response.body = "Internal Server Error";
  }
});

export const authMiddleware: Middleware = async (ctx: Context, next) => {
  try {
    const requestEvent = await createRequestEvent(ctx);
    const sessionId = await getSessionId(requestEvent.request);

    if (sessionId) {
      const userId = await kv.get([sessionId]);
      if (userId) {
        ctx.state.user = { googleId: userId.value };
        await next(); // Proceed to the next middleware or route handler
        return;
      }
    }
  } catch (error) {
    console.error("Error in authMiddleware:", error);
    ctx.response.status = 500;
    ctx.response.body = "Internal Server Error";
  }
};

const router = new Router();
router.use(authMiddleware);

router.post("/presentations", async (ctx: Context) => {
  console.log(ctx.state);

  try {
    // Create a RequestEvent from the current Context
    const requestEvent = await createRequestEvent(ctx);

    // Check if the request has a body
    if (!requestEvent.request.body) {
      ctx.response.status = 400;
      ctx.response.body = { error: "Missing request body." };
      return;
    }

    const contentType = requestEvent.request.headers.get("Content-Type") || "";
    if (!contentType.includes("multipart/form-data")) {
      ctx.response.status = 400;
      ctx.response.body = {
        error: "Content-Type must be multipart/form-data.",
      };
      return;
    }

    // Parse the multipart form data
    const form = await requestEvent.request.formData();
    console.log("form", form);

    const pdfFile = form.get("pdf");
    const name = form.get("name");

    if (!(pdfFile instanceof File) || typeof name !== "string") {
      ctx.response.status = 400;
      ctx.response.body = { error: "Missing 'pdf' file or 'name' field." };
      return;
    }

    // Validate the uploaded file type
    if (pdfFile.type !== "application/pdf") {
      ctx.response.status = 400;
      ctx.response.body = { error: "Uploaded file must be a PDF." };
      return;
    }

    const arrayBuffer = await pdfFile.arrayBuffer();
    const pdfContent = new Uint8Array(arrayBuffer);

    // Retrieve user information from the database
    // TODO: Don't hardcode the user ID
    const googleId = ctx.state.user.googleId;
    const user = await users.findOne({ googleId });

    if (!user) {
      ctx.response.status = 404;
      ctx.response.body = { error: "User not found." };
      return;
    }

    // Generate a UUID for the presentation
    const uuid = crypto.randomUUID();
    console.log(Deno.env.get("S3_BUCKET_NAME"));
    const presentationPrefix = `Users/${googleId}/presentations/${uuid}/`;
    const pdfKey = `${presentationPrefix}pdf/original_${name}.pdf`;

    

    // Respond with success
    ctx.response.status = 201;
    ctx.response.body = "newPresentation";
  } catch (error) {
    console.error("Error in /createPresentation route:", error);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal Server Error" };
  }
});



router.get("/user", async (ctx: Context) => {
  try {
    const googleId = ctx.state.user.googleId;

    // Find the user
    const user = await users.findOne({ googleId });

    if (!user) {
      ctx.response.status = 404;
      ctx.response.body = { error: "User not found." };
      return;
    }

    ctx.response.status = 200;
    ctx.response.body = { name: user.name, email: user.email };
  } catch (error) {
    console.error("Error in GET /account:", error);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal Server Error" };
  }
});

router.get("/presentations", async (ctx: Context) => {
  try {
    const googleId = ctx.state.user.googleId;

    // Find the user
    const user = await users.findOne({ googleId });

    if (!user) {
      ctx.response.status = 404;
      ctx.response.body = { error: "User not found." };
      return;
    }

    ctx.response.status = 200;
    ctx.response.body = user.presentations || [];
  } catch (error) {
    console.error("Error in GET /presentations:", error);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal Server Error" };
  }
});

router.patch("/presentations/:uuid", async (ctx: Context) => {
  try {
    const { uuid } = ctx.params;
    if (!uuid) {
      ctx.response.status = 400;
      ctx.response.body = { error: "Presentation UUID is required." };
      return;
    }

    // Find the user
    const googleId = ctx.state.user.googleId;
    if (!googleId) {
      ctx.response.status = 404;
      ctx.response.body = { error: "User not found." };
      return;
    }

    const requestEvent = await createRequestEvent(ctx);

    // Check if the request has a body
    if (!requestEvent.request.body) {
      ctx.response.status = 400;
      ctx.response.body = { error: "Missing request body." };
      return;
    }

    const contentType = requestEvent.request.headers.get("Content-Type") || "";
    if (!contentType.includes("application/json")) {
      ctx.response.status = 400;
      ctx.response.body = {
        error: "Content-Type must be application/json.",
      };
      return;
    }

    const { name } = await requestEvent.request.json();

    if (typeof name !== "string") {
      ctx.response.status = 400;
      ctx.response.body = { error: "Missing 'name' field." };
      return;
    }

    // Update the presentation in the database
    const updateResult = await users.updateOne(
      { googleId, "presentations._id": uuid },
      { $set: { "presentations.$.name": name } }
    );

    if (!updateResult.modifiedCount) {
      ctx.response.status = 404;
      ctx.response.body = { error: "Presentation not found." };
      return;
    }

    ctx.response.status = 200;
    ctx.response.body = { message: "Presentation updated successfully." };
  } catch (error) {
    console.error("Error in PATCH /presentations/:uuid:", error);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal Server Error" };
  }
});

router.get("/presentations/:uuid", async (ctx: Context) => {
  try {
    const { uuid } = ctx.params;
    if (!uuid) {
      ctx.response.status = 400;
      ctx.response.body = { error: "Presentation UUID is required." };
      return;
    }

    // Find the user
    const user = await users.findOne({ googleId: ctx.state.user.googleId });

    if (!user) {
      ctx.response.status = 404;
      ctx.response.body = { error: "User not found." };
      return;
    }

    // Find the presentation
    const presentation = user.presentations.find(
      (p: Presentation) => p._id === uuid
    );

    if (!presentation) {
      ctx.response.status = 404;
      ctx.response.body = { error: "Presentation not found." };
      return;
    }

    // See if presentation is completed
    if (presentation.slidesStatus === "pending") {
      ctx.response.status = 202;
      ctx.response.body = { message: "Presentation is still being processed." };
      return;
    }

    if (presentation.slidesStatus === "failed") {
      ctx.response.status = 400;
      ctx.response.body = { error: "Presentation processing failed." };
      return;
    }

    if (!presentation.slides || presentation.slides.length === 0) {
      ctx.response.status = 400;
      ctx.response.body = { error: "Presentation has no slides." };
      return;
    }

    if (
      presentation.slidesStatus === "completed" &&
      presentation.slides &&
      presentation.slides.length > 0
    ) {
      // Return the presentation
      ctx.response.status = 200;
      ctx.response.body = presentation;
      return;
    }
  } catch (error) {
    console.error("Error in GET /presentations/:uuid:", error);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal Server Error" };
  }
});

authRouter.post("/presentations/:presentationUUID/clip", async (ctx: Context) => {
  try {
    const { presentationUUID } = ctx.params;
    if (!presentationUUID) {
      ctx.response.status = 400;
      ctx.response.body = { error: "Presentation UUID is required." };
      return;
    }

    // Find the user
    const userId = "117330744480793891038";
    if (!userId) {
      ctx.response.status = 404;
      ctx.response.body = { error: "User not found." };
      return;
    }

    const requestEvent = await createRequestEvent(ctx);

    // Check if the request has a body
    if (!requestEvent.request.body) {
      ctx.response.status = 400;
      ctx.response.body = { error: "Missing request body." };
      return;
    }

    const contentType = requestEvent.request.headers.get("Content-Type") || "";
    if (!contentType.includes("multipart/form-data")) {
      ctx.response.status = 400;
      ctx.response.body = {
        error: "Content-Type must be multipart/form-data.",
      };
      return;
    }

    // Parse the multipart form data
    const form = await requestEvent.request.formData();

    const slideIndex = form.get("slideIndex"); // string
    const clipIndex = form.get("clipIndex"); // string
    const clipTimestamp = form.get("clipTimestamp"); // string
    const videoFile = form.get("videoFile"); // .mp4
    const audioFile = form.get("audioFile"); // .webm
    const isEndString = form.get("isEnd"); // string

    console.log("slideIndex, clipIndex, clipTimestamp, videoFile, audioFile", slideIndex, clipIndex, clipTimestamp, videoFile, audioFile);

    if (
      typeof slideIndex !== "string" ||
      typeof clipIndex !== "string" ||
      typeof clipTimestamp !== "string" ||
      !(videoFile instanceof File) ||
      !(audioFile instanceof File) ||
      typeof isEndString !== "string"
    ) {
      ctx.response.status = 400;
      ctx.response.body = {
        error:
          "Missing 'slideIndex', 'clipIndex', 'clipTimestamp', 'videoFile', 'audioFile', or 'isEnd' field.",
      };
      return;
    }

    const isEnd = isEndString === "true"; // convert to boolean

    console.log(audioFile.type);

    // Respond with success
    ctx.response.status = 201;
    ctx.response.body = { message: "Video and audio uploaded successfully." };
  } catch (error) {
    console.error(
      "Error in POST /presentations/:presentationUUID/clip:",
      error
    );
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal Server Error" };
  }
});


// Initialize and start the application
const app = new Application();
app.use(
  oakCors({
    origin: /^.+localhost:(8080|5173)$/,
    credentials: true,
  })
);
app.use(authRouter.routes());
app.use(authRouter.allowedMethods());
app.use(router.routes());
app.use(router.allowedMethods());

const port = 8080;
console.log(`Listening on http://localhost:${port}/`);
await app.listen({ port });
