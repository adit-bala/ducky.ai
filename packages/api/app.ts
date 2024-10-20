import { Application, Context, Middleware, Router } from "./deps.ts";
import {
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "./deps.ts";
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
console.log(Deno.env.get("MONGO_URI"));
await client.connect(Deno.env.get("MONGO_URI")!);
const db = client.database(Deno.env.get("MONGO_DB")!);

// Get the collections
const users = db.collection("users");
console.log(Deno.env.get("GOOGLE_REDIRECT_URI"));
// Configure Google OAuth
const oauthConfig = createGoogleOAuthConfig({
  redirectUri: Deno.env.get("GOOGLE_REDIRECT_URI")!,
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
const authRouter = new Router({
  prefix: "/api",
});

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

const router = new Router({
  prefix: "/api",
});

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
    const presentationDescription = form.get("presentationDescription");
    const audienceDescription = form.get("audienceDescription");
    const toneDescription = form.get("toneDescription");

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

    // Upload PDF to S3 with error handling
    const putObjectCommand = new PutObjectCommand({
      Bucket: Deno.env.get("S3_BUCKET_NAME")!,
      Key: pdfKey,
      Body: pdfContent,
      ContentType: "application/pdf",
    });

    try {
      const pdfUploadResult = await s3.send(putObjectCommand);
      console.log("PDF uploaded to S3:", pdfUploadResult);
    } catch (uploadError) {
      console.error("Error uploading PDF to S3:", uploadError);
      ctx.response.status = 500;
      ctx.response.body = { error: "Failed to upload PDF to storage." };
      return;
    }

    // Create a new presentation object
    const newPresentation = {
      _id: uuid,
      name: name,
      createdAt: new Date(),
      pdfKey: pdfKey, // Store the S3 key for future reference
      preset: {
        presentationDescription: presentationDescription,
        audienceDescription: audienceDescription,
        toneDescription: toneDescription,
      },
      slidesStatus: "pending",
      presentationStatus: "pending",
    };

    // Update the user's presentations in the database with error handling
    const updateResult = await users.updateOne(
      { googleId },
      { $push: { presentations: newPresentation } }
    );

    if (!updateResult.modifiedCount) {
      console.warn("No documents were updated.");
    }

    pollS3Status(uuid, googleId, presentationPrefix).catch((err) =>
      console.error("Background polling failed:", err)
    );

    // Respond with success
    ctx.response.status = 201;
    ctx.response.body = newPresentation;
  } catch (error) {
    console.error("Error in /createPresentation route:", error);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal Server Error" };
  }
});

// Helper Function for Poll Status
const pollS3Status = async (
  presentationId: string,
  userId: string,
  presentationPrefix: string,
  maxAttempts = 30,
  interval = 5
) => {
  const bucketName = Deno.env.get("S3_BUCKET_NAME")!;
  const statusCompletedKey = `${presentationPrefix}status_completed`;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(
      `Polling attempt ${attempt} for presentation ${presentationId}`
    );
    console.log(
      `bucketName: ${bucketName}, statusCompletedKey: ${statusCompletedKey}`
    );
    const isCompleted = await fileExists(bucketName, statusCompletedKey);
    console.log("isCompleted", isCompleted);
    if (isCompleted) {
      console.log(`Presentation ${presentationId} processing completed.`);
      // Optionally, retrieve the list of images
      const images = await getImages(bucketName, userId, presentationId);
      // Update the database
      await users.updateOne(
        { "presentations._id": presentationId },
        {
          $set: {
            "presentations.$.slidesStatus": "completed",
            "presentations.$.slides": images,
          },
        }
      );
      return;
    }
    // Wait for the next polling interval
    await sleep(interval);
  }
  // If max attempts reached without completion
  console.warn(
    `Polling max attempts reached for presentation ${presentationId}. Marking as failed.`
  );
  await users.updateOne(
    { "presentations._id": presentationId },
    {
      $set: {
        "presentations.$.slidesStatus": "failed",
      },
    }
  );
};

// Helper function to check if a file exists in S3
const fileExists = async (bucket, key) => {
  console.log("checking if file exists");
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    console.log("file exists");
    return true;
  } catch (error) {
    if (error.name === "NotFound" || error.$metadata?.httpStatusCode === 404) {
      return false;
    }
    throw error; // Rethrow other unexpected errors
  }
};

// Helper function to retrieve image keys from S3
const getImages = async (
  bucket: string,
  userId: string,
  presentationId: string
): Promise<string[]> => {
  const prefix = `Users/${userId}/presentations/${presentationId}/slides/`;
  const params = {
    Bucket: bucket,
    Prefix: prefix,
  };

  const response = await s3.send(new ListObjectsV2Command(params));
  const imageKeys: string[] = [];

  if (response.Contents) {
    for (const obj of response.Contents) {
      if (obj.Key && obj.Key.endsWith(".png")) {
        imageKeys.push(Deno.env.get("S3_BUCKET_WEBSITE_ENDPOINT")! + obj.Key);
        console.log("imageKey", obj.Key);
      }
    }
  }

  return imageKeys;
};

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

router.post("/presentations/:presentationUUID/clip", async (ctx: Context) => {
  try {
    const { presentationUUID } = ctx.params;
    if (!presentationUUID) {
      ctx.response.status = 400;
      ctx.response.body = { error: "Presentation UUID is required." };
      return;
    }

    // Find the user
    const userId = ctx.state.user.googleId;
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
    const videoFile = form.get("videoFile"); // .webm
    const audioFile = form.get("audioFile"); // .webm
    const isEndString = form.get("isEnd"); // string

    console.log(
      "slideIndex, clipIndex, clipTimestamp, videoFile, audioFile",
      slideIndex,
      clipIndex,
      clipTimestamp,
      videoFile,
      audioFile
    );

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

    console.log("videoFile.type", videoFile.type);
    console.log("audioFile.type", audioFile.type);

    if (
      !videoFile.type.includes("video/webm") ||
      !audioFile.type.includes("audio/webm")
    ) {
      ctx.response.status = 400;
      ctx.response.body = {
        error: "Uploaded files must be of type video/webm and audio/webm.",
      };
      return;
    }

    const videoArrayBuffer = await videoFile.arrayBuffer();
    const videoContent = new Uint8Array(videoArrayBuffer);

    const audioArrayBuffer = await audioFile.arrayBuffer();
    const audioContent = new Uint8Array(audioArrayBuffer);

    console.log(
      "videoContent.length, audioContent.length",
      videoContent.length,
      audioContent.length
    );

    const clipPrefix = `Users/${userId}/presentations/${presentationUUID}/clips/${clipIndex}_${clipTimestamp}_${isEnd}/${slideIndex}/`;
    const videoKey = `${clipPrefix}video.webm`;
    const audioKey = `${clipPrefix}audio.webm`;

    // Upload video to S3 with error handling
    const videoPutObjectCommand = new PutObjectCommand({
      Bucket: Deno.env.get("S3_BUCKET_NAME")!,
      Key: videoKey,
      Body: videoContent,
      ContentType: "video/webm",
    });

    try {
      const videoUploadResult = await s3.send(videoPutObjectCommand);
      console.log("Video uploaded to S3:", videoUploadResult);
    } catch (uploadError) {
      console.error("Error uploading video to S3:", uploadError);
      ctx.response.status = 500;
      ctx.response.body = { error: "Failed to upload video to storage." };
      return;
    }

    // Upload audio to S3 with error handling
    const audioPutObjectCommand = new PutObjectCommand({
      Bucket: Deno.env.get("S3_BUCKET_NAME")!,
      Key: audioKey,
      Body: audioContent,
      ContentType: "audio/webm",
    });

    try {
      const audioUploadResult = await s3.send(audioPutObjectCommand);
      console.log("Audio uploaded to S3:", audioUploadResult);
    } catch (uploadError) {
      console.error("Error uploading audio to S3:", uploadError);
      ctx.response.status = 500;
      ctx.response.body = { error: "Failed to upload audio to storage." };
      return;
    }

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
    origin: /^.+localhost:(8080|5173|3001)$/,
    credentials: true,
  })
);
app.use(authRouter.routes());
app.use(authRouter.allowedMethods());
app.use(router.routes());
app.use(router.allowedMethods());

await app.listen({ port: 3001 });

console.log("Server running on http://localhost:3001");
