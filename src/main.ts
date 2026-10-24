import { createApp } from "vue";
import { createRouter, createWebHashHistory } from "vue-router";
import App from "./App.vue";
import Home from "./views/Home.vue";
import Library from "./views/Library.vue";
import Records from "./views/Records.vue";
import "./style.css";
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: "/", component: Home },
    { path: "/lesson/:id", component: () => import("./views/Workshop.vue") },
    { path: "/case/case-017", component: () => import("./views/CaseDesk.vue") },
    { path: "/handbook", component: Library },
    { path: "/records", component: Records },
  ],
});
createApp(App).use(router).mount("#app");
