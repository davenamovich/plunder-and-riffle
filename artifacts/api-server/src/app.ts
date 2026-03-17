import express, { type Express } from "express";
import cors from "cors";
import router from "./routes/index.js";
import { startWorker } from "./lib/worker.js";

const app: Express = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

startWorker();

export default app;
