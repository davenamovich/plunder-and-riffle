import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import agentsRouter from "./agents.js";
import rotatorRouter from "./rotator.js";
import offersRouter from "./offers.js";
import leadsRouter from "./leads.js";
import dashboardRouter from "./dashboard.js";
import keywordsRouter from "./keywords.js";
import adminRouter from "./admin.js";
import cronRouter from "./cron.js";
import trackingRouter from "./tracking.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(agentsRouter);
router.use(rotatorRouter);
router.use(offersRouter);
router.use(leadsRouter);
router.use(dashboardRouter);
router.use(keywordsRouter);
router.use(adminRouter);
router.use(cronRouter);
router.use(trackingRouter);

export default router;
