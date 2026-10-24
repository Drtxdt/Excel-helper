import GradeWorker from "../grade.worker?worker";
import { GradeRunner } from "./worker-runner";
const runner = new GradeRunner(() => new GradeWorker());
export const gradeInWorker = runner.run.bind(runner);
export const disposeGradeWorker = () => runner.dispose();
