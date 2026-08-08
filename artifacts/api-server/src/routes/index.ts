import { Router, type IRouter } from "express";
import healthRouter from "./health";
import tracksRouter from "./tracks";
import racesRouter from "./races";
import nominationsRouter from "./nominations";
import performanceRouter from "./performance";
import settingsRouter from "./settings";
import syncRouter from "./sync";

const router: IRouter = Router();

router.use(healthRouter);
router.use(tracksRouter);
router.use(racesRouter);
router.use(nominationsRouter);
router.use(performanceRouter);
router.use(settingsRouter);
router.use(syncRouter);

export default router;
