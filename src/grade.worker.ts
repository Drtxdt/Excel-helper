import { grade } from "./grade";
self.onmessage = async (e) => {
  const { id, lesson, snapshot, revision } = e.data;
  self.postMessage({ id, result: await grade(lesson, snapshot, revision) });
};

self.postMessage({ ready: true });
