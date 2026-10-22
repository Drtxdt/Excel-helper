import raw from "./content/lessons.json";
import chapterData from "./content/chapters.json";
import type { LessonDefinition, Chapter } from "./types";
import { lessonSchema } from "./course-schema";
export const lessons = lessonSchema.array().parse(raw) as LessonDefinition[];
export const chapters = chapterData as Chapter[];
